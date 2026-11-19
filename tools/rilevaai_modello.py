#!/usr/bin/env python3
"""Addestra e misura il modello statistico del rilevatore AI (n-grammi di caratteri e di parole, regressione logistica).
Le caratteristiche sono calcolate da tools/rilevaai_feat.js, lo stesso codice usato nel programma.

Ingressi (cartella dati, fuori dal repository: i corpus non si distribuiscono):
  gen/richieste.json + gen/out-*.txt   testi di Claude (Haiku, Sonnet, Opus) sugli stessi temi dei testi umani appaiati
  corpus-claude/claude.json            altri testi di Claude
  corpus-umano/umani.json              PAISÀ (web italiano 2010)
  corpus-umano/mc4/v*.json.gz          mC4 italiano pulito (web 2013-2020, prima degli assistenti AI)
  corpus-umano/fuori.json              Il Post e Fanpage: solo prova, mai in addestramento né taratura

Misura onesta:
  1. validazione incrociata a 5 parti; i testi AI e il testo umano dello stesso tema stanno nella stessa parte,
     i testi umani del web sono divisi per sito (nessun sito in due parti);
  2. soglia scelta sui punteggi fuori campione degli umani (al massimo FPR falsi allarmi);
  3. riconoscimento per modello e per testi «umanizzati», falsi allarmi su Il Post e Fanpage (mai visti).
Uscita: modello quantizzato (pesi int8 in base64) per src/rilevaai.js e le misure.
Uso: python3 tools/rilevaai_modello.py CARTELLA_DATI [--C=4] [--fpr=0.01] [--out=modello.json]"""
import json, sys, os, re, gzip, random, struct, subprocess, hashlib, collections, base64, urllib.parse
import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression

D = sys.argv[1]
arg = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--' + k + '=')), d)
CC, FPR, OUT = float(arg('C', 4)), float(arg('fpr', 0.003)), arg('out', '')
BITS = int(arg('bits', 18)); DIM = 1 << BITS; os.environ['RILEVA_BITS'] = str(BITS)
HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(7)
nw = lambda t: len(re.findall(r'\S+', t))
key = lambda t: hashlib.md5(re.sub(r'\W+', '', t.lower())[:300].encode()).hexdigest()

# ---------- documenti ----------
docs = []  # {text, y, grp, src, modello, um, genere}
seen = set()
def carica_gen(cart, rich):  # testi di Claude scritti dai sotto-agenti: «@@ id» + testo
    req = {r['id']: r for r in json.load(open(f'{D}/{cart}/{rich}'))}; out = {}
    for f in sorted(os.listdir(f'{D}/{cart}')):
        if not re.match(r'out-.*\.txt$', f): continue
        for blk in re.split(r'^@@ ', open(f'{D}/{cart}/{f}').read(), flags=re.M)[1:]:
            i, _, t = blk.partition('\n'); i = i.strip(); t = t.strip()
            if i in req and nw(t) >= 40: out[i] = t
    for i, t in out.items():
        r = req[i]; docs.append(dict(text=t, y=1, grp='t' + i, src='claude', modello=r['modello'], um=r['umanizzato'], genere=r['genere']))
    return req
req = carica_gen('gen', 'richieste.json')
for c, f in [('gen2', 'richieste2.json'), ('gen3', 'richieste3.json')]:  # 35 generi; generi deboli e riscritture di testi umani
    if os.path.exists(f'{D}/{c}/{f}'): req.update(carica_gen(c, f))
for i, r in req.items():  # testo umano appaiato, stesso gruppo del testo AI sullo stesso tema
    if r.get('umano') and nw(r['umano']) >= 60:
        seen.add(key(r['umano']))
        docs.append(dict(text=r['umano'], y=0, grp='t' + i, src='appaiato:' + r['fonte'].split(':')[0], modello='', um=False, genere=r['genere']))
for r in json.load(open(f'{D}/corpus-claude/claude.json')):
    docs.append(dict(text=r['text'], y=1, grp='c' + r['id'], src='claude', modello='opus-5.5', um=r['uman'], genere='altro: ' + r['genere']))
for r in json.load(open(f'{D}/corpus-umano/umani.json')):
    if key(r['text']) in seen or nw(r['text']) < 60: continue
    docs.append(dict(text=r['text'], y=0, grp='d' + r['dom'], src='paisa', modello='', um=False, genere='web'))
mc = []
for f in sorted(os.listdir(f'{D}/corpus-umano/mc4')):
    for l in gzip.open(f'{D}/corpus-umano/mc4/{f}', 'rt'):
        d = json.loads(l); n = nw(d['text'])
        if 120 <= n <= 3000: mc.append(d)
random.shuffle(mc)
for d in mc[:int(arg('mc4', 12000))]:
    if key(d['text']) in seen: continue
    docs.append(dict(text=d['text'], y=0, grp='d' + urllib.parse.urlparse(d['url']).netloc.replace('www.', ''), src='mc4', modello='', um=False, genere='web'))
# testi curati scritti da persone (giornali, enciclopedie, riviste; mC4 2013-2020): i negativi più difficili
if os.path.exists(f'{D}/corpus-umano/curati.json') and int(arg('curati-n', 12000)):
    cu = json.load(open(f'{D}/corpus-umano/curati.json')); random.shuffle(cu); per = collections.Counter()
    for d in cu:
        hh = urllib.parse.urlparse(d['url']).netloc.replace('www.', ''); g = hh if 'wikipedia' in hh else '.'.join(hh.split('.')[-2:])
        if g in ('ilpost.it', 'fanpage.it') or per[g] >= int(arg('curati-dom', 500)) or key(d['text']) in seen: continue
        per[g] += 1; docs.append(dict(text=d['text'], y=0, grp='d' + g, src='curati', modello='', um=False, genere='articolo'))
        if sum(per.values()) >= int(arg('curati-n', 12000)): break
# Il Post, Fanpage, testi di scuola: metà in addestramento, metà nella prova finale (mai vista)
test = []
fuori = json.load(open(f'{D}/corpus-umano/fuori.json'))
for s, L in fuori.items():
    L = [t for t in L if key(t) not in seen and nw(t) >= 60]; random.shuffle(L); h = len(L) // 2
    docs += [dict(text=t, y=0, grp=f'f{s}{random.randrange(40)}', src=s, modello='', um=False, genere='articolo') for t in L[:h]]
    test += [dict(text=t, y=0, grp='x', src=s, modello='', um=False, genere='articolo') for t in L[h:]]
SCUOLA = {'scuola.repubblica.it': 'temi e articoli di studenti', 'skuola.net': 'appunti e temi', 'doc.studenti.it': 'appunti e temi',
          'studenti.it': 'appunti e temi', 'vivalascuola.studenti.it': 'appunti e temi', 'atuttascuola.it': 'appunti e temi', 'tesionline.it': 'tesi'}
sc = [d for d in json.load(open(f'{D}/corpus-umano/scuola.json')) if urllib.parse.urlparse(d['url']).netloc.replace('www.', '') in SCUOLA and nw(d['text']) <= 3000]
random.shuffle(sc); per = collections.Counter()
for d in sc:
    g = SCUOLA[urllib.parse.urlparse(d['url']).netloc.replace('www.', '')]; per[g] += 1
    if g == 'tesi':  # le tesi restano interamente fuori: genere mai visto in addestramento
        if per[g] <= 500: test.append(dict(text=d['text'], y=0, grp='x', src='scuola: tesi', modello='', um=False, genere='scuola'))
    elif per[g] <= 700: docs.append(dict(text=d['text'], y=0, grp=f's{random.randrange(40)}', src='scuola: ' + g, modello='', um=False, genere='scuola'))
    elif per[g] <= 1400: test.append(dict(text=d['text'], y=0, grp='x', src='scuola: ' + g, modello='', um=False, genere='scuola'))
# prosa letteraria, saggistica, storia, teatro di pubblico dominio (Progetto Gutenberg e Wikisource, 495 libri):
# due terzi dei libri in addestramento, un terzo solo prova (libri mai visti)
PROVA_OPERE = {'Il piacere', 'Canne al vento', 'Senilità', 'Lettere dal carcere', 'Fosca', 'Piccolo mondo antico', 'Le avventure di Pinocchio', 'Operette morali', 'Il ventre di Napoli'}
if os.path.exists(f'{D}/corpus-umano/ws/letteratura.json'):
    for d in json.load(open(f'{D}/corpus-umano/ws/letteratura.json')):
        if nw(d['text']) < 60: continue
        if d['opera'] in PROVA_OPERE or int(hashlib.md5(d['opera'].encode()).hexdigest(), 16) % 3 == 0: test.append(dict(text=d['text'], y=0, grp='x', src='letteratura (opere mai viste)', modello='', um=False, genere='letteratura'))
        else: docs.append(dict(text=d['text'], y=0, grp='w' + d['opera'], src='letteratura', modello='', um=False, genere='letteratura'))
# riscritture di testi umani («migliora», «parafrasa»): restano in parte umane; si misurano a parte, fuori dall'addestramento
RISCR = 'riscrittura di un testo umano'
riscr = [d for d in docs if d['genere'] == RISCR and d['y'] == 1]
docs = [d for d in docs if d['genere'] != RISCR]
print('documenti:', collections.Counter((d['src'], d['modello']) for d in docs), '| prova:', collections.Counter(d['src'] for d in test))

# ---------- finestre e caratteristiche (node, stesso codice del programma) ----------
def windows(rows, maxw):
    js = f"const F=require({json.dumps(HERE + '/rilevaai_feat.js')});const fs=require('fs');const R=JSON.parse(fs.readFileSync(0,'utf8'));" \
         f"process.stdout.write(JSON.stringify(R.map(t=>F.finestre(t).slice(0,{maxw}))))"
    return json.loads(subprocess.run(['node', '-e', js], input=json.dumps([r['text'] for r in rows]), capture_output=True, text=True, check=True).stdout)
def featurize(texts):
    tmp = f'{D}/_f'; open(tmp + '.jsonl', 'w').write('\n'.join(json.dumps({'text': t}) for t in texts))
    subprocess.run(['node', HERE + '/rilevaai_feat.js', tmp + '.jsonl', tmp + '.bin'], check=True, capture_output=True)
    b = open(tmp + '.bin', 'rb').read(); o = 0; ind, val, ptr = [], [], [0]
    for _ in texts:
        n = struct.unpack_from('<I', b, o)[0]; o += 4
        ind.append(np.frombuffer(b, '<u4', n, o)); o += 4 * n
        val.append(np.frombuffer(b, '<f4', n, o)); o += 4 * n
        ptr.append(ptr[-1] + n)
    return sparse.csr_matrix((np.concatenate(val), np.concatenate(ind), np.array(ptr)), shape=(len(texts), DIM))
def expand(rows, maxw):
    hk = hashlib.md5(json.dumps([r['text'] for r in rows]).encode() + str(BITS).encode() + open(HERE + '/rilevaai_feat.js', 'rb').read()).hexdigest()[:12]
    cf = f'{D}/_cache_{hk}.npz'
    if os.path.exists(cf):
        z = np.load(cf); return sparse.csr_matrix((z['v'], z['i'], z['p']), shape=(len(z['p']) - 1, DIM)), z['o']
    W = windows(rows, maxw); T, owner = [], []
    for j, ws in enumerate(W):
        for w in ws: T.append(w); owner.append(j)
    M = featurize(T); np.savez(cf, v=M.data, i=M.indices, p=M.indptr, o=np.array(owner)); return M, np.array(owner)
X, own = expand(docs, 8); Xt, ownt = expand(test, 8)
y = np.array([docs[j]['y'] for j in own])
print('finestre:', X.shape[0], 'AI', int(y.sum()), '| prova', Xt.shape[0])

def docscore(s, owner, n):  # punteggio del documento: media del logit delle sue finestre
    tot = np.zeros(n); cnt = np.zeros(n); np.add.at(tot, owner, s); np.add.at(cnt, owner, 1); return tot / np.maximum(cnt, 1)
CURATI = float(arg('curati', 3))  # peso dei testi umani curati e di scuola: i negativi più difficili
DIFF = lambda d: d['src'] in ('ilpost', 'fanpage', 'curati', 'letteratura') or d['src'].startswith(('appaiato', 'scuola'))
cur = np.array([1.0 if d['y'] == 1 or not DIFF(d) else CURATI for d in docs])
def fit(Xa, ya, wa):
    w = wa * np.where(ya == 1, (wa * (ya == 0)).sum() / max(1, (wa * (ya == 1)).sum()), 1.0)  # classi bilanciate
    return LogisticRegression(C=CC, max_iter=3000, solver='liblinear').fit(Xa, ya, sample_weight=w)

# ---------- validazione incrociata per gruppi ----------
grps = sorted({d['grp'] for d in docs}); random.shuffle(grps); fold = {g: i % 5 for i, g in enumerate(grps)}
df = np.array([fold[d['grp']] for d in docs]); wf = df[own]
oof = np.zeros(X.shape[0])
for k in range(5):
    m = fit(X[wf != k], y[wf != k], cur[own][wf != k]); oof[wf == k] = m.decision_function(X[wf == k])
ds = docscore(oof, own, len(docs)); dy = np.array([d['y'] for d in docs])
first = np.zeros(len(docs)); first[own[::-1]] = oof[::-1]  # prima finestra di ogni documento (testi brevi)
from sklearn.metrics import roc_auc_score
print(f'AUC documenti (fuori campione): {roc_auc_score(dy, ds):.4f}  finestre: {roc_auc_score(y, oof):.4f}')
# soglia: per ogni gruppo di testi umani, il valore che lascia sopra al massimo FPR dei suoi testi; si prende il più alto
src = np.array([d['src'].replace('appaiato:', '') for d in docs])
def soglia(sc):
    return max(np.quantile(sc[(dy == 0) & (src == g)], 1 - FPR) for g in sorted(set(src[dy == 0])) if ((dy == 0) & (src == g)).sum() >= 100)
thr, thw = soglia(ds), soglia(first)
print(f'\nsoglia (al massimo {FPR:.1%} di falsi allarmi in OGNI gruppo di testi umani): documento {thr:.3f}, testo breve {thw:.3f}')
def rep(mask, lab, sc=None, t=None):
    sc = ds if sc is None else sc; t = thr if t is None else t
    s = sc[mask]; return f'{lab:44s} {int((s > t).sum()):5d}/{len(s):<5d} {100 * (s > t).mean():5.1f}%'
for g in sorted(set(src[dy == 0])): print('falsi allarmi ', rep((src == g) & (dy == 0), g))
for mo in ['haiku', 'sonnet', 'opus', 'opus-5.5']:
    for u in [False, True]:
        mk = np.array([d['modello'] == mo and d['um'] == u for d in docs])
        if mk.any(): print('riconosciuti  ', rep(mk, f'{mo} {"umanizzati" if u else "normali"}'), '| solo le prime ~180 parole:', rep(mk, '', first, thw)[44:])
for g in sorted({d['genere'] for d in docs if d['y'] == 1}):
    print('riconosciuti  ', rep(np.array([d['genere'] == g for d in docs]) & (dy == 1), 'genere ' + g))

# ---------- modello finale + prova su testi mai visti ----------
m = fit(X, y, cur[own]); dect = m.decision_function(Xt); st = docscore(dect, ownt, len(test))
if riscr:
    Xr, ownr = expand(riscr, 8); sr = docscore(m.decision_function(Xr), ownr, len(riscr))
    print(f'PROVA riscritture di testi umani fatte da Claude: riconosciute {int((sr > thr).sum())}/{len(riscr)} = {100 * (sr > thr).mean():.1f}%')
stf = np.zeros(len(test)); stf[ownt[::-1]] = dect[::-1]
for g in sorted({d['src'] for d in test}):
    mk = np.array([d['src'] == g for d in test])
    print(f'PROVA mai vista {g:36s} falsi allarmi {int((st[mk] > thr).sum())}/{mk.sum()} = {100 * (st[mk] > thr).mean():.2f}%   testi brevi {100 * (stf[mk] > thw).mean():.2f}%')
w = m.coef_[0]; K = int(arg('keep', 0)) or len(w)
keep = np.argsort(-np.abs(w))[:K]; wk = np.zeros_like(w); wk[keep] = w[keep]
sc = np.abs(wk).max() / 127; q = np.clip(np.round(wk / sc), -127, 127).astype(np.int8)
if K < len(w):  # verifica del modello ridotto e quantizzato
    stq = docscore(Xt @ (q.astype(float) * sc) + m.intercept_[0], ownt, len(test))
    for g in sorted({d['src'] for d in test}):
        mk = np.array([d['src'] == g for d in test]); print(f'  ridotto a {K} pesi: {g:36s} {100 * (stq[mk] > thr).mean():.2f}%')
    print('  differenza media dei punteggi', float(np.abs(stq - st).mean()))
if OUT:
    nz = np.nonzero(q)[0]; dl = np.diff(np.concatenate([[0], nz])); vb = bytearray()
    for v in dl:  # indici in differenze, codifica a lunghezza variabile
        while v >= 128: vb.append(128 | (v & 127)); v >>= 7
        vb.append(v)
    hum = np.sort(ds[dy == 0])
    rec = lambda mk: round(float((ds[mk] > thr).mean()), 3)
    mo = np.array([d['modello'] for d in docs])
    misure = dict(claude=rec((dy == 1) & (mo != 'opus-5.5')), haiku=rec(mo == 'haiku'), sonnet=rec(mo == 'sonnet'), opus=rec(mo == 'opus'),
                  umanizzati=rec(np.array([d['um'] for d in docs]) & (dy == 1) & (mo != 'opus-5.5')), fp_max_txt='1 testo su 100',
                  testi_ai=int(((dy == 1) & (mo != 'opus-5.5')).sum()), testi_umani=int((dy == 0).sum()) + len(test))
    misure['prova_fp'] = {g: round(float((st[np.array([d['src'] == g for d in test])] > thr).mean()), 4) for g in sorted({d['src'] for d in test})}
    if riscr: misure['riscritture'] = round(float((sr > thr).mean()), 3)
    misure['brevi'] = {k: round(float((first[(mo == k) & (dy == 1)] > thw).mean()), 3) for k in ['haiku', 'sonnet', 'opus']}
    FPR0 = FPR; FPR = 0.05; dubbio = float(soglia(ds)); FPR = FPR0  # zona incerta: sopra la soglia del 5%
    print('misure', misure)
    # passaggi isolati (un paragrafo di Claude in un testo umano): soglia severa, al massimo ~7 passaggi umani su 100.000
    sp = max(3.0, float(np.quantile(oof[y == 0], 1 - 0.00007)))
    misure['passaggi'] = {k: round(float((oof[(np.array([docs[j]['modello'] for j in own]) == k) & (y == 1)] > sp).mean()), 3) for k in ['haiku', 'sonnet', 'opus']}
    misure['passaggi'].update(umani_su=int((y == 0).sum()), umani_sopra=int((oof[y == 0] > sp).sum()))
    M = dict(misure=misure, soglia_dubbio=dubbio, soglia_passaggio=sp, bits=BITS, scala=float(sc), b=float(m.intercept_[0]), soglia=float(thr), soglia_breve=float(thw), n=int(len(nz)),
                   idx=base64.b64encode(bytes(vb)).decode(), pesi=base64.b64encode(q[nz].tobytes()).decode(),
                   umani=[round(float(x), 3) for x in hum[::max(1, len(hum) // 200)]])
    if OUT.endswith('.js'):
        open(OUT, 'w').write('/* Modello statistico del rilevatore AI: generato da tools/rilevaai_modello.py, non modificare a mano. */\n'
                             'RilevaAI.usaModello(' + json.dumps(M, separators=(',', ':')) + ');\n')
    else: json.dump(M, open(OUT, 'w'))
    print('scritto', OUT, os.path.getsize(OUT), 'byte; pesi', len(nz))
if arg('dump', ''):
    import pickle
    pickle.dump(dict(docs=docs, test=test, own=own, ownt=ownt, oof=oof, ds=ds, st=st, stf=stf, first=first, coef=w, b=m.intercept_[0], thr=thr, thw=thw), open(arg('dump', ''), 'wb'))
