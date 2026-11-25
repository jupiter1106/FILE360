#!/usr/bin/env python3
"""Stress test rapido, nella suite: Oscura su dati nascosti fuori dal testo (nessun dato deve restare) e firme
(certificato inventato mai «valido», manomissione riconosciuta). Uso: python3 test/stress/quick.py"""
import json, os, subprocess, sys, warnings; warnings.filterwarnings('ignore')
S = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, S)
for ph in ('privacy', 'firme'): subprocess.run(['node', os.path.join(S, 'stress.js'), ph], check=False, capture_output=True, timeout=900)
import check, glob
fails = []
for f in glob.glob(os.path.join(S, 'out', 'privacy', 'oscura', '*.pdf')):
    src = 'privacy-nascosti.pdf' if 'privacy' in os.path.basename(f) else 'testo-nascosto.pdf'
    left = check.leaks(check.pdf_facts(f), check.ATT[src]['segreti'])
    print(('✓' if not left else '✗'), 'Oscura', os.path.basename(f)[:40], 'dati rimasti:', left or 'nessuno'); left and fails.append(f)
for l in open(os.path.join(S, 'out', 'log-firme.jsonl')):
    r = json.loads(l); t = r.get('extra') or ''
    bad = (r['label'] == 'firma-falsa.pdf.p7m' and (not 'certificatore non è riconosciuto' in t or 'Tutte le firme sono valide' in t)) or (r['label'] == 'firma-manomessa.pdf.p7m' and 'non valida' not in t)
    print(('✗' if bad else '✓'), 'Firme', r['label']); bad and fails.append(r['label'])
print('\nstress rapido: ' + ('tutto a posto' if not fails else f'{len(fails)} problemi'))
sys.exit(1 if fails else 0)
