#!/usr/bin/env python3
"""Caratteri liberi con le stesse misure dei 14 caratteri standard dei PDF (Liberation Sans/Serif/Mono: stessa larghezza
di ogni lettera di Helvetica/Arial, Times e Courier), ridotti ai caratteri della codifica WinAnsi (documenti occidentali),
con le misure per i dizionari del PDF già calcolate. Servono a PDF/A per incorporare i caratteri che il file non contiene,
invece di trasformare le pagine in immagini. Scrive src/stdfonts.json. Uso: python3 tools/stdfonts.py"""
import base64, io, json, pathlib
from fontTools.ttLib import TTFont
from fontTools import subset
SRC = pathlib.Path('/usr/share/fonts/truetype/liberation')
FAM = {'sans': 'LiberationSans', 'serif': 'LiberationSerif', 'mono': 'LiberationMono'}
STY = {'': 'Regular', 'b': 'Bold', 'i': 'Italic', 'bi': 'BoldItalic'}
win = {}
for c in range(32, 256):
    try: win[c] = bytes([c]).decode('cp1252')
    except UnicodeDecodeError: pass
# codici senza carattere oltre lo spazio: per la norma PDF in WinAnsiEncoding valgono il pallino
for c in (127, 0x81, 0x8D, 0x8F, 0x90, 0x9D): win[c] = '\u2022'
# glifi della codifica dei campi dei moduli (PDFDocEncoding: accenti isolati, frazione, meno, legature)
EXTRA = {0x2D8, 0x2C7, 0x2C6, 0x2D9, 0x2DD, 0x2DB, 0x2DA, 0x2DC, 0x2044, 0x2212, 0xFB01, 0xFB02, 0x131}
out = {}
for fk, fn in FAM.items():
    for sk, sn in STY.items():
        path = SRC / f'{fn}-{sn}.ttf'
        opts = subset.Options(); opts.hinting = False; opts.name_IDs = ['*']; opts.notdef_outline = True; opts.layout_features = []; opts.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'kern', 'DSIG']
        f = TTFont(path); s = subset.Subsetter(opts); s.populate(unicodes=list({ord(ch) for ch in win.values()} | set(range(0x100, 0x180)) | EXTRA)); s.subset(f)
        buf = io.BytesIO(); f.save(buf); ttf = buf.getvalue()
        upem = f['head'].unitsPerEm; k = 1000 / upem; cmap = f.getBestCmap(); hmtx = f['hmtx'].metrics
        widths = [round(hmtx[cmap[ord(win[c])]][0] * k) if c in win and ord(win[c]) in cmap else round(hmtx['.notdef'][0] * k) for c in range(32, 256)]
        h = f['head']; os2 = f['OS/2']; post = f['post']
        out[fk + sk] = {'name': f'{fn}-{sn}', 'ttf': base64.b64encode(ttf).decode(), 'widths': widths,
                        'bbox': [round(h.xMin * k), round(h.yMin * k), round(h.xMax * k), round(h.yMax * k)],
                        'ascent': round(os2.sTypoAscender * k), 'descent': round(os2.sTypoDescender * k), 'cap': round(getattr(os2, 'sCapHeight', 700) * k) or 700,
                        'italic': float(post.italicAngle), 'stemv': 140 if 'b' in sk else 80, 'flags': (1 if fk == 'mono' else 0) | (2 if fk == 'serif' else 0) | 32 | (64 if 'i' in sk else 0)}
dst = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'stdfonts.json'
dst.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
print(dst, len(out), 'caratteri,', dst.stat().st_size // 1024, 'KB')
