#!/usr/bin/env python3
"""Suite completa: build, regole del file, comportamento dell'interfaccia, firme e p7m, banchi di prova con soglie.
   uso: python3 test/all.py [--veloce]   (--veloce salta OCR e foto, che richiedono qualche minuto)"""
import subprocess, sys, pathlib, re, time
ROOT = pathlib.Path(__file__).resolve().parent.parent; fast = '--veloce' in sys.argv; fails = []
def run(name, cmd, check=None, timeout=1500):
    t0 = time.time(); p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout); out = p.stdout + p.stderr
    okk = p.returncode == 0 and (check(out) if check else True)
    print(('✓' if okk else '✗'), name, f'({time.time() - t0:.0f} s)'); 
    if not okk: fails.append(name); print('   ' + '\n   '.join(out.strip().split('\n')[-12:]))
    return out
run('build', ['python3', 'build.py'])
html = (ROOT / 'dist' / 'file360.html').read_text(encoding='utf-8')
# regole del file unico
size = len(html.encode()) / 1e6   # nessun limite di peso (richiesta esplicita: la qualità prima di tutto); il peso si mostra soltanto
print(f'· peso del file: {size:.2f} MB (nessun limite)')
app = html[html.rindex('<script>\n\'use strict\';'):]; body = app[:app.rindex('</script>')]
bad = [s for s in ('<!--', '</script') if s in body]
print(('✓' if not bad else '✗'), 'nel JS non compaiono «<!--» e «</script»', bad or ''); (not bad) or fails.append('sequenze vietate')
ext = sorted(set(re.findall(r'https?://[a-z0-9.-]+', body)))
print('  indirizzi citati nel codice (nessun file dell’utente viene inviato; servono a OCR al primo uso, cloud facoltativo, sito):', len(ext))
run('codice in moduli: nessun file sorgente oltre 3.000 righe', ['python3', '-c', "import pathlib,sys; m=max((len(p.read_text(encoding='utf-8').split(chr(10))),p.name) for p in pathlib.Path('src').rglob('*.js')); print(m); sys.exit(m[0] > 3000)"])
run('icone: ogni strumento ha un’icona che esiste (nessuna casella vuota)', ['python3', 'tools/icone.py'])
run('sistema visivo: dimensioni, pesi, raggi, ombre e colori sulle scale dei token', ['python3', 'tools/tokens.py'])
run('interfaccia (116 comportamenti)', ['node', 'test/suite/ui.test.js'], lambda o: 'tutti verdi' in o)
run('ricerca: 70 domande tipiche portano allo strumento giusto (≥ 95%)', ['node', 'test/suite/search.test.js'], lambda o: 'tutti verdi' in o)
run('Word, Excel, PowerPoint e testi in PDF, Filigrana: testo nell’ordine, celle, grafici, PDF/UA, nessuna richiesta esterna', ['node', 'test/bench/office_bench.js'], lambda o: 'tutti verdi' in o)
run('PDF in PowerPoint modificabile: aperto da LibreOffice e python-pptx, parole al loro posto ≥ 95%, scansione storta ≥ 94%', ['node', 'test/bench/ppt_bench.js'], lambda o: 'tutti verdi' in o)
run('Contratti di affitto e comodato: nove tipi (anche foresteria, box, fondo rustico), regole di legge, PDF/UA con veraPDF, Word uguale al PDF', ['node', 'test/bench/contratti_bench.js'], lambda o: 'tutti verdi' in o)
run('Contratti, esperienza d’uso: indice ≥ 4,5 su velocità, facilità, intuitività e aspetto (azioni, campi compilati da soli, errori segnalati, segnaposto cliccabili, axe WCAG 2.2, telefono)', ['node', 'test/bench/contratti_ux.js', '--no-affidabilita'], lambda o: (lambda m: bool(m) and float(m.group(1)) >= 4.5)(__import__('re').search(r'INDICE: ([\d.]+)', o)))
run('Analisi di vendite e acquisti: numeri esatti al centesimo, acquisti e fornitori, clienti sul Comune giusto, fatti nascosti scoperti, nessuna richiesta di rete, 5.000 fatture, axe; indice ≥ 4,5', ['node', 'test/bench/vendite_bench.js'], lambda o: (lambda m: bool(m) and float(m.group(1)) >= 4.5)(__import__('re').search(r'INDICE: ([\d.]+)', o)))
run('Oscura nei contratti: comuni, province, CAP, società, dati catastali, dati letti male dall’OCR; nessun dato inventato nel testo comune', ['node', 'test/bench/pii_bench.js'], lambda o: 'tutti verdi' in o)
run('Testo scritto con l’AI?: impronte dei programmi AI, carattere della chat, residui, testo nascosto, passaggi copiati, stile di Claude (Haiku, Sonnet, Opus) riconosciuto, testo umano non segnalato', ['node', 'test/bench/rilevaai_bench.js'], lambda o: 'tutti verdi' in o)
run('Testo scritto con l’AI?, griglia per Claude: accuratezza, falsi allarmi, prove certe, esperienza d’uso; indice ≥ 4,5', ['node', 'test/bench/rilevaai_griglia.js'], lambda o: (lambda m: bool(m) and float(m.group(1)) >= 4.5)(__import__('re').search(r'INDICE: ([\d.]+)', o)))
run('Incassi e pagamenti: ogni fattura con la sorte giusta (≥ 99%); Verifica di autenticità: PDF modificati riconosciuti, nessun falso allarme sugli altri', ['node', 'test/bench/incassi_autentica_bench.js'], lambda o: 'tutti verdi' in o)
run('Analisi di un contratto ricevuto: clausole illegittime trovate tutte, nessuna segnalazione sui contratti conformi (nove tipi del generatore)', ['node', 'test/bench/leggicontratto_bench.js'], lambda o: 'tutti verdi' in o)
run('Passa file: collegamento senza server tra due browser, QR ≤ 200 caratteri, 1 GB identico ≥ 20 MB/s, secondo collegamento < 2 s, nessuna richiesta di rete', ['node', 'test/bench/passa_bench.js'], lambda o: 'tutti verdi' in o)
run('PDF accessibili dall’OCR: PDF/UA-1 con veraPDF, testo intatto', ['node', 'test/bench/ua_bench.js'], lambda o: 'tutti verdi' in o)
run('OCR in inglese, francese, tedesco e spagnolo: errore medio < 1,5%', ['node', 'test/bench/lingue_bench.js'], lambda o: 'tutti verdi' in o)
run('servizi per professione (16 comportamenti)', ['node', 'test/suite/pro.test.js'], lambda o: 'tutti verdi' in o)
run('prestazioni (telefono lento e computer)', ['node', 'test/suite/perf.test.js'], lambda o: 'tutti verdi' in o)
run('sito: 48 pagine con il contenuto nell’HTML, CSP senza script non elencati, nessun dominio esterno', ['bash', '-c', 'python3 build.py --netlify >/dev/null && node test/suite/csp.test.js'], lambda o: 'tutti verdi' in o)
run('app installabile: service worker, pagine e OCR senza rete', ['node', 'test/suite/pwa.test.js'], lambda o: 'tutti verdi' in o)
run('stress rapido: Oscura senza dati nascosti residui, firme false mai «valide»', ['python3', 'test/stress/quick.py'], lambda o: 'tutto a posto' in o)
run('firme e p7m', ['node', 'test/suite/firme.test.js'], lambda o: 'tutti verdi' in o)
num = lambda o, rx: float(re.search(rx, o).group(1).replace(',', '.'))
run('modifica fedele (prova 1): 13/13 righe identiche', ['node', 'test/bench/edit_bench.js'], lambda o: 'identico al pixel: 13/13' in o and 'fuori dalle righe toccate: 0 pixel' in o)
run('modifica fedele (prova 2): 7/7', ['node', 'test/bench/edit_bench.js', '--pdf', 'prova2'], lambda o: 'identico al pixel: 7/7' in o)
run('lettura condivisa: secondo strumento almeno 25% più veloce', ['node', 'test/bench/shared_read_bench.js'], lambda o: num(o, r'secondo strumento: (-?\d+)%') >= 25 and num(o, r'terzo strumento: (-?\d+)%') >= 25)
run('banco degli strumenti: ogni funzione sopra la sua soglia', ['node', 'test/bench/tools_bench.js'], lambda o: 'tutti sopra soglia' in o)
run('riconoscimento del foglio: almeno 49/54', ['node', 'test/bench/scan_bench.js'], lambda o: num(o, r'Riusciti[^:]*: (\d+)/54') >= 49 and 'non trovati: 0' in o)
if not fast:
    run('robustezza: file difficili in ogni strumento, nessun errore sfuggito né blocco', ['node', 'test/bench/robust_bench.js'], lambda o: 'tutte le prove superate' in o)
    run('prestazioni: 300 pagine negli strumenti principali entro i limiti', ['node', 'test/bench/perf_bench.js'], lambda o: 'tutti entro i limiti' in o)
    run('OCR su fogli non piatti: errore medio < 0,5%, peggiore < 1,5%', ['node', 'test/bench/ocr_bench.js'], lambda o: num(o, r'CER medio ([\d.]+)%') < 0.5 and num(o, r'peggiore ([\d.]+)%') < 1.5)
print('\n' + ('TUTTO VERDE' if not fails else 'FALLITI: ' + ', '.join(fails))); sys.exit(1 if fails else 0)
