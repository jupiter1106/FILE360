#!/usr/bin/env python3
"""Mostra le regole CSS i cui selettori corrispondono a un'espressione regolare (con il contesto @media)."""
import re, sys
css = open(sys.argv[1], encoding='utf-8').read(); css = re.sub(r'@font-face\{[^}]*\}', '', css); css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
pat = re.compile(sys.argv[2]); maxlen = int(sys.argv[3]) if len(sys.argv) > 3 else 400
i = 0; n = len(css); stack = []
def walk(s, ctx):
    pos = 0
    while pos < len(s):
        m = re.compile(r'([^{}]+)\{').search(s, pos)
        if not m: break
        sel = m.group(1).strip(); depth = 1; j = m.end()
        while j < len(s) and depth: depth += s[j] == '{'; depth -= s[j] == '}'; j += 1
        body = s[m.end():j - 1]
        if sel.startswith('@media') or sel.startswith('@supports'): walk(body, ctx + [sel])
        elif sel.startswith('@'): pass
        elif pat.search(sel): print((' '.join(ctx) + ' ' if ctx else '') + sel + '{' + body[:maxlen] + ('…' if len(body) > maxlen else '') + '}')
        pos = j
walk(css, [])
