#!/usr/bin/env python3
"""Serve dist/netlify con le intestazioni di _headers (come Netlify), per provare la Content-Security-Policy in locale.
   Uso: python3 test/csp_server.py PORTA"""
import http.server, os, sys, functools
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'netlify')
rules, cur = [], None
for line in open(os.path.join(ROOT, '_headers'), encoding='utf-8'):
    if not line.strip(): continue
    if not line.startswith(' '): cur = [line.strip(), []]; rules.append(cur)
    else: k, v = line.strip().split(':', 1); cur[1].append((k.strip(), v.strip()))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for pat, hs in rules:
            if pat == '/*' or self.path.split('?')[0] == pat:
                for k, v in hs: self.send_header(k, v)
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), functools.partial(H, directory=ROOT)).serve_forever()
