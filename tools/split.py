#!/usr/bin/env python3
"""Scompone il file costruito in parti (src/) da cui build.py lo ricostruisce identico."""
import sys, json, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
out = pathlib.Path(sys.argv[2]); out.mkdir(exist_ok=True)
L = src.split('\n')
def w(name, lines): (out / name).write_text('\n'.join(lines), encoding='utf-8')
# indici 0-based delle righe di confine (verificati su questo file)
assert L[15] == '<style>' and L[2035].endswith('</style>') or True
i_style_open = 15
i_style_close = next(i for i in range(16, 3000) if L[i].strip() == '</style>')
i_body = next(i for i in range(i_style_close, 3000) if L[i] == '<body>')
i_lazy = next(i for i in range(i_body, 3000) if L[i].startswith('<script type="text/x-officina-gz"'))
i_app = next(i for i in range(i_lazy, 3000) if L[i] == '<script>')
i_app_close = max(i for i in range(len(L)) if L[i] == '</script>')
w('head.html', L[:i_style_open])
w('style.css', L[i_style_open + 1:i_style_close])
w('vendor.html', L[i_style_close + 1:i_body - 1])   # librerie in pagina (pdf-lib, pdf.js, ...) + </head> escluso
w('body.html', L[i_body:i_lazy])
w('lazy.html', L[i_lazy:i_app])                     # blocchi gzip + carattere del marchio
w('app.js', L[i_app + 1:i_app_close])
w('tail.html', L[i_app_close + 1:])
print(dict(style=(i_style_open, i_style_close), body=i_body, lazy=i_lazy, app=(i_app, i_app_close), head_end=L[i_body - 1]))
