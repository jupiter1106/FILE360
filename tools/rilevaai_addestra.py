#!/usr/bin/env python3
"""Addestra l'indice del rilevatore di testo AI (src/rilevaai.js) e ne misura l'affidabilità.
Ingresso: features.json (misure calcolate dallo stesso codice del programma, con node). Divisione fissa:
- testi di Claude: lotti 1 e 2 per l'addestramento, lotto 3 per la prova (mai visto);
- testi umani (PAISÀ): 4.000 addestramento, 2.000 taratura della soglia, 2.000 prova (mai visti).
La soglia è il punteggio che lascia sopra di sé al massimo lo 0,5% dei testi umani di taratura; poi si misurano
falsi positivi (umani sopra soglia) e testi di Claude riconosciuti sulle parti di prova.
Uscita: i pesi in JSON (da incollare in src/rilevaai-modello.js) e le misure."""
import json, sys, math, random
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_predict, StratifiedKFold
from sklearn.metrics import roc_auc_score
D = json.load(open(sys.argv[1])); F = D['feats']
for a in sys.argv:
    if a.startswith('--feats='): F = a[8:].split(',')
X = lambda rows: np.array([[math.log1p(max(0, r['f'][k])) for k in F] for r in rows])
C = [r for r in D['rows'] if r['y'] == 1]; H = [r for r in D['rows'] if r['y'] == 0]
random.seed(7); random.shuffle(H)
Ctr = [r for r in C if r['lotto'] != 'lotto3']; Cte = [r for r in C if r['lotto'] == 'lotto3']
Htr, Hcal, Hte = H[:4000], H[4000:6000], H[6000:8000]
if '--medie' in sys.argv:
    xc, xh = X(C), X(H)
    for i, k in enumerate(F): print(f'{k:10s} Claude {np.expm1(xc[:, i]).mean():7.2f}   persone {np.expm1(xh[:, i]).mean():7.2f}')
    sys.exit()
tr = Ctr + Htr; Xtr = X(tr); y = np.array([r['y'] for r in tr])
mu, sdv = Xtr.mean(0), Xtr.std(0) + 1e-9
Z = lambda rows: (X(rows) - mu) / sdv
CC = next((float(a[4:]) for a in sys.argv if a.startswith('--C=')), 0.3)
m = LogisticRegression(C=CC, class_weight='balanced', max_iter=5000).fit((Xtr - mu) / sdv, y)
cv = cross_val_predict(LogisticRegression(C=m.C, class_weight='balanced', max_iter=5000), (Xtr - mu) / sdv, y, cv=StratifiedKFold(5, shuffle=True, random_state=1), method='decision_function')
dec = lambda rows: m.decision_function(Z(rows))
thr = float(np.quantile(dec(Hcal), 0.995))
fp = float((dec(Hte) > thr).mean()); tp = float((dec(Cte) > thr).mean())
tp_all = float((dec(C) > thr).mean())
uman = [r for r in Cte if r.get('uman')]; norm = [r for r in Cte if not r.get('uman')]
print(f'AUC validazione incrociata (addestramento): {roc_auc_score(y, cv):.3f}')
print(f'AUC prova (Claude lotto 3 vs 2.000 umani mai visti): {roc_auc_score([1]*len(Cte)+[0]*len(Hte), list(dec(Cte))+list(dec(Hte))):.3f}')
print(f'soglia {thr:.3f} → falsi positivi sulla prova {fp*100:.2f}% ({int(fp*len(Hte))}/{len(Hte)}) · Claude riconosciuti {tp*100:.0f}% ({int(round(tp*len(Cte)))}/{len(Cte)})')
print(f'   di cui testi normali {np.mean(dec(norm) > thr)*100:.0f}% ({len(norm)}) · «umanizzati» {np.mean(dec(uman) > thr)*100:.0f}% ({len(uman)})')
# fascia intermedia: «possibile» sopra la soglia al 5% di falsi positivi
thr5 = float(np.quantile(dec(Hcal), 0.95)); print(f'soglia «possibile» {thr5:.3f} → falsi positivi {np.mean(dec(Hte) > thr5)*100:.1f}% · Claude {np.mean(dec(Cte) > thr5)*100:.0f}%')
for name, rows in D.get('fuori', {}).items():
    print(f'fuori dominio «{name}»: falsi positivi {np.mean(dec(rows) > thr)*100:.2f}% ({int((dec(rows) > thr).sum())}/{len(rows)}) · «possibile» {np.mean(dec(rows) > thr5)*100:.1f}%')
print('pesi:', ', '.join(f'{k} {w:+.2f}' for k, w in sorted(zip(F, m.coef_[0]), key=lambda t: -abs(t[1]))))
json.dump({'feats': F, 'mu': [round(v, 5) for v in mu], 'sd': [round(v, 5) for v in sdv], 'w': [round(v, 5) for v in m.coef_[0]], 'b': round(float(m.intercept_[0]), 5), 'soglia': round(thr, 4), 'soglia5': round(thr5, 4),
           'misure': {'fp': round(fp, 4), 'tp': round(tp, 3), 'nUmani': len(Hte), 'nClaude': len(Cte)}}, open(sys.argv[1].replace('features.json', 'modello.json'), 'w'))
