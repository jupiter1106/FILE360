# Stress test completo di file360 — somme e strategia

*17 novembre 2026. Tutti i dati sono inventati: nessun file reale è stato usato.*

> **Aggiornamento del 17 novembre 2026, dopo le correzioni:** i problemi seri e quasi tutti quelli secondari sono risolti, e il risultato è misurato con lo stesso stress test. Vedi **§8 Dopo le correzioni** e **§9 Ultimo giro** (i sei punti rimasti: velocità, elenchi in Word, PDF/A-2, tag, Oscura su più file e sulle foto) in fondo. Le sezioni 1–7 restano com'erano, come fotografia del punto di partenza.

## In una frase

file360 è **solido**: non si rompe, non manda dati in rete, non esegue codice dei file e produce sempre file validi. Ci sono però **tre problemi seri di affidabilità** e un gruppo di **perdite di fedeltà** che chi lo usa nota subito.

I tre problemi seri:
- **Oscura** lascia dati personali nei commenti, nei campi e nei link, e intanto dichiara «Verificato».
- **Verifica firme** dà «Firma valida» a una firma fatta con un certificato inventato.
- **PDF/A** trasforma in immagini le pagine con caratteri non incorporati: 1000 pagine passano da 0,95 MB a 266 MB.

---

## 1. Come è stato fatto

**Batteria di 26 file difficili** (`test/stress/make_corpus.py`):
- **Dati nascosti**: dati personali nascosti in commenti, campi compilati, allegati, segnalibri, metadati, XMP e link; testo bianco, minuscolo, sotto un'immagine, fuori pagina o in un livello nascosto.
- **Struttura da conservare**: segnalibri su due livelli, link interni ed esterni, campi, commenti, allegati, tag di accessibilità.
- **Lingue e caratteri**: italiano accentato, greco, cirillico, giapponese, simboli matematici e €.
- **Impaginazione**: due colonne, intestazioni e piè di pagina, note, elenco, tabella su due pagine.
- **Scansioni difficili**: fax a 1 bit pieno di puntini, fotocopia sbiadita, fondino colorato, foto storta con ombra.
- **Formati interni insoliti**: object stream, aggiornamento incrementale, xref rotta, immagini CMYK e JPEG 2000.
- **Sicurezza**: JavaScript all'apertura, nome del file con codice HTML, PDF con limitazioni, PDF cifrato AES-256.
- **Dimensioni**: 1000 pagine; 40 foto per 186 MB; una pagina larga 5 metri; 7 formati di pagina diversi.
- **Firme**: certificato fatto in casa che si dichiara «qualificato», p7m manomesso, PDF firmato e poi modificato.

**Banco** (`test/stress/stress.js`, 10 fasi): usa l'interfaccia come una persona e registra:
- esito (risultato, messaggio o blocco);
- errori JavaScript sfuggiti;
- **ogni richiesta di rete**;
- codice eseguito dal file;
- tempo e memoria;
- file prodotti.

**Controllo dei file prodotti** con strumenti esterni (`test/stress/check.py`):
- pikepdf e PyMuPDF per la validità e per cosa resta nel file;
- veraPDF, il validatore di riferimento, per i PDF/A;
- LibreOffice, python-docx e openpyxl per Word ed Excel.

**Accessibilità**: axe-core con le regole WCAG 2.1 A/AA (`test/stress/a11y.js`), su home e strumenti, in chiaro e in scuro.

---

## 2. Le somme, aspetto per aspetto

| Aspetto | Prove | Esito |
|---|---|---|
| **Robustezza** con file ostili | 591 (37 strumenti × 14 file, più la riesecuzione dei 2 con limiti e password) | ✅ 0 errori sfuggiti, 0 blocchi veri. I file sbagliati per lo strumento ricevono un messaggio, tranne 2 casi (§4) |
| **Sicurezza del codice** | JavaScript nel PDF, nome con HTML | ✅ mai eseguito né interpretato |
| **Privacy di rete** | ogni richiesta registrata | ✅ 0 richieste con dati. L'unica rete è lo scaricamento del motore OCR nell'edizione a file singolo |
| **Integrità dei file prodotti** | 1435 file | ✅ 0 non validi, 0 errori di sintassi; **PDF/A 15/15 conformi per veraPDF** |
| **Word ed Excel** | tutti quelli prodotti | ✅ si aprono tutti in LibreOffice |
| **Lettura di scansioni difficili** | fax, sbiadita, fondino, foto storta | ✅ OCR 100% delle parole; Word 89–100%; Excel 98–100%; Modifica 96–100%; Conta: 233 caratteri su 233 |
| **PDF con limitazioni o cifrati** | 73 prove | ✅ lavorati come gli altri (24/37 e 21/36 strumenti arrivano al risultato, come per un file normale) |
| **Annullamento** | 4 lavori lunghi | ✅ si ferma in 0,1–3,9 s, nessun file a metà, si riparte subito |
| **Uso ripetuto** | 12 giri Comprimi + Modifica nella stessa pagina | ✅ memoria ferma a 45 MB |
| **Telefono** | 12 strumenti su iPhone 13 e su schermo da 320 px | ✅ 24/24 al risultato, nessuno scorrimento orizzontale |
| **Accessibilità** (WCAG AA automatica) | 76 schermate | 🟡 71 pulite; 5 con 2 difetti (§4) |
| **Documenti grandi** | 1000 pagine, 186 MB | 🟡 tutto arriva in fondo, alcuni lenti (§3) |
| **Conservazione della struttura** | segnalibri, link, campi, commenti, allegati, tag | 🔴 Unisci, Dividi, Organizza, PDF/A e Migliora perdono parti (§3) |
| **Privacy del contenuto** (Oscura) | dati nascosti fuori dal testo | 🔴 restano nel file (§4) |
| **Verifica firme** | firma falsa | 🔴 «Firma valida» (§4) |

---

## 3. Risultati per funzione

Legenda: ✅ regge lo stress · 🟡 regge, con difetti concreti · 🔴 problema serio.

| Funzione | Esito | Cosa è emerso |
|---|---|---|
| **Unisci** | 🟡 | 1000 pagine in 2,5 s, 186 MB in 3,9 s. Conserva link, campi e commenti. **Perde tutti i segnalibri (0 su 18), gli allegati e i tag di accessibilità.** |
| **Immagini in PDF** | 🟡 | Foto storta → PDF in 2 s. Con un PDF in ingresso risponde «errore imprevisto» invece di «questo strumento vuole immagini». |
| **Dividi** | 🟡 | 1000 pagine in 3,3 s. Le parti **perdono segnalibri e allegati**. |
| **Fai tutto tu** | ✅ | Nessun errore su nessun file. La qualità delle scelte non è misurata qui. |
| **PDF in immagini** | ✅ | 1000 pagine in 58 s (zip da 196 MB), 186 MB in 28 s. |
| **Impagina** | ✅ | Regge tutto. Rifacendo le pagine perde la struttura, com'è normale. |
| **Proteggi e sblocca** | ✅ | Conserva tutto; 1000 pagine in 3,2 s; apre AES-256 con la password. |
| **Migliora** | 🟡 | Foto storta raddrizzata in 4 s. Su un PDF digitale **perde segnalibri, allegati e tag**. |
| **Comprimi** | 🟡 | Conserva tutto. 186 MB → 30 MB (−84%) in 30 s. **1000 pagine di solo testo: 68 s per guadagnare il 25%**: lavora anche dove non c'è niente da comprimere. Si annulla in 0,4 s. |
| **Modifica** | ✅ | Prima pagina pronta in 1,2 s anche su 1000 pagine. Scansioni difficili lette al 96–100%. Memoria stabile. |
| **Ruota** | ✅ | Conserva tutto; 1000 pagine in 6 s. |
| **Organizza** | 🟡 | 1000 pagine in 5,5 s. **Perde segnalibri, allegati e tag.** |
| **Numeri di pagina** | ✅ | Conserva tutto; 1000 pagine in 3,5 s. |
| **OCR** | ✅ | 100% delle parole su fax, fotocopia sbiadita, fondino e foto storta. 1000 pagine in 3 min 15 s. |
| **PDF in Word** | 🟡 | Scansioni 89–100%; tabelle giuste; 1000 pagine in 3 min 13 s (annullabile in 3,9 s). **Due colonne: righe alternate nello stesso paragrafo, testo illeggibile.** Titoli senza stile Titolo (niente navigazione né indice), **link persi**, intestazioni e piè nel corpo del testo, elenchi come testo con «•». |
| **PDF/A** | 🔴 | 15/15 conformi per veraPDF, anche su 1000 pagine e 186 MB. Ma **se i caratteri non sono incorporati (15 file su 17) ogni pagina diventa un'immagine**: 1000 pagine da 0,95 MB a 266 MB, testo sgranato ingrandendo, e **segnalibri, link interni, campi e tag persi**. Il PDF/A-1b ammette segnalibri e link. |
| **Verifica PDF/A** | ✅ | Regge tutto. L'accordo con veraPDF non è stato misurato in questa prova. |
| **Compila** | ✅ | Regge tutto, anche su telefono. |
| **Firme e P7M** | 🔴 | Riconosce bene la manomissione e la modifica dopo la firma (indica la pagina). Ma **una firma con certificato inventato risulta «Firma valida»**: l'unico avviso è in piccolo in fondo. L'elenco dei controlli mostra la frase positiva («Il documento non è stato modificato dopo la firma») anche quando il controllo fallisce, con solo un'icona rossa. Etichette con contrasto insufficiente. |
| **XBRL** | 🟡 | Con un PDF risponde «errore imprevisto». Testo con contrasto insufficiente. |
| **PDF in Excel** | 🟡 | Scansioni 98–100%. La tabella è giusta, con numeri veri e percentuali. Però **è annegata nel testo della pagina** (49 righe per foglio, 21 vuote, due colonne di testo sparse), e una tabella che continua su due pagine finisce in due fogli. 1000 pagine in 2 min 58 s. Il foglio non si raggiunge da tastiera. |
| **Fatture elettroniche** | ✅ | Su file non pertinenti risponde «Nessuna fattura trovata». |
| **Estrai i dati** | ✅ | Regge tutto. |
| **Analisi di bilancio** | 🟡 | Il motivo è giusto («non sono riuscito a leggere un bilancio»), ma il titolo è «qualcosa non ha funzionato». |
| **Confronta** | ✅ | 1000 pagine contro 1000 in 22 s. |
| **Oscura** | 🔴 | Tolto bene: metadati, allegati, segnalibri; testo bianco, minuscolo, sotto immagini e nei livelli nascosti (la pagina oscurata diventa immagine). Ricerca su 1000 pagine in 4 s, senza falsi allarmi. Ma **restano codice fiscale e telefono nei campi, IBAN e nome in un commento, e-mail in un link, e il risultato dice «Verificato: nessun dato oscurato è più leggibile»**. Pagina oscurata non più ricercabile. 40 pagine di foto: 171 s. |
| **Estratto conto, F24, Visure, Laboratorio** | ✅ | Su file non pertinenti: «documenti non riconosciuti», senza errori. |
| **QR SEPA, Copia conforme, Misure, Tesi, SVG, Tavola** | ✅ | Reggono tutto. Copia conforme conserva tutta la struttura. |
| **Conta parole** | ✅ | 1000 pagine in 2,3 s; scansioni: caratteri esatti, parole ±1 (fax 39 su 42). Se clicchi «Conta» mentre legge risponde «Attendi» invece di aspettare da solo. |

**Tempi su 1000 pagine di testo**: Unisci 2,5 s · Proteggi 3,2 s · Dividi 3,3 s · Numeri 3,5 s · Oscura (ricerca) 4,1 s · Organizza 5,5 s · Ruota 6,1 s · Confronta 22 s · PDF/A 53 s · PDF in immagini 58 s · Comprimi 68 s · Excel 178 s · Word 194 s · OCR 196 s.

---

## 4. Problemi trovati, in ordine di gravità (tutti riprodotti)

1. **Oscura lascia dati personali fuori dal testo della pagina e dichiara il contrario.**
   - Commenti, valori dei campi e link `mailto:` restano nel PDF «oscurato».
   - La verifica rilegge solo l'immagine delle pagine oscurate.
   - È il caso peggiore per un prodotto che promette sicurezza: chi pubblica all'albo o invia a terzi si fida del «Verificato».
2. **Verifica firme: un certificato inventato che si dichiara «qualificato» passa come «Firma valida».**
   - Chiunque può creare un file così in un minuto (lo stress test lo fa con OpenSSL).
3. **PDF/A trasforma le pagine in immagini** quando i caratteri non sono incorporati, cioè con Helvetica, Arial e Times standard, molto comuni.
   - Il file diventa fino a 280 volte più pesante: inviabile per PEC solo se piccolo.
   - Perde vettori, segnalibri, link interni, campi e tag.
4. **Struttura persa** in Unisci, Dividi, Organizza e Migliora: segnalibri (anche quelli di più file uniti), allegati, tag di accessibilità.
5. **Word con documenti a due colonne**: le righe delle due colonne si alternano; inoltre nessun titolo, nessun link, intestazioni nel corpo del testo.
6. **Excel**: la tabella è giusta ma mescolata al testo; le tabelle su più pagine non sono unite.
7. **Elenco dei controlli delle firme**: frasi positive anche quando il controllo fallisce. Ingannevole a colpo d'occhio e per chi usa un lettore di schermo.
8. **Messaggi**:
   - un PDF dato a «Immagini in PDF» o a «XBRL» produce «errore imprevisto»;
   - Analisi ha il titolo d'errore anche quando il motivo è chiaro;
   - Conta risponde «Attendi» invece di aspettare da solo.
9. **Lentezze evitabili**:
   - Comprimi su PDF di solo testo (68 s per 1000 pagine);
   - Oscura sulle foto (4 s a pagina);
   - Word, Excel e OCR circa 0,2 s a pagina, su un solo processore.
10. **Accessibilità**: contrasto in Firme e XBRL; foglio di Excel non raggiungibile da tastiera.

**Già noto e confermato**:
- l'edizione a file singolo scarica il motore OCR dalla rete al primo uso, quindi senza rete non fa l'OCR (non escono dati);
- il sito non è installabile né usabile offline.

---

## 5. Strategia azionabile

Ogni intervento ha un **criterio di successo misurabile** con lo stress test stesso. Così «migliore» resta un numero, non un'impressione.

### Fase 1 — Affidabilità (subito, prima di ogni altra cosa)

| # | Intervento | Criterio di successo | Peso |
|---|---|---|---|
| 1 | **Oscura pulisce tutto il file**. La ricerca dei dati guarda anche commenti, campi, link, allegati, segnalibri e livelli. In uscita, di base, toglie commenti, allegati e link `mailto:` e appiattisce i campi (opzioni visibili). La verifica finale ricontrolla anche questi, e «Verificato» compare solo se è tutto pulito. Il testo non oscurato torna ricercabile. | `privacy-nascosti.pdf` e `testo-nascosto.pdf`: **0 dati rimasti** in ogni parte del file; pagina oscurata ricercabile | M |
| 2 | **Firme con fiducia vera**: l'elenco ufficiale dei certificatori qualificati (Trusted List UE / AgID) incorporato nell'app e aggiornato a ogni pubblicazione. Esito su tre livelli: «valida e qualificata», «integra, ma certificatore non riconosciuto», «non valida». Frasi dei controlli che dicono il vero («Modificato dopo la firma»). Contrasto corretto. | `firma-falsa.pdf.p7m`: **mai «valida»**; manomissione e modifica ancora riconosciute; WCAG 0 violazioni in Firme | M |
| 3 | **PDF/A senza immagini**: per i 14 caratteri standard si incorporano caratteri liberi con le stesse misure (famiglia Liberation, licenza libera). Si conservano segnalibri, link interni e tag. In più l'opzione PDF/A-2b/2u. | `mille.pdf` → **meno di 2 MB, 0 pagine in immagine**, veraPDF PASS, segnalibri 9/9 su `struttura.pdf` | M |

### Fase 2 — Fedeltà dei risultati

| # | Intervento | Criterio di successo | Peso |
|---|---|---|---|
| 4 | **Conservare la struttura** in Unisci (segnalibri di ogni file sotto il suo nome), Dividi, Organizza e Migliora: segnalibri, allegati, tag. | Tabella di conservazione tutta verde per i 5 strumenti | M |
| 5 | **Word fedele**: ordine di lettura per colonne; titoli con gli stili Titolo 1/2 (riquadro di spostamento e indice in Word); link; intestazioni e piè nelle sezioni di Word; elenchi veri. | `impaginato.docx`: 0 righe mescolate, intestazione nella sezione; `struttura.docx`: 6 titoli e 6 link | L |
| 6 | **Excel utile**: se ci sono tabelle, di base «solo tabelle» (il testo su un foglio a parte); una tabella che continua su più pagine si unisce in un foglio solo, con l'intestazione una volta. | `impaginato.xlsx`: un foglio «Tabelle» con 12 righe di dati, 0 righe vuote | M |
| 7 | **Messaggi che aiutano**: formato sbagliato → «questo strumento vuole immagini o XBRL; per un PDF usa …» con il pulsante dello strumento giusto. Conta aspetta da solo. Analisi senza titolo d'errore. | Stress «ostili»: **0 messaggi "errore imprevisto"** | S |

### Fase 3 — Velocità e uso quotidiano

| # | Intervento | Criterio di successo | Peso |
|---|---|---|---|
| 8 | **Velocità**: Comprimi salta le pagine senza immagini; OCR, Word ed Excel usano più processori; Oscura sulle foto legge a risoluzione adatta. | 1000 pagine: Comprimi < 10 s, Word/Excel/OCR < 90 s; Oscura < 1,5 s a foto | M |
| 9 | **App installabile e offline** (sito): si installa, funziona senza rete, «Apri con» dal computer, «Condividi» dal telefono. Edizione a file singolo con il motore OCR incluso (più pesante, vedi decisioni). | OCR senza rete; installazione e apertura da «Apri con» provate | M |
| 10 | **Più file insieme** dove serve in serie: Oscura (stesso modello e un rapporto per tutti), Numeri, Ruota, Copia conforme. | 20 file → un'operazione e un archivio | M |
| 11 | **Accessibilità**: le due violazioni rimaste; poi PDF accessibile (con tag) in uscita da OCR e conversioni. | WCAG AA: 76/76; tag presenti nelle uscite | S → L |

### Fase 4 — Misura continua

| # | Intervento | Criterio di successo | Peso |
|---|---|---|---|
| 12 | **Stress test nella suite**: le fasi veloci (ostili, privacy, firme, conservazione, accessibilità) a ogni consegna, le lente a parte. Corpus da allargare con documenti veri anonimizzati, perché i banchi attuali sono saturi (39 casi su 41 al 100%). | Ogni intervento della tabella sopra ha la sua riga rossa → verde | S |

**Ordine consigliato**: 1 → 2 → 3 (sicurezza e affidabilità: sono promesse del prodotto); poi 4 → 7 → 5 → 6; poi 8 → 9 → 10 → 11. Il 12 va avanti in parallelo, a ogni passo.

---

## 6. Decisioni che servono da te

1. **Firme, controllo della revoca**: si può fare solo online. Si invierebbe il numero di serie del certificato, mai il documento. Proposta: opzionale, spento di base, con spiegazione.
2. **Edizione a file singolo con OCR incluso**: circa 5–6 MB in più. Va bene, oppure due edizioni (leggera e completa)?
3. **Oscura**: togliere commenti e allegati sempre, oppure lasciare la scelta con i dati sensibili trovati evidenziati?

---

## 7. Limiti di questo stress test

- **Corpus generato**: i documenti sono realistici nella forma, ma non coprono la varietà dei file veri (scansioni di cellulari diversi, PDF di software gestionali, moduli della PA).
- **Accessibilità solo automatica**: axe trova circa un terzo dei problemi reali; servono anche prove con lettore di schermo.
- **Non misurati qui**:
  - l'accordo di «Verifica PDF/A» con veraPDF;
  - la qualità delle scelte di «Fai tutto tu»;
  - la scrittura a mano;
  - le lingue oltre le 5 dell'OCR.
- **Un registro sovrascritto**: il registro dettagliato della prima esecuzione sui file ostili è andato sovrascritto da una riesecuzione. Il riepilogo era già stato estratto ed è salvato in `test/stress/out/sintesi-ostili.json`.

**Per rifare tutto**:
```
python3 test/stress/make_corpus.py
node test/stress/stress.js <fase>
python3 test/stress/check.py
node test/stress/a11y.js
```
Le fasi sono: ostili, privacy, scansioni, scala, ripetizione, annulla, telefono, firme, fedelta.


---

## 8. Dopo le correzioni (stesso stress test, rifatto da capo)

### I tre problemi seri

| Problema | Prima | Dopo |
|---|---|---|
| **Oscura** lasciava dati in commenti, campi e link, e diceva «Verificato» | 6 tipi di dato rimasti nel file oscurato | **0 dati rimasti** in testo, commenti, campi, link, metadati, XMP, allegati e segnalibri |
| **Firma con certificato inventato** | «Tutte le firme sono valide» | **«Firma integra, ma il certificatore non è riconosciuto»**, con la spiegazione |
| **PDF/A di 1000 pagine di testo** | 266 MB, 53 s, tutte le pagine in immagine | **0,97 MB, 5,2 s, nessuna pagina in immagine**; veraPDF PASS |

### Cosa è cambiato, strumento per strumento

- **Oscura**
  - I campi compilati diventano parte della pagina, così si trovano e si oscurano come il resto del testo.
  - Commenti, note e link a e-mail o telefono, o che contengono dati oscurati, si tolgono. L'opzione è visibile e attiva di base. Allegati e segnalibri non vengono copiati.
  - La verifica finale rilegge tutto il file prodotto (testo, commenti, campi, link, metadati, allegati) più le immagini con l'OCR. «Verificato» compare solo se è tutto pulito.
  - Le pagine oscurate restano ricercabili, senza il testo che stava sotto le aree.
- **Firme**
  - Incluso nell'app l'elenco ufficiale AgID dei certificatori qualificati: 206 certificati e 36 marche temporali, emesso il 5/11/2026. La verifica resta tutta sul dispositivo.
  - L'esito ha tre livelli: valida, integra ma con certificatore non riconosciuto, non valida.
  - Le frasi dei controlli dicono com'è andata davvero («Il documento è stato modificato dopo la firma»).
  - Corretto il contrasto delle etichette.
  - **Limite**: la revoca del certificato non si controlla, perché servirebbe la rete.
- **PDF/A**
  - Per Helvetica, Arial, Times e Courier non incorporati si incorpora la famiglia Liberation, che ha le stesse misure di ogni lettera.
  - Campi e annotazioni stampabili diventano parte della pagina.
  - Si conservano segnalibri (9 su 9), link interni (4 su 5) e tag di accessibilità.
  - Le pagine si copiano con le risorse condivise: un carattere incorporato una volta sola, non mille.
  - **Limite**: una pagina viene ancora rifatta come immagine quando contiene una trasparenza (PDF/A-1 non la ammette) o un campo con codifica personalizzata.
- **Unisci, Dividi, Organizza, Migliora**: segnalibri e allegati conservati. In Unisci c'è un segnalibro con il nome di ogni file, con sotto i suoi segnalibri; il risultato di prova ha 20 segnalibri e 2 allegati.
- **Word**
  - Due colonne lette nell'ordine giusto: un paragrafo per colonna, 683 e 681 caratteri, nessuna riga alternata.
  - Titoli con gli stili Titolo 1/2/3, quindi riquadro di spostamento e indice funzionano.
  - Link veri, 6 su 6.
  - Intestazione e piè ripetuti diventano intestazione e piè di Word, con il numero di pagina come campo.
  - **Limite**: gli elenchi puntati restano testo con «•», non elenchi di Word.
- **Excel**: quando ci sono tabelle, il primo foglio è «Tabelle», con tutte le tabelle del documento. Una tabella su due pagine diventa una tabella sola: intestazione una volta, 12 righe, nessun testo, nessuna riga vuota.
- **Messaggi**
  - Un file del tipo sbagliato riceve un messaggio chiaro con lo strumento adatto e il pulsante per aprirlo: un PDF in «Immagini in PDF» o in «XBRL» non dà più «errore imprevisto».
  - Analisi dice «Contenuto non riconosciuto».
  - Conta aspetta da solo la fine della lettura.
- **Comprimi**: sui PDF senza immagini non trasforma più le pagine in foto. 1000 pagine passano da 68 a 3,7 secondi, con lo stesso risultato (−24%). Si conserva tutto, compresi i tag.
- **App installabile** (sito): manifest con icone, «Apri con» per PDF e immagini, service worker. Senza rete l'app si apre e lavora (provato con Unisci); il motore OCR resta sul dispositivo dopo il primo uso.
- **Accessibilità**: contrasto in Firme, foglio di Excel raggiungibile da tastiera.
- **Richieste in corso d'opera**:
  - Organizza ha la selezione veloce: barra fissa con «Seleziona tutto», Maiusc+clic per un intervallo, trascinamento dal cerchietto, rettangolo, Ctrl+A, Esc e Canc con Annulla, spostamento di gruppo. Un clic su 300 pagine non ricostruisce più la griglia.
  - Dividi ha la modalità «In N file», con le pagine di ciascuno; l'ultimo file prende il resto.

### Le somme, rifatte

| Aspetto | Prima | Dopo |
|---|---|---|
| Robustezza (518 prove sui file ostili) | 0 errori sfuggiti; 28 «errore imprevisto» | 0 errori sfuggiti; **0 «errore imprevisto»**; 314 risultati (prima 271, per le correzioni del banco) |
| Integrità dei file prodotti | 1435 validi su 1435 | **1499 validi su 1499** |
| PDF/A con veraPDF | 15 su 15, con pagine in immagine | **17 su 17, testo vero** |
| Privacy (Oscura) | dati rimasti in commenti, campi, link | **nessun dato rimasto** |
| Firme false | «valida» | **«certificatore non riconosciuto»** |
| Conservazione della struttura | persa in Unisci, Dividi, Organizza, PDF/A, Migliora | **conservata** (i tag anche in Unisci, Organizza e Migliora dal §9) |
| Accessibilità (WCAG AA automatica) | 71 su 76 | **75 su 76**: l'unica segnalazione viene dall'animazione di XBRL catturata a metà; a pagina ferma è pulita |
| Telefono | 24 su 24 | 24 su 24 |
| Memoria con uso ripetuto | stabile (45 MB) | stabile (58 MB, app con più moduli) |
| Annullamento | 0,1–3,9 s | 0,5–3,4 s; OCR lungo 8,3 s |
| PDF/A, 1000 pagine | 53 s, 266 MB | **5,2 s, 0,97 MB** |
| Comprimi, 1000 pagine | 68 s | **3,7 s** |

### Suite completa

**Tutto verde (18 gruppi):**
- interfaccia: 77 comportamenti;
- servizi per professione: 16;
- prestazioni di avvio;
- sito con le intestazioni di sicurezza;
- app installabile senza rete;
- stress rapido;
- firme;
- Modifica fedele: 13/13 e 7/7;
- lettura condivisa;
- banco degli strumenti;
- riconoscimento del foglio: 49/54;
- robustezza;
- prestazioni su 300 pagine;
- OCR su fogli non piatti.

Il file pesa 8,17 MB; la soglia è stata alzata a 8,5 MB per l'elenco AgID e i caratteri di PDF/A.

### Ancora da fare

1. **Oscura su più file insieme**: non fatto in questo giro.
2. **Velocità**:
   - Word, Excel e OCR richiedono circa 3 minuti per 1000 pagine, su un solo processore;
   - Oscura sulle foto impiega 4 secondi a pagina.
3. **Tag di accessibilità** in Unisci, Organizza e Migliora.
4. **Word**: elenchi veri.
5. **PDF/A-2**: per le pagine con trasparenze o con campi in codifica personalizzata.
6. **Firme**: controllo della revoca online, come opzione da decidere insieme.

**Banchi nuovi**:
- stress test rapido nella suite (`test/stress/quick.py`);
- prova dell'app installabile senza rete (`test/suite/pwa.test.js`);
- casi nuovi nel banco degli strumenti: PDF/A con caratteri non incorporati, Word a due colonne, Excel «Tabelle»;
- test d'interfaccia per Oscura, Firme, Organizza e Dividi.

---

## 9. Ultimo giro: i sei punti rimasti

*17 novembre 2026, dopo le richieste «Continua ed esaurisci tutto».*

### Che cosa è cambiato

**1. Word, Excel e OCR su documenti lunghi.**
- Prima, ogni pagina veniva disegnata a 200 dpi e analizzata pixel per pixel per cercare tabelle, immagini, sottolineature e colori: 189 ms per pagina.
- Ora, se una pagina ha solo testo nero o grigio (niente linee, immagini, sfumature, colori, commenti o testo inclinato), il disegno si salta: 5 ms per pagina.
- Il risultato è identico. L'ho confrontato pagina per pagina su 107 pagine di 42 file di prova; l'unica differenza è un arrotondamento al centesimo di punto.
- Le pagine con disegni passano dalla strada di prima.

**2. Elenchi veri in Word.**
- Puntati (•, –, ✓…), numerati (1. 1) a) A.) e annidati diventano elenchi di Word. Il segno o il numero lo scrive Word, con il rientro misurato sull'originale.
- Un elenco numerato continua, anche sulla pagina dopo, solo se il numero è proprio il successivo; altrimenti ne parte uno nuovo da quel numero. Così i numeri mostrati sono sempre quelli dell'originale.
- Riconosciuto anche il numero seguito da un rientro stretto. Le righe giustificate che iniziano per «2.» non vengono scambiate per elenchi.
- Verificato aprendo il file con LibreOffice.

**3. PDF/A: meno pagine trasformate in immagine.**
- **PDF/A-2b**: le trasparenze sono ammesse dalla norma, quindi non trasformano più la pagina in immagine. Restano escluse le modalità di fusione non standard.
- **Caratteri con codifica propria** (tipici dei campi dei moduli, il carattere «/Helv» con «Differences»): vengono incorporati come caratteri «simbolici», con una tabella dei codici costruita apposta e la tabella Unicode. Vale anche in PDF/A-1b, e il testo resta ricercabile e copiabile.
- **Due difetti veri trovati e corretti**:
  - nella tabella WinAnsi del verificatore mancavano ², ³ e ¹, quindi file validi venivano segnalati, anche nello strumento «Verifica PDF/A»;
  - i codici che WinAnsi associa al pallino (per esempio il 127, usato da molti programmi per «•») avevano la larghezza sbagliata.
- **Scelta del livello**: con PDF/A-1b, se il 2b eviterebbe pagine in immagine, lo strumento lo dice («Con PDF/A-2b queste pagine restano testo vero») e un clic lo sceglie. Non lo cambia da solo, perché alcuni portali richiedono proprio l'1b.
- **Avviso più veritiero**: prima, l'analisi mostrata prima della conversione contava come «da ricostruire» anche pagine che poi restavano testo vero. Ora l'analisi guarda il file come lo prepara la conversione.

**4. Tag di accessibilità in Unisci, Organizza, Migliora, Dividi ed Estrai.**
- L'albero della struttura viene copiato con le pagine e i collegamenti del file nuovo al posto di quelli vecchi.
- Gli elementi delle pagine tolte vengono eliminati. I numeri che legano il contenuto alla struttura ripartono da capo, file dopo file, e la loro tabella si ricostruisce.
- Una pagina duplicata riceve la sua copia della struttura.
- In Migliora, i tag valgono solo per le pagine copiate così come sono; quelle migliorate sono immagini nuove.
- Con veraPDF (profilo PDF/UA), i file prodotti da Dividi, Organizza (con una pagina tolta e una duplicata) e dall'unione di due copie hanno esattamente le stesse segnalazioni dell'originale. Unendo un file senza tag, le sue pagine restano senza tag: non si inventano.

**5. Oscura su più file insieme.**
- Se si trascinano più PDF si apre un pannello unico, con il modello, le parole da oscurare sempre, il colore e le opzioni.
- Ogni file passa dallo stesso motore del file singolo: ricerca, oscuramento e verifica completa (rilettura del file e OCR delle pagine oscurate).
- Alla fine si ottengono un archivio e **un rapporto unico**, con il riepilogo di tutti i file e poi il rapporto di ciascuno, senza i dati.
- Accanto a ogni file c'è l'esito e un pulsante «Rivedi da solo», che lo apre nell'Oscura normale.
- Un file senza dati viene segnalato e non viene prodotto.

**6. Oscura sulle foto.**
- Una pagina-immagine che non ha l'aspetto di un foglio (poca carta chiara) viene prima letta in modo rapido a 108 dpi.
- Se non si legge nemmeno una parola sicura, l'OCR completo si salta.
- Ho misurato la soglia: a 108 dpi le foto senza testo danno 0 parole, mentre le scansioni di documenti (fax, sbiadite, con il fondino, moduli, firme) ne danno decine, con sicurezza 97%.
- Le scansioni di documenti hanno l'aspetto di un foglio, quindi non passano da questa lettura rapida.
- La ricerca di firme, timbri e codici ora lavora su più pagine insieme e riusa l'immagine già disegnata.
- Anche Word, OCR ed Excel sulla pagina gigante (5 metri) ora danno il risultato: prima davano «Conversione immagine non riuscita» (difetto che c'era già, trovato in questo giro). La risoluzione del disegno scende quanto serve per le pagine enormi.

**Altro trovato e corretto in questo giro.**
- Accessibilità: le didascalie dell'anteprima animata (e l'ingresso della scheda) comparivano in dissolvenza. A metà dissolvenza il testo aveva poco contrasto: era questa la segnalazione su XBRL che avevo attribuito al caso. Ora compaiono a tendina, sempre a colore pieno.

### Le misure

| Che cosa | Prima | Dopo |
|---|---|---|
| Word, 1000 pagine digitali | ~190 s | **11,6 s** |
| Excel, 1000 pagine | ~190 s | **6,6 s** |
| OCR su PDF digitale, 1000 pagine | ~190 s | **11,5 s** |
| Oscura, 40 foto (186 MB) | 163 s (4 s a pagina) | **61 s (1,5 s a pagina)**; su 8 pagine 1,2 s a pagina |
| Oscura, banco digitale e scansione | 17/17 e 17/17 | 17/17 e 17/17 |
| Oscura su più file (digitale + scansione + file senza dati) | — | 9 s, nessun dato rimasto, rapporto unico senza dati |
| PDF/A-1b: file di prova con pagine rifatte come immagine | 13 su 44 | **5** (trasparenze ×3, ammesse solo in PDF/A-2; JPEG 2000; livelli) |
| PDF/A-2b: file di prova con pagine rifatte come immagine | 13 su 44 | **2** (JPEG 2000, livelli) |
| PDF/A prodotti, controllati con veraPDF | — | **88 su 88 conformi** (1b e 2b, tutti i file di prova) |
| Word: elenchi | testo «• …» o «1. …» | elenchi di Word; numerazione giusta anche su due pagine |
| Tag in Unisci, Organizza, Migliora | persi | **conservati** (pagine tolte potate, nessun rimando rotto); PDF/UA come l'originale |

### Lo stress test, rifatto da capo

| Aspetto | Esito |
|---|---|
| Robustezza: 518 prove sui file ostili | 0 errori sfuggiti, 0 «errore imprevisto», 314 risultati (come prima) |
| Integrità dei file prodotti | **1500 validi su 1500** (pikepdf, PyMuPDF, LibreOffice) |
| PDF/A con veraPDF | **17 su 17** |
| Privacy (Oscura) | nessun dato rimasto |
| Firme | falsa: «certificatore non riconosciuto»; manomessa: «non valida»; PAdES modificato dopo la firma: segnalato |
| Struttura | segnalibri, allegati e **tag** conservati in Unisci, Organizza, Migliora, PDF/A |
| Accessibilità (WCAG AA automatica, chiaro e scuro) | **76 su 76** |
| Telefono | 24 su 24, niente che esce dallo schermo |
| Memoria con uso ripetuto | stabile: 38 MB per 12 giri |
| Annullamento | pagina libera in 0,3–4,8 s; si riparte subito |
| Lettura delle scansioni (parole ritrovate) | invariata: OCR 100%, Excel 98–100%, Word 89–100% |

### Suite completa

**Tutto verde (18 gruppi):** interfaccia (78 comportamenti, compreso quello nuovo sui tag), servizi per professione, prestazioni, sito con le intestazioni di sicurezza, app installabile, stress rapido, firme, Modifica fedele 13/13 e 7/7, lettura condivisa, banco degli strumenti (con i casi nuovi: elenchi veri, PDF/A-2 e campi, Oscura su più file), riconoscimento del foglio, robustezza, prestazioni su 300 pagine, OCR su fogli non piatti. File: 8,20 MB.

### Che cosa resta, onestamente

1. **PDF/A con livelli** (contenuti opzionali) e con **immagini JPEG 2000**: le pagine vengono ancora rifatte come immagine. PDF/A-2 le ammetterebbe, ma con regole precise; da fare con calma e con veraPDF.
2. **Scansioni**: un documento scansionato richiede comunque 3–4 s a pagina. È il tempo dell'OCR completo: la parte veloce di questo giro vale per i PDF digitali e per le foto senza testo.
3. **Word da una scansione «fax»**: l'89% delle parole ritrovate, come prima. Il limite è l'OCR su un'immagine molto rovinata, non la composizione del Word.
4. **Pagine senza tag**: unendo un file che non ha tag, le sue pagine restano senza tag. Inventarli sarebbe peggio.
5. **Oscura sulle foto**: una foto senza nemmeno una parola leggibile a 108 dpi non viene letta con l'OCR completo. Una scritta minuscola in una foto (per esempio una targa lontana) potrebbe sfuggire, come del resto sfuggiva spesso anche prima. Nell'elenco resta sempre possibile disegnare l'area a mano.
6. **Firme**: il controllo della revoca online resta da decidere insieme (vorrebbe dire contattare un servizio esterno).

---

## 10. Secondo giro: tutto ciò che restava

*18 novembre 2026, dopo «Procedi con tutto ciò che resta».*

### Prima, due correzioni a quanto scritto nella §9

- **«Word da un fax: il limite è l'OCR».** Era sbagliato. Sulla stessa scansione il PDF con OCR ritrovava il 100% delle parole e il Word l'89%: le parole si perdevano nella composizione del Word, non nella lettura. Il difetto è qui sotto, corretto.
- **«Scansioni: 3–4 s a pagina».** Era il tempo della prima pagina, motore OCR compreso. Su un documento di 12 pagine il tempo vero è **1,8 s a pagina** con 4 processori.

### Che cosa è cambiato

**1. Word dalle scansioni: nessuna parola persa.**
- In fondo alle righe storte (fax) l'OCR legge giuste parole come «che», «a» e «1.234,56.», ma con poca sicurezza. Il Word le scartava; l'inchiostro rimasto «scoperto» diventava un'immagine, classificata come «Firma».
- Ora una parola poco sicura resta testo se ha la forma di una parola vera o di un numero: nel dizionario italiano, una parolina come «a» o «che», oppure un importo. Deve anche stare dentro una riga di parole sicure, essere alta come loro e continuare la riga.
- Lo sporco prima del margine o i puntini letti come «-» restano fuori; le firme vere restano immagini.
- Risultato: le tre scansioni difficili (fax, sbiadita, con il fondino) danno il **100% delle parole nel Word, senza parole in più** (prima il fax era all'89%).

**2. PDF/A con livelli e immagini JPEG 2000: niente più pagine in immagine.**
- **JPEG 2000**: l'immagine viene decodificata e ricodificata in JPEG alla stessa risoluzione; cambia formato solo lei. Differenza d'aspetto: 0,1%.
- **Livelli in PDF/A-2b**: si conservano, con la configurazione sistemata come vuole la norma (nome, niente «AS», tutti i livelli nell'ordine). Un livello nascosto resta nascosto.
- **Livelli in PDF/A-1b** (dove sono vietati): il contenuto dei livelli visibili resta. Quello dei livelli nascosti **si toglie dal file**: non diventa visibile e non resta nemmeno nascosto dentro.
- Restano rifatte come immagine solo le pagine con trasparenze in PDF/A-1b, perché la norma lo impone (e lo strumento propone il 2b).
- Sui file di prova, i file con pagine in immagine scendono:
  - in PDF/A-1b, da 5 a **3**, tutti per trasparenze;
  - in PDF/A-2b, da 2 a **0**.
- **veraPDF: 90 file prodotti su 90 conformi.**

**3. Oscura: le scritte piccole nelle foto.**
- Su una foto (pagina che non ha l'aspetto di un foglio) si cercano le «righe di caratteri»: segni d'inchiostro di altezza simile, allineati e vicini, su uno sfondo uniforme, come targhe, cartelli e didascalie.
- Solo quei ritagli vengono letti ad alta risoluzione. Il rumore e le forme della foto non hanno né l'allineamento né lo sfondo uniforme.
- Sulle foto si fanno ora due letture complementari, perché la preparazione dell'immagine pensata per i fogli su una foto può perdere una riga.
- Una sequenza nel formato delle targhe, da sola sulla sua riga e in una pagina con pochissimo testo, è riconosciuta come targa anche senza la parola «targa» accanto.
- Nuovo banco con tre foto inventate: targa **trovata**, nome e telefono nella didascalia **trovati**, foto senza scritte **senza falsi allarmi**. Le 40 foto di rumore restano veloci (8 pagine: ~10 s, come prima).

**4. Firme: la revoca, quando il file la contiene.**
- **Il controllo online non è possibile da una pagina web.** Ho verificato i servizi di revoca dei certificatori italiani dell'elenco AgID:
  - quasi tutti sono su http, che una pagina https non può chiamare;
  - nessuno, nemmeno quelli su https, dà il permesso CORS.
  Farlo passare da un server vorrebbe dire mandare fuori dal dispositivo i dati del certificato, quindi non lo faccio.
- **Senza rete**: molte firme «a lungo termine» contengono già la risposta del certificatore (OCSP) o la lista dei certificati revocati (CRL) del momento della firma. Ora vengono lette ovunque si trovino:
  - nella busta CMS;
  - negli attributi Adobe e CAdES-XL;
  - nel DSS del PDF (PAdES-LTV).
- Ogni informazione viene verificata sul dispositivo: deve essere firmata dal certificatore, o da un suo incaricato autorizzato a rispondere sulla revoca, e deve riguardare proprio quel certificato.
- Esiti:
  - «Certificato non revocato al momento della firma»;
  - oppure firma **non valida**, se il certificato era stato revocato prima della firma (con la data);
  - se il certificato è stato revocato dopo la firma, è segnalato, ma la firma resta valida.
- Nuove prove nel test delle firme: OCSP incluso, CRL con certificato revocato, PAdES con DSS, risposta OCSP manomessa (non viene creduta).

**5. Velocità dell'OCR sulle scansioni: misurata, nessun cambiamento.**
- Per pagina, con 4 pagine lavorate insieme:

  | Fase | Tempo |
  |---|---|
  | disegno | 0,4 s |
  | preparazione | 0,85 s |
  | analisi dell'impaginazione (soprattutto la correzione della curvatura) | 1,2 s |
  | lettura | 2,1 s |
  | riletture | 0,5 s |

- Ho provato a far partire la lettura insieme all'analisi. Su più pagine non cambia nulla, perché i processori sono già pieni; su una pagina sola, in un caso, è più lenta. L'ho tolta: non dava un miglioramento oggettivo.
- Usare il modello OCR «veloce» al posto di quello accurato peggiorerebbe la lettura, quindi non l'ho fatto.

### Lo stress test e la suite, rifatti da capo

| Aspetto | Esito |
|---|---|
| Robustezza: 518 prove sui file ostili | 0 errori sfuggiti, 0 «errore imprevisto», **317 risultati** (+3: la pagina di 5 m ora va anche in Word, OCR ed Excel) |
| Integrità dei file prodotti | **1504 validi su 1504** |
| PDF/A con veraPDF | 17 su 17 nello stress test; **90 su 90** su tutti i file di prova (1b e 2b) |
| Privacy (Oscura) | nessun dato rimasto; scritte piccole nelle foto trovate |
| Firme | falsa, manomessa e modificata riconosciute; revoca letta dal file quando c'è |
| Lettura delle scansioni (parole ritrovate) | OCR 100%; **Word 100%** (prima 89–100%); **Excel 100%** (prima 98–100%) |
| Accessibilità (WCAG AA automatica, chiaro e scuro) | **76 su 76** |
| Telefono | 24 su 24, niente che esce dallo schermo |
| Memoria con uso ripetuto | stabile, 38 MB per 12 giri |
| Annullamento (lavori su 1000 pagine e su 186 MB di foto) | pagina libera in 0,3–2,6 s |
| Velocità, 1000 pagine | Word 11,4 s · Excel 6,4 s · OCR 12,2 s · PDF/A 5,6 s |

**Suite completa: tutto verde (18 gruppi).** Comprende i casi nuovi del banco degli strumenti (PDF/A con livelli e JPEG 2000, Oscura sulle foto con scritte piccole) e le quattro prove nuove sulla revoca. File: 8,22 MB.

La prova di annullamento dell'OCR ora usa un lavoro lungo (1000 pagine): con una pagina sola il lavoro finiva prima che il test riuscisse a premere «Annulla».

### Che cosa resta

1. **Revoca online**: dal browser non si può fare, per come sono fatti i servizi dei certificatori. Si controlla quando il file contiene le informazioni di revoca, come nelle firme «a lungo termine».
2. **Trasparenze in PDF/A-1b**: la norma le vieta, quindi quelle pagine diventano immagine. Lo strumento propone PDF/A-2b, che le ammette.
3. **OCR delle scansioni**: 1,8 s a pagina con 4 processori. Il resto del tempo è la lettura vera e propria, con il modello accurato.
4. **Pagine senza tag**: unendo un file che non ha tag, le sue pagine restano senza tag. Inventarli sarebbe peggio.
