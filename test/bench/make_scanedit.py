#!/usr/bin/env python3
"""Banco di prova per la modifica delle scansioni: per ogni caso una «scansione» (risoluzione, inclinazione, inchiostro,
   rumore) e la sua verità: la stessa pagina scritta già con le parole cambiate e scansionata nello stesso identico modo.
   Scrive scanedit/<caso>.pdf, scanedit/<caso>-vero.pdf e scanedit/casi.json (testo inventato, nessun dato reale)."""
import json, os, random, subprocess, tempfile
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from PIL import Image, ImageFilter
from reportlab.pdfbase.ttfonts import TTFont
try: pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf'))
except Exception: pass
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scanedit'); os.makedirs(D, exist_ok=True)
W, H = 595.28, 841.89
LINES = [
    'Il presente contratto di locazione decorre dal 1 gennaio 2023',
    'e ha durata di quattro anni, rinnovabile per uguale periodo.',
    'Il canone annuo viene fissato in euro 9.600, pagabile in rate',
    'mensili anticipate entro il giorno cinque di ogni mese.',
    'La sede legale della società è stabilita a Roma, in via Verdi 12.',
    'Perché la disdetta sia valida occorre un preavviso di sei mesi.',
    'Le spese di registrazione sono ripartite in parti uguali.',
    'Letto, confermato e sottoscritto dalle parti in data odierna.',
]
EDITS = [  # riga, parola, nuova parola, che cosa prova
    (0, '2023', '2024', 'una cifra'),
    (1, 'quattro', 'quattordici', 'parola più lunga, lettere presenti'),
    (4, 'Roma', 'Zagarolo', 'lettere rare (Z maiuscola)'),
    (5, 'Perché', 'Poiché', 'accenti'),
]
CASES = [
    {'id': 'helv300', 'font': 'Helvetica', 'size': 10.5, 'dpi': 300, 'rot': 0.0, 'ink': 0.08, 'noise': 1500},
    {'id': 'times150', 'font': 'Times-Roman', 'size': 11, 'dpi': 150, 'rot': 0.4, 'ink': 0.1, 'noise': 4000},
    {'id': 'bold200', 'font': 'Helvetica-Bold', 'size': 11, 'dpi': 200, 'rot': 0.15, 'ink': 0.38, 'noise': 2500},
    {'id': 'times300skew', 'font': 'Times-Roman', 'size': 10, 'dpi': 300, 'rot': 1.2, 'ink': 0.08, 'noise': 1500},
    # come helv300, con una seconda pagina: la Z maiuscola c'è solo lì (lettere prese dalle altre pagine del documento)
    {'id': 'helv300-2p', 'font': 'Helvetica', 'size': 10.5, 'dpi': 300, 'rot': 0.0, 'ink': 0.08, 'noise': 1500,
     'page2': ['Allegato B: Zona industriale di Zevio, lotto Zeta.', 'Il deposito Zanella resta escluso dalla locazione.']},
    # un carattere che l'app non ha (Carlito, il clone di Calibri dei documenti d'ufficio): la Z solo nella seconda pagina
    {'id': 'carlito300-2p', 'font': 'Carlito', 'size': 11.5, 'dpi': 300, 'rot': 0.2, 'ink': 0.1, 'noise': 1500,
     'page2': ['Allegato B: Zona industriale di Zevio, lotto Zeta.', 'Il deposito Zanella resta escluso dalla locazione.']},
]
def page(path, case, lines):
    c = canvas.Canvas(path, pagesize=(W, H))
    for k, ls in enumerate([lines] + ([case['page2']] if case.get('page2') else [])):
        if k: c.showPage()
        c.setFillGray(case['ink']); c.setFont(case['font'], case['size'])
        for i, t in enumerate(ls): c.drawString(70, H - 120 - i * case['size'] * 1.6, t)
    c.save()
def scan(src, out, case):
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['pdftoppm', '-r', str(case['dpi']), '-gray', '-png', src, os.path.join(td, 'p')], check=True)
        ims = [Image.open(os.path.join(td, f)).convert('L') for f in sorted(os.listdir(td))]
    rnd = random.Random(case['id']); res = []
    for im in ims:
        im = im.filter(ImageFilter.GaussianBlur(0.35 * case['dpi'] / 150))
        px = im.load()
        for _ in range(case['noise']): px[rnd.randrange(im.width), rnd.randrange(im.height)] = rnd.randrange(170, 235)
        res.append(im.point(lambda v: min(255, int(v * 0.94 + 12))).rotate(case['rot'], resample=Image.BICUBIC, fillcolor=246))
    res[0].save(out, 'PDF', resolution=case['dpi'], save_all=True, append_images=res[1:])
out = []
for case in CASES:
    orig, true = list(LINES), list(LINES)
    edits = []
    for li, old, new, why in EDITS:
        true[li] = true[li].replace(old, new, 1)
        pre = LINES[li][:LINES[li].index(old)]
        x0 = 70 + pdfmetrics.stringWidth(pre, case['font'], case['size']); x1 = x0 + pdfmetrics.stringWidth(old, case['font'], case['size'])
        nx1 = x0 + pdfmetrics.stringWidth(new, case['font'], case['size'])
        edits.append({'line': li, 'old': old, 'new': new, 'why': why, 'x0': x0, 'x1': max(x1, nx1), 'xFirst': x0 + pdfmetrics.stringWidth(new[0], case['font'], case['size']), 'xEnd': 70 + max(pdfmetrics.stringWidth(LINES[li], case['font'], case['size']), pdfmetrics.stringWidth(true[li], case['font'], case['size'])),
                      'base': 120 + li * case['size'] * 1.6})
    for name, lines in (('', orig), ('-vero', true)):
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f: pass
        page(f.name, case, lines); scan(f.name, os.path.join(D, case['id'] + name + '.pdf'), case); os.unlink(f.name)
    out.append({**case, 'lines': LINES, 'edits': edits})
json.dump(out, open(os.path.join(D, 'casi.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', [c['id'] for c in out])
