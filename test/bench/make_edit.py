#!/usr/bin/env python3
"""Banco di prova per «Modifica»: un PDF con righe in caratteri, corpi, colori e proporzioni diversi (font incorporati a
   sottoinsieme, come nei PDF veri), e per ogni riga la parola da cambiare con la sua posizione. Scrive edit/prova.pdf e edit/prova.json"""
import json, os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'edit'); os.makedirs(D, exist_ok=True)
T = '/usr/share/fonts/truetype/'
FONTS = {'Serif': T + 'liberation/LiberationSerif-Regular.ttf', 'Serif-Bold': T + 'liberation/LiberationSerif-Bold.ttf', 'Serif-Italic': T + 'liberation/LiberationSerif-Italic.ttf',
         'Sans': T + 'liberation/LiberationSans-Regular.ttf', 'Sans-Bold': T + 'liberation/LiberationSans-Bold.ttf', 'DejaVu': T + 'dejavu/DejaVuSerif.ttf', 'Mono': T + 'liberation/LiberationMono-Regular.ttf'}
import glob
for extra, pat in (('Carlito', '/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf'), ('Caladea', '/usr/share/fonts/truetype/crosextra/Caladea-Regular.ttf')):
    g = glob.glob(pat) or glob.glob('/usr/share/fonts/**/' + os.path.basename(pat), recursive=True)
    if g: FONTS[extra] = g[0]
for k, v in FONTS.items(): pdfmetrics.registerFont(TTFont(k, v))
c = canvas.Canvas(os.path.join(D, 'prova.pdf'), pagesize=(595.28, 841.89)); H = 841.89
cases = []
def line(y, font, size, color, words, target, repl, kind, cs=0, hz=100, x=64):
    """scrive la riga parola per parola (un solo oggetto di testo, come fanno i programmi veri) e annota dov'è la parola da cambiare"""
    c.setFillColor(Color(*color)); t = c.beginText(x, y); t.setFont(font, size); t.setCharSpace(cs); t.setHorizScale(hz); txt = ' '.join(words); t.textOut(txt); c.drawText(t)
    pre = ' '.join(words[:words.index(target)]); pre = pre + ' ' if pre else ''
    w = lambda s: (pdfmetrics.stringWidth(s, font, size) + cs * len(s)) * hz / 100
    x0 = x + w(pre); x1 = x0 + w(target)
    cases.append({'kind': kind, 'font': font, 'size': size, 'color': color, 'y': y, 'x0': x0, 'x1': x1, 'xEnd': x + w(txt), 'x': x, 'target': target, 'repl': repl, 'text': txt, 'cs': cs, 'hz': hz})
BLACK = (0.07, 0.07, 0.09)
# stessa larghezza, stessi glifi: tutto il resto della riga deve restare identico al pixel
line(770, 'Serif', 12, BLACK, 'Contratto di fornitura n. 145/2026 del 12 marzo'.split(), '145/2026', '154/2062', 'stessi glifi')
line(735, 'Sans-Bold', 15, (0.10, 0.25, 0.62), 'ARTICOLO 12 – DURATA E RINNOVO'.split(), '12', '21', 'stessi glifi')
line(700, 'Serif-Italic', 11, (0.35, 0.35, 0.38), 'Importo complessivo pari a euro 1.250,00 oltre IVA'.split(), '1.250,00', '2.150,00', 'stessi glifi')
line(665, 'DejaVu', 10, (0.62, 0.10, 0.12), 'Scadenza del pagamento: 30/06/2026 salvo proroga'.split(), '30/06/2026', '06/03/2026', 'stessi glifi')
if 'Carlito' in FONTS: line(630, 'Carlito', 12.5, BLACK, 'Protocollo generale numero 55943 del registro'.split(), '55943', '34559', 'stessi glifi')
line(595, 'Serif', 12, BLACK, 'Testo con spaziatura larga tra le lettere 2026'.split(), '2026', '6202', 'stessi glifi', cs=1.2)
line(560, 'Sans', 12, (0.05, 0.40, 0.30), 'Testo stretto in orizzontale al 85 per cento 2026'.split(), '2026', '6022', 'stessi glifi', hz=85)
line(525, 'Mono', 10.5, BLACK, 'CODICE FISCALE RSSMRA80A01H501U VERIFICATO'.split(), 'RSSMRA80A01H501U', 'RSSMRA08A10H501U', 'stessi glifi')
c.setFillColor(Color(*BLACK)); c.setFont('Helvetica', 11); 
line(490, 'Helvetica', 11, BLACK, 'Carattere standard non incorporato: totale 987 pezzi'.split(), '987', '798', 'stessi glifi')
# glifi che nel sottoinsieme del PDF non ci sono (lettere mai usate nel documento per quel carattere)
line(440, 'Serif-Bold', 13, BLACK, 'Il responsabile del procedimento Mario Rossi'.split(), 'Rossi', 'Kowalczyk', 'glifi mancanti')
line(405, 'DejaVu', 10, (0.62, 0.10, 0.12), 'Sede legale in via Roma, Palermo'.split(), 'Palermo', 'Quartu', 'glifi mancanti')
if 'Caladea' in FONTS: line(370, 'Caladea', 12, BLACK, 'Firmato digitalmente in data odierna'.split(), 'odierna', 'Bxyzw', 'glifi mancanti')
# testo più lungo/corto: il resto della riga deve scorrere restando sulla stessa linea di base
line(320, 'Serif', 12, BLACK, 'La durata è di 36 mesi dalla sottoscrizione'.split(), '36', '120', 'larghezza diversa')
c.showPage(); c.save(); json.dump(cases, open(os.path.join(D, 'prova.json'), 'w'), indent=1); print(len(cases), 'righe;', ', '.join(sorted(FONTS)))
