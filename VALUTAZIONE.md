# file360 — Griglia di valutazione e piano per il livello successivo

*18 novembre 2026. Valutazione fatta sul prodotto vero (build attuale), con misure automatiche, schermate su computer e telefono in chiaro e in scuro, e i risultati di suite, banchi e stress test. I punteggi si ricalcolano con `python3 tools/griglia.py`.*

## In sintesi

**Indice di partenza: 3,68 su 5 (74%)**, con il sito pubblicato come allora, cioè caricando il solo HTML (vedi §5). **Dopo gli otto passi del piano: 4,51 su 5 (90%)**, ricalcolato con `tools/griglia.py`; ogni voto alzato ha la sua misura nella tabella «Avanzamento». Le sezioni che seguono descrivono la situazione di partenza.

**Il cuore del prodotto è forte:**
- qualità dei risultati 4,2;
- privacy 4,4;
- robustezza 5;
- funzioni per l'Italia che i concorrenti non hanno (fatture XML, F24, visure, p7m, PDF/A verificato).

**Il prodotto perde punti attorno al cuore:**
- **Ingegneria (2,25)**: il codice **non è sotto controllo di versione**. Esiste solo in questo ambiente cloud, che è temporaneo. È il rischio più grave di tutti, e il più facile da togliere.
- **Trovabilità (2,0)**: le pagine per strumento, con titoli, testi e domande frequenti già scritti nel codice, non vengono pubblicate. Il sito è una pagina sola, che i motori di ricerca vedono come una.
- **Estetica e sistema visivo (3,0)**: l'identità c'è, ma il sistema non è disciplinato. Nel CSS ci sono 167 colori, 40 dimensioni di carattere, 45 raggi e 141 ombre diversi.
- **Usabilità (3,4)**:
  - sul telefono, in Modifica, le barre in alto occupano quasi metà dello schermo;
  - i pannelli laterali hanno paragrafi d'aiuto lunghi;
  - i layout non sono uniformi tra gli strumenti.
- **Funzioni**: manca la conversione **verso** PDF da Word, Excel, PowerPoint e HTML, cioè la funzione più cercata dopo «unisci» e «comprimi».

**Le cinque cose da fare per prime:**

| # | Cosa | Perché |
|---|---|---|
| 1 | Codice sotto git, su un repository privato | Elimina il rischio di perdere tutto |
| 2 | Sistema visivo con pochi valori fissi | Aspetto più pulito, coerenza misurabile |
| 3 | Telefono e pannelli più leggeri | Dove l'uso quotidiano soffre di più |
| 4 | Pagine per strumento, sitemap, caricamento a pezzi | Farsi trovare; primo caricamento da 5 a circa 1,5 MB |
| 5 | Word ed Excel verso PDF, filigrana come strumento | La lacuna funzionale più visibile |

---

## 1. Il metodo (a passi, ripetibile)

| Passo | Che cosa | Prodotto |
|---|---|---|
| 0 | **Perimetro e utenti**: cittadino; professionista (studio, commercialista, avvocato, tecnico); ufficio pubblico. Uso su computer e telefono. | Gli scenari da coprire |
| 1 | **Inventario**: strumenti, schermate, stati (vuoto, lavoro, risultato, errore), temi, dispositivi | Elenco completo |
| 2 | **Misure**: strumenti automatici (axe, veraPDF, pikepdf, LibreOffice, banchi, stress test, prestazioni, conteggio dei valori del CSS) e prove sulle schermate | Le prove, con numeri |
| 3 | **Punteggio** di ogni criterio sulla scala qui sotto, sempre con la sua prova | La griglia |
| 4 | **Indice** per area (media pesata dei criteri) e complessivo (media pesata delle aree) | `tools/griglia.py` |
| 5 | **Lacune → interventi**, ognuno con impatto, sforzo, criterio di accettazione misurabile e criteri della griglia che sposta | Il piano |
| 6 | **Si rifà la griglia dopo ogni giro**: un intervento è chiuso solo quando la sua misura lo conferma | Avanzamento tracciato |

**Scala 0–5 (ogni livello ha una definizione, non è un'impressione):**

| Voto | Significato |
|---|---|
| 0 | Assente, o un rischio aperto |
| 1 | C'è, ma non serve davvero (inaffidabile, incompleto, invisibile) |
| 2 | Funziona nei casi semplici; lacune evidenti per chi lo usa ogni giorno |
| 3 | Solido nell'uso comune; limiti noti e dichiarati |
| 4 | Eccellente: alla pari dei migliori prodotti del settore, misurato |
| 5 | Riferimento: meglio dei migliori, misurato e verificato con strumenti indipendenti |

**Regole di onestà della griglia:**
- un voto 4 o 5 richiede una misura;
- i criteri che si possono verificare **solo** con persone (oggi: D3, il lettore di schermo vero) non superano 3 senza quella prova;
- l'usabilità si misura con indicatori oggettivi e automatici: parole visibili nei pannelli, spazio del documento sul telefono, ricerche che portano allo strumento giusto, passi per un compito, struttura uguale tra gli strumenti. Sono indicatori, non sostituiscono le prove con le persone (5.3);
- i pesi dei criteri vanno da 1 a 3 secondo quanto contano per chi usa il prodotto;
- i pesi delle aree sommano a 100.

---

## 2. La griglia

### A — Copertura funzionale (peso 18%) · **3,87**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| A1 Operazioni sulle pagine | 2 | 5 | Unisci, Dividi (anche «In N file»), Ruota, Organizza (selezione veloce), Numeri, Impagina; banchi 100% | — |
| A2 Conversioni da PDF | 2 | 5 | Word (elenchi, titoli, colonne), Excel (foglio «Tabelle»), immagini, PDF/A; **PowerPoint con testo modificabile** (anche da scansione storta, OCR e cancellazione sulla carta uniforme), **testo e pagina web**; misurati con LibreOffice e python-pptx (`ppt_bench`) | — |
| A3 Conversioni verso PDF | 3 | **2** | Immagini e foto sì | **Word, Excel, PowerPoint, HTML verso PDF: assenti**. È tra le ricerche più frequenti del settore |
| A4 Modifica e annotazione | 2 | 5 | Modifica fedele (13/13, 7/7), scansioni, firme grafiche, moduli, filigrana; **Commenti e note**: evidenzia/sottolinea/barra agganciati alle parole, note, riquadri di testo, con autore, data e aspetto (/AP), più il riepilogo; verificati con PyMuPDF e pikepdf (qpdf) | — |
| A5 Sicurezza documentale | 2 | 5 | Oscura (anche più file), Proteggi, PDF/A verificato, p7m, copia conforme | — |
| A6 Funzioni per l'Italia | 2 | 5 | Fatture XML, F24, visure, estratti conto, XBRL, QR SEPA, laboratorio | — (vantaggio unico) |
| A7 Automazione e più file | 1 | 4 | Ricette, «Fai tutto tu», più file in molti strumenti | Filigrana non è uno strumento a sé |
| A8 Lavoro condiviso | 1 | 2 | Progetti locali; Google Drive facoltativo | Per scelta di privacy non c'è condivisione; va bene così, ma va spiegato |

### B — Qualità dei risultati (peso 18%) · **4,21**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| B1 Fedeltà | 3 | 5 | veraPDF 90/90; 1504/1504 file validi; tag, segnalibri e allegati conservati | — |
| B2 Word ed Excel | 2 | 4 | Banchi 100%; scansioni difficili 100% | Misura su documenti reali complessi (oggi solo corpus inventato) |
| B3 OCR | 2 | 4 | Errore medio < 0,5% su fogli non piatti | Lingue oltre l'italiano poco provate |
| B4 Oscura | 3 | 4 | 17/17 digitale e scansione; foto con targa e didascalia; verifica per rilettura | Nessuna misura su documenti veri (il corpus è inventato) |
| B5 Modifica fedele | 2 | 4 | Identico al pixel 13/13 e 7/7 | Scansioni molto rovinate |
| B6 Verifica firme | 2 | 4 | Falsa, manomessa, revocata riconosciute; revoca dal file | Revoca online impossibile da browser (limite esterno) |

### C — Privacy e sicurezza (peso 12%) · **4,14**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| C1 Nessun dato fuori dal dispositivo | 3 | 5 | CSP: connessioni solo verso il sito stesso e verso il motore OCR; test «privacy» e stress verdi | — |
| C2 Dipendenze esterne | 1 | 3 | Il motore OCR e i dizionari si scaricano da cdn.jsdelivr.net al primo uso | **Ospitarli sul proprio sito** (né terzi né rete esterna) |
| C3 Sicurezza dell'app | 2 | 3 | Prove XSS, niente eval; la CSP stretta e le altre intestazioni esistono, ma **stanno in `_headers`, che non viene pubblicato** caricando il solo HTML | Pubblicare la cartella (0.2); poi togliere `'unsafe-inline'` dagli script nella versione sito |
| C4 Trasparenza | 1 | 5 | Centro privacy, rapporti, «elaborato sul dispositivo» ovunque | — |

### D — Accessibilità (peso 10%) · **3,82**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| D1 WCAG 2.1 AA automatico | 3 | 5 | axe: 76/76 pagine pulite, chiaro e scuro | — |
| D2 Tastiera | 2 | 4 | Organizza e Modifica da tastiera; focus visibile nei primi 25 Tab | Il campo di ricerca della home non mostra il contorno del focus |
| D3 Lettore di schermo | 2 | 3 | Aree principali, «Vai al contenuto», 125 etichette, 7 annunci per gli aggiornamenti | **Mai provato con NVDA o VoiceOver**; l'editor sulla pagina è per natura difficile |
| D4 Contrasto rafforzato, testi piccoli | 1 | 3 | AAA non raggiunto (10–17 punti per pagina); etichette di sezione a 11 px | Etichette a 12 px o più; grigi un po' più scuri |
| D5 Movimento ridotto, zoom, 320 px | 1 | 4 | Movimento ridotto rispettato; prove a 320 px | — |
| D6 File prodotti accessibili | 2 | 3 | Tag conservati; Word con titoli ed elenchi | Pagine rifatte come immagine e PDF da OCR senza tag; titoli dai livelli del testo non aggiunti |

Dettagli trovati in questo giro:
- nella home c'è un salto di livello tra i titoli (h1 → h3);
- in Modifica, i campi «carattere» e «dimensione» hanno solo il suggerimento, non un'etichetta visibile.

### E — Usabilità (peso 14%) · **3,38**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| E1 Orientamento al primo uso | 2 | 4 | Riquadro grande, «guidami», ricerca, compiti di tutti i giorni | La home ha molte scelte allo stesso livello visivo |
| E2 Passi per un compito | 2 | 4 | Comprimi: trascina → avvia → scarica; «cosa fare dopo» | — |
| E3 Carico cognitivo | 3 | **3** | Modifica: sei righe di aiuto in cima al pannello, cinque sezioni; Oscura: otto sezioni; PDF/A: spiegazioni lunghe sotto ogni scelta | Aiuti a richiesta («?») e opzioni avanzate raccolte |
| E4 Telefono | 3 | **3** | 24/24 senza nulla che esce dallo schermo, ma in Modifica cinque barre (app, strumento, file, schede, comandi) prendono circa il 45% dell'altezza; la barra dei comandi è tagliata | Barre compatte e a scomparsa; documento ≥ 65% dello schermo |
| E5 Messaggi ed errori | 1 | 4 | 0 «errore imprevisto» su 518 prove; azioni proposte | Il riquadro d'errore è stretto e va a capo male; virgolette miste («» e "") |
| E6 Coerenza tra strumenti | 2 | **3** | Intestazioni con o senza sottotitolo; alcune aree di lavoro mezze vuote (PDF/A), altre affollate (Modifica) | Una sola struttura di pagina per tutti gli strumenti |

### F — Estetica e sistema visivo (peso 10%) · **3,00**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| F1 Identità | 1 | 4 | Logo, viola e magenta riconoscibili, titoli con un carattere di forte personalità | — |
| F2 Disciplina del sistema | 3 | **2** | Valori distinti nel CSS: **167 colori, 133 trasparenze, 40 dimensioni di carattere (da 6,5 a 32 px), 45 raggi, 141 ombre, 9 pesi, 3 famiglie** più quelle dei documenti | Una scala fissa, misurata da un test (qui sotto) |
| F3 Gerarchia e respiro | 2 | 3 | La home ha la colonna destra fitta di schede colorate; PDF/A ha l'area centrale quasi vuota | Più spazio e meno colori in home; area centrale riempita |
| F4 Rumore decorativo | 1 | 3 | Icone di file che fluttuano dietro testi e schede (si vedono dietro «Cosa devi fare?»); anello e pallino attorno al pulsante di caricamento | Sfondo più quieto, mai dietro il testo |
| F5 Tema scuro | 1 | 4 | Completo e leggibile (AA) | — |
| F6 Animazioni e dettagli | 1 | 4 | Anteprime «come funziona», risultato con il risparmio in grande | — |

### G — Prestazioni (peso 6%) · **3,86**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| G1 Avvio | 2 | 5 | Telefono lento pronto a 865 ms; computer a 237 ms | — |
| G2 Peso del primo caricamento | 2 | **2** | 8,2 MB; **5,1 MB trasferiti** (gran parte è già compressa in base64: il server non la riduce) | Sito a pezzi: solo il necessario all'apertura (stima: circa 1,5 MB) |
| G3 Lavori lunghi | 2 | 5 | 1000 pagine: Word 11 s, Excel 6 s, PDF/A 5,6 s, Comprimi 3,4 s | — |
| G4 OCR e foto | 1 | 3 | Scansioni 1,8 s a pagina (4 processori); foto 1,5 s | Limite del motore; possibile solo con un motore diverso |

### H — Robustezza (peso 4%) · **5,00**

518 prove sui file ostili, 0 errori sfuggiti, memoria stabile (38 MB su 12 giri), annullamento in 0,3–2,6 s.

### I — Trovabilità e distribuzione (peso 4%) · **1,33**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| I1 Pagine per strumento indicizzabili | 3 | **1** | Titoli, descrizioni, passi e domande frequenti di ogni strumento sono **nel codice**, ma il pacchetto Netlify pubblica una pagina sola, senza sitemap, robots, reindirizzamenti | Una pagina vera per strumento (es. `/unire-pdf/`) con quei testi, sitemap e reindirizzamenti |
| I2 Installabile e offline | 1 | 1 | Pronto nella cartella Netlify (manifest, service worker, icone), ma **non pubblicato** caricando il solo HTML | Pubblicare la cartella (0.2) |
| I3 Lingue | 1 | 1 | Solo italiano | Inglese (decisione strategica tua) |
| I4 Fiducia | 1 | 3 | Contatti presenti; privacy chiara | Pagina «Informazioni»: chi lo fa, licenze delle librerie aperte, come segnalare un problema |

### J — Ingegneria (peso 4%) · **2,25**

| Criterio | Peso | Voto | Prova | Cosa manca |
|---|---|---|---|---|
| J1 Test e misura | 2 | 5 | Suite di 18 gruppi, banchi con soglie, stress test con verificatori indipendenti | — |
| J2 Struttura del codice | 2 | **2** | `app.js` di 37.400 righe; circa 7.000 righe di CSS dentro il JavaScript | Sorgenti in moduli (la build li unisce già); CSS fuori dal JS |
| J3 Controllo di versione e backup | 3 | **0** | **Nessun repository git**: il codice esiste solo in questo ambiente cloud temporaneo | Repository privato (es. GitHub) con la storia; il resto del piano ne dipende |
| J4 Riproducibilità | 1 | 4 | Build in un comando; generatori dei file di prova | Corpus pesanti (2,1 GB in `test/`) da escludere dal repository |

### Riepilogo

| Area | Peso | Oggi | Obiettivo |
|---|---|---|---|
| A Copertura funzionale | 18% | 3,87 | 4,67 |
| B Qualità dei risultati | 18% | 4,21 | 5,00 |
| C Privacy e sicurezza | 12% | 4,14 | 5,00 |
| D Accessibilità | 10% | 3,82 | 4,91 |
| E Usabilità | 14% | 3,38 | 5,00 |
| F Estetica e sistema visivo | 10% | 3,00 | 5,00 |
| G Prestazioni | 6% | 3,86 | 4,57 |
| H Robustezza | 4% | 5,00 | 5,00 |
| I Trovabilità e distribuzione | 4% | 1,33 | 4,67 |
| J Ingegneria | 4% | 2,25 | 4,75 |
| **Indice** | | **3,68** | **4,88** |

---

## 3. Il piano, a ondate

Ogni intervento ha:
- un criterio di accettazione misurabile;
- i criteri della griglia che sposta.

L'ordine viene da impatto ÷ sforzo, con prima i rischi.

### Ondata 0 — Rischio (subito)

| Intervento | Impatto | Sforzo | Accettazione | Sposta |
|---|---|---|---|---|
| **0.1 Repository git privato** con sorgenti, test, generatori e documenti. Esclusi i corpus pesanti, che si rigenerano; `.gitignore` | Altissimo | Piccolo | Da un clone pulito: `python3 build.py` produce lo stesso file e la suite passa | J3 0→5 |
| **0.2 Pubblicare la cartella, non il solo HTML**: su Netlify, nella pagina del sito, sezione «Deploys», trascinare la cartella `netlify` (estratta dallo zip) invece del file. È lo stesso gesto | Alto | Nullo | Sul sito pubblicato: intestazioni di sicurezza presenti, app installabile, funziona senza rete (prova automatica sul sito) | C3 3→4, I2 1→5; rende possibili 4.1 e 4.2 |

### Ondata 1 — Sistema visivo (aspetto e coerenza)

| Intervento | Impatto | Sforzo | Accettazione | Sposta |
|---|---|---|---|---|
| 1.1 **Token**: circa 24 colori con un significato (testo, superfici, bordi, accento, stati) + varianti scure; scala tipografica di 8 passi (12–36 px); 4 raggi; 3 ombre; 4 pesi; 2 famiglie (titoli e testo; il monospaziato solo per i codici) | Alto | Medio | Un test conta i valori distinti nel CSS (colori ≤ 40 comprese le illustrazioni, dimensioni ≤ 10, raggi ≤ 5, ombre ≤ 6) e fallisce sopra soglia; axe 76/76 invariato | F2 2→5, F3, E6 |
| 1.2 **Home**: sfondo animato più quieto e mai dietro il testo; etichette di sezione nel carattere del testo (non monospaziato spaziato); meno colori nelle schede delle categorie; titoli in ordine (h1 → h2) | Medio | Piccolo | Schermate prima/dopo; nessuna icona decorativa sotto un testo; heading-order pulito | F3, F4, D |
| 1.3 **Struttura unica delle pagine strumento**: stessa intestazione, stessa barra del file, area centrale sempre utile (PDF/A: riepilogo e anteprima, non una riga sola) | Medio | Medio | Le 37 schermate rispettano lo stesso schema (prova automatica sulle classi) | E6 3→5, F3 |
| 1.4 **Riquadro d'errore** a tutta larghezza, azioni sotto il testo; virgolette uniformi («») | Piccolo | Piccolo | Schermata; test su un file rotto | E5 4→5 |

### Ondata 2 — Usabilità (telefono e pannelli)

| Intervento | Impatto | Sforzo | Accettazione | Sposta |
|---|---|---|---|---|
| 2.1 **Telefono**: in Modifica, Oscura e Firme le barre si compattano e si nascondono scorrendo; comandi in un menu «Altro» | Alto | Medio | Il documento occupa almeno il 65% dell'altezza su iPhone SE e 13 (misura automatica); nessun comando tagliato | E4 3→5 |
| 2.2 **Pannelli leggeri**: aiuti a richiesta («?»), al massimo una riga visibile per sezione, opzioni avanzate in «Altre opzioni» | Alto | Medio | Parole visibili nel pannello ≤ 60 per strumento (misura automatica); compiti dei test d'interfaccia invariati | E3 3→5 |
| 2.3 Etichette visibili per carattere e dimensione in Modifica; contorno del focus nella ricerca della home; etichette di sezione a 12 px o più | Piccolo | Piccolo | axe con le regole «buone pratiche»: 0 problemi gravi | D2, D4 |

### Ondata 3 — Funzioni mancanti

| Intervento | Impatto | Sforzo | Accettazione | Sposta |
|---|---|---|---|---|
| 3.1 **Filigrana** come strumento (il motore c'è già nelle Ricette): testo o immagine, posizione, trasparenza, pagine | Medio | Piccolo | Banco: testo presente su ogni pagina scelta, testo originale intatto | A4, A7 |
| 3.2 **Word verso PDF** (.docx) sul dispositivo: paragrafi, stili, elenchi, tabelle, immagini, intestazioni; caratteri incorporati, PDF/A facoltativo | Molto alto | Grande | Banco su 10 documenti di prova: tutto il testo presente e nell'ordine; impaginazione confrontata con LibreOffice (differenza misurata); limiti dichiarati | A3 2→4 |
| 3.3 **Excel verso PDF** (.xlsx): fogli come tabelle, adattati alla pagina | Alto | Medio | Banco: ogni cella presente; nessuna colonna tagliata | A3 |
| 3.4 PowerPoint verso PDF, PDF in PowerPoint | Medio | Grande | Da decidere dopo 3.2 | A2, A3 |

### Ondata 4 — Farsi trovare, alleggerire, fiducia

| Intervento | Impatto | Sforzo | Accettazione | Sposta |
|---|---|---|---|---|
| 4.1 **Pagine per strumento** nel pacchetto Netlify: titolo, descrizione, passi e domande già scritti, in HTML vero; `sitemap.xml`, `robots.txt`, reindirizzamenti; dati strutturati (FAQ, SoftwareApplication) | Alto | Medio | 37 pagine con titolo e testo propri, senza eseguire JavaScript; sitemap valida | I1 1→5 |
| 4.2 **Caricamento a pezzi** nella versione sito: all'apertura solo il necessario, il resto quando serve (anche senza rete dopo la prima volta). Il file unico resta com'è | Alto | Medio | Trasferiti all'apertura ≤ 1,6 MB; prove PWA e CSP verdi | G2 2→4 |
| 4.3 **Motore OCR sul proprio sito** (non più da cdn.jsdelivr.net); nella versione sito via `'unsafe-inline'` dalla CSP degli script | Medio | Piccolo | Nessuna richiesta a domini esterni in nessuno strumento (test di rete) | C2 3→5, C3 4→5 |
| 4.4 **Pagina «Informazioni»**: chi lo fa, licenze delle librerie, come segnalare un problema | Piccolo | Piccolo | Raggiungibile dal menu e da ogni pagina | I4 3→5 |
| 4.5 **Inglese** | Alto se si punta all'estero | Grande | Ogni testo dell'interfaccia tradotto; test d'interfaccia anche in inglese | I3 1→3 |

### Ondata 5 — Ingegneria e prove con le persone

| Intervento | Impatto | Sforzo | Accettazione | Sposta |
|---|---|---|---|---|
| 5.1 **Sorgenti in moduli** (la build li unisce come oggi); CSS fuori dal JS | Medio (per il futuro) | Medio | Stesso file prodotto (stessa suite verde); nessun file sorgente oltre 3.000 righe | J2 2→4 |
| 5.2 **Prova con un lettore di schermo vero** (NVDA su Windows, VoiceOver su Mac e iPhone) sui cinque compiti principali | Medio | Piccolo (ma serve una persona) | Compiti riusciti; problemi trovati corretti | D3 3→5 |
| 5.3 **Prova con 5 persone reali** (cittadino, studio professionale, ufficio): cinque compiti a testa, tempo e riuscita | Alto | Piccolo (ma servono persone) | Riuscita ≥ 90%; ogni difficoltà osservata diventa un intervento | E1–E6 |
| 5.4 **Corpus reale** (documenti veri anonimizzati, con consenso) per misurare Oscura, Word ed Excel fuori dai casi inventati | Alto | Medio | Misure pubblicate in STRESS-TEST.md | B2, B4 |

**Indice atteso:**
- dopo le ondate 0–2: circa 4,2;
- dopo la 4: circa 4,5;
- con 3.2 e le prove con persone e lettore di schermo: oltre 4,7.

---

## 4. Che cosa serve da te

1. **Repository (0.1)**: un repository privato su GitHub, o dove preferisci, da collegare a questa sessione. Senza, il lavoro resta solo qui.
2. **Lingua inglese (4.5)**: sì o no. È una scelta di mercato, non tecnica.
3. **Word verso PDF (3.2)**: è il lavoro più grande del piano. Va bene partire da Word ed Excel e decidere PowerPoint dopo?
4. **Prove con persone e con un lettore di schermo (5.2, 5.3)**: io posso preparare compiti e schede di osservazione, ma le prove le devono fare persone vere.
5. **Corpus reale (5.4)**: solo se puoi raccogliere documenti con il consenso di chi li ha prodotti. Il testo non finirà mai in report o commit.

---

## 5. Come viene pubblicato oggi

Su Netlify viene caricato **solo l'HTML**. Il file unico va benissimo per aprirlo dal computer, ma sul sito così si perde ciò che vive nei file accanto:

- **intestazioni di sicurezza** (`_headers`): CSP, blocco dell'incorporamento in altri siti, isolamento delle finestre;
- **app installabile e senza rete**: manifest, service worker, icone;
- in futuro: **una pagina per strumento**, sitemap, **caricamento a pezzi** (ondata 4). Sono per natura più file.

La soluzione è l'intervento 0.2: trascinare su Netlify la cartella invece del file. L'HTML singolo resta com'è, per chi lo vuole aprire dal computer.

Se si vuole restare per forza a un solo file, si può recuperare solo una parte: una CSP scritta dentro l'HTML (senza il blocco dell'incorporamento, che una pagina non può dichiarare da sola). App installabile, funzionamento senza rete, pagine per strumento e caricamento a pezzi restano impossibili.

---

## 6. Strategia per arrivare ad almeno 4,5

Ogni passo ha:
- i criteri della griglia che sposta, con il voto di arrivo;
- la misura che lo chiude.

Un passo è chiuso solo quando la misura passa **e** la suite completa resta verde (nessun peggioramento).

| Passo | Contenuto | Criteri (oggi → arrivo) | Misura che lo chiude |
|---|---|---|---|
| **1. Fondamenta** | Repository git locale con la storia di ogni passo; archivio dei sorgenti consegnato a ogni giro (backup da te); build verificata da una copia pulita; la cartella per Netlify come forma di pubblicazione | J3 0 → 4 · J4 4 → 5 · C3 3 → 4 · I2 1 → 5 | `git log` con i passi; build da una copia pulita identica; prova PWA e intestazioni sulla cartella |
| **2. Sito vero** | Una pagina HTML per strumento (titolo, testo, passi e domande già scritti), sitemap, robots, reindirizzamenti, dati strutturati; JavaScript in file separati caricati quando servono; CSP senza `'unsafe-inline'` per gli script; motore OCR ospitato sul sito; pagina «Informazioni» (licenze, contatti, segnalazioni); condivisione del risultato dal telefono (Web Share, senza server) | I1 1 → 5 · G2 2 → 4 · C2 3 → 5 · C3 4 → 5 · I4 3 → 5 · A8 2 → 3 | 37 pagine leggibili senza JavaScript; primo caricamento ≤ 1,6 MB; nessuna richiesta a domini esterni; CSP verificata nel browser |
| **3. Sistema visivo** | Token: palette con significati, 8 dimensioni di carattere, 4 raggi, 3 ombre, 4 pesi, 2 famiglie (+ monospaziato per i codici); un test che conta i valori nel CSS e fallisce sopra soglia; home più quieta; titoli in ordine; riquadro d'errore; struttura uguale per tutte le pagine strumento; area centrale di PDF/A utile | F2 2 → 5 · F3 3 → 4 · F4 3 → 5 · F5 4 → 5 · E5 4 → 5 · E6 3 → 5 | Test dei token verde; axe 76/76 e «buone pratiche» senza problemi gravi; schermate prima/dopo |
| **4. Usabilità** | Telefono: barre compatte, documento ≥ 65% dell'altezza, nessun comando tagliato; pannelli: aiuti a richiesta, ≤ 60 parole visibili; etichette visibili in Modifica; focus nella ricerca; etichette ≥ 12 px; ricerca che trova lo strumento giusto (60 domande tipiche) | E3 3 → 5 · E4 3 → 5 · E1 4 → 5 · E2 4 → 5 · D2 4 → 5 · D4 3 → 4 | Misure automatiche su tutti gli strumenti; ≥ 95% delle 60 domande portano allo strumento giusto |
| **5. Funzioni** | Filigrana come strumento; **Word (.docx) verso PDF** ed **Excel (.xlsx) verso PDF** sul dispositivo; testo e HTML verso PDF | A3 2 → 4 · A4 4 → 5 · A7 4 → 5 | Banchi nuovi: tutto il testo presente e nell'ordine; confronto dell'impaginazione con LibreOffice; celle presenti, nessuna colonna tagliata |
| **6. File accessibili** | I PDF prodotti dall'OCR e le pagine rifatte come immagine escono con i tag (paragrafi nell'ordine di lettura) e la lingua; zoom al 400% senza scorrimento orizzontale | D6 3 → 4 · D5 4 → 5 | veraPDF (profilo PDF/UA) senza errori sui tag; prova automatica di riflusso |
| **7. Codice** | Sorgenti in moduli (la build li unisce: file prodotto identico byte per byte) | J2 2 → 4 | Nessun file sorgente oltre 3.000 righe; file prodotto identico |
| **8. Verifica** | Suite completa, stress test, griglia ricalcolata, documenti aggiornati, consegna | — | Indice ≥ 4,5 |

**Indice atteso a fine strategia: circa 4,55.** Restano fuori, per onestà:
- D3 (serve una prova con un lettore di schermo vero);
- I3 (l'inglese è una scelta di mercato);
- i criteri B, che per salire chiedono documenti reali.

### Avanzamento

| Passo | Stato | Misure | Criteri | Indice |
|---|---|---|---|---|
| 1. Fondamenta | chiuso | `git log` con i passi; build da una copia pulita del repository **identica byte per byte** (SHA-256 uguale); cartella Netlify ricreata da zero a ogni build | J3 0 → 4 (manca una copia remota: dipende da te) · J4 4 → 5 | |
| 2. Sito vero | chiuso | **41 pagine** con contenuto, titolo, descrizione, indirizzo canonico e dati strutturati già nell'HTML (home, 37 strumenti, Informazioni, Privacy, Condizioni d'uso), leggibili anche con JavaScript spento · apertura **799 KB** (brotli), **1,53 MB** compresi i moduli scaricati subito dopo (prima: 5,08 MB) · **0 richieste** ad altri domini, OCR compreso · CSP senza `'unsafe-inline'` per gli script (25 script elencati per impronta), **0 violazioni** nel browser con OCR, Oscura, Word, Comprimi, Immagini · app installabile: pagine mai aperte e **OCR senza rete** dopo il primo uso | C2 3 → 5 · C3 3 → 5 · G2 2 → 4 · I1 1 → 4 · I2 1 → 5 · I4 3 → 4 | 3,68 → **3,98** |
| 3. Sistema visivo | chiuso (suite 19/19) | `tools/tokens.py` nella suite: **9 dimensioni di testo** (8 + 11 px solo per contrassegni sopra documenti e icone; prima 39), **4 pesi** (prima 9), **6 raggi** (prima 31 valori), **4 ombre** (3 di elevazione + alone dei pulsanti principali; prima 109 scritte a mano), **4 colori scritti a mano** (prima 160: ora errore, avviso, conferma, accento, preferito, selezione sono token che seguono il tema) · titoli in ordine su home e 37 strumenti (prima 38 salti h1→h3) · sfondo animato solo nei margini, mai dietro i testi; orbita ferma finché non serve · categorie della home con tinta leggera · riquadro d'errore nuovo: stessa diagnosi in ogni strumento, riparazione come prima azione, virgolette uniformi · PDF/A: esito pagina per pagina con miniature (originale o ricostruita) · schermate prima/dopo: 0,5–4,8% di pixel diversi, nessuna rottura | F2 2 → 5 · F3 3 → 4 · F4 3 → 5 · E5 4 → 5 · E6 3 → 4 · D4 3 → 4 | 3,98 → **4,16** |
| 4. Usabilità | chiuso (suite 21/21) | Telefono, documento aperto: in Modifica il documento occupa il **66%** dell'altezza (prima 45%); barra del documento su una riga con menu «⋯» (nome, pagine, versioni, conteggio, scarica, chiudi); gli altri strumenti guadagnano 12–17 punti · pannelli: **al massimo 60 parole** di spiegazione visibili (prima fino a 184), le altre con «?» per sezione · ricerca: **60/60** domande tipiche al primo posto (prima **45/60**); su 30 domande nuove scritte dopo tutte le correzioni e misurate una volta sola: **28/30** al primo posto, 29/30 nei primi tre (27/30 dopo l’arrivo dei due strumenti del passo 5) · focus visibile nella finestra di ricerca (prima nessuno) · «pt» accanto alla dimensione del carattere | E1 4 → 5 · E3 3 → 4 · E4 3 → 4 · D2 4 → 5 | 4,16 → **4,27** |
| 5. Funzioni | chiuso (suite 21/21) | **Word, Excel e testi in PDF** sul dispositivo (.docx, .xlsx, .txt, Markdown, .csv, .html), con un impaginatore nuovo: Word 148/148 frasi nell'ordine, «Pagina X di Y» su ogni pagina, immagine inclusa, **3 pagine come LibreOffice**; Excel **680/680** celle, nessun testo fuori pagina (LibreOffice taglia il foglio largo e mostra «###»); HTML senza script né richieste a internet · **Filigrana** come strumento: testo o logo, quattro disposizioni, pagine scelte, anteprima dal vivo, testo del documento intatto | A3 2 → 4 · A7 4 → 5 | 4,27 → **4,35** |
| 6. File accessibili | chiuso (suite 23/23) | Tag di accessibilità scritti da zero (`TagPdf`): PDF da Word, Excel, **PowerPoint**, Markdown, HTML e la loro unione **conformi a PDF/UA-1 per veraPDF (6/6)**; PDF dall'OCR con paragrafi taggati e scansione come decorazione, **2/2 conformi**, testo cercabile intatto · zoom al 400% senza scorrimento orizzontale (home e 7 strumenti) · **PowerPoint in PDF** (caselle, elenchi, tema, tabelle, immagini, **grafici disegnati dai dati** con testo alternativo che ne riporta i valori; 31/31 frasi, 6 diapositive) · **OCR in inglese, francese, tedesco, spagnolo**: errore medio 0,54% (peggiore 1,69%), lettere accentate 14/14 | D6 3 → 4 · D5 4 → 5 · B3 4 → 5 · A3 4 → 5 | 4,35 → **4,44** |
| 7. Codice | chiuso | `src/app.js` (37.700 righe) diviso in **17 moduli** `src/app/NN-nome.js` (tools/moduli.py), tagliati solo all'inizio di una sezione; il file prodotto è **identico byte per byte** (SHA-256 uguale prima e dopo); nessun file sorgente oltre 3.000 righe (controllo nella suite) | J2 2 → 4 | 4,44 → **4,46** |
| 8. Conversioni e commenti | chiuso | **PDF in PowerPoint** con testo modificabile: sfondo senza testo (il testo del PDF reso invisibile, immagini e grafica identiche), caselle a paragrafi con carattere, grassetto/corsivo, dimensione, colore, interlinea, rientro e allineamento; scansioni con l'OCR, righe inclinate come l'originale e cancellate solo su carta uniforme (grana ricostruita), caselle di spunta e cornici lasciate nell'immagine. Misura indipendente (LibreOffice disegna la presentazione, il testo si confronta col PDF): **96,6–100% delle parole al loro posto**, scarto mediano ≤ 0,5 pt su 7 documenti; scansione storta: **95% di parole esatte** (l'unico errore è una parola tronca del file di prova), 62/62 righe inclinate, titolo in grassetto; 300 pagine in 41 s; PDF protetto 700/700 parole. **PDF in testo e HTML** (paragrafi e titoli, anche da scansione). **Commenti e note**: 5 tipi di annotazione vera, letti da PyMuPDF e pikepdf, file senza errori | A2 4 → 5 · A4 4 → 5 | 4,46 → **4,51** |
| 9. Contratti | chiuso | **Contratto di affitto e comodato**: 4+4, 3+2 concordato, transitorio, studenti, uso diverso, comodato; dati nella colonna laterale con gli obbligatori segnalati, clausole facoltative, articoli modificabili e personalizzati, visura catastale e «I miei dati» che compilano; PDF accessibile, Word e promemoria con scadenze e imposte (analisi in `CONTRATTI.md`). Banco: 6 tipi corretti, 15/15 regole di legge, PDF/UA-1 6/6 con veraPDF, Word = PDF al 100% con LibreOffice | A6 resta 5 (già al massimo): copertura allargata, misurata | 4,51 |
| 10. Contratti, esperienza d’uso | chiuso | Analisi da capo e banco dedicato (`test/bench/contratti_ux.js`, nella suite): pagina iniziale con «Compila un nuovo contratto» come strada principale, tipi compatti e «Ti aiuto io» (12/12 situazioni al tipo giusto), luogo e provincia di nascita dal codice fiscale e provincia dal Comune (elenco ISTAT), intestatario e luogo della firma proposti, errori di scrittura segnalati accanto al campo (10/10), segnaposto dell’anteprima che portano al campo (30/30), avanzamento «n di N», schede «Dati» e «Anteprima» al telefono, nessun allarme all’apertura, axe WCAG 2.2 AA 0 violazioni in 8 viste; ogni valore anche fuori dai limiti di legge con avviso e consenso, ogni parte del testo riscrivibile, diciture al femminile per le parti donne. Dettagli in `VALUTAZIONE-CONTRATTI.md` | indice dello strumento da 3,22 a 4,94 (azioni per il contratto tipico da 33 a 23, anteprima da 145 a 43 ms) | — |
| 11. Analisi delle vendite | chiuso | Nuovo strumento: dalle fatture attive (XML, P7M, ZIP, PDF) mappa dei clienti per Comune (confini ISTAT e coordinate incorporate, nessuna richiesta di rete), chi sono e che cosa comprano, segmenti e ABC, prodotti comprati insieme, variazioni di prezzo, stagionalità e stima dei 3 mesi successivi, raggio d’azione dalla sede, termini e scadenze, 12 tipi di scoperte, Excel di 6 fogli. Banco `test/bench/vendite_bench.js`: numeri esatti al centesimo, 57/57 clienti sulla mappa, 7/7 fatti nascosti scoperti, 5.000 fatture in 23 ms, axe 0. Dettagli in `VENDITE.md` | A1 (copertura) cresce: analisi commerciale dalle fatture, che i concorrenti per i PDF non hanno | — |
| 12. Mappa stradale fino al civico | chiuso | Nella scheda Mappa di «Analisi delle vendite», la vista **Strade**: mappa vettoriale (MapLibre GL, tessere Protomaps/OpenStreetMap) nei colori del prodotto, chiara e scura, dall'Italia all'edificio in 3D; clienti sul numero civico della fattura cercato nel browser in un indice di 4,6 milioni di civici (un file per provincia); province con clienti illuminate, vista «Rilievo» (colonne esagonali in 3D alte come il fatturato), volo inclinato sull'edificio, «Nella zona che vedi», precisione dichiarata per ogni cliente. Strade ed edifici divisi per provincia (110 archivi, 1,8 GB): si leggono solo le province con clienti, e di quelle solo le zone guardate (4,9 MB per volare sul primo cliente). Con i clienti in una sola regione si vede solo la regione e l'Italia d'insieme non si scarica. Zoom con la rotella, blocco più lungo durante zoom e trascinamenti 80 ms. Banco: 57/57 indirizzi giusti in 12 modi di scriverli, mappa pronta in 1,8 s, 0 richieste di rete con la cartella, provincia senza clienti mai letta, 100% dei pixel nella tavolozza, axe 0; indice 5,00 | A1 (copertura) e A3 (estetica) crescono | — |

Note del passo 2, per onestà:
- I1 arriva a 5 quando c'è l'indirizzo definitivo del sito (serve per la sitemap e per gli indirizzi canonici assoluti); I4 quando c'è un indirizzo per le segnalazioni. Entrambi si indicano in `site.json` (`{"url": "...", "contatto": "..."}`) e la build li usa.
- A8 resta 2: la condivisione dal telefono (Web Share) c'era già e il voto la contava.
- Difetti trovati e corretti strada facendo: 11 strumenti (estratto conto, F24, visure, esami, QR SEPA, copia conforme, misure, conta parole, tesi, SVG, tavola) sul sito avrebbero aperto la home invece dello strumento; i link del piè di pagina (privacy, condizioni, contatti) portavano a pagine inesistenti; la home dichiarava un contatore e spazi pubblicitari non attivi; il service worker non si sarebbe registrato con il codice in file separati.

Note del passo 3:
- difetto vero trovato strada facendo: aprendo un file non valido, gli strumenti che aprono il PDF da sé (Word, OCR, Dividi, Ruota, Organizza, Numeri, Impagina, Oscura, Modifica, Compila ed Excel) dicevano «qualcosa non ha funzionato» e proponevano solo «Riprova» (con lo stesso file); il motivo vero veniva mostrato e subito tolto. Ora dicono «File non valido» e propongono «Prova a ripararlo», come Comprimi;
- E6 resta 4: le intestazioni sono uguali ovunque, ma le aree di lavoro hanno ancora densità diverse (Modifica e Oscura restano le più fitte: è il lavoro del passo 4).

Note del passo 4:
- la ricerca aveva tre difetti di meccanismo, non solo di vocabolario: le parole comuni penalizzavano invece di essere ignorate; «eliminare» non trovava «elimina» (ora si confrontano le radici); «pdf in jpg» e «jpg in pdf» erano la stessa ricerca (ora conta la direzione). Più un lessico per concetto (una decina di modi di dire per strumento);
- le due domande nuove mancate: «creare un pdf con le foto del telefono» porta a Migliora (atteso Immagini in PDF), «p7m non si apre» porta a Fatture (atteso Firme, secondo posto). Non le ho corrette apposta: la misura resta onesta;
- E3 ed E4 restano 4: Compila e Organizza sul telefono restano sotto il 60% (due righe di comandi propri), e Modifica ha ancora cinque gruppi di comandi.

Note del passo 5:
- A3 resta 4 e non 5: PowerPoint (.pptx) non si converte; i vecchi .doc e .xls non sono leggibili nel browser (lo strumento lo spiega e dice come salvarli);
- A4 era rimasto 4 al passo 5 (mancavano commenti e note): chiuso al passo 8;
- il confronto con LibreOffice ha fatto trovare tre differenze vere, corrette prima della consegna: righe di tabella alte il doppio (le celle ereditavano la spaziatura dei paragrafi normali), elenchi troppo spaziati (mancava la «spaziatura contestuale» di Word), carattere sbagliato (non si leggevano i caratteri del tema).

Note del passo 6:
- D6 resta 4: le pagine che altri strumenti rifanno come immagine (PDF/A «ricostruisci», Oscura, Comprimi forte) non hanno ancora i tag; i PDF prodotti da zero (Office, testi, OCR) sì, conformi a PDF/UA-1;
- A3 sale a 5 perché ora ci sono Word, Excel, PowerPoint (con i grafici), testo, Markdown, CSV e HTML; restano fuori SmartArt e i formati vecchi (.doc, .xls, .ppt) che il browser non legge;
- E4 resta 4 per scelta: in Compila i comandi stanno tutti nello schermo su due righe (documento al 57%); comprimerli vorrebbe dire tagliarli;
- nel banco multilingue gli errori dell'inglese sono segni isolati («:», «|») nati dalla grana simulata, non parole sbagliate.
