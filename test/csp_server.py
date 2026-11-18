#!/usr/bin/env python3
"""Serve dist/netlify come Netlify: intestazioni di _headers (anche le regole con *), cartelle con index.html,
   pagina 404.html per gli indirizzi sconosciuti, tipi giusti per wasm e manifest.
   Uso: python3 test/csp_server.py PORTA [cartella]"""
import http.server, os, sys, functools, fnmatch
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'netlify')
rules, cur = [], None
for line in open(os.path.join(ROOT, '_headers'), encoding='utf-8'):
    if not line.strip(): continue
    if not line.startswith(' '): cur = [line.strip(), []]; rules.append(cur)
    else: k, v = line.strip().split(':', 1); cur[1].append((k.strip(), v.strip()))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
                      '.js': 'text/javascript', '.json': 'application/json', '.gz': 'application/gzip'}
    def end_headers(self):
        p = self.path.split('?')[0]
        for pat, hs in rules:
            if fnmatch.fnmatchcase(p, pat):
                for k, v in hs:
                    if k.lower() == 'content-type': continue
                    self.send_header(k, v)
        super().end_headers()
    def send_error(self, code, message=None, explain=None):
        if code == 404 and os.path.exists(os.path.join(ROOT, '404.html')):
            body = open(os.path.join(ROOT, '404.html'), 'rb').read()
            self.send_response(404); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers()
            if self.command != 'HEAD': self.wfile.write(body)
            return
        super().send_error(code, message, explain)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), functools.partial(H, directory=ROOT)).serve_forever()
