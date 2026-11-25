#!/usr/bin/env python3
"""Corpus del banco degli strumenti: documenti INVENTATI con la verità di riferimento (tools/gt.json).
   Estratti conto (digitali e scansionato), documenti con dati sensibili (digitale e scansionato), testo per il
   conteggio, coppia di versioni per il confronto, tabella per Excel (digitale e scansionata), testo per Word."""
import json, os, random, subprocess, tempfile, pathlib
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image, ImageFilter
D = pathlib.Path(__file__).resolve().parent / 'tools'; D.mkdir(exist_ok=True)
R = random.Random(360)
W, H = A4
ODD = {**{str(i): v for i, v in enumerate([1, 0, 5, 7, 9, 13, 15, 17, 19, 21])}, **dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ', [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]))}
def cf(b): return b + chr(65 + sum(ODD[c] if i % 2 == 0 else (int(c) if c.isdigit() else ord(c) - 65) for i, c in enumerate(b)) % 26)
def iban_it(cin, abi, cab, conto):
    bban = cin + abi + cab + conto; n = int(''.join(str(int(ch, 36)) for ch in bban + 'IT00')); return f'IT{98 - n % 97:02d}{bban}'
def piva(base10):
    s = 0
    for i, ch in enumerate(base10):
        d = int(ch)
        if i % 2 == 1: d *= 2; d = d - 9 if d > 9 else d
        s += d
    return base10 + str((10 - s % 10) % 10)
def luhn(base):
    s, alt = 0, True
    for ch in reversed(base):
        d = int(ch)
        if alt: d *= 2; d = d - 9 if d > 9 else d
        s += d; alt = not alt
    return base + str((10 - s % 10) % 10)
def eur(v): s = f'{abs(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'); return ('-' if v < 0 else '') + s
def scan(src, out, dpi=200, rot=0.35, noise=2500):
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['pdftoppm', '-r', str(dpi), '-gray', '-png', src, os.path.join(td, 'p')], check=True)
        pages = sorted(f for f in os.listdir(td) if f.endswith('.png')); ims = []
        for f in pages:
            im = Image.open(os.path.join(td, f)).convert('L').filter(ImageFilter.GaussianBlur(0.45)); px = im.load(); r = random.Random(f)
            for _ in range(noise): px[r.randrange(im.width), r.randrange(im.height)] = r.randrange(170, 235)
            ims.append(im.point(lambda v: min(255, int(v * 0.93 + 14))).rotate(rot, resample=Image.BICUBIC, fillcolor=245))
        ims[0].save(out, 'PDF', resolution=dpi, save_all=True, append_images=ims[1:])
GT = {}
# ---------- estratti conto ----------
DESC = [['BONIFICO A FAVORE DI {N} SRL', 'CAUSALE FATTURA {K}/2026'], ['ACCREDITO STIPENDIO', 'ORD: {N} SPA'], ['PAGAMENTO POS {N}'], ['ADDEBITO SDD UTENZA GAS', 'MANDATO {K}'],
        ['PRELIEVO ATM'], ['PAGAMENTO F24 DELEGA'], ['BONIFICO DA {N}', 'RIF. FATTURA {K}/2026'], ['COMMISSIONI E SPESE TENUTA CONTO'], ['IMPOSTA DI BOLLO'], ['RICARICA CARTA PREPAGATA']]
NAMES = ['ALFA', 'BETA SERVIZI', 'GAMMA', 'DELTA LOGISTICA', 'EPSILON', 'ZETA COSTRUZIONI', 'ETA', 'TETA']
def estratto(name, n, seed):
    r = random.Random(seed); c = canvas.Canvas(str(D / name), pagesize=A4); y = H - 60; movs = []; ini = round(r.uniform(1000, 9000), 2)
    for i in range(n):
        d = f'{r.randint(1, 28):02d}/03/2026'; a = round(r.uniform(5, 2500), 2) * (1 if r.random() < 0.3 else -1)
        desc = [t.replace('{N}', r.choice(NAMES)).replace('{K}', str(r.randint(1, 999))) for t in r.choice(DESC)]; movs.append((d, d, desc, a))
    movs.sort(key=lambda m: (m[0][3:5], m[0][:2]))
    def head():
        nonlocal y
        c.setFont('Helvetica-Bold', 14); c.drawString(40, y, 'ESTRATTO CONTO CORRENTE - Banca di Prova'); y -= 18
        c.setFont('Helvetica', 9); c.drawString(40, y, 'Periodo dal 01/03/2026 al 31/03/2026   IBAN IT60 X054 2811 1010 0000 0123 456'); y -= 26
        c.setFont('Helvetica-Bold', 9)
        for x, t in [(40, 'Data'), (95, 'Valuta'), (150, 'Descrizione operazioni'), (420, 'Dare'), (495, 'Avere')]: c.drawString(x, y, t)
        y -= 16; c.setFont('Helvetica', 9)
    head(); c.drawString(150, y, 'SALDO INIZIALE'); c.drawRightString(540, y, eur(ini)); y -= 16; tot = ini
    for d, v, desc, a in movs:
        if y < 90: c.drawString(150, 50, 'Pagina ' + str(c.getPageNumber())); c.showPage(); y = H - 60; head()
        c.drawString(40, y, d); c.drawString(95, y, v); c.drawString(150, y, desc[0]); c.drawRightString(445 if a < 0 else 520, y, eur(abs(a)))
        for extra in desc[1:]: y -= 11; c.drawString(150, y, extra)
        y -= 15; tot += a
    c.drawString(150, y - 6, 'SALDO FINALE'); c.drawRightString(540, y - 6, eur(round(tot, 2))); c.save()
    return {'movimenti': [[d, round(a, 2)] for d, _, _, a in movs], 'iniziale': ini, 'finale': round(tot, 2)}
GT['banca'] = {'banca-1.pdf': estratto('banca-1.pdf', 14, 1), 'banca-2.pdf': estratto('banca-2.pdf', 33, 2), 'banca-3.pdf': estratto('banca-3.pdf', 48, 3)}
scan(str(D / 'banca-2.pdf'), str(D / 'banca-2-scansione.pdf')); GT['banca']['banca-2-scansione.pdf'] = GT['banca']['banca-2.pdf']
# ---------- dati sensibili ----------
pv = {
    'nome': ['Marco Bellini', 'Giulia Ferrante'], 'cf': [cf('BLLMRC85L03E507'), cf('FRRGLI90A41F205')], 'iban': [iban_it('X', '05428', '11101', '000000123456')],
    'tel': ['347 1234567', '02 8765432'], 'email': ['marco.bellini@esempio.it'], 'indirizzo': ['Via Garibaldi 24'], 'nascita': ['Lecco', '03/07/1985'],
    'piva': [piva('0123456789')], 'carta': [' '.join([luhn('411111111111111')[i:i + 4] for i in range(0, 16, 4)])], 'doc': ['CA12345AB'], 'targa': ['AB123CD'],
    'sanita': ['affetto da diabete di tipo 2'], 'particolari': ['iscritto al sindacato'],
}
lines = [
    'Spett.le Ufficio, con la presente il sottoscritto Marco Bellini, nato a Lecco il 03/07/1985,',
    f'codice fiscale {pv["cf"][0]}, residente in Via Garibaldi 24, 23900 Lecco (LC), chiede il rimborso',
    f'della somma indicata sul conto IBAN {pv["iban"][0]} intestato al richiedente.',
    'Per comunicazioni: telefono 347 1234567, ufficio 02 8765432, email marco.bellini@esempio.it.',
    f'La ditta collegata ha partita IVA {pv["piva"][0]}. Documento: carta d\'identità n. CA12345AB.',
    f'Pagamento con carta {pv["carta"][0]} per il veicolo targato AB123CD.',
    'Il richiedente dichiara di essere affetto da diabete di tipo 2 e di essere iscritto al sindacato.',
    f'Delegata: la signora Giulia Ferrante, codice fiscale {pv["cf"][1]}.',
    'Il presente documento contiene anche testo comune senza dati personali, per verificare i falsi allarmi:',
    'la riunione del consiglio si terrà presso la sala grande; ordine del giorno: bilancio e varie.',
]
def pii_pdf(name):
    c = canvas.Canvas(str(D / name), pagesize=A4); c.setFont('Helvetica-Bold', 13); c.drawString(60, H - 70, 'Richiesta di rimborso'); c.setFont('Helvetica', 10.5)
    for i, t in enumerate(lines): c.drawString(60, H - 110 - i * 20, t)
    c.save()
pii_pdf('pii.pdf'); scan(str(D / 'pii.pdf'), str(D / 'pii-scansione.pdf'), dpi=200)
GT['pii'] = {'valori': pv, 'file': ['pii.pdf', 'pii-scansione.pdf']}
# ---------- conteggio ----------
VOC = 'casa lavoro tempo mondo giorno anno vita parte mano sera piano strada acqua festa ragione carta treno libro scuola tavolo finestra porta prato monte mare cielo luce sole luna stella'.split()
paras = [' '.join(R.choice(VOC) for _ in range(R.randint(40, 70))) + '.' for _ in range(6)]
c = canvas.Canvas(str(D / 'conta.pdf'), pagesize=A4); c.setFont('Helvetica', 11); y = H - 70
for p in paras:
    ws = p.split(); line = ''
    for w in ws:
        if c.stringWidth(line + ' ' + w, 'Helvetica', 11) > 470: c.drawString(60, y, line); y -= 15; line = w
        else: line = (line + ' ' + w).strip()
    c.drawString(60, y, line); y -= 26
c.save()
txt = '\n'.join(paras); GT['conta'] = {'parole': len(txt.split()), 'caratteri_senza_spazi': len(txt.replace(' ', '').replace('\n', ''))}
# ---------- confronto ----------
base = [' '.join(R.choice(VOC) for _ in range(30)) for _ in range(5)]
ed = [list(p.split()) for p in base]; changes = []
changes.append(('sostituita', ed[0][5], 'aereo')); ed[0][5] = 'aereo'
changes.append(('sostituita', ed[1][10], 'bosco')); ed[1][10] = 'bosco'
ed[2].insert(7, 'giardino'); changes.append(('aggiunta', 'giardino'))
ed[3].insert(3, 'ponte'); changes.append(('aggiunta', 'ponte'))
rem1 = ed[4].pop(12); changes.append(('tolta', rem1))
rem2 = ed[2].pop(20); changes.append(('tolta', rem2))
for name, ps in (('versione-a.pdf', [p.split() for p in base]), ('versione-b.pdf', ed)):
    c = canvas.Canvas(str(D / name), pagesize=A4); c.setFont('Helvetica', 11); y = H - 70
    for p in ps:
        line = ''
        for w in p:
            if c.stringWidth(line + ' ' + w, 'Helvetica', 11) > 470: c.drawString(60, y, line); y -= 15; line = w
            else: line = (line + ' ' + w).strip()
        c.drawString(60, y, line); y -= 26
    c.save()
GT['confronto'] = {'modifiche': changes}
# ---------- tabella (Excel) ----------
rows = [['Data', 'Cliente', 'Documento', 'Imponibile', 'Totale']]
for i in range(14):
    imp = round(R.uniform(50, 9000), 2); rows.append([f'{R.randint(1, 28):02d}/0{R.randint(1, 9)}/2026', R.choice(NAMES).title(), f'FT-{100 + i}', eur(imp), eur(round(imp * 1.22, 2))])
def table_pdf(name):
    c = canvas.Canvas(str(D / name), pagesize=A4); xs = [50, 130, 270, 360, 460, 550]; y0 = H - 90; rh = 22
    c.setFont('Helvetica-Bold', 13); c.drawString(50, H - 60, 'Registro documenti')
    for r_, row in enumerate(rows):
        y = y0 - r_ * rh; c.setFont('Helvetica-Bold' if r_ == 0 else 'Helvetica', 10)
        for k, v in enumerate(row):
            if k >= 3: c.drawRightString(xs[k + 1] - 6, y - 15, v)
            else: c.drawString(xs[k] + 5, y - 15, v)
    for r_ in range(len(rows) + 1): c.line(xs[0], y0 - r_ * rh, xs[-1], y0 - r_ * rh)
    for x in xs: c.line(x, y0, x, y0 - len(rows) * rh)
    c.save()
table_pdf('tabella.pdf'); scan(str(D / 'tabella.pdf'), str(D / 'tabella-scansione.pdf'), dpi=250, rot=0.2, noise=1500)
GT['tabella'] = {'righe': rows}
# ---------- testo (Word) ----------
wpar = [' '.join(R.choice(VOC) for _ in range(R.randint(35, 55))).capitalize() + '.' for _ in range(5)]
c = canvas.Canvas(str(D / 'testo.pdf'), pagesize=A4); c.setFont('Times-Roman', 12); y = H - 80
for p in wpar:
    line = ''
    for w in p.split():
        if c.stringWidth(line + ' ' + w, 'Times-Roman', 12) > 460: c.drawString(65, y, line); y -= 16; line = w
        else: line = (line + ' ' + w).strip()
    c.drawString(65, y, line); y -= 28
c.save(); scan(str(D / 'testo.pdf'), str(D / 'testo-scansione.pdf'), dpi=200)
GT['testo'] = {'testo': '\n'.join(wpar)}
json.dump(GT, open(D / 'gt.json', 'w'), ensure_ascii=False, indent=1)
print('ok', sorted(p.name for p in D.glob('*.pdf')))
# ---------- bilancio XBRL (tassonomia itcc-ci 2018-11-04), valori coerenti ----------
B = {'TotaleImmobilizzazioniMateriali': 420000, 'TotaleImmobilizzazioni': 480000, 'TotaleImmobilizzazioniImmateriali': 60000, 'TotaleRimanenze': 90000, 'TotaleCrediti': 310000,
     'TotaleDisponibilitaLiquide': 120000, 'TotaleAttivoCircolante': 520000, 'TotaleAttivo': 1000000, 'PatrimonioNettoCapitale': 100000, 'PatrimonioNettoUtilePerditaEsercizio': 60000,
     'TotalePatrimonioNetto': 400000, 'TrattamentoFineRapportoLavoroSubordinato': 50000, 'TotaleDebiti': 550000, 'DebitiEsigibiliEntroEsercizioSuccessivo': 350000,
     'DebitiEsigibiliOltreEsercizioSuccessivo': 200000, 'TotalePassivo': 1000000, 'ValoreProduzioneRicaviVenditePrestazioni': 1500000, 'TotaleValoreProduzione': 1520000,
     'CostiProduzioneMateriePrimeSussidiarieConsumoMerci': 600000, 'CostiProduzioneServizi': 300000, 'CostiProduzionePersonaleTotaleCostiPersonale': 400000,
     'CostiProduzioneAmmortamentiSvalutazioniTotaleAmmortamentiSvalutazioni': 80000, 'TotaleCostiProduzione': 1420000, 'DifferenzaValoreCostiProduzione': 100000,
     'TotaleProventiOneriFinanziari': -12000, 'RisultatoPrimaImposte': 88000, 'ImposteRedditoEsercizioCorrentiDifferiteAnticipateTotaleImposteRedditoEsercizioCorrentiDifferiteAnticipate': 28000,
     'UtilePerditaEsercizio': 60000}
instant = {k for k in B if not k.startswith(('ValoreProduzione', 'TotaleValore', 'Costi', 'TotaleCosti', 'Differenza', 'TotaleProventi', 'Risultato', 'Imposte', 'Utile'))}
facts = '\n'.join(f'  <itcc-ci:{k} contextRef="{"i2025" if k in instant else "d2025"}" unitRef="eur" decimals="0">{v}</itcc-ci:{k}>' for k, v in B.items())
xbrl = f'''<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:itcc-ci="http://www.infocamere.it/itnn/fr/itcc/ci/2018-11-04">
  <link:schemaRef xlink:type="simple" xlink:href="itcc-ci-2018-11-04.xsd"/>
  <xbrli:context id="i2025"><xbrli:entity><xbrli:identifier scheme="http://www.infocamere.it">01234567897</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>
  <xbrli:context id="d2025"><xbrli:entity><xbrli:identifier scheme="http://www.infocamere.it">01234567897</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:unit id="eur"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>
  <itcc-ci:DatiAnagraficiDenominazione contextRef="d2025">PROVA BILANCI SRL</itcc-ci:DatiAnagraficiDenominazione>
  <itcc-ci:DatiAnagraficiCodiceFiscale contextRef="d2025">01234567897</itcc-ci:DatiAnagraficiCodiceFiscale>
{facts}
</xbrli:xbrl>
'''
(D / 'bilancio.xbrl').write_text(xbrl, encoding='utf-8')
GT['bilancio'] = {'valori': B, 'denominazione': 'PROVA BILANCI SRL', 'roe': B['UtilePerditaEsercizio'] / B['TotalePatrimonioNetto'], 'ebit': B['DifferenzaValoreCostiProduzione']}
json.dump(GT, open(D / 'gt.json', 'w'), ensure_ascii=False, indent=1)
