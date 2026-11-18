#!/usr/bin/env python3
"""Seconda prova per «Modifica»: come i programmi veri scrivono il testo nei PDF.
   · paragrafo di tre righe (Td tra una riga e l'altra): si cambia una parola nella riga di mezzo
   · riga con crenatura (TJ con aggiustamenti tra le lettere)
   · riga di tabella scritta in un'unica istruzione con grandi salti tra le celle: le altre celle non devono muoversi
   · parole posizionate una per una (Tj + Td), senza carattere di spazio
   · corpo del carattere dato dalla matrice del testo (Tf a 1 punto, Tm in scala)
   · riga giustificata con spaziatura tra le parole (Tw)"""
import json, os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'edit')
T = '/usr/share/fonts/truetype/liberation/'
pdfmetrics.registerFont(TTFont('Serif', T + 'LiberationSerif-Regular.ttf')); pdfmetrics.registerFont(TTFont('Sans', T + 'LiberationSans-Regular.ttf'))
c = canvas.Canvas(os.path.join(D, 'prova2.pdf'), pagesize=(595.28, 841.89)); cases = []
W = lambda s, f='Serif', z=12: pdfmetrics.stringWidth(s, f, z)
def case(kind, y, x, text, target, repl, font='Serif', size=12, tw=0, note=''):
    pre = text[:text.index(target)]; nsp = pre.count(' ')
    x0 = x + W(pre, font, size) + nsp * tw; x1 = x0 + W(target, font, size)
    cases.append({'kind': kind, 'font': font, 'size': size, 'color': [0, 0, 0], 'y': y, 'x0': x0, 'x1': x1, 'xEnd': x + W(text, font, size) + text.count(' ') * tw, 'x': x, 'target': target, 'repl': repl, 'text': text, 'cs': 0, 'hz': 100, 'note': note})
# 1) paragrafo di tre righe in un solo oggetto di testo
t = c.beginText(64, 770); t.setFont('Serif', 12); t.setLeading(16)
L1, L2, L3 = 'Il presente contratto disciplina i rapporti tra le parti in relazione', 'alla fornitura dei servizi descritti per un totale di 4580 ore annue', 'e si intende rinnovato salvo disdetta da comunicare per iscritto.'
t.textLine(L1); t.textLine(L2); t.textLine(L3); c.drawText(t)
case('stessi glifi', 754, 64, L2, '4580', '8054', note='paragrafo: riga di mezzo')
cases[-1]['others'] = [770, 738]     # le altre due righe del paragrafo: devono restare identiche
# 2) riga con crenatura: TJ con aggiustamenti
c.setFont('Serif', 12); fnt = c._fontname
enc = lambda s: pdfmetrics.getFont('Serif').splitString(s, c._doc)   # [(sottoinsieme, bytes)]
def raw_tj(x, y, parts, font='Serif', size=12, extra=''):
    """parts: stringhe e numeri alternati → un TJ; usa il sottoinsieme del font di reportlab"""
    f = pdfmetrics.getFont(font); out = []; sub = None
    for p in parts:
        if isinstance(p, (int, float)): out.append(str(p)); continue
        ss = f.splitString(p, c._doc); assert len(ss) == 1, 'testo su più sottoinsiemi'
        sub = ss[0][0]; b = ss[0][1]; out.append('(' + ''.join('\\%03o' % ch for ch in b) + ')')
    name = f.getSubsetInternalName(sub, c._doc)
    c._code.append('BT %s %s %s Tf %s 1 0 0 1 %s %s Tm [%s] TJ ET' % ('0 0 0 rg', name, size, extra, x, y, ' '.join(out)))
K = 'Avvocato Tommaso Valente, protocollo 7391 del registro'
raw_tj(64, 690, ['A', 80, 'vv', 20, 'ocato ', 60, 'T', 90, 'ommaso ', 40, 'V', 110, 'alente, protocollo ', 'ZZZ']) if False else None
parts = ['A', 80, 'vvocato T', 90, 'ommaso V', 110, 'alente, protocollo 7391 del registro']
raw_tj(64, 690, parts)
kern = (80 + 90 + 110) / 1000 * 12
cases.append({'kind': 'stessi glifi', 'font': 'Serif', 'size': 12, 'color': [0, 0, 0], 'y': 690, 'x0': 64 + W('Avvocato Tommaso Valente, protocollo ') - kern, 'x1': 64 + W('Avvocato Tommaso Valente, protocollo 7391') - kern, 'xEnd': 64 + W(K) - kern, 'x': 64, 'target': '7391', 'repl': '1937', 'text': K, 'cs': 0, 'hz': 100, 'note': 'crenatura (TJ)'})
# 3) riga di tabella in un'unica istruzione: tre celle separate da grandi salti
gap1 = -(200 - W('Voce di spesa 3')) * 1000 / 12; gap2 = -(140 - W('21/03/2026')) * 1000 / 12
raw_tj(64, 640, ['Voce di spesa 3', round(gap1, 2), '21/03/2026', round(gap2, 2), '2.022,00'])
cases.append({'kind': 'stessi glifi', 'font': 'Serif', 'size': 12, 'color': [0, 0, 0], 'y': 640, 'x0': 64 + W('Voce di spesa '), 'x1': 64 + W('Voce di spesa 3'), 'xEnd': 64 + 340 + W('2.022,00'), 'x': 64, 'target': '3', 'repl': '2', 'text': 'Voce di spesa 3', 'cs': 0, 'hz': 100, 'note': 'tabella in un TJ: cella 1'})
cases.append({'kind': 'larghezza diversa', 'font': 'Serif', 'size': 12, 'color': [0, 0, 0], 'y': 600, 'x0': 64 + W('Voce di '), 'x1': 64 + W('Voce di spesa'), 'xEnd': 64 + W('Voce di spesa 5'), 'x': 64, 'target': 'spesa', 'repl': 'spesa straordinaria', 'text': 'Voce di spesa 5', 'cs': 0, 'hz': 100, 'note': 'tabella in un TJ: la cella si allunga, le altre restano', 'fixed': [[264, 264 + 140 + W('9.843,00')]]})
gap1b = -(200 - W('Voce di spesa 5')) * 1000 / 12
raw_tj(64, 600, ['Voce di spesa 5', round(gap1b, 2), '26/03/2026', round(-(140 - W('26/03/2026')) * 1000 / 12, 2), '9.843,00'])
# 4) parole posizionate una per una, senza spazi
f = pdfmetrics.getFont('Sans'); words = 'Importo dovuto entro il 30/09/2026 senza interessi'.split(); x = 64; code = ['BT 0 0 0 rg']
first = True
for wd in words:
    ss = f.splitString(wd, c._doc); name = f.getSubsetInternalName(ss[0][0], c._doc); b = ss[0][1]
    code.append('%s 11 Tf 1 0 0 1 %s %s Tm (%s) Tj' % (name, round(x, 3), 550, ''.join('\\%03o' % ch for ch in b))); x += W(wd, 'Sans', 11) + W(' ', 'Sans', 11)
code.append('ET'); c._code.append(' '.join(code))
txt = ' '.join(words)
cases.append({'kind': 'stessi glifi', 'font': 'Sans', 'size': 11, 'color': [0, 0, 0], 'y': 550, 'x0': 64 + W('Importo dovuto entro il ', 'Sans', 11), 'x1': 64 + W('Importo dovuto entro il 30/09/2026', 'Sans', 11), 'xEnd': 64 + W(txt, 'Sans', 11), 'x': 64, 'target': '30/09/2026', 'repl': '09/03/2026', 'text': txt, 'cs': 0, 'hz': 100, 'note': 'parole posizionate una per una'})
# 5) corpo dato dalla matrice del testo
f = pdfmetrics.getFont('Serif'); S5 = 'Totale documento euro 15.250,84 IVA inclusa'; ss = f.splitString(S5, c._doc); name = f.getSubsetInternalName(ss[0][0], c._doc)
c._code.append('BT 0.1 0.1 0.5 rg %s 1 Tf 14 0 0 14 64 500 Tm (%s) Tj ET' % (name, ''.join('\\%03o' % ch for ch in ss[0][1])))
cases.append({'kind': 'stessi glifi', 'font': 'Serif', 'size': 14, 'color': [0.1, 0.1, 0.5], 'y': 500, 'x0': 64 + W('Totale documento euro ', 'Serif', 14), 'x1': 64 + W('Totale documento euro 15.250,84', 'Serif', 14), 'xEnd': 64 + W(S5, 'Serif', 14), 'x': 64, 'target': '15.250,84', 'repl': '51.520,48', 'text': S5, 'cs': 0, 'hz': 100, 'note': 'corpo nella matrice del testo'})
# 6) riga giustificata con Tw
S6 = 'Le parti convengono quanto segue entro il 2026 senza eccezioni'; ss = f.splitString(S6, c._doc); name = f.getSubsetInternalName(ss[0][0], c._doc); tw = 2.4
c._code.append('BT 0 0 0 rg %s 12 Tf %s Tw 1 0 0 1 64 450 Tm (%s) Tj 0 Tw ET' % (name, tw, ''.join('\\%03o' % ch for ch in ss[0][1])))
case('stessi glifi', 450, 64, S6, '2026', '6202', tw=tw, note='giustificata (Tw)')
c.showPage(); c.save(); json.dump(cases, open(os.path.join(D, 'prova2.json'), 'w'), indent=1); print(len(cases), 'casi')
