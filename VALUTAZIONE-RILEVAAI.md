# «Testo scritto con l'AI?» — griglia per i testi di Claude

*20 novembre 2026. La griglia si rifà con `node test/bench/rilevaai_griglia.js` (nella suite).*

**Da dove vengono le misure:**
- accuratezza e falsi allarmi sono quelle fuori campione dell'addestramento (`tools/rilevaai_modello.py`: validazione incrociata, testi umani mai visti) e viaggiano con il modello dentro il programma;
- prove certe ed esperienza d'uso si misurano sul prodotto vero.

Soglie fisse, uguali prima e dopo.

## In sintesi

| | Prima | Dopo il quarto giro |
|---|---|---|
| **Indice** | **4,55** | **4,62** |
| Accuratezza (35%) | 4,00 | 4,20 |
| Falsi allarmi (30%) | 4,67 | 4,67 |
| Prove certe (15%) | 5,00 | 5,00 |
| Esperienza (20%) | 5,00 | 5,00 |

## Criteri, soglie e misure

| Criterio | Soglie (voto) | Prima | Dopo |
|---|---|---|---|
| A1 Testi di Claude riconosciuti, media Haiku/Sonnet/Opus | ≥95 → 5 · ≥88 → 4 · ≥80 → 3 | 89,6% → 4 | 90,6% → 4 |
| A2 Opus, il modello più difficile | ≥90 → 5 · ≥80 → 4 · ≥70 → 3 | 80,3% → 4 | 82,2% → 4 |
| A3 Testi brevi (~180 parole), media | ≥90 → 5 · ≥82 → 4 · ≥72 → 3 | 86,3% → 4 | 87,6% → 4 |
| A4 Testi «umanizzati» | ≥95 → 5 · ≥88 → 4 | 96,5% → 5 | 95,3% → 5 |
| A5 Passaggio di Claude dentro un testo umano, media | ≥80 → 5 · ≥65 → 4 · ≥50 → 3 | 64,9% → 3 | 69,4% → 4 |
| F1 Falsi allarmi nel gruppo umano peggiore, testi mai visti | ≤0,5% → 5 · ≤1% → 4 · ≤2% → 3 | Il Post 0,71% → 4 | Il Post 0,71% → 4 |
| F2 Gruppi di testi umani mai visti nella prova | ≥5 → 5 | 5 → 5 | 5 → 5 |
| F3 Falsi allarmi sui passaggi umani | ≤0,05% → 5 | 7 su 88.697 (0,008%) → 5 | uguale → 5 |
| P1 Prove certe e forti (file creati dagli assistenti, i tre modi di claude.ai, residui di chat, testo nascosto, passaggi copiati) | 100% → 5 | 25/25 → 5 | 25/25 → 5 |
| E1 Tempo di analisi dello stile (3.649 parole) | ≤300 ms → 5 | 17 ms → 5 | 17 ms → 5 |
| E2 Spiegazione del risultato: esito a parole; passaggio di Claude evidenziato e testo umano no; accuratezza mostrata; rapporto scaricabile | 4/4 → 5 | 4/4 → 5 | 4/4 → 5 |
| E3 Violazioni WCAG 2.2 AA (axe), telefono e computer, chiaro e scuro | 0 → 5 | 0 → 5 | 0 → 5 |
| E4 Telefono (320 px e iPhone) | nessun difetto → 5 | 5 | 5 |

## Che cosa è cambiato

- **45 testi nuovi di Claude Opus** nei generi più deboli, metà brevi. Entrano solo nell'addestramento: le misure restano sugli stessi testi di prova.
- **Soglia più severa** (0,18% di falsi allarmi fuori campione per gruppo), per non aumentare i falsi allarmi sui testi mai visti. La variante con la soglia di prima riconosceva di più (Opus 83,9%), ma portava Il Post a 0,99%: scartata.
- **Il risultato:** più testi di Claude riconosciuti (Opus +1,9 punti, Opus breve +2,7, passaggi +4,5 in media) con gli stessi falsi allarmi. Unico calo: testi «umanizzati» −1,2 punti, sempre sopra il 95%.

## Limiti onesti e prossimi passi

- **A1, A2 e A3 restano a 4.** Opus è il modello più difficile. Per arrivare al 90% servono molti più testi di Opus in addestramento, soprattutto brevi e su richieste diverse.
- **F1 resta a 4.** Il Post è il gruppo umano più difficile (articoli molto curati). Abbassare i falsi allarmi sotto lo 0,5% costerebbe riconoscimento: la scelta è stata non peggiorarli.
- **Testi di Claude ritoccati a mano.** I testi riscritti da una persona o i testi umani «migliorati» da Claude restano in gran parte non riconosciuti (riscritture: 10%). Lo strumento lo dice.
