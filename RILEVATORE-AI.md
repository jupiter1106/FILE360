# «Testo scritto con l'AI?» — metodo, misure e limiti

*19 novembre 2026. Rilevatore di testi scritti da Claude (Haiku, Sonnet, Opus) e di prove lasciate dagli assistenti AI. Funziona sui file caricati (Word, PowerPoint, Excel, OpenDocument, PDF, HTML, RTF, testo) e sul testo scritto o incollato nel programma. Tutto avviene nel browser: il modello statistico è dentro la pagina e nessun dato viene inviato.*

## 1. In breve

| | Esito misurato |
|---|---|
| Testi di **Claude Haiku** riconosciuti | **98,5%** (269 testi) |
| Testi di **Claude Sonnet** riconosciuti | **92,9%** (309 testi) |
| Testi di **Claude Opus** riconosciuti | **86,2%** (305 testi) |
| Testi scritti su richieste «da studente» («non deve sembrare AI», «deve passare i rilevatori», «scrivilo come un ragazzo di quarta») | **96,4%** |
| Falsi allarmi su testi umani **mai visti dal modello** | letteratura 0/901 · Fanpage 0/733 · temi e appunti di studenti 1/700 · tesi 1/500 · Il Post 6/707 |
| Paragrafo di Claude dentro un testo umano | segnalato il passaggio, non il testo intero |
| Tempo | 80 ms per 29.000 parole |

La prima versione dello strumento mostrava solo le prove certe (impronte dei file, residui di chat), perché un indice di stile basato su 14 misure riconosceva 1 testo di Claude su 20. Questa versione usa un modello statistico addestrato su un corpus costruito apposta: riconosce più di 9 testi di Claude su 10 e resta sotto 1 falso allarme su 100 in ogni tipo di testo umano provato.

## 2. Come funziona

### Il modello dello stile
- **Che cosa guarda.** Le sequenze di 3, 4 e 5 caratteri e le sequenze di 1 e 2 parole, comprese le congiunzioni e la punteggiatura: come si costruiscono le frasi, non di che cosa parlano.
- **Normalizzazione prima del calcolo.** Si tolgono le differenze di formato: virgolette e apostrofi tipografici, trattini, a capo, elenchi, Markdown, cifre. Un testo copiato da Word, da una chat o da una pagina web dà lo stesso risultato.
- **Il modello.** Regressione logistica su 2^20 caratteristiche. Si tengono i 158.000 pesi più forti, salvati con 8 bit ciascuno: 0,42 MB dentro la pagina.
- **Testi lunghi.** Il testo si divide in passaggi di circa 180 parole, tagliati a fine frase. Il punteggio del testo è la media di quelli dei passaggi.
- **Parità.** Le funzioni che calcolano le caratteristiche sono le stesse nel programma e nell'addestramento (`src/rilevaai.js`, usate da `tools/rilevaai_feat.js`). I punteggi del programma differiscono da quelli di Python in media di 0,06, per la riduzione dei pesi.

### I testi di Claude (883)
Scritti per questo lavoro da Claude Haiku, Sonnet e Opus.
- **540 sugli stessi temi di testi umani:** articoli del Post e di Fanpage, voci di Wikipedia, pagine web, con il testo umano dello stesso tema nell'addestramento. Così il modello non impara l'argomento.
- **343 in 35 generi da studenti e professionisti:**
  - temi, relazioni, analisi di poesie, risposte di verifica;
  - email formali, lettere di presentazione, post LinkedIn, recensioni, verbali, comunicati;
  - abstract e introduzioni di tesi, discorsi, racconti, diari, messaggi a un amico…
- **Il 45% «umanizzato»:** con le richieste che fanno davvero studenti e professionisti, come «non deve sembrare fatto con l'AI», «il prof usa un rilevatore», «qualche imperfezione va bene», «stile colloquiale, niente elenchi».

### I testi umani (oltre 40.000), tutti scritti prima degli assistenti AI
| Gruppo | Fonte | Testi |
|---|---|---|
| Web italiano | PAISÀ (2010) e mC4 (2013-2020) | 20.000 |
| Giornali, riviste, enciclopedie | mC4: Repubblica, Corriere, Sole 24 Ore, Wikipedia, Treccani e altri 25 siti | 12.000 |
| Il Post, Fanpage | metà addestramento, metà prova | 2.880 |
| Scuola e università | Repubblica@Scuola, Skuola.net, Studenti.it (temi, appunti), Tesionline | 1.570 |
| Letteratura e saggistica | Progetto Gutenberg e Wikisource, 495 libri di pubblico dominio | 2.804 |

### La soglia
- **Come si sceglie.** Per ogni gruppo di testi umani si calcola il punteggio che lascia sopra di sé al massimo 3 testi su 1.000; si prende il più alto dei gruppi. Il calcolo usa punteggi «fuori campione», cioè dati da modelli che quel testo non l'avevano visto.
- **Perché per gruppo.** Proteggere il gruppo più difficile (gli articoli del Post, i testi umani più simili allo stile di Claude) protegge anche tutti gli altri: studenti, web, letteratura.
- **Fascia incerta.** Sotto la soglia, ma sopra il punteggio superato dal 5% dei testi umani. Lo strumento dice «stile non decisivo» e non segnala nulla.
- **Testi brevi (meno di circa 270 parole, un solo passaggio).** Soglia propria, calcolata nello stesso modo.
- **Passaggi.**
  - Se il testo è sopra la soglia, si evidenziano i passaggi sopra la soglia dei testi brevi.
  - Se non lo è, si evidenziano solo i passaggi sopra una soglia molto più severa: superata da 6 passaggi umani su 88.705. Serve a trovare un paragrafo incollato da Claude in un testo scritto da una persona.

## 3. Misure (`tools/rilevaai_modello.py`, banco `test/bench/rilevaai_bench.js`, suite)

**Validazione incrociata a 5 parti.**
- I testi di Claude e il testo umano sullo stesso tema stanno sempre nella stessa parte.
- I testi del web sono divisi per sito: nessun sito in due parti.
- AUC fuori campione: 0,997.

| Riconosciuti (fuori campione) | Testo intero | Solo le prime ~180 parole |
|---|---|---|
| Haiku | 98,5% | 97,8% |
| Sonnet | 92,9% | 86,7% |
| Opus | 86,2% | 79,7% |
| Testi «umanizzati» (tutti i modelli) | 96,4% | — |

| Passaggio isolato di Claude (soglia severa) | Riconosciuto |
|---|---|
| Haiku | 88% |
| Sonnet | 68% |
| Opus | 47% |

**Prova finale su testi mai visti dal modello né usati per la soglia:**

| Testi umani | Falsi allarmi |
|---|---|
| Letteratura, 151 libri mai visti (901 brani) | 0 (0%) |
| Fanpage, metà mai vista (733) | 0 (0%) |
| Temi e appunti di studenti (700) | 1 (0,14%) |
| Tesi di laurea, sito mai visto (500) | 1 (0,2%) |
| Il Post, metà mai vista (707) | 6 (0,85%) |

**Nota di trasparenza sulla soglia del Post.**
- Con la prima regola (6 testi su 1.000 per gruppo) gli articoli del Post mai visti davano l'1,4% di falsi allarmi.
- La regola è stata portata a 3 su 1.000 dopo aver visto quel numero, quindi lo 0,85% del Post non è più una misura del tutto «alla cieca».
- Gli altri quattro gruppi restano alla cieca e non sono cambiati.

**Casi di controllo nel banco:**
- tre testi di Claude, uno per modello, scritti su richieste «da studente»: riconosciuti;
- la Costituzione (articoli 1-12): non segnalata;
- un paragrafo di Claude aggiunto in fondo alla Costituzione: segnalato solo quel passaggio;
- il primo capitolo dei Promessi sposi: non segnalato. Prima di aggiungere la letteratura all'addestramento era un falso allarme; così è stato scoperto il problema.

**Prove nei file (invariate):**
- 300/300 file reali prodotti da ChatGPT con una prova certa;
- 0 prove forti o certe su 11.000 testi umani.

## 4. Limiti, detti chiaramente nello strumento

- **È una valutazione statistica, non una prova.** Lo strumento lo scrive in ogni esito. Un testo segnalato va verificato, per esempio chiedendo all'autore di spiegarlo, e non sanzionato sul solo punteggio.
- **Testi riscritti a mano.** Un testo di Claude riscritto con parole proprie può sfuggire. Uno parafrasato da un altro programma non è stato misurato.
- **Generi e richieste molto diversi da quelli dell'addestramento.** Su 60 testi di Claude scritti in un'altra occasione, con richieste e generi diversi (reclami, verbali, testi tecnici, risposte in chat), ne riconosce il 50%. Il modello è più forte sui generi su cui è addestrato: per ampliarlo servono altri testi di Claude in quei generi.
- **Altri assistenti.** Il modello è addestrato su Claude. ChatGPT, Gemini e gli altri sono coperti dalle prove nei file e nel testo, non dallo stile.
- **Prosa giornalistica molto curata.** È il tipo di testo umano più vicino allo stile di Claude: 6 articoli del Post su 707.
- **Testi brevi.** Sotto 80 parole lo stile non si valuta. Fino a circa 270 parole si usa un solo passaggio, con una soglia più severa.
- **Corpus.** PAISÀ (CC BY-NC-SA), mC4 (ODC-BY), Il Post e Fanpage (CC BY), Progetto Gutenberg e Wikisource sono stati usati solo per addestrare e misurare. Non sono nel repository; nel programma ci sono solo i pesi del modello.

## 5. Riprodurre o aggiornare il modello

```
python3 tools/rilevaai_modello.py CARTELLA_DATI --bits=20 --curati=3 --keep=200000 --out=src/rilevaai-modello.js
```

`CARTELLA_DATI` contiene:
- `gen/` e `gen2/`: le richieste e i testi di Claude;
- `corpus-claude/`;
- `corpus-umano/` (umani.json, mc4/, curati.json, scuola.json, fuori.json, ws/letteratura.json).

Il programma stampa tutte le misure di questo documento e scrive il modello con le soglie e le misure che lo strumento mostra.
