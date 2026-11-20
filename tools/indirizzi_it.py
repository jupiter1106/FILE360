#!/usr/bin/env python3
"""Indice dei numeri civici e delle vie da OpenStreetMap, una regione per file, per mettere i clienti sulla mappa
all'indirizzo scritto in fattura senza mandare gli indirizzi a nessun servizio (la ricerca avviene nel browser).

Per ogni Comune della regione: le vie (nome normalizzato, punto a metà della via) e i civici con le coordinate.
Il Comune di un civico viene da addr:city, poi dal CAP (addr:postcode), poi dal Comune più vicino; il Comune di una
via è quello della maggior parte dei suoi civici, altrimenti il più vicino.

Uscita: JSON compresso (gzip) — {"v":1,"regione":…,"comuni":{"Nome|PR":[[via, lon, lat, "civ:dlon,dlat;…"], …]}}
coordinate in milionesimi di grado; i civici sono scostamenti dal punto della via.
Dati © OpenStreetMap contributors, ODbL.
Uso: python3 tools/indirizzi_it.py regione.osm.pbf "Emilia-Romagna" uscita.json.gz"""
import sys, json, gzip, math, re, unicodedata, collections
import osmium

pbf, regione, out = sys.argv[1:4]
src = open('src/geo-it.js', encoding='utf-8').read()
GEO = json.loads(src[src.index('{'):src.rindex('}') + 1])
P = GEO['proj']
def lonlat(x, y):
    lon = P['lon0'] + x / P['k'] * 180 / math.pi
    Y0 = math.log(math.tan(math.pi / 4 + P['lat1'] * math.pi / 360))
    return lon, (2 * math.atan(math.exp(Y0 - y / P['k'])) - math.pi / 2) * 180 / math.pi
def norm(s): return re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', str(s or '').lower()).encode('ascii', 'ignore').decode()).split()
COM = []   # comuni della regione (e confinanti, per i civici vicino al confine): nome, sigla, lon, lat, CAP
for line in GEO['comuni'].split('|'):
    nomi, s, ri, x, y, caps, b, cl = line.split(';')
    lon, lat = lonlat(float(x), float(y))
    COM.append(dict(n=nomi.split('/')[0], alt=nomi.split('/')[1] if '/' in nomi else '', s=s, r=GEO['regioni'][int(ri)], lon=lon, lat=lat, caps=caps))
REG = [c for c in COM if c['r'] == regione]
byName = collections.defaultdict(list)
for c in REG:
    for n in (c['n'], c['alt']):
        if n: byName[' '.join(norm(n))].append(c)
byCap = {}
for c in REG:
    for part in c['caps'].split():
        a, _, z = part.partition('-')
        for v in range(int(a), int(z or a) + 1): byCap.setdefault(f'{v:05d}', c)
# griglia per il Comune più vicino
G = collections.defaultdict(list)
for c in REG: G[(int(c['lon'] * 10), int(c['lat'] * 10))].append(c)
def vicino(lon, lat):
    best, bd = None, 1e9
    gx, gy = int(lon * 10), int(lat * 10)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for c in G.get((gx + dx, gy + dy), []):
                d = (c['lon'] - lon) ** 2 * 0.55 + (c['lat'] - lat) ** 2
                if d < bd: best, bd = c, d
    return best
ABBR = {'v': 'via', 'v.': 'via', 'vle': 'viale', 'v.le': 'viale', 'p.za': 'piazza', 'p.zza': 'piazza', 'pza': 'piazza', 'pzza': 'piazza', 'p.le': 'piazzale', 'ple': 'piazzale', 'c.so': 'corso', 'cso': 'corso', 'str': 'strada', 'loc': 'localita', 'fraz': 'frazione', 'vic': 'vicolo', 'l.go': 'largo', 'lgo': 'largo', 'p.tta': 'piazzetta', 'sp': 'strada provinciale', 'ss': 'strada statale'}
def via_norm(s):
    s = str(s or '').lower().replace('’', "'")
    s = re.sub(r"\b(v\.le|p\.zza|p\.za|p\.le|c\.so|l\.go|p\.tta)\b", lambda m: ABBR[m.group(1)], s)
    w = norm(s); w = [ABBR.get(t, t) for t in w]
    return ' '.join(w)
def civ_norm(s): return re.sub(r'[^0-9a-z]', '', str(s or '').lower().replace('bis', 'b').replace('ter', 't'))

civici = []            # (comune, via, civ, lon, lat)
vie = collections.defaultdict(list)   # nome via → [(lon, lat, lunghezza, punto medio)]
class H(osmium.SimpleHandler):
    def node(self, n):
        t = n.tags
        if 'addr:housenumber' in t and ('addr:street' in t or 'addr:place' in t):
            civici.append((t.get('addr:city', ''), t.get('addr:postcode', ''), t.get('addr:street') or t.get('addr:place'), t['addr:housenumber'], n.location.lon, n.location.lat))
    def way(self, w):
        t = w.tags
        try: pts = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        except Exception: return
        if not pts: return
        if 'addr:housenumber' in t and ('addr:street' in t or 'addr:place' in t):
            lon = sum(p[0] for p in pts) / len(pts); lat = sum(p[1] for p in pts) / len(pts)
            civici.append((t.get('addr:city', ''), t.get('addr:postcode', ''), t.get('addr:street') or t.get('addr:place'), t['addr:housenumber'], lon, lat))
        if 'highway' in t and 'name' in t and len(pts) >= 2:
            L = 0; seg = []
            for a, b in zip(pts, pts[1:]):
                d = math.hypot((b[0] - a[0]) * 0.74, b[1] - a[1]); seg.append((a, b, d)); L += d
            h, acc, mid = L / 2, 0, pts[0]
            for a, b, d in seg:
                if acc + d >= h and d > 0: f = (h - acc) / d; mid = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); break
                acc += d
            vie[t['name']].append((mid[0], mid[1], L))
H().apply_file(pbf, locations=True)
print('civici letti', len(civici), 'vie', len(vie))

def comune_di(city, cap, lon, lat):
    c = byName.get(' '.join(norm(city)))
    if c and len(c) == 1: return c[0]
    if cap in byCap: return byCap[cap]
    return vicino(lon, lat)
dati = collections.defaultdict(lambda: collections.defaultdict(lambda: {'civ': {}, 'pts': []}))
for city, cap, via, num, lon, lat in civici:
    c = comune_di(city, cap, lon, lat)
    if not c: continue
    k = f"{c['n']}|{c['s']}"; v = via_norm(via); n = civ_norm(num)
    if not v or not n: continue
    e = dati[k][v]; e['nome'] = via; e['civ'].setdefault(n, (lon, lat)); e['pts'].append((lon, lat))
# vie senza civici: il pezzo più lungo con quel nome, nel Comune più vicino
for nome, pezzi in vie.items():
    v = via_norm(nome)
    for lon, lat, L in sorted(pezzi, key=lambda p: -p[2]):
        c = vicino(lon, lat)
        if not c: continue
        e = dati[f"{c['n']}|{c['s']}"][v]
        e.setdefault('nome', nome)
        if 'mid' not in e or L > e['midL']: e['mid'] = (lon, lat); e['midL'] = L
out_c = {}
nciv = nvie = 0
for k, vv in dati.items():
    rows = []
    for v, e in vv.items():
        if 'mid' in e: mlon, mlat = e['mid']
        elif e['pts']: mlon = sorted(p[0] for p in e['pts'])[len(e['pts']) // 2]; mlat = sorted(p[1] for p in e['pts'])[len(e['pts']) // 2]
        else: continue
        M = (round(mlon * 1e6), round(mlat * 1e6))
        civ = ';'.join(f"{n}:{round(lo * 1e6) - M[0]},{round(la * 1e6) - M[1]}" for n, (lo, la) in sorted(e['civ'].items()))
        rows.append([v, M[0], M[1], civ]); nciv += len(e['civ']); nvie += 1
    if rows: out_c[k] = rows
js = json.dumps({'v': 1, 'regione': regione, 'fonte': '© OpenStreetMap contributors (ODbL)', 'comuni': out_c}, ensure_ascii=False, separators=(',', ':'))
with gzip.open(out, 'wt', encoding='utf-8', compresslevel=9) as f: f.write(js)
import os
print(regione, len(out_c), 'comuni', nvie, 'vie', nciv, 'civici', os.path.getsize(out), 'byte compressi')
