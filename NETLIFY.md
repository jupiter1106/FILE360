# file360 su Netlify, con Google Drive

## Pubblicare
- **Da Git (consigliato):** collega il repository a Netlify. `netlify.toml` fa già tutto: compila con
  `python3 build.py --netlify` e pubblica `dist/netlify` (pagina `index.html`, intestazioni HTTP in `_headers`).
- **Trascinando una cartella:** esegui `python3 build.py --netlify` e trascina su Netlify la cartella `dist/netlify`
  (dentro mettici anche `cloud.json`, vedi sotto).

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
