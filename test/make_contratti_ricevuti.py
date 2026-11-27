# Contratti di prova per «Analisi di un contratto ricevuto» (nomi e dati inventati), in PDF con testo vero:
#   contratto-ricevuto-rischioso.pdf  locazione abitativa 4+4 con clausole nulle o contestabili
#   contratto-ricevuto-corretto.pdf   la stessa locazione scritta secondo la legge
#   condizioni-servizio.pdf           condizioni generali di un abbonamento con clausole vessatorie, senza doppia firma
import os
OUT = os.path.join(os.path.dirname(__file__), 'fixtures')

RISCHIOSO = """CONTRATTO DI LOCAZIONE AD USO ABITATIVO
ai sensi dell'art. 2, comma 1, della legge 9 dicembre 1998, n. 431
Tra il Sig. Mario Esempio, nato a Roma il 01/02/1960, di seguito locatore, e la Sig.ra Laura Prova, di seguito conduttore, si conviene e si stipula quanto segue.
Art. 1 - Oggetto
Il locatore concede in locazione al conduttore l'appartamento sito in Bologna, Via delle Prove 3, piano secondo, composto da tre vani e servizi, da destinare esclusivamente ad abitazione del conduttore.
Art. 2 - Durata
La locazione avra la durata di 3 (tre) anni, dal 01/05/2025 al 30/04/2028. Il locatore potra recedere dal contratto in qualsiasi momento con preavviso di tre mesi.
Art. 3 - Recesso del conduttore
Il conduttore rinuncia alla facolta di recesso anticipato per tutta la durata del contratto.
Art. 4 - Canone
Il canone annuo e convenuto in euro 9.600,00 da pagarsi in rate mensili anticipate di euro 800,00 entro il giorno 5 di ogni mese, in contanti presso il domicilio del locatore. Il locatore opta per la cedolare secca. Il canone sara aggiornato ogni anno nella misura del 100% della variazione ISTAT dei prezzi al consumo.
Art. 5 - Ritardi
In caso di ritardo nel pagamento il conduttore paghera una penale di euro 50,00 per ogni giorno di ritardo, oltre agli interessi di mora al tasso del 12% annuo. Il contratto si intendera risolto di diritto in caso di mancato pagamento anche di una sola rata del canone.
Art. 6 - Deposito cauzionale
A garanzia delle obbligazioni assunte il conduttore versa al locatore un deposito cauzionale di euro 3.200,00, pari a quattro mensilita del canone, infruttifero di interessi.
Art. 7 - Spese
Sono a carico del conduttore tutte le spese condominiali e la manutenzione straordinaria dell'immobile. L'imposta di registro e interamente a carico del conduttore.
Art. 8 - Uso
E fatto divieto al conduttore di ospitare persone non appartenenti al nucleo familiare. Il locatore non risponde in alcun caso dei danni derivanti da guasti degli impianti.
Art. 9 - Foro competente
Per qualsiasi controversia e competente in via esclusiva il foro di Milano.
Letto, confermato e sottoscritto. Bologna, 15/04/2025
"""

CORRETTO = """CONTRATTO DI LOCAZIONE AD USO ABITATIVO
ai sensi dell'art. 2, comma 1, della legge 9 dicembre 1998, n. 431
Tra il Sig. Mario Esempio, di seguito locatore, e la Sig.ra Laura Prova, di seguito conduttore, si conviene e si stipula quanto segue.
Art. 1 - Oggetto
Il locatore concede in locazione al conduttore l'appartamento sito in Bologna, Via delle Prove 3, piano secondo, da destinare ad abitazione del conduttore.
Art. 2 - Durata
Il contratto e stipulato per la durata di quattro anni, dal 01/05/2025 al 30/04/2029. Alla prima scadenza il contratto e rinnovato di diritto per un periodo di quattro anni, fatta salva la facolta di disdetta del locatore per i motivi di cui all'art. 3 della legge n. 431/1998, da comunicare con lettera raccomandata almeno sei mesi prima della scadenza.
Art. 3 - Recesso del conduttore
Il conduttore ha facolta di recedere dal contratto qualora ricorrano gravi motivi, previo avviso da recapitarsi al locatore con lettera raccomandata almeno sei mesi prima (art. 3, comma 6, legge n. 431/1998).
Art. 4 - Canone
Il canone mensile e convenuto in euro 800,00, da pagarsi entro il giorno 5 di ogni mese con bonifico bancario sul conto intestato al locatore. Il canone e aggiornato ogni anno, su richiesta del locatore, nella misura del 75% della variazione ISTAT.
Art. 5 - Deposito cauzionale
A garanzia delle obbligazioni assunte il conduttore versa al locatore la somma di euro 1.600,00, pari a due mensilita del canone, produttiva di interessi legali da corrispondere al conduttore al termine di ogni anno di locazione (art. 11 legge n. 392/1978).
Art. 6 - Oneri accessori
Sono a carico del conduttore gli oneri accessori di cui all'art. 9 della legge n. 392/1978. Le spese di bollo sono a carico del conduttore; l'imposta di registro e a carico del locatore e del conduttore in parti uguali.
Art. 7 - Attestato di prestazione energetica
Il conduttore dichiara di aver ricevuto le informazioni e la documentazione, comprensiva dell'attestato di prestazione energetica (APE), in ordine alla attestazione della prestazione energetica dell'immobile.
Art. 8 - Foro competente
Per ogni controversia e competente il foro di Bologna, dove si trova l'immobile.
Letto, confermato e sottoscritto. Bologna, 15/04/2025
"""

SERVIZIO = """CONDIZIONI GENERALI DEL SERVIZIO DI ABBONAMENTO FIBRAVELOCE
1. Oggetto
Le presenti condizioni generali regolano la fornitura del servizio di connessione internet da parte di Fibraveloce S.p.A. (di seguito il fornitore) al cliente consumatore.
2. Durata e rinnovo
Il contratto ha durata di 24 mesi e si rinnova tacitamente per uguale periodo se il cliente non invia disdetta con preavviso di 6 (sei) mesi prima della scadenza.
3. Corrispettivi
Il canone mensile e di euro 29,90. Il fornitore si riserva il diritto di modificare unilateralmente in qualsiasi momento le condizioni economiche del servizio.
4. Recesso
Solo il fornitore potra recedere dal contratto in qualsiasi momento senza preavviso. In caso di recesso anticipato del cliente e dovuta una penale di euro 250,00.
5. Responsabilita
Il fornitore non sara responsabile in alcun caso di interruzioni o malfunzionamenti del servizio, qualunque ne sia la causa.
6. Reclami
Eventuali contestazioni sulle fatture devono essere inviate entro e non oltre 8 giorni dal ricevimento, a pena di decadenza.
7. Controversie
Ogni controversia sara devoluta a un collegio arbitrale. Per quanto non devoluto agli arbitri e competente in via esclusiva il foro di Milano.
"""


def pdf(text, path):
    def esc(s): return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    pages, cur, y = [], [], 790
    for par in text.strip().split('\n'):
        bold = par.isupper() or par.startswith('Art.') or (par[:2].strip().rstrip('.').isdigit() and len(par) < 40)
        size = 13 if par.isupper() else 10.5
        words, line = par.split(' '), ''
        lines = []
        for w in words:
            t = (line + ' ' + w).strip()
            if len(t) * size * 0.5 > 480: lines.append(line); line = w
            else: line = t
        lines.append(line)
        if bold: y -= 6
        for l in lines:
            if y < 60: pages.append(cur); cur, y = [], 790
            cur.append(f'BT /{"F2" if bold else "F1"} {size} Tf 56 {y} Td ({esc(l)}) Tj ET'); y -= size + 4
        y -= 4
    pages.append(cur)
    objs = {1: '<< /Type /Catalog /Pages 2 0 R >>', 3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'}
    kids = []
    for i, p in enumerate(pages):
        c = '\n'.join(p).encode('latin-1'); n_page, n_c = 10 + 2 * i, 11 + 2 * i
        objs[n_c] = f'<< /Length {len(c)} >>\nstream\n'.encode('latin-1') + c + b'\nendstream'
        objs[n_page] = f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {n_c} 0 R >>'
        kids.append(f'{n_page} 0 R')
    objs[2] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(kids)} >>'
    objs[5] = "<< /Producer (Microsoft Word) /CreationDate (D:20250415100000+02'00') >>"
    out, off = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'), {}
    nmax = max(objs)
    for n in range(1, nmax + 1):
        if n not in objs: objs[n] = '<< >>'
        off[n] = len(out); v = objs[n]
        out += f'{n} 0 obj\n'.encode() + (v if isinstance(v, bytes) else v.encode('latin-1')) + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {nmax + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{off[n]:010d} 00000 n \n'.encode() for n in range(1, nmax + 1))
    out += f'trailer\n<< /Size {nmax + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    open(path, 'wb').write(out)


if __name__ == '__main__':
    pdf(RISCHIOSO, os.path.join(OUT, 'contratto-ricevuto-rischioso.pdf'))
    pdf(CORRETTO, os.path.join(OUT, 'contratto-ricevuto-corretto.pdf'))
    pdf(SERVIZIO, os.path.join(OUT, 'condizioni-servizio.pdf'))
    print('3 contratti di prova')
