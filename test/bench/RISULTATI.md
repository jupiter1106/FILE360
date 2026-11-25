# Misure prima/dopo (build originale intatta contro build nuova)

| Prova | Originale | Nuova |
|---|---|---|
| Foglio nelle foto reali (10 scatti di un contratto, piano chiaro): trovato e ritagliato senza tagliare testo | 1 su 10 (4 non trovati, 5 tagliati male) | 10 su 10 |
| Foglio nelle foto sintetiche con angoli noti (54 scene): errore < 1,5% della diagonale | 43 su 54 | 49 su 54 |
| Righe dritte dopo il ritaglio (pendenza mediana delle righe, foto reali) | 0,5°–2,2° | 0,05°–0,38° |
| OCR su fogli non piatti, testo noto (8 pagine): errore sui caratteri medio / peggiore | 6,42% / 30,93% | 0,22% / 0,85% |
| OCR, errore sulle parole medio | 10,58% | 0,85% |
| Modifica: resto della riga identico al pixel dopo aver cambiato una parola (20 righe, 9 caratteri diversi) | 1 su 20 | 20 su 20 |

Come rifarle: `python3 test/bench/make_scans.py && node test/bench/scan_bench.js <build>`,
`python3 test/bench/make_warps.py && node test/bench/ocr_bench.js <build>`,
`python3 test/bench/make_edit.py && python3 test/bench/make_edit2.py && node test/bench/edit_bench.js <build> [--pdf prova2]`.
Le foto reali (private) non fanno parte della consegna.
