#!/usr/bin/env python3
"""OKLCH → sRGB e contrasto WCAG, per scegliere i token con numeri verificati."""
import math, sys
def oklch2rgb(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b; m_ = L - 0.1055613458 * a - 0.0638541728 * b; s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s; g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s; bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(min(1, max(0, x)) for x in (r, g, bb)), any(x < -0.001 or x > 1.001 for x in (r, g, bb))
def lum(lin): return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
def gam(x): return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
def hexof(lin): return '#' + ''.join('%02X' % round(gam(x) * 255) for x in lin)
def contrast(a, b): la, lb = lum(a), lum(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
def hex2lin(h): h = h.lstrip('#'); v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]; return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in v)
def rgb2oklch(lin):
    r, g, b = lin
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b; m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b; s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_; a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_; bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360
if __name__ == '__main__':
    T = {}
    def t(name, L, C, H): lin, oog = oklch2rgb(L, C, H); T[name] = lin; print(f'{name:16s} oklch({L} {C} {H})  {hexof(lin)}{"  (fuori gamut)" if oog else ""}'); return lin
    print('— chiaro'); 
    bg = t('bg', .972, .006, 85); sf = t('surface', .995, .002, 85); s2 = t('surface-2', .952, .008, 85); s3 = t('surface-3', .92, .01, 85); ln = t('line', .9, .01, 85); l2 = t('line-2', .845, .012, 85); l3 = t('line-3', .62, .012, 85)
    ink = t('ink', .21, .008, 270); ink2 = t('ink-2', .36, .01, 270); mu = t('muted', .49, .012, 270)
    ac = t('accent', .545, .2, 28); ach = t('accent-hover', .5, .19, 28); acs = t('accent-soft', .955, .028, 28)
    ok = t('ok', .5, .12, 158); oks = t('ok-soft', .955, .035, 158); wa = t('warn', .5, .11, 70); was = t('warn-soft', .955, .045, 85); da = t('danger', .52, .2, 25); se = t('sel', .52, .19, 262)
    W = (1, 1, 1)
    for a, b in [('muted', 'bg'), ('muted', 'surface'), ('muted', 'surface-2'), ('ink-2', 'surface-2'), ('accent', 'surface'), ('accent', 'bg'), ('accent', 'accent-soft'), ('ok', 'ok-soft'), ('ok', 'surface'), ('warn', 'warn-soft'), ('danger', 'surface'), ('sel', 'surface'), ('line-3', 'surface')]: print(f'  {a} su {b}: {contrast(T[a], T[b]):.2f}')
    print(f'  bianco su accent: {contrast(W, ac):.2f}  bianco su accent-hover: {contrast(W, ach):.2f}')
    print('— scuro'); T.clear()
    bg = t('bg', .165, .006, 270); sf = t('surface', .205, .007, 270); s2 = t('surface-2', .245, .008, 270); s3 = t('surface-3', .295, .009, 270); ln = t('line', .3, .008, 270); l2 = t('line-2', .38, .009, 270); l3 = t('line-3', .55, .01, 270)
    ink = t('ink', .945, .004, 85); ink2 = t('ink-2', .83, .006, 85); mu = t('muted', .7, .01, 270)
    ac = t('accent', .74, .15, 28); af = t('accent-fill', .58, .2, 28); acs = t('accent-soft', .3, .06, 28)
    ok = t('ok', .78, .13, 158); oks = t('ok-soft', .29, .05, 158); wa = t('warn', .8, .12, 80); was = t('warn-soft', .3, .05, 80); da = t('danger', .72, .17, 25); se = t('sel', .72, .14, 262)
    for a, b in [('muted', 'bg'), ('muted', 'surface'), ('muted', 'surface-2'), ('muted', 'surface-3'), ('accent', 'surface'), ('accent', 'accent-soft'), ('accent', 'surface-2'), ('ok', 'ok-soft'), ('warn', 'warn-soft'), ('danger', 'surface'), ('sel', 'surface'), ('line-3', 'surface')]: print(f'  {a} su {b}: {contrast(T[a], T[b]):.2f}')
    print(f'  bianco su accent-fill: {contrast(W, af):.2f}')
    print('— tinte degli strumenti (chiaro: ink L.5 su soft L.955 / bianco su fill L.53 ; scuro: ink L.8 su soft L.3)')
    for name, hx in [('unisci', '#7C5CFC'), ('comprimi', '#0FA38F'), ('modifica', '#F2711C'), ('ocr', '#22A06B'), ('moduli', '#D97706'), ('oscura', '#475467'), ('word', '#2B579A'), ('immagini', '#DB2777'), ('fatture', '#0B7285'), ('proteggi', '#B45309')]:
        L, C, H = rgb2oklch(hex2lin(hx)); 
        i1, _ = oklch2rgb(.5, min(C, .17), H); s1, _ = oklch2rgb(.955, min(C, .17) * .22, H); f1, _ = oklch2rgb(.53, min(C, .17), H)
        i2, _ = oklch2rgb(.8, min(C, .13), H); s2d, _ = oklch2rgb(.3, min(C, .17) * .35, H); surf, _ = oklch2rgb(.995, .002, 85); dsurf, _ = oklch2rgb(.205, .007, 270)
        print(f'  {name:9s} {hx} L{L:.2f} C{C:.2f} H{H:.0f} | ink/soft {contrast(i1, s1):.2f} ink/surface {contrast(i1, surf):.2f} bianco/fill {contrast((1,1,1), f1):.2f} | scuro ink/soft {contrast(i2, s2d):.2f} ink/surface {contrast(i2, dsurf):.2f}')
