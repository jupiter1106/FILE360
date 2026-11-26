# file360 su Netlify, con Google Drive

## Pubblicare
- **Dal repository GitHub (così è configurato):** il sito già pronto sta nella cartella `sito/` del repository e
  `netlify.toml` dice a Netlify di pubblicarla così com'è, senza compilare nulla. Su Netlify: «Add new site» ›
  «Import an existing project» › GitHub › `jupiter1106/file360`; i campi di build si leggono da `netlify.toml`.
  Per aggiornare il sito dopo una modifica: `python3 build.py --netlify && rm -rf sito && mv dist/netlify sito`,
  poi `python3 tools/vercel_json.py`, commit e push.
- **Su Vercel:** lo stesso repository funziona anche lì. `vercel.json` (generato da `tools/vercel_json.py` con le
  stesse intestazioni di sicurezza di `sito/_headers`) dice a Vercel di pubblicare `sito/` senza compilare.
  Senza `vercel.json` Vercel pubblicherebbe la cartella principale (i sorgenti) e il sito risponderebbe 404.
- **Da Git (consigliato):** collega il repository a Netlify. `netlify.toml` fa già tutto: compila con
  `python3 build.py --netlify` e pubblica `dist/netlify` (pagina `index.html`, intestazioni HTTP in `_headers`).
- **Trascinando una cartella:** esegui `python3 build.py --netlify` e trascina su Netlify la cartella `dist/netlify`
  (dentro mettici anche `cloud.json`, vedi sotto).

## Mappa stradale di «Analisi delle vendite» (facoltativa, una volta sola)
Gli indirizzi per mettere i clienti sul numero civico (`dati/mappa/civici`, 43 MB) si pubblicano sempre. Per vedere anche
strade ed edifici servono i dati per provincia (1,8 GB in tutto), che non stanno nel repository. Chi usa il sito ne
scarica solo pochi MB: le province dove ha clienti, e solo le zone che guarda.
1. Installa go-pmtiles (`go install github.com/protomaps/go-pmtiles@latest`).
2. Estrai l'Italia dalla mappa del mondo di Protomaps (la data è quella di una build recente elencata su
   maps.protomaps.com/builds; il file serve solo per preparare i dati):
   `go-pmtiles extract https://build.protomaps.com/20261118.pmtiles italia.pmtiles --bbox=6.55,35.45,18.55,47.1 --maxzoom=14`
3. Scarica i confini ISTAT delle province (openpolis/geojson-italy, `geojson/limits_IT_provinces.geojson`).
4. Dividi per provincia: `python3 tools/mappa_dati.py province italia.pmtiles limits_IT_provinces.geojson`. Crea
   `dati/mappa/province/PR.pmtiles`, 110 file, in meno di un minuto.
5. `python3 build.py --netlify`: ogni provincia diventa pezzi da 4 MB in `dist/netlify/mappa/province/PR/` (485 file,
   nessuno oltre gli 8 MB).
6. Pubblica la cartella `dist/netlify`.
   - Trascinandola in «Deploys»: sono 1,8 GB, il caricamento richiede tempo.
   - Con la Netlify CLI: `netlify deploy --prod --dir dist/netlify`.

   Nei rilasci successivi Netlify ricarica solo i file cambiati: i pezzi della mappa non si ricaricano.

Il browser legge solo i byte che servono (richieste parziali); se l'hosting non le supporta, scarica il pezzo intero da
4 MB e lo tiene in memoria. Per il file unico senza rete: `python3 tools/mappa_dati.py cartella mappa-italia` prepara
la cartella da scegliere nel programma.

## Google Drive (una volta sola, ~10 minuti)
1. [Google Cloud Console](https://console.cloud.google.com/) › crea un progetto (es. «file360»).
2. *API e servizi › Libreria*: abilita **Google Drive API** e **Google Picker API**.
3. *Schermata di consenso OAuth*: tipo **Esterno**, nome dell'app, email; ambito `.../auth/drive.file`
   (accesso solo ai file che l'utente sceglie o che file360 crea). Pubblica l'app (o aggiungi i tuoi utenti di prova).
4. *Credenziali › Crea credenziali › ID client OAuth* › **Applicazione web** › *Origini JavaScript autorizzate*:
   `https://IL-TUO-SITO.netlify.app` (e il tuo dominio, se ne hai uno). Copia l'**ID client**.
5. *Credenziali › Crea credenziali › Chiave API* › limitala a *Referrer HTTP* `https://IL-TUO-SITO.netlify.app/*`
   e alla sola **Google Picker API**. Copia la **chiave**.
6. *Impostazioni del progetto* (o la dashboard): copia il **Numero del progetto** (solo cifre).

## Dare le chiavi a file360 (una delle due)
- **Variabili d'ambiente di Netlify** (*Site configuration › Environment variables*), poi rifai il deploy:
  `FILE360_GDRIVE_CLIENT_ID`, `FILE360_GDRIVE_API_KEY`, `FILE360_GDRIVE_APP_ID`.
- **File `cloud.json`** accanto alla pagina (nella cartella principale del progetto se usi Git; in `dist/netlify`
  se trascini la cartella), come `cloud.example.json`.

Sono chiavi pubbliche per natura (nessun segreto): la sicurezza la danno le origini autorizzate e i limiti della chiave.
I file passano direttamente tra il browser e Google: file360 non ha server.
Se un servizio non è configurato, i pulsanti del cloud non compaiono. Per una prova senza deploy: `INDIRIZZO?cloud-setup`
apre la finestra per inserire le chiavi solo in quel browser.
Dropbox e OneDrive funzionano allo stesso modo (`FILE360_DROPBOX_APP_KEY`, `FILE360_ONEDRIVE_CLIENT_ID`).
