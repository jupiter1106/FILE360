#!/usr/bin/env python3
"""vercel.json dalla cartella del sito: Vercel pubblica sito/ (già compilato, nessuna compilazione) con le stesse
intestazioni di sicurezza e gli stessi rinvii che Netlify legge da sito/_headers e sito/_redirects.
Uso: python3 tools/vercel_json.py [cartella del sito, predefinita: sito]"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sito = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'sito'
regole, cur = [], None
for riga in (sito / '_headers').read_text(encoding='utf-8').splitlines():
    if not riga.strip(): continue
    if not riga.startswith(' '):
        src = riga.strip()
        src = '/(.*)' if src == '/*' else src.replace('/*', '/(.*)')
        cur = {'source': src, 'headers': []}; regole.append(cur)
    else:
        k, v = riga.strip().split(':', 1); cur['headers'].append({'key': k.strip(), 'value': v.strip()})
rinvii = []
for riga in (sito / '_redirects').read_text(encoding='utf-8').splitlines():
    p = riga.split()
    if len(p) >= 2: rinvii.append({'source': p[0], 'destination': p[1], 'permanent': (p[2] if len(p) > 2 else '301') in ('301', '308')})
cfg = {'$schema': 'https://openapi.vercel.sh/vercel.json', 'framework': None, 'installCommand': '', 'buildCommand': "echo 'file360: il sito è già compilato in sito/'",
       'outputDirectory': sito.name, 'trailingSlash': True, 'headers': regole, 'redirects': rinvii}
(ROOT / 'vercel.json').write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('vercel.json:', len(regole), 'regole di intestazioni,', len(rinvii), 'rinvii, pubblica', sito.name + '/')
