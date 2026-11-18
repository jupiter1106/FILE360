#!/usr/bin/env python3
"""Documenti di prova (tutto inventato) per «Word, Excel e testi in PDF»:
- relazione.docx: titoli, paragrafi giustificati, grassetti e colori, elenchi puntati e numerati annidati, tabella con
  intestazione ripetuta, celle unite e sfondi, immagine, salto di pagina, intestazione e piè di pagina «Pagina X di Y»;
- bilancio.xlsx: foglio largo (14 colonne: date, importi in euro, percentuali, celle unite, bordi) e foglio lungo (400 righe);
- note.md e pagina.html.
Scrive anche office-attese.json (il testo atteso, per controllare che nel PDF ci sia tutto e nell'ordine giusto).
Uso: python3 test/bench/make_office.py"""
import json, pathlib, datetime, io
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import openpyxl
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

D = pathlib.Path(__file__).parent / 'tools'; D.mkdir(exist_ok=True)
expect = {}

# ---------- Word ----------
d = Document()
sec = d.sections[0]; sec.page_width, sec.page_height = Cm(21), Cm(29.7); sec.left_margin = sec.right_margin = Cm(2.5)
def field(par, instr):
    r = par.add_run(); a = OxmlElement('w:fldChar'); a.set(qn('w:fldCharType'), 'begin'); r._r.append(a)
    r2 = par.add_run(); t = OxmlElement('w:instrText'); t.set(qn('xml:space'), 'preserve'); t.text = instr; r2._r.append(t)
    r3 = par.add_run(); b = OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'), 'separate'); r3._r.append(b)
    par.add_run('1')
    r5 = par.add_run(); c = OxmlElement('w:fldChar'); c.set(qn('w:fldCharType'), 'end'); r5._r.append(c)
hp = sec.header.paragraphs[0]; hp.text = 'Studio Rossi Bianchi · Relazione annuale'; hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.CENTER; fp.add_run('Pagina '); field(fp, 'PAGE'); fp.add_run(' di '); field(fp, 'NUMPAGES')
words = []
def P(text, style=None, **k):
    p = d.add_paragraph(style=style); r = p.add_run(text)
    if k.get('bold'): r.bold = True
    if k.get('color'): r.font.color.rgb = RGBColor.from_string(k['color'])
    if k.get('align'): p.alignment = k['align']
    words.append(text); return p
d.add_heading('Relazione sull’attività 2026', 0); words.append('Relazione sull’attività 2026')
d.add_heading('1. Premessa', 1); words.append('1. Premessa')
lorem = ('La presente relazione descrive l’attività svolta nel corso dell’anno, con particolare attenzione ai risultati economici, '
         'agli investimenti e alle prospettive per l’esercizio successivo. Gli importi sono espressi in euro (€) e arrotondati. ')
for i in range(4): P(lorem * 2 + f'Paragrafo numero {i + 1}.', align=WD_ALIGN_PARAGRAPH.JUSTIFY)
p = d.add_paragraph(); r = p.add_run('Nota importante: '); r.bold = True; r2 = p.add_run('i dati sono provvisori.'); r2.font.color.rgb = RGBColor(0xC0, 0x1C, 0x28); words.append('Nota importante: i dati sono provvisori.')
d.add_heading('2. Obiettivi', 1); words.append('2. Obiettivi')
for t in ['Ridurre i tempi di consegna', 'Aumentare la qualità del servizio', 'Formare il personale']: P(t, 'List Bullet')
for t in ['Analisi dei costi', 'Revisione dei contratti', 'Piano degli investimenti']: P(t, 'List Number')
P('Dettaglio del piano', 'List Number 2')
d.add_heading('3. Risultati', 1); words.append('3. Risultati')
t = d.add_table(rows=1, cols=4); t.style = 'Table Grid'
hdr = ['Voce', 'Primo semestre', 'Secondo semestre', 'Totale']
for c, v in zip(t.rows[0].cells, hdr): c.text = v; c.paragraphs[0].runs[0].bold = True
tr = t.rows[0]._tr; trPr = tr.get_or_add_trPr(); th = OxmlElement('w:tblHeader'); th.set(qn('w:val'), 'true'); trPr.append(th)
for c in t.rows[0].cells:
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), 'D9E2F3'); c._tc.get_or_add_tcPr().append(shd)
words += hdr
rows = []
for i in range(30):
    a, b = 1000 + i * 37, 1200 + i * 41
    row = [f'Voce di spesa {i + 1}', f'{a:,} €'.replace(',', '.'), f'{b:,} €'.replace(',', '.'), f'{a + b:,} €'.replace(',', '.')]
    cells = t.add_row().cells
    for c, v in zip(cells, row): c.text = v
    rows.append(row); words += row
m = t.add_row().cells; m[0].merge(m[2]); m[0].text = 'Totale complessivo'; m[3].text = '99.999 €'; words += ['Totale complessivo', '99.999 €']
# immagine (un grafico disegnato: barre)
from PIL import Image, ImageDraw
im = Image.new('RGB', (600, 300), 'white'); dr = ImageDraw.Draw(im)
for k, hgt in enumerate([120, 180, 90, 240, 200]): dr.rectangle([60 + k * 100, 280 - hgt, 120 + k * 100, 280], fill=(70, 100, 200))
buf = io.BytesIO(); im.save(buf, 'PNG'); buf.seek(0)
d.add_paragraph().add_run().add_picture(buf, width=Cm(12))
P('Figura 1 – Andamento trimestrale (valori indicativi).', align=WD_ALIGN_PARAGRAPH.CENTER)
d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
d.add_heading('4. Conclusioni', 1); words.append('4. Conclusioni')
P('Città, perché, qualità, più, già: le lettere accentate restano corrette. Simboli: €, %, °, §, «virgolette».')
for i in range(3): P(lorem + f'Conclusione {i + 1}.')
d.save(D / 'relazione.docx')
expect['relazione.docx'] = {'words': words, 'images': 1}

# ---------- Excel ----------
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Conto economico'
thin = Side(style='thin', color='999999'); B = Border(top=thin, bottom=thin, left=thin, right=thin)
ws.merge_cells('A1:N1'); ws['A1'] = 'Conto economico per mese – esercizio 2026'; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
head = ['Voce', 'Data'] + ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov'] + ['Quota']
for c, v in enumerate(head, 1):
    x = ws.cell(row=2, column=c, value=v); x.font = Font(bold=True); x.fill = PatternFill('solid', fgColor='DDEBF7'); x.border = B
cells = []
for r in range(20):
    ws.cell(row=3 + r, column=1, value=f'Ricavo linea {r + 1}').border = B
    dc = ws.cell(row=3 + r, column=2, value=datetime.date(2026, 1 + r % 12, 1 + r)); dc.number_format = 'dd/mm/yyyy'; dc.border = B
    for c in range(11):
        v = 1000 + r * 113 + c * 17.5
        x = ws.cell(row=3 + r, column=3 + c, value=v); x.number_format = '#,##0.00 €'; x.border = B
        cells.append(f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'))
    q = ws.cell(row=3 + r, column=14, value=(r + 1) / 100); q.number_format = '0.00%'; q.border = B
    cells += [f'Ricavo linea {r + 1}', f'{1 + r:02d}/{1 + r % 12:02d}/2026', f'{(r + 1):.2f}%'.replace('.', ',')]
ws.column_dimensions['A'].width = 22
ws2 = wb.create_sheet('Movimenti')
ws2.append(['N.', 'Descrizione', 'Importo'])
for i in range(400):
    ws2.append([i + 1, f'Movimento di prova numero {i + 1}', round(10 + i * 3.7, 2)]); cells.append(f'Movimento di prova numero {i + 1}')
ws2.column_dimensions['B'].width = 40
wb.save(D / 'bilancio.xlsx')
expect['bilancio.xlsx'] = {'cells': cells, 'sheets': ['Conto economico', 'Movimenti']}

# ---------- Markdown e HTML ----------
(D / 'note.md').write_text('# Note della riunione\n\nPresenti: **Anna**, *Luca* e Marta.\n\n## Decisioni\n\n- Approvato il bilancio\n- Rinviata la gara\n  - nuova data da fissare\n\n1. Inviare il verbale\n2. Convocare i soci\n\n| Punto | Esito |\n|---|---|\n| Bilancio | approvato |\n| Gara | rinviata |\n\n```\ncodice = 42\n```\n', encoding='utf-8')
expect['note.md'] = {'words': ['Note della riunione', 'Presenti', 'Anna', 'Luca', 'Marta', 'Decisioni', 'Approvato il bilancio', 'Rinviata la gara', 'nuova data da fissare', 'Inviare il verbale', 'Convocare i soci', 'Punto', 'Esito', 'Bilancio', 'approvato', 'Gara', 'rinviata', 'codice = 42']}
(D / 'pagina.html').write_text('<!doctype html><html><head><title>Avviso ai clienti</title><style>p{color:red}</style><script>alert(1)</script></head><body><h1>Avviso ai clienti</h1><p>Dal <b>1° luglio</b> cambiano gli orari.</p><img src="https://esempio.invalid/logo.png"><ul><li>Lunedì: 9–13</li><li>Martedì: 9–18</li></ul><table><thead><tr><th>Giorno</th><th>Orario</th></tr></thead><tbody><tr><td>Sabato</td><td>chiuso</td></tr></tbody></table></body></html>', encoding='utf-8')
expect['pagina.html'] = {'words': ['Avviso ai clienti', 'Dal', '1° luglio', 'cambiano gli orari', 'Lunedì', 'Martedì', 'Giorno', 'Orario', 'Sabato', 'chiuso'], 'absent': ['alert']}
(D / 'office-attese.json').write_text(json.dumps(expect, ensure_ascii=False, indent=1), encoding='utf-8')
print('ok', [p.name for p in D.glob('*') if p.suffix in ('.docx', '.xlsx', '.md', '.html')])
