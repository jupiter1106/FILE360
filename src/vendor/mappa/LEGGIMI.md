# Mappa stradale (Analisi delle vendite)

- `maplibre-gl.js`, `maplibre-gl.css`: MapLibre GL JS 5.24.1, BSD-3-Clause (`LICENSE-maplibre.txt`).
- `pmtiles.js`: PMTiles 4.5.0 (Protomaps), BSD-3-Clause.
- `stile.json`: generato da `tools/mappa_stile.js` con @protomaps/basemaps 5.7.2 (BSD-3-Clause), nei colori del prodotto.
- `glifi/`: Noto Sans regular/medium/italic, intervalli latini, da @inframaps/glyphs-core (SIL OFL 1.1, `glifi/LICENSE`).
- `italia-insieme-z5.pmtiles` (nel file unico, 0,9 MB) e `italia-insieme-z7.pmtiles` (sul sito, 6,4 MB): l'Italia d'insieme,
  estratta dalla build Protomaps del 18 novembre 2026 (`go-pmtiles extract … --maxzoom=5` e `7`).
  Dati © OpenStreetMap contributors, ODbL 1.0.

- `confini.json`: confini ISTAT delle province (openpolis/geojson-italy, CC BY 4.0) semplificati a 80 m, da
  `tools/mappa_dati.py confini`: contorni delle zone con clienti.

Il programma incorpora tutto in un blocco eseguito solo quando si apre la mappa (`build.py`, `mappa_lib`).
