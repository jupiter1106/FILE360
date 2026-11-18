#!/usr/bin/env python3
"""Genera src/ds-hue.css: ogni regola storica che usa la tinta dello strumento (--hue) o l'accento come colore
   del testo o come riempimento viene ridefinita con le varianti a contrasto garantito del design system
   (--hue-ink, --hue-fill, --hue-soft, --accent-fill). Si rilancia se cambia style.css."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
css = (root / 'src' / 'style.css').read_text(encoding='utf-8')
css = re.sub(r'@font-face\{[^}]*\}', '', css); css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
out = []
def fix(body):
    d = []
    for decl in body.split(';'):
        if ':' not in decl: continue
        p, v = decl.split(':', 1); p = p.strip(); v0 = v.strip()
        if p.startswith('--'): continue
        v = v0
        if p == 'color':
            v = re.sub(r'color-mix\(in srgb,\s*var\(--hue\)\s*\d+%,\s*#fff\)', 'var(--hue-ink)', v)
            v = v.replace('var(--hue)', 'var(--hue-ink)')
        elif p in ('background', 'background-color'):
            if re.fullmatch(r'var\(--hue\)', v): v = 'var(--hue-fill)'
            elif re.fullmatch(r'var\(--accent\)', v): v = 'var(--accent-fill)'
            else:
                v = re.sub(r'color-mix\(in srgb,\s*var\(--hue\)\s*(var\(--tint,\s*)?(1[0-9]|[6-9])%\)?,\s*(transparent|var\(--surface\))\)', 'var(--hue-soft)', v)
        elif p in ('border-color', 'outline-color', 'outline', 'border', 'border-bottom-color', 'fill', 'stroke'):
            if p in ('fill', 'stroke'): v = v.replace('var(--hue)', 'var(--hue-ink)')
        if v != v0: d.append(f'{p}:{v}')
    return ';'.join(d)
def walk(s, ctx):
    pos = 0; rx = re.compile(r'([^{}]+)\{')
    while True:
        m = rx.search(s, pos)
        if not m: break
        sel = m.group(1).strip(); depth = 1; j = m.end()
        while j < len(s) and depth: depth += s[j] == '{'; depth -= s[j] == '}'; j += 1
        body = s[m.end():j - 1]
        if sel.startswith('@media') or sel.startswith('@supports'):
            n0 = len(out); out.append(sel + '{'); walk(body, ctx + [sel])
            if len(out) == n0 + 1: out.pop()
            else: out.append('}')
        elif not sel.startswith('@'):
            f = fix(body)
            if f: out.append(sel + '{' + f + '}')
        pos = j
walk(css, [])
txt = '/* GENERATO da tools/gen_hue.py — non modificare a mano */\n' + '\n'.join(out) + '\n'
(root / 'src' / 'ds-hue.css').write_text(txt, encoding='utf-8'); print(len(out), 'regole,', len(txt), 'byte')
