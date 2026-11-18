# Modifica PDF — revisione da cliente esigente

## Cosa è stato fatto (4 fasi)

**Fase 1 — fedeltà.** Si cambia solo ciò che si tocca; il resto della pagina resta identico al pixel (misurato: 0% di pixel cambiati fuori dalle modifiche su tutti i casi del banco). Risultato vero mentre si scrive, spostamento fluido, testo ricercabile nel PDF salvato.

**Fase 2 — fedeltà estrema.**
- Lettere prese dalla pagina, scelte per somiglianza visiva tra le righe (non per etichetta del carattere), con esemplari variati per le lettere ripetute.
- Lettere accentate composte (lettera vera + accento della pagina, o del carattere se nella pagina non c'è).
- Lettere assenti ricostruite col carattere più simile, rese con lo spessore del tratto e la morbidezza dei bordi della scansione; dimensione e linea di base tarate sulle lettere vere.
- Righe inclinate (scansioni storte): linea di base misurata e seguita; ogni lettera presa altrove si appoggia col suo fondo.
- Stili sulle lettere vere: colore, grassetto, corsivo, sottolineato, barrato, evidenziato, dimensione.
- Parole che si spostano: copiate al pixel (carta pulita) o solo l'inchiostro con bordi veri (carta con trama), con fusione invisibile della luminosità.
- Carta ricostruita alla risoluzione nativa della scansione, con la trama vera specchiata dai dintorni.

**Fase 3 — semplicità.** Lettura automatica di tutta la scansione all'apertura con avviso ben visibile (che non blocca la pagina); Invio conferma, Maiusc+Invio a capo; maniglia al passaggio del mouse e trascinamento diretto; guide di allineamento con aggancio (Alt per disattivarle); avvisi su lettere ricostruite e testo che non entra; trova/sostituisci che aspetta la lettura delle scansioni; il salvataggio attende tutte le riscritture.

**Fase 4 — copertura.** Timbri, firme e loghi come oggetti (spostare, togliere: resta la carta ricostruita); riconoscimento rigoroso (niente tabelle, cornici, testo non letto); PDF digitali con caratteri parziali: carattere di ripiego scelto a vista; uso da telefono verificato.

**Misure (banco `test/bench/scanedit_bench.js`, 4 scansioni × 4 modifiche, verità di riferimento):** somiglianza media delle parole cambiate 0,10 → 0,61 (il tetto pratico della misura è ~0,75-0,95 a seconda del caso: è il valore della pagina originale sulle parti uguali); pixel cambiati fuori dalle modifiche: 0%. Lettura di un documento reale di 2 pagine: avviso dopo ~4,5 s, tutto modificabile dopo ~23 s; salvataggio < 0,5 s.

## Obiezioni oggettive (il cliente più esigente)

1. **Attesa iniziale.** ~10-12 s per pagina prima di poter modificare una scansione (OCR nel browser). Su 30 pagine sono minuti. La prima pagina è pronta per prima, ma l'attesa resta percepibile.
2. **Il testo letto può essere sbagliato.** Se l'OCR legge male una parola, chi la modifica parte dal testo sbagliato e la ricerca non la trova. Le parole non toccate restano comunque identiche (sono pixel), ma la trascrizione non è verificabile a colpo d'occhio.
3. **Lettere che non compaiono in nessuna pagina** (es. una «Z» maiuscola) si disegnano con Helvetica, Times o Courier adattati: su caratteri lontani da questi tre (Verdana larghi, Garamond, caratteri decorativi) si notano a uno sguardo attento.
4. **Grassetto e corsivo sintetici.** Si ottengono ispessendo o inclinando le lettere vere: credibili, ma non sono il vero grassetto/corsivo del carattere.
5. **Reflow limitato.** Una parola molto più lunga in un paragrafo giustificato fa scorrere le righe seguenti dentro il blocco; il testo sotto il blocco non si sposta (può sovrapporsi) e le celle delle tabelle non si allargano (c'è solo l'avviso).
6. **Sfondi complessi.** Su testo sopra fondini colorati, retinature, filigrane o timbri sovrapposti la ricostruzione della carta è un'approssimazione: si nota ingrandendo molto.
7. **Scrittura a mano.** Il manoscritto non viene letto: non si modifica come testo (si può solo spostare/togliere come oggetto, se riconosciuto).
8. **Cursore con le frecce su/giù.** Durante la scrittura dal vivo, le frecce verticali seguono la disposizione del testo nascosto, non sempre quella che si vede.
9. **Qualità della lettura su scansioni povere** (fax, < 110 dpi, fotocopie sbiadite): OCR e ritagli peggiorano; manca un avviso preventivo della qualità attesa.
10. **Testo ricercabile approssimato.** Lo strato invisibile usa un carattere standard: copia e ricerca funzionano, ma l'evidenziazione della ricerca nei lettori PDF non coincide perfettamente con le lettere.
11. **Oggetti con testo dentro** (timbri con scritte lette dall'OCR) vengono esclusi dagli oggetti per prudenza: non si possono spostare come un tutt'uno.

## Nuova strategia per renderla inoppugnabile

1. **Velocità di lettura** — OCR in parallelo su più motori (uno per core), solo sulle zone con testo; lettura prioritaria della zona su cui si clicca; cache della lettura per documento (riaprirlo è istantaneo). Obiettivo: < 3 s per pagina percepiti.
2. **Trascrizione verificabile** — modalità «controlla la lettura»: le parole lette con poca sicurezza sono evidenziate; correggerle cambia solo la trascrizione (non i pixel). Ricerca tollerante agli errori di lettura (somiglianza, non uguaglianza).
3. **Carattere della scansione completo** — dalle lettere di tutte le pagine si costruisce un vero carattere vettoriale del documento (contorni tracciati e mediati); le lettere mancanti si sintetizzano per composizione (es. «E» da «F»+barra, «Z» da «z», cifre da cifre simili), non da un carattere standard. Grassetto e corsivo veri quando nel documento esistono.
4. **Impaginazione della pagina** — motore di layout che sposta i blocchi sottostanti quando un paragrafo cresce (se c'è spazio), allarga celle e righe di tabella ridisegnando la griglia, e propone di stringere il testo quando non c'è spazio.
5. **Ricostruzione dello sfondo per patch** — riempimento a campioni (stile PatchMatch) che continua retinature, fondini e filigrane; separazione dei livelli (timbro sopra testo) per toglierne uno senza toccare l'altro.
6. **Manoscritto** — riconoscimento della scrittura a mano per leggere e cercare; «scrivi con la stessa mano» per piccole correzioni usando i tratti presenti nella pagina.
7. **Navigazione del cursore sulla vista reale** — frecce su/giù, Home/Fine e selezione per righe calcolate sulla mappa delle lettere visibili.
8. **Controllo qualità automatico** — dopo ogni modifica, verifica di altezza, linea di base, spessore e spaziatura delle lettere ricomposte rispetto alle vicine; se qualcosa stona, avviso con un clic per la correzione proposta. Indicatore della qualità della scansione all'apertura.
9. **Strato di testo esatto** — testo invisibile posizionato lettera per lettera sulla mappa reale, così l'evidenziazione nei lettori coincide.
10. **Banco esteso** — corpus di 50+ scansioni sintetiche e realistiche (fax, fotocopie, foto da telefono, colori, timbri sovrapposti), misure automatiche a ogni rilascio con soglie che bloccano le regressioni.
