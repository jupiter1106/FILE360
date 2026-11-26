#!/usr/bin/env python3
"""Controllo: ogni strumento (TOOLS) usa un'icona che esiste nel set (ICONS). Un nome sbagliato non dà errori ma
lascia la casella vuota nella home e nel menu: per questo serve un controllo esplicito."""
import re, pathlib, sys
A = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'app'
icone = set(re.findall(r"^\s+([a-z0-9]+):'<", (A / '00-avvio.js').read_text(encoding='utf-8'), re.M))
usate = set(re.findall(r"icon: '([a-z0-9]+)'", (A / '01-motore-testo-pdf.js').read_text(encoding='utf-8')))
manca = sorted(usate - icone)
print(f'{len(usate)} icone usate dagli strumenti, {len(icone)} nel set' + (f'; mancano: {", ".join(manca)}' if manca else ': tutte presenti'))
sys.exit(1 if manca else 0)
