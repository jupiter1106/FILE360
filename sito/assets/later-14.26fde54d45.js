const AnInfo = (() => {
  // [come si calcola, che cosa dice]
  const T = {
    // —— sintesi ——
    'ricavi': ['Ricavi delle vendite e delle prestazioni (voce A1 del conto economico), con la variazione sull’anno prima.', 'Misura quanto l’azienda vende: è la base di quasi tutti gli altri indicatori.'],
    'ebitda': ['Ricavi e altri proventi meno costi di materie, servizi, godimento di beni, personale e oneri diversi (prima di ammortamenti, accantonamenti, interessi e imposte).', 'È il margine prodotto dall’attività caratteristica: dice se il «mestiere» dell’azienda guadagna, a prescindere da investimenti, debiti e tasse.'],
    'utile netto': ['Il risultato dell’esercizio, l’ultima riga del conto economico (dopo interessi e imposte).', 'È ciò che resta ai soci: può essere distribuito o lasciato in azienda per rafforzarla.'],
    'posizione finanziaria netta': ['Debiti verso banche, altri finanziatori e soci per finanziamenti, meno la liquidità. Sotto è espressa in volte l’EBITDA.', 'Dice quanto debito finanziario resta se si usasse tutta la cassa. Negativa vuol dire più cassa che debiti; in anni di EBITDA indica quanto ci vorrebbe a ripagarla.'],
    'patrimonio netto': ['Capitale, riserve e utili non distribuiti (voce A del passivo). Sotto, la quota sul totale dell’attivo.', 'Sono i mezzi dei soci: più è alto rispetto all’attivo, più l’azienda regge da sola, senza dipendere dai debiti.'],
    'flusso di cassa operativo': ['Utile più ammortamenti e accantonamenti, corretto per le variazioni di crediti, magazzino e debiti verso fornitori (o preso dal rendiconto finanziario, se c’è).', 'È la cassa che l’attività ha davvero generato nell’anno: un utile senza cassa può nascondere crediti che non si incassano o magazzino che cresce.'],
    'punteggio dell’azienda': ['Media pesata di nove aree (redditività e solidità pesano di più), ognuna da 0 a 100 con curve continue; un tetto quando si sommano segnali di crisi.', 'Un colpo d’occhio sullo stato di salute complessivo: utile per confrontare anni o aziende, non sostituisce la lettura delle singole voci.'],
    'crescita dei ricavi': ['Crescita media annua dei ricavi negli esercizi caricati, più quanto spesso sono cresciuti da un anno all’altro.', 'Premia una crescita costante; con un solo anno il dato è meno informativo.'],
    'crescita dell’ebitda': ['Crescita media annua dell’EBITDA negli esercizi caricati (se negativo in qualche anno, il punteggio scende).', 'Dice se, oltre a vendere di più, l’azienda guadagna di più.'],
    'redditività': ['Margine EBITDA, ROS (EBIT su ricavi) e ROI (EBIT sul capitale investito), pesati insieme.', 'Quanto rende ogni euro venduto e ogni euro investito nell’attività.'],
    'efficienza operativa': ['Peso del personale sui ricavi e rotazione dell’attivo (ricavi diviso totale attivo).', 'Dice quanto bene l’azienda usa persone e beni per produrre ricavi.'],
    'capitale circolante': ['Giorni medi di incasso, di pagamento e ciclo di cassa.', 'Più il ciclo è corto, meno cassa resta ferma in crediti e magazzino.'],
    'generazione di cassa': ['Flusso di cassa libero (cassa operativa meno investimenti) in rapporto ai ricavi.', 'La capacità di produrre cassa vera, quella che serve per pagare debiti e soci.'],
    'solidità finanziaria': ['Debito netto su EBITDA, copertura degli interessi, patrimonio sull’attivo e un indicatore di stabilità (Altman), pesati insieme.', 'Dice se l’azienda regge i suoi debiti e quanto è esposta a un anno difficile.'],
    'dimensione e storia': ['Dimensione dei ricavi, numero di esercizi disponibili e numero di dipendenti.', 'Le aziende più grandi e con più storia sono in genere più stabili e più facili da valutare.'],
    'qualità dei dati': ['Esito dei controlli di coerenza, anni disponibili e quadratura tra attivo e passivo.', 'Quanto ci si può fidare dei numeri da cui parte tutta l’analisi.'],
    'quanto vale': ['Combina più metodi di stima ricavati dal bilancio (flussi di cassa attesi, confronto con aziende simili, patrimonio) in un unico valore del 100% del capitale.', 'Un ordine di grandezza del valore dell’azienda per chi la possiede: non è una perizia e non tiene conto di ciò che il bilancio non dice.'],
    'ricavi, ebitda e margine': ['Barre: ricavi ed EBITDA di ogni esercizio. Linea: margine EBITDA (EBITDA diviso ricavi).', 'Si vede a colpo d’occhio se crescono le vendite, i guadagni o entrambi.'],
    'cosa emerge dai numeri': ['Combinazioni di variazioni tra un anno e l’altro e controlli di coerenza tra le voci.', 'Segnala ciò che merita un approfondimento, in positivo o in negativo.'],
    'che cosa ha pesato di più': ['Le voci che hanno fatto cambiare di più l’utile rispetto all’anno prima (o, con un solo anno, la cassa o i costi), dalla più importante.', 'Il riassunto della diagnosi: dove guardare per primo.'],
    'liquidità': ['Rapporti tra le attività che diventano cassa entro l’anno e i debiti da pagare entro l’anno.', 'Dicono se l’azienda riesce a pagare i conti dei prossimi mesi.'],
    'solidità': ['Rapporti tra debiti, patrimonio, margini e interessi.', 'Dicono quanto l’azienda dipende dal debito e se riesce a sostenerlo.'],
    'circolante': ['Giorni di incasso, di pagamento e di magazzino, calcolati dai saldi di fine anno.', 'Dicono quanta cassa resta ferma nel ciclo di acquisti e vendite.'],
    'rendiconto finanziario': ['Ricostruito con il metodo indiretto (principio OIC 10) confrontando due stati patrimoniali consecutivi e il conto economico.', 'Spiega perché la cassa è aumentata o diminuita: gestione, investimenti, finanziamenti.'],
    'confronto con il rendiconto depositato': ['I flussi del rendiconto finanziario depositato accanto a quelli ricostruiti qui.', 'Se sono vicini, la ricostruzione è affidabile; differenze grandi indicano voci particolari (fusioni, rivalutazioni).'],
    'mezzi propri': ['Variazione del patrimonio netto non spiegata dall’utile dell’anno.', 'Versamenti dei soci (entrate) o utili distribuiti (uscite).'],
    // —— stato patrimoniale finanziario ——
    'liquidità immediate': ['Cassa e depositi bancari, più titoli che si vendono subito.', 'Il denaro disponibile da subito.'],
    'liquidità differite': ['Crediti incassabili entro l’anno e ratei e risconti attivi.', 'Il denaro che dovrebbe entrare nei prossimi mesi.'],
    'disponibilità (magazzino)': ['Rimanenze di materie, semilavorati, prodotti e merci.', 'Valore fermo in magazzino: diventa cassa solo quando si vende.'],
    'attivo corrente': ['Liquidità immediate, liquidità differite e magazzino.', 'Tutto ciò che torna in cassa entro un anno.'],
    'attivo immobilizzato': ['Immobilizzazioni immateriali, materiali e finanziarie, più i crediti oltre l’anno.', 'Gli investimenti durevoli: tornano in cassa lentamente, con l’uso negli anni.'],
    'totale impieghi': ['Somma di attivo corrente e immobilizzato (uguale al totale attivo).', 'Tutto ciò in cui l’azienda ha investito.'],
    'passività correnti': ['Debiti da pagare entro l’anno.', 'Gli impegni a breve: vanno confrontati con l’attivo corrente.'],
    'passività consolidate': ['Debiti oltre l’anno, TFR e fondi per rischi e oneri.', 'Fonti a lungo termine: possono finanziare gli investimenti durevoli.'],
    'totale fonti': ['Passività correnti, passività consolidate e patrimonio netto (uguale al totale passivo).', 'Da dove vengono i soldi con cui sono finanziati gli impieghi.'],
    'margine di tesoreria': ['Liquidità immediate e differite meno passività correnti.', 'Positivo: i debiti a breve si pagano senza dover vendere il magazzino.'],
    'capitale circolante netto': ['Attivo corrente meno passività correnti.', 'Positivo: le attività a breve coprono i debiti a breve, c’è un margine di sicurezza.'],
    'margine di struttura primario': ['Patrimonio netto meno attivo immobilizzato.', 'Positivo: i soci finanziano da soli tutti gli investimenti durevoli.'],
    'margine di struttura secondario': ['Patrimonio netto e passività consolidate meno attivo immobilizzato.', 'Positivo: gli investimenti durevoli sono coperti da fonti durevoli, come dovrebbe essere.'],
    // —— funzionale ——
    'crediti verso clienti': ['Crediti commerciali verso i clienti (voce C.II.1).', 'Vendite già fatte ma non ancora incassate.'],
    'altri crediti': ['Crediti tributari, verso altri e imposte anticipate.', 'Somme da ricevere che non vengono dalle vendite.'],
    'rimanenze': ['Magazzino di materie, prodotti e merci (voce C.I).', 'Valore fermo in attesa di essere venduto o usato.'],
    'ratei e risconti attivi': ['Costi pagati in anticipo e ricavi maturati ma non ancora fatturati.', 'Aggiustamenti di competenza: di solito piccoli.'],
    'debiti verso fornitori': ['Debiti commerciali verso i fornitori (voce D.7), sottratti nel capitale operativo.', 'Acquisti non ancora pagati: finanziano l’attività senza interessi.'],
    'altri debiti operativi': ['Debiti tributari, previdenziali, verso dipendenti e altri, non finanziari.', 'Impegni dell’attività che riducono il capitale da finanziare.'],
    'ratei e risconti passivi': ['Ricavi incassati in anticipo e costi maturati non ancora pagati.', 'Aggiustamenti di competenza dal lato dei debiti.'],
    'capitale circolante netto operativo (ccno)': ['Crediti verso clienti, altri crediti, rimanenze e ratei attivi meno debiti verso fornitori, altri debiti operativi e ratei passivi.', 'La cassa assorbita dal ciclo di acquisti, produzione e vendite: se cresce più delle vendite, l’attività «mangia» cassa.'],
    'immobilizzazioni immateriali e materiali': ['Brevetti, software, avviamento, impianti, macchinari, immobili, al netto degli ammortamenti.', 'I beni durevoli con cui l’azienda lavora.'],
    'tfr e fondi': ['Trattamento di fine rapporto e fondi per rischi e oneri, sottratti nell’attivo fisso.', 'Impegni a lungo termine legati all’attività.'],
    'attivo fisso netto operativo (afno)': ['Immobilizzazioni immateriali e materiali meno TFR e fondi.', 'Il capitale durevole investito nell’attività caratteristica.'],
    'capitale investito netto operativo (cino)': ['Capitale circolante netto operativo più attivo fisso netto operativo.', 'Quanto capitale serve per far girare l’attività: è la base del ROI.'],
    'attività non operative (finanziarie, in eccesso)': ['Partecipazioni, titoli e attività finanziarie non legate all’attività caratteristica.', 'Valore che non serve al lavoro di tutti i giorni.'],
    'posizione finanziaria netta (debiti finanziari e soci − liquidità)': ['Debiti verso banche, altri finanziatori e soci, meno la liquidità.', 'La parte del capitale investito finanziata con debito.'],
    // —— conto economico a valore aggiunto ——
    'ricavi delle vendite e delle prestazioni': ['Voce A1 del conto economico.', 'Le vendite dell’anno.'],
    'variazione delle rimanenze di prodotti e lavori': ['Differenza tra magazzino prodotti di fine e di inizio anno (voci A2 e A3).', 'Produzione fatta ma non ancora venduta (se positiva) o vendite di produzione degli anni prima (se negativa).'],
    'incrementi di immobilizzazioni per lavori interni': ['Voce A4: costi di lavori fatti in casa per costruire beni durevoli.', 'Costi spostati tra gli investimenti: non sono vendite.'],
    'altri ricavi e proventi': ['Voce A5: contributi, affitti attivi, rimborsi, plusvalenze ordinarie.', 'Entrate fuori dalle vendite: utile sapere se sono ricorrenti.'],
    'valore della produzione': ['Somma delle voci A1–A5.', 'Tutto ciò che l’azienda ha prodotto nell’anno, venduto o no.'],
    'consumi di materie (acquisti e variazione delle scorte)': ['Acquisti di materie e merci (B6) corretti per la variazione del loro magazzino (B11).', 'Il costo di ciò che è stato effettivamente usato o rivenduto.'],
    'servizi e godimento di beni di terzi': ['Voci B7 e B8: consulenze, utenze, trasporti, affitti, noleggi, leasing.', 'I costi esterni oltre alle materie.'],
    'oneri diversi di gestione': ['Voce B14: imposte non sul reddito, quote associative, perdite su crediti e altri costi minori.', 'Costi residui, di solito piccoli.'],
    'valore aggiunto': ['Valore della produzione meno consumi, servizi, godimento di beni e oneri diversi.', 'La ricchezza creata dall’azienda con le sue risorse: serve a pagare personale, investimenti, finanziatori, Stato e soci.'],
    'costo del personale': ['Voce B9: stipendi, contributi, TFR e altri costi del personale.', 'Il costo delle persone: va letto rispetto al valore aggiunto che producono.'],
    'margine operativo lordo (ebitda)': ['Valore aggiunto meno costo del personale.', 'Il guadagno della gestione prima di ammortamenti, accantonamenti, interessi e imposte.'],
    'ammortamenti e svalutazioni': ['Voce B10: quota annua del costo dei beni durevoli e svalutazioni di crediti e beni.', 'Il «consumo» degli investimenti fatti negli anni: un costo vero, anche se non esce cassa nell’anno.'],
    'accantonamenti': ['Voci B12 e B13: somme messe da parte per rischi e oneri futuri.', 'Prudenza per spese probabili ma non ancora certe.'],
    'risultato operativo (ebit)': ['EBITDA meno ammortamenti, svalutazioni e accantonamenti (differenza A − B).', 'Il guadagno dell’attività caratteristica dopo il consumo dei beni.'],
    'gestione finanziaria': ['Proventi finanziari meno interessi e oneri finanziari, più utili e perdite su cambi (voce C).', 'Il costo del debito al netto dei rendimenti finanziari.'],
    'rettifiche di attività finanziarie': ['Rivalutazioni meno svalutazioni di partecipazioni e titoli (voce D).', 'Variazioni di valore di investimenti finanziari, spesso non ricorrenti.'],
    'risultato prima delle imposte': ['EBIT più gestione finanziaria e rettifiche.', 'Il guadagno prima delle tasse sul reddito.'],
    'imposte': ['Voce 20: imposte sul reddito dell’esercizio (correnti, differite e anticipate).', 'La quota del risultato che va allo Stato.'],
    'utile (perdita) dell’esercizio': ['Risultato prima delle imposte meno imposte.', 'Ciò che resta ai soci.'],
    // —— indici ——
    'roe (utile / patrimonio netto)': ['Utile netto diviso patrimonio netto.', 'Quanto rende il capitale dei soci: va confrontato con quanto renderebbe un investimento alternativo con rischio simile.'],
    'roi (ebit / capitale investito operativo)': ['EBIT diviso capitale investito netto operativo.', 'Quanto rende l’attività caratteristica, a prescindere da come è finanziata.'],
    'ros (ebit / ricavi)': ['EBIT diviso ricavi.', 'Quanto resta di reddito operativo per ogni euro venduto.'],
    'margine ebitda (ebitda / ricavi)': ['EBITDA diviso ricavi.', 'La redditività lorda delle vendite: dipende molto dal settore.'],
    'roa (ebit / totale attivo)': ['EBIT diviso totale attivo.', 'Quanto rendono tutte le attività, operative e non.'],
    'rotazione dell’attivo (ricavi / attivo)': ['Ricavi diviso totale attivo.', 'Quante volte l’attivo si trasforma in vendite in un anno: più è alto, meno capitale serve per vendere.'],
    'valore aggiunto su valore della produzione': ['Valore aggiunto diviso valore della produzione.', 'Quanta parte della produzione è lavoro dell’azienda e non acquisti da fuori.'],
    'costo del debito (oneri / debiti finanziari medi)': ['Interessi e oneri finanziari divisi per la media dei debiti finanziari di inizio e fine anno.', 'Il tasso medio pagato: se il ROI è più alto, il debito fa crescere il rendimento dei soci (leva positiva).'],
    'indice di liquidità corrente (current ratio)': ['Attivo corrente diviso passività correnti.', 'Le risorse a breve per ogni euro di debiti a breve: sopra 1 coprono i debiti.'],
    'indice di liquidità secca (quick ratio)': ['Liquidità immediate e differite divise per le passività correnti (senza il magazzino).', 'Come il precedente ma più prudente: il magazzino non sempre si vende in fretta.'],
    'liquidità immediata (cash ratio)': ['Liquidità immediate divise per le passività correnti.', 'Quanti debiti a breve si pagherebbero con la sola cassa.'],
    'debiti finanziari / patrimonio netto': ['Debiti finanziari divisi per patrimonio netto.', 'Quanto debito per ogni euro dei soci: più è alto, più l’azienda dipende dai finanziatori.'],
    'patrimonio netto / totale attivo': ['Patrimonio netto diviso totale attivo.', 'Autonomia finanziaria: la parte degli investimenti pagata dai soci.'],
    'leva (totale attivo / patrimonio netto)': ['Totale attivo diviso patrimonio netto.', 'Quante volte gli investimenti superano i mezzi propri.'],
    'copertura degli interessi (ebit / oneri finanziari)': ['EBIT diviso interessi e oneri finanziari.', 'Quante volte il reddito operativo paga gli interessi: sotto 1 il reddito non basta.'],
    'pfn / ebitda': ['Posizione finanziaria netta divisa per EBITDA.', 'In quanti anni di margine lordo si ripagherebbe il debito netto.'],
    'pfn / patrimonio netto': ['Posizione finanziaria netta divisa per patrimonio netto.', 'Il debito netto rispetto ai mezzi dei soci.'],
    'copertura delle immobilizzazioni con fonti durevoli': ['Patrimonio netto e passività consolidate divisi per attivo immobilizzato.', 'Sopra 1 gli investimenti durevoli sono pagati con fonti durevoli: equilibrio sano.'],
    'oneri finanziari / ricavi': ['Interessi e oneri finanziari divisi per ricavi.', 'Quanto del fatturato se ne va in interessi.'],
    'giorni medi di incasso dai clienti (dso)': ['Crediti verso clienti divisi per ricavi (con l’IVA, se la casella è attiva) per 365.', 'In quanti giorni, in media, i clienti pagano.'],
    'giorni medi di pagamento ai fornitori (dpo)': ['Debiti verso fornitori divisi per acquisti, servizi e godimento di beni (con l’IVA) per 365.', 'In quanti giorni, in media, l’azienda paga i fornitori.'],
    'giorni di scorta (dio)': ['Rimanenze divise per consumi di materie per 365.', 'Quanti giorni di lavoro sono fermi in magazzino.'],
    'ciclo di cassa (dso + dio − dpo)': ['Giorni di incasso più giorni di scorta meno giorni di pagamento.', 'Per quanti giorni l’azienda deve anticipare la cassa del proprio ciclo: più è lungo, più serve capitale o debito.'],
    // —— flussi ——
    'utile (perdita) dell’esercizio_cf': ['Il risultato dell’esercizio, punto di partenza del metodo indiretto.', 'Il guadagno contabile, che poi si trasforma in cassa.'],
    '+ ammortamenti e svalutazioni delle immobilizzazioni': ['Si sommano perché sono costi che non escono di cassa.', 'Riportano l’utile verso la cassa vera.'],
    '+ variazione di tfr e fondi': ['Aumento (o diminuzione) di TFR e fondi rispetto all’anno prima.', 'Costi registrati ma non ancora pagati (o pagati ora).'],
    'flusso prima delle variazioni del circolante': ['Utile più ammortamenti e variazione di TFR e fondi.', 'La cassa prodotta dalla gestione se crediti, magazzino e debiti non fossero cambiati.'],
    '− aumento (+ diminuzione) dei crediti verso clienti': ['Differenza dei crediti verso clienti rispetto all’anno prima, con il segno invertito.', 'Se i crediti crescono, una parte delle vendite non è ancora entrata in cassa.'],
    '− aumento degli altri crediti': ['Differenza degli altri crediti, con il segno invertito.', 'Somme da ricevere che trattengono cassa.'],
    '− aumento (+ diminuzione) delle rimanenze': ['Differenza del magazzino, con il segno invertito.', 'Comprare o produrre per il magazzino assorbe cassa.'],
    '+ aumento (− diminuzione) dei debiti verso fornitori': ['Differenza dei debiti verso fornitori rispetto all’anno prima.', 'Pagare più tardi i fornitori lascia cassa in azienda (e viceversa).'],
    '+ variazione degli altri debiti operativi': ['Differenza di debiti tributari, previdenziali e diversi.', 'Impegni non ancora pagati che lasciano cassa in azienda.'],
    '+ variazione dei ratei e risconti': ['Differenza netta di ratei e risconti attivi e passivi.', 'Aggiustamenti di competenza, di solito piccoli.'],
    'a) flusso della gestione operativa': ['Flusso prima del circolante più tutte le variazioni del circolante.', 'La cassa generata (o consumata) dall’attività dell’anno.'],
    'investimenti in immobilizzazioni immateriali': ['Variazione delle immobilizzazioni immateriali più gli ammortamenti dell’anno.', 'Quanto è stato speso in software, brevetti, marchi e simili.'],
    'investimenti in immobilizzazioni materiali': ['Variazione delle immobilizzazioni materiali più gli ammortamenti dell’anno.', 'Quanto è stato speso in impianti, macchinari, immobili.'],
    'investimenti in immobilizzazioni finanziarie': ['Variazione di partecipazioni e crediti finanziari durevoli.', 'Investimenti in altre società o prestiti a lungo.'],
    'attività finanziarie a breve e altre': ['Variazione di titoli e attività finanziarie non durevoli.', 'Movimenti di investimenti di liquidità.'],
    'b) flusso degli investimenti': ['Somma di tutti gli investimenti (negativa se si è investito).', 'La cassa usata per prepararsi al futuro.'],
    'variazione dei debiti finanziari (anche verso soci)': ['Differenza di debiti verso banche, altri finanziatori e soci.', 'Positiva: nuovi prestiti; negativa: rimborsi.'],
    'mezzi propri: apporti (+) e dividendi (−)': ['Variazione del patrimonio netto non spiegata dall’utile dell’anno.', 'Versamenti dei soci (entrate) o utili distribuiti (uscite).'],
    'c) flusso dei finanziamenti': ['Variazione dei debiti finanziari più apporti e dividendi.', 'La cassa arrivata da finanziatori e soci, o restituita a loro.'],
    'variazione delle disponibilità liquide (a + b + c)': ['Somma dei tre flussi.', 'Di quanto è cambiata la cassa nell’anno secondo il rendiconto.'],
    'variazione da stato patrimoniale': ['Liquidità di fine anno meno liquidità di inizio anno.', 'Controllo: deve coincidere con la riga sopra.'],
    'flusso di cassa libero operativo (a − investimenti)': ['Flusso operativo meno investimenti in immobilizzazioni.', 'La cassa davvero libera per pagare debiti e soci dopo aver mantenuto l’attività.'],
    // —— diagnosi ——
    'in breve': ['Riassunto delle tre letture sotto.', 'Il quadro in due frasi.'],
    'che cosa ha cambiato il risultato': ['La variazione dell’utile scomposta voce per voce: le vendite valgono la differenza di produzione per il margine dell’anno prima; ogni costo vale la differenza tra quanto è costato e quanto sarebbe costato crescendo come le vendite.', 'Le voci sommate danno la variazione dell’utile: la barra più lunga è ciò che ha pesato di più. Si confronta l’azienda con sé stessa, non con valori ideali.'],
    'da dove arriva e dove va la cassa': ['Le voci del rendiconto finanziario dell’ultimo anno, ordinate per importo.', 'Le voci sommate danno la variazione della liquidità: a destra ciò che ha portato cassa, a sinistra ciò che l’ha assorbita.'],
    'su cosa si spendono i ricavi': ['Ogni voce di costo dell’ultimo anno, ordinata per importo; la barra è proporzionale alla voce più grande.', 'Mostra dove va il denaro incassato: ogni attività ha la sua struttura di costi.'],
    // —— dati ——
    'affidabilità del risultato': ['Media pesata di: come è stato letto il dato (XBRL, PDF, scansione), accordo tra due letture, quadrature, completezza e convergenza tra i metodi di stima.', 'Quanto ci si può fidare dell’analisi: con un PDF scansionato o un solo anno è più bassa.'],
    'controlli di coerenza': ['Verifiche contabili: attivo uguale a passivo, totali uguali alla somma delle voci, utile coerente tra stato patrimoniale e conto economico.', 'Se un controllo non torna, probabilmente un numero è stato letto male: si corregge in questa scheda.'],
    'lettura del dato': ['100 se il bilancio è in XBRL, 85 se è un PDF con il testo, 70 se è una scansione letta con l’OCR.', 'Il formato XBRL è il dato ufficiale; da un PDF o da una scansione un numero può essere letto male.'],
    'doppia lettura in accordo': ['Quanto concordano due letture indipendenti dello stesso bilancio (per esempio esercizio corrente in un file e precedente in un altro).', 'Se due fonti danno lo stesso numero, il numero è quasi certamente giusto.'],
    'quadrature contabili': ['Il punteggio dei controlli di coerenza (totali, attivo e passivo, utile).', 'Se i conti non quadrano, qualche voce va corretta.'],
    'completezza del dato': ['Più alta con più esercizi e con ricavi ed EBITDA leggibili.', 'Con un solo anno non si vedono trend né flussi di cassa.'],
    'convergenza tra i metodi': ['Quanto sono vicini tra loro i valori stimati con metodi diversi.', 'Metodi d’accordo danno una stima più solida.'],
    'bilancio letto': ['Verifica che siano stati trovati stato patrimoniale e conto economico con gli importi.', 'Senza i prospetti non c’è analisi.'],
    'differenza a − b coerente con le voci': ['Valore della produzione meno costi della produzione confrontato con la differenza A − B scritta in bilancio.', 'Se non torna, una voce di costo o di ricavo è stata letta male.'],
    'ebitda non superiore al valore della produzione': ['Controlla che il margine lordo non superi ciò che si è prodotto.', 'Un EBITDA più alto della produzione indica un errore di lettura.'],
    'le voci del passivo sommano al totale': ['Somma di patrimonio netto, fondi, TFR, debiti e ratei confrontata con il totale passivo.', 'Se non torna, manca o è sbagliata una voce del passivo.'],
    'le voci dell’attivo sommano al totale': ['Somma di immobilizzazioni, circolante e ratei confrontata con il totale attivo.', 'Se non torna, manca o è sbagliata una voce dell’attivo.'],
    'margine ebitda plausibile': ['Controlla che il margine EBITDA sia in un intervallo realistico.', 'Valori estremi possono essere veri, ma spesso indicano un numero letto male.'],
    'ponte del patrimonio netto (pn iniziale + utile)': ['Patrimonio dell’anno prima più utile dell’anno, confrontato con il patrimonio di fine anno.', 'Differenze sono normali se ci sono dividendi o versamenti dei soci; altrimenti vanno capite.'],
    'ricavi presenti': ['Verifica che i ricavi delle vendite siano stati letti.', 'Quasi tutti gli indici partono dai ricavi.'],
    'totale attivo = totale passivo': ['Confronto tra i due totali dello stato patrimoniale.', 'Devono essere uguali: se non lo sono, qualcosa è stato letto male.'],
    'utile del conto economico = utile nel patrimonio netto': ['L’utile dell’ultima riga del conto economico confrontato con quello scritto nel patrimonio netto.', 'Devono coincidere: è un controllo di coerenza tra i due prospetti.'],
    'variazione dei ricavi plausibile': ['Controlla che i ricavi non cambino in modo estremo tra un anno e l’altro.', 'Un salto enorme può essere vero (acquisizioni, crisi) ma va verificato.'],
    'i dati dell’analisi (modificabili)': ['Le voci lette dal bilancio, con le correzioni fatte qui.', 'Tutta l’analisi parte da questi numeri: correggerli la ricalcola subito.'],
  };
  const FX = {
    ricavi: 'Variazione del valore della produzione per il margine (valore aggiunto su produzione) dell’anno prima.',
    consumi: 'Costo di quest’anno meno quello che si sarebbe speso se fosse cresciuto come le vendite.',
    servizi: 'Costo di quest’anno meno quello che si sarebbe speso se fosse cresciuto come le vendite.',
    oneriDiversi: 'Costo di quest’anno meno quello che si sarebbe speso se fosse cresciuto come le vendite.',
    personale: 'Differenza del costo del personale rispetto all’anno prima.',
    ammortamenti: 'Differenza di ammortamenti, svalutazioni e accantonamenti rispetto all’anno prima.',
    finanza: 'Differenza della gestione finanziaria (interessi, proventi, rettifiche) rispetto all’anno prima.',
    imposte: 'Differenza delle imposte rispetto all’anno prima.',
    gestione: 'Utile più ammortamenti, svalutazioni e variazione di TFR e fondi.',
    crediti: 'Diminuzione (cassa in entrata) o aumento (cassa assorbita) dei crediti verso clienti.',
    rimanenze: 'Diminuzione o aumento del magazzino rispetto all’anno prima.',
    fornitori: 'Aumento (cassa trattenuta) o diminuzione (cassa pagata) dei debiti verso fornitori.',
    altro: 'Variazione di altri crediti, altri debiti di gestione e ratei e risconti.',
    investimenti: 'Spese per immobilizzazioni (al netto delle cessioni).',
    debiti: 'Nuovi finanziamenti meno rimborsi.',
    soci: 'Versamenti dei soci meno utili o riserve distribuiti.',
  };
  const norm = s => String(s || '').toLowerCase().replace(/['’]/g, '’').replace(/\s+/g, ' ').replace(/\s+\d{4}$/, '').replace(/\s*\(\d{4}.*\)$/, '').replace(/:\s.*$/, '').replace(/\s*\((?:metodo|principio)[^)]*\)$/, '').trim();
  function get(label, ctx) {
    const k = norm(label);
    if (ctx && T[k + '_' + ctx]) return T[k + '_' + ctx];
    if (T[k]) return T[k];
    const k2 = k.replace(/^[−+–-]\s*/, '');
    if (T[k2]) return T[k2];
    for (const key of Object.keys(T)) if (k.startsWith(key + ' ') || k.startsWith(key + ' (')) return T[key];
    return null;
  }
  // voce letta dal bilancio (schema civilistico, dati): spiegazione comune
  const READ = ['Importo letto dal bilancio depositato (schema degli articoli 2424 e 2425 del Codice civile), con le eventuali correzioni fatte nella scheda «Dati e controlli».', 'È il dato di partenza: tutte le riclassificazioni e gli indici si calcolano da qui.'];
  return { get, FX, READ };
})();

/* =====================================================================
   «Analisi di bilancio»: uno o più bilanci (XBRL, PDF, anche scansionati) → riclassificazioni, indici,
   flussi di cassa, valore stimato e diagnosi, con rapporto in PDF o Word e foglio Excel.
   I dati si possono correggere: tutto si ricalcola subito e resta
   ricordato per quell'azienda in questo browser.
   ===================================================================== */
const AnUI = (() => {
  const { fin, eur, pct, fmt1 } = BilAnalisi.util;
  const n0 = v => fin(v) ? (Math.round(v) || 0).toLocaleString('it-IT').replace('-', '−') : '—';
  const x2 = v => fin(v) ? (Math.round(v * 100) / 100 || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−') : '—';
  const pc = (v, d = 1) => fin(v) ? pct(v, d).replace('-', '−') : '—';
  const x1 = v => fin(v) ? fmt1(v).replace('-', '−') : '—';
  const xv = v => fin(v) ? x1(v) + '×' : '—';
  const gg = v => fin(v) ? Math.round(v) + ' gg' : '—';
  const mon = v => { if (!fin(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e6 ? s + (a / 1e6).toLocaleString('it-IT', { maximumFractionDigits: a >= 1e7 ? 1 : 2 }) + ' mln €' : a >= 1e4 ? s + Math.round(a / 1e3).toLocaleString('it-IT') + ' mila €' : s + Math.round(a).toLocaleString('it-IT') + ' €'; };
  const SEV = { critica: 'bad', alta: 'bad', media: 'warn', bassa: 'info', preoccupazione: 'bad', attenzione: 'warn', info: 'info' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- grafici (SVG) ---------------- */
  const svgEl = (w, hgt, inner, cls = '') => { const d = h('div', { class: 'an-chart ' + cls }); d.innerHTML = `<svg viewBox="0 0 ${w} ${hgt}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; return d; };
  function chartTrend(Rs) {
    const W = 560, H = 226, L = 46, Rr = 40, T = 22, B = 46;
    const ys = Rs.map(R => R.year), rv = Rs.map(R => R.ricavi), eb = Rs.map(R => R.ebitda), mg = Rs.map(R => R.ricavi > 0 ? R.ebitda / R.ricavi : null);
    const mx = Math.max(1, ...rv, ...eb.map(Math.abs)), mn = Math.min(0, ...eb);
    const sy = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
    const step = (W - L - Rr) / ys.length, bw = Math.min(42, step * 0.32);
    let s = '';
    for (let i = 0; i <= 4; i++) { const v = mn + (mx - mn) * i / 4, y = sy(v); s += `<line x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}" class="g"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" class="ax">${esc(mon(v).replace(' €', ''))}</text>`; }
    ys.forEach((y, i) => {
      const cx = L + step * (i + 0.5);
      s += `<rect x="${cx - bw - 2}" y="${Math.min(sy(rv[i]), sy(0))}" width="${bw}" height="${Math.abs(sy(rv[i]) - sy(0))}" rx="3" class="s1"><title>Ricavi ${y}: ${esc(eur(rv[i]))}</title></rect>`;
      s += `<rect x="${cx + 2}" y="${Math.min(sy(eb[i]), sy(0))}" width="${bw}" height="${Math.abs(sy(eb[i]) - sy(0))}" rx="3" class="s2"><title>EBITDA ${y}: ${esc(eur(eb[i]))}</title></rect>`;
      s += `<text x="${cx}" y="${H - 28}" text-anchor="middle" class="ax">${y}</text>`;
    });
    const mvals = mg.filter(fin); if (mvals.length) {
      const mM = Math.max(0.05, ...mvals.map(Math.abs)) * 1.25, my = v => T + (H - T - B) * (1 - (v + mM) / (2 * mM));
      const pts = mg.map((v, i) => fin(v) ? `${L + step * (i + 0.5)},${my(v)}` : null).filter(Boolean);
      s += `<polyline points="${pts.join(' ')}" class="ln"/>` + mg.map((v, i) => fin(v) ? `<circle cx="${L + step * (i + 0.5)}" cy="${my(v)}" r="3.5" class="dot"/><text x="${L + step * (i + 0.5)}" y="${my(v) - 8}" text-anchor="middle" class="lb">${esc(pc(v))}</text>` : '').join('');
    }
    const leg = `<g transform="translate(${L},${H - 12})"><rect width="10" height="10" rx="2" class="s1"/><text x="14" y="9" class="ax">Ricavi</text><rect x="70" width="10" height="10" rx="2" class="s2"/><text x="84" y="9" class="ax">EBITDA</text><line x1="146" x2="160" y1="5" y2="5" class="ln"/><text x="164" y="9" class="ax">margine EBITDA</text></g>`;
    return svgEl(W, H, s + leg, 'trend');
  }
  function gauge(v, label, tone) {
    const W = 180, H = 104, cx = 90, cy = 92, r = 74;
    const ang = a => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const arc = (a0, a1) => { const [x0, y0] = ang(a0), [x1_, y1] = ang(a1); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1_},${y1}`; };
    const f = Math.max(0, Math.min(1, v / 100));
    return svgEl(W, H, `<path d="${arc(0, 1)}" class="gbg"/><path d="${arc(0, Math.max(0.005, f))}" class="gfg ${tone}"/><text x="${cx}" y="${cy - 14}" text-anchor="middle" class="gv">${Math.round(v)}</text><text x="${cx}" y="${cy + 6}" text-anchor="middle" class="ax">${esc(label)}</text>`, 'gauge');
  }

  const meter = (v, tone = '') => h('span', { class: 'an-meter ' + tone }, h('span', { style: { width: Math.max(2, Math.min(100, v)) + '%' } }));

  /* ---------------- piccoli componenti ---------------- */
  const chip = (t, tone) => h('span', { class: 'an-chip ' + (tone || '') }, t);
  /* ---------------- la «i»: come si calcola e che cosa dice (al passaggio del cursore o al tocco) ---------------- */
  const tipOf = pair => pair ? h('button', { class: 'an-i', type: 'button', 'aria-label': 'Come si calcola: ' + pair[0] + ' ' + pair[1], dataset: { t1: pair[0], t2: pair[1] } }) : null;
  const info = (label, ctx, fallback) => tipOf(AnInfo.get(label, ctx) || fallback || null);
  const TipBox = (() => {
    let box = null, cur = null, pinned = false;
    const hide = () => { if (box) box.hidden = true; cur = null; pinned = false; };
    const show = el => {
      if (!box) { box = h('div', { class: 'an-tipbox', role: 'tooltip', hidden: true }); document.body.append(box); }
      cur = el;
      box.replaceChildren(h('p', {}, h('b', {}, 'Come si calcola. '), el.dataset.t1), h('p', {}, h('b', {}, 'Che cosa dice. '), el.dataset.t2));
      box.hidden = false;
      const r = el.getBoundingClientRect(), bw = Math.min(320, innerWidth - 24); box.style.width = bw + 'px';
      const bh = box.offsetHeight, x = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
      const y = r.top - bh - 8 >= 8 ? r.top - bh - 8 : r.bottom + 8;
      box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    document.addEventListener('mouseover', e => { const el = e.target.closest?.('.an-i'); if (el) { if (el !== cur) show(el); } else if (cur && !pinned) hide(); });
    document.addEventListener('focusin', e => { const el = e.target.closest?.('.an-i'); if (el) show(el); });
    document.addEventListener('focusout', e => { if (e.target.closest?.('.an-i')) hide(); });
    document.addEventListener('click', e => { const el = e.target.closest?.('.an-i'); if (el) { e.preventDefault(); if (cur === el && pinned) hide(); else { show(el); pinned = true; } } else if (pinned) hide(); });
    addEventListener('scroll', () => { if (cur) { if (cur.isConnected) show(cur); else hide(); } }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); });
    return { hide };
  })();
  const card = (title, ...kids) => h('section', { class: 'an-card' }, title ? h('h3', {}, title, info(title)) : null, ...kids);
  const note = (t, tone = '') => h('div', { class: 'an-note ' + tone }, t);
  const kpi = (label, value, sub, tone) => h('div', { class: 'an-kpi ' + (tone || '') }, h('span', { class: 'k' }, label, info(label)), h('b', {}, value), sub ? h('span', { class: 'd' }, sub) : null);
  const delta = (a, b, inv = false) => { if (!fin(a) || !fin(b) || b === 0) return null; const d = (a - b) / Math.abs(b); const up = d >= 0; return h('span', { class: 'an-delta ' + ((up !== inv) ? 'up' : 'dn') }, (up ? '▲ ' : '▼ ') + pc(Math.abs(d)) + ' sull’anno prima'); };
  function table(head, rows, { cls = '', align = [], marks = [], ctx = null, fallback = null } = {}) {
    if (align.length > 2 && align.slice(1).every(a => a === 'r')) cls += ' yr';
    // la prima colonna (la voce): con la sua «i», se c'è una spiegazione
    const labelCell = c => typeof c === 'string' && c.trim() ? (() => { const t = info(c, ctx, fallback); return t ? h('span', { class: 'an-lab' }, c, t) : c; })() : c;
    return h('div', { class: 'an-tw' }, h('table', { class: 'an-t ' + cls },
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { class: align[i] === 'r' ? 'r' : '' }, c)))),
      h('tbody', {}, rows.map((r, k) => h('tr', { class: [r._cls, marks[k]].filter(Boolean).join(' ') }, (r.cells || r).map((c, i) => h(i === 0 ? 'th' : 'td', { class: align[i] === 'r' ? 'r' : '', scope: i === 0 ? 'row' : null }, i === 0 ? labelCell(c) : c)))))));
  }
  const row = (cells, cls) => ({ cells, _cls: cls });

  /* ---------------- stato per azienda (ipotesi e correzioni, in questo browser) ---------------- */
  const KEY = 'officina.analisi';
  const loadAll = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const saveFor = (id, set) => { try { const all = loadAll(); all[id] = { params: set.params, edits: set.edits, at: Date.now() }; const ks = Object.keys(all).sort((a, b) => all[b].at - all[a].at); for (const k of ks.slice(20)) delete all[k]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { } };
  const idOf = data => data.cf || BilAnalisi.util.NORM(data.company).replace(/\W+/g, '') || null;

  /* ---------------- lettura dei file ---------------- */
  const isXbrlName = n => /\.(xbrl|xml)(\.p7m)?$/i.test(n) || /\.zip$/i.test(n);
  async function readOne(file, { status, getWorker, slot = 0 }) {
    if (isXbrlName(file.name) || /\.p7m$/i.test(file.name)) {
      try {
        const { text } = await xbrlPrepare(file);
        let D;
        try { D = XbrlKit.build(text); }
        catch (e) { if (e.needTaxonomy) { await xbrlAskTaxonomy(e); D = XbrlKit.build(text); } else throw e; }
        return { f: BilAnalisi.fromXbrl(D, file.name), fonte: 'xbrl' };
      } catch (e) { if (isXbrlName(file.name)) throw e; /* .p7m con dentro un PDF */ }
    }
    const doc = await openPdf(file);
    if (!doc) throw new Error(`Non riesco ad aprire «${file.name}».`);
    const eng = excelEngine(doc, { getWorker, status: t => status(t), parallel: 1 });
    // si leggono le pagine finché i prospetti sono completi (conto economico fino all'utile dell'esercizio)
    const Ls = [], N = Math.min(doc.numPages, 40);
    let txt = '', scans = 0, model = null;
    for (let p = 1; p <= N; p++) {
      const scan = await eng.isScan(p);
      status(`«${file.name}»: pagina ${p} di ${doc.numPages}${scan ? ' (lettura della scansione con l’OCR)' : ''}`);
      const L = await eng.layoutOf(p, { slot });
      if (scan) scans++;
      if (!L) continue;
      Ls.push(L); txt += ExcelKit.texts(L).join(' ') + '\n';
      if (/\b(nota integrativa|relazione sulla gestione)\b/i.test(ExcelKit.texts(L).slice(0, 6).join(' ')) && /conto economico/i.test(txt)) break;
      if (p >= 2 && /utile\s*\(?perdita\)?\s*(consolidat[oi]\s+)?dell.esercizio/i.test(txt.split(/conto economico/i).slice(1).join(' ')) && /conto economico/i.test(txt)) {
        model = BilancioKit.fromLayouts(Ls, { loc: 'it' });
        const ce = model?.sections.find(s => /economico/i.test(s.title));
        if (ce && ce.rows.some(r => /utile|perdita|risultato/i.test(r.label) && /esercizio/i.test(r.label) && (r.cur != null || r.prev != null))) break;
      }
    }
    model = BilancioKit.fromLayouts(Ls, { loc: 'it' });
    if (!model) throw new Error(`In «${file.name}» non trovo lo stato patrimoniale e il conto economico con gli importi in colonna.`);
    return { f: BilAnalisi.fromModel(model, file.name, txt), fonte: scans ? 'scan' : 'pdf' };
  }

  /* ---------------- pagina ---------------- */
  async function start(stage, files) {
    // le immagini (foto delle pagine) diventano un solo PDF: sono un bilancio
    const imgs = files.filter(f => isImage(f)), others = files.filter(f => !isImage(f));
    if (imgs.length) others.push(await withBusy('Preparazione delle immagini…', () => imagesToPdfFile(imgs, 'bilancio.pdf')));
    const workers = [];
    onLeave(() => workers.forEach(w => w && w.then(x => x.terminate()).catch(() => { })));
    const getWorker = (k = 0) => workers[k] ||= makeOcrWorker(new Set(['ita']), 300);
    const read = [];
    const st = { tab: 'sintesi', sub: { ricl: 'fin', cf: null }, set: { params: {}, edits: {} }, res: null, data: null, fonti: new Set(), cons: [] };

    async function addFiles(list) {
      const out = await withBusy('Lettura del bilancio…', async () => {
        const res = [];
        for (const f of list) {
          Busy.set(null, `Lettura di «${f.name}»…`);
          try { res.push(await readOne(f, { status: t => Busy.set(null, t), getWorker })); }
          catch (e) { console.error(e); toast(e.message || `«${f.name}» non è un bilancio leggibile`, 'error'); }
        }
        return res;
      });
      if (!out || !out.length) return false;
      for (const r of out) { read.push(r.f); st.fonti.add(r.fonte); if (r.f.consensus?.confidence != null) st.cons.push(r.f.consensus.confidence); }
      st.data = BilAnalisi.merge(read);
      const id = idOf(st.data), saved = id && loadAll()[id];
      if (saved && !st.restored) { st.set = { params: saved.params || {}, edits: saved.edits || {} }; st.restored = true; if (Object.keys(st.set.edits).length || Object.keys(st.set.params).length) toast('Ho ripreso le ipotesi e le correzioni che avevi fatto per questa azienda'); }
      return true;
    }
    if (!(await addFiles(others))) throw codedError('Non trovo un bilancio nei file scelti: servono lo stato patrimoniale e il conto economico con gli importi in colonna (PDF del bilancio, oppure il file XBRL).', 'CONTENT');

    const wrap = h('div', { class: 'an-wrap' });
    stage.replaceChildren(wrap);
    const fileIn = h('input', { type: 'file', multiple: true, hidden: true, accept: '.xbrl,.xml,.p7m,.zip,.pdf,application/pdf,' + IMG_ACCEPT, onchange: async () => { const l = [...fileIn.files]; fileIn.value = ''; if (await addFiles(l)) compute(); } });

    function compute() {
      try {
        const fonte = st.fonti.has('scan') ? 'scan' : st.fonti.has('pdf') ? 'pdf' : 'xbrl';
        st.res = BilRun.run(st.data, { ...st.set, fonte, consensus: st.cons.length ? Math.min(...st.cons) : null });
      } catch (e) { Errors.show(e); return; }
      const id = idOf(st.data); if (id) saveFor(id, st.set);
      draw();
    }
    // il ricalcolo parte dopo l'evento: ridisegnare mentre il campo perde il fuoco lo farebbe scattare di nuovo
    let tm = null;
    const recompute = () => { clearTimeout(tm); tm = setTimeout(compute, 0); };
    const setParam = (k, v) => { if ((v === '' || v == null) ? !(k in st.set.params) : st.set.params[k] === v) return; if (v === '' || v == null) delete st.set.params[k]; else st.set.params[k] = v; recompute(); };
    const setEdit = (y, k, v) => { const e = st.set.edits[y] ||= {}; if ((v == null ? !(k in e) : e[k] === v)) { if (!Object.keys(e).length) delete st.set.edits[y]; return; } if (v === '' || v == null) delete e[k]; else e[k] = v; if (!Object.keys(e).length) delete st.set.edits[y]; recompute(); };

    const TABS = [['sintesi', 'Sintesi'], ['ricl', 'Riclassificati'], ['indici', 'Indici'], ['flussi', 'Flussi di cassa'], ['diagnosi', 'Diagnosi'], ['dati', 'Dati e controlli']];
    function draw() {
      const r = st.res, D = st.data, last = r.Rs[r.Rs.length - 1];
      const years = r.Rs.map(R => R.year);
      const head = h('header', { class: 'an-head' },
        h('div', { class: 'an-id' },
          h('h2', {}, D.company || 'Analisi di bilancio'),
          h('div', { class: 'muted small' }, [D.formLabel || 'Bilancio', D.consolidato ? 'consolidato' : null, `esercizi ${years.join(', ')}`, r.ateco ? `ATECO ${String(r.ateco).replace(/^(\d{2})(\d{2})?(\d{2})?$/, (m, a, b, c) => [a, b, c].filter(Boolean).join('.'))}` : null].filter(Boolean).join(' · '))),
        h('div', { class: 'an-acts' },
          h('button', { class: 'btn', onclick: () => fileIn.click(), title: 'Aggiungi un altro esercizio: un bilancio XBRL o PDF di un altro anno' }, ic('plus', 16), 'Aggiungi un bilancio'), fileIn,
          h('button', { class: 'btn primary', onclick: () => exportDialog() }, ic('download', 16), 'Scarica la relazione')));
      const warn = [];
      if (r.ctl.badge !== 'ok') warn.push(h('div', { class: 'an-warn ' + (r.ctl.badge === 'errore' ? 'bad' : 'warn') }, ic('shield', 16), h('span', {}, r.ctl.sintesi, ' '), h('button', { class: 'linkbtn', onclick: () => { st.tab = 'dati'; draw(); } }, 'Vedi i controlli')));
      const est = r.Rs.flatMap(R => Object.values(R.est || {}));
      if (est.length) warn.push(h('div', { class: 'an-warn info' }, ic('dot', 16), h('span', {}, [...new Set(est)][0], ' '), h('button', { class: 'linkbtn', onclick: () => { st.tab = 'dati'; draw(); } }, 'Correggi i dati')));
      if (D.yearGuessed) warn.push(h('div', { class: 'an-warn warn' }, ic('cal', 16), h('span', {}, 'Non ho trovato l’anno del bilancio nel PDF: ho ipotizzato l’ultimo esercizio chiuso.')));
      if (r.Rs.length < 2) warn.push(h('div', { class: 'an-warn info' }, ic('plus', 16), h('span', {}, 'C’è un solo esercizio: per i flussi di cassa e per capire che cosa è cambiato aggiungi il bilancio dell’anno precedente.')));
      const tabs = h('nav', { class: 'an-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { class: 'an-tab' + (st.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': st.tab === k ? 'true' : 'false', onclick: () => { st.tab = k; draw(); wrap.querySelector('.an-body')?.scrollIntoView({ block: 'nearest' }); } }, l)));
      const body = h('div', { class: 'an-body', role: 'tabpanel' }, VIEWS[st.tab]());
      wrap.replaceChildren(head, ...warn, tabs, body);
    }

    /* ======== Sintesi ======== */
    function vSintesi() {
      const r = st.res, Rs = r.Rs, R = Rs[Rs.length - 1], P = Rs[Rs.length - 2], I = r.Is[r.Is.length - 1];
      const cf = r.CF[r.CF.length - 1];
      const cfo = cf ? (cf.riportato?.cfo ?? cf.op.totale) : null;
      const kpis = h('div', { class: 'an-kpis' },
        kpi('Ricavi ' + R.year, mon(R.ricavi), P ? delta(R.ricavi, P.ricavi) : null),
        kpi('EBITDA', mon(R.ebitda), `margine ${pc(I.redditivita.ebitdaMargin)}`, R.ebitda < 0 ? 'bad' : ''),
        kpi('Utile netto', mon(R.utile), P ? delta(R.utile, P.utile) : null, R.utile < 0 ? 'bad' : ''),
        kpi('Posizione finanziaria netta', mon(R.debFin - R.cash), R.debFin - R.cash <= 0 ? 'cassa superiore ai debiti finanziari' : `${xv(I.solidita.pfnEbitda)} l’EBITDA`, I.solidita.pfnEbitda > 4 ? 'warn' : ''),
        kpi('Patrimonio netto', mon(R.pn), `${pc(I.solidita.equityRatio, 0)} dell’attivo`, R.pn <= 0 ? 'bad' : ''),
        kpi('Flusso di cassa operativo', cfo != null ? mon(cfo) : '—', cf ? (cf.riportato ? 'dal rendiconto finanziario' : 'ricostruito dal bilancio') : 'serve l’anno precedente', cfo != null && cfo < 0 ? 'bad' : ''));
      const sc = r.score, tone = sc.totale >= 65 ? 'ok' : sc.totale >= 50 ? 'warn' : 'bad';
      const scoreCard = card('Punteggio dell’azienda', h('div', { class: 'an-score' }, gauge(sc.totale, sc.rating, tone),
        h('div', { class: 'an-dims' }, Object.values(sc.dims).map(d => h('div', { class: 'an-dim' }, h('span', { class: 'an-lab' }, d.label, info(d.label)), meter(d.score, d.score >= 65 ? 'ok' : d.score >= 45 ? 'warn' : 'bad'), h('b', {}, Math.round(d.score)))))),
        sc.nota ? note(sc.nota, 'warn') : null);
      const s = r.sint;
      const valCard = card('Quanto vale', s.valore != null ? h('div', { class: 'an-val' }, h('b', {}, mon(s.valore)), h('span', { class: 'muted small' }, 'valore stimato dell’azienda (100% del capitale)')) : note('Valore non calcolabile con i dati disponibili.'),
        h('p', { class: 'small muted' }, 'Stima indicativa ricavata dal bilancio: non è una perizia.'));
      const fat = r.fat, top = (fat.risultato || fat.cassa || fat.costi || []).slice(0, 4);
      const actCard = card(fat.risultato ? 'Che cosa ha pesato di più' : fat.cassa ? 'Da dove arriva e dove va la cassa' : 'Su cosa si spendono i ricavi', top.length ? fxList(top, !fat.risultato && !fat.cassa) : note('Servono più dati per dirlo.'),
        h('button', { class: 'linkbtn', onclick: () => { st.tab = 'diagnosi'; draw(); } }, 'Vedi la diagnosi →'));
      const obs = [...(r.yy?.oss || []).map(o => ({ t: o.titolo, s: o.testo, tone: SEV[o.sev] })), ...(r.fo?.flags || []).filter(f => f.year === R.year && (f.sev === 'alta' || f.sev === 'critica')).map(f => ({ t: f.titolo, s: f.oss, tone: 'bad' })), ...(r.fo?.green || []).slice(0, 3).map(g => ({ t: g.t, s: g.o, tone: 'ok' }))].slice(0, 6);
      const obsCard = card('Cosa emerge dai numeri', obs.length ? h('ul', { class: 'an-obs' }, obs.map(o => h('li', { class: o.tone }, h('b', {}, o.t), h('div', { class: 'small' }, o.s)))) : note('Nessuna variazione anomala tra gli esercizi.'));
      return [kpis, h('div', { class: 'an-grid2' }, scoreCard, valCard), Rs.length >= 1 ? card('Ricavi, EBITDA e margine', chartTrend(Rs)) : null, h('div', { class: 'an-grid2' }, actCard, obsCard)];
    }

    /* ======== Riclassificati ======== */
    function yearsHead(extra = []) { return ['', ...st.res.Rs.map(R => String(R.year)), ...extra]; }
    const al = n => ['l', ...Array(n).fill('r')];
    function vRicl() {
      const r = st.res, Rs = r.Rs, n = Rs.length;
      const sub = st.sub.ricl;
      const pick = seg([['fin', 'Stato patrimoniale finanziario'], ['fun', 'Funzionale (fonti e impieghi)'], ['va', 'Conto economico a valore aggiunto'], ['civ', 'Schema civilistico']], sub, v => { st.sub.ricl = v; draw(); });
      let content;
      const L = Rs.length - 1;
      const share = (v, tot) => tot ? pc(v / tot, 1) : '—';
      if (sub === 'fin') {
        const F = r.fin;
        const lines = [['Liquidità immediate', 'liqImm'], ['Liquidità differite', 'liqDiff'], ['Disponibilità (magazzino)', 'disp'], ['Attivo corrente', 'attCorr', 1], ['Attivo immobilizzato', 'attImm', 1], ['Totale impieghi', 'totale', 2], [null], ['Passività correnti', 'passCorr'], ['Passività consolidate', 'passCons'], ['Patrimonio netto', 'pn'], ['Totale fonti', 'totaleFonti', 2]];
        content = [table(yearsHead(['% ' + Rs[L].year]), lines.map(([lab, k2, b]) => lab == null ? row(['', ...Array(n + 1).fill('')], 'sp') : row([lab, ...F.map(f => n0(f[k2])), share(F[L][k2], F[L].totale)], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n + 1) }),
          h('h4', {}, 'Margini'),
          table(yearsHead(), [['Margine di tesoreria', 'margineTesoreria', 'Liquidità immediate e differite meno passività correnti: positivo se i debiti a breve si pagano senza vendere il magazzino.'], ['Capitale circolante netto', 'ccn', 'Attivo corrente meno passività correnti.'], ['Margine di struttura primario', 'margineStruttura1', 'Patrimonio netto meno attivo immobilizzato: positivo se i soci finanziano tutti gli investimenti durevoli.'], ['Margine di struttura secondario', 'margineStruttura2', 'Patrimonio e debiti a lungo meno attivo immobilizzato: positivo se gli investimenti sono coperti da fonti durevoli.']].map(([lab, k2, tip]) => row([lab, ...F.map(f => h('span', { class: f[k2] < 0 ? 'neg' : '' }, n0(f[k2])))])), { align: al(n) })];
      } else if (sub === 'fun') {
        const Fz = r.fun;
        const lines = [['Crediti verso clienti', f => f.voci.crediti], ['Altri crediti', f => f.voci.altriCrediti], ['Rimanenze', f => f.voci.rimanenze], ['Ratei e risconti attivi', f => f.voci.ratAtt], ['− Debiti verso fornitori', f => -f.voci.fornitori], ['− Altri debiti operativi', f => -f.voci.altriDebiti], ['− Ratei e risconti passivi', f => -f.voci.ratPass],
          ['Capitale circolante netto operativo (CCNO)', f => f.ccno, 1], ['Immobilizzazioni immateriali e materiali', f => f.voci.immImm + f.voci.immMat], ['− TFR e fondi', f => -(f.voci.tfr + f.voci.fondi)], ['Attivo fisso netto operativo (AFNO)', f => f.afno, 1],
          ['Capitale investito netto operativo (CINO)', f => f.cino, 2], ['Attività non operative (finanziarie, in eccesso)', f => f.surplus], ['Totale impieghi', f => f.impieghi, 2], [null],
          ['Posizione finanziaria netta (debiti finanziari e soci − liquidità)', f => f.pfn], ['Patrimonio netto', f => f.pn], ['Totale fonti', f => f.fonti, 2]];
        content = [table(yearsHead(), lines.map(([lab, fn, b]) => lab == null ? row(['', ...Array(n).fill('')], 'sp') : row([lab, ...Fz.map(f => n0(fn(f)))], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n) }),
          note('Il criterio funzionale separa l’attività caratteristica (circolante e attivo fisso operativi) da quella finanziaria: è la base del ROI e della stima del valore.')];
      } else if (sub === 'va') {
        const V = r.va;
        const lines = [['Ricavi delle vendite e delle prestazioni', 'ricavi'], ['Variazione delle rimanenze di prodotti e lavori', 'varRim'], ['Incrementi di immobilizzazioni per lavori interni', 'incrImm'], ['Altri ricavi e proventi', 'altriRicavi'], ['Valore della produzione', 'vdp', 1],
          ['− Consumi di materie (acquisti e variazione delle scorte)', 'consumi', 0, -1], ['− Servizi e godimento di beni di terzi', 'servizi', 0, -1], ['− Oneri diversi di gestione', 'oneriDiversi', 0, -1], ['Valore aggiunto', 'valoreAggiunto', 1],
          ['− Costo del personale', 'personale', 0, -1], ['Margine operativo lordo (EBITDA)', 'mol', 2], ['− Ammortamenti e svalutazioni', 'ammSval', 0, -1], ['− Accantonamenti', 'accantonamenti', 0, -1], ['Risultato operativo (EBIT)', 'ebit', 2],
          ['Gestione finanziaria', 'gestFin'], ['Rettifiche di attività finanziarie', 'rettifiche'], ['Risultato prima delle imposte', 'ante', 1], ['− Imposte', 'imposte', 0, -1], ['Utile (perdita) dell’esercizio', 'utile', 2]];
        content = [table(yearsHead(['% ricavi ' + Rs[L].year]), lines.map(([lab, k2, b, sg]) => row([lab, ...V.map(v => n0((sg || 1) * v[k2])), Rs[L].ricavi ? pc((sg || 1) * V[L][k2] / Rs[L].ricavi) : '—'], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n + 1) })];
      } else {
        const keys = [['A) Crediti verso soci', 'creditiSoci'], ['B.I Immobilizzazioni immateriali', 'immImm'], ['B.II Immobilizzazioni materiali', 'immMat'], ['B.III Immobilizzazioni finanziarie', 'immFin'], ['C.I Rimanenze', 'rimanenze'], ['C.II Crediti', 'crediti'], ['   di cui verso clienti', 'crClienti'], ['   di cui esigibili oltre l’esercizio', 'crOltre'], ['C.III Attività finanziarie', 'attFin'], ['C.IV Disponibilità liquide', 'cash'], ['D) Ratei e risconti attivi', 'rateiAtt'], ['Totale attivo', 'totAttivo', 2],
          ['A) Patrimonio netto', 'pn', 1], ['   di cui capitale', 'capitale'], ['B) Fondi per rischi e oneri', 'fondi'], ['C) TFR', 'tfr'], ['D) Debiti', 'debiti', 1], ['   di cui verso banche', 'debBanche'], ['   di cui altri debiti finanziari', d => d.debFin - d.debBanche], ['   di cui verso soci per finanziamenti', 'debSoci'], ['   di cui verso fornitori', 'debFornitori'], ['   di cui esigibili oltre l’esercizio', 'debOltre'], ['E) Ratei e risconti passivi', 'rateiPass'], ['Totale passivo', 'totPassivo', 2],
          ['A) Valore della produzione', 'vdp', 1], ['B) Costi della produzione', 'costiProd', 1], ['   di cui personale', 'personale'], ['   di cui ammortamenti e svalutazioni', 'ammSval'], ['Differenza A − B', 'ebit', 1], ['C) Proventi e oneri finanziari', 'gestFin'], ['D) Rettifiche', 'rettifiche'], ['Imposte', 'imposte'], ['Utile (perdita)', 'utile', 2]];
        content = [table(yearsHead(), keys.map(([lab, k2, b]) => row([lab, ...Rs.map(R => n0(typeof k2 === 'function' ? k2(R) : R[k2]))], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n), fallback: AnInfo.READ }),
          note('Le voci come lette dal bilancio (con le stime dichiarate nei bilanci abbreviati). Puoi correggerle nella scheda «Dati e controlli».')];
      }
      return [h('div', { class: 'an-subnav' }, pick), card(null, ...content)];
    }

    /* ======== Indici ======== */
    const TH = { // [buono, attenzione, più alto è meglio]
      roe: [0.1, 0.05, 1], roi: [0.1, 0.05, 1], ros: [0.06, 0.02, 1], roa: [0.06, 0.02, 1], current: [1.2, 1, 1], quick: [1, 0.7, 1], cash: [0.2, 0.1, 1],
      debtEquity: [1, 2, 0], equityRatio: [0.3, 0.15, 1], icr: [3, 1.5, 1], pfnEbitda: [3, 5, 0], coperturaImm: [1, 0.8, 1], dso: [75, 120, 0], dio: [60, 120, 0], ccc: [60, 120, 0], oneriFinSuRicavi: [0.02, 0.04, 0], leva: [3, 5, 0],
    };
    const tone = (k2, v) => { if (k2 === 'ebitdaMargin' && fin(v)) { const sm = st.res.P.sectorMargin; return v >= sm ? 'ok' : v >= sm / 2 ? 'warn' : 'bad'; } const t = TH[k2]; if (!t || !fin(v)) return ''; if (k2 === 'pfnEbitda' && v <= 0) return 'ok'; return t[2] ? (v >= t[0] ? 'ok' : v >= t[1] ? 'warn' : 'bad') : (v <= t[0] ? 'ok' : v <= t[1] ? 'warn' : 'bad'); };
    function vIndici() {
      const r = st.res, Is = r.Is, n = Is.length;
      const G = [
        ['Redditività', 'redditivita', [['ROE (utile / patrimonio netto)', 'roe', pc, 'Quanto rende il capitale dei soci.'], ['ROI (EBIT / capitale investito operativo)', 'roi', pc, 'Quanto rende l’attività caratteristica, a prescindere da come è finanziata.'], ['ROS (EBIT / ricavi)', 'ros', pc, 'Quanto resta di reddito operativo su ogni euro venduto.'], ['Margine EBITDA (EBITDA / ricavi)', 'ebitdaMargin', pc, 'Il margine prima di ammortamenti, accantonamenti, oneri finanziari e imposte.'], ['ROA (EBIT / totale attivo)', 'roa', pc, ''], ['Rotazione dell’attivo (ricavi / attivo)', 'rotazioneAttivo', xv, 'Quante volte l’attivo si trasforma in ricavi in un anno.'], ['Valore aggiunto su valore della produzione', 'vaSuVdp', pc, ''], ['Costo del debito (oneri / debiti finanziari medi)', 'rod', pc, 'Da confrontare con il ROI: se il ROI è più alto, il debito fa crescere il ROE (leva positiva).']]],
        ['Liquidità', 'liquidita', [['Indice di liquidità corrente (current ratio)', 'current', xv, 'Attivo corrente su passività correnti: sopra 1,2 tranquillo.'], ['Indice di liquidità secca (quick ratio)', 'quick', xv, 'Come sopra senza il magazzino: sopra 1 tranquillo.'], ['Liquidità immediata (cash ratio)', 'cash', xv, ''], ['Capitale circolante netto', 'ccn', n0, ''], ['Margine di tesoreria', 'margineTesoreria', n0, '']]],
        ['Solidità', 'solidita', [['Debiti finanziari / patrimonio netto', 'debtEquity', xv, 'Quanto debito finanziario per ogni euro dei soci.'], ['Patrimonio netto / totale attivo', 'equityRatio', pc, 'Autonomia finanziaria: sopra il 30% solida.'], ['Leva (totale attivo / patrimonio netto)', 'leva', xv, ''], ['Copertura degli interessi (EBIT / oneri finanziari)', 'icr', xv, 'Sopra 3 tranquillo, sotto 1,5 critico.'], ['PFN / EBITDA', 'pfnEbitda', xv, 'Anni di EBITDA per ripagare il debito netto: sotto 3 sostenibile.'], ['PFN / patrimonio netto', 'pfnPn', xv, ''], ['Copertura delle immobilizzazioni con fonti durevoli', 'coperturaImm', xv, 'Patrimonio e debiti a lungo su attivo immobilizzato: almeno 1.'], ['Oneri finanziari / ricavi', 'oneriFinSuRicavi', pc, '']]],
        ['Circolante', 'rotazione', [['Giorni medi di incasso dai clienti (DSO)', 'dso', gg, 'Crediti verso clienti su ricavi (con l’IVA), in giorni.'], ['Giorni medi di pagamento ai fornitori (DPO)', 'dpo', gg, 'Debiti verso fornitori su acquisti e servizi (con l’IVA).'], ['Giorni di scorta (DIO)', 'dio', gg, 'Rimanenze su consumi di materie.'], ['Ciclo di cassa (DSO + DIO − DPO)', 'ccc', gg, 'Per quanti giorni l’azienda finanzia il proprio ciclo operativo.']]],
      ];
      const ivaChk = checkbox('Considera l’IVA nei giorni di incasso e pagamento', st.set.params.iva !== false, v => setParam('iva', v ? null : false), 'I crediti e i debiti commerciali comprendono l’IVA, ricavi e acquisti no: senza correzione i giorni risultano gonfiati.');
      const trend = (vals) => { const a = vals.filter(fin); if (a.length < 2) return ''; const d = a[a.length - 1] - a[a.length - 2]; return Math.abs(d) < 1e-9 ? '→' : d > 0 ? '↗' : '↘'; };
      return [card(null, h('div', { class: 'an-opt' }, ivaChk)), ...G.map(([title, grp, lines]) => card(title, table(['', ...Is.map(I => String(I.year)), ''], lines.map(([lab, k2, f, tip]) => { const vals = Is.map(I => I[grp][k2]); return row([lab, ...vals.map(v => h('span', { class: 'an-v ' + tone(k2, v) }, f(v))), h('span', { class: 'an-tr' }, trend(vals))]); }), { align: [...al(n), 'r'] })))];
    }

    /* ======== Flussi di cassa ======== */
    function vFlussi() {
      const r = st.res;
      if (!r.CF.length) return [card(null, note('Per il rendiconto finanziario servono due esercizi: carica anche il bilancio dell’anno precedente (o uno che lo riporti).'))];
      const CF = r.CF, n = CF.length;
      const head = ['', ...CF.map(c => String(c.year))];
      const L = [['Utile (perdita) dell’esercizio', c => c.op.utile], ['+ Ammortamenti e svalutazioni delle immobilizzazioni', c => c.op.ammSval], ['+ Variazione di TFR e fondi', c => c.op.fondiTfr], ['Flusso prima delle variazioni del circolante', c => c.op.primaCcn, 1],
        ['− Aumento (+ diminuzione) dei crediti verso clienti', c => c.op.crediti], ['− Aumento degli altri crediti', c => c.op.altriCrediti], ['− Aumento (+ diminuzione) delle rimanenze', c => c.op.rimanenze], ['+ Aumento (− diminuzione) dei debiti verso fornitori', c => c.op.fornitori], ['+ Variazione degli altri debiti operativi', c => c.op.altriDebiti], ['+ Variazione dei ratei e risconti', c => c.op.ratei],
        ['A) Flusso della gestione operativa', c => c.op.totale, 2],
        ['Investimenti in immobilizzazioni immateriali', c => c.inv.immateriali], ['Investimenti in immobilizzazioni materiali', c => c.inv.materiali], ['Investimenti in immobilizzazioni finanziarie', c => c.inv.finanziarie], ['Attività finanziarie a breve e altre', c => c.inv.attFin], ['B) Flusso degli investimenti', c => c.inv.totale, 2],
        ['Variazione dei debiti finanziari (anche verso soci)', c => c.fi.debitiFinanziari], ['Mezzi propri: apporti (+) e dividendi (−)', c => c.fi.capitale], ['C) Flusso dei finanziamenti', c => c.fi.totale, 2],
        ['Variazione delle disponibilità liquide (A + B + C)', c => c.delta, 2], ['Variazione da stato patrimoniale', c => c.deltaReale], ['Flusso di cassa libero operativo (A − investimenti)', c => c.fcff, 1]];
      const rows2 = L.map(([lab, fn, b]) => row([lab, ...CF.map(c => h('span', { class: fn(c) < 0 ? 'neg' : '' }, n0(fn(c))))], b === 2 ? 'tot' : b ? 'sub' : ''));
      const q = CF.map(c => c.quadra === 'ok' ? null : `${c.year}: la variazione calcolata (${eur(c.delta)}) differisce da quella delle disponibilità (${eur(c.deltaReale)}) di ${eur(c.gap)}.`).filter(Boolean);
      const rep = CF.filter(c => c.riportato);
      return [card('Rendiconto finanziario (metodo indiretto, OIC 10)', table(head, rows2, { align: al(n), ctx: 'cf' }),
        q.length ? note('Quadratura: ' + q.join(' ') + ' Di solito dipende da voci non lette o da movimenti non monetari (rivalutazioni, fusioni).', 'warn') : note('Quadratura: la somma dei flussi coincide con la variazione delle disponibilità liquide.', 'ok')),
        rep.length ? card('Confronto con il rendiconto depositato', table(['', ...rep.map(c => String(c.year))], [
          row(['Flusso operativo: depositato', ...rep.map(c => n0(c.riportato.cfo))]), row(['Flusso operativo: ricostruito', ...rep.map(c => n0(c.op.totale))]),
          row(['Investimenti: depositato', ...rep.map(c => n0(c.riportato.inv))]), row(['Investimenti: ricostruito', ...rep.map(c => n0(c.inv.totale))]),
          row(['Finanziamenti: depositato', ...rep.map(c => n0(c.riportato.fin))]), row(['Finanziamenti: ricostruito', ...rep.map(c => n0(c.fi.totale))])], { align: al(rep.length) }),
          note('Quando c’è il rendiconto depositato, gli indicatori di qualità degli utili usano il suo flusso operativo.')) : null];
    }

    /* ======== Diagnosi ======== */
    // una voce per riga: barra verso destra se aiuta, verso sinistra se pesa; la lunghezza è il peso relativo
    function fxList(items, onlyWeight) {
      return h('ul', { class: 'an-fx' + (onlyWeight ? ' one' : '') }, items.map(x => h('li', { class: x.segno > 0 ? 'pos' : 'neg' },
        h('div', { class: 'an-fx-h' }, h('b', { class: 'an-lab' }, x.label, tipOf(AnInfo.FX[x.key] ? [AnInfo.FX[x.key], 'Più è lunga la barra, più la voce ha pesato rispetto alle altre.'] : ['L’importo della voce nell’ultimo esercizio.', 'Più è lunga la barra, più la voce pesa sui ricavi.'])), h('span', { class: 'an-fx-t' }, onlyWeight ? `pesa ${x.livello}` : `${x.segno > 0 ? 'in positivo' : 'in negativo'} · pesa ${x.livello}`)),
        h('div', { class: 'an-fx-bar', 'aria-hidden': 'true' }, h('span', { style: { width: Math.max(4, Math.round(x.rel * (onlyWeight ? 100 : 50))) + '%' } })),
        h('div', { class: 'small muted' }, x.testo))));
    }
    function vDiagnosi() {
      const r = st.res, f = r.fat, out = [];
      if (f.sintesi.length) out.push(card('In breve', ...f.sintesi.map(t => h('p', {}, t))));
      out.push(card(f.y0 ? `Che cosa ha cambiato il risultato (${f.y0} → ${f.y1})` : 'Che cosa ha cambiato il risultato', f.risultato?.length ? [fxList(f.risultato), note('A destra ciò che ha migliorato l’utile, a sinistra ciò che l’ha ridotto; più è lunga la barra, più la voce ha pesato. Ogni attività ha le sue regole: qui conta il confronto con l’anno prima, non un valore ideale.')] : note('Per vedere che cosa è cambiato serve anche il bilancio dell’anno precedente.')));
      if (f.cassa?.length) out.push(card(`Da dove arriva e dove va la cassa (${f.y1})`, fxList(f.cassa), note('A destra ciò che ha portato liquidità, a sinistra ciò che l’ha assorbita.')));
      if (f.costi?.length) out.push(card(`Su cosa si spendono i ricavi (${f.y1})`, fxList(f.costi, true), h('p', { class: 'small' }, f.esito)));
      return out;
    }

    /* ======== Dati e controlli ======== */
    const EDIT = [
      ['Stato patrimoniale', [['immImm', 'Immobilizzazioni immateriali'], ['immMat', 'Immobilizzazioni materiali'], ['immFin', 'Immobilizzazioni finanziarie'], ['rimanenze', 'Rimanenze'], ['crClienti', 'Crediti verso clienti'], ['crediti', 'Totale crediti'], ['attFin', 'Attività finanziarie a breve'], ['liquidita', 'Disponibilità liquide'], ['rateiAtt', 'Ratei e risconti attivi'], ['totAttivo', 'Totale attivo'],
        ['pn', 'Patrimonio netto'], ['capitale', 'Capitale sociale'], ['fondi', 'Fondi per rischi e oneri'], ['tfr', 'TFR'], ['debBanche', 'Debiti verso banche'], ['debBancheEntro', '   di cui entro l’esercizio'], ['debAltriFin', 'Debiti verso altri finanziatori'], ['obbligazioni', 'Obbligazioni'], ['debSoci', 'Debiti verso soci per finanziamenti'], ['debFornitori', 'Debiti verso fornitori'], ['debiti', 'Totale debiti'], ['debOltre', '   di cui oltre l’esercizio'], ['rateiPass', 'Ratei e risconti passivi'], ['totPassivo', 'Totale passivo']]],
      ['Conto economico', [['ricavi', 'Ricavi delle vendite'], ['altriRicavi', 'Altri ricavi e proventi'], ['vdp', 'Valore della produzione'], ['materie', 'Materie prime e merci'], ['servizi', 'Servizi'], ['godimento', 'Godimento di beni di terzi'], ['personale', 'Personale'], ['ammImm', 'Ammortamento immateriali'], ['ammMat', 'Ammortamento materiali'], ['svalCrediti', 'Svalutazione crediti'], ['ammSval', 'Totale ammortamenti e svalutazioni'], ['varRimMat', 'Variazione rimanenze di materie'], ['accRischi', 'Accantonamenti per rischi'], ['altriAcc', 'Altri accantonamenti'], ['oneriDiversi', 'Oneri diversi di gestione'], ['costiProd', 'Totale costi della produzione'], ['diffAB', 'Differenza A − B'], ['altriProvFin', 'Proventi finanziari'], ['oneriFin', 'Interessi e oneri finanziari'], ['imposte', 'Imposte'], ['utile', 'Utile (perdita)']]],
      ['Altre informazioni', [['dipendenti', 'Numero medio di dipendenti'], ['compensiAmm', 'Compensi degli amministratori'], ['costiNonRicorrenti', 'Costi non ricorrenti (una tantum)']]],
    ];
    function vDati() {
      const r = st.res, D = st.data, Rs = r.Rs, out = [];
      const aff = r.aff;
      out.push(card(`Affidabilità del risultato: ${aff.score}/100 (${aff.livello})`, h('p', {}, aff.messaggio),
        h('div', { class: 'an-dims' }, aff.comps.map(c => h('div', { class: 'an-dim' }, h('span', { class: 'an-lab' }, c.label, info(c.label), h('i', { class: 'small muted' }, ` peso ${Math.round(c.peso * 100)}%`)), meter(c.v, c.v >= 80 ? 'ok' : c.v >= 55 ? 'warn' : 'bad'), h('b', {}, Math.round(c.v))))),
        h('p', { class: 'small muted' }, `Fonti: ${D.sources.map(s => `${s.name} (${s.kind === 'xbrl' ? 'XBRL' : 'PDF'}, esercizi ${s.years.join(' e ')})`).join(' · ')}`)));
      out.push(card(`Controlli di coerenza: ${r.ctl.score}/100 — ${r.ctl.label}`, h('p', {}, r.ctl.sintesi),
        r.ctl.notes.length ? h('ul', { class: 'an-reasons small' }, r.ctl.notes.map(nn => h('li', {}, nn.text))) : null,
        table(['Anno', 'Controllo', 'Esito', 'Dettaglio'], r.ctl.years.flatMap(y => y.checks.map(c => row([String(y.year), h('span', { class: 'an-lab' }, c.label, info(c.label)), chip(c.stato, c.stato === 'ok' ? 'ok' : c.stato === 'info' ? 'info' : c.stato === 'attenzione' ? 'warn' : 'bad'), c.nota]))), { align: ['l', 'l', 'l', 'l'], cls: 'wrap' })));
      // dati modificabili
      const raw = Object.fromEntries(st.data.years.map(y => [y.year, y.v]));
      const DER = { liquidita: R => R.cash, altriProvFin: R => R.provFin, diffAB: R => R.ebit, accRischi: () => null, altriAcc: () => null };
      const valOf = (R, k2) => DER[k2] ? DER[k2](R) : R[k2];
      const cell = (R, k2) => {
        const e = st.set.edits[R.year]?.[k2];
        const readV = raw[R.year]?.[k2];
        const shown = e != null ? e : (readV != null ? readV : valOf(R, k2));
        const inp = h('input', { class: 'input an-cell' + (e != null ? ' ed' : '') + (R.est?.[k2] || (k2 === 'debBanche' && R.est?.debFin) ? ' est' : ''), type: 'number', step: 1, value: fin(shown) ? Math.round(shown) : '', title: e != null ? `Modificato (letto: ${fin(readV) ? n0(readV) : 'assente'})` : readV != null ? 'Valore letto dal bilancio' : fin(shown) ? 'Valore calcolato' : 'Non presente',
          onchange: () => { const v = inp.value === '' ? null : +inp.value; setEdit(R.year, k2, v == null || (fin(readV) && Math.round(readV) === v) ? null : v); } });
        return inp;
      };
      const nEd = Object.values(st.set.edits).reduce((s, e) => s + Object.keys(e).length, 0);
      out.push(card('I dati dell’analisi (modificabili)', h('p', { class: 'small' }, 'Correggi un importo letto male o completa ciò che il bilancio non dice (per esempio i debiti verso banche in un bilancio abbreviato): l’analisi si ricalcola subito. Le celle con il bordo colorato sono modificate; quelle tratteggiate sono stime.'),
        nEd ? h('button', { class: 'btn sm ghost', onclick: () => { st.set.edits = {}; recompute(); } }, ic('reset', 15), `Ripristina i valori letti (${nEd} modific${nEd === 1 ? 'a' : 'he'})`) : null,
        ...EDIT.map(([title, keys]) => h('div', {}, h('h4', {}, title), table(['', ...Rs.map(R => String(R.year))], keys.map(([k2, lab]) => row([lab, ...Rs.map(R => cell(R, k2))])), { align: al(Rs.length), cls: 'edit', fallback: AnInfo.READ })))));
      return out;
    }
    const VIEWS = { sintesi: vSintesi, ricl: vRicl, indici: vIndici, flussi: vFlussi, diagnosi: vDiagnosi, dati: vDati };

    /* ---------------- relazione: PDF, Word, Excel ---------------- */
    function exportDialog() {
      const sel = { pdf: true, docx: false, xlsx: true };
      const m = modal([h('h3', {}, 'Scarica la relazione'),
        h('p', { class: 'muted small' }, 'La relazione contiene sintesi e valore stimato, riclassificati, indici, flussi di cassa, diagnosi e controlli sui dati.'),
        checkbox('Relazione in PDF', sel.pdf, v => { sel.pdf = v; }), checkbox('Relazione in Word (.docx), modificabile', sel.docx, v => { sel.docx = v; }), checkbox('Foglio Excel con tutti i numeri', sel.xlsx, v => { sel.xlsx = v; }),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Annulla'),
          h('button', { class: 'btn primary', onclick: async () => { m.close(); await makeOutputs(sel); } }, ic('download', 16), 'Crea i file'))], { width: 460 });
    }
    async function makeOutputs(sel) {
      const r = st.res, base = (st.data.company || 'Azienda').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).replace(/[.\s]+$/, '');
      const y = r.Rs[r.Rs.length - 1].year;
      const outs = await withBusy('Preparazione della relazione…', async () => {
        const o = [];
        const doc = AnReport.blocks(r, st.data);
        if (sel.pdf) o.push({ name: `Analisi di bilancio ${y} - ${base}.pdf`, bytes: await Report.pdf(doc) });
        if (sel.docx) o.push({ name: `Analisi di bilancio ${y} - ${base}.docx`, bytes: await Report.docx(doc), type: Report.DOCX });
        if (sel.xlsx) o.push({ name: `Analisi di bilancio ${y} - ${base}.xlsx`, bytes: await XlsxOut.build(AnReport.sheets(r, st.data), { title: 'Analisi di bilancio ' + base }), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return o;
      });
      if (outs && outs.length) showResult(outs, { title: 'La relazione è pronta', primary: outs.length > 1 ? 0 : null, zipName: `Analisi di bilancio - ${base}.zip` });
    }

    compute();
  }
  return { start, chartTrend };
})();