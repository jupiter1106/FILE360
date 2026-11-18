#!/usr/bin/env python3
"""Controlla i file prodotti dallo stress test (test/stress/out/<fase>/<strumento>/<prova>__<nome>) con strumenti esterni:
validità (pikepdf, PyMuPDF), conservazione rispetto all'originale (pagine, segnalibri, link, campi, commenti, allegati,
struttura per l'accessibilità, testo), dati personali rimasti (testo, commenti, campi, metadati, XMP, allegati, segnalibri),
PDF/A con veraPDF, Word ed Excel aperti con python-docx/openpyxl e LibreOffice. Scrive out/controlli.json."""
import json, os, re, subprocess, sys, tempfile, zipfile, warnings
warnings.filterwarnings('ignore')
import pikepdf, fitz
S = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(S, 'out'); CORPUS = os.path.join(S, 'corpus')
VERA = os.environ.get('VERAPDF', '/tmp/claude-0/-home-user/d8050b4f-331e-5402-b1a5-64fe8b9c6072/scratchpad/vera/app/verapdf')
ATT = json.load(open(os.path.join(CORPUS, 'attese.json')))
norm = lambda s: re.sub(r'[^A-Z0-9]', '', (s or '').upper())

def pdf_facts(path, pw=''):
    f = {'ok': True}
    try:
        with pikepdf.open(path, password=pw) as p:
            f['pike_problemi'] = len(p.check_pdf_syntax())
            f['tag'] = '/StructTreeRoot' in p.Root
            f['allegati'] = len(p.attachments)
            f['cifrato'] = p.is_encrypted
            xmp = ''
            try:
                if '/Metadata' in p.Root: xmp = p.Root.Metadata.read_bytes().decode('utf8', 'ignore')
            except Exception: pass
            att = ''
            for n, spec in p.attachments.items():
                try: att += n + ' ' + spec.get_file().read_bytes().decode('utf8', 'ignore')
                except Exception: att += n
            info = ' '.join(str(v) for v in (p.docinfo.values() if p.docinfo is not None else []))
    except Exception as e:
        return {'ok': False, 'errore': ('pikepdf: ' + str(e))[:160]}
    try:
        d = fitz.open(path)
        if d.needs_pass: d.authenticate(pw)
        f['pagine'] = d.page_count; f['segnalibri'] = len(d.get_toc())
        links = [l for p in d for l in p.get_links()]
        f['link_esterni'] = sum(1 for l in links if l.get('uri')); f['link_interni'] = sum(1 for l in links if l.get('kind') in (1, 4) or l.get('page', -1) >= 0 and not l.get('uri'))
        f['campi'] = sum(len(list(p.widgets() or [])) for p in d)
        f['commenti'] = sum(1 for p in d for a in (p.annots() or []) if a.type[1] not in ('Link', 'Widget', 'Popup'))
        text = ''.join(p.get_text() for p in d)
        f['testo_car'] = len(text.strip())
        annot = ' '.join((a.info.get('content') or '') for p in d for a in (p.annots() or []))
        fields = ' '.join(str(w.field_value or '') + ' ' + str(w.field_name or '') for p in d for w in (p.widgets() or []))
        toc = ' '.join(t[1] for t in d.get_toc())
        f['_testi'] = {'testo': text, 'commenti': annot, 'campi': fields, 'metadati': info, 'xmp': xmp, 'allegati': att, 'segnalibri': toc, 'link': ' '.join(l.get('uri', '') for l in links)}
        d.close()
    except Exception as e:
        f['ok'] = False; f['errore'] = ('PyMuPDF: ' + str(e))[:160]
    return f

def leaks(f, secrets):
    out = {}
    for where, t in (f.get('_testi') or {}).items():
        T = norm(t); hit = [s for s in secrets if norm(s) and norm(s) in T]
        if hit: out[where] = hit
    return out

def vera(paths):
    if not os.path.exists(VERA) or not paths: return {}
    res = {}
    for p in paths:
        try:
            o = subprocess.run([VERA, '--format', 'text', p], capture_output=True, text=True, timeout=300).stdout
            res[p] = 'PASS' if re.search(r'^PASS', o, re.M) else ('FAIL' if re.search(r'^FAIL', o, re.M) else o.strip()[:120])
        except Exception as e: res[p] = 'errore ' + str(e)[:60]
    return res

def office_ok(path):
    r = {}
    try:
        if path.endswith('.docx'):
            import docx; d = docx.Document(path); r['testo'] = '\n'.join(p.text for p in d.paragraphs); r['tabelle'] = len(d.tables)
            r['celle'] = [[c.text for c in row.cells] for t in d.tables for row in t.rows][:40]
        if path.endswith('.xlsx'):
            import openpyxl; wb = openpyxl.load_workbook(path); r['fogli'] = wb.sheetnames; ws = wb[wb.sheetnames[0]]
            r['righe'] = [[c for c in row] for row in ws.iter_rows(values_only=True)][:40]
        with tempfile.TemporaryDirectory() as td:
            p = subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', td, path], capture_output=True, text=True, timeout=180)
            pdfs = [x for x in os.listdir(td) if x.endswith('.pdf')]
            r['libreoffice'] = 'si apre' if pdfs else 'NON SI APRE: ' + (p.stderr or p.stdout)[:100]
            if pdfs: r['libreoffice_pagine'] = fitz.open(os.path.join(td, pdfs[0])).page_count
    except Exception as e: r['errore'] = str(e)[:160]
    return r

def unpack(path):
    if path.endswith('.zip'):
        d = path + '.d'; os.makedirs(d, exist_ok=True)
        with zipfile.ZipFile(path) as z: z.extractall(d)
        return [os.path.join(d, n) for n in sorted(os.listdir(d))]
    return [path]

def main():
    res = {'file': {}, 'vera': {}}
    pdfa = []
    for phase in sorted(os.listdir(OUT)):
        pd = os.path.join(OUT, phase)
        if not os.path.isdir(pd): continue
        for tool in sorted(os.listdir(pd)):
            for fn in sorted(os.listdir(os.path.join(pd, tool))):
                full = os.path.join(pd, tool, fn)
                if fn.endswith('.d') or os.path.isdir(full): continue
                label = fn.split('__')[0]
                for f in unpack(full):
                    k = f'{phase}/{tool}/{os.path.relpath(f, os.path.join(pd, tool))}'
                    if f.lower().endswith('.pdf'):
                        pw = 'prova-360' if tool == 'proteggi' else ''
                        facts = pdf_facts(f, pw)
                        src = next((s for s in ATT if s.replace('.pdf', '') in label), None)
                        if src and ATT[src].get('segreti'): facts['dati_rimasti'] = leaks(facts, ATT[src]['segreti'])
                        if tool == 'pdfa': pdfa.append(f)
                        facts.pop('_testi', None) if phase != 'privacy' else None
                        if '_testi' in facts: facts['_testi'] = {k2: v[:300] for k2, v in facts['_testi'].items()}
                        res['file'][k] = facts
                    elif f.lower().endswith(('.docx', '.xlsx')): res['file'][k] = office_ok(f)
                    elif f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.csv', '.txt', '.xml', '.json')): res['file'][k] = {'ok': os.path.getsize(f) > 0, 'byte': os.path.getsize(f)}
                    else: res['file'][k] = {'ok': None, 'byte': os.path.getsize(f)}
    res['vera'] = vera(pdfa)
    # qualità della lettura delle scansioni: parole vere ritrovate nell'ordine (LCS) nel PDF ricercabile e nel Word
    gt = ' '.join(ATT.get('scan-gt.txt', []))
    def words(t): return re.findall(r'[a-z0-9]+', (t or '').lower().replace('à', 'a').replace('è', 'e').replace('é', 'e'))
    def lcs(a, b):
        prev = [0] * (len(b) + 1)
        for x in a:
            cur = [0]
            for j, y in enumerate(b): cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
            prev = cur
        return prev[-1]
    G = words(gt); res['lettura'] = {}
    for k, v in res['file'].items():
        if not k.startswith('scansioni/'): continue
        path = os.path.join(OUT, k)
        t = ''
        try:
            if k.endswith('.pdf'): t = ''.join(p.get_text() for p in fitz.open(path))
            elif k.endswith('.docx'): import docx; t = '\n'.join(p.text for p in docx.Document(path).paragraphs) + ' ' + ' '.join(c.text for tb in docx.Document(path).tables for r in tb.rows for c in r.cells)
            elif k.endswith('.xlsx'): import openpyxl; wb = openpyxl.load_workbook(path); t = ' '.join(str(c) for ws in wb for row in ws.iter_rows(values_only=True) for c in row if c is not None)
        except Exception as e: t = ''
        if G: res['lettura'][k] = round(lcs(G, words(t)) / len(G), 3)
    # originali: per confrontare la conservazione
    res['originali'] = {f: {k: v for k, v in pdf_facts(os.path.join(CORPUS, f), 'utente-360' if f == 'aes256.pdf' else '').items() if k != '_testi'} for f in sorted(os.listdir(CORPUS)) if f.endswith('.pdf') and not f.startswith(('foto-pesanti', 'mille'))}
    json.dump(res, open(os.path.join(OUT, 'controlli.json'), 'w'), ensure_ascii=False, indent=1, default=str)
    print('file controllati:', len(res['file']), '· PDF/A verificati con veraPDF:', len(res['vera']))

if __name__ == '__main__': main()
