#!/usr/bin/env python3
"""Banco di prova per il riconoscimento del foglio: foto sintetiche di un A4 con angoli noti.
   Ogni scena: fondo (legno scuro, scrivania chiara, tavolo bianco, tovaglia a quadri, disordine), posa del foglio
   (prospettiva, rotazione, decentramento, foglio piccolo, angolo fuori dall'inquadratura), luce (gradiente, ombra
   della mano/telefono), difetti dell'obiettivo (sfocatura, rumore, JPEG). Scrive scans/*.jpg e scans/truth.json."""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scans'); os.makedirs(OUT, exist_ok=True)
FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'; FONTB = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
LOREM = ('Il presente verbale riporta le deliberazioni assunte dall\'assemblea ordinaria dei soci, regolarmente convocata. '
         'Dopo ampia discussione i presenti approvano all\'unanimità il bilancio di esercizio e la relazione sulla gestione. ').split()
def page(kind='text', w=1240, h=1754, seed=0, paper=(250, 249, 245)):
    rnd = random.Random(seed); im = Image.new('RGB', (w, h), paper); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 30); fb = ImageFont.truetype(FONTB, 44); fs = ImageFont.truetype(FONT, 24)
    y = 130
    if kind == 'header':   # fascia scura in alto e tabella con linee forti: bordi «falsi» dentro il foglio
        d.rectangle([0, 0, w, 210], fill=(30, 45, 80)); d.text((90, 80), 'ALFA SERVIZI SRL', font=fb, fill=(255, 255, 255)); y = 290
    elif kind == 'header2':
        d.rectangle([0, 0, w, 190], fill=(120, 20, 30)); d.rectangle([0, h - 150, w, h], fill=(40, 40, 46)); d.text((90, 70), 'BETA COMMERCIALE SPA', font=fb, fill=(255, 255, 255)); y = 270
    elif kind == 'photo':
        d.text((110, y), 'Relazione fotografica', font=fb, fill=(25, 25, 30)); y += 100; d.rectangle([110, y, w - 110, y + 620], fill=(34, 52, 44)); d.ellipse([400, y + 140, 820, y + 520], fill=(90, 120, 96)); y += 680
    else: d.text((110, y), 'Verbale di assemblea ordinaria', font=fb, fill=(25, 25, 30)); y += 100
    def para(n):
        nonlocal y
        words = [rnd.choice(LOREM) for _ in range(n)]; line = ''
        for wd in words:
            if d.textlength(line + ' ' + wd, font=f) > w - 220: d.text((110, y), line, font=f, fill=(30, 30, 35)); y += 44; line = wd
            else: line = (line + ' ' + wd).strip()
        d.text((110, y), line, font=f, fill=(30, 30, 35)); y += 70
    para(60)
    if kind in ('table', 'header'):
        x0, x1 = 110, w - 110; rows = 7; rh = 62; cols = [x0, x0 + 420, x0 + 700, x1]
        for r in range(rows + 1): d.line([x0, y + r * rh, x1, y + r * rh], fill=(20, 20, 20), width=3)
        for c in cols: d.line([c, y, c, y + rows * rh], fill=(20, 20, 20), width=3)
        for r in range(rows):
            d.text((x0 + 14, y + r * rh + 16), f'Voce di spesa {r + 1}', font=fs, fill=(30, 30, 35)); d.text((cols[1] + 14, y + r * rh + 16), f'{rnd.randint(1, 30)}/03/2026', font=fs, fill=(30, 30, 35)); d.text((cols[2] + 14, y + r * rh + 16), f'{rnd.randint(100, 9999)},00', font=fs, fill=(30, 30, 35))
        y += rows * rh + 60
    while y < h - (420 if kind == 'header2' else 260): para(rnd.randint(35, 70))
    d.text((110, h - 150), 'Pagina 1 di 3', font=fs, fill=(90, 90, 95))
    return im
def idcard(seed=0):
    w, h = 1012, 638; im = Image.new('RGB', (w, h), (203, 222, 232)); d = ImageDraw.Draw(im); fb = ImageFont.truetype(FONTB, 34); f = ImageFont.truetype(FONT, 26)
    d.rectangle([0, 0, w, 96], fill=(120, 170, 200)); d.text((40, 28), 'REPUBBLICA ITALIANA · CARTA DI PROVA', font=fb, fill=(20, 40, 70))
    d.rectangle([50, 150, 330, 520], fill=(150, 160, 170)); d.ellipse([120, 190, 260, 340], fill=(205, 190, 175))
    for i, t in enumerate(['COGNOME  ROSSI', 'NOME  MARIO', 'NATO IL  01.01.1980', 'SCADENZA  01.01.2031', 'N.  CA00000AA']): d.text((380, 170 + i * 66), t, font=f, fill=(20, 30, 50))
    return im
def receipt(seed=0):
    w, h = 600, 1700; im = Image.new('RGB', (w, h), (248, 248, 246)); d = ImageDraw.Draw(im); f = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf', 26); rnd = random.Random(seed)
    d.text((150, 60), 'BAR PROVA SNC', font=ImageFont.truetype(FONTB, 36), fill=(20, 20, 20))
    for i in range(34): d.text((40, 170 + i * 42), f'ARTICOLO {i + 1:02d}'.ljust(22) + f'{rnd.randint(1, 40)},{rnd.randint(0, 99):02d}'.rjust(8), font=f, fill=(30, 30, 30))
    return im
def bg(kind, W, H, rnd):
    a = np.zeros((H, W, 3), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if kind == 'legno':
        base = np.array([92, 62, 40], np.float32); grain = 14 * np.sin(yy / 9 + 3 * np.sin(xx / 130)) + 8 * np.sin(yy / 2.3 + xx / 400)
        a[:] = base; a += grain[..., None]
        for x in range(0, W, rnd.randint(260, 380)): a[:, x:x + 4] *= 0.55      # fughe tra le assi: rette lunghe che ingannano
    elif kind == 'scrivania': a[:] = [208, 204, 196]; a += (6 * np.sin(xx / 37 + yy / 53))[..., None]
    elif kind == 'bianco': a[:] = [236, 235, 232]
    elif kind == 'quadri':
        s = 90; chk = (((xx // s) + (yy // s)) % 2); a[:] = np.where(chk[..., None] > 0, np.array([190, 60, 60], np.float32), np.array([235, 230, 220], np.float32))
    elif kind == 'scuro': a[:] = [38, 40, 46]; a += (4 * np.sin(xx / 21) * np.sin(yy / 17))[..., None]
    elif kind == 'granito':
        rs = np.random.RandomState(7); a[:] = 120 + 55 * rs.rand(H, W, 1) ; a = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)
    elif kind == 'lenzuolo':   # tessuto chiaro con pieghe morbide
        a[:] = [214, 216, 224]; a += (16 * np.sin(xx / 61 + 2.2 * np.sin(yy / 140)) + 10 * np.sin(yy / 47 + xx / 300))[..., None]
    elif kind == 'tappeto':
        rs = np.random.RandomState(3); a[:] = [70, 40, 46]; a += 22 * rs.rand(H, W, 1); a += (18 * np.sign(np.sin(xx / 40)) * np.sign(np.sin(yy / 40)))[..., None]
    elif kind == 'scanner':  a[:] = [243, 243, 242]          # coperchio bianco dello scanner
    elif kind == 'scanner-nero': a[:] = [12, 12, 13]         # coperchio aperto
    elif kind == 'pila':     # altri fogli bianchi sotto, sfalsati
        a[:] = [96, 70, 50]
        im = Image.fromarray(a.astype(np.uint8)); d = ImageDraw.Draw(im)
        d.polygon([(W * .10, H * .06), (W * .93, H * .10), (W * .90, H * .95), (W * .06, H * .91)], fill=(244, 243, 238))
        d.polygon([(W * .14, H * .04), (W * .97, H * .07), (W * .95, H * .9), (W * .11, H * .88)], fill=(238, 237, 233))
        a = np.asarray(im).astype(np.float32)
    elif kind == 'disordine':
        a[:] = [120, 110, 100]
        im = Image.fromarray(a.astype(np.uint8)); d = ImageDraw.Draw(im)
        d.rectangle([W * .02, H * .05, W * .42, H * .30], fill=(245, 244, 238))           # un altro foglio che spunta
        d.rectangle([W * .70, H * .78, W * .98, H * .97], fill=(20, 20, 24))               # un telefono
        d.line([W * .05, H * .9, W * .5, H * .96], fill=(20, 60, 160), width=18)           # una penna
        d.ellipse([W * .78, H * .02, W * .98, H * .17], fill=(235, 235, 235), outline=(160, 160, 160), width=8)  # una tazza
        a = np.asarray(im).astype(np.float32)
    return a
def homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst): A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
    h = np.linalg.solve(np.array(A, np.float64), np.array(dst, np.float64).reshape(8)); return np.append(h, 1).reshape(3, 3)
def compose(pg, quad, W, H, bgk, rnd, light='uniforme', shadow=False, blur=0.0, noise=2.0, curl=0.0, fingers=0, dogear=False, glare=False, motion=0, expo=1.0, round_=0):
    pw, ph = pg.size
    Hm = homography(quad, [(0, 0), (pw, 0), (pw, ph), (0, ph)])       # foto → pagina
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64); den = Hm[2, 0] * xx + Hm[2, 1] * yy + Hm[2, 2]
    u = (Hm[0, 0] * xx + Hm[0, 1] * yy + Hm[0, 2]) / den; v = (Hm[1, 0] * xx + Hm[1, 1] * yy + Hm[1, 2]) / den
    if curl:   # foglio imbarcato: i lati lunghi non sono rette ma archi leggeri
        u = u + curl * pw * np.sin(np.pi * np.clip(v / ph, 0, 1)); v = v + curl * .6 * ph * np.sin(np.pi * np.clip(u / pw, 0, 1))
    inside = (u >= 0) & (u < pw - 1) & (v >= 0) & (v < ph - 1) & (den > 0)
    if dogear: inside &= ~((u > pw - dogear * pw) & (v < dogear * ph) & ((pw - u) / (dogear * pw) + v / (dogear * ph) < 1))      # angolo piegato
    if round_:   # angoli arrotondati (tessere)
        r = round_ * pw; du = np.minimum(u, pw - u); dv = np.minimum(v, ph - v); inside &= ~((du < r) & (dv < r) & (np.hypot(r - du, r - dv) > r))
    P = np.asarray(pg).astype(np.float32); ui = np.clip(u, 0, pw - 2); vi = np.clip(v, 0, ph - 2); x0 = ui.astype(np.int32); y0 = vi.astype(np.int32); fx = (ui - x0)[..., None]; fy = (vi - y0)[..., None]
    samp = P[y0, x0] * (1 - fx) * (1 - fy) + P[y0, x0 + 1] * fx * (1 - fy) + P[y0 + 1, x0] * (1 - fx) * fy + P[y0 + 1, x0 + 1] * fx * fy
    B = bg(bgk, W, H, rnd)
    # ombra portata dal foglio sul piano (un filo sotto e a destra): è il «bordo» che resta sul tavolo bianco
    m = Image.fromarray((inside * 255).astype(np.uint8)); sh = np.asarray(m.transform(m.size, Image.AFFINE, (1, 0, -7, 0, 1, -9)).filter(ImageFilter.GaussianBlur(7))).astype(np.float32) / 255
    B *= (1 - 0.28 * sh)[..., None]
    out = np.where(inside[..., None], samp, B)
    if light == 'gradiente': out *= (0.62 + 0.5 * (xx / W * 0.6 + yy / H * 0.4))[..., None].astype(np.float32)
    elif light == 'faretto': r = np.hypot(xx - W * .35, yy - H * .3) / max(W, H); out *= (1.12 - 0.75 * r)[..., None].astype(np.float32)
    if glare:   # riflesso della lampada sulla carta lucida
        cxg, cyg = (quad[0][0] + quad[2][0]) / 2 + 80, (quad[0][1] + quad[2][1]) / 2 - 220; out += (150 * np.exp(-(((xx - cxg) / 260) ** 2 + ((yy - cyg) / 170) ** 2)))[..., None].astype(np.float32)
    if fingers:  # pollici che tengono il foglio: coprono un tratto di bordo
        im0 = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)); d0 = ImageDraw.Draw(im0)
        spots = [((quad[3][0] + quad[2][0]) / 2 - 120, (quad[3][1] + quad[2][1]) / 2), ((quad[0][0] + quad[3][0]) / 2, (quad[0][1] + quad[3][1]) / 2 + 60)][:fingers]
        for (fx0, fy0) in spots: d0.ellipse([fx0 - 70, fy0 - 150, fx0 + 70, fy0 + 240], fill=(214, 168, 140)); d0.ellipse([fx0 - 46, fy0 - 132, fx0 + 46, fy0 - 50], fill=(232, 200, 186))
        out = np.asarray(im0).astype(np.float32)
    out *= expo
    if shadow:   # l'ombra del telefono/della mano che taglia il foglio in diagonale
        s = Image.new('L', (W, H), 0); ImageDraw.Draw(s).polygon([(W * .0, H * .55), (W * .75, H * 1.0), (0, H)], fill=255); sa = np.asarray(s.filter(ImageFilter.GaussianBlur(28))).astype(np.float32) / 255
        out *= (1 - 0.42 * sa)[..., None]
    out += np.random.RandomState(rnd.randint(0, 1 << 30)).normal(0, noise, out.shape)
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    if motion:   # mosso orizzontale
        k = ImageFilter.Kernel((5, 5), [0] * 10 + [1] * 5 + [0] * 10, scale=5)
        for _ in range(motion): im = im.filter(k)
    return im
def pose(W, H, rnd, scale=.78, rot=0, persp=0, dx=0, dy=0, landscape=False, ratio=None):
    """angoli del foglio nella foto (alto-sx, alto-dx, basso-dx, basso-sx del FOGLIO)"""
    r = ratio or math.sqrt(2); ph = scale * min(H, W * r) ; pw = ph / r
    if landscape: pw, ph = ph, pw
    pts = [(-pw / 2, -ph / 2), (pw / 2, -ph / 2), (pw / 2, ph / 2), (-pw / 2, ph / 2)]
    out = []
    for x, y in pts:
        # prospettiva: il lato alto è più lontano (più stretto), più una leggera inclinazione laterale
        k = 1 + persp * (y / ph); k2 = 1 + persp * 0.35 * (x / pw)
        x2, y2 = x * k, y * k2 * (1 - persp * 0.18)
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        out.append((W / 2 + dx * W + x2 * c - y2 * s, H / 2 + dy * H + x2 * s + y2 * c))
    return out
SCENES = []
def S(name, **k): SCENES.append((name, k))
# — facili (il minimo sindacale)
S('legno-frontale', bg='legno'); S('scuro-ruotato15', bg='scuro', rot=15); S('scrivania-prospettiva', bg='scrivania', persp=.28)
# — prospettiva e rotazione forti
S('legno-prospettiva-forte', bg='legno', persp=.5, rot=-8); S('scuro-ruotato40', bg='scuro', rot=40, scale=.62); S('legno-orizzontale', bg='legno', landscape=True, rot=4, persp=.2, W=2000, H=1500)
S('legno-ruotato90', bg='legno', rot=88, scale=.6, W=2000, H=1500)
# — poco contrasto
S('scrivania-chiara-frontale', bg='scrivania', rot=-3); S('tavolo-bianco', bg='bianco', rot=6, persp=.15); S('tavolo-bianco-gradiente', bg='bianco', rot=-10, persp=.2, light='gradiente')
# — fondi che ingannano
S('quadri-ruotato', bg='quadri', rot=12, persp=.15); S('disordine', bg='disordine', rot=-7, persp=.2, scale=.66); S('legno-assi-parallele', bg='legno', rot=1, scale=.7)
# — contenuto che inganna
S('intestazione-scura', bg='scrivania', kind='header', rot=5, persp=.2); S('tabella-legno', bg='legno', kind='table', rot=-12, persp=.25); S('intestazione-scura-su-scuro', bg='scuro', kind='header', rot=-6)
# — luce difficile
S('ombra-diagonale', bg='legno', shadow=True, rot=4, persp=.2); S('faretto-scrivania', bg='scrivania', light='faretto', rot=-9, persp=.25); S('gradiente-scuro', bg='scuro', light='gradiente', rot=20, persp=.2, scale=.66)
S('ombra-su-bianco', bg='bianco', shadow=True, rot=-4, persp=.1)
# — inquadratura
S('decentrato', bg='legno', dx=.14, dy=-.08, scale=.6, rot=9); S('piccolo-lontano', bg='scrivania', scale=.42, rot=-14, persp=.2); S('angolo-fuori', bg='legno', scale=.9, dx=.1, dy=.07, rot=6)
S('riempie-la-foto', bg='scuro', scale=.97, rot=1.5); S('due-lati-fuori', bg='legno', scale=1.02, rot=-2)
# — qualità dello scatto
S('sfocato', bg='legno', blur=2.2, rot=7, persp=.2); S('rumore-forte', bg='scuro', noise=14, rot=-11, persp=.2); S('sfocato-scrivania', bg='scrivania', blur=1.8, rot=10, persp=.3)
# — carta non bianca
S('carta-gialla-legno', bg='legno', paper=(238, 224, 170), rot=-5, persp=.2); S('carta-grigia-scrivania', bg='scrivania', paper=(222, 222, 220), rot=8, persp=.15)
# ===== livello 2: quello che succede davvero =====
S('dita-sul-bordo', bg='legno', fingers=2, rot=5, persp=.2); S('dita-scrivania', bg='scrivania', fingers=1, rot=-8, persp=.25)
S('orecchia', bg='scuro', dogear=.09, rot=7, persp=.15); S('pila-di-fogli', bg='pila', rot=3, persp=.12, scale=.7)
S('granito', bg='granito', rot=-11, persp=.22); S('lenzuolo', bg='lenzuolo', rot=9, persp=.2); S('tappeto', bg='tappeto', rot=-16, persp=.3, scale=.7)
S('riflesso', bg='legno', glare=True, rot=4, persp=.2); S('mosso', bg='scuro', motion=3, rot=-6, persp=.2); S('sottoesposto', bg='legno', expo=.38, rot=10, persp=.25)
S('imbarcato', bg='legno', curl=.012, rot=-4, persp=.15); S('prospettiva-estrema', bg='scuro', persp=.78, rot=3, scale=.7)
S('tessera-legno', bg='legno', kind='idcard', scale=.36, rot=-12, persp=.15, round_=.035); S('tessera-scrivania', bg='scrivania', kind='idcard', scale=.4, rot=18, persp=.2, round_=.035)
S('tessera-lenzuolo', bg='lenzuolo', kind='idcard', scale=.34, rot=-5, round_=.035); S('scontrino', bg='legno', kind='receipt', scale=.8, rot=6, persp=.1)
S('scontrino-bianco', bg='scrivania', kind='receipt', scale=.74, rot=-9)
S('scanner-storto', bg='scanner-nero', rot=3.2, scale=.88, dx=-.03, dy=-.04, noise=1.0); S('scanner-bianco-storto', bg='scanner', rot=-2.4, scale=.86, dx=.03, dy=-.03, noise=1.0)
S('scanner-bianco-decentrato', bg='scanner', rot=1.1, scale=.8, dx=-.07, dy=-.06, noise=1.0)
S('intestazione-e-piede-scuri', bg='legno', kind='header2', rot=-4, persp=.2); S('foto-nel-foglio', bg='scrivania', kind='photo', rot=7, persp=.2)
S('ombra-netta-meta', bg='scrivania', shadow=True, light='faretto', rot=3, persp=.2); S('angolo-fuori-scrivania', bg='scrivania', scale=.92, dx=-.09, dy=.08, rot=-5, persp=.1)
truth = {}
for i, (name, k) in enumerate(SCENES):
    rnd = random.Random(1000 + i); W, H = k.get('W', 1500), k.get('H', 2000)
    q = pose(W, H, rnd, scale=k.get('scale', .78), rot=k.get('rot', 0), persp=k.get('persp', 0), dx=k.get('dx', 0), dy=k.get('dy', 0), landscape=k.get('landscape', False))
    kd = k.get('kind', 'text'); ratio = None
    if kd == 'idcard': pg = idcard(i).rotate(90, expand=True) if False else idcard(i); ratio = pg.size[1] / pg.size[0]
    elif kd == 'receipt': pg = receipt(i); ratio = pg.size[1] / pg.size[0]
    elif k.get('landscape'): pg = page(kd, w=1754, h=1240, seed=i)
    else: pg = page(kd, seed=i, paper=k.get('paper', (250, 249, 245)))
    if ratio: q = pose(W, H, rnd, scale=k.get('scale', .78), rot=k.get('rot', 0), persp=k.get('persp', 0), dx=k.get('dx', 0), dy=k.get('dy', 0), ratio=ratio)
    im = compose(pg, q, W, H, k['bg'], rnd, light=k.get('light', 'uniforme'), shadow=k.get('shadow', False), blur=k.get('blur', 0), noise=k.get('noise', 2.0), curl=k.get('curl', 0), fingers=k.get('fingers', 0), dogear=k.get('dogear', False), glare=k.get('glare', False), motion=k.get('motion', 0), expo=k.get('expo', 1.0), round_=k.get('round_', 0))
    im.save(os.path.join(OUT, name + '.jpg'), quality=82)
    truth[name] = {'w': W, 'h': H, 'quad': [[x / W, y / H] for x, y in q], 'landscape': bool(k.get('landscape'))}
json.dump(truth, open(os.path.join(OUT, 'truth.json'), 'w'), indent=1); print(len(SCENES), 'scene')
