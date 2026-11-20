# «Testo scritto con l'AI?» — metodo, misure e limiti

*19 novembre 2026. Rilevatore di testi scritti da Claude (Haiku, Sonnet, Opus) e di prove lasciate dagli assistenti AI. Funziona sui file caricati (Word, PowerPoint, Excel, OpenDocument, PDF, HTML, RTF, testo) e sul testo scritto o incollato nel programma. Tutto avviene nel browser: il modello statistico è dentro la pagina e nessun dato viene inviato.*

## 1. In breve

| | Esito misurato |
|---|---|
| Testi di **Claude Haiku** riconosciuti | **98,5%** (269 testi) |
| Testi di **Claude Sonnet** riconosciuti | **91,0%** (335 testi) |
| Testi di **Claude Opus** riconosciuti | **82,2%** (366 testi) |
| Testi scritti su richieste «da studente» («non deve sembrare AI», «deve passare i rilevatori», «scrivilo come un ragazzo di quarta») | **95,3%** |
| Falsi allarmi su testi umani **mai visti dal modello** | letteratura 0/901 · Fanpage 0/733 · temi e appunti di studenti 0/700 · tesi 1/500 · Il Post 5/707 |
| Paragrafo di Claude dentro un testo umano | segnalato il passaggio, non il testo intero |
| Testo umano «migliorato» o parafrasato da Claude | 10% (resta in gran parte umano: vedi limiti) |
| Tempo | 160 ms per 29.000 parole |

La prima versione dello strumento mostrava solo le prove certe (impronte dei file, residui di chat), perché un indice di stile basato su 14 misure riconosceva 1 testo di Claude su 20. Questa versione usa un modello statistico addestrato su un corpus costruito apposta: riconosce quasi 9 testi di Claude su 10 (Opus, il più difficile, 8 su 10) e resta sotto 1 falso allarme su 100 in ogni tipo di testo umano provato.

## 2. Come funziona

### Il modello dello stile
- **Che cosa guarda.** Le sequenze di 3, 4 e 5 caratteri e le sequenze di 1 e 2 parole, comprese le congiunzioni e la punteggiatura: come si costruiscono le frasi, non di che cosa parlano.
- **Normalizzazione prima del calcolo.** Si tolgono le differenze di formato: virgolette e apostrofi tipografici, trattini, a capo, elenchi, Markdown, cifre. Un testo copiato da Word, da una chat o da una pagina web dà lo stesso risultato.
- **Il modello.** Regressione logistica su 2^20 caratteristiche. Si tengono i 168.000 pesi più forti, salvati con 8 bit ciascuno: 0,45 MB dentro la pagina. Con tutti i pesi i falsi allarmi sui testi di prova non cambiano.
- **Testi lunghi.** Il testo si divide in passaggi di circa 180 parole, tagliati a fine frase. Il punteggio del testo è la media di quelli dei passaggi.
- **Parità.** Le funzioni che calcolano le caratteristiche sono le stesse nel programma e nell'addestramento (`src/rilevaai.js`, usate da `tools/rilevaai_feat.js`). I punteggi del programma differiscono da quelli di Python in media di 0,04, per la riduzione dei pesi.

### I testi di Claude (1.015, più 59 riscritture usate solo per la prova)
Scritti per questo lavoro da Claude Haiku, Sonnet e Opus.
- **540 sugli stessi temi di testi umani:** articoli del Post e di Fanpage, voci di Wikipedia, pagine web, con il testo umano dello stesso tema nell'addestramento. Così il modello non impara l'argomento.
- **343 in 35 generi da studenti e professionisti:**
  - temi, relazioni, analisi di poesie, risposte di verifica;
  - email formali, lettere di presentazione, post LinkedIn, recensioni, verbali, comunicati;
  - abstract e introduzioni di tesi, discorsi, racconti, diari, messaggi a un amico…
- **87 in altri 12 generi** dove il modello era più debole: reclami, verbali, testi tecnici, risposte in chat, annunci di lavoro, comunicazioni ai clienti, domande alla pubblica amministrazione, FAQ…
- **59 riscritture di testi umani** («migliora questo testo», «riscrivilo con parole tue», «parafrasalo»): solo prova, non addestramento.
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
  - Se non lo è, si evidenziano solo i passaggi sopra una soglia molto più severa: superata da 7 passaggi umani su 88.697. Serve a trovare un paragrafo incollato da Claude in un testo scritto da una persona.

## 3. Misure (`tools/rilevaai_modello.py`, banco `test/bench/rilevaai_bench.js`, suite)

**Validazione incrociata a 5 parti.**
- I testi di Claude e il testo umano sullo stesso tema stanno sempre nella stessa parte.
- I testi del web sono divisi per sito: nessun sito in due parti.
- AUC fuori campione: 0,997.

| Riconosciuti (fuori campione) | Testo intero | Solo le prime ~180 parole |
|---|---|---|
| Haiku | 98,5% | 98,1% |
| Sonnet | 91,0% | 85,4% |
| Opus | 82,2% | 79,2% |
| Testi «umanizzati» (tutti i modelli) | 95,3% | — |
| Generi aggiunti nel terzo giro (reclami, verbali, testi tecnici…) | 69% | — |

| Passaggio isolato di Claude (soglia severa) | Riconosciuto |
|---|---|
| Haiku | 90% |
| Sonnet | 68% |
| Opus | 50% |

**Prova finale su testi mai visti dal modello né usati per la soglia:**

| Testi | Esito |
|---|---|
| Letteratura, 151 libri mai visti (901 brani) | 0 falsi allarmi |
| Fanpage, metà mai vista (733) | 0 falsi allarmi |
| Temi e appunti di studenti (700) | 0 falsi allarmi |
| Tesi di laurea, sito mai visto (500) | 1 falso allarme (0,2%) |
| Il Post, metà mai vista (707) | 5 falsi allarmi (0,71%) |
| Testi umani riscritti da Claude (59) | 6 riconosciuti (10%) |

**Prova sui generi mai visti.** Il modello precedente, addestrato senza il terzo giro, provato sui testi del terzo giro (generi che non aveva mai visto) riconosceva il 62% dei testi di Sonnet e il 54% di Opus. È la misura più onesta di che cosa succede con un genere assente dall'addestramento. Per questo il terzo giro è entrato nell'addestramento.

**Nota di trasparenza sulla soglia del Post.**
- Con la prima regola (6 testi su 1.000 per gruppo) gli articoli del Post mai visti davano l'1,4% di falsi allarmi.
- La regola è stata portata a 3 su 1.000 dopo aver visto quel numero, quindi lo 0,85% del Post non è più una misura del tutto «alla cieca».
- Gli altri quattro gruppi restano alla cieca. Il modello adottato, addestrato anche sul terzo giro, dà 5 su 707 (0,71%) con la stessa regola.

**Casi di controllo nel banco:**
- tre testi di Claude, uno per modello, scritti su richieste «da studente»: riconosciuti;
- la Costituzione (articoli 1-12): non segnalata;
- un paragrafo di Claude aggiunto in fondo alla Costituzione: segnalato solo quel passaggio;
- il primo capitolo dei Promessi sposi: non segnalato (fascia incerta, nessun passaggio evidenziato). Prima di aggiungere la letteratura all'addestramento era un falso allarme; così è stato scoperto il problema.

**Prove nei file (invariate):**
- 300/300 file reali prodotti da ChatGPT con una prova certa;
- 0 prove forti o certe su 11.000 testi umani.

**File reali di claude.ai** (forniti il 19/11/2026; nel banco con i metadati dell'autore anonimizzati):

| Come è arrivato in Word | Che cosa resta nel file | Esito |
|---|---|---|
| Documento Word creato da claude.ai | libreria docx.js (autore «Un-named») | prova certa + stile |
| Pulsante «Copia» sotto la risposta | Markdown non interpretato (`#`, `**`, `-`, tabelle con `\|`) | prova forte + stile |
| Testo selezionato e incollato | nessuna traccia di Claude: claude.ai non lascia il nome di un suo carattere (ChatGPT lascia «OpenAI Sans»); Word usa Times New Roman con la spaziatura delle pagine web, come per qualsiasi pagina | riconosciuto solo dallo stile (punteggio 4,1 contro soglia 0,8) |

## 4. Limiti, detti chiaramente nello strumento

- **È una valutazione statistica, non una prova.** Lo strumento lo scrive in ogni esito. Un testo segnalato va verificato, per esempio chiedendo all'autore di spiegarlo, e non sanzionato sul solo punteggio.
- **Testi riscritti.** Un testo di Claude riscritto con parole proprie può sfuggire. Un testo scritto da una persona e poi «migliorato» o parafrasato da Claude resta in gran parte umano: ne riconosce il 10%. In questi casi conta il confronto con l'originale, se c'è (passaggi in comune).
- **Generi assenti dall'addestramento.** Su generi mai visti il riconoscimento scende: 54-62% per Opus e Sonnet nella prova sui generi nuovi, 63% sui 60 testi scritti in un'altra occasione. Il modello copre 47 generi di studenti e professionisti; per altri generi servono altri testi.
- **Altri assistenti.** Il modello è addestrato su Claude. ChatGPT, Gemini e gli altri sono coperti dalle prove nei file e nel testo, non dallo stile.
- **Prosa giornalistica molto curata.** È il tipo di testo umano più vicino allo stile di Claude: 5 articoli del Post su 707.
- **Testi brevi.** Sotto 80 parole lo stile non si valuta. Fino a circa 270 parole si usa un solo passaggio, con una soglia più severa.
- **Corpus.** PAISÀ (CC BY-NC-SA), mC4 (ODC-BY), Il Post e Fanpage (CC BY), Progetto Gutenberg e Wikisource sono stati usati solo per addestrare e misurare. Non sono nel repository; nel programma ci sono solo i pesi del modello.

## 5. Riprodurre o aggiornare il modello

```
python3 tools/rilevaai_modello.py CARTELLA_DATI --bits=20 --curati=3 --keep=200000 --out=src/rilevaai-modello.js
```

`CARTELLA_DATI` contiene:
- `gen/`, `gen2/` e `gen3/`: le richieste e i testi di Claude;
- `corpus-claude/`;
- `corpus-umano/` (umani.json, mc4/, curati.json, scuola.json, fuori.json, ws/letteratura.json).

Il programma stampa tutte le misure di questo documento e scrive il modello con le soglie e le misure che lo strumento mostra.

## 6. Quarto giro (20 novembre 2026): più testi di Opus, soglia più severa

- **Testi nuovi.** 45 testi di Claude Opus in 30 generi, metà brevi: reclami, verbali, FAQ, testi tecnici, comunicazioni ai clienti, e-mail, domande alla PA, annunci, descrizioni di corsi, testi istituzionali, sintesi, temi, recensioni (`corpus-claude/claude2.json`).
- **Solo addestramento.** I testi nuovi entrano solo nell'addestramento. Le misure restano sugli stessi testi di prova di prima (Haiku, Sonnet e Opus dei giri precedenti), quindi il confronto è alla pari.
- **Due varianti provate.** La prima, con la stessa soglia, riconosceva di più (Opus 83,9%) ma portava Il Post da 0,71% a 0,99% di falsi allarmi. Scelta la seconda, con la soglia tarata a 0,18% di falsi allarmi fuori campione per gruppo: **falsi allarmi identici a prima** su tutti i testi mai visti.

**Risultati della variante scelta, prima → dopo:**
- Opus: 80,3% → 82,2%;
- Sonnet: 90,4% → 91,0%;
- Haiku: 98,1% → 98,5%;
- Opus sulle prime ~180 parole: 76,5% → 79,2%;
- passaggi isolati: in media 65% → 69%, con gli stessi 7 falsi allarmi su 88.697 passaggi umani;
- testi «umanizzati»: 96,5% → 95,3%.

**Griglia** (`test/bench/rilevaai_griglia.js`, nella suite; metodo in `VALUTAZIONE-RILEVAAI.md`): **4,55 → 4,62 su 5**.
