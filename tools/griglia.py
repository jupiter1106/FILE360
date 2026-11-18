#!/usr/bin/env python3
"""Griglia di valutazione di file360: punteggi 0-5 per criterio (con peso 1-3), media pesata per area, indice
complessivo con i pesi delle aree. Uso: python3 tools/griglia.py   (aggiorna i punteggi qui sotto a ogni giro)"""
AREE = {  # area: (peso %, [(codice, criterio, peso, punteggio, obiettivo)])
 'A Copertura funzionale': (18, [('A1','Operazioni sulle pagine',2,5,5),('A2','Conversioni da PDF',2,4,5),('A3','Conversioni verso PDF (Office, HTML)',3,4,4),('A4','Modifica e annotazione',2,4,5),('A5','Sicurezza documentale',2,5,5),('A6','Funzioni per l’Italia',2,5,5),('A7','Automazione e più file',1,5,5),('A8','Lavoro condiviso',1,2,3)]),
 'B Qualità dei risultati': (18, [('B1','Fedeltà (PDF/A, comprimi, unisci…)',3,5,5),('B2','Word ed Excel',2,4,5),('B3','OCR',2,4,5),('B4','Oscura',3,4,5),('B5','Modifica fedele',2,4,5),('B6','Verifica firme',2,4,5)]),
 'C Privacy e sicurezza': (12, [('C1','Nessun dato fuori dal dispositivo',3,5,5),('C2','Dipendenze esterne (OCR da CDN)',1,5,5),('C3','Sicurezza dell’app (CSP e intestazioni sul sito pubblicato)',2,5,5),('C4','Trasparenza verso chi usa',1,5,5)]),
 'D Accessibilità': (10, [('D1','WCAG 2.1 AA (automatico)',3,5,5),('D2','Uso con la tastiera',2,5,5),('D3','Lettore di schermo (prova reale)',2,3,5),('D4','Contrasto rafforzato e testi piccoli',1,4,4),('D5','Movimento ridotto, zoom, schermi stretti',1,4,5),('D6','Accessibilità dei file prodotti',2,3,5)]),
 'E Usabilità': (14, [('E1','Orientamento al primo uso',2,5,5),('E2','Passi per compiere un compito',2,4,5),('E3','Carico cognitivo nelle schermate complesse',3,4,5),('E4','Telefono',3,4,5),('E5','Messaggi ed errori',1,5,5),('E6','Coerenza tra strumenti',2,4,5)]),
 'F Estetica e sistema visivo': (10, [('F1','Identità',1,4,5),('F2','Disciplina del sistema (token)',3,5,5),('F3','Gerarchia e respiro',2,4,5),('F4','Rumore decorativo',1,5,5),('F5','Tema scuro',1,4,5),('F6','Animazioni e dettagli',1,4,5)]),
 'G Prestazioni': (6, [('G1','Avvio',2,5,5),('G2','Peso del primo caricamento',2,4,4),('G3','Lavori lunghi',2,5,5),('G4','OCR e foto',1,3,4)]),
 'H Robustezza': (4, [('H1','File ostili, memoria, annullamento',1,5,5)]),
 'I Trovabilità e distribuzione': (4, [('I1','Pagine per strumento indicizzabili',3,4,5),('I2','Installabile e offline (sul sito pubblicato)',1,5,5),('I3','Lingue',1,1,3),('I4','Fiducia (informazioni, licenze, contatti)',1,4,5)]),
 'J Ingegneria': (4, [('J1','Test e misura',2,5,5),('J2','Struttura del codice',2,2,4),('J3','Controllo di versione e backup',3,4,5),('J4','Riproducibilità (build, dati di prova)',1,5,5)]),
}
def area(cr, key=3): return sum(c[2] * c[key] for c in cr) / sum(c[2] for c in cr)
tot = tgt = 0
print(f"{'Area':34s} {'peso':>4s} {'oggi':>5s} {'obiettivo':>9s}")
for n, (w, cr) in AREE.items():
    a, o = area(cr), area(cr, 4); tot += w * a; tgt += w * o
    print(f"{n:34s} {w:>3d}% {a:5.2f} {o:9.2f}")
print(f"\nINDICE COMPLESSIVO {tot / 100:.2f} / 5   ({tot / 5:.0f}%)   obiettivo {tgt / 100:.2f} / 5")
print('\nCriteri sotto 3 (le priorità):'); [print(f"  {c[0]} {c[1]}: {c[3]} → {c[4]}") for _, cr in AREE.values() for c in cr if c[3] < 3]
