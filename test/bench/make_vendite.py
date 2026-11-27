#!/usr/bin/env python3
"""Fatture attive di prova per «Analisi delle vendite» (tutti i dati sono di fantasia).

Un'azienda (Alfa Forniture S.r.l., Bologna) fattura per due anni a 60 clienti in Italia e all'estero. Dentro ci sono
fatti noti che lo strumento deve scoprire da solo:
  - stagionalità: ottobre è il mese più forte, agosto il più debole;
  - un grande cliente «dormiente»: comprava ogni mese, non compra più da cinque mesi;
  - una coppia di prodotti comprata insieme (lettore + sensori);
  - concentrazione: tre clienti valgono circa due terzi del fatturato;
  - note di credito, una pubblica amministrazione, clienti esteri, Comuni scritti in modi diversi, un cliente con il solo CAP;
  - un aumento di prezzo del prodotto principale.
Uscita: test/fixtures/vendite.zip (XML FatturaPA 1.2) e test/fixtures/vendite-attese.json (i valori giusti).
Uso: python3 test/bench/make_vendite.py"""
import random, json, zipfile, io, datetime as dt, os
random.seed(42)
OUT = os.path.join(os.path.dirname(__file__), '..', 'fixtures')
ME = dict(piva='01234567897', nome='Alfa Forniture S.r.l.', via='Via Emilia Ponente', civ='120', cap='40133', comune='Bologna', prov='BO')
# (nome, piva, comune come scritto in fattura, prov, cap, nazione, peso del fatturato, ritmo in giorni)
CLI = [
  ('Rossi Impianti S.p.A.', '02345678901', 'Milano', 'MI', '20121', 'IT', 45, 12), ('Verdi Costruzioni S.r.l.', '03456789012', 'MODENA', 'MO', '41121', 'IT', 35, 14),
  ('Bianchi Elettrotecnica S.r.l.', '04567890123', 'Reggio nell\'Emilia', 'RE', '42121', 'IT', 30, 15),
  ('Ferraro Automazioni S.r.l.', '05678901234', 'Torino', 'TO', '10121', 'IT', 6, 35), ('Esposito Service S.n.c.', '06789012345', 'Napoli', 'NA', '80121', 'IT', 4, 45),
  ('Gallo Termoidraulica', '07890123456', 'Forli\'', 'FC', '47121', 'IT', 4, 40), ('Conti Energia S.r.l.', '08901234567', 'Padova', 'PD', '35121', 'IT', 5, 30),
  ('Mancini Group S.r.l.', '09012345678', 'Roma', 'RM', '00184', 'IT', 6, 30), ('Lombardi Tecnica', '10123456789', 'Bergamo', 'BG', '24121', 'IT', 3, 50),
  ('Moretti Impianti', '11234567890', 'San Donà di Piave', 'VE', '30027', 'IT', 3, 45), ('Barbieri S.r.l.', '12345678903', 'L\'Aquila', 'AQ', '67100', 'IT', 2, 60),
  ('Fontana Elettrica', '13456789014', 'Ferrara', 'FE', '44121', 'IT', 4, 30), ('Santoro Solar S.r.l.', '14567890125', 'Bari', 'BA', '70121', 'IT', 3, 50),
  ('Marino Building', '15678901236', 'Firenze', 'FI', '50122', 'IT', 4, 35), ('Greco Automation', '16789012347', 'Catania', 'CT', '95121', 'IT', 2, 70),
  ('Rizzo Clima', '17890123458', 'Imola', 'BO', '40026', 'IT', 3, 30), ('Lodi Manutenzioni', '18901234569', '', '', '41012', 'IT', 2, 45),
  ('Costa Facility', '19012345670', 'Genova', 'GE', '16121', 'IT', 2, 60), ('Giordano Impianti', '20123456781', 'Verona', 'VR', '37121', 'IT', 3, 40),
  ('Comune di Casalecchio di Reno', '', 'Casalecchio di Reno', 'BO', '40033', 'IT', 3, 90),
  ('Müller Haustechnik GmbH', 'DE123456789', 'München', '', '80331', 'DE', 3, 60), ('Dupont Énergie SARL', 'FR12345678901', 'Lyon', '', '69001', 'FR', 2, 75),
]
for i in range(38):   # clienti piccoli
    comuni = [('Parma', 'PR', '43121'), ('Piacenza', 'PC', '29121'), ('Ravenna', 'RA', '48121'), ('Rimini', 'RN', '47921'), ('Cesena', 'FC', '47521'), ('Brescia', 'BS', '25121'),
              ('Vicenza', 'VI', '36100'), ('Treviso', 'TV', '31100'), ('Trento', 'TN', '38122'), ('Ancona', 'AN', '60121'), ('Pesaro', 'PU', '61121'), ('Perugia', 'PG', '06121'),
              ('Lucca', 'LU', '55100'), ('Pisa', 'PI', '56121'), ('Livorno', 'LI', '57121'), ('Sassuolo', 'MO', '41049'), ('Carpi', 'MO', '41012'), ('Faenza', 'RA', '48018'),
              ('Cento', 'FE', '44042'), ('Mantova', 'MN', '46100'), ('Cremona', 'CR', '26100'), ('Pavia', 'PV', '27100'), ('Udine', 'UD', '33100'), ('Salerno', 'SA', '84121'),
              ('Lecce', 'LE', '73100'), ('Palermo', 'PA', '90133'), ('Cagliari', 'CA', '09124'), ('Pescara', 'PE', '65121'), ('Bolzano', 'BZ', '39100'), ('Novara', 'NO', '28100'),
              ('Como', 'CO', '22100'), ('Varese', 'VA', '21100'), ('Monza', 'MB', '20900'), ('Arezzo', 'AR', '52100'), ('Siena', 'SI', '53100'), ('Terni', 'TR', '05100'),
              ('Latina', 'LT', '04100'), ('Asti', 'AT', '14100')][i]
    persona = i % 9 == 4
    CLI.append((f'Cliente {comuni[0]} {i + 1:02d}' + ('' if persona else ' S.r.l.'), '' if persona else f'{30000000000 + i * 7919:011d}', comuni[0], comuni[1], comuni[2], 'IT', 0.7, 60 + (i * 13) % 80))
PROD = [  # codice, descrizione, prezzo, um
  ('LT-200', 'Lettore di consumi LT-200', 480.0, 'pz'), ('SN-10', 'Sensore di temperatura SN-10', 38.0, 'pz'), ('CV-5', 'Cavo schermato 5 m', 12.5, 'pz'),
  ('QE-01', 'Quadro elettrico QE-01', 1250.0, 'pz'), ('INST', 'Installazione e collaudo', 65.0, 'ore'), ('ASS-12', 'Assistenza annuale', 900.0, 'anno'),
  ('KIT-PV', 'Kit fotovoltaico 3 kW', 3900.0, 'pz'), ('TRM-2', 'Termostato smart TRM-2', 145.0, 'pz'),
]
MESE_PESO = [0.9, 0.95, 1.05, 1.0, 1.05, 1.0, 0.85, 0.4, 1.1, 1.9, 1.05, 0.9]   # ottobre il più forte, agosto il più debole
START, END = dt.date(2024, 1, 1), dt.date(2025, 10, 31)
DORMIENTE = 'Verdi Costruzioni S.r.l.'
fatture, attese = [], dict(fatturato=0.0, note=0.0, fatture=0, clienti=set(), per_cliente={}, per_prodotto={}, per_mese={}, imposta=0.0)
num = 0
def riga(codice, qta, data):
    c = next(p for p in PROD if p[0] == codice)
    prezzo = c[2] * (1.08 if codice == 'LT-200' and data >= dt.date(2025, 3, 1) else 1.0)   # aumento di prezzo dell'8%
    return dict(cod=codice, desc=c[1], qta=qta, um=c[3], prezzo=round(prezzo, 2), tot=round(prezzo * qta, 2))
for c in CLI:
    nome, piva, com, prov, cap, naz, peso, ritmo = c
    d = START + dt.timedelta(days=random.randrange(0, 60))
    while d <= END:
        if nome == DORMIENTE and d > dt.date(2025, 5, 20): break
        m = MESE_PESO[d.month - 1]
        if random.random() < min(1, 0.5 * m * (1 + min(peso, 12) / 10)):
            righe = []
            base = random.choice(['LT-200', 'QE-01', 'KIT-PV', 'ASS-12', 'TRM-2', 'INST']) if peso < 2 else random.choice(['LT-200', 'LT-200', 'QE-01', 'KIT-PV', 'INST', 'TRM-2'])
            q = max(1, int(random.gauss(2 + peso / 4, 1)))
            righe.append(riga(base, q, d))
            if base == 'LT-200': righe.append(riga('SN-10', q * 4, d))   # la coppia: chi compra il lettore compra i sensori
            if random.random() < 0.3: righe.append(riga('CV-5', random.randint(2, 10), d))
            if base in ('QE-01', 'KIT-PV') and random.random() < 0.7: righe.append(riga('INST', random.randint(4, 16), d))
            num += 1
            fatture.append(dict(n=f'{num}/{d.year}', data=d, cli=c, righe=righe, tipo='TD01'))
        d += dt.timedelta(days=max(7, int(random.gauss(ritmo, ritmo / 4)) // max(0.6, m)))
# note di credito (resi): una decina
for f in random.sample([f for f in fatture if f['data'] < dt.date(2025, 9, 1)], 12):
    num += 1; r = f['righe'][0]; q = max(1, r['qta'] // 2)
    fatture.append(dict(n=f'NC{num}/{f["data"].year}', data=f['data'] + dt.timedelta(days=20), cli=f['cli'], righe=[dict(r, qta=q, tot=round(r['prezzo'] * q, 2))], tipo='TD04'))
fatture.sort(key=lambda f: f['data'])
def esc(s): return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
# ---- indirizzi veri (indice dei civici di OpenStreetMap, dati/mappa/civici) scritti nei modi che si trovano nelle fatture ----
# Un generatore casuale a parte: le fatture (importi, date) restano le stesse di prima.
import gzip, math, re as _re
ARND = random.Random(2026)
CANON = {'MODENA': 'Modena', "Forli'": 'Forlì'}
TIPI = {'via', 'viale', 'piazza', 'piazzale', 'corso', 'largo', 'vicolo', 'strada', 'piazzetta', 'contrada', 'borgo', 'localita', 'frazione', 'salita'}
ABBR_SCR = {'viale': 'V.le', 'piazza': 'P.zza', 'corso': 'C.so', 'piazzale': 'P.le', 'largo': 'L.go', 'via': 'V.'}
_IDX = {}
def indice(prov):
    if prov not in _IDX:
        f = os.path.join(os.path.dirname(__file__), '..', '..', 'dati', 'mappa', 'civici', f'{prov}.json.gz')
        _IDX[prov] = json.loads(gzip.open(f, 'rt', encoding='utf-8').read()) if os.path.exists(f) else None
    return _IDX[prov]
def civ_map(r): return {k: (r[1] + int(d.split(',')[0]), r[2] + int(d.split(',')[1])) for k, d in (p.split(':') for p in r[3].split(';'))} if r[3] else {}
def titolo(v): return ' '.join(w if w in ('di', 'del', 'della', 'dei', 'delle', 'degli', 'da', 'e') else w.capitalize() for w in v.split())
KINDS = ['esatto', 'maiuscolo', 'abbreviato', 'iniziali', 'senza_nome', 'barra', 'numero_n', 'mancante', 'snc', 'refuso', 'inesistente', 'tutto_in_indirizzo']
INDIRIZZI, POSIZIONI = {}, {}
def scegli_indirizzo(k, nome, com, prov):
    I = indice(prov)
    if not I: return None
    key = f'{CANON.get(com, com)}|{prov}'
    rows = I['comuni'].get(key)
    if not rows: return None
    kind = KINDS[k % len(KINDS)]
    nomi = {r[0] for r in rows}
    def ok(r):
        t = r[0].split(); M = civ_map(r); nums = sorted(int(x) for x in M if x.isdigit())
        if len(nums) < 8 or t[0] not in TIPI: return False
        sig = [w for w in t if w not in TIPI and w not in ('di', 'del', 'della', 'dei', 'delle', 'degli', 'da', 'e')]
        if kind in ('iniziali', 'senza_nome') and (len(sig) < 2 or len(sig[0]) < 3): return False
        if kind == 'senza_nome' and any(o != r[0] and o.split()[0] == t[0] and sig[-1] in o.split() for o in nomi): return False
        if kind == 'abbreviato' and t[0] not in ABBR_SCR: return False
        if kind == 'refuso' and max([len(w) for w in sig] or [0]) < 7: return False
        if kind == 'mancante' and not any(n + 2 in nums and n + 4 not in M and n + 6 in nums and str(n + 4) not in M for n in nums): return False
        return True
    cand = [r for r in rows if ok(r)]
    if not cand: return None
    r = ARND.choice(sorted(cand, key=lambda r: r[0])); M = civ_map(r); nums = sorted(int(x) for x in M if x.isdigit())
    t = r[0].split(); tipo = t[0]; via = titolo(r[0]); civ = str(nums[len(nums) // 2]); lon, lat = M[civ]; prec, toll = 'civico', 5
    sig = [w for w in t if w not in TIPI and w not in ('di', 'del', 'della', 'dei', 'delle', 'degli', 'da', 'e')]
    ind, nc = via, civ
    if kind == 'maiuscolo': ind = via.upper()
    elif kind == 'abbreviato': ind = ABBR_SCR[tipo] + ' ' + titolo(' '.join(t[1:]))
    elif kind == 'iniziali': ind = titolo(r[0]).replace(sig[0].capitalize(), sig[0][0].upper() + '.', 1)
    elif kind == 'senza_nome': ind = titolo(tipo + ' ' + sig[-1])
    elif kind == 'barra': nc = civ + '/A'
    elif kind == 'numero_n': ind, nc = via + ' n. ' + civ, ''
    elif kind == 'mancante':
        n = next(n for n in nums if n + 2 in nums and str(n + 4) not in M and n + 6 in nums); a, b = M[str(n + 2)], M[str(n + 6)]
        civ = nc = str(n + 4); lon, lat = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2; prec = 'stimato'
        toll = 10 + 0.6 * math.hypot((a[0] - b[0]) * 0.111 * math.cos(lat / 1e6 * math.pi / 180), (a[1] - b[1]) * 0.111)
    elif kind == 'snc': nc = 'snc'; lon, lat = r[1], r[2]; prec = 'via'
    elif kind == 'refuso':
        w = max(sig, key=len); i = len(w) // 2; w2 = w[:i - 1] + w[i] + w[i - 1] + w[i + 1:]; ind = titolo(r[0].replace(w, w2, 1))
    elif kind == 'inesistente': ind, nc = 'Via dei Ciclamini Turchesi', '3'; prec = 'comune'; lon = lat = None
    elif kind == 'tutto_in_indirizzo': ind, nc = via + ', ' + civ, ''
    INDIRIZZI[nome] = (ind, nc)
    POSIZIONI[nome] = dict(tipo=kind, scritto=(ind + (' ' + nc if nc else '')).strip(), prec=prec, lon=lon / 1e6 if lon is not None else None, lat=lat / 1e6 if lat is not None else None, toll_m=round(toll, 1))
    return True
_k = 0
for c in CLI:
    nome, piva, com, prov, cap, naz, *_ = c
    if naz != 'IT': continue
    if nome == 'Lodi Manutenzioni': com, prov = 'Carpi', 'MO'      # solo il CAP in fattura: il Comune viene dal CAP
    if scegli_indirizzo(_k, nome, com, prov): _k += 1
def xml(f):
    nome, piva, com, prov, cap, naz, *_ = f['cli']; pa = nome.startswith('Comune di')
    imponibile = round(sum(r['tot'] for r in f['righe']), 2); iva = 0.0 if naz != 'IT' else round(imponibile * 0.22, 2)
    persona = not piva and not pa
    if persona: an = f'<Anagrafica><Nome>Mario</Nome><Cognome>{esc(nome.split()[1])}</Cognome></Anagrafica>'
    else: an = f'<Anagrafica><Denominazione>{esc(nome)}</Denominazione></Anagrafica>'
    idf = f'<IdFiscaleIVA><IdPaese>{piva[:2] if naz != "IT" else "IT"}</IdPaese><IdCodice>{piva[2:] if naz != "IT" else piva}</IdCodice></IdFiscaleIVA>' if piva else ''
    cf = '<CodiceFiscale>80012345678</CodiceFiscale>' if pa else (f'<CodiceFiscale>{("PRS" + "".join(ch for ch in nome.upper() if ch.isalnum()) + "XXXXXXXXXXXXXXXX")[:16]}</CodiceFiscale>' if persona else '')
    ind, nc = INDIRIZZI.get(nome, ('Via Roma', '1'))
    sede = f'<Sede><Indirizzo>{esc(ind)}</Indirizzo>' + (f'<NumeroCivico>{esc(nc)}</NumeroCivico>' if nc else '') + f'<CAP>{cap if naz == "IT" else "00000"}</CAP>' + (f'<Comune>{esc(com)}</Comune>' if com else '<Comune>-</Comune>') + (f'<Provincia>{prov}</Provincia>' if prov else '') + f'<Nazione>{naz}</Nazione></Sede>'
    scad = f['data'] + dt.timedelta(days=30 if not pa else 60)
    mod = 'MP05' if naz != 'IT' or pa else random.choice(['MP05', 'MP05', 'MP12', 'MP08'])
    linee = ''.join(f'<DettaglioLinee><NumeroLinea>{i + 1}</NumeroLinea><CodiceArticolo><CodiceTipo>INTERNO</CodiceTipo><CodiceValore>{r["cod"]}</CodiceValore></CodiceArticolo><Descrizione>{esc(r["desc"])}</Descrizione><Quantita>{r["qta"]:.2f}</Quantita><UnitaMisura>{r["um"]}</UnitaMisura><PrezzoUnitario>{r["prezzo"]:.2f}</PrezzoUnitario><PrezzoTotale>{r["tot"]:.2f}</PrezzoTotale><AliquotaIVA>{"22.00" if naz == "IT" else "0.00"}</AliquotaIVA>' + ('' if naz == 'IT' else '<Natura>N3.2</Natura>') + '</DettaglioLinee>' for i, r in enumerate(f['righe']))
    riep = f'<DatiRiepilogo><AliquotaIVA>{"22.00" if naz == "IT" else "0.00"}</AliquotaIVA>' + ('' if naz == 'IT' else '<Natura>N3.2</Natura>') + f'<ImponibileImporto>{imponibile:.2f}</ImponibileImporto><Imposta>{iva:.2f}</Imposta>' + ('<EsigibilitaIVA>S</EsigibilitaIVA>' if pa else '') + '</DatiRiepilogo>'
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="{"FPA12" if pa else "FPR12"}" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>{ME["piva"]}</IdCodice></IdTrasmittente><ProgressivoInvio>{abs(hash(f["n"])) % 99999:05d}</ProgressivoInvio><FormatoTrasmissione>{"FPA12" if pa else "FPR12"}</FormatoTrasmissione><CodiceDestinatario>{"UF1234" if pa else ("XXXXXXX" if naz != "IT" else "0000000")}</CodiceDestinatario></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>{ME["piva"]}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>{ME["nome"]}</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>{ME["via"]}</Indirizzo><NumeroCivico>{ME["civ"]}</NumeroCivico><CAP>{ME["cap"]}</CAP><Comune>{ME["comune"]}</Comune><Provincia>{ME["prov"]}</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici>{idf}{cf}{an}</DatiAnagrafici>{sede}</CessionarioCommittente></FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>{f["tipo"]}</TipoDocumento><Divisa>EUR</Divisa><Data>{f["data"].isoformat()}</Data><Numero>{f["n"]}</Numero><ImportoTotaleDocumento>{imponibile + iva:.2f}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi>{linee}{riep}</DatiBeniServizi>
<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>{mod}</ModalitaPagamento><DataScadenzaPagamento>{scad.isoformat()}</DataScadenzaPagamento><ImportoPagamento>{imponibile + iva:.2f}</ImportoPagamento></DettaglioPagamento></DatiPagamento></FatturaElettronicaBody>
</p:FatturaElettronica>''', imponibile, iva
# ---- acquisti (fatture passive): i fornitori dell'azienda, con fatti noti da scoprire ----
# generatore casuale a parte: le fatture di vendita (e i loro valori attesi) non cambiano
PRND = random.Random(77)
FORN = [  # nome, piva, comune, prov, cap, naz, voci (codice, descrizione, prezzo, um), ritmo in giorni, termini in giorni
  ('Elettroforniture Nord S.p.A.', '04411220150', 'Milano', 'MI', '20126', 'IT', [('QD-B', 'Quadro elettrico base', 620.0, 'pz'), ('CV-R', 'Cavo FG16 rotolo 100 m', 185.0, 'pz'), ('INT-M', 'Interruttore magnetotermico', 38.0, 'pz')], 18, 60),
  ('Componenti Emilia S.r.l.', '03322110364', 'Modena', 'MO', '41122', 'IT', [('SG-1', 'Sensore grezzo SG-1', 14.0, 'pz'), ('SCH-1', 'Scheda elettronica LT', 95.0, 'pz')], 14, 30),
  ('Rossi Impianti S.p.A.', '02345678901', 'Milano', 'MI', '20121', 'IT', [('POSA', 'Posa in opera in subappalto', 52.0, 'ore')], 45, 30),
  ('Logistica Adriatica S.r.l.', '02233440428', 'Ancona', 'AN', '60121', 'IT', [('TRASP', 'Trasporto merci', 140.0, 'viaggio')], 12, 30),
  ('Studio Bianchi Commercialisti', '01122330378', 'Bologna', 'BO', '40121', 'IT', [('CONT', 'Consulenza contabile mensile', 450.0, 'mese')], 30, 15),
  ('Energia Più S.p.A.', '05566770580', 'Roma', 'RM', '00144', 'IT', [('EN', 'Fornitura di energia elettrica', 380.0, 'mese')], 30, 20),
  ('Software Cloud S.r.l.', '06677880014', 'Torino', 'TO', '10128', 'IT', [('SAAS', 'Abbonamento gestionale in cloud', 120.0, 'mese')], 30, 30),
  # lo stesso cavo del fornitore principale, con un altro codice e un prezzo più basso: il risparmio possibile
  ('Cavi Veneto S.r.l.', '04455660288', 'Padova', 'PD', '35127', 'IT', [('FG16-100', 'Cavo FG16 rotolo 100 m', 168.0, 'pz')], 40, 60),
  # il termostato che l'azienda rivende (TRM-2 a 145 €): il margine sui prodotti rivenduti
  ('Clima Distribuzione S.r.l.', '03344550239', 'Verona', 'VR', '37135', 'IT', [('CD-TRM2', 'Termostato smart TRM-2', 92.0, 'pz')], 25, 30),
]
# metodo di pagamento di ogni fornitore (gli altri bonifico); un acquisto grande in contanti (oltre la soglia) e uno piccolo
MODO_FORN = {'Software Cloud S.r.l.': 'MP08', 'Componenti Emilia S.r.l.': 'MP12', 'Energia Più S.p.A.': 'MP19'}
ESTERO = ('Müller Elektronik GmbH', 'DE811223344', 'Stuttgart', '', '70173', 'DE', [('MOD-DE', 'Modulo di misura MX', 210.0, 'pz')], 40, 30)
acquisti, attese_acq = [], dict(spesa=0.0, iva=0.0, per_fornitore={}, fatture=0, note=0.0)
anum = 0
def acq_riga(cod, voci, qta, data):
    c = next(v for v in voci if v[0] == cod)
    prezzo = c[2] * (1.12 if cod == 'SG-1' and data >= dt.date(2025, 4, 1) else 1.0)   # rincaro del 12% del sensore grezzo
    return dict(cod=cod, desc=c[1], qta=qta, um=c[3], prezzo=round(prezzo, 2), tot=round(prezzo * qta, 2))
for fz in FORN + [ESTERO]:
    nome, piva, com, prov, cap, naz, voci, ritmo, termini = fz
    d = START + dt.timedelta(days=PRND.randrange(0, 20))
    while d <= END:
        if nome.startswith('Elettroforniture'): righe = [acq_riga(v[0], voci, PRND.randint(6, 14) if v[0] != 'QD-B' else PRND.randint(2, 4), d) for v in voci]
        elif nome.startswith('Componenti'): righe = [acq_riga('SG-1', voci, PRND.randint(40, 90), d)] + ([acq_riga('SCH-1', voci, PRND.randint(3, 8), d)] if PRND.random() < 0.5 else [])
        else: righe = [acq_riga(voci[0][0], voci, 1 if voci[0][3] in ('mese',) else PRND.randint(2, 10), d)]
        anum += 1
        acquisti.append(dict(n=f'A{anum}/{d.year}', data=d, forn=fz, righe=righe, tipo='TD18' if naz != 'IT' else 'TD06' if nome.startswith('Studio') else 'TD01', termini=termini, mod=MODO_FORN.get(nome, 'MP05')))
        d += dt.timedelta(days=max(5, int(PRND.gauss(ritmo, ritmo / 5))))
for f in PRND.sample([f for f in acquisti if f['forn'][0].startswith('Elettroforniture')], 2):   # due note di credito del fornitore principale
    anum += 1; r = f['righe'][0]; q = max(1, r['qta'] // 2)
    acquisti.append(dict(n=f'NCA{anum}/{f["data"].year}', data=f['data'] + dt.timedelta(days=15), forn=f['forn'], righe=[dict(r, qta=q, tot=round(r['prezzo'] * q, 2))], tipo='TD04', termini=0))
acquisti.sort(key=lambda f: f['data'])
_el = [f for f in acquisti if f['forn'][0].startswith('Elettroforniture') and f['tipo'] == 'TD01']
max(_el, key=lambda f: sum(r['tot'] for r in f['righe']))['mod'] = 'MP01'
next(f for f in acquisti if f['forn'][0].startswith('Logistica'))['mod'] = 'MP01'
# un'integrazione per inversione contabile (TD16): duplica un acquisto già presente, non va contata
TD16 = dict(n='INT1/2025', data=dt.date(2025, 6, 10), forn=FORN[1], righe=[acq_riga('SG-1', FORN[1][6], 50, dt.date(2025, 6, 10))], tipo='TD16', termini=0)
def xml_acq(f):
    nome, piva, com, prov, cap, naz = f['forn'][:6]
    imponibile = round(sum(r['tot'] for r in f['righe']), 2); iva = round(imponibile * 0.22, 2)
    idf = f'<IdFiscaleIVA><IdPaese>{piva[:2] if naz != "IT" else "IT"}</IdPaese><IdCodice>{piva[2:] if naz != "IT" else piva}</IdCodice></IdFiscaleIVA>'
    scad = f['data'] + dt.timedelta(days=f['termini'])
    linee = ''.join(f'<DettaglioLinee><NumeroLinea>{i + 1}</NumeroLinea><CodiceArticolo><CodiceTipo>FORN</CodiceTipo><CodiceValore>{r["cod"]}</CodiceValore></CodiceArticolo><Descrizione>{esc(r["desc"])}</Descrizione><Quantita>{r["qta"]:.2f}</Quantita><UnitaMisura>{r["um"]}</UnitaMisura><PrezzoUnitario>{r["prezzo"]:.2f}</PrezzoUnitario><PrezzoTotale>{r["tot"]:.2f}</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA>{"<Ritenuta>SI</Ritenuta>" if f["tipo"] == "TD06" else ""}</DettaglioLinee>' for i, r in enumerate(f['righe']))
    # parcelle dei professionisti: ritenuta d'acconto del 20% (RT01), che l'azienda versa con l'F24
    rit = round(imponibile * 0.20, 2) if f['tipo'] == 'TD06' else 0
    drit = f'<DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>{rit:.2f}</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>' if rit else ''
    pag = '' if f['tipo'] in ('TD04', 'TD16', 'TD18') else f'<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>{f.get("mod", "MP05")}</ModalitaPagamento><DataScadenzaPagamento>{scad.isoformat()}</DataScadenzaPagamento><ImportoPagamento>{imponibile + iva:.2f}</ImportoPagamento></DettaglioPagamento></DatiPagamento>'
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>{piva if naz == "IT" else ME["piva"]}</IdCodice></IdTrasmittente><ProgressivoInvio>{len(f["n"]):05d}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici>{idf}<Anagrafica><Denominazione>{esc(nome)}</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>Via Industria</Indirizzo><NumeroCivico>5</NumeroCivico><CAP>{cap}</CAP><Comune>{esc(com)}</Comune>{f"<Provincia>{prov}</Provincia>" if prov else ""}<Nazione>{naz}</Nazione></Sede></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>{ME["piva"]}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>{ME["nome"]}</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>{ME["via"]}</Indirizzo><NumeroCivico>{ME["civ"]}</NumeroCivico><CAP>{ME["cap"]}</CAP><Comune>{ME["comune"]}</Comune><Provincia>{ME["prov"]}</Provincia><Nazione>IT</Nazione></Sede></CessionarioCommittente></FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>{f["tipo"]}</TipoDocumento><Divisa>EUR</Divisa><Data>{f["data"].isoformat()}</Data><Numero>{f["n"]}</Numero>{drit}<ImportoTotaleDocumento>{imponibile + iva:.2f}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi>{linee}<DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>{imponibile:.2f}</ImponibileImporto><Imposta>{iva:.2f}</Imposta></DatiRiepilogo></DatiBeniServizi>{pag}</FatturaElettronicaBody>
</p:FatturaElettronica>""", imponibile, iva
for f in acquisti:
    _, imp, iva = xml_acq(f); sg = -1 if f['tipo'] == 'TD04' else 1; nome = f['forn'][0]
    attese_acq['spesa'] += sg * imp; attese_acq['iva'] += sg * iva; attese_acq['per_fornitore'][nome] = attese_acq['per_fornitore'].get(nome, 0) + sg * imp
    if sg > 0: attese_acq['fatture'] += 1
    else: attese_acq['note'] += imp
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    for i, f in enumerate(fatture):
        x, imp, iva = xml(f); s = -1 if f['tipo'] == 'TD04' else 1
        z.writestr(f'IT{ME["piva"]}_{i + 1:05d}.xml', x)
        nome = f['cli'][0]; ym = f['data'].strftime('%Y-%m')
        attese['fatturato'] += s * imp; attese['imposta'] += s * iva; attese['fatture'] += 1; attese['clienti'].add(nome)
        if s < 0: attese['note'] += imp
        attese['per_cliente'][nome] = attese['per_cliente'].get(nome, 0) + s * imp
        attese['per_mese'][ym] = attese['per_mese'].get(ym, 0) + s * imp
        for r in f['righe']: attese['per_prodotto'][r['desc']] = attese['per_prodotto'].get(r['desc'], 0) + s * r['tot']
    # gli acquisti nello stesso archivio, con un'integrazione TD16 (da escludere) e alcuni doppioni (da contare una volta)
    for k, f in enumerate(acquisti): z.writestr(f'acquisti/IT{f["forn"][1]}_{k + 1:05d}.xml', xml_acq(f)[0])
    z.writestr('acquisti/integrazione_TD16.xml', xml_acq(TD16)[0])
    for k in (3, 40, 120): z.writestr(f'copia-{k}.xml', xml(fatture[k])[0].replace('<ProgressivoInvio>', '<ProgressivoInvio>9'))
    for k in (5, 60): z.writestr(f'acquisti/copia-{k}.xml', xml_acq(acquisti[k])[0])
open(os.path.join(OUT, 'vendite.zip'), 'wb').write(buf.getvalue())
# le stesse vendite, solo ai clienti dell'Emilia-Romagna: la mappa deve mostrare solo la regione
ER = {'BO', 'MO', 'RE', 'FE', 'FC', 'RA', 'RN', 'PR', 'PC'}
b2 = io.BytesIO()
with zipfile.ZipFile(b2, 'w', zipfile.ZIP_DEFLATED) as z:
    for i, f in enumerate(fatture):
        if f['cli'][3] in ER: z.writestr(f'IT{ME["piva"]}_{i + 1:05d}.xml', xml(f)[0])
open(os.path.join(OUT, 'vendite-emilia.zip'), 'wb').write(b2.getvalue())
# solo le fatture di acquisto: l'azienda va riconosciuta lo stesso (è chi le riceve tutte)
b3 = io.BytesIO()
with zipfile.ZipFile(b3, 'w', zipfile.ZIP_DEFLATED) as z:
    for k, f in enumerate(acquisti): z.writestr(f'IT{f["forn"][1]}_{k + 1:05d}.xml', xml_acq(f)[0])
open(os.path.join(OUT, 'acquisti-solo.zip'), 'wb').write(b3.getvalue())
mesi = {}
for ym, v in attese['per_mese'].items(): mesi.setdefault(int(ym[5:]), []).append(v)
media_mese = {m: sum(v) / len(v) for m, v in mesi.items()}
top = sorted(attese['per_cliente'].items(), key=lambda kv: -kv[1])
out = dict(fatturato=round(attese['fatturato'], 2), imposta=round(attese['imposta'], 2), note=round(attese['note'], 2), fatture=attese['fatture'], clienti=len(attese['clienti']),
           top3=[k for k, _ in top[:3]], quota_top3=round(sum(v for _, v in top[:3]) / attese['fatturato'], 3),
           per_cliente={k: round(v, 2) for k, v in attese['per_cliente'].items()}, per_prodotto={k: round(v, 2) for k, v in attese['per_prodotto'].items()},
           per_mese={k: round(v, 2) for k, v in sorted(attese['per_mese'].items())}, mese_migliore=max(media_mese, key=media_mese.get), mese_peggiore=min(media_mese, key=media_mese.get),
           dormiente=DORMIENTE, coppia=['Lettore di consumi LT-200', 'Sensore di temperatura SN-10'], prezzo_su='Lettore di consumi LT-200', estero=2, pa='Comune di Casalecchio di Reno', solo_cap='Lodi Manutenzioni', posizioni=POSIZIONI,
           acquisti=dict(spesa=round(attese_acq['spesa'], 2), iva=round(attese_acq['iva'], 2), note=round(attese_acq['note'], 2), fatture=attese_acq['fatture'], fornitori=len(attese_acq['per_fornitore']),
                         per_fornitore={k: round(v, 2) for k, v in attese_acq['per_fornitore'].items()}, principale='Elettroforniture Nord S.p.A.', rincaro='Sensore grezzo SG-1', anche_cliente='Rossi Impianti S.p.A.', estero='Müller Elektronik GmbH', risparmio_voce='Cavo FG16 rotolo 100 m', rivenduto='Termostato smart TRM-2', ritenute=round(sum(round(sum(r['tot'] for r in f['righe']) * 0.2, 2) for f in acquisti if f['tipo'] == 'TD06'), 2), contanti_soglia=1, categorie={'Energia Più S.p.A.': 'Energia e gas', 'Software Cloud S.r.l.': 'Software e servizi digitali', 'Studio Bianchi Commercialisti': 'Consulenze e professionisti', 'Logistica Adriatica S.r.l.': 'Trasporti e spedizioni', 'Rossi Impianti S.p.A.': 'Lavorazioni e subappalti', 'Elettroforniture Nord S.p.A.': 'Merci e materiali'}, doppie=5))
json.dump(out, open(os.path.join(OUT, 'vendite-attese.json'), 'w'), ensure_ascii=False, indent=1)
print(len(POSIZIONI), 'indirizzi veri:', ', '.join(f"{k} {sum(1 for p in POSIZIONI.values() if p['tipo'] == k)}" for k in KINDS))
print(len(acquisti), 'acquisti,', round(attese_acq['spesa'], 2), 'di spesa; quota del principale', round(attese_acq['per_fornitore']['Elettroforniture Nord S.p.A.'] / attese_acq['spesa'], 3))
print(len(fatture), 'fatture,', out['clienti'], 'clienti, fatturato', out['fatturato'], 'top3', out['quota_top3'], 'mese migliore', out['mese_migliore'], 'peggiore', out['mese_peggiore'])

# ---------- estratto conto dello stesso periodo (CSV dell'home banking) per «Incassi e pagamenti veri" ----------
# ogni fattura ha una sorte scritta qui (pagata, in ritardo, in due rate, insieme alla successiva dello stesso cliente,
# non pagata): l'abbinamento del programma deve ritrovarla. Generatore a parte: le altre prove non cambiano.
BR = random.Random(2024)
mov, sorte = [], {}
def it(v): return f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
pagamenti = {}   # numero della fattura -> date dei movimenti che la pagano
def add(d, desc, v, *nn):
    mov.append((d, desc, round(v, 2)))
    for n in nn: pagamenti.setdefault(n, []).append(d)
vend = [f for f in fatture if f['tipo'] == 'TD01']
usate = set()
for k, f in enumerate(vend):
    if f['n'] in usate: continue
    _, imp, iva = xml(f); due = round(imp + iva, 2); pa = bool(f['cli'][2]) and False
    nome = f['cli'][0]; scad = f['data'] + dt.timedelta(days=60 if 'Comune' in nome else 30)
    if scad > END - dt.timedelta(days=12): sorte[f['n']] = 'fuori'; continue
    caso = k % 10; corto = nome.split()[0].upper()
    if caso in (0, 1, 2):   # pagata alla scadenza, causali diverse
        desc = [f'BONIFICO DA {nome.upper()} PER FATT. {f["n"]}', f'ACCREDITO BONIFICO ORD. {nome.upper()} RIF FT N. {f["n"].split("/")[0]}', f'BON. {nome.upper()} SALDO FATTURA {f["n"]}'][caso]
        add(scad + dt.timedelta(days=BR.randint(-3, 4)), desc, due, f['n']); sorte[f['n']] = 'saldata'
    elif caso == 3:   # solo il nome, nessun numero
        add(scad + dt.timedelta(days=BR.randint(0, 6)), f'BONIFICO DA {nome.upper()}', due, f['n']); sorte[f['n']] = 'saldata'
    elif caso == 4 and due > 300:   # in due rate
        a = round(due * 0.4, 2); add(scad, f'BONIFICO {nome.upper()} ACCONTO', a, f['n']); add(scad + dt.timedelta(days=30), f'BONIFICO {nome.upper()} SALDO', round(due - a, 2), f['n'])
        sorte[f['n']] = 'saldata' if scad + dt.timedelta(days=30) <= END else 'parziale'
    elif caso == 5:   # insieme alla prossima fattura dello stesso cliente
        g = next((x for x in vend[k + 1:] if x['cli'][0] == nome and x['n'] not in usate and x['data'] + dt.timedelta(days=30) <= END - dt.timedelta(days=12)), None)
        if g:
            _, i2, v2 = xml(g); usate.add(g['n']); add(g['data'] + dt.timedelta(days=31), f'BONIFICO DA {nome.upper()} FATTURE {f["n"]} E {g["n"]}', due + round(i2 + v2, 2), f['n'], g['n']); sorte[f['n']] = sorte[g['n']] = 'saldata'
        else: add(scad, f'BONIFICO DA {nome.upper()}', due, f['n']); sorte[f['n']] = 'saldata'
    elif caso == 8:   # mai pagata: scaduta
        sorte[f['n']] = 'scaduta'
    elif caso == 9:   # pagata con 40 giorni di ritardo
        add(scad + dt.timedelta(days=40), f'BONIFICO {corto} FT {f["n"]}', due, f['n']); sorte[f['n']] = 'saldata'
    else:
        add(scad + dt.timedelta(days=BR.randint(-2, 2)), f'ACCREDITO BONIFICO DA {nome.upper()} FATTURA {f["n"]}', due, f['n']); sorte[f['n']] = 'saldata'
sorteA = {}
for k, f in enumerate([f for f in acquisti if f['tipo'] in ('TD01', 'TD06', 'TD18')]):
    nome = f['forn'][0]; scad = f['data'] + dt.timedelta(days=f['termini'])
    imp = round(sum(r['tot'] for r in f['righe']), 2); due = imp if f['tipo'] == 'TD18' else round(imp * 1.22, 2)
    if f['tipo'] == 'TD18':   # fornitore estero: si paga l'imponibile, senza scadenza nel documento di integrazione
        if k % 5 == 2: sorteA[f['n']] = 'da verificare'; continue
        add(f['data'] + dt.timedelta(days=BR.randint(5, 20)), f'BONIFICO ESTERO A FAVORE DI {nome.upper()} INV {f["n"]}', -due, f['n']); sorteA[f['n']] = 'saldata'; continue
    if scad > END - dt.timedelta(days=12): sorteA[f['n']] = 'fuori'; continue
    if k % 9 == 4: sorteA[f['n']] = 'scaduta'; continue
    desc = f'SDD {nome.upper()} ADDEBITO' if f.get('mod') == 'MP19' else f'BONIFICO A FAVORE DI {nome.upper()} FT {f["n"]}'
    add(scad + dt.timedelta(days=BR.randint(-1, 3)), desc, -due, f['n']); sorteA[f['n']] = 'saldata'
d = START
while d <= END:   # movimenti senza fattura
    add(d.replace(day=27), 'STIPENDI DIPENDENTI MESE', -BR.randint(9000, 12000)); add(d.replace(day=16), 'F24 DELEGA PAGAMENTO IMPOSTE', -BR.randint(1500, 4000))
    add(d.replace(day=10), 'INCASSO POS NEGOZIO', BR.randint(300, 900)); add(d.replace(day=28), 'COMMISSIONI E SPESE TENUTA CONTO', -12.5)
    d = (d.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
mov = [m for m in mov if START <= m[0] <= END]; mov.sort(key=lambda m: m[0])
# pagamenti caduti dopo la fine dell'estratto: la fattura risulta non pagata (o pagata in parte) alla data dell'estratto
for S, mai in ((sorte, 'scaduta'), (sorteA, 'scaduta')):
    for n, v in S.items():
        dd = pagamenti.get(n, [])
        if v in ('saldata', 'parziale') and dd and all(x > END for x in dd): S[n] = 'da verificare' if n.startswith('A') and v == 'saldata' and any(f['n'] == n and f['tipo'] == 'TD18' for f in acquisti) else mai
        elif v == 'saldata' and any(x > END for x in dd): S[n] = 'parziale'
with open(os.path.join(OUT, 'estratto-conto.csv'), 'w', encoding='utf-8') as fh:
    fh.write('Data contabile;Data valuta;Descrizione operazione;Importo\n')
    for d, desc, v in mov: fh.write(f'{d.strftime("%d/%m/%Y")};{d.strftime("%d/%m/%Y")};{desc};{it(v)}\n')
json.dump(dict(vendite=sorte, acquisti=sorteA, movimenti=len(mov)), open(os.path.join(OUT, 'incassi-attese.json'), 'w'), ensure_ascii=False, indent=1)
print(len(mov), 'movimenti nell’estratto conto;', sum(1 for v in sorte.values() if v == 'scaduta'), 'fatture scadute attese')
