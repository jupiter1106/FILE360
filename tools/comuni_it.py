#!/usr/bin/env python3
"""Genera src/comuni-it.js: i comuni italiani (elenco ISTAT) e le sigle delle province, per Oscura (PiiKit).
I nomi che sono anche parole comuni («Bella», «Calcio», «Lettere») si riconoscono solo nel contesto
(«a/in/di …», «(XX)»): l'elenco «ambigui» viene da un corpus di testi web (minuscole frequenti).
Uso: python3 tools/comuni_it.py Elenco-comuni-italiani.csv ambigui.json"""
import csv, json, sys
rows = list(csv.reader(open(sys.argv[1], encoding='latin1'), delimiter=';'))[1:]
com = sorted({r[6].strip() for r in rows if r[6].strip()}, key=lambda s: s.lower())
sig = sorted({r[14].strip() for r in rows if r[14].strip()})
amb = sorted(set(json.load(open(sys.argv[2]))))
js = ('/* Comuni italiani (ISTAT, Elenco dei comuni) e sigle delle province: generato da tools/comuni_it.py. */\n'
      f'const COMUNI_IT = {{ nomi: {json.dumps("|".join(com), ensure_ascii=False)}, sigle: {json.dumps(" ".join(sig))}, ambigui: {json.dumps(" ".join(amb), ensure_ascii=False)} }};\n')
open('src/comuni-it.js', 'w').write(js); print(len(com), 'comuni', len(sig), 'sigle', len(amb), 'ambigui', len(js), 'byte')
