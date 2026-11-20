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
open(os.path.join(OUT, 'vendite.zip'), 'wb').write(buf.getvalue())
# le stesse vendite, solo ai clienti dell'Emilia-Romagna: la mappa deve mostrare solo la regione
ER = {'BO', 'MO', 'RE', 'FE', 'FC', 'RA', 'RN', 'PR', 'PC'}
b2 = io.BytesIO()
with zipfile.ZipFile(b2, 'w', zipfile.ZIP_DEFLATED) as z:
    for i, f in enumerate(fatture):
        if f['cli'][3] in ER: z.writestr(f'IT{ME["piva"]}_{i + 1:05d}.xml', xml(f)[0])
open(os.path.join(OUT, 'vendite-emilia.zip'), 'wb').write(b2.getvalue())
mesi = {}
for ym, v in attese['per_mese'].items(): mesi.setdefault(int(ym[5:]), []).append(v)
media_mese = {m: sum(v) / len(v) for m, v in mesi.items()}
top = sorted(attese['per_cliente'].items(), key=lambda kv: -kv[1])
out = dict(fatturato=round(attese['fatturato'], 2), imposta=round(attese['imposta'], 2), note=round(attese['note'], 2), fatture=attese['fatture'], clienti=len(attese['clienti']),
           top3=[k for k, _ in top[:3]], quota_top3=round(sum(v for _, v in top[:3]) / attese['fatturato'], 3),
           per_cliente={k: round(v, 2) for k, v in attese['per_cliente'].items()}, per_prodotto={k: round(v, 2) for k, v in attese['per_prodotto'].items()},
           per_mese={k: round(v, 2) for k, v in sorted(attese['per_mese'].items())}, mese_migliore=max(media_mese, key=media_mese.get), mese_peggiore=min(media_mese, key=media_mese.get),
           dormiente=DORMIENTE, coppia=['Lettore di consumi LT-200', 'Sensore di temperatura SN-10'], prezzo_su='Lettore di consumi LT-200', estero=2, pa='Comune di Casalecchio di Reno', solo_cap='Lodi Manutenzioni', posizioni=POSIZIONI)
json.dump(out, open(os.path.join(OUT, 'vendite-attese.json'), 'w'), ensure_ascii=False, indent=1)
print(len(POSIZIONI), 'indirizzi veri:', ', '.join(f"{k} {sum(1 for p in POSIZIONI.values() if p['tipo'] == k)}" for k in KINDS))
print(len(fatture), 'fatture,', out['clienti'], 'clienti, fatturato', out['fatturato'], 'top3', out['quota_top3'], 'mese migliore', out['mese_migliore'], 'peggiore', out['mese_peggiore'])
