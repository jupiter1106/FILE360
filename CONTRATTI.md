# Contratti di locazione e comodato — analisi e progetto

*19 novembre 2026. Strumento «Contratto di affitto e comodato»: compilazione guidata in una colonna laterale, anteprima del contratto dal vivo, clausole facoltative e testo modificabile, PDF accessibile e Word. Tutto nel browser, nessun dato esce dal dispositivo, nessuna AI.*

## 1. Cosa serve davvero a chi lo usa

Chi scrive un contratto di affitto o di comodato oggi parte da un modello trovato in rete:
- spesso è superato, oppure è per un tipo di contratto diverso da quello che serve;
- ha campi vuoti da riempire a mano e clausole che non si capisce se si possono togliere.

Gli errori più frequenti, e più costosi, sono:

| Errore | Conseguenza |
|---|---|
| Tipo di contratto sbagliato (es. «transitorio» senza esigenza transitoria documentata) | Il contratto è ricondotto al 4+4 (art. 2 c. 1 L. 431/1998) |
| Deposito cauzionale oltre 3 mensilità | Patto nullo per la parte eccedente (art. 11 L. 392/1978, art. 13 L. 431/1998) |
| Durata inferiore al minimo di legge (4, 3, 6 anni…) | Sostituita dalla durata di legge |
| Manca la clausola sull’APE | Sanzione da 1.000 a 4.000 € (dimezzata fino a 3 anni di durata), in solido tra le parti (art. 6 c. 3 D.Lgs. 192/2005) |
| Dati catastali mancanti o errati | Necessari per la registrazione (art. 19 c. 15 D.L. 78/2010) |
| Registrazione oltre 30 giorni (20 per il comodato) | Sanzioni; la locazione non registrata è nulla (art. 1 c. 346 L. 311/2004), salvo registrazione tardiva |
| Canone pagato in contanti | Pagamento tracciabile obbligatorio per l'abitativo (art. 1 c. 50 L. 147/2013) |
| Clausole nulle (rinuncia all'avviamento, foro diverso da quello dell'immobile, spese di registro tutte al conduttore…) | Clausola nulla e conflitto con l'inquilino |

Lo strumento deve quindi:
1. scegliere il tipo giusto, spiegandolo in parole semplici;
2. chiedere solo i dati che servono a quel tipo, segnalando quelli obbligatori;
3. impedire gli errori di legge mentre si compila;
4. scrivere un testo corretto e completo, con le clausole facoltative più usate, ognuna spiegata;
5. lasciare la libertà di modificare ogni articolo e di aggiungerne di propri;
6. dire cosa fare dopo la firma, con date e importi calcolati.

## 2. I tipi di contratto

| Tipo | Norma | Durata | Note che il programma deve far rispettare |
|---|---|---|---|
| **Abitativo a canone libero (4+4)** | L. 431/1998 art. 2 c. 1 | almeno 4 anni + rinnovo di 4 | Disdetta del locatore alla prima scadenza solo per i motivi dell'art. 3, con 6 mesi di preavviso; alla seconda scadenza procedura di rinnovo con raccomandata 6 mesi prima e risposta entro 60 giorni |
| **Abitativo a canone concordato (3+2)** | L. 431/1998 art. 2 c. 3; D.M. 16/1/2017 | almeno 3 anni + proroga di 2 | Canone entro i valori dell'Accordo territoriale del Comune; per le agevolazioni serve l'assistenza delle organizzazioni o l'attestazione di rispondenza; commissione di negoziazione paritetica |
| **Transitorio** | L. 431/1998 art. 5 c. 1; D.M. 16/1/2017 | da 1 a 18 mesi | Esigenza transitoria del locatore o del conduttore, indicata e documentata; se invocata dal locatore va confermata prima della scadenza, altrimenti il contratto torna al 4+4 |
| **Studenti universitari** | L. 431/1998 art. 5 c. 2–3; D.M. 16/1/2017 | da 6 a 36 mesi | Conduttore iscritto a un corso universitario in un comune diverso da quello di residenza; canone secondo l'Accordo territoriale |
| **Uso diverso (negozio, ufficio, laboratorio)** | L. 392/1978 artt. 27–42 | almeno 6 anni + 6 (9 + 9 alberghiero) | Diniego di rinnovo solo per i motivi dell'art. 29, 12 mesi prima (18); aggiornamento ISTAT al massimo il 75% (art. 32); indennità di avviamento (art. 34) e prelazione (artt. 38–40) se c'è contatto con il pubblico; cessione con l'azienda (art. 36) |
| **Comodato d'uso gratuito di immobile** | c.c. artt. 1803–1812 | a termine o a richiesta | Gratuito per natura; restituzione anticipata per urgente e impreveduto bisogno (art. 1809), a richiesta se senza termine (art. 1810); registrazione entro 20 giorni con imposta fissa; riduzione IMU del 50% ai figli o genitori se ricorrono le condizioni (L. 208/2015 art. 1 c. 10) |
| **Uso foresteria** | c.c. artt. 1571 ss.; L. 392/1978 in quanto compatibile | libera, rinnovo tacito per uguale durata, disdetta 6 mesi | Conduttore impresa o ente, per dipendenti, collaboratori e ospiti; l'inquadramento dipende dal caso concreto (orientamenti della giurisprudenza non uniformi): il programma lo dichiara nel contratto e consiglia la verifica di un professionista; aggiornamento ISTAT al massimo il 75% per prudenza |
| **Box auto o posto auto** (da solo) | c.c. artt. 1571 ss. | libera, rinnovo tacito di anno in anno, disdetta con preavviso scelto (30-90 giorni) | Uso esclusivo di ricovero del veicolo, divieti tipici (sostanze infiammabili, lavaggio, sosta nelle parti comuni, duplicazione di chiavi e telecomandi), niente APE; registrazione entro 30 giorni, 2% minimo 67 € |
| **Affitto di fondo rustico** | L. 203/1982 | almeno 15 anni (art. 1), rinnovo per uguale durata senza disdetta un anno prima (art. 4) | Durata e patti diversi solo con l'assistenza delle organizzazioni professionali agricole, che firmano (art. 45); recesso dell'affittuario con un anno di preavviso (art. 5); divieto di subaffitto (art. 21); miglioramenti artt. 16-17; prelazione del coltivatore diretto (L. 590/1965 art. 8); controversie alla sezione specializzata agraria con tentativo di conciliazione (art. 46); registro 0,50% dei canoni dell'intera durata, anche cumulativo entro febbraio |

Restano fuori l'affitto d'azienda e gli affitti brevi turistici (meno di 30 giorni, con obblighi diversi: CIN e comunicazioni alla Questura).

### Studio dei contratti reali forniti (19 novembre 2026)

Un PDF di 76 pagine con 13 contratti veri di un locatore professionale (dati oscurati; nessun dato riportato qui). Cosa ne è venuto fuori:

| Tipo trovato | Quanti | Struttura |
|---|---|---|
| Abitativo 4+4 | 8 versioni dello stesso modello | «TRA … E …», «SI CONVIENE E STIPULA QUANTO SEGUE», 22-23 articoli con titolo maiuscolo in linea, garante con firma propria, «Letto, approvato e sottoscritto» |
| Uso foresteria | 1 | premesse (proprietà, interesse del conduttore, scopo esclusivo), oggetto «ad esclusivo uso foresteria», impianti descritti |
| Abitativo su modello a stampa (2007) | 1 | 25 articoli senza titolo «Art. N)» |
| Box auto | 3 | scrittura privata «CEDE IN LOCAZIONE … AUTORIMESSA PRIVATA», 1 o 4 anni con rinnovo tacito, divieti elencati, chiavi e telecomandi, lettura del contatore |
| Uso non abitativo 6+6 | 2 | attività turistico-ricettiva o commerciale, IMU, risoluzione espressa |
| Affitto di terreni | 2 | premesse con tabella catastale (foglio, particella, superficie, qualità, redditi), 9 e 15 anni |

Campi che cambiano da un contratto all'altro: parti persone o società con legale rappresentante, più conduttori, garante; identificativi catastali (foglio, particella, subalterno, categoria, rendita; per i terreni anche superficie e qualità); impianti (riscaldamento assente o da installare, acqua con autoclave); canone annuo con rate mensili, trimestrali o annuali e importi in lettere; IVA; ISTAT 75%; giorno di scadenza; IBAN; deposito in mensilità; data dell'APE; spese di registro a metà.

Clausole ricorrenti aggiunte come facoltative: climatizzatori e pompe di calore con ripristino; divieto di bombole di gas; esonero del locatore per fatti di terzi; nessuna prelazione al conduttore. Nei tipi nuovi sono già nel testo: divieti del box, chiavi e telecomandi, piccole riparazioni di serrande e basculanti; uso foresteria e responsabilità per gli occupanti; coltivazione, subaffitto, miglioramenti e prelazione nel fondo rustico.

Clausole viste nei contratti reali e **non** riprese perché nulle o rischiose: rinuncia del conduttore alla prelazione legale nell'uso diverso con pubblico (art. 79 L. 392/1978), IMU a carico del conduttore come obbligo verso il Comune, esonero del locatore anche per i propri fatti.

## 3. I dati: obbligatori ed essenziali, poi i facoltativi

**Obbligatori per tutti i tipi** (senza questi il programma non produce il contratto definitivo, solo una bozza con i segnaposto evidenziati):
- **parti:**
  - persona fisica: nome e cognome, luogo e data di nascita, codice fiscale (con cifra di controllo verificata), residenza;
  - società: denominazione, sede, codice fiscale o partita IVA, legale rappresentante;
- **immobile:** Comune, indirizzo e numero civico, descrizione sintetica, dati catastali (foglio, particella, subalterno, categoria);
- **durata:** data di inizio e durata, con i minimi e i massimi di legge applicati;
- **canone:** importo (non per il comodato), periodicità, giorno di pagamento, modalità tracciabile;
- **luogo e data** della firma.

**Obbligatori per tipo:**
- concordato: Comune dell'Accordo territoriale;
- transitorio: esigenza e chi la invoca;
- studenti: università e corso;
- uso diverso: attività svolta e contatto con il pubblico;
- APE: classe energetica (per le locazioni).

**Facoltativi, ognuno con una frase che dice a cosa serve:**
- secondo locatore o conduttore;
- garante con importo massimo (obbligatorio per legge se c'è il garante: art. 1938 c.c.);
- pertinenze (box, cantina, posto auto);
- arredi con inventario;
- deposito (da 0 a 3 mensilità, oltre non si può);
- acconto spese;
- cedolare secca;
- aggiornamento ISTAT;
- riscaldamento autonomo (manutenzione della caldaia a carico di chi la usa: D.P.R. 74/2013);
- condominio (voto sul riscaldamento: art. 10 L. 392/1978).

**Riempimento automatico, sempre facoltativo:**
- **visura catastale in PDF:** il lettore delle visure già presente nel programma compila foglio, particella, subalterno, categoria, classe, consistenza, rendita e indirizzo, e propone gli intestati come locatori; box e cantine diventano pertinenze;
- **«I miei dati»:** il profilo salvato in questo browser compila il locatore;
- **bozza salvata:** si riprende da un file .json o dal salvataggio automatico locale.

## 4. Le clausole facoltative

Ogni clausola è un interruttore:
- ha una spiegazione di una riga;
- ha i suoi parametri (es. mesi di preavviso);
- il suo testo si può modificare.

Il programma le propone solo nei tipi in cui hanno senso:

| Clausola | Tipi | Perché |
|---|---|---|
| Recesso libero del conduttore con preavviso (3 o 6 mesi) | abitativi, uso diverso | Oltre ai «gravi motivi» di legge; per l'uso diverso art. 27 c. 7 |
| Animali domestici (ammessi, non ammessi, con consenso) | locazioni, comodato | Evita liti; scelta esplicita |
| Divieto di fumo | tutti | |
| Divieto anche della sublocazione parziale | abitativi | La legge vieta solo quella totale (art. 2 L. 392/1978) |
| Assicurazione del conduttore (RC e rischio locativo) | tutti | |
| Clausola risolutiva espressa (art. 1456 c.c.) | locazioni | Con il numero di rate non pagate; resta il termine di grazia (art. 55 L. 392/1978) |
| Garante con importo massimo (art. 1938 c.c.) | locazioni | |
| Visite all'immobile con preavviso, anche per vendita o nuova locazione | tutti | |
| Migliorie e modifiche solo con consenso scritto, senza indennità | tutti | Deroga all'art. 1592 c.c. |
| Impianto termico autonomo: esercizio e manutenzione al conduttore | tutti | D.P.R. 74/2013 |
| Comunicazioni anche via PEC o e-mail | tutti | |
| Spese di registrazione tutte a carico del locatore | locazioni | Il contrario (tutte al conduttore) non è ammesso: lo strumento non lo offre |
| Canone + IVA | uso diverso | Locatore soggetto IVA che opta (art. 10 n. 8 D.P.R. 633/1972) |
| Uso come abitazione principale di figlio o genitore (per la riduzione IMU) | comodato | L. 208/2015 art. 1 c. 10 |
| Verbale di consegna allegato (letture dei contatori, chiavi, stato) | tutti | Prova dello stato alla consegna |
| **Clausole personalizzate** (titolo e testo liberi, quante se ne vuole) | tutti | |

Le clausole che la legge rende nulle non sono offerte affatto:
- rinuncia all'avviamento;
- foro diverso da quello dell'immobile;
- spese di registro tutte al conduttore;
- deposito oltre 3 mensilità;
- aggiornamento oltre il 75% nell'uso diverso.

Lo strumento non ne genera mai il testo.

## 5. Il testo

- Gli articoli si numerano da soli e cambiano con il tipo e con le scelte.
- Il canone e il deposito sono scritti in cifre e in lettere.
- Le date sono scritte per esteso; la data di fine si calcola da sola.
- Concordato, transitorio e studenti seguono l'ordine degli articoli dei contratti tipo del D.M. 16 gennaio 2017 (allegati A, B e C): durata, canone, deposito, oneri accessori, spese, pagamento, uso, recesso, consegna, modifiche e danni, assemblee, impianti, accessi, commissione di negoziazione, varie.
- **Personalizzare:** ogni articolo si modifica nell'anteprima con «Modifica»; «Ripristina» torna al testo automatico. Il testo modificato resta tale anche se si cambiano i dati, e un avviso lo ricorda.
- **Clausole onerose** (art. 1341–1342 c.c.): alla fine c'è l'approvazione specifica degli articoli onerosi (recesso, risoluzione, limitazioni d'uso, deroghe), calcolata dagli articoli presenti, con il secondo blocco di firme.
- **Firme:** luogo e data, una riga per ogni parte e per il garante; sigle a piè di ogni pagina.
- **Allegati elencati:** APE, inventario arredi, verbale di consegna, regolamento di condominio, attestazione (concordato), documento d'identità.

## 6. Cosa fare dopo: il promemoria calcolato

| Adempimento | Locazione | Comodato |
|---|---|---|
| Registrazione | entro 30 giorni dalla firma o dalla decorrenza se precedente, con il modello RLI (art. 17 D.P.R. 131/1986) | entro 20 giorni, all'ufficio dell'Agenzia delle Entrate |
| Imposta di registro | 2% del canone annuo, minimo 67 € (concordato in comune ad alta tensione abitativa: base ridotta al 70%); metà a carico di ciascuna parte (art. 8 L. 392/1978) | 200 € fissi |
| Bollo | 16 € ogni 4 facciate per ciascun originale (calcolato sulle pagine vere del PDF) | idem |
| Cedolare secca | niente registro né bollo; aliquota 21% (10% concordato in comune ad alta tensione); rinuncia all'aggiornamento comunicata al conduttore (art. 3 c. 11 D.Lgs. 23/2011): il programma prepara la lettera | — |
| Comunicazioni | registrazione al conduttore e all'amministratore entro 60 giorni (art. 13 c. 1 L. 431/1998); conduttore cittadino non UE: comunicazione all'autorità di P.S. entro 48 ore (art. 7 D.Lgs. 286/1998) | idem per il non UE |
| IMU | — | riduzione 50% se figlio o genitore, abitazione principale, contratto registrato e le altre condizioni |

Gli importi sono indicativi e calcolati sui dati inseriti. Il promemoria dice sempre di verificare con l'Agenzia delle Entrate o con un professionista.

## 7. Onestà e limiti (scritti anche nello strumento)

- Lo strumento compone un contratto conforme alle norme citate; non sostituisce la consulenza di un professionista, soprattutto nei casi particolari: immobili di lusso, enti, contenziosi in corso, vincoli.
- **Canone concordato:** il programma non conosce i valori degli Accordi territoriali dei singoli Comuni. Chiede il Comune dell'Accordo e la fascia, e ricorda di verificare che il canone ci rientri.
- **Comune ad alta tensione abitativa:** è una scelta dell'utente (elenco della delibera CIPE 87/2003 e successive); influisce solo sul promemoria fiscale.

## 8. Come è costruito

- **Modulo:** `src/contratti.js`, caricato con gli strumenti e non all'avvio, come `office.js`.
- **Uscite:**
  - PDF accessibile: `FlowPdf`, con tag PDF/UA, titoli per gli articoli e lingua italiana;
  - Word (.docx): stili veri, Titolo e Titolo 2 per gli articoli, testo giustificato, numeri di pagina;
  - la lettera per la cedolare secca, se serve;
  - il promemoria.
- **Riuso:**
  - controlli di codice fiscale, partita IVA e IBAN da `FillKit`;
  - lettura delle visure da `CatastoRead`;
  - «I miei dati» dal profilo di `FillKit`.
- **Bozza:** salvata solo in questo browser (con data; si cancella da sola dopo 30 giorni o con «Nuovo contratto») e scaricabile in .json.
- **Misure di qualità (banco nella suite):**
  - ogni tipo produce tutti gli articoli attesi;
  - le regole bloccano deposito oltre 3 mensilità e durate fuori dai limiti;
  - gli importi in lettere sono esatti su un elenco di casi;
  - il PDF supera veraPDF (PDF/UA-1);
  - il Word si apre con LibreOffice e contiene lo stesso testo del PDF.

## 9. Misure (banco `test/bench/contratti_bench.js`, nella suite)

| Controllo | Esito |
|---|---|
| Sei tipi con dati completi: nessun dato mancante né segnaposto; punti chiave del testo presenti nel PDF; articoli numerati di seguito | 6/6 (da 11 a 18 articoli, da 3 a 7 pagine) |
| Regole di legge applicate anche se i dati chiedono altro | 15/15: deposito oltre 3 mensilità → 3; 4+4 sotto i 4 anni → 4; 3+2 sotto i 3 → 3; transitorio oltre 18 mesi → 18; ISTAT 100% nell'uso diverso → 75%; alberghiero → 9+9; niente ISTAT fino a 12 mesi; niente ISTAT con la cedolare; cedolare negata alle società; codice fiscale e IBAN sbagliati segnalati; recesso nell'uso diverso almeno 6 mesi; articolo modificato, tolto e personalizzato (con l'approvazione specifica) |
| Bozza con dati mancanti | spazi da compilare a mano, nessun dato inventato |
| Importi in lettere (ventitré, centotto, milletré, ventunomila, un milione cinquecentomila…) | 8/8 |
| Promemoria: registrazione entro 30 giorni dalla firma, registro 2% (180 € su 9.000 €), bollo sulle pagine vere | esatto |
| **PDF/UA-1 con veraPDF** | 9/9 conformi |
| **Word aperto da LibreOffice**: stesse parole del PDF | 100% in tutti e 9 i tipi |

**Interfaccia** (9 comportamenti nella suite):
- i dati obbligatori guidano;
- il codice fiscale compila data, luogo e provincia di nascita e titolo;
- il Comune scritto porta la provincia; intestatario del conto e luogo della firma sono proposti finché non si cambiano;
- all'apertura nessun allarme rosso; i dati scritti male (CAP, provincia, e-mail…) si segnalano accanto al campo;
- un clic su un dato mancante nell'anteprima porta al suo campo; al telefono «Dati» e «Anteprima» sono a un tocco;
- «Ti aiuto io» porta al tipo giusto con poche domande;
- durata e deposito anche fuori dai limiti di legge con un clic consapevole (e ritorno al valore di legge); intestazione, parti e titoli degli articoli si riscrivono; con «Sig.ra» il testo è al femminile;
- il tipo cambia il testo;
- l'errore sul codice fiscale compare accanto al campo;
- un articolo si modifica e si ripristina;
- una clausola compare;
- la bozza resta dopo il ricaricamento;
- la visura catastale di prova compila dati catastali, pertinenza e due proprietari (nome e cognome separati grazie al codice fiscale);
- con dati mancanti avvisa e porta al primo campo, oppure scarica la bozza;
- con dati completi scarica PDF, Word e promemoria.

Provato anche sul sito Netlify, con il codice in file separati.

**Ricerca:** «contratto di affitto», «comodato a mio figlio», «affitto studenti», «contratto 3+2 canone concordato», «affittare un negozio», «cedolare secca contratto»… portano allo strumento in 10 casi su 10.

## 10. Flessibilità e genere (20 novembre 2026)

- **Valori fuori dai limiti di legge.** Durata, deposito, ISTAT nell'uso diverso e preavviso del recesso nell'uso diverso si possono scegliere liberamente. Il contratto usa il valore di legge finché chi compila non sceglie «Usa comunque…» accanto al campo; l'avviso spiega la conseguenza e resta visibile (campo `der` nella bozza). Giorno di pagamento, preavvisi, giorni di visita e rate della clausola risolutiva sono numeri liberi.
- **Testo.** Si riscrivono intestazione, parti, chiusura (`ov._titolo`, `ov._intro`, `ov._chiusa`) e titoli degli articoli (`ovT`), oltre agli articoli.
- **Genere.** Tutte le diciture delle parti passano al femminile quando tutte le persone di quel lato sono donne (persone fisiche con «Sig.ra», anche dal codice fiscale): articoli e preposizioni («la», «della», «alla», «dalla», «una», «le», «delle»), ruoli (locatrice, conduttrice, comodataria, affittuaria, garante, fideiussora), pronomi («lei», «loro», «ella», «derivarle», «questa») e concordanze («iscritta», «tenuta», «obbligate»). Il testo scritto a mano non viene toccato.
- **Banco:** 7 regole nuove (durata, deposito, ISTAT e giorno liberi; genere; genere misto; testo riscritto), tutte verdi.

## 11. Esperienza d'uso (19 novembre 2026)

Analisi da capo dello strumento, con un banco che misura velocità, facilità, intuitività, aspetto e affidabilità con soglie fisse: metodo, misure e confronto prima/dopo in `VALUTAZIONE-CONTRATTI.md` (banco `test/bench/contratti_ux.js`, nella suite).
