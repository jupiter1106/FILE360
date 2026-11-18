# Analisi critica dello studio esterno e strategia

Documento di lavoro per decidere insieme cosa fare. Prima la strategia applicata in questo giro, poi l'esame dello studio punto per punto (giusto / da ridimensionare / da non fare), poi gli spunti che lo studio non dice ma suggerisce, infine una proposta di priorità.

---

## 1. Cosa è stato fatto in questo giro

**Modifica**
- Lettura delle scansioni più veloce: più motori in parallelo (fino a 3 sul computer, 1 sul telefono) e ricordo della lettura nella sessione. Sul tuo IMU: pronto in ~16 s (prima 23 s); riaperto ~4,5 s.
- PDF scansionati con uno strato di testo invisibile fatto da un altro OCR (come il contratto): prima i paragrafi e i titoli si spezzavano, ora la pagina si legge come scansione. Il raggruppamento lavora sulla pagina raddrizzata, per riga letta, quindi tiene conto delle scansioni storte. Riconosce anche i punti numerati con rientro sospeso e il testo giustificato. Al salvataggio il vecchio strato invisibile sotto le parti modificate si toglie.
- Il testo non cambia aspetto quando lo clicchi. Il caso «CASTELVETRANO» che diventava verticale è risolto: le linee del modulo creavano finte caselle larghe pochi punti.
- Riquadro allargabile o stringibile anche per il testo esistente, scansioni comprese: si ridispone con le sue lettere vere.
- Selezione multipla come sul desktop:
  - rettangolo su uno spazio vuoto, Ctrl/⌘/Maiusc+clic, Ctrl+A;
  - trascinamento di gruppo, frecce, Canc ed Esc.
- La maniglia viola resta mentre la raggiungi e sposta la riga anche subito dopo averla aperta.
- Avviso «Sto leggendo la scansione» leggibile nel tema scuro.

**Oscura** (strategia completa al § 5)
- Clic sulle parole, trascinamento su più parole, doppio clic per la riga, proposta «oscura ovunque».
- «Sfondo» di base, con la grana vera della carta sulle scansioni.
- Nuove categorie di dati e lettura completa delle pagine miste.
- Riquadri allargati fino a coprire l'inchiostro vero.
- Verifica finale per rilettura.

**Altro**
- Tolte firma digitale e ricevute .rcc, codice compreso. Restano la verifica dei .p7m e l'apertura del PDF.
- Conta parole: la scelta caratteri/parole sta sempre nello schermo.
- Logo inclinato a 9°, come un corsivo classico.

---

## 2. Lo studio, punto per punto

Legenda: ✅ giusto, da fare · 🟡 giusto nel principio, da ridimensionare · ❌ cambierebbe o rovinerebbe il prodotto

| Punto dello studio | Giudizio | Perché |
|---|---|---|
| **Architettura monolitica**: sviluppare a moduli tenendo la distribuzione in un file | 🟡 | La distribuzione in un solo file è già generata da `src/` con `build.py`: la parte giusta è dividere `app.js` (~35 000 righe) in file per strumento, concatenati dal build, senza framework né bundler. Migliora la manutenzione, non il prodotto per l'utente. Va fatto a piccoli passi, mai in un'unica grande riscrittura. |
| **Algoritmi non validati**: un corpus di prova per ogni motore | ✅ | È il punto più giusto. I banchi esistono (scansioni, fogli, modifica fedele) e vanno estesi a Oscura (dati trovati/mancati), OCR, PDF/A, estrazioni fiscali, con soglie che bloccano le regressioni. |
| **PDF/A da verificare con veraPDF** | ✅ (nei test) | veraPDF è uno strumento Java: va usato nei test sul nostro computer, non dentro il prodotto. Confronta il nostro verificatore con quello di riferimento su un corpus. |
| **Parametri finanziari datati** (Damodaran, Rendistato, ERP, aliquote…) | ✅ con un limite | Giusto mostrare «dati aggiornati al …», renderli modificabili e mostrare l'incertezza. Non va fatto l'aggiornamento automatico da internet: contraddice «niente esce dal dispositivo» e dipende da fonti esterne. L'aggiornamento si fa al rilascio. Il seme fisso 42 del Monte Carlo serve alla riproducibilità: va tenuto, insieme a più scenari. |
| **Firma: elenchi AgID/UE, OCSP/CRL, marca temporale esterna** | 🟡 | La firma è stata tolta, quindi resta solo la verifica. Si può includere al rilascio una copia datata dell'elenco dei certificatori qualificati e dire su quale data si basa la verifica. La revoca (OCSP/CRL) richiede di contattare un server: solo su richiesta esplicita, mai in automatico. Utili i livelli di verifica («integra», «certificatore qualificato al …», «revoca non verificata»). |
| **Privacy: progetti senza scadenza, profilo FillKit e FormMemory in chiaro** | ✅ priorità | È il rilievo più serio rispetto alla nostra promessa. Serve un «centro privacy»: cancella tutto in un clic, modalità temporanea che non salva nulla, scadenza dei progetti (es. 30 giorni), cifratura facoltativa con una frase segreta (WebCrypto AES-GCM). |
| **Sicurezza: CSP, SRI, `innerHTML`** | ✅ | Su Netlify si aggiunge una Content-Security-Policy nelle intestazioni (`_headers`), con le connessioni permesse solo ai servizi cloud attivi. Va rivisto `innerHTML` dove entra testo del documento. L'SRI conta solo per gli script esterni, cioè gli SDK cloud: dove i fornitori lo permettono, versioni fissate. |
| **Oscura: verifica dopo l'oscuramento** | ✅ fatto | Ora le pagine oscurate si rileggono e il risultato dice se un dato oscurato si legge ancora. |
| **OCR: affidabilità parola per parola** | ✅ | Coincide con la strategia di Modifica (§ 4): evidenziare le parole lette con poca sicurezza. |
| **PWA (manifest, service worker)** | ✅ | Su Netlify rende il sito installabile e utilizzabile offline. Costo basso, valore alto, nessun conflitto con il file singolo, che resta. |
| **Prestazioni su dispositivi deboli** | ✅ | Già in parte (motori adattati al dispositivo). Manca un adattamento esplicito: qualità e parallelismo secondo memoria e processori. |
| **UX su tre livelli** (rapida / professionale / automazione) | 🟡 | L'idea esiste già: home «Per te / Per tutti», «Fai tutto tu», Ricette. Tre modalità esplicite aggiungerebbero una scelta in più a ogni ingresso. Meglio tenere un'interfaccia sola, con le opzioni avanzate a scomparsa. |
| **Assistente per obiettivi** | 🟡 | C'è già, a regole («Fai tutto tu»). Va bene migliorarlo, senza AI come da tua scelta. |
| **Motore documentale condiviso** | ✅ molto | È lo spunto migliore dello studio (sviluppato al § 3). |
| **Prodotto finanziario, ecosistema, fase commerciale** | — | Scelte di strategia aziendale che spettano a te. Tecnicamente non cambiano le priorità di qualità. |
| **Voti** (architettura 2, sicurezza verificabile 2…) | 🟡 | Sono un segnale utile, non una misura: diversi rilievi erano già coperti (banchi di prova, verifiche di integrità, test dell'interfaccia). Va bene renderli più visibili. |

---

## 3. Spunti non espliciti per fare meglio

1. **Lettura unica del documento per tutti gli strumenti.** Oggi Modifica, Oscura, Compila, Excel e Word leggono ciascuno per conto suo, OCR compreso. Un indice unico per documento, in memoria, nella sessione, ridurrebbe i tempi: OCR una volta sola, riusato ovunque. Darebbe anche risultati coerenti tra strumenti. È il «motore condiviso» dello studio, reso concreto.
2. **Rapporto di oscuramento senza dati.** Un PDF/registro con categorie, pagine e impronte prima e dopo, utile per la responsabilità prevista dal GDPR: dimostra cosa è stato tolto senza ripeterlo.
3. **Modelli di oscuramento.** Profili «Albo pretorio», «GDPR completo», «Sanità», «Contenzioso», con le categorie già scelte.
4. **Modalità ospite.** Sui computer condivisi, all'apertura: niente memoria, niente profili, chiusura pulita.
5. **Banco come cancello di rilascio.** `test/all.py` blocca già le regressioni; aggiungere i banchi di Oscura e OCR con soglie minime.
6. **Controllo del dispositivo.** Una piccola misura all'avvio (memoria, processori) che sceglie da sola qualità e parallelismo. È la risposta concreta a «prestazioni su dispositivi deboli».

---

## 4. Modifica: cosa resta della strategia

Già fatti in questo giro: lettura veloce (S1), selezione multipla, riquadri ridimensionabili, scansioni storte e strati invisibili.

Dal piano S2/S3 (aggiornato):
- frecce su/giù, Home/Fine sulla disposizione visibile: **fatto** (§8);
- strato di testo esatto, parola per parola, nel PDF salvato: **fatto** (§8);
- correzione della trascrizione senza toccare i pixel: **fatto** (§9);
- lettere prese anche dalle altre pagine: **fatto** (§9);
- resta: banco esteso con fax, fotocopie sbiadite e fondini colorati.

---

## 5. Oscura: strategia d'avanguardia

**Principio**: trovare tutto ciò che può identificare una persona; coprirlo in modo che non resti nulla, nemmeno un pezzo di lettera; dimostrare che non si legge più. Tutto sul dispositivo, senza AI.

1. **Leggere tutto.**
   - Testo del PDF più OCR delle scansioni, anche nelle pagine miste (etichetta stampata e valore scritto dopo uniti riga per riga) e sotto gli strati invisibili di altri OCR. Fatto.
2. **Riconoscere a strati.**
   - **Codici con controllo matematico**: codice fiscale anche spezzato nelle caselle, partita IVA, IBAN, carte con Luhn. Fatto.
   - **Contesto**: «nato/a a … il …», «cognome e nome», titoli, etichette. Fatto.
   - **Elenchi**: nomi propri e propagazione dei cognomi, anche dai codici fiscali. Fatto.
   - **Categorie particolari** (art. 9-10 GDPR: salute, giudiziari, sindacato, religione, origine, vita sessuale), con la frase da controllare. Fatto.
   - **Potenzialmente sensibili**: importi e date, mostrati ma da scegliere. Fatto.
   - **Visivi**: firme, timbri, codici QR e a barre. Fatto. Mancano le foto di persone, cioè le immagini nei PDF digitali e i ritratti nelle scansioni: prossimo passo.
3. **Coprire senza lasciare tracce.**
   - Riquadri allargati fino all'inchiostro vero. Fatto.
   - Pagine ricostruite come immagine e metadati tolti. C'era già.
   - «Sfondo» di base, con la carta che continua e un controllo che nessun pixel scuro resti dentro. Fatto.
4. **Dimostrare.**
   - Rilettura delle pagine oscurate, con avviso se un dato si legge ancora (anche un'altra copia non coperta). Fatto.
   - Prossimo passo: il rapporto di oscuramento senza dati (§ 3.2).
5. **Semplicità.**
   - Clic sulla parola, trascinamento per più parole, doppio clic per la riga, «oscura anche ovunque compare», × per togliere, area libera quando serve. Fatto.
   - Prossimo passo: modelli per tipo di documento (§ 3.3).

---

## 6. Proposta di priorità (da decidere insieme)

| Quando | Cosa | Perché |
|---|---|---|
| Subito | Centro privacy (cancella tutto, temporanea, scadenza, cifratura facoltativa) | Mantiene la promessa del prodotto. |
| Subito | CSP nelle intestazioni Netlify, revisione `innerHTML` | Sicurezza verificabile a basso costo. |
| Subito | Banco di Oscura (dati trovati/mancati su documenti sintetici) | Misura quello che abbiamo appena rafforzato. |
| Presto | Lettura unica condivisa tra gli strumenti | Velocità e coerenza su tutto il prodotto. |
| Presto | PWA installabile e offline | Costo basso, uso quotidiano più comodo. |
| Presto | Rapporto di oscuramento e modelli | Valore professionale (PA, studi). |
| Poi | Parametri finanziari datati e modificabili; verifica p7m con elenco certificatori datato | Affidabilità dichiarata. |
| Poi | Divisione di `app.js` in moduli per strumento | Manutenzione. |
| Da non fare | Framework/bundler, funzioni su server, AI, tre interfacce separate, controllo revoca online automatico | Cambierebbero la natura del prodotto: locale, file unico, senza AI. |

---

## 7. Fatto dopo la tua approvazione (con le misure)

**Motore di lettura condiviso.**
- Una pagina letta con l'OCR (5-15 s) si legge una volta sola per documento, e la riusano Modifica, Oscura, OCR, Word, Excel, Compila e gli estrattori.
- Due strumenti che chiedono insieme la stessa pagina fanno una lettura sola.
- Le celle delle tabelle rilette una per una si conservano anch'esse.
- I motori OCR restano accesi tra uno strumento e l'altro (si spengono da soli dopo 3 minuti).
- Le pagine scansionate di Modifica si preparano in parallelo e non si disegnano due volte.
- Tutto resta solo in memoria, nella scheda aperta.
- Misura (`test/bench/shared_read_bench.js`, scansione di 4 pagine, Oscura → Modifica → PDF OCR, confronto con la versione precedente):

| passaggio | prima | ora | guadagno |
|---|---|---|---|
| secondo strumento (Modifica) | 11,8 s | 6,9 s | **41%** |
| terzo strumento (PDF OCR) | 11,9 s | 6,1 s | **49%** |
| sessione intera | 33,7 s | 23,3 s | **31%** |

**Centro privacy** (dal bollino «I file restano sul tuo computer»):
- elenco di tutto ciò che resta sul dispositivo, con il peso, e cancellazione per tipo o totale;
- cancellazione automatica di progetti, lavori da riprendere e registro (7, 30 o 90 giorni oppure mai; di base 90);
- «Nessuna traccia» per i computer condivisi: tutto si cancella alla chiusura;
- frase segreta per i dati personali salvati (profilo, valori dei moduli, firme, timbri, correzioni imparate): cifrati con AES-GCM 256, chiave da PBKDF2-SHA-256 con 310 000 passaggi. Senza la frase sono illeggibili a riposo e bloccati alla riapertura.

Tutto è verificato da un test automatico.

**Sicurezza del sito Netlify.**
- Content-Security-Policy, X-Frame-Options, Permissions-Policy.
- Il browser stesso blocca qualunque connessione verso indirizzi non autorizzati. Restano permessi solo il motore OCR e i modelli di lingua, più i servizi cloud se configurati: la promessa «niente esce» è garantita dal browser, non solo dal nostro codice.
- Verificato con un server locale che usa le stesse intestazioni: nessun blocco nei percorsi principali, invio verso un indirizzo estraneo impedito.
- Revisione degli `innerHTML`: nessun punto vulnerabile (il testo dei documenti entra sempre come testo o neutralizzato).

**Banco di prova per ogni funzione** (`test/bench/tools_bench.js` più i banchi già esistenti).
- Copre tutti i 38 strumenti, con documenti inventati e la verità di riferimento (`make_tools.py`).
- Dà un punteggio misurato e una soglia che blocca le regressioni, ed è nella suite completa.
- Rapporto: `test/bench/RISULTATI-strumenti.md`.

Risultati principali:

| funzione | misura |
|---|---|
| Oscura, PDF digitale | 17/17 dati trovati, 0 falsi allarmi |
| Oscura, scansione | 17/17, 0 falsi allarmi |
| Estratto conto (3 digitali + 1 scansione) | 128/128 movimenti esatti |
| PDF in Excel, digitale | 75/75 celle |
| PDF in Excel, scansione | 70/75 celle |
| PDF in Word e PDF OCR (anche da scansione) | 100% delle parole nell'ordine |
| Confronta | 8/8 modifiche, 0 segnalazioni in più |
| Conta | conteggi esatti |
| Comprimi | 4% del peso, differenza d'aspetto 0,8% |
| Compila | 17/17 campi |
| Altri strumenti | tutti i controlli superati |

Il banco ha già fatto il suo lavoro. Ha trovato due difetti veri di Oscura su scansione, ora corretti:
- un IBAN letto con un segno spurio davanti;
- il testo intero dei dati, che l'elenco tagliava.

Ha anche mostrato che una correzione tentata su Excel (rilettura con le sole cifre) non portava guadagno: l'ho tolta.

**Rimane da migliorare, misurato.** Excel da scansione legge male 5 celle su 75 (cifre scambiate dall'OCR). È il prossimo obiettivo, e il banco dirà se una correzione funziona davvero.

---

## 8. Il livello successivo: robustezza, prestazioni, affidabilità

Ho guardato il prodotto con gli occhi di chi lo usa tutti i giorni. Oltre alla qualità delle singole funzioni, ci si aspetta tre cose: che non si blocchi mai, che resti veloce anche sui documenti lunghi, che ogni risultato sia affidabile. Per misurarle ci sono due banchi nuovi, entrambi nella suite.

**Banco di robustezza** (`test/bench/robust_bench.js`).
- Ogni strumento (38) riceve 11 file difficili: vuoto, rotto, finto, protetto, 300 pagine, tavola A1, pagine ruotate, formati misti, solo immagini, nome con caratteri speciali, tipo sbagliato.
- Per ogni prova conta che non ci siano errori sfuggiti né attese infinite, e che si arrivi a un risultato o a un messaggio chiaro.
- Esito: **418/418**, dopo le correzioni dei difetti veri che ha trovato:
  - **Conta parole** con un file illeggibile restava per sempre su «Lettura dei file…»: ora dice il motivo;
  - **Fai tutto tu** accettava file rotti e l'errore arrivava solo alla fine: ora li controlla subito, come gli altri strumenti;
  - **Migliora** trasformava in immagini anche le pagine digitali di un PDF (più lento, più pesante, testo non più copiabile): ora le lascia com'erano e migliora solo scansioni e foto.

**Banco di prestazioni** (`test/bench/perf_bench.js`, documento di 300 pagine).
- Ha trovato un problema serio introdotto con la lettura in parallelo: aprendo un documento lungo in Modifica tutte le pagine si preparavano insieme, con **25 secondi** per la prima pagina e **3,2 GB** di memoria.
- Ora si preparano due alla volta e solo quelle che possono essere scansioni: **1,1 secondi e 30 MB**.
- Tempi attuali, su 300 pagine:

| strumento | tempo |
|---|---|
| Unisci, Dividi, Numeri, Ruota, Organizza, Impagina, Proteggi | 1-2 s |
| Oscura (ricerca dei dati), Conta | 1,5 s |
| Confronta | 8 s |
| Comprimi | 11 s |
| PDF/A | 15 s |
| Excel | 65 s |
| Word | 70 s |

**Altro, sempre dal punto di vista di chi usa il prodotto.**
- **Modifica su scansioni**:
  - il PDF salvato è **ricercabile per intero** (prima lo era solo il testo modificato), con ogni parola al suo posto;
  - frecce su/giù e Inizio/Fine seguono le righe che si vedono.
- **OCR · Rivedi**: le parole incerte si possono **eliminare** (una per una, oppure tutte quelle non corrette); spariscono dal testo estratto, dal PDF ricercabile e dal Word.
- **Organizza**: su ogni pagina c'è **«Aggiungi una pagina bianca dopo questa»**; sul telefono i comandi stanno su due file.
- **Oscura**: i **modelli** (GDPR, pubblicazione all'albo, sanità, solo identificativi) e il **rapporto di oscuramento** in PDF. Il rapporto dice che cosa è stato tolto senza ripeterlo e riporta le impronte prima e dopo e l'esito della verifica.
- **Excel da scansione**: quando la cella riletta da sola è meno sicura della lettura della pagina intera, vince la seconda. Le celle giuste passano da 70 a 73 su 75; lo stesso vale per le tabelle in Modifica.
- **Errori**:
  - un paracadute globale spiega ogni errore sfuggito, invece di un clic che «non fa niente»;
  - quando c'è un motivo preciso (es. «il file è vuoto»), si mostra quello invece del messaggio generico.

---

## 9. Ultimo giro: Modifica completata, «Separa» tolto

**Tolto «Separa fatture e cedolini».**
- Sparisce dagli strumenti, dalla ricerca, dalle professioni (Contabilità e Consulente del lavoro hanno un consiglio nuovo) e dai suggerimenti dell'assistente.
- Il vecchio indirizzo `#separa` porta alla home.
- Dividi resta com'era, compresa la modalità «Per documento»: è una sua funzione, e toglierla sarebbe stata una regressione. I test di quella modalità ora passano da Dividi.

**Modifica · «Correggi la lettura (l'immagine non cambia)».**
- Cliccando un testo della scansione, nel pannello c'è il pulsante. Si apre una finestra con, per ogni riga, il ritaglio della scansione e il testo letto, da correggere.
- La pagina resta identica al pixel (misurato: 0 pixel diversi). Cambiano il testo che si cerca e si copia nel PDF salvato e i nomi delle lettere della pagina, quindi le riscritture successive usano le lettere giuste.
- Se il numero di parole cambia, le parole nuove si distribuiscono sulla riga e non insegnano lettere alla pagina: una posizione stimata non deve diventare una lettera sbagliata.
- Basta questa correzione per salvare: il PDF esce identico, con il testo giusto.

**Modifica · lettere prese dalle altre pagine.**
- Se una lettera non c'è nella pagina, prima di ricostruirla col carattere si cerca nelle altre pagine lette dello stesso documento: le più vicine, alla stessa risoluzione, al massimo 8 pagine da preparare.
- La lettera si usa solo se la riga da cui viene somiglia a vista a quella da modificare. La scala si calcola dalle lettere che le due righe hanno in comune.
- Mentre si scrive non si aspetta: la lettera vera arriva appena trovata.
- Misura: due casi nuovi a due pagine nel banco delle scansioni, dove la «Z» maiuscola c'è solo a pagina 2. Somiglianza con la pagina vera, sulla parola «Zagarolo»:

| caso | misura | lettera ricostruita | lettera da pagina 2 |
|---|---|---|---|
| Carlito (come Calibri, carattere che l'app non ha) | sola lettera Z | 0,500 | **0,719** |
| | parola | 0,574 | **0,616** |
| | riga | 0,553 | **0,558** |
| Helvetica (lo stesso carattere usato per ricostruire) | sola lettera Z | 0,643 | 0,631 |

- Il guadagno c'è dove serve: nei documenti con un carattere che l'app non ha (Calibri e simili, i più comuni negli uffici).
- Con Helvetica la ricostruzione era già quasi perfetta, perché il carattere è proprio quello: lì la differenza è dentro il rumore della misura.
- Per misurare le lettere, il banco ora ha anche la somiglianza della sola parola e della sola prima lettera, oltre a quella fino a fine riga. Fuori dalle modifiche resta 0% di pixel cambiati, 0,014% sulla pagina storta, che ha una pagina sola e quindi non passa dal codice nuovo; il testo resta cercabile in tutti i casi.

**Suite completa dopo queste modifiche.**
- Tutto verde: build, peso (7,54 MB su 8), interfaccia (74 comportamenti), servizi per professione (16), firme e p7m, sito con CSP, Modifica fedele (13/13 e 7/7), lettura condivisa, banco degli strumenti.
- Robustezza: **407/407** (37 strumenti × 11 file difficili).
- Prestazioni su 300 pagine: tutti gli strumenti entro i limiti.
- Il riconoscimento del foglio resta instabile sotto carico (48/54 nella suite, 49/54 e nessun foglio non trovato da solo). Questo giro non ha toccato quel codice.
- Un test del centro privacy contava le righe prima che finissero di disegnarsi (si disegnano dopo il calcolo delle dimensioni dei dati): ora le aspetta. Il prodotto non aveva difetti.
