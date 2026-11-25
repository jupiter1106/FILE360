#!/usr/bin/env python3
"""Divide src/app.js in moduli (src/app/NN-nome.js), tagliando solo dove comincia una sezione del codice (una riga
di commento «/* ---- … » o «/* ==== … » a inizio riga, dopo un'istruzione chiusa), con file di al massimo ~2.800 righe.
build.py li riunisce nell'ordine dei nomi: il file prodotto resta identico byte per byte (verificato qui sotto).
Uso: python3 tools/moduli.py [cartella di destinazione]   (senza argomenti: src/app/, e src/app.js viene tolto)"""
import re, sys, pathlib, unicodedata
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'src' / 'app.js').read_text(encoding='utf-8')
L = src.split('\n')
MAX = 2800
head = re.compile(r'^/\* ?(=|-){4,}|^/\* -+ ')
cands = [i for i in range(1, len(L)) if head.match(L[i]) and (not L[i - 1].strip() or re.search(r'[;})\]]\s*$|\*/\s*$', L[i - 1]))]
cuts, start = [0], 0
while True:
    if len(L) - start <= MAX: break
    ok = [c for c in cands if start + 300 < c <= start + MAX]
    if not ok: ok = [c for c in cands if c > start + 300][:1]
    if not ok: break
    start = ok[-1]; cuts.append(start)
cuts.append(len(L))
def name(i):
    # il nome della sezione: le parole della riga di commento (o di quella sotto, se è solo una riga di segni)
    for t in L[i:i + 3]:
        w = re.sub(r'[/*=\-—·:().,\'«»"]+', ' ', t).strip()
        if len(w) > 3: break
    w = unicodedata.normalize('NFKD', w).encode('ascii', 'ignore').decode().lower()
    w = '-'.join(re.findall(r'[a-z0-9]+', w)[:4]) or 'parte'
    return w
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'src' / 'app'
out.mkdir(parents=True, exist_ok=True)
for f in out.glob('*.js'): f.unlink()
files = []
for k, (a, b) in enumerate(zip(cuts, cuts[1:])):
    fn = out / f'{k:02d}-{name(a) if k else "avvio"}.js'
    fn.write_text('\n'.join(L[a:b]), encoding='utf-8'); files.append(fn)
# verifica: riuniti, i moduli danno esattamente app.js
joined = '\n'.join(f.read_text(encoding='utf-8') for f in sorted(out.glob('*.js')))
assert joined == src, 'i moduli riuniti non danno app.js'
print(f'{len(files)} moduli, il più lungo {max(b - a for a, b in zip(cuts, cuts[1:]))} righe')
for f in files: print(' ', f.name, len(f.read_text(encoding="utf-8").split(chr(10))))
if len(sys.argv) == 1: (ROOT / 'src' / 'app.js').unlink(); print('src/app.js tolto: build.py usa src/app/')
