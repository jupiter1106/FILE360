#!/usr/bin/env python3
"""File di prova del rilevatore di testo AI (testi inventati). python-docx, python-pptx e openpyxl lasciano le loro
impronte; docx.js e PptxGenJS si creano con node (test/make_ai_fixtures.js). «umano.docx» è scritto con LibreOffice:
nessuna prova deve comparire. «copiato-font.docx» ha i metadati di Word ma il carattere dell'interfaccia di ChatGPT."""
import pathlib, subprocess, zipfile, re, shutil, tempfile
import docx, pptx, openpyxl
from docx.shared import Pt
from reportlab.pdfgen import canvas
D = pathlib.Path(__file__).resolve().parent / 'fixtures' / 'ai'; D.mkdir(parents=True, exist_ok=True)
T = ('La fotosintesi clorofilliana è il processo attraverso cui le piante trasformano la luce del sole in energia chimica. '
     'Avviene nelle foglie, nei cloroplasti, grazie alla clorofilla, e produce zuccheri e ossigeno a partire da acqua e anidride carbonica.')
d = docx.Document(); d.add_paragraph(T); d.save(D / 'ai-python-docx.docx')
p = pptx.Presentation(); s = p.slides.add_slide(p.slide_layouts[1]); s.shapes.title.text = 'La fotosintesi'; s.placeholders[1].text = T; p.save(D / 'ai-python-pptx.pptx')
w = openpyxl.Workbook(); w.active['A1'] = 'Argomento'; w.active['B1'] = T; w.save(D / 'ai-openpyxl.xlsx')
c = canvas.Canvas(str(D / 'ai-reportlab.pdf')); y = 780
for line in re.findall(r'.{1,90}(?:\s|$)', T): c.drawString(60, y, line.strip()); y -= 16
c.save()
# Word «ripulito»: metadati come quelli di Word, ma il testo incollato dalla chat porta con sé il carattere «OpenAI Sans»
d = docx.Document(); r = d.add_paragraph().add_run(T); r.font.name = 'OpenAI Sans'; d.save(D / '_tmp.docx')
zin = zipfile.ZipFile(D / '_tmp.docx'); zout = zipfile.ZipFile(D / 'copiato-font.docx', 'w', zipfile.ZIP_DEFLATED)
for n in zin.namelist():
    b = zin.read(n)
    if n == 'docProps/core.xml':
        b = re.sub(rb'<dc:creator>.*?</dc:creator>', b'<dc:creator>Giulia Verdi</dc:creator>', b); b = re.sub(rb'<dc:description>.*?</dc:description>', b'<dc:description></dc:description>', b)
        b = b.replace(b'2013-12-23T23:15:00Z', b'2026-03-02T10:15:00Z')
    if n == 'docProps/app.xml': b = b.replace(b'Microsoft Macintosh Word', b'Microsoft Office Word')
    zout.writestr(n, b)
zout.close(); (D / '_tmp.docx').unlink()
# testi scritti «a mano» (LibreOffice): uno normale e due compiti con un paragrafo in comune
tmp = pathlib.Path(tempfile.mkdtemp())
COMUNE = 'Secondo me la cosa più importante è che le piante, usando la luce del sole, riescono a produrre da sole il proprio cibo e intanto liberano ossigeno nell’aria.'
(tmp / 'umano.txt').write_text('Ieri in laboratorio abbiamo guardato al microscopio una foglia di elodea. Si vedevano benissimo i cloroplasti, tanti puntini verdi che si muovevano piano.\n\nLa prof ci ha detto di disegnarli e io ho fatto un disastro, ma alla fine il disegno si capiva.', encoding='utf-8')
(tmp / 'compito-a.txt').write_text('La fotosintesi è un processo delle piante. ' + COMUNE + ' Senza fotosintesi non ci sarebbe vita sulla Terra.', encoding='utf-8')
(tmp / 'compito-b.txt').write_text('Le piante sono esseri viventi molto speciali. ' + COMUNE + ' Per questo dobbiamo proteggere i boschi.', encoding='utf-8')
for n in ['umano', 'compito-a', 'compito-b']:
    subprocess.run(['soffice', '--headless', '--convert-to', 'docx:MS Word 2007 XML', '--outdir', str(D), str(tmp / f'{n}.txt')], capture_output=True, timeout=120)
shutil.rmtree(tmp); print(sorted(x.name for x in D.iterdir()))
