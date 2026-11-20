#!/usr/bin/env python3
"""Il sito pubblicato (cartella per Netlify), ricavato dal file unico senza cambiarne il comportamento:

- il codice e lo stile diventano file a parte con l'impronta nel nome (si tengono in memoria per un anno, si cambiano
  solo quando cambia il contenuto); i blocchi dei moduli restano «da eseguire quando servono», come nel file unico;
- i dati pesanti (dizionario, caratteri, elenco AgID, lettore HEIC…) diventano file scaricati solo quando servono;
- il motore OCR e i modelli di lingua sono pubblicati accanto alle pagine: nessuna richiesta ad altri domini;
- la CSP non ammette script scritti nella pagina se non quelli elencati per impronta (niente 'unsafe-inline');
- una pagina per strumento, con titolo, descrizione, contenuto e domande frequenti già scritti nell'HTML
  (si leggono anche senza JavaScript) e i dati strutturati; sitemap e robots; pagina 404;
- app installabile e utilizzabile senza rete (manifest e service worker).

Uso (da build.py --netlify): make_site(ROOT, html_del_file_unico, cartella)"""
import base64, gzip, hashlib, json, os, re, shutil, subprocess, sys, pathlib

LIBS = {'heic', 'forge', 'utif', 'fontkit', 'lexicon'}       # librerie eseguite quando servono (need → <script src>)
DATA = {'tsl', 'stdfonts', 'mappaitalia'}                                   # dati letti quando servono (inlineText → fetch)
LANGS = ['ita', 'eng', 'fra', 'deu', 'spa']                  # modelli dell'OCR (come OCR_LANGS nell'app)


def sha256_b64(text: str) -> str:
    return base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode()


def make_site(ROOT: pathlib.Path, html: str, out: pathlib.Path, csp_parts, site_url: str = '', mappa: dict = None) -> dict:
    assets = out / 'assets'; assets.mkdir(parents=True, exist_ok=True)
    written = {}

    def asset(stem: str, data: bytes, ext: str) -> str:
        h = hashlib.sha256(data).hexdigest()[:10]
        name = f'{stem}.{h}.{ext}'
        (assets / name).write_bytes(data)
        written[name] = len(data)
        return '/assets/' + name

    # blocchi in pezzi nel file unico (build.py, a_pezzi): sul sito tornano un blocco solo, poi un file a parte
    pezzi = {}
    def take_part(m): pezzi.setdefault(m.group(1), []).append(m.group(2)); return ''
    html = re.sub(r'<script type="text/x-officina-part" data-of="([\w-]+)">(.*?)</script>\n?', take_part, html, flags=re.S)
    html = re.sub(r'(<script[^>]*?) data-parts="\d+" data-pname="([\w-]+)">(.*?)</script>', lambda m: f'{m.group(1)}>{m.group(3)}{"".join(pezzi.get(m.group(2), []))}</script>', html, flags=re.S)
    hashes = []          # impronte degli script scritti nella pagina o eseguiti dal codice (blocchi dei moduli)
    libs, data, pdfworker = {}, {}, None

    # 1. stile: un solo file
    css = []
    def take_style(m):
        css.append(m.group(1))
        return '\x00STYLE\x00' if len(css) == 1 else ''
    html = re.sub(r'<style[^>]*>(.*?)</style>', take_style, html, flags=re.S)

    # 2. script
    js_n = [0]
    def take_script(m):
        nonlocal pdfworker
        attrs, body = m.group(1), m.group(2)
        typ = (re.search(r'type="([^"]+)"', attrs) or [None, ''])[1]
        if typ == 'text/x-officina-gz':
            name = re.search(r'id="lazy-([\w-]+)"', attrs).group(1)
            code = gzip.decompress(base64.b64decode(body.strip()))
            # l'Italia d'insieme: nel file unico fino al livello 6 (apertura leggera), sul sito fino al 7 (file a parte, letto solo dalla mappa)
            z7 = ROOT / 'src' / 'vendor' / 'mappa' / 'italia-insieme-z7.pmtiles'
            if name == 'mappaitalia' and z7.exists(): code = z7.read_bytes()
            url = asset('lazy-' + name, code, 'js')
            if name == 'pdfworker': pdfworker = url
            elif name in LIBS: libs[name] = url
            elif name in DATA: data[name] = url
            else: data[name] = url; libs[name] = url
            return ''
        if typ == 'text/x-officina-later':
            raw = body.strip()
            code = gzip.decompress(base64.b64decode(raw)).decode('utf-8') if 'data-gz' in attrs else body
            lib = re.search(r'data-lib="([^"]+)"', attrs)
            n = re.search(r'data-n="(\d+)"', attrs)
            url = asset('later-' + (lib.group(1) if lib else n.group(1)), code.encode('utf-8'), 'js')
            hashes.append(sha256_b64(code if lib else '"use strict";\n' + code))
            a2 = re.sub(r'\s*data-gz="1"', '', attrs)
            return f'<script{a2} data-src="{url}"></script>'
        if typ and typ not in ('text/javascript', 'module'):
            return m.group(0)   # dati di altro tipo: restano dove sono
        if len(body) < 4000 and 'src=' not in attrs:
            hashes.append(sha256_b64(body))
            return m.group(0)
        js_n[0] += 1
        url = asset(f'app-{js_n[0]}', body.encode('utf-8'), 'js')
        return f'<script defer src="{url}"></script>'
    html = re.sub(r'<script([^>]*)>(.*?)</script>', take_script, html, flags=re.S)
    html = html.replace('\x00STYLE\x00', f'<link rel="stylesheet" href="{asset("style", "".join(css).encode("utf-8"), "css")}">', 1)

    # 3. configurazione del sito: prima di ogni altro script (scritta nella pagina, con la sua impronta)
    cfg = ("window.OFFICINA_ENV='site';window.OFFICINA_BASE=location.origin+'/';window.OFFICINA_PWA=1;"
           f"window.OFFICINA_PDFWORKER={json.dumps(pdfworker)};window.OFFICINA_LIBS={json.dumps(libs)};window.OFFICINA_DATA={json.dumps(data)};"
           + (f"window.OFFICINA_SITE={json.dumps(site_url.rstrip('/') + '/')};" if site_url else '')
           + (f"window.OFFICINA_MAPPA={json.dumps(mappa)};" if mappa else ''))
    hashes.append(sha256_b64(cfg))
    head_extra = (f'<script>{cfg}</script>\n<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#5B2EFF">'
                  '<link rel="apple-touch-icon" href="/icons/icon-192.png"><link rel="icon" href="/icons/icon-192.png" type="image/png">\n')
    html = re.sub(r'(<meta charset="utf-8"\s*/?>)', lambda m: m.group(1) + '\n' + head_extra, html, count=1)
    html = html.replace('<link rel="icon" href="data:,">', '')
    # senza JavaScript (motori di ricerca, browser con gli script spenti): niente animazione d'apertura, il contenuto si vede
    html = html.replace('</head>', '<noscript><style>#intro{display:none!important}.app{opacity:1!important;visibility:visible!important}</style></noscript>\n</head>', 1)

    # 4. motore OCR e modelli di lingua, accanto alle pagine
    nm = ROOT / 'tools' / 'node' / 'node_modules'
    tess = out / 'tess'; (tess / 'lang').mkdir(parents=True, exist_ok=True)
    shutil.copyfile(nm / 'tesseract.js' / 'dist' / 'worker.min.js', tess / 'worker.min.js')
    for f in (nm / 'tesseract.js-core').glob('tesseract-core*.wasm.js'): shutil.copyfile(f, tess / f.name)
    for l in LANGS:
        src = nm / '@tesseract.js-data' / l / '4.0.0_best_int' / f'{l}.traineddata.gz'
        if src.exists(): shutil.copyfile(src, tess / 'lang' / f'{l}.traineddata.gz')

    # 5. CSP con le impronte (nessuno script scritto nella pagina senza impronta, nessun dominio esterno)
    csp = csp_parts(hashes)
    return {'html': html, 'csp': csp, 'assets': written, 'hashes': len(hashes)}


def pages(out: pathlib.Path, base_html: str, site_url: str = '') -> dict:
    """Una pagina per strumento, con il contenuto già scritto (lo si ricava aprendo ogni pagina in un browser senza
    finestra: è la stessa interfaccia che vede chi visita). Serve Playwright; senza, le pagine restano uguali alla home."""
    (out / 'index.html').write_text(base_html, encoding='utf-8')
    script = pathlib.Path(__file__).with_name('prerender.js')
    try:
        r = subprocess.run(['node', str(script), str(out), site_url], capture_output=True, text=True, timeout=900)
    except Exception as e:
        print('  pagine per strumento: prerender non eseguito (' + str(e)[:80] + ')'); return {'pages': 0}
    if r.returncode != 0:
        print('  pagine per strumento: prerender non riuscito\n' + (r.stderr or r.stdout)[-1500:]); sys.exit(1)
    return json.loads(r.stdout.strip().splitlines()[-1])


# ---------------------------------------------------------------------------------------------------------------
# Pagine informative (Informazioni, Privacy, Condizioni d'uso): HTML statico, leggibile senza JavaScript, con lo
# stesso stile del sito (chiaro/scuro). I testi descrivono ciò che il prodotto fa davvero: nessun cookie, nessuna
# statistica, nessuna pubblicità (non configurate); i documenti non lasciano mai il dispositivo.
# Configurazione facoltativa in site.json: {"url": "...", "contatto": "email", "titolare": "nome o ragione sociale"}
SOFTWARE = [
    ('PDF.js', 'Mozilla', 'lettura e disegno delle pagine PDF', 'Apache-2.0', 'https://github.com/mozilla/pdf.js'),
    ('pdf-lib', 'Andrew Dillon', 'scrittura e modifica dei PDF', 'MIT', 'https://github.com/Hopding/pdf-lib'),
    ('Tesseract.js e Tesseract', 'Jerome Wu, Google e altri', 'riconoscimento del testo (OCR) e modelli delle lingue', 'Apache-2.0', 'https://github.com/naptha/tesseract.js'),
    ('JSZip', 'Stuart Knightley e altri', 'archivi ZIP e documenti Word/Excel', 'MIT', 'https://github.com/Stuk/jszip'),
    ('pako', 'Vitaly Puzrin, Andrei Tuputcyn', 'compressione dei dati', 'MIT e Zlib', 'https://github.com/nodeca/pako'),
    ('fontkit', 'Devon Govett', 'caratteri incorporati nei PDF', 'MIT', 'https://github.com/foliojs/fontkit'),
    ('heic2any, libheif e libde265', 'Alex Corvi, struktur AG', 'foto HEIC dell’iPhone', 'MIT · LGPL-3.0', 'https://github.com/strukturag/libheif'),
    ('UTIF.js', 'Photopea', 'immagini TIFF', 'MIT', 'https://github.com/photopea/UTIF.js'),
    ('node-forge', 'Digital Bazaar', 'lettura dei certificati delle firme digitali', 'BSD-3-Clause', 'https://github.com/digitalbazaar/forge'),
    ('MapLibre GL JS', 'MapLibre e altri', 'mappa stradale di «Analisi delle vendite»', 'BSD-3-Clause', 'https://github.com/maplibre/maplibre-gl-js'),
    ('PMTiles e Protomaps Basemaps', 'Protomaps', 'tessere della mappa e stile di partenza', 'BSD-3-Clause', 'https://github.com/protomaps'),
]
DATA_SRC = [
    ('Liberation Sans, Serif e Mono', 'caratteri con le misure dei 14 caratteri standard dei PDF (PDF/A)', 'SIL Open Font License 1.1'),
    ('Instrument Sans, Unbounded, IBM Plex Mono', 'caratteri dell’interfaccia', 'SIL Open Font License 1.1'),
    ('wordfreq (Robyn Speer)', 'frequenze delle parole italiane per il correttore dell’OCR', 'CC BY-SA 4.0'),
    ('Dizionario Hunspell it_IT (A. Pescetti e altri)', 'forme delle parole italiane per il correttore dell’OCR', 'GPL-3.0'),
    ('Elenco dei certificatori qualificati (AgID, Trusted List italiana)', 'riconoscimento dei certificati delle firme digitali', 'dati pubblici'),
    ('© OpenStreetMap contributors', 'mappa stradale e numeri civici di «Analisi delle vendite»', 'ODbL 1.0'),
    ('Comuni italiani (Garda Informatica) e confini ISTAT', 'posizione dei Comuni e confini delle province', 'MIT · CC BY 4.0'),
    ('Noto Sans', 'scritte della mappa', 'SIL Open Font License 1.1'),
]


def info_pages(out: pathlib.Path, base_html: str, cfg: dict, cloud: bool, version: str) -> list:
    import html as H, datetime
    e = H.escape
    css = re.search(r'<link rel="stylesheet" href="([^"]+)">', base_html).group(1)
    head_common = re.search(r'(<link rel="manifest"[^\n]*)', base_html).group(1)
    site = (cfg.get('url') or '').rstrip('/')
    mail = (cfg.get('contatto') or '').strip()
    owner = (cfg.get('titolare') or '').strip()
    today = datetime.date.today()
    style = """<style>
.ip{max-width:760px;margin:0 auto;padding:28px 20px 64px;font:16px/1.65 var(--font);color:var(--ink)}
.ip-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}
.ip-brand{display:inline-flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font:600 20px/1 var(--font-display)}
.ip-brand img{width:32px;height:32px;border-radius:8px}.ip-brand b{color:var(--accent)}
.ip-back{color:var(--accent);font-weight:600;text-decoration:none}.ip-back:hover,.ip a:hover{text-decoration:underline}
.ip h1{font:600 clamp(28px,5vw,38px)/1.15 var(--font-display);margin:0 0 8px}
.ip .lead{color:var(--muted);font-size:18px;margin:0 0 28px}
.ip h2{font:600 22px/1.3 var(--font-display);margin:36px 0 10px}
.ip h3{font-size:17px;margin:20px 0 6px}
.ip p,.ip li{margin:0 0 10px}.ip ul{padding-left:22px}
.ip a{color:var(--accent)}
.ip .box{border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:16px 0;background:color-mix(in srgb,var(--accent) 6%,transparent)}
.ip table{width:100%;border-collapse:collapse;font-size:15px;margin:10px 0}
.ip th,.ip td{text-align:left;vertical-align:top;padding:9px 8px;border-bottom:1px solid var(--line)}
.ip th{font-weight:600;color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.04em}
.ip-foot{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px 18px;font-size:15px;color:var(--muted)}
.ip-foot a{color:var(--ink)}
@media (max-width:560px){.ip table,.ip thead,.ip tbody,.ip tr,.ip td{display:block}.ip thead{display:none}.ip tr{border-bottom:1px solid var(--line);padding:8px 0}.ip td{border:0;padding:2px 0}}
</style>"""
    foot = ('<nav class="ip-foot" aria-label="Informazioni"><a href="/">Tutti gli strumenti</a><a href="/informazioni/">Informazioni</a>'
            '<a href="/privacy/">Privacy</a><a href="/termini/">Condizioni d’uso</a><a href="/informazioni/#contatti">Contatti e segnalazioni</a></nav>')

    def page(slug, title, desc, body):
        url = (site + '/' + slug + '/') if site else '/' + slug + '/'
        doc = (f'<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n{head_common}\n'
               f'<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>{e(title)} · file360</title>\n'
               f'<meta name="description" content="{e(desc)}">\n<link rel="canonical" href="{e(url)}">\n'
               f'<meta property="og:title" content="{e(title)} · file360"><meta property="og:description" content="{e(desc)}"><meta property="og:locale" content="it_IT">\n'
               f'<link rel="stylesheet" href="{css}">\n{style}\n</head>\n<body>\n'
               f'<div class="ip"><header class="ip-top"><a class="ip-brand" href="/"><img src="/icons/icon-192.png" alt=""><span>file<b>360</b></span></a>'
               f'<a class="ip-back" href="/">Apri gli strumenti →</a></header>\n<main id="main">\n{body}\n</main>\n{foot}</div>\n</body>\n</html>\n')
        d = out / slug; d.mkdir(parents=True, exist_ok=True); (d / 'index.html').write_text(doc, encoding='utf-8')
        return slug + '/'

    report = ('<p>Per aiutarci a capire il problema indica: lo strumento usato, che cosa ti aspettavi e che cosa è successo, il browser e il dispositivo. '
              '<strong>Non allegare documenti con dati personali</strong>: se serve un esempio, usa un file di prova o oscuralo prima con «Oscura PDF».</p>')
    contact = (f'<p>Scrivi a <a href="mailto:{e(mail)}?subject=file360%20-%20segnalazione">{e(mail)}</a>.</p>' if mail else
               '<p>Le segnalazioni si raccolgono all’indirizzo indicato dal gestore del sito.</p>')
    sw_rows = ''.join(f'<tr><td><a href="{u}" rel="noopener">{e(n)}</a><br><small>{e(a)}</small></td><td>{e(w)}</td><td>{e(l)}</td></tr>' for n, a, w, l, u in SOFTWARE)
    data_rows = ''.join(f'<tr><td>{e(n)}</td><td>{e(w)}</td><td>{e(l)}</td></tr>' for n, w, l in DATA_SRC)
    pages_out = []
    pages_out.append(page('informazioni', 'Informazioni', 'Come funziona file360, il software libero su cui si basa, contatti e segnalazioni.', f"""
<h1>Informazioni</h1>
<p class="lead">file360 è una raccolta di strumenti per PDF, scansioni e documenti di lavoro che funziona interamente nel browser.</p>
<h2>Come funziona</h2>
<p>Quando apri il sito, il browser scarica il codice degli strumenti; i documenti che scegli vengono letti ed elaborati <strong>sul tuo dispositivo</strong>. Non c’è un server che riceve i file: non vengono caricati, salvati o letti da nessuno.</p>
<ul>
<li>Il riconoscimento del testo (OCR) usa un motore e dei modelli di lingua scaricati da questo sito al primo uso e poi tenuti nel browser.</li>
<li>La mappa stradale di «Analisi delle vendite» scarica da questo sito l’elenco dei numeri civici delle province dove hai clienti e i pezzi di mappa delle zone che guardi, come fa ogni mappa. Gli indirizzi e i nomi dei clienti si cercano sul tuo dispositivo e non vengono mai inviati.</li>
<li>Dopo la prima visita il sito funziona anche senza connessione, e puoi installarlo come app dal menu del browser.</li>
<li>Non usiamo servizi di intelligenza artificiale esterni: ogni elaborazione è codice che gira nella pagina.</li>
<li>I risultati importanti si possono verificare: per esempio «Verifica PDF/A» controlla un file secondo le regole della norma, e i dati ricavati dai documenti mostrano sempre i controlli fatti (saldi, totali, codici).</li>
</ul>
<h2 id="contatti">Contatti e segnalazioni</h2>
{contact}
{report}
<h2>Software libero</h2>
<p>file360 si basa su questi progetti, che ringraziamo. Le licenze complete sono nei rispettivi siti.</p>
<table><thead><tr><th>Progetto</th><th>A cosa serve</th><th>Licenza</th></tr></thead><tbody>{sw_rows}</tbody></table>
<h2>Caratteri e dati</h2>
<table><thead><tr><th>Fonte</th><th>A cosa serve</th><th>Licenza</th></tr></thead><tbody>{data_rows}</tbody></table>
<p><small>Versione {e(version)} · aggiornata il {today.strftime('%d/%m/%Y')}</small></p>
"""))
    cloud_par = ('<h2>Google Drive, Dropbox e OneDrive</h2><p>Se scegli di aprire o salvare un file nel tuo spazio cloud, il browser si collega direttamente al servizio che hai scelto, con il tuo account: il file passa tra il tuo dispositivo e quel servizio, non da noi. L’accesso vale solo per la sessione e puoi revocarlo dalle impostazioni del tuo account.</p>'
                 if cloud else '')
    owner_par = f'<p>Titolare del trattamento: {e(owner)}' + (f', <a href="mailto:{e(mail)}">{e(mail)}</a>' if mail else '') + '.</p>' if owner else ''
    pages_out.append(page('privacy', 'Privacy', 'I documenti non lasciano mai il tuo dispositivo: nessun cookie, nessuna statistica, nessuna pubblicità. Cosa resta nel browser e come cancellarlo.', f"""
<h1>Privacy</h1>
<p class="lead">In breve: i tuoi documenti non lasciano mai il dispositivo. Niente cookie, niente statistiche, niente pubblicità.</p>
<div class="box"><strong>I documenti</strong><br>PDF, foto e altri file che apri vengono elaborati nel browser. Non vengono inviati a server, né nostri né di altri, e nessuno può leggerli. Il sito impedisce tecnicamente l’invio di dati verso altri indirizzi (Content Security Policy).</div>
<h2>Cosa resta nel tuo browser</h2>
<p>Alcune informazioni restano salvate nel browser che usi, sul tuo dispositivo, per comodità. Non ci vengono mai inviate:</p>
<ul>
<li>le preferenze (tema, ultime impostazioni degli strumenti);</li>
<li>i <strong>Progetti</strong>, se li usi: i file aperti, le loro versioni e i risultati, per riprendere il lavoro;</li>
<li>il registro delle attività (nomi dei file, operazioni ed esito);</li>
<li>i dati che scegli di ricordare per compilare i moduli, le tue firme e i tuoi timbri;</li>
<li>il codice del sito e i modelli dell’OCR, per funzionare anche senza rete.</li>
</ul>
<p>Puoi vedere e cancellare tutto dal <strong>Centro privacy</strong> (in alto, «I file restano sul tuo computer»): da lì puoi anche far cancellare i dati in automatico dopo un certo numero di giorni o alla chiusura della scheda, o proteggere i dati personali con una frase segreta. In alternativa, cancella i dati del sito dalle impostazioni del browser.</p>
<h2>Cookie e statistiche</h2>
<p>Il sito non usa cookie, né strumenti di statistica, profilazione o pubblicità, e non incorpora contenuti di altri siti.</p>
{cloud_par}
<h2>Il servizio che ospita il sito</h2>
<p>Il sito è pubblicato su Netlify. Come per ogni sito, il servizio di hosting riceve i dati tecnici necessari a inviare le pagine (indirizzo IP, browser, pagina richiesta, data e ora) e può conservarli per breve tempo per sicurezza, secondo la propria informativa. Non riceve mai i tuoi documenti.</p>
<h2>I tuoi diritti</h2>
<p>Poiché non raccogliamo dati personali, non abbiamo dati da consultare, correggere o cancellare. Per qualsiasi domanda puoi usare i <a href="/informazioni/#contatti">contatti</a>.</p>
{owner_par}
<p><small>Ultimo aggiornamento: {today.strftime('%d/%m/%Y')}</small></p>
"""))
    pages_out.append(page('termini', 'Condizioni d’uso', 'Condizioni d’uso di file360: servizio gratuito, risultati da verificare, nessun documento trattato da noi.', f"""
<h1>Condizioni d’uso</h1>
<p class="lead">file360 è gratuito e si usa senza registrazione. Usandolo accetti queste condizioni.</p>
<h2>Il servizio</h2>
<p>Gli strumenti funzionano nel tuo browser: sei tu a scegliere i documenti, a elaborarli e a conservare i risultati. Non trattiamo i tuoi documenti e non ne conserviamo copia.</p>
<h2>Controlla i risultati</h2>
<p>Gli strumenti sono costruiti e provati con cura, ma nessun programma è infallibile. In particolare:</p>
<ul>
<li>il testo riconosciuto dalle scansioni (OCR) e i dati ricavati dai documenti possono contenere errori: controllali, soprattutto importi, date e codici;</li>
<li>prima di pubblicare o inviare un documento oscurato, rileggilo e verifica che i dati da nascondere siano tutti coperti;</li>
<li>la verifica delle firme digitali e dei PDF/A segue le regole tecniche indicate nell’esito, ma non sostituisce le verifiche previste per legge quando sono obbligatorie;</li>
<li>i valori evidenziati negli esami di laboratorio confrontano il risultato con l’intervallo scritto nel referto: non sono un parere medico;</li>
<li>la dicitura di copia conforme e gli altri testi proposti sono modelli: la responsabilità di ciò che firmi resta tua.</li>
</ul>
<h2>Garanzie e responsabilità</h2>
<p>Il servizio è offerto gratuitamente, così com’è, senza garanzia di disponibilità continua o di idoneità a uno scopo particolare. Nei limiti consentiti dalla legge, non rispondiamo di danni derivanti dall’uso dei risultati senza le verifiche indicate sopra. Conserva sempre una copia dei documenti originali.</p>
<h2>Uso corretto</h2>
<p>Usa gli strumenti solo su documenti che hai il diritto di elaborare. Il software di terzi incluso nel sito è distribuito con le licenze elencate nella pagina <a href="/informazioni/">Informazioni</a>.</p>
<h2>Modifiche</h2>
<p>Queste condizioni possono essere aggiornate; la data dell’ultima versione è indicata qui sotto.</p>
<p><small>Ultimo aggiornamento: {today.strftime('%d/%m/%Y')}</small></p>
"""))
    return pages_out
