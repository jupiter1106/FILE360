# Analisi delle vendite dalle fatture attive

*20 novembre 2026. Nuovo strumento «Analisi delle vendite». Si caricano le fatture emesse e lo strumento mostra:*
- *dove sono i clienti, su una mappa;*
- *chi sono e che cosa comprano;*
- *quando e come pagano;*
- *le scoperte che contano per l'azienda.*

*Tutto avviene nel browser, solo con i dati scritti nelle fatture.*

## 1. Che cosa fa

**Ingresso.** Si possono caricare, anche tutti insieme o come intera cartella:
- fatture elettroniche XML o P7M;
- lo ZIP scaricato dal cassetto fiscale;
- i PDF della fattura elettronica (con l'XML incorporato o nel formato del foglio di stile).

Il programma riconosce l'azienda: è chi ha emesso più fatture. Analizza solo le sue vendite:
- le fatture di acquisto vengono contate ed escluse;
- le autofatture sono escluse;
- le note di credito si sottraggono.

Se nei file ci sono più aziende, si sceglie quale analizzare.

**Panoramica:**
- fatturato (imponibile, senza IVA), fatture, clienti, fattura media, crescita sui 12 mesi precedenti;
- le **scoperte**;
- la mappa;
- l'andamento mensile con la stima dei prossimi 3 mesi;
- i primi clienti.

**Mappa:**
- un cerchio per Comune, grande come il fatturato;
- in alternativa, le province colorate per fatturato;
- la sede dell'azienda con i cerchi di 50 e 100 km.

Si usa con zoom, spostamento e pulsanti. Un tocco su un Comune mostra **chi sono i clienti e che cosa hanno comprato**; un tocco su una provincia mostra i suoi Comuni. Accanto alla mappa ci sono:
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

**Excel** con 6 fogli: scoperte, clienti, prodotti, mesi (con la stima), territorio e fatture.

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

### Privacy e dati

- Si usano solo i dati delle fatture.
- La posizione è quella del **Comune della sede del cliente** scritta in fattura, non l'indirizzo preciso.
- Le coordinate vengono da un elenco dei Comuni incorporato nel programma (`src/geo-it.js`, generato da `tools/geo_it.py`). I Comuni vengono dal database di Garda Informatica (MIT), allineato a ISTAT; i confini sono ISTAT (CC BY 4.0), con l'attribuzione sotto la mappa.
- Nessun servizio di mappe e nessuna richiesta di rete: il banco lo verifica bloccando la rete.

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
- note di credito.

I valori giusti stanno in `vendite-attese.json`.

| Area (peso) | Criterio | Soglie | Esito |
|---|---|---|---|
| **Correttezza (30%)** | C1 Fatturato, note di credito, fatture e clienti | esatti → 5 | 2.449.545,90 € · 26.355 € · 465 · 59: **esatti** → 5 |
| | C2 Importi per cliente, prodotto e mese al centesimo | 100% → 5 · ≥98% → 4 | **89/89** → 5 |
| | C3 Clienti sul Comune giusto e clienti italiani sulla mappa | 100% → 5 · ≥97% → 4 | **9/9** casi difficili, **57/57** sulla mappa → 5 |
| | C4 Richieste di rete | 0 → 5 | **0** → 5 |
| **Scoperte (25%)** | D1 Fatti nascosti trovati | 7/7 → 5 · 6 → 4 · 5 → 3 | **7/7** → 5 |
| **Velocità (15%)** | S1 Dal file ZIP alla panoramica (465 fatture) | ≤2 s → 5 | **0,8 s** → 5 |
| | S2 Analisi completa di 5.000 fatture | ≤500 ms → 5 | **15–23 ms** → 5 |
| | S3 Cambio di filtro su 5.000 fatture | ≤300 ms → 5 | **3–6 ms** → 5 |
| **Facilità (15%)** | I1 Dal file alla panoramica senza altri passaggi; Comune → chi sono e che cosa hanno comprato; il periodo cambia i numeri; Excel con 6 fogli e tutti i clienti | 4/4 → 5 | **4/4** → 5 |
| **Aspetto (15%)** | B1 Violazioni WCAG 2.2 AA (axe): computer e telefono, chiaro e scuro, Panoramica e Clienti | 0 → 5 | **0** → 5 |
| | B2 Telefono senza scorrimento laterale | nessun difetto → 5 | **nessun difetto** → 5 |
| | **Indice** | | **5,00 su 5** |

Il primo giro del banco aveva dato 4,55 e ha trovato due difetti veri, entrambi corretti:
- le aree dei grafici avevano un'etichetta senza ruolo, che i lettori di schermo non leggevano;
- togliendo il filtro di un Comune restava attivo quello della provincia.

**Altre prove:**
- **Robustezza:** 11 file difficili su 11, tra cui file vuoti, rotti, protetti, di 300 pagine e del tipo sbagliato. Nessun errore sfuggito e nessun blocco.
- **Interfaccia:** 2 comportamenti nella suite:
  - percorso completo dallo ZIP all'Excel;
  - fatture di altre aziende e PDF insieme alle vendite, con l'azienda riconosciuta e la scelta tra più emittenti; con soli file non validi lo strumento lo dice.
- **Ricerca:** «mappa dei clienti», «analisi del fatturato dalle fatture», «statistiche vendite» e «clienti che non comprano più» portano allo strumento.
- **Colori:** grafici e mappa usano la tavolozza validata per chi distingue male i colori (blu sequenziale), con passi propri per il tema scuro. Ogni grafico ha i valori anche come testo (suggerimenti al passaggio e alla tastiera, tabelle, Excel).

## 3. Limiti dichiarati

- **Fatture di prova.** Le misure usano fatture di fantasia costruite per contenere fatti noti. Con fatture reali i numeri sono esatti per costruzione (sono somme dei dati in fattura), ma le scoperte dipendono dai dati: alcune non compaiono se mancano gli elementi (per esempio la stima, con meno di 12 mesi).
- **Posizione per Comune.** La posizione è il centro del Comune, non l'indirizzo. Con il solo CAP o la sola provincia lo strumento lo dice nella scheda del luogo.
- **Incassi.** Le scadenze vengono dalle fatture: il programma non sa quali sono state pagate.
- **Prodotti senza codice.** Si raggruppano per descrizione, senza mesi, anni, date e numeri d'ordine. Descrizioni molto diverse dello stesso servizio restano separate.
- **Stima.** È statistica (tendenza e stagionalità), non una previsione certa; lo strumento lo scrive.
