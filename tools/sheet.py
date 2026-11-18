#!/usr/bin/env python3
"""Taglia uno screenshot lungo in colonne affiancate, per guardarlo tutto in una volta. uso: sheet.py in.png out.png [altezza colonna px] [scala]"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); H = int(sys.argv[3]) if len(sys.argv) > 3 else 2400; sc = float(sys.argv[4]) if len(sys.argv) > 4 else 1
if sc != 1: im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
n = -(-im.height // H); out = Image.new('RGB', (n * (im.width + 12), min(H, im.height)), '#888')
for i in range(n): out.paste(im.crop((0, i * H, im.width, min(im.height, (i + 1) * H))), (i * (im.width + 12), 0))
out.save(sys.argv[2]); print(out.size)
