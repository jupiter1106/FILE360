# Contratto di affitto e comodato — valutazione dell'esperienza d'uso

*19 novembre 2026. Analisi da capo dello strumento «Contratto di affitto e comodato» e interventi per portarlo ad almeno 4,5 su 5 in modo misurabile. Le misure si rifanno con `node test/bench/contratti_ux.js` (nella suite completa). Per il confronto, la versione precedente è stata ricompilata dallo stesso commit di partenza e misurata con lo stesso banco.*

## In sintesi

| | Prima | Dopo |
|---|---|---|
| **Indice complessivo** | **3,22** | **4,94** |
| Velocità (25%) | 3,50 | 4,75 |
| Facilità (20%) | 3,20 | 5,00 |
| Intuitività (25%) | 1,80 | 5,00 |
| Aspetto (15%) | 3,33 | 5,00 |
| Affidabilità del testo (15%) | 5,00 | 5,00 |

Il motore era già solido (testo di legge, PDF accessibile, Word uguale al PDF: 54 controlli su 54). Si perdevano punti nell'interfaccia:
- si scriveva più del necessario;
- l'anteprima non aiutava a compilare;
- al telefono il contratto stava a 4 schermi di distanza;
- all'apertura comparivano 8 allarmi rossi;
- la scelta del tipo non era guidata.

## 1. Il metodo

- **Scala 0–5 e regole di onestà:** le stesse di `VALUTAZIONE.md`. Ogni voto viene da una misura automatica sul prodotto vero (build in `dist/`), con soglie scritte nel banco prima degli interventi.
- **Le stesse soglie** valgono per la versione prima e per quella dopo.
- **Indice:** media dei criteri di ogni area, poi media pesata delle aree.
- **Scenario tipico:** un 4+4 tra due persone, appartamento con dati catastali, canone con bonifico. Contiene **22 dati essenziali**, cioè quelli che solo chi compila conosce: nomi, codici fiscali, residenze, immobile, catasto, APE, data di inizio, canone, IBAN, acconto spese.
- **Come compila il banco:** come una persona attenta. Non riscrive i campi che il programma ha già compilato giusti e apre una sezione solo se è chiusa.

**Limite dichiarato.** Sono indicatori oggettivi, non prove con persone vere. Come previsto da `VALUTAZIONE.md` (5.3), una prova con 5 persone resta il passo successivo, per confermare che i numeri corrispondono all'esperienza.

## 2. Criteri, soglie e misure

### Velocità

| Criterio | Soglie (voto) | Prima | Dopo |
|---|---|---|---|
| V1 Azioni in più oltre i 22 dati essenziali | ≤2 → 5 · ≤5 → 4 · ≤9 → 3 · ≤14 → 2 | 11 (33 azioni, 236 caratteri) → **2** | 1 (23 azioni, 211 caratteri) → **5** |
| V2 Primo campo da scrivere visibile, non coperto dalla barra di «Scarica» (schermi; caso peggiore tra 1440×900, 1280×720 e iPhone 13) | ≤1 → 5 · ≤1,5 → 4 · ≤2,5 → 3 | 2,17 → **3** | 1,14 → **4** |
| V3 Anteprima aggiornata dopo un tasto (95° percentile) | ≤100 ms → 5 · ≤200 → 4 | 145 ms → **4** | 43 ms → **5** |
| V4 PDF, Word e promemoria pronti | ≤2 s → 5 | 0,5 s → **5** | 0,5 s → **5** |

Dettaglio di V2:
- prima: 1,58 a 1440×900, 2,05 a 1280×720, 2,17 su iPhone 13;
- dopo: 0,88 a 1440×900, 1,14 a 1280×720, 0,99 su iPhone 13.

### Facilità

| Criterio | Soglie (voto) | Prima | Dopo |
|---|---|---|---|
| F1 Dati compilati dal programma nello scenario | ≥10 → 5 · ≥7 → 4 · ≥4 → 3 | 4 → **3** | 13 → **5** |
| F2 Dati scritti male segnalati accanto al campo (10 errori tipici) | ≥90% → 5 · ≥70% → 4 · ≥50% → 3 · ≥30% → 2 | 3/10 → **2** | 10/10 → **5** |
| F3 Leggibilità dei testi d'aiuto (indice Gulpease, pensato per l'italiano) | ≥60 → 5 | 76 → **5** | 78 → **5** |
| F4 Affidabilità del testo (banco dei contratti) | 100% → 5 | 54/54 → **5** | 61/61 → **5** |
| F5 Flessibilità: 5 prove | 5/5 → 5 · 4 → 4 · 3 → 3 · 2 → 2 | 1/5 → **1** | 5/5 → **5** |

Le 5 prove di F5:
- scaricare senza i dati obbligatori;
- una durata sotto il minimo di legge;
- un deposito oltre le 3 mensilità;
- riscrivere ogni parte del testo (doppio clic, intestazione, parti, chiusura);
- diciture al femminile con «Sig.ra».

Prima riusciva solo la bozza. F4 dopo comprende anche le 7 regole nuove: durata, deposito, ISTAT e giorno liberi; genere; genere misto; testo riscritto.

F1 conta i campi che il programma riempie da solo:
- prima: data di nascita e titolo delle due parti (4 campi);
- dopo, anche: luogo e provincia di nascita, province di residenza e dell'immobile, intestatario del conto, luogo della firma (13 campi).

F2 mette alla prova 10 errori tipici:
- prima erano segnalati solo codice fiscale, IBAN e canone;
- dopo sono segnalati anche CAP, sigla di provincia (della parte e dell'immobile), e-mail, telefono, categoria catastale e foglio.

### Intuitività

| Criterio | Soglie (voto) | Prima | Dopo |
|---|---|---|---|
| I1 Un clic su un dato mancante dell'anteprima porta esattamente al suo campo (30 segnaposto) | ≥90% → 5 · ≥70% → 4 · ≥40% → 3 · ≥10% → 2 | 0/30 → **1** | 30/30 → **5** |
| I2 Anteprima al telefono | 1 tocco → 5 · ≤1 schermo → 4 · ≤3 → 3 · ≤6 → 2 | 4,1 schermi da scorrere → **2** | 1 tocco → **5** |
| I3 Avanzamento visibile e dati mancanti raggiungibili | entrambi → 5 · uno → 3 | solo i dati mancanti → **3** | entrambi → **5** |
| I4 Scelta del tipo guidata: situazioni descritte a parole portate al tipo giusto | 100% → 5 · ≥90% → 4 · ≥70% → 3 | nessuna guida → **1** | 12/12 → **5** |
| I5 Allarmi e avvisi prima di aver scritto qualcosa | 0 → 5 · ≤2 → 4 · ≤5 → 3 · ≤9 → 2 | 8 → **2** | 0 → **5** |

Dettaglio:
- **I3:** l'avanzamento ora è indicato con «n di N dati obbligatori» e una barra.
- **I5:** prima comparivano 6 sezioni in rosso «da completare» e 2 avvisi.

### Aspetto

| Criterio | Soglie (voto) | Prima | Dopo |
|---|---|---|---|
| B1 Violazioni WCAG 2.2 AA (axe-core): telefono e computer, chiaro e scuro, all'apertura e con gli errori | 0 → 5 · ≤2 → 4; con violazioni gravi al massimo 3 | 2 gravi → **3** | 0 → **5** |
| B2 Bersagli al tocco sul telefono | 100% ≥24 px e ≥90% ≥44 px → 5 | 100% / 96% → **5** | 100% / 99% → **5** |
| B3 Impaginazione a 320 px e su iPhone (niente scorrimento di lato, nessun campo tagliato, barra di «Scarica» piena) | 0 difetti → 5 · 1 → 3 · 2 → 2 | 2 → **2** | 0 → **5** |

Dettaglio:
- **B1:** prima, in tema scuro, «Modifica» e «Togli» erano illeggibili sulla carta bianca: 29 elementi.
- **B3:** prima il testo traspariva sotto la barra di «Scarica».

## 3. Che cosa è cambiato (e perché)

| Problema trovato | Intervento |
|---|---|
| La pagina iniziale spingeva a «Trascina qui il tuo file», ma quasi tutti partono senza file | Il pulsante principale diventa «Compila un nuovo contratto». La visura o la bozza restano la seconda strada, spiegata in una riga |
| 9 riquadri lunghi per il tipo: due schermi sul telefono | Riquadri compatti con icona, descrizione del tipo scelto. Al telefono i tipi stanno in una riga che scorre di lato |
| Il tipo giusto si capiva solo leggendo 9 descrizioni | «Non sai quale scegliere? Ti aiuto io»: da 1 a 5 domande in parole semplici portano al tipo, con il perché, e «Usa questo tipo» |
| Sezioni chiuse da aprire una per una (6 clic) | Le sezioni con i dati da scrivere sono aperte: si compila scorrendo, anche con il tasto Tab. Le clausole facoltative restano chiuse |
| Luogo di nascita, province, intestatario e luogo della firma da riscrivere | Dal codice fiscale vengono luogo e provincia di nascita (codice catastale, elenco ISTAT di 7.896 Comuni). Dal Comune viene la provincia, e il nome è corretto («torino» diventa «Torino»). Mentre si scrive un Comune compaiono i suggerimenti. Intestatario e luogo della firma sono proposti e seguono la fonte finché non li si cambia a mano |
| Il codice fiscale non diceva nulla del luogo | Se il luogo di nascita scritto non corrisponde al codice fiscale, compare un avviso accanto al campo |
| Solo 3 errori di scrittura segnalati | Avvisi accanto al campo, senza bloccare il contratto: CAP, sigla di provincia (anche EE per l'estero), e-mail e PEC, telefono, foglio, rendita, superficie, ettari, categoria catastale, codice fiscale del rappresentante. Il canone scritto in lettere riceve un messaggio preciso, non «Manca» |
| 26 «da completare» in rosso all'apertura | All'inizio lo stato è in grigio. Il rosso compare solo dopo aver provato a scaricare. Gli avvisi di una sezione compaiono quando ci si lavora |
| I segnaposto nell'anteprima erano solo evidenziati | Ogni dato mancante porta con sé il suo campo: un clic (o Invio) lo apre, lo mette a fuoco e lo illumina. Al telefono si torna da soli alla scheda «Dati». La carta si ridisegna solo se il testo cambia, così il clic non si perde mentre il campo si chiude |
| Nessuna idea di quanto manca | Barra «n di N dati obbligatori» al posto del titolo ripetuto. Al telefono il conto compare nella scheda «Dati» |
| Al telefono l'anteprima stava dopo tutto il modulo | Due schede, «Dati» e «Anteprima», fisse in alto. Nell'anteprima il contratto viene subito, senza riquadri ripetuti |
| Anteprima 140 ms dopo ogni tasto | 40 ms |
| Tema scuro: pulsanti illeggibili sulla carta | La carta usa i colori del tema chiaro anche nel tema scuro |
| Barra di «Scarica» trasparente al telefono | Barra piena; la nota sotto il pulsante è più corta |
| Descrizione dello strumento di 3 righe sopra il lavoro | Nascosta mentre si compila, come negli strumenti con il documento aperto |

| La durata, il deposito, l'ISTAT e i preavvisi non potevano uscire dai limiti di legge: il programma li correggeva in silenzio | Ogni valore si scrive liberamente (durata in anni o mesi, deposito, ISTAT in %, giorno di pagamento da 1 a 31, preavvisi, rate della clausola risolutiva). Fuori dai limiti di legge compare un avviso accanto al campo, con la conseguenza («il patto è nullo per la parte oltre le 3 mensilità…»). Il contratto usa il valore di legge finché non si sceglie «Usa comunque…»; «Torna al valore di legge» annulla la scelta |
| Si modificavano solo gli articoli, con il pulsante «Modifica» | Doppio clic su qualsiasi parte del testo: intestazione e sottotitolo, parti, ogni articolo (anche il titolo) e chiusura. «Ripristina il testo automatico» torna al testo che segue i dati |
| Il testo era al maschile: solo «sig.ra» e «nata» cambiavano | Con «Sig.ra» (o dal codice fiscale) il testo passa al femminile per ogni parte: la locatrice, la conduttrice, la comodataria, l'affittuaria, la garante e fideiussora, «da lei incaricata», «studentessa universitaria… iscritta», «obbligate in solido». Con parti di genere diverso, o con una società, resta il maschile, come vuole la grammatica. Si sistema anche il numero: con più conduttori, «in solido con loro» |
| Con i dati obbligatori mancanti | Restano possibili la bozza scaricabile (spazi da compilare a mano) e la bozza salvata (.json) da riprendere più tardi |

**Cosa non cambia:**
- il testo del contratto quando le parti sono uomini e i valori sono nei limiti di legge (banco dei contratti verde: PDF/UA con veraPDF, Word uguale al PDF);
- la bozza salvata nel browser;
- la visura e «I miei dati»;
- articoli modificabili e clausole;
- nessun dato esce dal dispositivo, compresi i Comuni, che sono dentro il file.

## 4. Limiti onesti e prossimi passi

- **V2 vale 4, non 5.** A 1280×720 il primo campo arriva a 1,14 schermi, perché sopra ci sono l'intestazione dell'app e la scelta del tipo. Il tipo però si sceglie già nel primo schermo, e a 1440×900 e su iPhone 13 il primo campo è nel primo schermo. Sui telefoni piccoli (iPhone SE, 320 px) il primo campo resta poco sotto.
- **Nati all'estero o in Comuni soppressi.** Il codice fiscale non compila il luogo di nascita: va scritto a mano. Il programma non indovina mai: se il codice non è nell'elenco ISTAT attuale, il campo resta vuoto.
- **Prova con le persone.** Gli indicatori dicono che lo strumento è più veloce e chiaro. Una prova con 5 persone (compito: «fai il contratto per questo appartamento»), con tempo ed errori misurati, è il passo che conferma i numeri.
