#!/usr/bin/env python3
"""Genera src/geo-it.js: coordinate dei Comuni italiani e confini semplificati di province e regioni, per la mappa
dei clienti in «Analisi delle vendite» (tutto dentro il file: nessuna richiesta di rete, nessun servizio di mappe).

Fonti:
  - Comuni con coordinate, CAP, codice catastale e superficie: database dei comuni italiani di Garda Informatica
    (pacchetto npm italian-cap-comuni-province, licenza MIT), allineato all'elenco ISTAT;
  - confini di province e regioni: ISTAT, distribuiti da openpolis/geojson-italy (licenza CC BY 4.0, con attribuzione).

Proiezione: Mercatore su un riquadro di 1000 unità di larghezza; la stessa formula (GEO_IT.proj) serve nel browser per
mettere i Comuni sulla mappa.

Uso: python3 tools/geo_it.py comuni_cap.json limits_IT_provinces.geojson limits_IT_regions.geojson"""
import json, math, sys
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

comuni_src, prov_src, reg_src = sys.argv[1:4]
LON0, LON1, LAT0, LAT1 = 6.5, 18.6, 35.4, 47.2
W = 1000.0
merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
K = W / math.radians(LON1 - LON0)
Y0 = merc(LAT1)
H = (Y0 - merc(LAT0)) * K
def P(lon, lat): return ((math.radians(lon - LON0)) * K, (Y0 - merc(lat)) * K)

# --- Comuni: uno per codice ISTAT, con tutti i CAP ---
rows = json.load(open(comuni_src, encoding='utf-8'))
com = {}
for r in rows:
    c = com.setdefault(r['codice_istat'], {'n': r['denominazione_ita'].strip(), 'a': r['denominazione_altra'].strip(), 's': r['sigla_provincia'], 'r': r['denominazione_regione'],
                                          'lat': float(r['lat']), 'lon': float(r['lon']), 'b': r['codice_belfiore'], 'km': float(r['superficie_kmq'] or 0), 'cap': set(), 'cl': r['flag_capoluogo'] == 'SI'})
    if r['cap']: c['cap'].add(r['cap'])
regioni = sorted({c['r'] for c in com.values()})
def caps(s):
    # i CAP di una grande città sono intervalli consecutivi: «00118-00199»
    v = sorted(int(x) for x in s); out = []; i = 0
    while i < len(v):
        j = i
        while j + 1 < len(v) and v[j + 1] == v[j] + 1: j += 1
        out.append(f'{v[i]:05d}' if i == j else f'{v[i]:05d}-{v[j]:05d}'); i = j + 1
    return ' '.join(out)
lines = []
for k, c in sorted(com.items(), key=lambda kv: kv[1]['n'].lower()):
    x, y = P(c['lon'], c['lat'])
    alt = f"/{c['a']}" if c['a'] else ''
    lines.append(f"{c['n']}{alt};{c['s']};{regioni.index(c['r'])};{x:.1f};{y:.1f};{caps(c['cap'])};{c['b']};{'1' if c['cl'] else ''}")

# --- confini: semplificati, proiettati, in percorsi SVG con coordinate intere relative ---
def path(geom, tol):
    g = geom.simplify(tol, preserve_topology=True)
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    out = []
    for p in polys:
        if p.area < tol * tol * 6: continue   # isolotti più piccoli di qualche pixel
        for ring in [p.exterior]:
            pts = [P(lon, lat) for lon, lat in ring.coords]
            q = [(round(x), round(y)) for x, y in pts]
            dd = [q[0]] + [b for a, b in zip(q, q[1:]) if a != b]
            if len(dd) < 4: continue
            s = f'M{dd[0][0]} {dd[0][1]}' + 'l' + ' '.join(f'{b[0]-a[0]} {b[1]-a[1]}' for a, b in zip(dd, dd[1:])) + 'z'
            out.append(s)
    return ''.join(out)
prov = json.load(open(prov_src, encoding='utf-8'))
reg = json.load(open(reg_src, encoding='utf-8'))
PR = {}
for f in prov['features']:
    pr = f['properties']; g = shape(f['geometry'])
    cx, cy = P(g.representative_point().x, g.representative_point().y)
    PR[pr['prov_acr']] = {'n': pr['prov_name'], 'r': pr['reg_name'], 'd': path(g, 0.006), 'c': [round(cx), round(cy)]}
RG = {}
for f in reg['features']:
    pr = f['properties']; g = shape(f['geometry'])
    RG[pr['reg_name']] = path(g, 0.006)
italia = path(unary_union([shape(f['geometry']) for f in reg['features']]), 0.006)

js = ('/* Comuni italiani con coordinate e confini di province e regioni: generato da tools/geo_it.py.\n'
      '   Comuni: database dei comuni italiani di Garda Informatica (MIT), allineato a ISTAT. Confini: ISTAT, CC BY 4.0 (via openpolis). */\n'
      'const GEO_IT = ' + json.dumps({
          'proj': {'lon0': LON0, 'lat1': LAT1, 'k': K, 'w': W, 'h': round(H, 1)},
          'regioni': regioni,
          'comuni': '|'.join(lines),
          'province': PR,
          'reg': RG,
          'italia': italia,
          'fonte': 'Confini: ISTAT (CC BY 4.0). Comuni: Garda Informatica (MIT).',
      }, ensure_ascii=False, separators=(',', ':')) + ';\n')
open('src/geo-it.js', 'w', encoding='utf-8').write(js)
print(len(com), 'comuni', len(PR), 'province', len(RG), 'regioni', len(js), 'byte')
