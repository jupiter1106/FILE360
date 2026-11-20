/* ---------- Mappa stradale: dall'Italia intera fino al numero civico ----------
   La mappa si disegna nel browser (MapLibre GL) con lo stile del prodotto, dalle tessere vettoriali di OpenStreetMap
   (formato PMTiles, Protomaps). L'Italia d'insieme è dentro il programma; strade ed edifici vengono dalla «mappa
   dettagliata» (una cartella sul dispositivo o, sul sito, i file della mappa accanto alle pagine).
   Gli indirizzi dei clienti si cercano nell'indice dei civici di OpenStreetMap, una provincia per file, sempre sul
   dispositivo: nessun indirizzo viene mai inviato a un servizio. */
const Mappa = (() => {
  // ---- indirizzi: stesse regole di tools/indirizzi_it.py ----
  const ABBR = { v: 'via', vle: 'viale', pza: 'piazza', pzza: 'piazza', ple: 'piazzale', cso: 'corso', str: 'strada', loc: 'localita', fraz: 'frazione', vic: 'vicolo', lgo: 'largo', sp: 'strada provinciale', ss: 'strada statale' };
  const PUNT = { 'v.le': 'viale', 'p.zza': 'piazza', 'p.za': 'piazza', 'p.le': 'piazzale', 'c.so': 'corso', 'l.go': 'largo', 'p.tta': 'piazzetta' };
  const TIPI = new Set(['via', 'viale', 'piazza', 'piazzale', 'piazzetta', 'corso', 'largo', 'vicolo', 'strada', 'localita', 'frazione', 'contrada', 'borgo', 'salita', 'lungomare', 'lungotevere', 'galleria', 'viottolo', 'traversa', 'rione', 'calle', 'campo', 'fondamenta', 'stradone', 'circonvallazione', 'vico', 'parco', 'passaggio', 'rampa', 'regione', 'provinciale', 'statale']);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  function viaNorm(s) {
    s = String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\b(v\.le|p\.zza|p\.za|p\.le|c\.so|l\.go|p\.tta)(?![a-z])/g, m => PUNT[m]);
    return norm(s).flatMap(t => (ABBR[t] || t).split(' ')).join(' ');
  }
  const civNorm = s => String(s || '').toLowerCase().replace(/bis/g, 'b').replace(/ter/g, 't').replace(/[^0-9a-z]/g, '');
  // «Via Roma, 10/A», «V.le Mazzini n. 5 int. 3», «Via XX Settembre 5», «Località Pieve snc» → via e civico
  function separa(s) {
    let t = String(s || '').replace(/\s+/g, ' ').trim();
    // interno, scala, piano… solo dopo un numero civico: «Piazza della Scala 5» e «Via Lorenzo Lotto 12» restano interi
    t = t.replace(/(\d[0-9a-z/]*)[,\s-]+(?:int(?:erno)?|scala|sc|piano|p|pal(?:azzina)?|edificio|ed|lotto)\.?\s*[a-z0-9]{1,4}\s*$/i, '$1').replace(/[,\s-]+(c\/o|presso)\b.*$/i, '');
    t = t.replace(/[,\s]+(snc|s\.n\.c\.?|s\.n\.?|senza numero)\s*$/i, '');
    if (/\bkm\.?\s*\d/i.test(t)) return { via: t.replace(/[,\s]+km\.?\s*[\d.,]+\s*$/i, '').trim(), civ: '' };
    const m = t.match(/^(.*?\D)[,\s]+(?:n\.?|n°|nr\.?|num\.?|civ\.?|numero)?\s*(\d{1,4}(?:\s*\/\s*[a-z0-9]{1,3}|\s*[a-z](?![a-z])|\s*(?:bis|ter)\b)?)\s*$/i);
    return m ? { via: m[1].replace(/[,\s]+$/, '').trim(), civ: m[2] } : { via: t, civ: '' };
  }
  const STOP = new Set(['di', 'del', 'della', 'dei', 'delle', 'degli', 'da', 'e', 'd', 'dell', 'l', 'lo', 'la', 'il', 'al', 'alla', 'ai']);
  const sig = toks => toks.filter(t => !TIPI.has(t) && !STOP.has(t));
  // somiglianza tra due nomi per gli errori di battitura (distanza di Damerau: due lettere scambiate sono un solo errore)
  function simil(a, b) {
    if (a === b) return 1; const m = a.length, n = b.length; if (!m || !n) return 0;
    const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; }); for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return 1 - d[m][n] / Math.max(m, n);
  }

  // ---- indice dei civici: una provincia per file ({comuni:{"Nome|PR":[[via, lon, lat, "civ:dlon,dlat;…"],…]}}) ----
  const indici = new Map();          // sigla → Promise<indice|null>
  function comuneIdx(I, chiave) {
    const rows = I.comuni[chiave]; if (!rows) return null;
    return I._c[chiave] ||= { rows, per: new Map(rows.map(r => [r[0], r])), tok: rows.map(r => [r, r[0].split(' ')]) };
  }
  function trovaVia(C, q) {
    if (C.per.has(q)) return C.per.get(q);
    const qt = q.split(' '), qs = sig(qt), tipoQ = TIPI.has(qt[0]) ? qt[0] : '';
    if (!qs.length) return null;
    let best = null, bs = 0, pari = false;
    const qj = qs.join(' ');
    for (const [r, ct] of C.tok) {
      const tipoC = TIPI.has(ct[0]) ? ct[0] : '', cs = sig(ct);
      if ((tipoQ && tipoC && tipoQ !== tipoC) || !cs.length) continue;
      // parole della fattura tutte nel nome della via (anche le iniziali: «G. Garibaldi» → «Giuseppe Garibaldi») o viceversa;
      // mai i pezzi di parola: «Via Roma» non è «Via Romagnosi»
      const dentro = (A, B) => A.every(w => B.some(x => x === w || (w.length === 1 && /[a-z]/.test(w) && x[0] === w)));
      // il cognome o il nome principale (l'ultima parola) deve coincidere: «Via dei Ciclamini Turchesi» non è «Via dei Ciclamini»
      const ultima = qs[qs.length - 1] === cs[cs.length - 1];
      let s = 0;
      if (ultima && dentro(qs, cs)) s = 0.7 + 0.3 * qs.length / cs.length;
      else if (ultima && dentro(cs, qs) && qs.length - cs.length <= 2) s = 0.6 + 0.3 * cs.length / qs.length;
      else if (qj.length >= 6) { const v = simil(qj, cs.join(' ')); if (v >= 0.84) s = v * 0.8; }
      if (!s) continue;
      if (s > bs + 1e-9) { best = r; bs = s; pari = false; } else if (Math.abs(s - bs) < 1e-9 && r[0] !== best[0]) pari = true;
    }
    // due vie diverse ugualmente probabili: meglio il centro del Comune che la via sbagliata
    return bs && !pari ? best : null;
  }
  function civici(r) {
    if (r._civ) return r._civ;
    const m = new Map(); if (r[3]) for (const p of r[3].split(';')) { const [n, d] = p.split(':'), [dx, dy] = d.split(','); m.set(n, [r[1] + +dx, r[2] + +dy]); }
    return r._civ = m;
  }
  // un indirizzo → posizione. prec: 'civico' (trovato), 'stimato' (tra i civici vicini della stessa via), 'via' (sulla via), null
  function cerca(I, comune, prov, indirizzo) {
    if (!I || !comune) return null;
    const C = comuneIdx(I, `${comune}|${prov}`); if (!C) return null;
    const { via, civ } = separa(indirizzo), r = trovaVia(C, viaNorm(via));
    if (!r) return null;
    const mid = { lon: r[1] / 1e6, lat: r[2] / 1e6, prec: 'via', via: r[0] };
    if (!civ) return mid;
    const M = civici(r), cn = civNorm(civ), n = parseInt(cn, 10);
    const ok = p => ({ lon: p[0] / 1e6, lat: p[1] / 1e6, via: r[0] });
    if (M.has(cn)) return { ...ok(M.get(cn)), prec: 'civico' };
    if (M.has(String(n))) return { ...ok(M.get(String(n))), prec: 'civico' };
    if (!Number.isFinite(n) || !M.size) return mid;
    // civico mancante: tra i due più vicini con la stessa parità (lo stesso lato della strada), altrimenti il più vicino
    const nums = [...M.entries()].map(([k, p]) => [parseInt(k, 10), p]).filter(x => Number.isFinite(x[0]));
    const pari = nums.filter(x => x[0] % 2 === n % 2), L = pari.length >= 2 ? pari : nums;
    let lo = null, hi = null; for (const x of L) { if (x[0] < n && (!lo || x[0] > lo[0])) lo = x; if (x[0] > n && (!hi || x[0] < hi[0])) hi = x; }
    if (lo && hi && hi[0] - lo[0] <= 60) { const f = (n - lo[0]) / (hi[0] - lo[0]); return { lon: (lo[1][0] + (hi[1][0] - lo[1][0]) * f) / 1e6, lat: (lo[1][1] + (hi[1][1] - lo[1][1]) * f) / 1e6, prec: 'stimato', via: r[0] }; }
    const v = lo && hi ? (n - lo[0] < hi[0] - n ? lo : hi) : lo || hi;
    return v && Math.abs(v[0] - n) <= 30 ? { ...ok(v[1]), prec: 'stimato' } : mid;
  }

  // ---- fonti dei dati della mappa ----
  // L'Italia intera si vede sempre (mappa d'insieme); strade ed edifici si leggono solo per le province dove ci sono
  // clienti, un archivio per provincia, e di ogni archivio solo i pezzi delle zone guardate.
  // sito: window.OFFICINA_MAPPA = {civici: '/mappa/civici/', base: '/mappa/province/', province: {PR: {n, pezzo}}} (tools/sitegen.py)
  // dispositivo: la cartella «mappa-italia» (insieme.pmtiles, province/PR.pmtiles, civici/PR.json.gz); va bene anche un
  // unico italia.pmtiles con tutta l'Italia
  const cartella = { tessere: null, insieme: null, province: new Map(), civici: new Map(), nome: '' };
  const sito = () => window.OFFICINA_MAPPA || null;
  const haDettaglio = () => !!(cartella.tessere || cartella.province.size || (sito()?.province && Object.keys(sito().province).length));
  const dettaglioDi = pr => !!(cartella.tessere || cartella.province.has(pr) || sito()?.province?.[pr]);
  const haCivici = () => cartella.civici.size > 0 || !!sito()?.civici;
  async function gunzipJson(buf) {
    const u = new Uint8Array(buf); if (u[0] !== 0x1f || u[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(u));
    if (typeof DecompressionStream !== 'undefined') return JSON.parse(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    return JSON.parse(new TextDecoder().decode(pako.ungzip(u)));
  }
  function indice(prov) {
    if (!prov) return Promise.resolve(null);
    if (indici.has(prov)) return indici.get(prov);
    const p = (async () => {
      try {
        const f = cartella.civici.get(prov);
        let buf = null;
        if (f) buf = await f.arrayBuffer();
        else if (sito()?.civici) { const r = await fetch(sito().civici + prov + '.json.gz'); if (r.ok) buf = await r.arrayBuffer(); }
        if (!buf) return null;
        const I = await gunzipJson(buf); I._c = {}; return I;
      } catch { return null; }
    })();
    indici.set(prov, p); return p;
  }
  // cartella scelta: i file per nome (funziona con la scelta di una cartella intera o di più file)
  function usaFile(files) {
    let n = 0;
    for (const f of files) {
      const nome = (f.webkitRelativePath || f.name).toLowerCase();
      const pv = nome.match(/(?:^|\/)([a-z]{2})\.pmtiles$/);
      if (pv) { cartella.province.set(pv[1].toUpperCase(), f); archivi.delete(pv[1].toUpperCase()); n++; }
      else if (/(?:^|\/)insieme\.pmtiles$/.test(nome)) { cartella.insieme = f; n++; }
      else if (nome.endsWith('.pmtiles') && (!cartella.tessere || f.size > cartella.tessere.size)) { cartella.tessere = f; n++; }
      const m = nome.match(/(?:^|\/)([a-z]{2})\.json(\.gz)?$/); if (m) { cartella.civici.set(m[1].toUpperCase(), f); indici.delete(m[1].toUpperCase()); n++; }
    }
    if (files[0]?.webkitRelativePath) cartella.nome = files[0].webkitRelativePath.split('/')[0];
    fontiP = null;
    return n;
  }
  // Chrome ed Edge: la cartella si ricorda (il browser chiede il permesso alla volta successiva)
  const IDB = () => new Promise((ok, ko) => { const r = indexedDB.open('file360-mappa', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  async function salvaCartella(hd) { try { const db = await IDB(); await new Promise(ok => { const t = db.transaction('h', 'readwrite'); t.objectStore('h').put(hd, 'cartella'); t.oncomplete = ok; t.onerror = ok; }); } catch { } }
  async function cartellaRicordata() { try { const db = await IDB(); return await new Promise(ok => { const r = db.transaction('h').objectStore('h').get('cartella'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch { return null; } }
  async function leggiHandle(hd) {
    const files = [];
    async function giro(d, pre) { for await (const [nome, x] of d.entries()) { if (x.kind === 'file' && /\.(pmtiles|json\.gz)$/i.test(nome)) { const f = await x.getFile(); Object.defineProperty(f, 'webkitRelativePath', { value: pre + nome }); files.push(f); } else if (x.kind === 'directory' && pre.split('/').length < 4) await giro(x, pre + nome + '/'); } }
    await giro(hd, hd.name + '/'); return usaFile(files);
  }
  async function riprendi(chiedi = false) {
    if (cartella.tessere || cartella.province.size || cartella.civici.size) return true;
    const hd = await cartellaRicordata(); if (!hd) return false;
    try {
      let p = await hd.queryPermission({ mode: 'read' });
      if (p !== 'granted' && chiedi) p = await hd.requestPermission({ mode: 'read' });
      if (p !== 'granted') return false;
      return (await leggiHandle(hd)) > 0;
    } catch { return false; }
  }
  async function scegliCartella() {
    if (window.showDirectoryPicker) {
      try { const hd = await window.showDirectoryPicker({ id: 'file360-mappa', mode: 'read' }); const n = await leggiHandle(hd); if (n) salvaCartella(hd); return n; }
      catch (e) { if (e?.name === 'AbortError') return 0; }
    }
    return new Promise(ok => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: true });
      inp.setAttribute('webkitdirectory', '');
      inp.addEventListener('change', () => ok(usaFile([...inp.files]))); inp.addEventListener('cancel', () => ok(0)); inp.click();
    });
  }
  const ricordata = async () => !!(await cartellaRicordata());

  // ---- tessere: sul sito in pezzi (nessun file oltre i limiti dell'hosting), sul dispositivo dal file ----
  class APezzi {
    constructor(t) { this.t = t; this.cache = new Map(); }
    getKey() { return this.t.nome; }
    async pezzo(i, a, b, signal) {
      const url = this.t.base + String(i).padStart(4, '0') + '.bin';
      const hit = this.cache.get(i); if (hit) return hit.slice(a, b + 1);
      const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal });
      if (r.status === 206) return r.arrayBuffer();
      if (!r.ok) throw new Error('mappa non raggiungibile');
      const all = await r.arrayBuffer(); this.cache.set(i, all); if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value);
      return all.slice(a, b + 1);
    }
    async getBytes(off, len, signal) {
      const P = this.t.pezzo, out = new Uint8Array(len); let k = 0;
      while (k < len) { const o = off + k, i = Math.floor(o / P), a = o - i * P, b = Math.min(P - 1, a + (len - k) - 1); const part = new Uint8Array(await this.pezzo(i, a, b, signal)); out.set(part, k); k += part.length; if (!part.length) break; }
      return { data: out.buffer };
    }
  }
  let lib = null, protocollo = null, fontiP = null;
  const archivi = new Map();           // provincia → Promise<{p: PMTiles, bbox}|null>
  let attive = [], intero = null;      // province con clienti (in ordine di importanza); l'Italia intera, se c'è
  function archivio(pr) {
    if (archivi.has(pr)) return archivi.get(pr);
    const pm = (async () => {
      let src = null;
      const f = cartella.province.get(pr), m = sito()?.province?.[pr];
      if (f) src = new pmtiles.FileSource(f);
      else if (m) src = new APezzi({ base: sito().base + pr + '/', nome: 'provincia-' + pr, pezzo: m.pezzo });
      if (!src) return null;
      try { const p = new pmtiles.PMTiles(src), h = await p.getHeader(); return { p, bbox: [h.minLon, h.minLat, h.maxLon, h.maxLat] }; } catch { return null; }
    })();
    archivi.set(pr, pm); return pm;
  }
  // riquadro di una tessera (lon/lat)
  const tbox = (z, x, y) => { const n = 2 ** z, lon = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI; return [lon(x), lat(y + 1), lon(x + 1), lat(y)]; };
  const incrocia = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  async function libreria() {
    if (lib) return lib;
    const el = document.querySelector('script[data-lib="mappa"]');
    if (el && el.dataset.src && !el.textContent) { const r = await fetch(el.dataset.src); if (!r.ok) throw new Error('Impossibile scaricare la mappa: controlla la connessione e riprova.'); el.textContent = await r.text(); }
    if (el) Later._run(el, false);
    if (!window.maplibregl || !window.MAPPA_RISORSE) throw new Error('Mappa non disponibile in questa versione.');
    const R = window.MAPPA_RISORSE;
    if (!document.getElementById('mappa-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'mappa-css', textContent: R.css }));
    // caratteri: un blocco compresso con l'indice (build.py); il corsivo e i caratteri mancanti diventano il normale
    let glifiP = null;
    const glifiBin = () => glifiP ||= (async () => { const bin = atob(R.glifi.gz), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return typeof DecompressionStream !== 'undefined' ? new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : pako.ungzip(u); })();
    maplibregl.addProtocol('glifi', async p => {
      const m = p.url.match(/^glifi:\/\/([^/]+)\/(\d+-\d+)/); if (!m) return { data: new ArrayBuffer(0) };
      let k = decodeURIComponent(m[1]).split(',')[0].trim().toLowerCase().replace(/\s+/g, '-') + '-' + m[2];
      if (!R.glifi.idx[k]) k = 'noto-sans-regular-' + m[2];
      const e = R.glifi.idx[k]; if (!e) return { data: new ArrayBuffer(0) };
      const all = await glifiBin(); return { data: all.slice(e[0], e[0] + e[1]).buffer };
    });
    protocollo = new pmtiles.Protocol(); maplibregl.addProtocol('pmtiles', protocollo.tile);
    // il dettaglio: ogni tessera dall'archivio della provincia che la contiene, solo tra le province con clienti
    maplibregl.addProtocol('dettaglio', async (params, ctl) => {
      const m = params.url.match(/^dettaglio:\/\/(\d+)\/(\d+)\/(\d+)/), z = +m[1], x = +m[2], y = +m[3];
      try {
        if (intero) { const r = await intero.getZxy(z, x, y, ctl?.signal); return { data: r?.data || new ArrayBuffer(0) }; }
        const bb = tbox(z, x, y);
        for (const pr of attive) { const a = await archivio(pr); if (!a || !incrocia(a.bbox, bb)) continue; const r = await a.p.getZxy(z, x, y, ctl?.signal); if (r?.data?.byteLength) return { data: r.data }; }
      } catch (e) { if (e?.name === 'AbortError') throw e; }
      return { data: new ArrayBuffer(0) };
    });
    return lib = maplibregl;
  }
  async function inlineBytes(name) {
    const el = document.getElementById('lazy-' + name);
    if (!el) { const u = window.OFFICINA_DATA?.[name]; if (!u) return null; const r = await fetch(u); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; }
    const bin = atob(testoAPezzi(el).trim()), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u[0] === 0x1f && u[1] === 0x8b ? pako.ungzip(u) : u;
  }
  // le fonti: l'Italia d'insieme (cartella, sito o incorporata) e, se c'è, il dettaglio
  function fonti(conInsieme = true) {
    if (!conInsieme) return (async () => { intero = null; if (cartella.tessere) { try { const p = new pmtiles.PMTiles(new pmtiles.FileSource(cartella.tessere)); await p.getHeader(); intero = p; } catch { } } return { insieme: null }; })();
    return fontiP ||= (async () => {
      intero = null;
      if (cartella.tessere) { try { const p = new pmtiles.PMTiles(new pmtiles.FileSource(cartella.tessere)); await p.getHeader(); intero = p; } catch { } }
      let p = null;
      if (cartella.insieme) { try { p = new pmtiles.PMTiles(new pmtiles.FileSource(cartella.insieme)); await p.getHeader(); } catch { p = null; } }
      if (!p) { const u = await inlineBytes('mappaitalia'); if (!u) return null; p = new pmtiles.PMTiles(new pmtiles.FileSource(new File([u], 'italia-insieme.pmtiles'))); }
      protocollo.add(p); const hd = await p.getHeader();
      return { insieme: 'pmtiles://' + p.source.getKey(), maxIns: hd.maxZoom };
    })();
  }
  const scuro = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
  const ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';
  const EDIFICI = { chiaro: '#d9cffb', scuro: '#352d66' };
  // lo stile: gli strati dell'Italia d'insieme e, sopra, gli stessi strati del dettaglio (dove c'è, copre l'insieme);
  // gli edifici del dettaglio si alzano in 3D ingrandendo
  function stile(F, tema, bounds, minDett = 8) {
    const L = window.MAPPA_RISORSE.stile.layers[tema], dett = haDettaglio();
    const copia = (l, src, pre) => { const o = { ...l, id: pre + l.id }; if (l.source) o.source = src; return o; };
    const layers = F.insieme ? L.map(l => copia(l, 'insieme', 'i_')) : L.filter(l => l.type === 'background').map(l => copia(l, null, 'i_'));
    if (dett) for (const l of L) {
      if (l.type === 'background') continue;
      layers.push(copia(l, 'dettaglio', 'd_'));
      if (l.id === 'buildings') layers.push({ id: 'd_edifici3d', type: 'fill-extrusion', source: 'dettaglio', 'source-layer': l['source-layer'], minzoom: 15, filter: l.filter || ['all'],
        paint: { 'fill-extrusion-color': EDIFICI[tema], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16.2, ['coalesce', ['get', 'height'], 9]] } });
    }
    const sources = F.insieme ? { insieme: { type: 'vector', url: F.insieme, attribution: ATTR } } : {};
    if (dett) sources.dettaglio = { type: 'vector', tiles: ['dettaglio://{z}/{x}/{y}'], minzoom: intero ? 0 : minDett, maxzoom: 14, ...(bounds && !intero ? { bounds } : {}), ...(F.insieme ? {} : { attribution: ATTR }) };
    // l'orizzonte, quando la vista è inclinata: una foschia nei colori del prodotto
    const sky = tema === 'scuro' ? { 'sky-color': '#0f0c22', 'horizon-color': '#221c47', 'fog-color': '#141127', 'fog-ground-blend': 0.55, 'horizon-fog-blend': 0.7, 'sky-horizon-blend': 0.6, 'atmosphere-blend': 0 }
      : { 'sky-color': '#ece6ff', 'horizon-color': '#f7f5ff', 'fog-color': '#f3f0fe', 'fog-ground-blend': 0.55, 'horizon-fog-blend': 0.7, 'sky-horizon-blend': 0.6, 'atmosphere-blend': 0 };
    return { version: 8, glyphs: 'glifi://{fontstack}/{range}', sources, layers, sky, light: { anchor: 'viewport', color: '#ffffff', intensity: tema === 'scuro' ? 0.25 : 0.35, position: [1.2, 200, 35] } };
  }
  // confini delle province (GEO_IT, gli stessi della vista per province) in lon/lat: per illuminare le zone con clienti
  let confiniC = null;
  const anello = f => { const r = []; let x = 0, y = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; r.push([x / 1e4, y / 1e4]); } return r; };
  const regioneDi = pr => window.MAPPA_RISORSE?.confini?.reg?.[pr] || null;
  const sagoma = rn => (window.MAPPA_RISORSE?.confini?.regioni?.[rn] || []).map(anello);
  function confini() {
    if (confiniC) return confiniC;
    // confini precisi (80 m) dalla libreria della mappa: anelli in decimillesimi di grado, a differenze
    const RC = window.MAPPA_RISORSE?.confini?.province;
    if (RC) { confiniC = {}; for (const [sig, rings] of Object.entries(RC)) confiniC[sig] = rings.map(anello); return confiniC; }
    const G = typeof GEO_IT !== 'undefined' ? GEO_IT : null; if (!G) return confiniC = {};
    const P = G.proj, Y0 = Math.log(Math.tan(Math.PI / 4 + P.lat1 * Math.PI / 360));
    const ll = (x, y) => [+(P.lon0 + x / P.k * 180 / Math.PI).toFixed(5), +((2 * Math.atan(Math.exp(Y0 - y / P.k)) - Math.PI / 2) * 180 / Math.PI).toFixed(5)];
    const out = {};
    for (const [sig, p] of Object.entries(G.province)) {
      // percorsi «M x y l dx dy … z» (tools/geo_it.py): un anello per sottopercorso
      const anelli = []; let ring = null, x = 0, y = 0, cmd = 'M', num = [];
      const chiudi = () => { if (ring && ring.length > 2) anelli.push([...ring, ring[0]]); ring = null; };
      for (const t of p.d.match(/[MmLlZz]|-?\d*\.?\d+/g) || []) {
        if (/[A-Za-z]/.test(t)) { if (/[Zz]/.test(t)) chiudi(); else cmd = t; continue; }
        num.push(+t); if (num.length < 2) continue; const [a, b] = num; num = [];
        if (cmd === 'M' || cmd === 'm') { chiudi(); x = cmd === 'M' ? a : x + a; y = cmd === 'M' ? b : y + b; ring = [ll(x, y)]; cmd = cmd === 'M' ? 'L' : 'l'; }
        else { if (cmd === 'L') { x = a; y = b; } else { x += a; y += b; } (ring ||= []).push(ll(x, y)); }
      }
      chiudi(); out[sig] = anelli;
    }
    return confiniC = out;
  }
  const zoneFC = (sigle) => ({ type: 'FeatureCollection', features: sigle.filter(s => confini()[s]?.length).map(s => ({ type: 'Feature', properties: { s }, geometry: { type: 'MultiPolygon', coordinates: confini()[s].map(r => [r]) } })) });
  const bbox = sigle => { let b = null; for (const s of sigle) for (const r of confini()[s] || []) for (const [x, y] of r) b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y]; return b && [b[0] - 0.05, b[1] - 0.05, b[2] + 0.05, b[3] + 0.05]; };
  // il rilievo: l'Italia divisa in esagoni di circa 20 km; su ogni esagono con clienti una colonna alta come il fatturato
  const RT = 6378137, merc = (lon, lat) => [RT * lon * Math.PI / 180, RT * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
  const demerc = (x, y) => [x / RT * 180 / Math.PI, (2 * Math.atan(Math.exp(y / RT)) - Math.PI / 2) * 180 / Math.PI];
  function esagoni(P, lato = 15500) {
    const W = Math.sqrt(3) * lato, celle = new Map();
    for (const p of P) {
      if (!(p.f > 0)) continue;
      const [x, y] = merc(p.lon, p.lat), q = (x * Math.sqrt(3) / 3 - y / 3) / lato, r = y * 2 / 3 / lato;
      // arrotondamento alle coordinate esagonali (cubiche)
      let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r); const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
      const k = rx + ',' + rz, c = celle.get(k) || { q: rx, r: rz, f: 0, n: 0, top: [] };
      c.f += p.f; c.n++; c.top.push(p); celle.set(k, c);
    }
    const fmax = Math.max(1, ...[...celle.values()].map(c => c.f));
    return { fmax, fc: { type: 'FeatureCollection', features: [...celle.values()].map(c => {
      const cx = W * (c.q + c.r / 2), cy = lato * 1.5 * c.r, ring = [];
      for (let i = 0; i <= 6; i++) { const a = Math.PI / 180 * (60 * (i % 6) - 30); ring.push(demerc(cx + lato * 0.78 * Math.cos(a), cy + lato * 0.78 * Math.sin(a))); }
      const t = Math.pow(c.f / fmax, 0.75), top = c.top.sort((a, b) => b.f - a.f);
      return { type: 'Feature', properties: { f: c.f, n: c.n, t, h: 3000 + t * 165000, nomi: top.slice(0, 3).map(p => p.nome).join(' · '), cx: demerc(cx, cy)[0], cy: demerc(cx, cy)[1] }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }) } };
  }
  // simbolo della sede: un rombo
  function rombo(col, bordo) {
    const s = 44, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.beginPath(); g.moveTo(s / 2, 3); g.lineTo(s - 3, s / 2); g.lineTo(s / 2, s - 3); g.lineTo(3, s / 2); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = bordo; g.stroke();
    return g.getImageData(0, 0, s, s);
  }
  const COL = { chiaro: { p: '#4a1fe0', pb: '#ffffff', cl: '#2c1888', clt: '#ffffff', app: '#ffffff', sede: '#e8590c', lab: '#241a52', halo: '#ffffff', spento: '#f1eefb', zona: '#5b2eff', vuoto: '#faf9ff',
      rilievo: ['#e4ddff', '#b9a6ff', '#8b5cf6', '#5b2eff', '#3b1a9e'] },
    scuro: { p: '#b9a6ff', pb: '#141127', cl: '#8f74ff', clt: '#0f0c22', app: '#141127', sede: '#ff9b5e', lab: '#f1edff', halo: '#141127', spento: '#0d0b1c', zona: '#a78bfa', vuoto: '#100d22',
      rilievo: ['#3a2f7a', '#5b45c4', '#8b6cff', '#c2b2ff', '#f1ecff'] } };

  /* disegna la mappa in «box». punti: [{id, nome, lon, lat, f (fatturato), prec, tip()}]; sede: {lon, lat, nome}|null;
     province: le sigle delle province con clienti (il dettaglio si legge solo lì). Restituisce i comandi della mappa
     oppure lancia un errore (niente WebGL, libreria mancante). */
  async function disegna(box, { punti, sede, province = [], provSede = null, onPunto, onZona, vista }) {
    const ml = await libreria();
    // clienti tutti in una regione: si vede solo la regione, con il dettaglio di tutte le sue province e senza la mappa
    // d'insieme (se il dettaglio c'è); in due o più regioni, tutta l'Italia
    const regs = new Set(province.map(regioneDi).filter(Boolean)), regione = regs.size === 1 ? [...regs][0] : null;
    const provReg = regione ? Object.keys(window.MAPPA_RISORSE.confini.reg).filter(p => regioneDi(p) === regione) : [];
    const soloDett = !!regione && !cartella.tessere && provReg.every(dettaglioDi);
    const F = await fonti(!soloDett); if (!F) throw new Error('Mappa non disponibile.');
    attive = regione ? [...province, ...provReg.filter(p => !province.includes(p))] : [...province, ...(provSede && !province.includes(provSede) ? [provSede] : [])];
    attive.forEach(pr => { if (dettaglioDi(pr)) archivio(pr); });   // intestazioni in anticipo: il primo ingrandimento è subito pronto
    const tema = scuro() ? 'scuro' : 'chiaro', C = COL[tema];
    let scalaR = 1;   // le colonne del rilievo in proporzione alla scala: su una regione più basse che sull'Italia intera
    const fcDi = P => ({ type: 'FeatureCollection', features: P.map(p => ({ type: 'Feature', properties: { id: p.id, nome: p.nome, f: Math.max(0, p.f), a: p.prec === 'comune' || p.prec === 'cap' || p.prec === 'provincia' ? 1 : 0 }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
    const smDi = P => Math.sqrt(Math.max(1, ...P.map(p => p.f)));
    const raggioG = sm => ['interpolate', ['linear'], ['sqrt', ['get', 'f']], 0, 13, sm * 2, 34];
    const raggioP = sm => ['interpolate', ['linear'], ['zoom'], 5, ['interpolate', ['linear'], ['sqrt', ['get', 'f']], 0, 4, sm, 12], 15, ['interpolate', ['linear'], ['sqrt', ['get', 'f']], 0, 7, sm, 16]];
    const fc = fcDi(punti), sm = smDi(punti), conClienti = [...new Set(province)], senza = Object.keys(confini()).filter(s => !conClienti.includes(s) && (!regione || provReg.includes(s)));
    const anelliReg = regione ? sagoma(regione) : [], bbReg = regione ? anelliReg.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]) : null;
    const inizio = vista || (bbReg ? [[bbReg[0], bbReg[1]], [bbReg[2], bbReg[3]]] : [[6.6, 36.6], [18.5, 47.1]]);
    const map = new ml.Map({ container: box, style: stile(F, tema, bbox(attive.filter(dettaglioDi)), soloDett ? 6 : 8), bounds: inizio, fitBoundsOptions: { padding: 28 }, maxZoom: 19, minZoom: 4, maxPitch: 60, attributionControl: { compact: false }, dragRotate: false, pitchWithRotate: false, cooperativeGestures: false,
      renderWorldCopies: false, fadeDuration: 180, antialias: true,
      locale: { 'NavigationControl.ZoomIn': 'Ingrandisci', 'NavigationControl.ZoomOut': 'Rimpicciolisci', 'NavigationControl.ResetBearing': 'Orienta a nord', 'FullscreenControl.Enter': 'Schermo intero', 'FullscreenControl.Exit': 'Esci dallo schermo intero', 'ScaleControl.Meters': 'm', 'ScaleControl.Kilometers': 'km', 'Map.Title': 'Mappa', 'Marker.Title': 'Segnaposto', 'Popup.Close': 'Chiudi', 'AttributionControl.ToggleAttribution': 'Fonti della mappa', 'GlobeControl.Enable': 'Globo', 'GlobeControl.Disable': 'Piano' } });
    map.touchZoomRotate.disableRotation();
    // rotella del mouse: zoom morbido e reattivo, centrato sul puntatore
    map.scrollZoom.enable({ around: 'pointer' }); map.scrollZoom.setWheelZoomRate(1 / 300); map.scrollZoom.setZoomRate(1 / 80);
    if (bbReg) { const w = bbReg[2] - bbReg[0], hh = bbReg[3] - bbReg[1]; map.setMaxBounds([[bbReg[0] - w * 0.35, bbReg[1] - hh * 0.35], [bbReg[2] + w * 0.35, bbReg[3] + hh * 0.35]]); map.setMinZoom(Math.max(4, map.getZoom() - 0.9)); }
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ml.FullscreenControl(), 'top-right');
    map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.getCanvas().setAttribute('aria-label', 'Mappa dei clienti: ingrandisci per vedere le strade e i civici');
    await new Promise((ok, ko) => { map.once('load', ok); map.once('error', e => { if (!map.loaded()) ko(e.error || new Error('Mappa non disponibile.')); }); setTimeout(ok, 15000); });
    map.addImage('sede', rombo(C.sede, C.pb), { pixelRatio: 2 });
    // le zone: province senza clienti velate ingrandendo, province con clienti con un contorno luminoso
    map.addSource('zone-spente', { type: 'geojson', data: zoneFC(senza) });
    map.addSource('zone-vendita', { type: 'geojson', data: zoneFC(conClienti) });
    // una regione sola: fuori dalla regione la mappa sparisce, la regione resta in rilievo con il suo contorno
    if (regione && anelliReg.length) {
      map.addSource('fuori', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-179, -85], [179, -85], [179, 85], [-179, 85], [-179, -85]], ...anelliReg.map(r => [...r].reverse())] } } });
      map.addSource('regione', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: anelliReg.map(r => [r]) } } });
      map.addLayer({ id: 'regione-ombra', type: 'line', source: 'regione', paint: { 'line-color': C.zona, 'line-blur': 14, 'line-width': 18, 'line-opacity': 0.22, 'line-translate': [0, 6] } });
      map.addLayer({ id: 'regione-fuori', type: 'fill', source: 'fuori', paint: { 'fill-color': C.vuoto, 'fill-opacity': 1 } });
      map.addLayer({ id: 'regione-bordo', type: 'line', source: 'regione', paint: { 'line-color': C.zona, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 12, 2.4], 'line-opacity': 0.85 } });
    }
    map.addLayer({ id: 'zone-velo', type: 'fill', source: 'zone-spente', paint: { 'fill-color': C.spento, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.5, 11, 0.6, 12.5, 0] } });
    map.addLayer({ id: 'zone-alone', type: 'line', source: 'zone-vendita', paint: { 'line-color': C.zona, 'line-blur': 5, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 10], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.18, 9, 0.22, 12.5, 0] } });
    map.addLayer({ id: 'zone-bordo', type: 'line', source: 'zone-vendita', paint: { 'line-color': C.zona, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 0.7, 12.5, 0] } });
    // il rilievo (vista «Rilievo»): colonne esagonali in 3D, l'Italia a colpo d'occhio
    let ril = esagoni(punti), crescita = 0, animR = 0;
    map.addSource('rilievo', { type: 'geojson', data: ril.fc });
    const altezza = k => ['*', ['get', 'h'], k * scalaR];
    map.addLayer({ id: 'rilievo', type: 'fill-extrusion', source: 'rilievo', layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['get', 't'], 0, C.rilievo[0], 0.25, C.rilievo[1], 0.5, C.rilievo[2], 0.75, C.rilievo[3], 1, C.rilievo[4]],
      'fill-extrusion-height': altezza(0), 'fill-extrusion-base': 0, 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.94, 9.5, 0.94, 11, 0.35], 'fill-extrusion-vertical-gradient': true } });
    map.addLayer({ id: 'rilievo-base', type: 'line', source: 'rilievo', layout: { visibility: 'none' }, paint: { 'line-color': C.zona, 'line-width': 1, 'line-opacity': 0.35 } }, 'rilievo');
    const cresci = (da, a, ms = 1100) => { cancelAnimationFrame(animR); const t0 = performance.now(), ease = x => 1 - Math.pow(1 - x, 3);
      const passo = t => { const x = Math.min(1, (t - t0) / ms); crescita = da + (a - da) * ease(x); map.setPaintProperty('rilievo', 'fill-extrusion-height', altezza(crescita)); if (x < 1) animR = requestAnimationFrame(passo); else animR = 0; }; animR = requestAnimationFrame(passo); };
    map.addSource('clienti', { type: 'geojson', data: fc, cluster: true, clusterMaxZoom: 14, clusterRadius: 42, clusterProperties: { f: ['+', ['get', 'f']] } });
    map.addLayer({ id: 'gruppi', type: 'circle', source: 'clienti', filter: ['has', 'point_count'], paint: { 'circle-color': C.cl, 'circle-opacity': 0.9, 'circle-stroke-color': C.pb, 'circle-stroke-width': 2, 'circle-radius': raggioG(sm) } });
    map.addLayer({ id: 'gruppi-n', type: 'symbol', source: 'clienti', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Medium'], 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': C.clt } });
    map.addLayer({ id: 'punti', type: 'circle', source: 'clienti', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['case', ['==', ['get', 'a'], 1], C.app, C.p], 'circle-stroke-color': ['case', ['==', ['get', 'a'], 1], C.p, C.pb], 'circle-stroke-width': ['case', ['==', ['get', 'a'], 1], 3, 2],
      'circle-radius': raggioP(sm), 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'punti-sel', type: 'circle', source: 'clienti', filter: ['==', ['get', 'id'], ''], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': C.sede, 'circle-stroke-width': 3, 'circle-radius': 20, 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'punti-nome', type: 'symbol', source: 'clienti', minzoom: 12.5, filter: ['!', ['has', 'point_count']], layout: { 'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Medium'], 'text-size': 12.5, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-max-width': 12, 'text-optional': true }, paint: { 'text-color': C.lab, 'text-halo-color': C.halo, 'text-halo-width': 1.6 } });
    if (sede) {
      map.addSource('sede', { type: 'geojson', data: { type: 'Feature', properties: { nome: sede.nome }, geometry: { type: 'Point', coordinates: [sede.lon, sede.lat] } } });
      map.addLayer({ id: 'sede', type: 'symbol', source: 'sede', layout: { 'icon-image': 'sede', 'icon-allow-overlap': true, 'icon-size': 1, 'text-field': 'Sede', 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': C.lab, 'text-halo-color': C.halo, 'text-halo-width': 1.6 } });
    }
    const pop = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'vd-pop' });
    const riquadro = () => { if (bbReg) return new ml.LngLatBounds([bbReg[0], bbReg[1]], [bbReg[2], bbReg[3]]); const b = punti.reduce((b, p) => b.extend([p.lon, p.lat]), new ml.LngLatBounds()); if (sede) b.extend([sede.lon, sede.lat]); return b; };

    map.on('mouseenter', 'punti', e => { map.getCanvas().style.cursor = 'pointer'; const f = e.features[0]; const p = punti.find(x => x.id === f.properties.id); if (p) pop.setLngLat(f.geometry.coordinates).setDOMContent(p.tip()).addTo(map); });
    map.on('mouseleave', 'punti', () => { map.getCanvas().style.cursor = ''; pop.remove(); });
    map.on('mouseenter', 'gruppi', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'gruppi', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'gruppi', async e => { const f = e.features[0]; const z = await map.getSource('clienti').getClusterExpansionZoom(f.properties.cluster_id); map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.3, 18) }); });
    map.on('click', 'punti', e => { const id = e.features[0].properties.id; onPunto?.(id); });
    // una colonna del rilievo: al passaggio quanto vale la zona, con un tocco ci si entra
    map.on('mousemove', 'rilievo', e => { if (modo !== 'rilievo') return; const p = e.features[0].properties; map.getCanvas().style.cursor = 'pointer';
      const d = document.createElement('div'); d.className = 'vd-popt'; const b = document.createElement('b'); b.textContent = `${Math.round(p.f).toLocaleString('it-IT')} €`; const r1 = document.createElement('div'); r1.textContent = `${p.n} ${p.n === 1 ? 'cliente' : 'clienti'} in questa zona`; const r2 = document.createElement('div'); r2.className = 'muted'; r2.textContent = p.nomi; d.append(b, r1, r2);
      pop.setLngLat(e.lngLat).setDOMContent(d).addTo(map); });
    map.on('mouseleave', 'rilievo', () => { map.getCanvas().style.cursor = ''; pop.remove(); });
    map.on('click', 'rilievo', e => { if (modo !== 'rilievo') return; const p = e.features[0].properties; pop.remove(); map.flyTo({ center: [p.cx, p.cy], zoom: 11, pitch: 0, bearing: 0, speed: 1.2 }); });
    const zona = () => { const b = map.getBounds(); onZona?.(punti.filter(p => b.contains([p.lon, p.lat])), map.getZoom(), [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]]); };
    map.on('moveend', zona); zona();
    // allontanandosi, la vista torna dritta
    map.on('zoomend', () => { if (modo !== 'rilievo' && map.getZoom() < 13.5 && (map.getPitch() > 1 || Math.abs(map.getBearing()) > 1)) map.easeTo({ pitch: 0, bearing: 0, duration: 700 }); });
    // il cliente scelto pulsa tre volte, poi l'anello resta fermo (la mappa non si ridisegna di continuo)
    let selId = '', anim = 0, t0 = 0;
    const fermo = () => { anim = 0; try { map.setPaintProperty('punti-sel', 'circle-radius', 20); map.setPaintProperty('punti-sel', 'circle-stroke-opacity', 1); } catch { } };
    const pulsa = t => { if (!selId) return fermo(); t0 ||= t; const e = t - t0; if (e > 2400) return fermo(); const k = (1 - Math.cos(e / 800 * 2 * Math.PI)) / 2; try { map.setPaintProperty('punti-sel', 'circle-radius', 20 + 9 * k); map.setPaintProperty('punti-sel', 'circle-stroke-opacity', 1 - 0.65 * k); } catch { anim = 0; return; } anim = requestAnimationFrame(pulsa); };
    const seleziona = id => { selId = id || ''; map.setFilter('punti-sel', ['==', ['get', 'id'], selId]); cancelAnimationFrame(anim); t0 = 0; anim = 0; if (selId && !matchMedia('(prefers-reduced-motion: reduce)').matches) anim = requestAnimationFrame(pulsa); };
    let modo = 'punti';
    return {
      map, dettaglio: haDettaglio(), province: (regione ? provReg : conClienti).filter(dettaglioDi), regione, soloRegione: soloDett,
      vola(id) {
        const p = punti.find(x => x.id === id); if (!p) return; seleziona(id);
        const vicino = p.prec === 'civico' || p.prec === 'stimato', z = vicino ? 17.2 : p.prec === 'via' ? 15.5 : 12.5, d3 = vicino && haDettaglio() && dettaglioDi(p.prov) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), z), pitch: d3 ? 52 : 0, bearing: d3 ? -18 : 0, speed: 1.4, curve: 1.5, essential: true });
      },
      tutta() { const b = riquadro(); if (b.isEmpty()) return;
        if (modo === 'rilievo') { const cam = map.cameraForBounds(b, { padding: { top: 10, bottom: 150, left: 30, right: 30 } }); map.jumpTo({ center: cam.center, zoom: Math.min(9, cam.zoom + 0.3), pitch: 50, bearing: -14 }); }
        else map.fitBounds(b, { padding: bbReg ? 28 : 40, maxZoom: 15, duration: 0, pitch: 0, bearing: 0 }); },
      // «Rilievo»: la vista s'inclina sull'Italia e le colonne crescono; «Clienti»: le colonne scendono e la vista torna dritta
      rilievo(on) {
        const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
        modo = on ? 'rilievo' : 'punti'; pop.remove();
        for (const l of ['zone-alone']) map.setLayoutProperty(l, 'visibility', on ? 'none' : 'visible');
        for (const l of ['gruppi', 'gruppi-n', 'punti']) map.setLayerZoomRange(l, on ? 10.5 : 0, 24);
        if (on) {
          for (const l of ['rilievo', 'rilievo-base']) map.setLayoutProperty(l, 'visibility', 'visible');
          const b = riquadro(), cam = !b.isEmpty() && map.cameraForBounds(b, { padding: { top: 10, bottom: 150, left: 30, right: 30 } });
          if (cam) scalaR = Math.max(0.12, Math.min(1, 2 ** (5.6 - Math.min(9, cam.zoom + 0.3))));
          if (cam) map.easeTo({ center: cam.center, zoom: Math.min(9, cam.zoom + 0.3), pitch: 50, bearing: -14, duration: quieto ? 0 : 1400 });
          if (quieto) { crescita = 1; map.setPaintProperty('rilievo', 'fill-extrusion-height', altezza(1)); } else cresci(0, 1, 1400);
        } else {
          cancelAnimationFrame(animR); for (const l of ['rilievo', 'rilievo-base']) map.setLayoutProperty(l, 'visibility', 'none');
          map.setPaintProperty('rilievo', 'fill-extrusion-height', altezza(0)); crescita = 0;
          if (map.getZoom() < 13.5) map.easeTo({ pitch: 0, bearing: 0, duration: quieto ? 0 : 900 });
        }
      },
      get modo() { return modo; },
      aggiorna(P) { punti = P; const k = smDi(P), d = fcDi(P); map.getSource('clienti').setData(d); ril = esagoni(P); map.getSource('rilievo').setData(ril.fc); map.setPaintProperty('gruppi', 'circle-radius', raggioG(k)); map.setPaintProperty('punti', 'circle-radius', raggioP(k)); zona(); },
      seleziona,
      chiudi() { selId = ''; cancelAnimationFrame(anim); cancelAnimationFrame(animR); pop.remove(); map.remove(); },
    };
  }
  const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

  return { APezzi, libreria, separa, viaNorm, civNorm, cerca, indice, haDettaglio, dettaglioDi, haCivici, usaFile, scegliCartella, riprendi, ricordata, disegna, webgl, cartella, confini, _reset() { indici.clear(); archivi.clear(); fontiP = null; } };
})();
