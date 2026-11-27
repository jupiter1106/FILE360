# Analisi di vendite e acquisti dalle fatture

*20 novembre 2026. Nuovo strumento «Analisi delle vendite». Si caricano le fatture emesse e lo strumento mostra:*
- *dove sono i clienti, su una mappa stradale dall'Italia intera fino al numero civico;*
- *chi sono e che cosa comprano;*
- *quando e come pagano;*
- *le scoperte che contano per l'azienda.*

*Tutto avviene nel browser, solo con i dati scritti nelle fatture.*

## 1. Che cosa fa

**Ingresso.** Si possono caricare, anche tutti insieme o come intera cartella:
- fatture elettroniche XML o P7M;
- lo ZIP scaricato dal cassetto fiscale;
- i PDF della fattura elettronica (con l'XML incorporato o nel formato del foglio di stile).

Il programma riconosce l'azienda: è chi compare in più fatture, come venditore o come acquirente. Così la si trova anche quando le fatture di acquisto sono molte, o ci sono solo quelle. Prima contava solo chi emetteva più fatture, e un fornitore frequente poteva essere scambiato per l'azienda.
- le fatture emesse sono le **vendite**, quelle ricevute gli **acquisti**;
- la stessa fattura caricata due volte (XML e PDF, ZIP e file sciolto) conta una volta;
- le autofatture sono escluse, tranne le integrazioni degli acquisti dall'estero (TD17, TD18, TD19), che sono acquisti veri; le integrazioni per inversione contabile (TD16) restano fuori perché duplicano una fattura già presente;
- le note di credito si sottraggono.

Se nei file ci sono più aziende (chi emette fatture a qualcuno che non sia l'azienda), si sceglie quale analizzare.

**Panoramica:**
- fatturato (imponibile, senza IVA), fatture, clienti, fattura media, crescita sui 12 mesi precedenti;
- le **scoperte**;
- la mappa;
- l'andamento mensile con la stima dei prossimi 3 mesi;
- i primi clienti.

**Mappa**, in tre viste:
- **Strade** (la prima): una mappa vera, nei colori del prodotto (viola chiaro, strade bianche, edifici lilla; nel tema scuro, viola notte). Dall'Italia intera si ingrandisce fino al singolo edificio: ogni cliente è un punto **sul numero civico scritto in fattura**, grande come il fatturato. Da lontano i clienti vicini si raggruppano (il numero dice quanti sono); un tocco sul gruppo ingrandisce, un tocco sul cliente apre la sua scheda. Accanto, «Nella zona che vedi»: fatturato, numero di clienti e quota del totale della parte di mappa visibile, con i clienti principali (un tocco vola sul loro edificio).
  - **Una regione sola**: se tutti i clienti sono in una regione, la mappa mostra solo quella, come un'isola con il suo contorno, con strade ed edifici di tutte le sue province; lo spostamento resta attorno alla regione. Il resto d'Italia non si scarica: nemmeno la mappa d'insieme. Con clienti in due o più regioni si vede tutta l'Italia.
  - **Le zone dove vendi** hanno un contorno luminoso; ingrandendo, le province senza clienti si velano.
  - **Zoom con la rotella del mouse**, centrato sul puntatore, e spostamento trascinando, con inerzia; sul telefono con due dita.
  - **Clienti e fornitori insieme**: i clienti in viola, i fornitori in arancio. I gruppi prendono il colore di chi vale di più dentro, con un anello dell'altro colore se ci sono entrambi; al passaggio dicono quanti clienti e fornitori contengono, quanto valgono e chi sono i principali. «Tutti, Clienti, Fornitori» sopra la mappa sceglie chi mostrare.
  - **Una mappa che si muove**: all'apertura i punti crescono e dalla sede partono archi leggeri verso ogni cliente e fornitore («Collegamenti» li spegne); poi la mappa resta ferma e non consuma. Al passaggio il punto si ingrandisce e mostra la sua scheda breve (che cosa compra o che cosa gli compri); la provincia sotto il puntatore si illumina e dice clienti, fornitori e importi, e con un tocco la mappa la inquadra.
  - **Navigare**: la casella «Cerca» trova un cliente, un fornitore o un Comune e ci vola; «Tutta l'area» inquadra tutti; «Sede» vola sulla sede; «Giro dei principali» vola sugli otto che valgono di più, uno dopo l'altro, con la scheda aperta, e si ferma al primo gesto.
  - **Volo sull'edificio**: dall'elenco o dalla scheda il programma vola sul cliente, inclina la vista e alza gli edifici in 3D (con le altezze di OpenStreetMap). Il punto scelto pulsa tre volte. Allontanandosi la vista torna dritta. Con «riduci movimento» attivo nel sistema niente voli inclinati né pulsazioni;
- **Comuni**: un cerchio per Comune, grande come il fatturato (viola) o gli acquisti (arancio), con la sede dell'azienda e i cerchi di 50 e 100 km; i cerchi entrano con un piccolo rimbalzo, lo zoom (rotella, pulsanti, doppio clic) è animato; nello stesso Comune il cerchio dei fornitori si affianca a quello dei clienti, così si toccano entrambi;
- **Province**: le province colorate per fatturato o, scegliendo «Fornitori», per acquisti (scala arancio).

Nelle viste Comuni e Province si usano zoom, spostamento e pulsanti. Un tocco su un Comune mostra **chi sono i clienti e che cosa hanno comprato**; un tocco su una provincia mostra i suoi Comuni. Accanto alla mappa ci sono:
- la distanza dalla sede, per fasce;
- la classifica di regioni e Comuni;
- i clienti esteri, per paese.

**Clienti:**
- tabella ordinabile, con ricerca;
- quota del fatturato, fatture, ultimo acquisto, ritmo d'acquisto e classe ABC;
- **segmento**: campioni, fedeli, nuovi, da coltivare, a rischio, da recuperare, persi;
- la scheda di ogni cliente: prodotti comprati, primo e ultimo acquisto, prossimo acquisto atteso, termini e modalità di pagamento.

**Prodotti:**
- fatturato, quantità, clienti e prezzo medio;
- l'andamento del prezzo nel tempo, con la variazione;
- i **prodotti comprati insieme**, con quante volte più spesso del caso (lift).

Un tocco su un prodotto filtra tutto il resto.

**Andamento:**
- fatturato per mese, con la stima dei prossimi 3 mesi e l'intervallo probabile (tendenza lineare × indice stagionale);
- stagionalità (media di ogni mese dell'anno);
- clienti nuovi per mese.

**Incassi:**
- modalità di pagamento;
- termini medi;
- scadenze dei prossimi 30, 60 e 90 giorni;
- clienti con termini di 90 giorni o più.

**Filtri** (in una riga sopra i contenuti):
- periodo (tutto, ultimi 12 mesi, anno);
- tipo di cliente (aziende, privati, pubblica amministrazione);
- territorio, cliente e prodotto, ognuno con il suo filtro che si toglie con un tocco.

**Fornitori** (con le fatture di acquisto, cioè passive; lo ZIP del cassetto fiscale le contiene già):
- acquisti, fatture ricevute, fornitori, IVA sugli acquisti, crescita sui 12 mesi precedenti;
- tabella dei fornitori ordinabile e con ricerca: quota, fatture, ultimo acquisto, termini di pagamento, classe ABC, «anche cliente»;
- la scheda di ogni fornitore: che cosa gli compri, ritmo, termini e modalità di pagamento, distanza dalla sede;
- voci di spesa (righe raggruppate come i prodotti venduti) e **prezzi d'acquisto che cambiano** (prime contro ultime forniture);
- dove sono i fornitori (regioni, estero, quota entro 50 km) e quali fornitori sono anche clienti.

**Vendite e acquisti insieme:**
- in Panoramica, gli acquisti e «vendite meno acquisti» accanto al fatturato;
- in Andamento, vendite (blu) e acquisti (arancio) mese per mese, con la linea della differenza;
- in «Incassi e pagamenti», la **cassa prevista** entro 30, da 31 a 60 e da 61 a 90 giorni (incassi attesi dai clienti, pagamenti attesi ai fornitori, saldo), i termini medi delle due parti e l'**IVA per trimestre** (vendite meno acquisti), dichiarata come stima;
- il confronto usa tutte le vendite del periodo, anche quando un filtro restringe le schede delle vendite a un cliente o a un territorio.

Con le sole fatture di acquisto lo strumento mostra Fornitori, Andamento e Pagamenti, senza voci vuote sulle vendite.

**Excel** con 11 fogli: scoperte, clienti, prodotti, mesi, territorio, fatture e, con gli acquisti, fornitori, voci di spesa, vendite e acquisti, cassa e IVA, fatture di acquisto.

### Metodo di pagamento

Ogni fattura dichiara come si paga (ModalitaPagamento: MP01 contanti, MP05 bonifico, MP08 carta, MP12 RiBa, MP19 addebito SEPA…). Il programma lo legge per ogni rata e lo mostra come etichetta con icona in tutti gli strumenti che caricano fatture:
- **Fatture elettroniche**: colonna «Pagamento» nel registro, riepilogo per metodo sopra l'elenco (quante fatture e quanto, un tocco filtra), filtro «Pagamento», ricerca per metodo («carta», «riba»), etichetta nell'anteprima, colonne «Metodo di pagamento», «Codice modalità» e «Contanti» nel registro Excel e «Metodo di pagamento» nell'Excel delle prestazioni. Anche dai PDF della fattura, quando il codice è stampato accanto al suo nome («MP05 Bonifico»).
- **QR di pagamento**: il metodo indicato in fattura accanto al codice; se non è un bonifico (per esempio carta o contanti), un avviso: il QR SEPA serve a pagare con un bonifico.
- **Analisi di vendite e acquisti**: come paga ogni cliente e come paghi ogni fornitore (schede, tabelle, Excel), la ripartizione per metodo in «Incassi e pagamenti».
- **Contanti da 5.000 € in su**: fra soggetti diversi non sono ammessi (art. 49 d.lgs. 231/2007). Le fatture con contanti a partire da quella cifra sono segnalate in rosso (etichetta, riepilogo, scoperta, avviso con numero e data), sempre come «da verificare»: la fattura dice come si doveva pagare, non come si è pagato.

### Cosa compri (fatture di acquisto)

- **Categorie di spesa** riconosciute dalle parole della descrizione di ogni riga (energia, carburanti, telefonia, affitti, noleggi, subappalti, consulenze, software, trasporti, manutenzioni, pubblicità, assicurazioni, pulizie e rifiuti, formazione, viaggi, attrezzature, materiali di consumo; senza parole riconosciute «Merci e materiali» se la riga ha un codice articolo o una quantità in pezzi o peso, altrimenti «Altro»). Per ognuna: voci principali, andamento mese per mese, quota, fornitori e variazione degli ultimi 6 mesi sui 6 prima.
- **Stesso articolo, prezzi diversi**: la stessa voce (stessa descrizione, anche con codici articolo diversi, e stessa unità di misura) comprata da più fornitori; il prezzo medio pagato davvero da ognuno e quanto si sarebbe risparmiato comprando tutto dal più conveniente. Nella scheda del fornitore più caro: «Qui paghi di più».
- **Che cosa compri**: ogni voce con categoria, spesa, quantità, prezzo medio pagato (importo ÷ quantità, sconti compresi), andamento del prezzo, fornitori, ogni quanto la compri e la data attesa del prossimo acquisto.
- **Voci con un solo fornitore** sopra il 2% della spesa, comprate più volte: il rischio di fornitura.
- **Margini sui prodotti che compri e rivendi**: stessa descrizione o stesso codice nelle vendite e negli acquisti, prezzo medio di acquisto e di vendita, margine, utile del periodo e andamento dei due prezzi («il margine si stringe» se l'acquisto sale più della vendita).
- **Ritenute d'acconto** trattenute a professionisti e agenti (DatiRitenuta), per mese della fattura e per fornitore: l'azienda le versa con l'F24 entro il 16 del mese dopo il pagamento.
- **Fornitori sulla mappa**, con la distanza dalla sede, regioni e Comuni, come i clienti.

### Le scoperte (frasi con i numeri, ordinate per importanza)

| Scoperta | Quando compare |
|---|---|
| Concentrazione | I primi 3 clienti valgono almeno il 40%; altrimenti quanti clienti fanno l'80% |
| Cliente da recuperare | Un cliente abituale (almeno 3 fatture) è fermo da più di 2,2 volte il suo ritmo e da almeno 45 giorni |
| Mese migliore e peggiore | Media di ogni mese su tutti gli anni, se il migliore supera la media del 20% |
| Crescita | Ultimi 12 mesi contro i 12 precedenti |
| Clienti nuovi | Primo acquisto negli ultimi 6 mesi |
| Prodotto trainante | Quota del primo prodotto e dei successivi |
| Variazione di prezzo | Prezzo medio delle prime vendite contro le ultime, se cambia almeno del 5% |
| Comprati insieme | Lift ≥ 1,5 e confidenza ≥ 60%, con i clienti a cui proporre il secondo prodotto |
| Raggio d'azione | Quota entro 50 km, distanza entro cui c'è metà del fatturato, regione più forte, paesi esteri |
| Note di credito | Se superano il 2% del fatturato, con il cliente principale |
| Termini di pagamento | Termini medi, clienti a 90 giorni o più, scadenze dei prossimi 30 giorni |
| Stima | I prossimi 3 mesi, con almeno 12 mesi di storia |
| Contanti oltre soglia | Vendite o acquisti con pagamento in contanti da 5.000 € in su |
| Risparmio possibile | Voci comprate da più fornitori a prezzi diversi, se il risparmio supera 100 € e lo 0,5% degli acquisti |
| Margine che si stringe | Prezzo d'acquisto salito almeno 4 punti più di quello di vendita; altrimenti i prodotti rivenduti con il loro margine |
| Un solo fornitore | Una voce che vale almeno l'8% degli acquisti comprata da un solo fornitore |
| Ritenute da versare | Ritenute d'acconto nelle fatture di acquisto |
| Spesa che cresce | Una categoria (almeno il 5% della spesa) cresciuta del 15% negli ultimi 6 mesi |

### La mappa stradale: come funziona

**I dati.** Tutto viene da OpenStreetMap (ODbL), con l'attribuzione sulla mappa:
- **l'Italia d'insieme** (confini, città, strade principali) è dentro il programma, sempre disponibile: 0,4 MB nel file unico, 1,6 MB e due livelli di dettaglio in più sul sito (scaricata solo quando si apre la mappa). Uso e copertura del suolo sono tolti: a quella scala si vedono appena e pesavano più di metà (`tools/mappa_dati.py insieme`);
- **strade, edifici e nomi delle vie** (tessere vettoriali Protomaps, formato PMTiles) sono **divisi per provincia**: 110 archivi, da 4 a 30 MB, 1,8 GB in tutto, dal livello 6 al 14 (così una regione si disegna anche senza la mappa d'insieme). Il programma legge solo le province dove ci sono clienti (più quella della sede), e di quelle solo le zone guardate. Il resto d'Italia resta d'insieme. Misura sul sito: aprire la mappa e volare sul primo cliente scarica 4,9 MB;
- **gli indirizzi**: 4,6 milioni di numeri civici e le vie di tutta Italia, un file per provincia (43 MB in tutto, `dati/mappa/civici`, da `tools/indirizzi_it.py` e `tools/mappa_dati.py`). Si leggono solo le province dove ci sono clienti.

**Dove stanno:**
- **sul sito**: gli indirizzi sono sempre pubblicati accanto alle pagine, quindi i clienti vanno al civico senza fare nulla. Strade ed edifici ci sono se la build trova `dati/mappa/province` (vedi `NETLIFY.md`): ogni provincia viene pubblicata in pezzi da 4 MB (485 file, nessuno oltre gli 8 MB), letti con richieste parziali;
- **nel file unico, senza rete**: si sceglie una volta la cartella «mappa-italia» (`insieme.pmtiles`, `province/PR.pmtiles`, `civici/PR.json.gz`), preparata con `python3 tools/mappa_dati.py cartella …`. Chrome ed Edge se la ricordano e alla volta dopo chiedono solo il permesso. Va bene anche un unico `italia.pmtiles` con tutta l'Italia.

**Senza la mappa dettagliata** la vista Strade mostra l'Italia d'insieme. I clienti sono comunque sul civico, se ci sono gli indirizzi. Sotto la mappa un avviso propone di scegliere la cartella.

**Come si trova l'indirizzo**, tutto nel browser:
1. Via e civico si separano anche quando sono scritti insieme: «Via Roma, 10/A», «V.le Mazzini n. 5», «Via XX Settembre 5». Si tolgono interno, scala e piano; «snc» vuol dire senza civico.
2. La via si cerca nel Comune della fattura:
   - prima il nome esatto, con le abbreviazioni sciolte (V.le, P.zza, C.so…);
   - poi le parole del nome, anche con l'iniziale al posto del nome proprio («Via G. Garibaldi») o senza nome proprio («Via Garibaldi»);
   - poi i refusi (due lettere scambiate contano come un solo errore).

   L'ultima parola del nome deve sempre coincidere. Se due vie diverse sono ugualmente probabili, il cliente resta al centro del Comune: meglio una posizione meno precisa che una via sbagliata.
3. Il civico:
   - **esatto**;
   - **stimato** tra i due civici più vicini dallo stesso lato della strada (pari o dispari), se in OpenStreetMap manca;
   - altrimenti il cliente va **sulla via**.

Ogni scheda cliente dice l'indirizzo e la precisione della posizione («al civico», «civico stimato tra i vicini», «sulla via», «al centro del Comune»). Il pannello della mappa riassume quanti clienti ci sono per ogni precisione.

**Senza WebGL** (browser molto vecchi o con l'accelerazione spenta) la vista Strade non compare e restano Comuni e Province.

### Privacy e dati

- Si usano solo i dati delle fatture.
- **Nessun indirizzo esce dal dispositivo.** La ricerca dei civici avviene nel browser, sull'indice scaricato o scelto dalla cartella. Sul sito il browser scarica il file degli indirizzi della provincia e i pezzi di mappa della zona guardata, come fa ogni mappa: il sito vede quali province e zone servono, mai gli indirizzi o i nomi dei clienti. Con la cartella sul dispositivo non c'è nessuna richiesta di rete.
- Nelle viste Comuni e Province la posizione è quella del **Comune della sede del cliente** scritta in fattura.
- Le coordinate vengono da un elenco dei Comuni incorporato nel programma (`src/geo-it.js`, generato da `tools/geo_it.py`). I Comuni vengono dal database di Garda Informatica (MIT), allineato a ISTAT; i confini sono ISTAT (CC BY 4.0), con l'attribuzione sotto la mappa.
- Nessun servizio di mappe esterno: il banco lo verifica bloccando la rete.

**Come si trova il Comune**, in quest'ordine:
1. nome e provincia;
2. nome, se è unico in Italia;
3. nome scritto in modo diverso: «Forli'», «MODENA», «Reggio Emilia»;
4. CAP;
5. provincia.

I clienti esteri vanno nell'elenco per paese.

**Il «giorno d'oggi»** dell'analisi è quello dell'ultima fattura caricata. Così un archivio dell'anno scorso non fa sembrare fermi tutti i clienti.

## 2. Misure (banco `test/bench/vendite_bench.js`, nella suite)

Le fatture di prova vengono da `test/bench/make_vendite.py`: 465 fatture di un'azienda di fantasia, 59 clienti in Italia e all'estero. Dentro ci sono fatti noti che lo strumento deve scoprire da solo:
- stagionalità, con ottobre forte e agosto debole;
- un grande cliente fermo da 5 mesi;
- una coppia di prodotti comprati insieme;
- concentrazione su 3 clienti;
- un aumento di prezzo dell'8%;
- 2 clienti esteri;
- una pubblica amministrazione;
- Comuni scritti in modi diversi;
- un cliente con il solo CAP;
- note di credito;
- **246 fatture di acquisto** da 8 fornitori: uno vale il 49% degli acquisti, un sensore rincara del 12% da aprile 2025, un fornitore è anche cliente, uno è tedesco (integrazioni TD18), due note di credito, un'integrazione TD16 da escludere e 5 doppioni da contare una volta (`acquisti-solo.zip` ha le sole fatture di acquisto);
- **indirizzi veri** (dall'indice dei civici), scritti in 12 modi diversi: esatto, in maiuscolo, abbreviato, con l'iniziale del nome, senza nome proprio, con «/A», con «n.», civico assente in OpenStreetMap, «snc», con un refuso, via inesistente, via e civico nello stesso campo.

I valori giusti stanno in `vendite-attese.json`.

| Area (peso) | Criterio | Soglie | Esito |
|---|---|---|---|
| **Correttezza (30%)** | C1 Fatturato, note di credito, fatture e clienti | esatti → 5 | 2.449.545,90 € · 26.355 € · 465 · 59: **esatti** → 5 |
| | C2 Importi per cliente, prodotto e mese al centesimo | 100% → 5 · ≥98% → 4 | **89/89** → 5 |
| | C3 Clienti sul Comune giusto e clienti italiani sulla mappa | 100% → 5 · ≥97% → 4 | **9/9** casi difficili, **57/57** sulla mappa → 5 |
| | C4 Richieste di rete | 0 → 5 | **0** → 5 |
| | C9 Acquisti: spesa, IVA, note, fatture e fornitori esatti; importo per fornitore al centesimo; doppioni e integrazioni esclusi | 100% → 5 · ≥97% → 4 | **3/3 · 8/8** → 5 |
| | C10 Solo fatture di acquisto: l'azienda è chi le riceve | sì → 5 | **sì** → 5 |
| | C5 Clienti all'indirizzo giusto, nei 12 modi di scriverlo (civico esatto entro 5 m; civico mancante tra i vicini; «snc» sulla via; via inesistente al centro del Comune) | 100% → 5 · ≥95% → 4 · ≥90% → 3 | **57/57** → 5 |
| | C6 Richieste di rete con la mappa stradale (cartella sul dispositivo) | 0 → 5 | **0** → 5 |
| | C8 Clienti tutti in Emilia-Romagna (fatture di prova `vendite-emilia.zip`): solo la regione, spostamento limitato attorno, Italia d'insieme mai letta | sì → 5 | **sì** → 5 |
| | C7 Strade ed edifici letti solo per le province con clienti (nella cartella di prova c'è anche una provincia senza clienti: non deve mai essere letta) | sì → 5 | **sì** (letti: Italia d'insieme e BO) → 5 |
| **Scoperte (25%)** | D1 Fatti nascosti trovati | 7/7 → 5 · 6 → 4 · 5 → 3 | **7/7** → 5 |
| | D2 Fatti nascosti negli acquisti: fornitore principale, rincaro, fornitore anche cliente, fornitore estero, cassa e IVA | 5/5 → 5 · 4 → 4 | **5/5** → 5 |
| **Velocità (15%)** | S1 Dal file ZIP alla panoramica (465 fatture) | ≤2 s → 5 | **0,8 s** → 5 |
| | S2 Analisi completa di 5.000 fatture | ≤500 ms → 5 | **15–23 ms** → 5 |
| | S3 Cambio di filtro su 5.000 fatture | ≤300 ms → 5 | **3–6 ms** → 5 |
| | S4 Mappa stradale pronta: Italia d'insieme, poi dalla cartella ai clienti sul civico | ≤3 s → 5 · ≤6 s → 4 | **1,2 s · 1,5 s** → 5 |
| | S5 Fluidità: blocco più lungo del programma durante 16 scatti di rotella e 4 trascinamenti | ≤100 ms → 5 · ≤200 ms → 4 | **80 ms** → 5 |
| **Facilità (15%)** | I1 Dal file alla panoramica senza altri passaggi; Comune → chi sono e che cosa hanno comprato; il periodo cambia i numeri; Excel con 6 fogli e tutti i clienti | 4/4 → 5 | **4/4** → 5 |
| | I4 Fornitori: elenco e scheda del fornitore con che cosa gli compri | sì → 5 | **sì** → 5 |
| | I3 Rotella del mouse: zoom avanti e indietro, trascinamento | sì → 5 | **sì** (zoom 5,0 → 8,7 → 5,0) → 5 |
| | I2 Mappa stradale: un gruppo si apre ingrandendo; dall'elenco della zona al volo sull'edificio con la scheda e l'indirizzo; tocco sul punto → scheda; dalla scheda «Mostra sulla mappa» | 4/4 → 5 | **4/4** → 5 |
| **Aspetto (15%)** | B1 Violazioni WCAG 2.2 AA (axe): computer e telefono, chiaro e scuro, Panoramica, Clienti, Mappa, Fornitori, Incassi e pagamenti | 0 → 5 | **0** → 5 |
| | B2 Telefono senza scorrimento laterale | nessun difetto → 5 | **nessun difetto** → 5 |
| | B3 Pixel colorati della mappa nella tavolozza viola (tonalità 225°–295°), Italia e Bologna, chiaro e scuro | ≥97% → 5 · ≥90% → 4 | **100%** in tutte e 4 → 5 |
| | B4 Dettaglio a zoom 17: edifici, strade e nomi delle vie, chiaro e scuro | 3/3 → 5 | **3/3** → 5 |
| | **Indice** | | **5,00 su 5** |

**La mappa stradale nel banco.** Il primo giro sugli indirizzi aveva dato 49 su 58, con due difetti veri, corretti prima di misurare le altre voci:
- una via inesistente veniva agganciata a una simile («Via dei Ciclamini Turchesi» → «Via dei Ciclamini»), e un refuso finiva sulla via sbagliata. Ora l'ultima parola del nome deve coincidere, le lettere scambiate contano come un solo errore e i casi ambigui restano al Comune;
- in una prova a occhio, «Via Roma» a Milano (che lì non c'è) finiva su «Via Romagnosi»: le parole ora devono coincidere per intero.

Il primo giro del banco (prima della mappa stradale) aveva dato 4,55 e ha trovato due difetti veri, entrambi corretti:
- le aree dei grafici avevano un'etichetta senza ruolo, che i lettori di schermo non leggevano;
- togliendo il filtro di un Comune restava attivo quello della provincia.

**Altre prove:**
- **Robustezza:** 11 file difficili su 11, tra cui file vuoti, rotti, protetti, di 300 pagine e del tipo sbagliato. Nessun errore sfuggito e nessun blocco.
- **Sito:** con la CSP del sito la mappa stradale si apre senza violazioni e i clienti vanno al civico con gli indirizzi pubblicati accanto alle pagine. Volando sul primo cliente si scaricano 4,9 MB del dettaglio, solo da province con clienti (soglia: meno di 15 MB). Un archivio in pezzi si legge anche a cavallo tra due pezzi. Tutto in `test/suite/csp.test.js`, con un server che risponde alle richieste parziali come Netlify.
- **Interfaccia:** 3 comportamenti nella suite:
  - percorso completo dallo ZIP all'Excel;
  - fatture di altre aziende e PDF insieme alle vendite, con l'azienda riconosciuta e la scelta tra più emittenti; con soli file non validi lo strumento lo dice;
  - mappa stradale: dall'Italia d'insieme alla cartella della mappa, clienti al civico, volo sull'edificio con la scheda; senza WebGL restano Comuni e Province.
- **Ricerca:** «mappa dei clienti», «analisi del fatturato dalle fatture», «statistiche vendite» e «clienti che non comprano più» portano allo strumento.
- **Colori:** grafici e mappa usano la tavolozza validata per chi distingue male i colori (blu sequenziale), con passi propri per il tema scuro. Ogni grafico ha i valori anche come testo (suggerimenti al passaggio e alla tastiera, tabelle, Excel).

## 3. Limiti dichiarati

- **Fatture di prova.** Le misure usano fatture di fantasia costruite per contenere fatti noti. Con fatture reali i numeri sono esatti per costruzione (sono somme dei dati in fattura), ma le scoperte dipendono dai dati: alcune non compaiono se mancano gli elementi (per esempio la stima, con meno di 12 mesi).
- **Indirizzi in OpenStreetMap.** La copertura dei numeri civici varia molto: tanti civici in Emilia-Romagna, Friuli, Toscana, Lombardia e Trentino; pochi in Calabria, Basilicata e Molise, dove molti clienti andranno «sulla via» o al centro del Comune. Lo strumento dice sempre la precisione. Gli indici si aggiornano rifacendo `tools/indirizzi_it.py` (dati di novembre 2026).
- **Strade ed edifici pesano 1,8 GB** (tutta Italia, per provincia). Non possono stare nel file unico. Sul sito vanno pubblicati una volta; chi usa la mappa scarica solo pochi MB. Senza, la vista Strade mostra l'Italia d'insieme con i clienti comunque al civico.
- **Fuori dalle province con clienti** la mappa resta d'insieme anche ingrandendo: è voluto, si scarica solo ciò che serve, e quelle zone sono velate.
- **Nelle viste Comuni e Province** la posizione è il centro del Comune. Con il solo CAP o la sola provincia lo strumento lo dice nella scheda del luogo.
- **Incassi e pagamenti.** Le scadenze vengono dalle fatture: il programma non sa quali sono state incassate o pagate.
- **Vendite meno acquisti non è l'utile.** Mancano personale, affitti e tutte le spese senza fattura elettronica.
- **IVA per trimestre.** È una stima (IVA delle vendite meno IVA degli acquisti caricati): non conosce detraibilità, scissione dei pagamenti, inversione contabile, acconti e crediti precedenti. Fa fede la liquidazione.
- **Prodotti senza codice.** Si raggruppano per descrizione, senza mesi, anni, date e numeri d'ordine. Descrizioni molto diverse dello stesso servizio restano separate.
- **Stima.** È statistica (tendenza e stagionalità), non una previsione certa; lo strumento lo scrive.

## Incassi e pagamenti veri (strumento a parte)

L'estratto conto abbinato alle fatture (`src/incassi.js`, caricato all'apertura dello strumento). Si caricano insieme fatture (XML, P7M, ZIP, PDF) ed estratto conto (CSV dell'home banking con data/descrizione/importo o dare/avere, oppure PDF anche scansionato, letto con `BankRead` e l'OCR).

Abbinamento, in quest'ordine:
1. un movimento, una fattura: stesso importo dovuto (o una rata scritta in fattura) più nome della controparte, numero della fattura o vicinanza alla scadenza; un importo che nessun'altra fattura ha basta da solo;
2. un bonifico per più fatture della stessa controparte, anche al netto di una nota di credito: tra le combinazioni con la somma giusta vince quella con più numeri citati nella causale, poi quella con le fatture più vecchie;
3. una fattura pagata in più volte (movimenti con il nome che insieme fanno l'importo);
4. acconti con nome e numero; 5. acconti senza numero con la parola «acconto», quando la controparte ha una sola fattura aperta che può contenerli (o una sola che scade a ridosso).

Del nome contano solo le parole che distinguono (una parola presente nel nome di più di due controparti non conta). Oltre 14 mesi dalla data della fattura si abbina solo se la causale la cita. Dovuto: rate scritte in fattura, altrimenti totale meno ritenuta, meno IVA in split payment; per le integrazioni di fatture estere (TD17-19) l'imponibile. Stati: saldata, in parte, scaduta, da saldare, dopo l'estratto, da verificare (integrazioni estere senza scadenza).

Prova: `test/fixtures/estratto-conto.csv` e `incassi-attese.json` generati da `test/bench/make_vendite.py` con la sorte di ogni fattura (pagata alla scadenza con causali diverse, solo il nome, due rate, insieme alla successiva, in ritardo, mai pagata, pagamento dopo la fine dell'estratto). Banco `test/bench/incassi_autentica_bench.js`: 100% delle 743 fatture con la sorte giusta.
