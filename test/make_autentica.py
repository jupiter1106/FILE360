# PDF di prova per «Verifica di autenticità», scritti a mano byte per byte (nessun dato reale):
#   autentica-originale.pdf      una fattura salvata una volta sola: nessun segno
#   autentica-modificata.pdf     la stessa fattura con un salvataggio in coda: l'importo coperto da un riquadro bianco e
#                                riscritto con un'altra copia del carattere, un po' fuori riga, metadati di iLovePDF
#   autentica-firmata.pdf        un contratto «firmato» (firma finta: conta solo fin dove arriva) e poi cambiato
#   autentica-scansione.pdf      una scansione con un riquadro bianco e una cifra scritta sopra
import os, zlib
OUT = os.path.join(os.path.dirname(__file__), 'fixtures')


def pdf_str(s):
    return '(' + s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ')'


def scrivi(objs, root, info, base=b'', prev=None, start_num=1, size=None, extra_trailer=''):
    """objs: {numero: bytes}; con base/prev scrive un aggiornamento incrementale in coda a base."""
    out = bytearray(base if base else b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
    off = {}
    for n in sorted(objs):
        off[n] = len(out)
        out += f'{n} 0 obj\n'.encode() + objs[n] + b'\nendobj\n'
    x = len(out)
    if prev is None:
        nmax = max(objs)
        out += f'xref\n0 {nmax + 1}\n0000000000 65535 f \n'.encode()
        for n in range(1, nmax + 1):
            out += f'{off[n]:010d} 00000 n \n'.encode()
        size = nmax + 1
    else:
        out += b'xref\n'
        for n in sorted(objs):
            out += f'{n} 1\n{off[n]:010d} 00000 n \n'.encode()
        size = max(size, max(objs) + 1)
    out += f'trailer\n<< /Size {size} /Root {root} 0 R /Info {info} 0 R{" /Prev %d" % prev if prev is not None else ""}{extra_trailer} >>\nstartxref\n{x}\n%%EOF\n'.encode()
    return bytes(out), x, size


def stream(data, extra=''):
    return f'<< /Length {len(data)}{extra} >>\nstream\n'.encode() + data + b'\nendstream'


FONT1 = b'<< /Type /Font /Subtype /Type1 /BaseFont /ABCDEF+Helvetica /Encoding /WinAnsiEncoding >>'
FONTB = b'<< /Type /Font /Subtype /Type1 /BaseFont /GHIJKL+Helvetica-Bold /Encoding /WinAnsiEncoding >>'


def testo(x, y, s, f='F1', size=11):
    return f'BT /{f} {size} Tf {x} {y} Td {pdf_str(s)} Tj ET\n'


def fattura_contenuto():
    c = '0.93 0.95 1 rg 50 690 495 60 re f 0 0 0 rg\n'
    c += testo(60, 725, 'Alfa Forniture S.r.l.', 'F2', 16) + testo(60, 705, 'Via dei Mille 10, 20100 Milano - P.IVA 01234567897')
    c += testo(60, 650, 'FATTURA N. 128/2025 del 14/03/2025', 'F2', 13) + testo(60, 625, 'Cliente: Beta Servizi S.r.l., Via Roma 1, 10100 Torino')
    righe = [('Consulenza tecnica marzo 2025', '800,00'), ('Trasferta e rimborso spese', '183,61')]
    y = 580
    c += testo(60, y, 'Descrizione', 'F2') + testo(440, y, 'Importo', 'F2'); y -= 22
    for d, v in righe:
        c += testo(60, y, d) + testo(440, y, v + ' EUR'); y -= 20
    c += testo(60, 500, 'Imponibile: 983,61 EUR') + testo(60, 480, 'IVA 22%: 216,39 EUR')
    c += testo(60, 450, 'Totale da pagare: 1.200,00 EUR', 'F1', 13)
    c += testo(60, 410, 'Pagamento con bonifico entro il 13/04/2025 - IBAN IT60X0542811101000000123456')
    return c.encode('latin-1')


def fattura():
    objs = {
        1: b'<< /Type /Catalog /Pages 2 0 R >>',
        2: b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
        4: stream(fattura_contenuto()),
        5: FONT1, 6: FONTB,
        7: f'<< /Producer {pdf_str("Microsoft® Word per Microsoft 365")} /Creator {pdf_str("Microsoft® Word per Microsoft 365")} /CreationDate (D:20250314101200+01\'00\') /ModDate (D:20250314101200+01\'00\') /Title (Fattura 128/2025) >>'.encode('latin-1'),
    }
    return scrivi(objs, 1, 7)


def modificata(base, x, size):
    # aggiornamento in coda: un riquadro bianco sull'importo e il nuovo importo con un'altra copia di Helvetica
    over = b'q 1 1 1 rg 168 446 70 16 re f Q\n' + b'BT /F9 13 Tf 171.2 450.9 Td (7.200,00) Tj ET\n'
    objs = {
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F9 9 0 R >> >> /Contents [4 0 R 8 0 R] >>',
        8: stream(over),
        9: b'<< /Type /Font /Subtype /Type1 /BaseFont /QWERTY+Helvetica /Encoding /WinAnsiEncoding >>',
        10: f'<< /Producer (iLovePDF) /Creator {pdf_str("Microsoft® Word per Microsoft 365")} /CreationDate (D:20250314101200+01\'00\') /ModDate (D:20250402183000+02\'00\') /Title (Fattura 128/2025) >>'.encode('latin-1'),
    }
    return scrivi(objs, 1, 10, base=base, prev=x, size=size)[0]


def contratto_contenuto(canone):
    c = testo(60, 760, 'CONTRATTO DI LOCAZIONE AD USO ABITATIVO', 'F2', 14)
    for i, r in enumerate(['Tra il locatore Mario Esempio e il conduttore Luca Prova si conviene quanto segue.', 'Art. 1 - Oggetto: appartamento in Via delle Prove 3, Bologna.',
                           'Art. 2 - Durata: quattro anni dal 1/05/2025, rinnovabili per altri quattro.', f'Art. 3 - Canone mensile: {canone} EUR, da pagare entro il giorno 5 di ogni mese.',
                           'Art. 4 - Deposito cauzionale: due mensilita del canone.', 'Letto, confermato e sottoscritto.']):
        c += testo(60, 720 - i * 24, r)
    return c.encode('latin-1')


def firmata():
    SIGLEN = 2048
    ph = b'0' * (SIGLEN * 2)
    objs = {
        1: b'<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [8 0 R] /SigFlags 3 >> >>',
        2: b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R /Annots [8 0 R] >>',
        4: stream(contratto_contenuto('800,00')), 5: FONT1, 6: FONTB,
        7: b"<< /Producer (LibreOffice 7.6) /Creator (Writer) /CreationDate (D:20250420090000+02'00') /ModDate (D:20250420090000+02'00') >>",
        8: b'<< /Type /Annot /Subtype /Widget /FT /Sig /Rect [0 0 0 0] /P 3 0 R /F 132 /T (Firma1) /V 9 0 R >>',
        9: b'<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /Name (Mario Esempio) /M (D:20250420091500+02\'00\') /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents <' + ph + b'> >>',
    }
    b, x, size = scrivi(objs, 1, 7)
    b = bytearray(b)
    i = b.index(b'/Contents <' + ph[:20]) + len(b'/Contents ')
    a1, a2 = i, i + 2 + len(ph)
    br = f'[{0:010d} {a1:010d} {a2:010d} {len(b) - a2:010d}]'.encode()
    j = b.index(b'[0000000000 0000000000 0000000000 0000000000]')
    b[j:j + len(br)] = br
    b = bytes(b)
    # dopo la firma: la pagina riscritta con un canone diverso
    objs2 = {
        10: stream(contratto_contenuto('600,00')),
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 10 0 R /Annots [8 0 R] >>',
        7: b"<< /Producer (PDF-XChange Editor 9.5) /Creator (Writer) /CreationDate (D:20250420090000+02'00') /ModDate (D:20250506120000+02'00') >>",
    }
    return scrivi(objs2, 1, 7, base=b, prev=x, size=size)[0]


def scansione():
    W, H = 300, 424
    import random
    R = random.Random(7)
    px = bytearray()
    for y in range(H):
        px.append(0)
        for x in range(W):
            v = 236 + R.randint(-6, 6)
            if 40 < x < 260 and (y % 22) in (10, 11, 12) and y > 40 and y < 380 and R.random() > 0.25: v = 70 + R.randint(-20, 20)
            px.append(max(0, min(255, v)))
    img = zlib.compress(bytes(px))
    cont = b'q 595 0 0 842 0 0 cm /Im1 Do Q\n' + b'q 1 1 1 rg 330 600 110 22 re f Q\n' + b'BT /F1 13 Tf 334 606 Td (4.500,00) Tj ET\n'
    objs = {
        1: b'<< /Type /Catalog /Pages 2 0 R >>',
        2: b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>',
        4: stream(cont), 5: FONT1,
        6: f'<< /Type /XObject /Subtype /Image /Width {W} /Height {H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns {W} >> /Length {len(img)} >>\nstream\n'.encode() + img + b'\nendstream',
        7: b"<< /Producer (Scanner HP ScanJet) /CreationDate (D:20250210111100+01'00') /ModDate (D:20250210111100+01'00') >>",
    }
    return scrivi(objs, 1, 7)[0]


if __name__ == '__main__':
    b, x, size = fattura()
    open(os.path.join(OUT, 'autentica-originale.pdf'), 'wb').write(b)
    open(os.path.join(OUT, 'autentica-modificata.pdf'), 'wb').write(modificata(b, x, size))
    open(os.path.join(OUT, 'autentica-firmata.pdf'), 'wb').write(firmata())
    open(os.path.join(OUT, 'autentica-scansione.pdf'), 'wb').write(scansione())
    print('4 PDF di prova per la verifica di autenticità')
