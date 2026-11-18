#!/usr/bin/env python3
"""File di prova per i servizi per professione. Tutti i dati sono INVENTATI (nomi, codici fiscali, IBAN di prova)."""
import pathlib
from reportlab.lib.pagesizes import A4, A1, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(__file__).resolve().parent / 'fixtures'
OUT.mkdir(exist_ok=True)

# ---------- codice fiscale inventato con il carattere di controllo giusto ----------
ODD = {**{str(i): v for i, v in enumerate([1, 0, 5, 7, 9, 13, 15, 17, 19, 21])},
       **dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ', [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]))}
def even(c): return int(c) if c.isdigit() else ord(c) - 65
def cf(base15):
    s = sum(ODD[c] if i % 2 == 0 else even(c) for i, c in enumerate(base15))
    return base15 + chr(65 + s % 26)

def eur(v):
    s = f'{abs(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return ('-' if v < 0 else '') + s

def estratto():
    c = canvas.Canvas(str(OUT / 'estratto-conto.pdf'), pagesize=A4); W, H = A4
    movs = [('02/03/2026', '02/03/2026', ['BONIFICO A FAVORE DI DITTA ESEMPIO SRL', 'CAUSALE FATTURA 12/2026'], -1220.00),
            ('03/03/2026', '01/03/2026', ['ACCREDITO STIPENDIO MARZO', 'ORD: AZIENDA FITTIZIA SPA'], 2150.40),
            ('05/03/2026', '05/03/2026', ['PAGAMENTO POS SUPERMERCATO PROVA'], -86.35),
            ('07/03/2026', '07/03/2026', ['ADDEBITO SDD UTENZA LUCE', 'MANDATO 123456'], -64.10),
            ('10/03/2026', '10/03/2026', ['PRELIEVO ATM'], -200.00),
            ('15/03/2026', '16/03/2026', ['PAGAMENTO F24 DELEGA'], -312.00),
            ('20/03/2026', '20/03/2026', ['BONIFICO DA CLIENTE ESEMPIO', 'RIF. FATTURA 8/2026'], 950.00),
            ('31/03/2026', '31/03/2026', ['COMMISSIONI E SPESE TENUTA CONTO'], -4.50),
            ('31/03/2026', '31/03/2026', ['IMPOSTA DI BOLLO'], -8.55)] * 3
    ini = 5000.00
    y = H - 60
    def head():
        nonlocal y
        c.setFont('Helvetica-Bold', 14); c.drawString(40, y, 'ESTRATTO CONTO CORRENTE - Banca di Prova'); y -= 18
        c.setFont('Helvetica', 9); c.drawString(40, y, 'Periodo dal 01/03/2026 al 31/03/2026   IBAN IT60 X054 2811 1010 0000 0123 456'); y -= 26
        c.setFont('Helvetica-Bold', 9)
        for x, t in [(40, 'Data'), (95, 'Valuta'), (150, 'Descrizione operazioni'), (420, 'Dare'), (495, 'Avere')]: c.drawString(x, y, t)
        y -= 16; c.setFont('Helvetica', 9)
    head()
    c.drawString(150, y, 'SALDO INIZIALE'); c.drawRightString(540, y, eur(ini)); y -= 16
    tot = ini
    for d, v, desc, a in movs:
        if y < 90:
            c.drawString(150, 50, 'Pagina ' + str(c.getPageNumber())); c.showPage(); y = H - 60; head()
        c.drawString(40, y, d); c.drawString(95, y, v); c.drawString(150, y, desc[0])
        c.drawRightString(445 if a < 0 else 520, y, eur(abs(a)))
        for extra in desc[1:]: y -= 11; c.drawString(150, y, extra)
        y -= 15; tot += a
    c.drawString(150, y - 6, 'SALDO FINALE'); c.drawRightString(540, y - 6, eur(round(tot, 2)))
    c.save()

def f24():
    c = canvas.Canvas(str(OUT / 'f24.pdf'), pagesize=A4); W, H = A4; y = H - 50
    c.setFont('Helvetica-Bold', 13); c.drawString(40, y, 'MODELLO DI PAGAMENTO UNIFICATO F24'); y -= 22
    c.setFont('Helvetica', 8); c.drawString(40, y, 'CODICE FISCALE'); c.setFont('Helvetica', 10); c.drawString(140, y, cf('RSSMRA80A01H501')); y -= 16
    c.setFont('Helvetica', 8); c.drawString(40, y, 'cognome, denominazione o ragione sociale'); y -= 12
    c.setFont('Helvetica', 10); c.drawString(40, y, 'ROSSI MARIO'); y -= 26
    def section(title, header, rows):
        nonlocal y
        c.setFont('Helvetica-Bold', 10); c.drawString(40, y, title); y -= 14
        c.setFont('Helvetica', 7)
        for x, t in header: c.drawString(x, y, t)
        y -= 14; c.setFont('Helvetica', 10)
        for r in rows:
            for x, t in r[:-2]: c.drawString(x, y, t)
            if r[-2]: c.drawRightString(470, y, eur(r[-2]))
            if r[-1]: c.drawRightString(555, y, eur(r[-1]))
            y -= 14
        y -= 8
    hdr = [(40, 'codice tributo'), (110, 'rateazione/mese rif.'), (200, 'anno di riferimento'), (395, 'importi a debito versati'), (480, 'importi a credito compensati')]
    section('SEZIONE ERARIO', hdr, [[(40, '1001'), (110, '0003'), (200, '2026'), 1450.00, 0], [(40, '1040'), (110, '0003'), (200, '2026'), 380.00, 0], [(40, '6099'), (110, ''), (200, '2025'), 0, 200.00]])
    section('SEZIONE INPS', [(40, 'codice sede'), (100, 'causale contributo'), (180, 'matricola INPS'), (290, 'periodo da / a'), (395, 'importi a debito versati'), (480, 'importi a credito compensati')],
            [[(40, '5100'), (100, 'DM10'), (180, '5100123456'), (290, '03/2026'), (340, '03/2026'), 900.50, 0]])
    section('SEZIONE REGIONI', [(40, 'codice regione'), (110, 'codice tributo'), (200, 'rateazione'), (260, 'anno'), (395, 'importi a debito versati'), (480, 'importi a credito compensati')],
            [[(40, '08'), (110, '3802'), (200, '0003'), (260, '2026'), 45.20, 0]])
    section('SEZIONE IMU E ALTRI TRIBUTI LOCALI', [(40, 'codice ente'), (110, 'codice tributo'), (200, 'rateazione'), (260, 'anno'), (395, 'importi a debito versati'), (480, 'importi a credito compensati')],
            [[(40, 'H501'), (110, '3918'), (200, '0101'), (260, '2026'), 612.00, 0]])
    c.setFont('Helvetica-Bold', 10); c.drawString(40, y, 'SALDO FINALE'); c.drawRightString(555, y, eur(1450 + 380 - 200 + 900.50 + 45.20 + 612)); y -= 20
    c.setFont('Helvetica', 9); c.drawString(40, y, 'Data del versamento 16/04/2026')
    c.save()

def redditi():
    c = canvas.Canvas(str(OUT / 'redditi-pf.pdf'), pagesize=A4); W, H = A4; y = H - 50
    c.setFont('Helvetica-Bold', 13); c.drawString(40, y, 'REDDITI 2026 PERSONE FISICHE - Periodo d\'imposta 2025'); y -= 18
    c.setFont('Helvetica', 9); c.drawString(40, y, 'Codice fiscale ' + cf('VRDLGU75C12F205')); y -= 30
    c.setFont('Helvetica-Bold', 10); c.drawString(40, y, 'QUADRO RN - Determinazione dell\'IRPEF'); y -= 26
    rows = [('RN1', 'Reddito complessivo', [(1, 300, '34.512'), (5, 470, '34.512')]), ('RN4', 'Imposta lorda', [(1, 470, '8.937')]),
            ('RN26', 'Imposta netta', [(1, 470, '6.120')]), ('RN33', 'Ritenute totali', [(4, 470, '6.800')])]
    for rigo, desc, vals in rows:
        c.setFont('Helvetica', 5.5)
        for col, x, v in vals: c.drawString(x - 30, y + 9, str(col))
        c.setFont('Helvetica', 9); c.drawString(40, y, rigo); c.drawString(80, y, desc)
        for col, x, v in vals: c.drawRightString(x + 40, y, v)
        y -= 30
    c.save()

def visura_camerale():
    c = canvas.Canvas(str(OUT / 'visura-camerale.pdf'), pagesize=A4); W, H = A4; y = H - 50
    c.setFont('Helvetica-Bold', 13); c.drawString(40, y, 'VISURA ORDINARIA SOCIETA\' DI CAPITALE'); y -= 16
    c.setFont('Helvetica', 9); c.drawString(40, y, 'Camera di Commercio di Prova - Registro delle Imprese'); y -= 28
    cfi = cf('BNCLRA85M41L219')
    items = [('Denominazione', 'ESEMPIO SOLUZIONI S.R.L.'), ('Forma giuridica', 'societa\' a responsabilita\' limitata'), ('Codice fiscale', '01234567897'),
             ('Partita IVA', '01234567897'), ('Numero REA', 'RM - 1234567'), ('Indirizzo Sede legale', 'ROMA (RM) VIA DELLE PROVE 10 CAP 00100'),
             ('Domicilio digitale/PEC', 'esempiosoluzioni@pec.esempio.it'), ('Data atto di costituzione', '12/05/2015'), ('Capitale sociale', 'Sottoscritto 10.000,00 Versato 10.000,00'),
             ('Codice ATECO', '62.01 - Produzione di software non connesso all\'edizione'), ('Stato attivita\'', 'attiva'), ('Addetti', '7')]
    for k, v in items:
        c.setFont('Helvetica-Bold', 9); c.drawString(40, y, k); c.setFont('Helvetica', 9); c.drawString(200, y, v); y -= 16
    y -= 16; c.setFont('Helvetica-Bold', 10); c.drawString(40, y, 'Amministratori'); y -= 18
    c.setFont('Helvetica', 9); c.drawString(40, y, 'BIANCHI LAURA'); y -= 13
    c.drawString(40, y, 'Codice fiscale: ' + cfi); y -= 13
    c.drawString(40, y, 'Amministratore Unico nominato con atto del 12/05/2015'); y -= 13
    c.save()

def visura_catastale():
    c = canvas.Canvas(str(OUT / 'visura-catastale.pdf'), pagesize=landscape(A4)); W, H = landscape(A4); y = H - 50
    c.setFont('Helvetica-Bold', 12); c.drawString(40, y, 'Visura per soggetto - Agenzia delle Entrate - Catasto Fabbricati'); y -= 18
    c.setFont('Helvetica', 9); c.drawString(40, y, 'Unita\' immobiliari site nel Comune di ROMA (Codice: H501) Provincia di ROMA'); y -= 26
    c.setFont('Helvetica-Bold', 8)
    for x, t in [(40, 'N.'), (60, 'Foglio'), (100, 'Particella'), (150, 'Sub'), (190, 'Zona Cens.'), (250, 'Categoria'), (305, 'Classe'), (350, 'Consistenza'), (420, 'Superficie Catastale'), (540, 'Rendita')]: c.drawString(x, y, t)
    y -= 16; c.setFont('Helvetica', 9)
    for n, (fo, pa, sub, catg, cl, cons, sup, rend) in enumerate([('123', '456', '7', 'A/2', '3', '5,5 vani', 'Totale: 110 m²', '568,10'), ('123', '456', '12', 'C/6', '2', '18 m²', 'Totale: 20 m²', '74,37')], 1):
        for x, t in [(40, str(n)), (60, fo), (100, pa), (150, sub), (190, '1'), (250, catg), (305, cl), (350, cons), (420, sup), (540, 'Euro ' + rend)]: c.drawString(x, y, t)
        y -= 12; c.drawString(60, y, 'Indirizzo VIA DELLE PROVE n. 10 Piano 2'); y -= 18
    y -= 10; c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'INTESTATI'); y -= 14; c.setFont('Helvetica', 9)
    c.drawString(40, y, '1 ROSSI MARIO nato a ROMA il 01/01/1980 ' + cf('RSSMRA80A01H501') + ' (1) Proprieta\' 1/2'); y -= 13
    c.drawString(40, y, '2 VERDI ANNA nata a ROMA il 03/04/1982 ' + cf('VRDNNA82D43H501') + ' (1) Proprieta\' 1/2')
    c.save()

def visura_ri():
    """visura ordinaria del Registro Imprese (InfoCamere): etichette e valori a metà pagina, valori su più righe (dati inventati)"""
    c = canvas.Canvas(str(OUT / 'visura-ri.pdf'), pagesize=A4); W, H = A4
    def foot(n): c.setFont('Helvetica', 7); c.drawString(40, 30, "Visura ordinaria societa' di capitale - %d di 3" % n)
    c.setFont('Helvetica', 8); c.drawString(250, H - 40, 'Camera di Commercio di Prova'); c.drawString(250, H - 50, 'Registro Imprese - Archivio ufficiale della CCIAA')
    c.setFont('Helvetica-Bold', 11); c.drawString(110, H - 110, "VISURA ORDINARIA SOCIETA' DI CAPITALE")
    c.setFont('Helvetica-Bold', 10); c.drawString(110, H - 135, '"PROVA E PROVE'); c.drawString(110, H - 160, "SOCIETA' A RESPONSABILITA'"); c.drawString(110, H - 185, 'LIMITATA"')
    c.setFont('Helvetica', 7); c.drawString(260, H - 280, 'ABCXYZ')
    c.setFont('Helvetica-Bold', 8); c.drawString(330, H - 130, 'DATI ANAGRAFICI'); c.setFont('Helvetica', 8)
    y = H - 145
    rows = [('Indirizzo Sede legale', ['ROMA (RM) VIA', 'DELLE PROVE', '10 CAP 00100']), ('Domicilio digitale/PEC', None), ('Numero REA', ['RM - 123456']), ('Codice fiscale e n.iscr. al', ['01234567897']), ('Registro Imprese', None),
            ('Partita IVA', ['01234567897']), ('Forma giuridica', ["societa' a responsabilita' limitata"]), ('Data atto di costituzione', ['10/01/2010']), ('Data iscrizione', ['15/01/2010'])]
    for lab, vals in rows:
        c.drawString(330, y, lab)
        if lab == 'Domicilio digitale/PEC':
            y -= 13; c.drawString(420, y, 'provaeprovesrl@pecprov'); c.drawString(110, y - 3, ''); y -= 13; c.drawString(420, y, 'a.it'); y -= 13; continue
        if vals:
            for k, v in enumerate(vals): c.drawString(420, y - 13 * k, v)
            y -= 13 * len(vals)
        else: y -= 13
    y = H - 330; c.setFont('Helvetica-Bold', 8); c.drawString(40, y, "ATTIVITA'"); c.drawString(330, y, "L'IMPRESA IN CIFRE"); c.setFont('Helvetica', 8); y -= 14
    for (l1, v1), (l2, v2) in zip([('Stato attività', 'attiva'), ('Data inizio attività', '01/02/2010'), ('Codice ATECO', '62.01.00')], [('Capitale sociale', '10.000,00'), ('Addetti al 31/12/2025', '3'), ('Amministratori', '2')]):
        c.drawString(40, y, l1); c.drawString(150, y, v1); c.drawString(330, y, l2); c.drawString(450, y, v2); y -= 14
    foot(1); c.showPage()
    y = H - 60
    c.setFont('Helvetica-Bold', 10); c.drawString(40, y, ' 4 Soci e titolari di diritti su azioni e quote'); y -= 24; c.setFont('Helvetica', 8)
    soci = [('6.000,00', [('ROSSI MARIO', cf('RSSMRA80A01H501'), None)]), ('4.000,00', [('VERDI ANNA', cf('VRDNNA82D43H501'), '1/2'), ('BIANCHI LUCA', cf('BNCLCU85M01H501'), '1/2')])]
    for q, persons in soci:
        c.drawString(40, y, "Proprieta'"); c.drawString(200, y, 'Quota di nominali: %s Euro' % q); y -= 12; c.drawString(200, y, 'Di cui versati: %s' % q); y -= 14
        for n, code, rag in persons:
            c.drawString(40, y, n); c.drawString(200, y, 'Codice fiscale: ' + code); y -= 12; c.drawString(200, y, "Tipo di diritto: proprieta'"); y -= 12
            if rag: c.drawString(200, y, 'In ragione di ' + rag); y -= 12
            y -= 8
        y -= 10
    y -= 10; c.setFont('Helvetica-Bold', 10); c.drawString(40, y, ' 5 Amministratori'); y -= 24; c.setFont('Helvetica', 8)
    c.drawString(40, y, 'Amministratore Unico'); y -= 12; c.drawString(40, y, 'ROSSI MARIO'); c.drawString(200, y, "Rappresentante dell'impresa"); y -= 12
    c.drawString(200, y, 'Nato a ROMA (RM) il 01/01/1980'); y -= 12; c.drawString(200, y, 'Codice fiscale: ' + cf('RSSMRA80A01H501')); y -= 16
    c.drawString(40, y, 'carica'); c.drawString(200, y, 'amministratore unico'); y -= 12; c.drawString(200, y, 'Data atto di nomina: 10/01/2010'); y -= 24
    c.drawString(40, y, 'Procuratore'); y -= 12; c.drawString(40, y, 'NERI PAOLO'); c.drawString(200, y, 'Nato a MILANO (MI) il 15/02/1990'); y -= 12
    c.drawString(200, y, 'Codice fiscale: ' + cf('NREPLA90B15F205'))
    foot(2); c.showPage(); y = H - 60; c.setFont('Helvetica', 8)
    c.drawString(40, y, 'carica'); c.drawString(200, y, 'procuratore'); y -= 12; c.drawString(200, y, 'Data atto di nomina: 03/03/2024'); y -= 30
    c.setFont('Helvetica-Bold', 10); c.drawString(40, y, ' 6 Sindaci, membri organi di controllo'); y -= 24; c.setFont('Helvetica', 8)
    c.drawString(40, y, 'Revisore Legale'); y -= 12; c.drawString(40, y, 'GIALLI SARA'); c.drawString(200, y, 'Nato a TORINO (TO) il 12/05/1992'); y -= 12; c.drawString(200, y, 'Codice fiscale: ' + cf('GLLSRA92E52L219')); y -= 16
    c.drawString(40, y, 'carica'); c.drawString(200, y, 'revisore legale'); y -= 12; c.drawString(200, y, 'Data atto di nomina: 20/06/2023')
    foot(3); c.save()

def visura_soggetto():
    """formato attuale «Visura attuale per soggetto»: un blocco per immobile su due colonne (dati inventati)"""
    c = canvas.Canvas(str(OUT / 'visura-soggetto.pdf'), pagesize=A4); W, H = A4
    imm = [('12', '345', '2', 'C/2', '4', '20', 'm', '23', '41,32', 'VIA DELLE PROVE n. 1 Piano T'), ('12', '345', '3', 'A/3', '3', '5,5', 'vani', '98', '355,06', 'VIA DELLE PROVE n. 1 Piano 1'), ('12', '346', '1', 'C/6', '2', '15', 'm', '17', '31,77', 'VIA DELLE PROVE n. 3 Piano T')]
    def head(pn):
        c.setFont('Helvetica', 8); c.drawString(40, H - 40, 'Direzione Provinciale di Prova'); c.drawString(380, H - 40, 'Data: 01/02/2026'); c.drawString(40, H - 52, 'Ufficio Provinciale - Territorio'); c.drawString(380, H - 52, 'Pag: %d - Segue' % pn); c.drawString(40, H - 64, 'Servizi Catastali')
    head(1); y = H - 110
    c.setFont('Helvetica-Bold', 12); c.drawString(170, y, 'Visura attuale per soggetto'); y -= 30
    c.setFont('Helvetica', 9); c.drawString(40, y, 'Fabbricati siti nel comune di PAESE DI PROVA (Z999) provincia PROVA'); y -= 20
    c.drawString(60, y, 'Soggetto richiesto: ROSSI Mario (CF: ' + cf('RSSMRA80A01H501') + ')'); y -= 14; c.drawString(60, y, 'Totali immobili: di catasto fabbricati 3'); y -= 26
    pn = 1
    for n, (fo, pa, sub, cat, cl, cons, un, sup, rend, ind) in enumerate(imm, 1):
        if y < 330: c.showPage(); pn += 1; head(pn); y = H - 100
        c.setFont('Helvetica-Bold', 9); c.drawString(60, y, 'Immobile di catasto fabbricati - n.%d' % n); c.setFont('Helvetica', 8); c.drawString(310, y, 'Causali di aggiornamento ed annotazioni'); y -= 22
        c.setFont('Helvetica-Bold', 9); c.drawString(45, y, 'Dati identificativi'); y -= 13; c.setFont('Helvetica', 9)
        c.drawString(45, y, 'Comune di PAESE DI PROVA (Z999) (PR)'); c.drawString(310, y, 'COSTITUZIONE del 01/04/2003 Pratica n. 123'); y -= 13
        c.drawString(45, y, 'Foglio %s Particella %s Subalterno %s' % (fo, pa, sub)); y -= 22
        c.setFont('Helvetica-Bold', 9); c.drawString(45, y, 'Indirizzo'); y -= 13; c.setFont('Helvetica', 9); c.drawString(45, y, ind); c.drawString(310, y, 'VARIAZIONE TOPONOMASTICA del 02/09/2025'); y -= 22
        c.setFont('Helvetica-Bold', 9); c.drawString(45, y, 'Dati di classamento'); y -= 13; c.setFont('Helvetica', 9)
        c.drawString(45, y, 'Rendita: Euro ' + rend); c.drawString(310, y, 'COSTITUZIONE del 01/04/2003'); y -= 13
        if un == 'm': c.drawString(45, y, 'Categoria %sa), Classe %s, Consistenza %s m' % (cat, cl, cons)); c.setFont('Helvetica', 6); c.drawString(45 + c.stringWidth('Categoria %sa), Classe %s, Consistenza %s m' % (cat, cl, cons), 'Helvetica', 9), y + 4, '2'); c.setFont('Helvetica', 9)
        else: c.drawString(45, y, 'Categoria %sc), Classe %s, Consistenza %s vani' % (cat, cl, cons))
        y -= 22; c.setFont('Helvetica-Bold', 9); c.drawString(45, y, 'Dati di superficie'); y -= 13; c.setFont('Helvetica', 9); c.drawString(45, y, 'Totale: %s m' % sup); c.setFont('Helvetica', 6); c.drawString(45 + c.stringWidth('Totale: %s m' % sup, 'Helvetica', 9), y + 4, '2'); c.setFont('Helvetica', 9); y -= 22
        c.drawString(45, y, "Intestazione attuale dell'immobile n. %d - totale righe intestati: 1" % n); y -= 16
        c.drawString(45, y, '1. ROSSI Mario'); c.drawString(310, y, "1. VOLTURA D'UFFICIO del 06/04/2009"); y -= 12; c.drawString(45, y, '(CF ' + cf('RSSMRA80A01H501') + ')'); y -= 12
        c.drawString(45, y, 'nato a ROMA (RM) il 01/01/1980'); y -= 12; c.drawString(45, y, "Diritto di: Proprieta' per 1000/1000"); y -= 30
    c.drawString(45, y, 'Totale immobili: 3 Rendita: euro 428,15 Vani: 5,5 Superficie: 35 m2')
    c.save()

def referto(name, date, vals):
    c = canvas.Canvas(str(OUT / name), pagesize=A4); W, H = A4; y = H - 50
    c.setFont('Helvetica-Bold', 13); c.drawString(40, y, 'LABORATORIO ANALISI DI PROVA - REFERTO'); y -= 16
    c.setFont('Helvetica', 9); c.drawString(40, y, 'Data prelievo ' + date); y -= 28
    c.setFont('Helvetica-Bold', 9)
    for x, t in [(40, 'Esame'), (230, 'Risultato'), (320, 'Unita\' di misura'), (430, 'Valori di riferimento')]: c.drawString(x, y, t)
    y -= 16; c.setFont('Helvetica', 9)
    for e, v, u, r in vals:
        c.drawString(40, y, e); c.drawRightString(280, y, v); c.drawString(320, y, u); c.drawString(430, y, r); y -= 15
    c.save()

def fatture_multiple():
    c = canvas.Canvas(str(OUT / 'fatture-multiple.pdf'), pagesize=A4); W, H = A4
    for num, data, cli, pages, tot in [('12/2026', '05/03/2026', 'CLIENTE ALFA SRL', 2, '1.220,00'), ('13/2026', '07/03/2026', 'CLIENTE BETA SNC', 1, '305,00'), ('14/2026', '09/03/2026', 'CLIENTE GAMMA SPA', 2, '2.440,00')]:
        for p in range(1, pages + 1):
            c.setFont('Helvetica-Bold', 14); c.drawString(40, H - 60, f'FATTURA n. {num} del {data}')
            c.setFont('Helvetica', 10); c.drawString(40, H - 80, 'Fornitore: DITTA ESEMPIO SRL - P.IVA 01234567897'); c.drawString(40, H - 96, 'Cliente: ' + cli)
            c.drawString(40, H - 130, 'Descrizione delle prestazioni e dei beni ceduti.' if p == 1 else 'Seguito delle righe della fattura.')
            if p == pages: c.drawString(40, 140, 'Totale documento euro ' + tot); c.drawString(40, 124, 'IBAN IT60X0542811101000000123456')
            c.setFont('Helvetica', 8); c.drawString(480, 40, f'Pagina {p} di {pages}')
            c.showPage()
    c.save()

def cedolini():
    c = canvas.Canvas(str(OUT / 'cedolini.pdf'), pagesize=A4); W, H = A4
    for nome, base in [('NERI PAOLO', 'NREPLA90B15F205'), ('GIALLI SARA', 'GLLSRA92E52L219'), ('BLU MARCO', 'BLUMRC88H20H501')]:
        c.setFont('Helvetica-Bold', 13); c.drawString(40, H - 60, 'CEDOLINO PAGA - MARZO 2026')
        c.setFont('Helvetica', 10); c.drawString(40, H - 80, 'Azienda: AZIENDA FITTIZIA SPA - C.F. 01234567897')
        c.drawString(40, H - 100, f'Dipendente: {nome} - Codice fiscale {cf(base)}')
        c.drawString(40, H - 140, 'Netto in busta 1.650,00')
        c.showPage()
    c.save()

def tavola():
    c = canvas.Canvas(str(OUT / 'tavola-a1.pdf'), pagesize=landscape(A1)); W, H = landscape(A1)
    c.setLineWidth(1.2)
    # pianta: un rettangolo di 10 m × 6 m in scala 1:100 (100 mm × 60 mm sul foglio)
    x0, y0 = 200, 300
    c.rect(x0, y0, 100 * mm, 60 * mm)
    c.line(x0, y0 - 20, x0 + 50 * mm, y0 - 20)   # quota di 5 m
    c.setFont('Helvetica', 14); c.drawString(x0, y0 - 40, 'quota 5,00 m')
    c.setFont('Helvetica-Bold', 20); c.drawString(W - 400, 80, 'TAVOLA 01 - PIANTA PIANO TERRA'); c.setFont('Helvetica', 16); c.drawString(W - 400, 56, 'SCALA 1:100')
    for i in range(0, int(W), 200): c.setStrokeGray(0.8); c.line(i, 0, i, H)
    c.save()

def tesi():
    c = canvas.Canvas(str(OUT / 'tesi.pdf'), pagesize=A4); W, H = A4
    c.setFont('Times-Bold', 18); c.drawCentredString(W / 2, H - 200, 'UNIVERSITA\' DEGLI STUDI DI PROVA'); c.setFont('Times-Roman', 14); c.drawCentredString(W / 2, H - 260, 'Tesi di laurea'); c.showPage()
    text = ('La presente tesi analizza un caso di studio inventato per verificare il controllo del formato. ' * 3).strip()
    for p in range(2, 7):
        c.setFont('Times-Roman', 12); y = H - 72
        words = (text + ' ') * 12; line = ''
        for w in words.split():
            if c.stringWidth(line + ' ' + w, 'Times-Roman', 12) > W - 99 * mm / 1 - 0 and False: pass
            if c.stringWidth(line + ' ' + w, 'Times-Roman', 12) > W - 35 * mm - 25 * mm:
                c.drawString(35 * mm, y, line); y -= 18; line = w
                if y < 25 * mm + 20: break
            else: line = (line + ' ' + w).strip()
        c.drawCentredString(W / 2, 15 * mm, str(p)); c.showPage()
    c.save()

def timbro():
    im = Image.new('RGB', (600, 600), (250, 248, 240)); d = ImageDraw.Draw(im)
    d.ellipse((60, 60, 540, 540), outline=(30, 60, 160), width=14); d.ellipse((120, 120, 480, 480), outline=(30, 60, 160), width=6)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
    except Exception: f = ImageFont.load_default()
    d.text((300, 300), 'PROVA', fill=(30, 60, 160), font=f, anchor='mm')
    for x, y in [(20, 30), (570, 580), (300, 20)]: d.ellipse((x, y, x + 4, y + 4), fill=(120, 120, 120))   # macchioline da togliere
    im.save(OUT / 'timbro.png')

def moduli():
    """modulo senza campi (nativo) e la sua «scansione»: righe, codice fiscale a trattini, caselle grigie, riquadro con testo, tabelle"""
    path = OUT / 'modulo-nativo.pdf'
    c = canvas.Canvas(str(path), pagesize=A4); W, H = A4
    c.setFont('Times-Bold', 11); c.rect(420, H - 70, 130, 34); c.rect(423, H - 67, 124, 28); c.drawCentredString(485, H - 52, 'MODELLO DI PROVA'); c.drawCentredString(485, H - 63, 'ANNO 2026')
    c.setFont('Helvetica-Bold', 9); c.rect(40, H - 150, 515, 40); c.line(130, H - 150, 130, H - 110); c.drawString(48, H - 125, 'OGGETTO:')
    c.setFont('Helvetica-Bold', 8.5)
    for k, t in enumerate(['Domanda di prova per verificare il riconoscimento dei campi in un modulo', 'senza campi compilabili: questo riquadro contiene solo testo stampato.']): c.drawString(136, H - 122 - k * 11, t)
    c.setFont('Helvetica', 10); y = H - 185
    def row(parts):
        nonlocal y
        x = 40
        for kind, v in parts:
            if kind == 't': c.drawString(x, y, v); x += c.stringWidth(v, 'Helvetica', 10) + 3
            else: c.line(x, y - 2, x + v, y - 2); x += v + 6
        y -= 18
    row([('t', 'Il/la sottoscritto/a (cognome e nome)'), ('l', 330)])
    row([('t', 'nato/a a'), ('l', 200), ('t', 'prov.'), ('l', 30), ('t', 'il'), ('l', 120)])
    row([('t', 'residente a'), ('l', 230), ('t', 'c.a.p.'), ('l', 60)])
    c.drawString(40, y, 'codice fiscale'); x = 115
    for k in range(16): c.line(x, y - 2, x + 11, y - 2); x += 15
    c.drawString(x + 6, y, 'cell. n.'); c.line(x + 45, y - 2, 550, y - 2); y -= 26
    c.drawString(40, y, 'in qualità di:'); y -= 16
    for t in ['Proprietario', 'Contitolare', 'Delegato']:
        c.setStrokeGray(0.55); c.rect(42, y - 1, 7, 7); c.setStrokeGray(0); c.drawString(58, y, t); y -= 14
    y -= 14; c.setFont('Helvetica-Bold', 10); c.drawString(40, y, 'Anno 2026:'); y -= 6
    c.setFont('Helvetica-Bold', 9); tx = [40, 210, 380, 555]
    for r in range(3): c.line(40, y - r * 20, 555, y - r * 20)
    for x in tx: c.line(x, y, x, y - 40)
    for k, t in enumerate(['Importo dovuto', 'Importo versato', 'Differenza']): c.drawString(tx[k] + 4, y - 14, t)
    y -= 70; c.setFont('Helvetica', 10)
    c.line(40, y, 200, y); c.drawString(205, y + 2, ', lì'); c.line(225, y, 330, y); c.drawString(400, y + 14, 'Firma'); c.line(380, y, 550, y)
    c.save()
    # «scansione»: la stessa pagina come immagine grigia, un po' sporca e storta
    import subprocess, random
    subprocess.run(['pdftoppm', '-r', '150', '-gray', '-png', str(path), str(OUT / '_mod')], check=True)
    im = Image.open(OUT / '_mod-1.png').convert('L')
    px = im.load(); random.seed(7)
    for _ in range(4000): px[random.randrange(im.width), random.randrange(im.height)] = random.randrange(180, 240)
    im = im.point(lambda v: min(255, int(v * 0.93 + 14))).rotate(0.35, fillcolor=245)
    im.save(OUT / 'modulo-scansione.pdf', 'PDF', resolution=150)
    # «scansione mista»: la stessa scansione con i dati scritti dopo al computer (testo vero sopra l'immagine)
    im.save(OUT / '_mod-s.png')
    c = canvas.Canvas(str(OUT / 'scansione-mista.pdf'), pagesize=A4)
    c.drawImage(str(OUT / '_mod-s.png'), 0, 0, W, H)
    c.setFont('Helvetica', 11); c.setFillColorRGB(0.05, 0.1, 0.55)
    for x, yy, t in [(250, H - 183, 'Bianchi Prova Lucia'), (90, H - 201, 'Torino'), (450, H - 201, '01/02/1980'), (110, H - 219, 'Torino'), (380, H - 219, '10100')]: c.drawString(x, yy, t)
    c.save()
    # «scansione con firma e timbro»: la stessa scansione con una firma a mano e un timbro tondo (oggetti da spostare)
    from PIL import ImageDraw
    im2 = Image.open(OUT / '_mod-s.png').convert('RGB'); d2 = ImageDraw.Draw(im2); k = 150 / 72
    pts = [(400 + t * 1.5, 760 - 8 * __import__('math').sin(t / 6) - (t % 23) * 0.4) for t in range(0, 95)]
    d2.line([(x * k, y * k) for x, y in pts], fill=(25, 35, 110), width=3)
    d2.line([((410 + t) * k, (752 + 6 * __import__('math').cos(t / 4)) * k) for t in range(0, 40)], fill=(25, 35, 110), width=3)
    cx, cy, r = 150 * k, 700 * k, 34 * k
    d2.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(150, 30, 40), width=4); d2.ellipse([cx - r * 0.72, cy - r * 0.72, cx + r * 0.72, cy + r * 0.72], outline=(150, 30, 40), width=2)
    d2.line([(cx - r * 0.5, cy), (cx + r * 0.5, cy)], fill=(150, 30, 40), width=3)
    im2.save(OUT / 'scansione-firma.pdf', 'PDF', resolution=150)
    (OUT / '_mod-1.png').unlink(); (OUT / '_mod-s.png').unlink()

estratto(); f24(); redditi(); visura_camerale(); visura_catastale(); visura_soggetto(); visura_ri()
referto('referto-1.pdf', '10/01/2026', [('Emoglobina', '13,1', 'g/dL', '12,0 - 16,0'), ('Glucosio', '112', 'mg/dL', '70 - 100'), ('Colesterolo totale', '185', 'mg/dL', '< 200'), ('Creatinina', '0,6', 'mg/dL', '0,7 - 1,2'), ('Piastrine', '250', 'x10^3/uL', '150 - 400')])
referto('referto-2.pdf', '12/04/2026', [('Emoglobina', '13,6', 'g/dL', '12,0 - 16,0'), ('Glucosio', '96', 'mg/dL', '70 - 100'), ('Colesterolo totale', '210', 'mg/dL', '< 200'), ('Creatinina', '0,8', 'mg/dL', '0,7 - 1,2'), ('Piastrine', '240', 'x10^3/uL', '150 - 400')])
fatture_multiple(); cedolini(); tavola(); tesi(); timbro(); moduli()
print('ok')
