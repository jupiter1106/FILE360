#!/usr/bin/env python3
"""Dati della mappa stradale (Analisi delle vendite).

  civici  CARTELLA_REGIONI  [USCITA=dati/mappa/civici]
      Dagli indici per regione di tools/indirizzi_it.py, un file per provincia (PR.json.gz): il programma legge solo
      le province dove ci sono clienti.

  province  italia.pmtiles  confini_province.geojson  [USCITA=dati/mappa/province]
      Il dettaglio (strade, edifici, nomi delle vie: livelli 6-14) diviso per provincia, PR.pmtiles, con 1 km di
      margine oltre il confine. Il programma legge solo le province dove ci sono clienti; il resto d'Italia resta la
      mappa d'insieme. I confini sono quelli ISTAT di openpolis/geojson-italy (limits_IT_provinces.geojson, CC BY 4.0).

  tessere  file.pmtiles  USCITA  [--pezzo=MB]
      Un archivio in pezzi (0000.bin, 0001.bin, …) con manifest.json: un sito statico lo serve senza file grandi;
      il programma legge solo i byte delle zone guardate (richieste parziali).

  confini  confini_province.geojson  [USCITA=src/vendor/mappa/confini.json]
      I confini delle province e delle regioni semplificati a 80 m: contorni delle zone con clienti e sagoma della
      regione quando i clienti sono tutti in una regione. Anelli in decimillesimi di grado, a differenze.

  insieme  italia.pmtiles
      L'Italia d'insieme: livelli 0-5 (nel file unico) e 0-7 (sul sito), senza uso e copertura del suolo, che a
      quelle scale si vedono appena e pesano più di metà (src/vendor/mappa/italia-insieme-z5/z7.pmtiles).

  cartella  USCITA
      La cartella «mappa-italia» da scegliere nel programma (file unico, senza rete): insieme.pmtiles (Italia
      d'insieme, livelli 0-7), province/PR.pmtiles, civici/PR.json.gz.

La mappa dell'Italia (Protomaps, © OpenStreetMap, ODbL) si estrae con go-pmtiles (2,3 GB, solo per preparare i dati):
  go-pmtiles extract https://build.protomaps.com/AAAAMMGG.pmtiles italia.pmtiles --bbox=6.55,35.45,18.55,47.1 --maxzoom=14
"""
import sys, os, json, gzip, glob, shutil, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PEZZO = 8 * 1024 * 1024


def civici(src, out=ROOT / 'dati' / 'mappa' / 'civici'):
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True)
    prov, fonte, n = {}, '', 0
    for f in sorted(glob.glob(os.path.join(src, '*.json.gz'))):
        d = json.loads(gzip.open(f, 'rt', encoding='utf-8').read()); fonte = d.get('fonte', fonte)
        for k, rows in d['comuni'].items():
            prov.setdefault(k.rsplit('|', 1)[1], {})[k] = rows
    for p, comuni in sorted(prov.items()):
        js = json.dumps({'v': 1, 'prov': p, 'fonte': fonte, 'comuni': comuni}, ensure_ascii=False, separators=(',', ':'))
        with gzip.GzipFile(out / f'{p}.json.gz', 'wb', compresslevel=9, mtime=0) as g: g.write(js.encode('utf-8'))
        n += sum(len(r[3].split(';')) if r[3] else 0 for rows in comuni.values() for r in rows)
    tot = sum(f.stat().st_size for f in out.glob('*.json.gz'))
    print(f'{len(prov)} province, {n:,} civici, {tot / 1e6:.1f} MB in {out}')


def tessere(pm, out, pezzo=PEZZO):
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True)
    size = os.path.getsize(pm); n = 0
    with open(pm, 'rb') as f:
        while True:
            b = f.read(pezzo)
            if not b: break
            dst = out / f'{n:04d}.bin'
            if not (dst.exists() and dst.stat().st_size == len(b)): dst.write_bytes(b)
            n += 1
    man = {'nome': pathlib.Path(pm).name, 'n': n, 'pezzo': pezzo, 'byte': size}
    (out / 'manifest.json').write_text(json.dumps(man), encoding='utf-8')
    print(f'{n} pezzi da {pezzo // 1048576} MB ({size / 1e9:.2f} GB) in {out}')
    return man


def go_pmtiles():
    for c in (os.environ.get('GO_PMTILES'), shutil.which('go-pmtiles'), shutil.which('pmtiles'), os.path.expanduser('~/go/bin/go-pmtiles')):
        if c and os.path.exists(c): return c
    sys.exit('serve go-pmtiles: go install github.com/protomaps/go-pmtiles@latest')


def province(pm, confini, out=ROOT / 'dati' / 'mappa' / 'province'):
    import subprocess, tempfile
    from shapely.geometry import shape, mapping
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True); exe = go_pmtiles(); tot = 0
    feats = json.load(open(confini, encoding='utf-8'))['features']
    for f in sorted(feats, key=lambda f: f['properties']['prov_acr']):
        pr = f['properties']['prov_acr']; g = shape(f['geometry']).buffer(0.01).simplify(0.002)
        with tempfile.NamedTemporaryFile('w', suffix='.geojson', delete=False) as t: json.dump({'type': 'Feature', 'properties': {}, 'geometry': mapping(g)}, t)
        dst = out / f'{pr}.pmtiles'
        r = subprocess.run([exe, 'extract', pm, str(dst), f'--region={t.name}', '--minzoom=6', '--maxzoom=14', '-q'], capture_output=True, text=True); os.unlink(t.name)
        if r.returncode: sys.exit(f'{pr}: {r.stderr[-400:]}')
        tot += dst.stat().st_size; print(f'{pr} {dst.stat().st_size / 1e6:.1f} MB', flush=True)
    print(f'{len(feats)} province, {tot / 1e9:.2f} GB in {out}')


def confini(src, out=ROOT / 'src' / 'vendor' / 'mappa' / 'confini.json', tol=0.0008):
    from shapely.geometry import shape
    from shapely.ops import unary_union
    def anelli(g, tol=tol):
        g = g.simplify(tol, preserve_topology=True); rings = []
        for p in ([g] if g.geom_type == 'Polygon' else list(g.geoms)):
            if p.area < tol * tol * 20: continue
            c = [(round(x * 1e4), round(y * 1e4)) for x, y in p.exterior.coords]; flat = list(c[0])
            for (a, b), (x, y) in zip(c, c[1:]): flat += [x - a, y - b]
            rings.append(flat)
        return rings
    feats = json.load(open(src, encoding='utf-8'))['features']
    prov, reg, geo = {}, {}, {}
    for f in feats:
        pr, rn = f['properties']['prov_acr'], f['properties']['reg_name']
        prov[pr] = anelli(shape(f['geometry'])); reg[pr] = rn; geo.setdefault(rn, []).append(shape(f['geometry']).buffer(0.0005))
    regioni = {rn: anelli(unary_union(gs).buffer(-0.0005), 0.0015) for rn, gs in geo.items()}
    pathlib.Path(out).write_text(json.dumps({'province': prov, 'reg': reg, 'regioni': regioni}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(prov), 'province,', len(regioni), 'regioni,', pathlib.Path(out).stat().st_size, 'byte in', out)


def insieme(pm):
    import subprocess, tempfile
    exe = go_pmtiles(); V = ROOT / 'src' / 'vendor' / 'mappa'
    for z in (5, 7):
        with tempfile.TemporaryDirectory() as d:
            t = os.path.join(d, 'z.pmtiles')
            subprocess.run([exe, 'extract', pm, t, f'--maxzoom={z}', '-q'], check=True)
            n = senza_strati(t, V / f'italia-insieme-z{z}.pmtiles', {'landuse', 'landcover'})
        print(f'livelli 0-{z}: {n / 1e6:.2f} MB')


def senza_strati(src, dst, via):
    """copia un archivio togliendo alcuni strati da ogni tessera (lettura del protobuf al primo livello: nessuna
    geometria toccata)"""
    from pmtiles.reader import Reader, MmapSource, all_tiles
    from pmtiles.writer import Writer
    from pmtiles.tile import zxy_to_tileid
    def varint(b, i):
        r = s = 0
        while True:
            c = b[i]; i += 1; r |= (c & 0x7f) << s; s += 7
            if c < 0x80: return r, i
    def enc(n):
        o = bytearray()
        while True:
            b = n & 0x7f; n >>= 7
            if n: o.append(b | 0x80)
            else: o.append(b); return bytes(o)
    def campi(t):
        i = 0
        while i < len(t):
            k, i = varint(t, i)
            if k & 7 == 2: n, i = varint(t, i); yield k >> 3, t[i:i + n]; i += n
            elif k & 7 == 0: _, i = varint(t, i)
            else: raise ValueError('tessera non valida')
    nome = lambda l: next((v.decode() for f, v in campi(l) if f == 1), '')
    with open(src, 'rb') as fh:
        r = Reader(MmapSource(fh)); h = r.header(); md = r.metadata(); tiles = []
        for zxy, d in all_tiles(r.get_bytes):
            t = gzip.decompress(d); out = bytearray()
            for f, v in campi(t):
                if f == 3 and nome(v) in via: continue
                out += enc((f << 3) | 2) + enc(len(v)) + v
            tiles.append((zxy_to_tileid(*zxy), gzip.compress(bytes(out), 9, mtime=0)))
    tiles.sort()
    with open(dst, 'wb') as o:
        w = Writer(o)
        for tid, d in tiles: w.write_tile(tid, d)
        w.finalize(h, md)
    return os.path.getsize(dst)


def cartella(out):
    out = pathlib.Path(out); (out / 'civici').mkdir(parents=True, exist_ok=True); (out / 'province').mkdir(exist_ok=True)
    def copia(a, b):
        if b.exists() and b.stat().st_size == a.stat().st_size: return
        b.unlink(missing_ok=True)
        try: os.link(a, b)            # stesso disco: nessuna copia
        except OSError: shutil.copyfile(a, b)
    for f in (ROOT / 'dati' / 'mappa' / 'civici').glob('*.json.gz'): copia(f, out / 'civici' / f.name)
    for f in (ROOT / 'dati' / 'mappa' / 'province').glob('*.pmtiles'): copia(f, out / 'province' / f.name)
    copia(ROOT / 'src' / 'vendor' / 'mappa' / 'italia-insieme-z7.pmtiles', out / 'insieme.pmtiles')
    if not any((out / 'province').iterdir()): print('  nota: senza dati/mappa/province la cartella ha solo l’Italia d’insieme e gli indirizzi')
    (out / 'LEGGIMI.txt').write_text('Mappa dettagliata dell\'Italia per «Analisi delle vendite» di file360.\n'
        'Nel programma: scheda Mappa › Strade › «Scegli la cartella della mappa», e scegli questa cartella.\n'
        'Tutto resta sul dispositivo. Dati © OpenStreetMap contributors (ODbL), tessere Protomaps.\n', encoding='utf-8')
    print('cartella pronta:', out)


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]; o = dict(x[2:].split('=', 1) for x in sys.argv[1:] if x.startswith('--') and '=' in x)
    if not a: sys.exit(__doc__)
    if a[0] == 'civici': civici(a[1], *a[2:3])
    elif a[0] == 'tessere': tessere(a[1], a[2], int(float(o.get('pezzo', 8)) * 1048576))
    elif a[0] == 'province': province(a[1], a[2], *a[3:4])
    elif a[0] == 'confini': confini(a[1], *a[2:3])
    elif a[0] == 'insieme': insieme(a[1])
    elif a[0] == 'cartella': cartella(a[1])
    else: sys.exit(__doc__)
