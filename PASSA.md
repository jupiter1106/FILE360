# Passa file

Passaggio di file tra telefono e computer, diretto e cifrato, senza server. Codice: `src/passa.js` (motore e interfaccia) e `src/vendor/jsqr-1.4.0.txt` (lettore di QR jsQR 1.4.0, Apache 2.0), caricati solo all'apertura dello strumento.

## Come si collegano

1. **Computer.** Prepara una connessione WebRTC per ciascuno dei 3 telefoni abbinati più recenti, più una libera per chi si abbina adesso. Le credenziali di collegamento derivano da un seme casuale. Il QR è `https://…/passa-file/#c=…` e contiene versione, impronta del certificato del computer, seme, indirizzi locali (nome «.local» o IPv4) e, per ogni voce, l'inizio dell'impronta del telefono e le porte. In tutto circa 100 byte: 128 caratteri.
2. **Telefono.** Inquadra il QR, dall'app o con la fotocamera del sistema. Ricostruisce l'offerta del computer e risponde con le credenziali derivate dal seme e con il proprio certificato persistente.
3. **Computer.** Conosce già l'impronta del telefono dall'abbinamento: la risposta del telefono l'ha costruita in anticipo. Impara l'indirizzo del telefono da chi bussa (candidato «peer-reflexive»), quindi nessuno scambio torna indietro.
4. **Primo collegamento.** Il telefono usa la voce libera e intanto resta in attesa. Il computer riceve l'impronta dal link di abbinamento (aperto anche in un'altra scheda: arriva con BroadcastChannel), dall'immagine con il QR o dal codice di 52 caratteri. A quel punto completa la connessione già aperta: il collegamento riesce anche con 40 secondi di ritardo.

L'impronta non è segreta: chi la legge non può né leggere i file né fingersi il telefono. Il codice di controllo a 4 cifre (derivato dalle due impronte) rivela una sostituzione. Il certificato del telefono vale 360 giorni. Negli ultimi 30 se ne prepara uno nuovo, comunicato al computer sul canale già cifrato.

## Trasferimento

Canale dati negoziato (id 0). Ogni file viaggia così:
- messaggio di apertura;
- pezzi fino a 256 KB (o il massimo del canale), con controllo del flusso: buffer fino a 8 MB, ripresa a 2 MB;
- messaggio di chiusura con l'impronta SHA-256, calcolata a pezzi.

Chi riceve ricalcola l'impronta e la conferma. Ogni 64 MB i pezzi ricevuti passano in un Blob, così i file da gigabyte non restano in memoria.

## Limiti dichiarati

- Stessa rete: Wi-Fi dello stesso router, con il computer anche col cavo, oppure l'hotspot del telefono. Le reti «ospiti» isolate e il 4G/5G non funzionano: il programma lo dice.
- Pagina aperta su tutti e due i dispositivi.
- Su iPhone l'abbinamento resta solo se file360 è aggiunto alla schermata Home: Safari cancella i dati dei siti non usati da 7 giorni.

Da verificare sui dispositivi:
- la risoluzione dei nomi «.local» del computer su alcuni Android;
- la velocità reale sulla Wi-Fi.

## Prove

- `test/suite/ui.test.js`, due prove:
  - abbinamento con il link, file identici nei due sensi, risultato mandato al telefono, apertura in un altro strumento con il collegamento attivo, secondo collegamento con il solo QR, controllo a 4 cifre uguale;
  - fotocamera simulata in un secondo browser e immagine di abbinamento sul computer.
- `test/bench/passa_bench.js`: QR ≤ 200 caratteri; 1 GB identico a ≥ 20 MB/s; secondo collegamento in meno di 2 s; nessuna richiesta di rete.
