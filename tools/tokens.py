#!/usr/bin/env python3
"""Sistema visivo: porta i valori scritti a mano nel CSS sulle scale dei token e li conta.

Scale (in ds.css, :root):
  testo   --fs-micro 11 (solo contrassegni sopra documenti e icone) · 12 · 13 · 14 · 16 · 18 · 22 · 28 · 32
  pesi    400 · 500 · 600 · 700
  raggi   --r-xs 6 · --r-sm 10 · --r 14 · --r-lg 20 · --r-xl 28 · pillola 999px · cerchio 50%
  ombre   --shadow-sm · --shadow · --shadow-lg (elevazione) e --shadow-accent (alone dei pulsanti principali);
          gli anelli di focus, le linee (--shadow-xs) e i bordi interni (inset) non sono ombre

Uso: python3 tools/tokens.py            conta i valori distinti (per il test, esce con 1 sopra soglia)
     python3 tools/tokens.py --apply    riscrive src/style.css e src/ds.css sulle scale
Le anteprime che imitano un documento (Word, Excel, fattura su carta) tengono i loro caratteri: sono contenuto, non interfaccia."""
import re, sys, pathlib, collections
SRC = pathlib.Path(__file__).resolve().parent.parent / 'src'
FILES = ['style.css', 'ds.css', 'ds-hue.css']
SIZES = [12, 13, 14, 16, 18, 22, 28, 32]
MICRO = 11
# contrassegni piccoli per natura: numeri sui campi del PDF, estensione sull'icona del file, assi dei grafici, bollini sulle miniature
MICRO_SEL = re.compile(r'\.ff-n|\.ff-v|\.wb-ext|\.an-chart|\.rail-sep|\.thumb::after|\.rot-flag|\.pvw-n|\.xl-rn|\.pii-q|\.jp-n|\.wc-pb|\.rc-chip i|\.pj-cur|\.an-i\b')
# anteprime di documenti: i caratteri imitano quelli del documento
DOC_SEL = re.compile(r'\.docx-|\.xl-grid|\.pv-doc|\.paper|\.ft-doc|\.inv-|\.sheet-pv|\.wpv|\.ocr-txt|\.cmp-doc')
WEIGHTS = [400, 500, 600, 700]
RADII = [(7, 'var(--r-xs)'), (11, 'var(--r-sm)'), (16, 'var(--r)'), (24, 'var(--r-lg)'), (10 ** 6, 'var(--r-xl)')]
# colori: i significati hanno un token (che cambia con il tema); restano scritti a mano solo il bianco e il nero (anche
# trasparenti: luci e ombre sopra un colore), la «carta» (ciò che si disegna sopra la pagina PDF, sempre bianca), il pannello
# laterale (tavolozza propria, sempre scuro), i colori di marchi altrui (Excel) e la sfumatura decorativa di «Guidami»
DRAW_SEL = re.compile(r'\.drawer|\.dr-|\.wc-')
PAPER_SEL = re.compile(r'\.fi\b|\.fc\b|\.ff\b|\.ff-|\.v-page|\.ln\b|\.it-text|\.thumb|\.wb-thumb|\.ts-page|\.v-overlay|\.ba\b|\.rbox|\.sig-|\.mg-|\.an-|\.ms-|\.pw-thumb|\.ord-marq|\.fo-|\.conf-|\.pvw-doc|\.xl-')
COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)|oklch\([^()]*\)')
def _mix(tok, a): return f'color-mix(in srgb,var({tok}) {round(float(a) * 100)}%,transparent)'
COLOR_MAP = {}
for c in '#d92d20 #e11d48 #b42318 #c0262d #c62828 #912018 #f97066'.split(): COLOR_MAP[c] = 'var(--danger)'
for c in '#fee4e2'.split(): COLOR_MAP[c] = 'var(--danger-soft)'
for c in '#b45309 #b54708'.split(): COLOR_MAP[c] = 'var(--warn)'
for c in '#fff2b3'.split(): COLOR_MAP[c] = 'var(--warn-soft)'
for c in '#5b4300'.split(): COLOR_MAP[c] = 'var(--gold-ink)'
for c in '#e8a317 #c98a06 #ffc234 #f79009 #f07b3f #fdb022 oklch(.72 .16 75)'.split('|') if False else ['#e8a317', '#c98a06', '#ffc234', '#f79009', '#f07b3f', '#fdb022', 'oklch(.72 .16 75)']: COLOR_MAP[c] = 'var(--gold)'
for c in '#16a06b #00875f #12805c #12b76a #32d583 #1e9a69 #147552 #05603a'.split(): COLOR_MAP[c] = 'var(--ok)'
COLOR_MAP['#66c61c'] = 'color-mix(in srgb,var(--ok) 65%,var(--gold))'
for c in '#d1fadf'.split(): COLOR_MAP[c] = 'var(--ok-soft)'
for c in '#5a2bff #4f46e5 #7c3aed #7c5cfc #9e77ed'.split(): COLOR_MAP[c] = 'var(--accent)'
for c in '#111'.split(): COLOR_MAP[c] = 'var(--ink)'
for c in '#888 #6f727c #62656f'.split(): COLOR_MAP[c] = 'var(--muted)'
COLOR_MAP['#bbb'] = 'var(--line-3)'; COLOR_MAP['#f2f4f7'] = 'var(--surface-2)'
for c in '#1e2026 #0a0b0d'.split(): COLOR_MAP[c] = 'var(--inv)'
def color_of(c: str) -> str:
    c0 = c.lower().replace(' ', '')
    if c.lower() in COLOR_MAP: return COLOR_MAP[c.lower()]
    m = re.fullmatch(r'rgba?\((\d+),(\d+),(\d+)[,/]([\d.]+)\)', c0) or re.fullmatch(r'rgb\((\d+)(\d{0})(\d{0})', '')
    m = re.fullmatch(r'rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)\s*[,/]\s*([\d.]+)\)', c.lower().strip())
    if m:
        rgb, a = tuple(int(x) for x in m.groups()[:3]), m.group(4)
        tok = {(37, 99, 235): '--sel', (56, 132, 255): '--sel', (224, 69, 58): '--brand', (90, 43, 255): '--accent', (217, 45, 32): '--danger',
               (17, 24, 39): '--inv', (10, 11, 13): '--inv', (15, 16, 20): '--inv'}.get(rgb)
        if tok: return _mix(tok, a)
    m = re.fullmatch(r'oklch\(\.5 \.27 283 / ([\d.]+)\)', c.strip())
    if m: return _mix('--accent', m.group(1))
    return c
def color_free(c: str) -> bool:
    """bianco e nero (anche trasparenti) non sono «colori» della tavolozza: luci, ombre, carta"""
    c = c.lower().replace(' ', '')
    if c in ('#fff', '#ffffff', '#000', '#000000', '#0000', 'transparent'): return True
    return bool(re.fullmatch(r'rgba?\((255,255,255|0,0,0|255255255|000)[,/][\d.]+\)', c))

THRESH = {'color': 6, 'font-size': 9 + 1, 'font-weight': 4, 'border-radius': 5 + 2 + 1, 'box-shadow-elev': 4}   # +1: «inherit»/0


def size_of(px: float, sel: str) -> float:
    if DOC_SEL.search(sel): return px
    if px < 12: return MICRO if MICRO_SEL.search(sel) else 12
    return min(SIZES, key=lambda s: (abs(s - px), -s))       # a parità, il più grande (si legge meglio)


def weight_of(w: int) -> int: return min(WEIGHTS, key=lambda s: (abs(s - w), s))   # a parità, il più leggero


def radius_of(v: str) -> str:
    def one(t):
        m = re.fullmatch(r'(\d+(?:\.\d+)?)px', t)
        if not m: return t
        px = float(m.group(1))
        if px == 0: return '0'
        if px >= 99: return 'var(--r-full)'
        return next(tok for lim, tok in RADII if px <= lim)
    return ' '.join(one(t) for t in v.split())


def split_top(v: str) -> list:
    """divide sulle virgole fuori dalle parentesi (anche annidate: color-mix(in srgb,var(--x) 50%,transparent))"""
    out, depth, cur = [], 0, ''
    for ch in v:
        depth += ch == '('; depth -= ch == ')'
        if ch == ',' and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    return out + [cur]


def lengths(p: str) -> list:
    """le lunghezze di un'ombra (x, y, sfocatura, espansione), senza i numeri dei colori"""
    p = re.sub(r'[\w-]+\([^()]*(?:\([^()]*\)[^()]*)*\)', ' ', p); p = re.sub(r'#[0-9a-fA-F]{3,8}\b|\binset\b', ' ', p)
    return [float(x) for x in re.findall(r'(?<![\w.])(-?\d*\.?\d+)(?:px)?(?![\w%])', p)]


def shadow_kind(v: str) -> str:
    """elev (ombra di elevazione), ring (anello o bordo: spessore senza sfocatura), inset, token, none"""
    v = v.strip()
    if v in ('none', 'inherit', 'unset', 'initial') or v.startswith('var(--shadow'): return 'token'
    parts = split_top(v)
    if all(p.strip().startswith('inset') for p in parts): return 'inset'
    for p in parts:
        if p.strip().startswith('inset') or p.strip().startswith('var('): continue
        n = lengths(p)
        if len(n) >= 3 and n[2] > 0: return 'elev'
    return 'ring'


def shadow_of(v: str) -> str:
    """l'ombra di elevazione più vicina, per sfocatura (blur) massima: ≤ 4px sm, ≤ 32px md, oltre lg; le parti inset/anello restano"""
    parts = split_top(v); keep, blur = [], 0
    for p in parts:
        n = lengths(p)
        if not p.strip().startswith('inset') and not p.strip().startswith('var(') and len(n) >= 3 and n[2] > 0: blur = max(blur, n[2])
        else: keep.append(p.strip())
    if re.search(r'var\(--(accent|hue|brand)|color-mix', v): tok = 'var(--shadow-accent)'   # alone colorato dei pulsanti principali
    else: tok = 'var(--shadow-sm)' if blur <= 4 else 'var(--shadow)' if blur <= 32 else 'var(--shadow-lg)'
    return ','.join(keep + [tok])


def rules(css: str):
    """(inizio, fine, selettore, corpo) di ogni regola, anche dentro @media"""
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        yield m.start(2), m.end(2), m.group(1).strip(), m.group(2)


def transform(css: str) -> str:
    out, last = [], 0
    css_nc = css
    for a, b, sel, body in rules(css_nc):
        if sel.startswith('@font-face') or ':root' in sel or sel.startswith('@'): continue
        nb = body
        def fs(m):
            px = float(m.group(2)); n = size_of(px, sel)
            return m.group(1) + (str(int(n)) if n == int(n) else str(n)) + 'px'
        nb = re.sub(r'((?<![-\w])font-size\s*:\s*)(\d+(?:\.\d+)?)px', fs, nb)
        # font: [style] [peso] dimensione[/interlinea] famiglia
        def fshort(m):
            pre, w, px, rest = m.group(1), m.group(2), float(m.group(3)), m.group(4)
            if DOC_SEL.search(sel): return m.group(0)
            n = size_of(px, sel); w2 = (str(weight_of(int(w))) + ' ') if w else ''
            return pre + w2 + (str(int(n)) if n == int(n) else str(n)) + 'px' + rest
        nb = re.sub(r'((?<![-\w])font\s*:\s*(?:italic\s+)?)(?:(\d{3})\s+)?(\d+(?:\.\d+)?)px(/|\s)', fshort, nb)
        nb = re.sub(r'((?<![-\w])font-weight\s*:\s*)(\d{3})', lambda m: m.group(1) + str(weight_of(int(m.group(2)))), nb)
        nb = re.sub(r'((?<![-\w])border-radius\s*:\s*)([^;}!]+)', lambda m: m.group(1) + radius_of(m.group(2).strip()), nb)
        nb = re.sub(r'((?<![-\w])box-shadow\s*:\s*)([^;}!]+)', lambda m: m.group(1) + (shadow_of(m.group(2)) if shadow_kind(m.group(2)) == 'elev' else m.group(2)), nb)
        nb = nb.replace('var(--shadow-xl)', 'var(--shadow-lg)')
        if not (DOC_SEL.search(sel) or DRAW_SEL.search(sel) or PAPER_SEL.search(sel)): nb = COLOR_RE.sub(lambda m: color_of(m.group(0)), nb)
        if nb != body: out.append(css[last:a]); out.append(nb); last = b
    out.append(css[last:])
    return ''.join(out)


def count(css: str) -> dict:
    css = re.sub(r'@font-face\{[^}]*\}', '', css); css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    res = collections.defaultdict(collections.Counter)
    for _, _, sel, body in rules(css):
        if ':root' in sel or DOC_SEL.search(sel): continue
        for v in re.findall(r'(?<![-\w])font-size\s*:\s*([^;}!]+)', body): res['font-size'][v.strip()] += 1
        for v in re.findall(r'(?<![-\w])font\s*:\s*(?:italic\s+)?(?:(\d{3})\s+)?(\d+(?:\.\d+)?px)', body):
            res['font-size'][v[1]] += 1
            if v[0]: res['font-weight'][v[0]] += 1
        for v in re.findall(r'(?<![-\w])font-weight\s*:\s*([^;}!]+)', body): res['font-weight'][v.strip()] += 1
        for v in re.findall(r'(?<![-\w])border-radius\s*:\s*([^;}!]+)', body):
            for t in v.split(): res['border-radius'][t] += 1
        for v in re.findall(r'(?<![-\w])box-shadow\s*:\s*([^;}!]+)', body):
            if shadow_kind(v) == 'elev': res['box-shadow-elev'][v.strip()] += 1
            elif v.strip().startswith('var(--shadow') and not v.strip().startswith('var(--shadow-xs)'): res['box-shadow-elev'][re.match(r'var\(--shadow[\w-]*\)', v.strip()).group(0)] += 1
        if not (DRAW_SEL.search(sel) or PAPER_SEL.search(sel)):
            for c in COLOR_RE.findall(body):
                if not color_free(c): res['color'][c.lower()] += 1
    # i valori relativi (em, %, clamp, var) seguono il contesto: contano a parte
    lit = {k: {v: n for v, n in c.items() if re.fullmatch(r'\d+(\.\d+)?px|\d{3}|var\(--[\w-]+\)', v) or k in ('box-shadow-elev', 'color')} for k, c in res.items()}
    return {k: (len(lit[k]), sorted(lit[k], key=lambda x: (len(x), x))) for k in res}


if __name__ == '__main__':
    if '--apply' in sys.argv:
        for f in ('style.css', 'ds.css'):
            p = SRC / f; s = p.read_text(encoding='utf-8'); t = transform(s)
            if t != s: p.write_text(t, encoding='utf-8'); print('riscritto', f)
    css = ''.join((SRC / f).read_text(encoding='utf-8') for f in FILES)
    c = count(css); bad = 0
    for k, (n, vals) in c.items():
        lim = THRESH.get(k); over = lim is not None and n > lim; bad += over
        print(f"{'✗' if over else '✓'} {k}: {n} valori distinti" + (f' (soglia {lim})' if lim else '') + ('  ' + ' '.join(vals[:24]) if over or '-v' in sys.argv else ''))
    sys.exit(1 if bad else 0)
