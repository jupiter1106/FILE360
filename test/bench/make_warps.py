#!/usr/bin/env python3
"""Banco di prova per l'OCR su fogli non piatti: pagine con testo NOTO, deformate (storte, a pancia, ondulate, vicino
   alla rilegatura, fotografate in prospettiva). Scrive warps/*.jpg e warps/*.txt (il testo vero, riga per riga)."""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'warps'); os.makedirs(OUT, exist_ok=True)
F = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'; FB = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'
WORDS = ('il dipendente è tenuto a svolgere la propria attività con diligenza e correttezza nel rispetto delle direttive ricevute '
         'e delle norme di legge vigenti; la prestazione di lavoro straordinario deve essere autorizzata dal responsabile della struttura '
         'sulla base delle esigenze organizzative individuate. Il trattamento economico è quello previsto dal contratto collettivo nazionale '
         'di lavoro del comparto, corrisposto insieme alla tredicesima mensilità e a ogni altro emolumento accessorio di spettanza. '
         'Le parti dichiarano di accettare tutte le clausole del presente accordo, che viene letto, confermato e sottoscritto in data odierna. '
         'Importo complessivo: 1.229,84 euro; protocollo n. 55943 del 17/09/2026; codice 19-2020041422.').split()
def page(seed, w=1240, h=1754):
    rnd = random.Random(seed); im = Image.new('RGB', (w, h), (251, 250, 247)); d = ImageDraw.Draw(im); f = ImageFont.truetype(F, 30); fb = ImageFont.truetype(FB, 34)
    lines = []; y = 150; k = seed * 7
    def put(txt, font, x=120): 
        nonlocal y; d.text((x, y), txt, font=font, fill=(28, 28, 32)); lines.append(txt); y += 46
    while y < h - 200:
        if rnd.random() < 0.18: y += 20; t = 'ART. %d – %s' % (rnd.randint(1, 20), rnd.choice(['OBBLIGHI DEL DIPENDENTE', 'TRATTAMENTO ECONOMICO', 'LAVORO STRAORDINARIO', 'DISPOSIZIONI FINALI'])); d.text(((w - d.textlength(t, font=fb)) / 2, y), t, font=fb, fill=(28, 28, 32)); lines.append(t); y += 66; continue
        n = rnd.randint(2, 5)
        for _ in range(n):
            line = ''
            while True:
                wd = WORDS[k % len(WORDS)]
                if d.textlength((line + ' ' + wd).strip(), font=f) > w - 240: break
                line = (line + ' ' + wd).strip(); k += 1
            put(line, f)
            if y >= h - 200: break
        y += 26
    return im, lines
def remap(im, fx, fy):
    """uscita(x, y) = ingresso(x + fx, y + fy): fx, fy matrici di spostamento"""
    a = np.asarray(im).astype(np.float32); H, W = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sx = np.clip(xx + fx, 0, W - 1.001); sy = np.clip(yy + fy, 0, H - 1.001); x0 = sx.astype(np.int32); y0 = sy.astype(np.int32); tx = (sx - x0)[..., None]; ty = (sy - y0)[..., None]
    o = a[y0, x0] * (1 - tx) * (1 - ty) + a[y0, x0 + 1] * tx * (1 - ty) + a[y0 + 1, x0] * (1 - tx) * ty + a[y0 + 1, x0 + 1] * tx * ty
    out = (xx + fx < 0) | (xx + fx > W - 1) | (yy + fy < 0) | (yy + fy > H - 1); o[out] = (251, 250, 247)
    return Image.fromarray(np.clip(o, 0, 255).astype(np.uint8))
def light(im, seed):
    a = np.asarray(im).astype(np.float32); H, W = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a *= (0.72 + 0.34 * (xx / W * 0.7 + yy / H * 0.3))[..., None]; a += np.random.RandomState(seed).normal(0, 3, a.shape)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
CASES = {
    'piatto': lambda W, H, xx, yy: (0 * xx, 0 * yy),
    'storto4': lambda W, H, xx, yy: (-(yy - H / 2) * math.tan(math.radians(4)), (xx - W / 2) * math.tan(math.radians(4))),
    'pancia': lambda W, H, xx, yy: (0 * xx, 26 * np.sin(np.pi * xx / W) * (0.5 + yy / H)),
    'onde': lambda W, H, xx, yy: (0 * xx, 11 * np.sin(2 * np.pi * xx / 640 + yy / 260)),
    'rilegatura': lambda W, H, xx, yy: (0 * xx, -70 * (1 - xx / W) ** 3 * (0.4 + 0.6 * yy / H)),
    'storto-e-pancia': lambda W, H, xx, yy: (-(yy - H / 2) * math.tan(math.radians(-2.5)), (xx - W / 2) * math.tan(math.radians(-2.5)) + 22 * np.sin(np.pi * xx / W)),
    'onde-strette': lambda W, H, xx, yy: (0 * xx, 6 * np.sin(2 * np.pi * xx / 330 + yy / 180)),
    'ventaglio': lambda W, H, xx, yy: (0 * xx, (xx - W / 2) * 0.05 * (yy / H - 0.5) * 2),     # righe che divergono (prospettiva residua)
}
for i, (name, fn) in enumerate(CASES.items()):
    im, lines = page(100 + i); W, H = im.size; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    fx, fy = fn(W, H, xx, yy); out = light(remap(im, np.asarray(fx, np.float32), np.asarray(fy, np.float32)), i)
    out.save(os.path.join(OUT, name + '.jpg'), quality=85); open(os.path.join(OUT, name + '.txt'), 'w').write('\n'.join(lines))
print(len(CASES), 'pagine')
