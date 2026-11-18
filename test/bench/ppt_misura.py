#!/usr/bin/env python3
"""Misura indipendente di «PDF in PowerPoint»: ogni .pptx si apre con python-pptx e con LibreOffice (che lo disegna in PDF);
il testo disegnato da LibreOffice si confronta con il PDF originale, parola per parola e posizione per posizione.
Uso: ppt_misura.py <cartella con i .pptx> <cartella dei PDF originali> nome1 nome2 …   Stampa JSON (solo numeri)."""
import sys, os, json, subprocess, difflib, statistics as st, re
import pymupdf, pptx
d, fx, names = sys.argv[1], sys.argv[2], sys.argv[3:]
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', os.path.join(d, 'lo')] + [os.path.join(d, n + '.pptx') for n in names], capture_output=True, timeout=600)
LOREM = 'Il presente contratto disciplina i rapporti tra le parti in relazione alla fornitura dei servizi descritti. Le parti convengono quanto segue e si impegnano a rispettarne ogni clausola in buona fede.'
out = {}
for n in names:
    r = {}
    P = pptx.Presentation(os.path.join(d, n + '.pptx'))
    r['diapositive'] = len(P.slides)
    r['caselle'] = sum(1 for s in P.slides for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip())
    r['ruotate'] = sum(1 for s in P.slides for sh in s.shapes if sh.has_text_frame and abs(sh.rotation) > 0.05)
    r['grassetto'] = sum(1 for s in P.slides for sh in s.shapes if sh.has_text_frame for p in sh.text_frame.paragraphs for ru in p.runs if ru.font.bold)
    a, b = pymupdf.open(os.path.join(fx, n + '.pdf')), pymupdf.open(os.path.join(d, 'lo', n + '.pdf'))
    r['pagine'] = [len(a), len(b)]
    wa_all = [w for p in a for w in p.get_text('words')]
    if wa_all:
        tot = placed = 0; dx = []; dy = []
        for i in range(min(len(a), len(b))):
            k = b[i].rect.width / a[i].rect.width; wa, wb = a[i].get_text('words'), b[i].get_text('words')
            for w in wa:
                tot += 1; c = [v for v in wb if v[4] == w[4]]
                if not c: continue
                v = min(c, key=lambda v: abs(v[0] / k - w[0]) + abs(v[3] / k - w[3]))
                if abs(v[0] / k - w[0]) < 3 and abs(v[3] / k - w[3]) < 3: placed += 1; dx.append(abs(v[0] / k - w[0])); dy.append(abs(v[3] / k - w[3]))
        r['al_posto'] = round(100 * placed / max(1, tot), 1); r['dx'] = round(st.median(dx), 2) if dx else None; r['dy'] = round(st.median(dy), 2) if dy else None
    else:
        # scansione di prova: il testo con cui è stata creata (titolo + 30 righe per pagina)
        ref = []
        for p in range(1, len(a) + 1):
            ref += 'Verbale di assemblea ordinaria'.split()
            for k in range(30): ref += ('Riga ' + str(k + 1) + ' della pagina ' + str(p) + '. ' + LOREM)[:78].split()
        got = [w[4] for p in b for w in p.get_text('words')]
        sm = difflib.SequenceMatcher(None, ref, got, autojunk=False)
        r['parole_esatte'] = round(100 * sum(x.size for x in sm.get_matching_blocks()) / len(ref), 1)
    out[n] = r
print(json.dumps(out))
