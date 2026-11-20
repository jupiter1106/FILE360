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

/* =====================================================================
   Analisi delle vendite dalle fatture attive: dove sono i clienti (mappa), chi sono, che cosa comprano, quando,
   come pagano, e le scoperte che contano per l'azienda. Tutto sul dispositivo: solo i dati scritti nelle fatture,
   coordinate dei Comuni dall'elenco incorporato (GEO_IT), nessuna richiesta di rete.
   ===================================================================== */
const Vendite = (() => {
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const MOD_PAG = { MP01: 'Contanti', MP02: 'Assegno', MP03: 'Assegno circolare', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP09: 'RID', MP10: 'RID utenze', MP11: 'RID veloce', MP12: 'RIBA', MP13: 'MAV', MP14: 'Quietanza erario', MP15: 'Giroconto', MP16: 'Domiciliazione bancaria', MP17: 'Domiciliazione postale', MP18: 'Bollettino postale', MP19: 'SEPA Direct Debit', MP20: 'SEPA Direct Debit CORE', MP21: 'SEPA Direct Debit B2B', MP22: 'Trattenuta su somme già riscosse', MP23: 'PagoPA' };
  const PAESI = { AT: 'Austria', BE: 'Belgio', BG: 'Bulgaria', CH: 'Svizzera', CN: 'Cina', CY: 'Cipro', CZ: 'Repubblica Ceca', DE: 'Germania', DK: 'Danimarca', EE: 'Estonia', ES: 'Spagna', FI: 'Finlandia', FR: 'Francia', GB: 'Regno Unito', GR: 'Grecia', HR: 'Croazia', HU: 'Ungheria', IE: 'Irlanda', LT: 'Lituania', LU: 'Lussemburgo', LV: 'Lettonia', MT: 'Malta', NL: 'Paesi Bassi', NO: 'Norvegia', PL: 'Polonia', PT: 'Portogallo', RO: 'Romania', SE: 'Svezia', SI: 'Slovenia', SK: 'Slovacchia', SM: 'San Marino', VA: 'Città del Vaticano', US: 'Stati Uniti', CA: 'Canada', AE: 'Emirati Arabi Uniti', JP: 'Giappone', BR: 'Brasile', AU: 'Australia', TR: 'Turchia', AL: 'Albania', RS: 'Serbia', MA: 'Marocco', TN: 'Tunisia', IL: 'Israele', IN: 'India', MX: 'Messico', RU: 'Russia', UA: 'Ucraina' };
  const DAY = 864e5;
  const r2 = v => Math.round(v * 100) / 100;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  /* ---------- luoghi: Comune → coordinate (elenco incorporato), con il CAP e la provincia come riserva ---------- */
  let G = null;
  function geo() {
    if (G) return G;
    const src = typeof GEO_IT !== 'undefined' ? GEO_IT : null;
    G = { byKey: new Map(), byName: new Map(), byCap: new Map(), prov: {}, ok: !!src, proj: src?.proj, regioni: src?.regioni || [] };
    if (!src) return G;
    for (const line of src.comuni.split('|')) {
      const [nomi, s, ri, x, y, caps, b, cl] = line.split(';');
      const [n, alt] = nomi.split('/');
      const o = { n, s, r: G.regioni[+ri], x: +x, y: +y, cap: caps, cl: !!cl };
      for (const nn of [n, alt].filter(Boolean)) {
        const k = norm(nn); G.byKey.set(k + '|' + s, o);
        if (!G.byName.has(k)) G.byName.set(k, []); G.byName.get(k).push(o);
      }
      for (const c of caps.split(' ').filter(Boolean)) {
        const [a, z] = c.split('-'); const lo = +a, hi = +(z || a);
        for (let v = lo; v <= hi && v - lo < 200; v++) { const k = String(v).padStart(5, '0'); if (!G.byCap.has(k)) G.byCap.set(k, o); }
      }
    }
    for (const [sig, p] of Object.entries(src.province)) G.prov[sig] = { n: p.n, r: p.r, x: p.c[0], y: p.c[1] };
    return G;
  }
  // dalla proiezione della mappa a latitudine e longitudine (per le distanze in km)
  function lonLat(x, y) { const P = geo().proj; const lon = P.lon0 + x / P.k * 180 / Math.PI; const Y0 = Math.log(Math.tan(Math.PI / 4 + P.lat1 * Math.PI / 360)); const lat = (2 * Math.atan(Math.exp(Y0 - y / P.k)) - Math.PI / 2) * 180 / Math.PI; return [lon, lat]; }
  function km(a, b) { const [lo1, la1] = lonLat(a.x, a.y), [lo2, la2] = lonLat(b.x, b.y), R = 6371, t = Math.PI / 180; const dLa = (la2 - la1) * t, dLo = (lo2 - lo1) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  // la sede di una parte: Comune e provincia → Comune; poi solo il Comune (se il nome è unico); poi il CAP; poi la provincia
  function luogo(a) {
    const g = geo(), naz = (a?.nazAll || a?.naz || 'IT').toUpperCase() || 'IT';
    if (naz !== 'IT') return { estero: true, naz, paese: PAESI[naz] || naz, prec: 'estero' };
    if (!g.ok) return { prec: null };
    const com = String(a?.comune || '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim(), prov = String(a?.prov || '').toUpperCase().trim(), cap = String(a?.cap || '').replace(/\D/g, '');
    const fix = s => s.replace(/(\w)'$/u, (m, c) => ({ a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' })[c] || m);   // «Forli'» → «Forlì»
    const k = norm(fix(com));
    let o = (k && prov && g.byKey.get(k + '|' + prov)) || null, prec = o ? 'comune' : null;
    if (!o && k) { const l = g.byName.get(k) || []; if (l.length === 1) { o = l[0]; prec = 'comune'; } else if (l.length > 1 && cap) { o = l.find(x => g.byCap.get(cap) === x) || null; if (o) prec = 'comune'; } }
    if (!o && k) { // «Reggio Emilia» per «Reggio nell'Emilia», «Monza» per «Monza»: il nome scritto è l'inizio o la fine di uno solo nella provincia
      const cand = []; for (const [kk, l] of g.byName) if (kk.length > 3 && (kk.startsWith(k) || k.startsWith(kk) || kk.replace(/nell|nella|di|del|della/g, '') === k)) for (const x of l) if (!prov || x.s === prov) cand.push(x);
      if (cand.length === 1) { o = cand[0]; prec = 'comune'; }
    }
    if (!o && cap.length === 5 && g.byCap.has(cap)) { o = g.byCap.get(cap); prec = 'cap'; }
    if (o) return { x: o.x, y: o.y, comune: o.n, prov: o.s, regione: o.r, prec, scritto: com };
    if (prov && g.prov[prov]) { const p = g.prov[prov]; return { x: p.x, y: p.y, comune: com || '', prov, regione: p.r, prec: 'provincia', scritto: com }; }
    return { prec: null, scritto: com, prov };
  }

  /* ---------- lettura: fatture attive dell'azienda (chi emette più fatture tra quelle caricate) ---------- */
  const chiave = a => String(a?.piva || a?.cf || a?.nome || '').toUpperCase().replace(/\s/g, '') || '?';
  // descrizione della riga senza mesi, anni, date e numeri d'ordine: «Consulenza ottobre 2024» e «Consulenza novembre 2024» sono lo stesso servizio
  const pulisciDesc = d => String(d || '').replace(/\s+/g, ' ').trim();
  const chiaveProdotto = (r) => { const cod = (r.codici || []).find(c => c.v)?.v; if (cod) return 'c:' + cod.toUpperCase(); return 'd:' + norm(pulisciDesc(r.desc).toLowerCase().replace(new RegExp(`\\b(${MESI.join('|')}|${MESI3.join('|')})\\b`, 'g'), '').replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(n\.?|nr\.?|numero)\s*\d+/g, '').replace(/\s+/g, ' ')).slice(0, 60); };
  function prepara(invs, meScelto = null) {
    const conta = new Map();
    for (const f of invs) { const k = chiave(f.cedente); conta.set(k, (conta.get(k) || 0) + 1); }
    const meKey = meScelto || [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const meInv = invs.find(f => chiave(f.cedente) === meKey);
    const me = meInv ? { key: meKey, nome: meInv.cedente.nome, piva: meInv.cedente.piva, luogo: luogo(meInv.cedente), sede: meInv.cedente.citta, via: meInv.cedente.via || '' } : null;
    const emittenti = [...conta.entries()].map(([k, n]) => ({ key: k, n, nome: invs.find(f => chiave(f.cedente) === k)?.cedente.nome || k }));
    const fatture = [], scartate = { passive: 0, autofatture: 0, altre: 0 };
    for (const f of invs) {
      if (chiave(f.cedente) !== meKey) { if (me && chiave(f.cessionario) === meKey) scartate.passive++; else scartate.altre++; continue; }
      if (f.classe === 'auto') { scartate.autofatture++; continue; }
      const segno = f.tipo === 'TD04' || f.tipo === 'TD08' ? -1 : 1;
      const c = f.cessionario || {}, ck = chiave(c);
      const pa = /^FPA/.test(f.trasm?.formato || '') || (String(f.trasm?.destinatario || '').length === 6 && f.trasm?.destinatario !== '000000');
      const pag = (f.pagamenti || []).flatMap(p => p.dettagli || []);
      const righe = (f.righe || []).filter(r => r.desc || r.totale).map(r => ({ k: chiaveProdotto(r), desc: pulisciDesc(r.desc), qta: segno * (r.qta || (r.totale ? 1 : 0)), um: r.um || '', prezzo: r.prezzo || 0, tot: segno * (r.totale || 0) }));
      fatture.push({
        id: f.id, numero: f.numero, data: f.data, t: Date.parse(f.data) || 0, tipo: f.tipo, segno,
        imp: segno * (f.imponibile || 0), iva: segno * (f.imposta || 0), tot: segno * (f.totale || 0),
        cli: ck, cliNome: c.nome || '(senza nome)', persona: !!c.persona || (!c.piva && !!c.cf && !pa), pa, cliDati: c,
        righe, modalita: pag[0]?.modalita || '', scadenze: pag.filter(d => d.scadenza).map(d => ({ data: d.scadenza, t: Date.parse(d.scadenza), imp: d.importo || 0 })),
        file: f.srcName,
      });
    }
    fatture.sort((a, b) => a.t - b.t);
    // una scheda per cliente con la sua posizione
    const clienti = new Map();
    for (const f of fatture) if (!clienti.has(f.cli)) clienti.set(f.cli, { key: f.cli, nome: f.cliNome, piva: f.cliDati.piva, cf: f.cliDati.cf, persona: f.persona, pa: f.pa, luogo: luogo(f.cliDati), sede: f.cliDati.citta || '', via: f.cliDati.via || '' });
    return { me, emittenti, fatture, clienti, scartate };
  }

  /* ---------- analisi: tutte le misure su un insieme filtrato ---------- */
  const ym = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const meseNome = k => `${MESI[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
  function filtra(D, f = {}) {
    return D.fatture.filter(x => (!f.da || x.t >= f.da) && (!f.a || x.t <= f.a) && (!f.cliente || x.cli === f.cliente) && (!f.tipoCli || (f.tipoCli === 'pa' ? x.pa : f.tipoCli === 'privati' ? x.persona : !x.pa && !x.persona))
      && (!f.regione && !f.prov && !f.comune && !f.estero || (() => { const l = D.clienti.get(x.cli)?.luogo || {}; return f.estero ? !!l.estero : (!f.regione || l.regione === f.regione) && (!f.prov || l.prov === f.prov) && (!f.comune || l.comune === f.comune); })())
      && (!f.prodotto || x.righe.some(r => r.k === f.prodotto)));
  }
  function analizza(D, filtro = {}, oggi = Date.now()) {
    const F = filtra(D, filtro), A = {};
    const pos = F.filter(f => f.segno > 0), neg = F.filter(f => f.segno < 0);
    A.fatturato = r2(F.reduce((s, f) => s + f.imp, 0)); A.iva = r2(F.reduce((s, f) => s + f.iva, 0)); A.note = r2(-neg.reduce((s, f) => s + f.imp, 0));
    A.nFatture = pos.length; A.nNote = neg.length; A.media = pos.length ? r2(pos.reduce((s, f) => s + f.imp, 0) / pos.length) : 0;
    A.da = F[0]?.t || null; A.a = F[F.length - 1]?.t || null;
    // mesi (anche quelli vuoti, dal primo all'ultimo)
    const mesi = new Map();
    if (F.length) { const d0 = new Date(F[0].t), d1 = new Date(F[F.length - 1].t); for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d <= d1; d.setMonth(d.getMonth() + 1)) mesi.set(ym(d.getTime()), { k: ym(d.getTime()), fatt: 0, n: 0, nuovi: 0, clienti: new Set() }); }
    const primoAcquisto = new Map(); for (const f of D.fatture) if (f.segno > 0 && !primoAcquisto.has(f.cli)) primoAcquisto.set(f.cli, f.t);
    for (const f of F) { const m = mesi.get(ym(f.t)); if (!m) continue; m.fatt += f.imp; if (f.segno > 0) { m.n++; m.clienti.add(f.cli); if (ym(primoAcquisto.get(f.cli)) === m.k) m.nuovi++; } }
    A.mesi = [...mesi.values()].map(m => ({ k: m.k, nome: meseNome(m.k), fatt: r2(m.fatt), n: m.n, nuovi: m.nuovi, clienti: m.clienti.size }));
    // clienti
    const C = new Map();
    for (const f of F) {
      let c = C.get(f.cli); if (!c) { const s = D.clienti.get(f.cli); c = { ...s, fatt: 0, n: 0, note: 0, date: [], prodotti: new Map(), termini: [], modalita: new Map() }; C.set(f.cli, c); }
      c.fatt += f.imp; if (f.segno > 0) { c.n++; c.date.push(f.t); } else c.note -= f.imp;
      for (const r of f.righe) { const p = c.prodotti.get(r.k) || { k: r.k, desc: r.desc, fatt: 0, qta: 0 }; p.fatt += r.tot; p.qta += r.qta; c.prodotti.set(r.k, p); }
      for (const s of f.scadenze) if (f.segno > 0 && s.t && f.t) c.termini.push(Math.round((s.t - f.t) / DAY));
      if (f.modalita && f.segno > 0) c.modalita.set(f.modalita, (c.modalita.get(f.modalita) || 0) + f.imp);
    }
    const lista = [...C.values()].map(c => {
      const d = [...new Set(c.date)].sort((a, b) => a - b), gaps = d.slice(1).map((t, i) => (t - d[i]) / DAY), gapMed = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
      const ultimo = d[d.length - 1] || null, primo = d[0] || null, giorni = ultimo ? Math.round((oggi - ultimo) / DAY) : null;
      return { key: c.key, nome: c.nome, piva: c.piva, persona: c.persona, pa: c.pa, luogo: c.luogo, sede: c.sede, via: c.via, fatt: r2(c.fatt), n: c.n, note: r2(c.note), primo, ultimo, giorni, ritmo: gapMed != null ? Math.round(gapMed) : null,
        prossimo: ultimo && gapMed ? ultimo + gapMed * DAY : null, prodotti: [...c.prodotti.values()].sort((a, b) => b.fatt - a.fatt).map(p => ({ ...p, fatt: r2(p.fatt) })),
        termini: c.termini.length ? Math.round(c.termini.reduce((a, b) => a + b, 0) / c.termini.length) : null, modalita: [...c.modalita.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '' };
    }).sort((a, b) => b.fatt - a.fatt);
    // ABC e segmenti (RFM): chi compra da poco, spesso e molto
    const tot = lista.reduce((s, c) => s + Math.max(0, c.fatt), 0) || 1; let acc = 0;
    for (const c of lista) { acc += Math.max(0, c.fatt); c.quota = Math.max(0, c.fatt) / tot; c.abc = acc / tot <= 0.8 + 1e-9 || c === lista[0] ? 'A' : acc / tot <= 0.95 ? 'B' : 'C'; }
    const rank = (arr, f) => { const v = arr.map(f).filter(x => x != null).sort((a, b) => a - b); return x => x == null || !v.length ? 0 : (v.findIndex(y => y >= x) + 1) / v.length; };
    const rR = rank(lista, c => c.giorni == null ? null : -c.giorni), rF = rank(lista, c => c.n), rM = rank(lista, c => c.fatt), fine = A.a || oggi;
    for (const c of lista) {
      const R = rR(c.giorni == null ? null : -c.giorni), Fq = rF(c.n), M = rM(c.fatt), assente = c.ultimo ? (fine - c.ultimo) / DAY : 0;
      const atteso = c.ritmo ? Math.max(c.ritmo * 2.2, 45) : 120;
      c.dormiente = c.n >= 3 && assente > atteso;
      c.segmento = c.n === 0 ? 'note' : c.dormiente && M >= 0.6 ? 'da recuperare' : c.dormiente ? 'persi' : c.primo && (fine - c.primo) / DAY < 120 ? 'nuovi' : R >= 0.6 && Fq >= 0.6 && M >= 0.6 ? 'campioni' : Fq >= 0.5 && R >= 0.4 ? 'fedeli' : R < 0.35 ? 'a rischio' : 'da coltivare';
    }
    A.clienti = lista; A.nClienti = lista.filter(c => c.n > 0).length;
    A.segmenti = ['campioni', 'fedeli', 'nuovi', 'da coltivare', 'a rischio', 'da recuperare', 'persi'].map(s => { const l = lista.filter(c => c.segmento === s); return { s, n: l.length, fatt: r2(l.reduce((a, c) => a + c.fatt, 0)) }; }).filter(x => x.n);
    // concentrazione: quanti clienti fanno l'80%, quota dei primi 3 e 5, indice di Herfindahl
    let k80 = 0; acc = 0; for (const c of lista) { if (acc / tot >= 0.8) break; acc += Math.max(0, c.fatt); k80++; }
    A.pareto = { n80: k80, su: lista.length, top3: lista.slice(0, 3).reduce((s, c) => s + c.quota, 0), top5: lista.slice(0, 5).reduce((s, c) => s + c.quota, 0), hhi: Math.round(lista.reduce((s, c) => s + (c.quota * 100) ** 2, 0)) };
    // prodotti e servizi
    const P = new Map(), perFattura = [];
    for (const f of F) {
      const ks = new Set();
      for (const r of f.righe) {
        let p = P.get(r.k); if (!p) { p = { k: r.k, desc: r.desc, um: r.um, fatt: 0, qta: 0, righe: 0, clienti: new Set(), prezzi: [] }; P.set(r.k, p); }
        p.fatt += r.tot; p.qta += r.qta; p.righe++; if (f.segno > 0) { p.clienti.add(f.cli); if (r.prezzo) p.prezzi.push([f.t, r.prezzo]); ks.add(r.k); }
        if (r.desc.length > p.desc.length && r.desc.length < 80 && p.righe < 3) p.desc = r.desc;
      }
      if (ks.size) perFattura.push([...ks]);
    }
    A.prodotti = [...P.values()].map(p => {
      const pr = p.prezzi.sort((a, b) => a[0] - b[0]), q = Math.max(1, Math.floor(pr.length / 4));
      const m0 = pr.slice(0, q).reduce((s, x) => s + x[1], 0) / q, m1 = pr.slice(-q).reduce((s, x) => s + x[1], 0) / q;
      return { k: p.k, desc: p.desc, um: p.um, fatt: r2(p.fatt), qta: r2(p.qta), righe: p.righe, clienti: p.clienti.size, prezzoMedio: pr.length ? r2(pr.reduce((s, x) => s + x[1], 0) / pr.length) : null, variazione: pr.length >= 6 && m0 ? (m1 - m0) / m0 : null, prezzi: pr };
    }).sort((a, b) => b.fatt - a.fatt);
    // comprati insieme: coppie con il loro «lift» (quanto più spesso del caso)
    const nF = perFattura.length || 1, cnt = new Map(), pair = new Map();
    for (const ks of perFattura) { for (const a of ks) cnt.set(a, (cnt.get(a) || 0) + 1); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const k = [ks[i], ks[j]].sort().join('\u0001'); pair.set(k, (pair.get(k) || 0) + 1); } }
    const nomeP = k => P.get(k)?.desc || k;
    A.coppie = [...pair.entries()].map(([k, n]) => { const [a, b] = k.split('\u0001'); return { a, b, nomeA: nomeP(a), nomeB: nomeP(b), n, lift: (n / nF) / ((cnt.get(a) / nF) * (cnt.get(b) / nF)), conf: n / Math.min(cnt.get(a), cnt.get(b)) }; })
      .filter(x => x.n >= 3).sort((x, y) => (y.lift * Math.log(1 + y.n)) - (x.lift * Math.log(1 + x.n))).slice(0, 12);
    // territorio: un punto per Comune, poi province, regioni, estero
    const L = new Map(), prov = new Map(), reg = new Map(), est = new Map(); let senza = 0, senzaFatt = 0;
    for (const c of lista) {
      const l = c.luogo || {};
      if (l.estero) { const e = est.get(l.naz) || { naz: l.naz, paese: l.paese, fatt: 0, clienti: [] }; e.fatt += c.fatt; e.clienti.push(c); est.set(l.naz, e); continue; }
      if (l.x == null) { senza++; senzaFatt += c.fatt; continue; }
      const k = `${l.comune}|${l.prov}`; const p = L.get(k) || { k, comune: l.comune, prov: l.prov, regione: l.regione, x: l.x, y: l.y, prec: l.prec, fatt: 0, clienti: [] };
      p.fatt += c.fatt; p.clienti.push(c); L.set(k, p);
      prov.set(l.prov, (prov.get(l.prov) || 0) + c.fatt); reg.set(l.regione, (reg.get(l.regione) || 0) + c.fatt);
    }
    A.luoghi = [...L.values()].map(p => ({ ...p, fatt: r2(p.fatt) })).sort((a, b) => b.fatt - a.fatt);
    A.province = [...prov.entries()].map(([s, v]) => ({ s, nome: geo().prov[s]?.n || s, fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt);
    A.regioni = [...reg.entries()].map(([n, v]) => ({ n, fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt);
    A.estero = [...est.values()].map(e => ({ ...e, fatt: r2(e.fatt) })).sort((a, b) => b.fatt - a.fatt);
    A.senzaLuogo = { n: senza, fatt: r2(senzaFatt) };
    A.precisione = { comune: lista.filter(c => c.luogo?.prec === 'comune').length, cap: lista.filter(c => c.luogo?.prec === 'cap').length, provincia: lista.filter(c => c.luogo?.prec === 'provincia').length, estero: lista.filter(c => c.luogo?.estero).length, nessuna: senza };
    // distanza dalla sede (raggio d'azione)
    const sede = D.me?.luogo;
    if (sede?.x != null) {
      const fasce = [25, 50, 100, 250, Infinity].map(r => ({ r, fatt: 0, n: 0 }));
      for (const p of A.luoghi) { const d = km(sede, p); p.km = Math.round(d); const f = fasce.find(x => d <= x.r); f.fatt += p.fatt; f.n += p.clienti.length; }
      A.distanze = { sede, fasce: fasce.map(f => ({ ...f, fatt: r2(f.fatt) })), mediana: (() => { const v = A.luoghi.flatMap(p => p.clienti.map(c => [p.km, c.fatt])).sort((a, b) => a[0] - b[0]); let s = 0, half = v.reduce((a, x) => a + Math.max(0, x[1]), 0) / 2; for (const [d, f] of v) { s += Math.max(0, f); if (s >= half) return d; } return null; })() };
    }
    // pagamenti: modalità, termini concessi, scadenze dei prossimi mesi (dalle fatture: non sappiamo se sono state pagate)
    const mod = new Map(); let tg = 0, tw = 0; const fut = [30, 60, 90].map(d => ({ d, imp: 0, n: 0 }));
    for (const f of pos) {
      mod.set(f.modalita || '—', (mod.get(f.modalita || '—') || 0) + f.imp);
      for (const s of f.scadenze) { if (s.t && f.t) { tg += (s.t - f.t) / DAY * f.imp; tw += f.imp; } const dd = (s.t - oggi) / DAY; if (dd >= 0) { const b = fut.find(x => dd <= x.d); if (b) { b.imp += s.imp; b.n++; } } }
    }
    A.pagamenti = { modalita: [...mod.entries()].map(([k, v]) => ({ k, nome: MOD_PAG[k] || (k === '—' ? 'Non indicata' : k), fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt), termini: tw ? Math.round(tg / tw) : null, futuro: fut.map(x => ({ ...x, imp: r2(x.imp) })),
      lunghi: lista.filter(c => c.termini != null && c.termini >= 90).slice(0, 8) };
    // stagionalità: media di ogni mese dell'anno
    const perMese = Array.from({ length: 12 }, () => []); for (const m of A.mesi) perMese[+m.k.slice(5) - 1].push(m.fatt);
    A.stagioni = perMese.map((v, i) => ({ m: i, nome: MESI[i], media: v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null, anni: v.length }));
    // previsione dei prossimi 3 mesi: tendenza lineare × indice stagionale (solo con almeno 12 mesi di storia)
    A.previsione = previsione(A.mesi);
    // confronto con il periodo precedente di uguale durata
    if (A.da && A.a && !filtro.da) A.crescita = crescita(F, A.a);   // F è già filtrato senza limiti di data
    A.scoperte = scoperte(A, D, oggi);
    return A;
  }
  function previsione(mesi) {
    if (mesi.length < 12) return null;
    const v = mesi.map(m => m.fatt), n = v.length, xs = v.map((_, i) => i), mx = (n - 1) / 2, my = v.reduce((a, b) => a + b, 0) / n;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (v[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0), a = my - b * mx;
    const idx = Array(12).fill(0).map(() => []); mesi.forEach((m, i) => idx[+m.k.slice(5) - 1].push(v[i] / Math.max(1, a + b * i)));
    const si = idx.map(l => l.length ? l.reduce((s, x) => s + x, 0) / l.length : 1);
    const res = v.map((y, i) => y - (a + b * i) * si[+mesi[i].k.slice(5) - 1]), sd = Math.sqrt(res.reduce((s, x) => s + x * x, 0) / Math.max(1, n - 2));
    const last = mesi[n - 1].k; let [Y, M] = last.split('-').map(Number); const out = [];
    for (let h = 1; h <= 3; h++) { M++; if (M > 12) { M = 1; Y++; } const k = `${Y}-${String(M).padStart(2, '0')}`, val = Math.max(0, (a + b * (n - 1 + h)) * si[M - 1]); out.push({ k, nome: meseNome(k), val: r2(val), lo: r2(Math.max(0, val - 1.28 * sd)), hi: r2(val + 1.28 * sd) }); }
    return { mesi: out, tendenza: b, base: my };
  }
  function crescita(F, fine) {
    const anno = 365 * DAY, a1 = F.filter(f => f.t > fine - anno), a0 = F.filter(f => f.t <= fine - anno && f.t > fine - 2 * anno);
    if (!a0.length || (F[0]?.t || fine) > fine - 2 * anno + 30 * DAY) return null;
    const s1 = a1.reduce((s, f) => s + f.imp, 0), s0 = a0.reduce((s, f) => s + f.imp, 0);
    return { ultimi12: r2(s1), precedenti12: r2(s0), var: s0 ? (s1 - s0) / s0 : null };
  }

  /* ---------- scoperte: frasi con i numeri, ordinate per importanza ---------- */
  const eur = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);
  const pct = v => `${Math.round(v * 100)}%`;
  function scoperte(A, D, oggi) {
    const S = [], add = (tipo, peso, titolo, testo, azione = null, rif = null) => S.push({ tipo, peso, titolo, testo, azione, rif });
    if (!A.clienti.length) return S;
    const P = A.pareto;
    if (A.clienti.length >= 5 && P.top3 >= 0.4) add('rischio', 90 + P.top3 * 10, `${pct(P.top3)} del fatturato da 3 clienti`, `${A.clienti.slice(0, 3).map(c => c.nome).join(', ')} valgono ${pct(P.top3)} del fatturato. Se uno di loro rallenta, il colpo è forte: conviene allargare la base clienti.`, 'Vedi i clienti', { tab: 'clienti' });
    else if (A.clienti.length >= 10) add('info', 40, `L'80% del fatturato da ${P.n80} clienti su ${P.su}`, `Il fatturato è ben distribuito: i primi 5 clienti valgono ${pct(P.top5)}.`);
    const dorm = A.clienti.filter(c => c.dormiente && c.fatt > 0).sort((a, b) => b.fatt - a.fatt);
    if (dorm.length) { const c = dorm[0]; add('azione', 85 + Math.min(10, c.quota * 100), `${c.nome} non compra da ${c.giorni} giorni`, `Di solito comprava ogni ${c.ritmo} giorni e vale ${eur(c.fatt)} (${pct(c.quota)} del fatturato). ${dorm.length > 1 ? `Altri ${dorm.length - 1} clienti abituali sono fermi da molto più del loro solito.` : ''} Una telefonata adesso può recuperarli.`, 'Clienti da ricontattare', { tab: 'clienti', segmento: 'da recuperare' }); }
    const st = A.stagioni.filter(s => s.media != null);
    if (st.length >= 10) {
      const media = st.reduce((s, x) => s + x.media, 0) / st.length, best = st.reduce((a, b) => b.media > a.media ? b : a), worst = st.reduce((a, b) => b.media < a.media ? b : a);
      if (best.media > media * 1.2) add('stagione', 70, `${best.nome[0].toUpperCase() + best.nome.slice(1)} è il mese migliore`, `In media ${eur(best.media)}, il ${pct(best.media / media - 1)} sopra un mese normale; ${worst.nome} è il più debole (${pct(1 - worst.media / media)} sotto). Prepara scorte e personale per tempo e usa ${worst.nome} per manutenzione e promozioni.`, null, { tab: 'tempo' });
    }
    if (A.crescita?.var != null) add(A.crescita.var >= 0 ? 'bene' : 'rischio', 75, `${A.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(A.crescita.var))} negli ultimi 12 mesi`, `${eur(A.crescita.ultimi12)} contro ${eur(A.crescita.precedenti12)} dei 12 mesi prima.`, null, { tab: 'tempo' });
    const fine = A.a || oggi, nuovi = A.clienti.filter(c => c.primo && fine - c.primo < 180 * DAY && c.n > 0);
    if (nuovi.length) add('bene', 50, `${nuovi.length} ${nuovi.length === 1 ? 'cliente nuovo' : 'clienti nuovi'} negli ultimi 6 mesi`, `Valgono già ${eur(nuovi.reduce((s, c) => s + c.fatt, 0))}. Il primo riacquisto è il momento in cui un cliente nuovo diventa abituale: seguili da vicino.`, null, { tab: 'clienti', segmento: 'nuovi' });
    const p0 = A.prodotti[0]; if (p0 && A.fatturato > 0) add('info', 45, `${p0.desc} vale ${pct(p0.fatt / A.fatturato)} del fatturato`, `Lo comprano ${p0.clienti} clienti.${A.prodotti[1] ? ` Seguono ${A.prodotti[1].desc} (${pct(A.prodotti[1].fatt / A.fatturato)})${A.prodotti[2] ? ` e ${A.prodotti[2].desc} (${pct(A.prodotti[2].fatt / A.fatturato)})` : ''}.` : ''}`, null, { tab: 'prodotti' });
    const pv = A.prodotti.filter(p => p.variazione != null && Math.abs(p.variazione) >= 0.05).sort((a, b) => Math.abs(b.variazione) * b.fatt - Math.abs(a.variazione) * a.fatt)[0];
    if (pv) add('info', 55, `Prezzo di ${pv.desc} ${pv.variazione > 0 ? 'salito' : 'sceso'} del ${pct(Math.abs(pv.variazione))}`, `Dal prezzo medio delle prime vendite a quello delle ultime. ${pv.variazione > 0 ? 'Controlla che i clienti principali non stiano comprando meno.' : 'Verifica che lo sconto sia una scelta e non un’abitudine.'}`, null, { tab: 'prodotti' });
    const cp = A.coppie.find(c => c.lift >= 1.5 && c.conf >= 0.6);
    if (cp) {
      const conA = new Set(), conB = new Set(); for (const c of A.clienti) { const ks = new Set(c.prodotti.map(p => p.k)); if (ks.has(cp.a) && !ks.has(cp.b)) conA.add(c.nome); if (ks.has(cp.b) && !ks.has(cp.a)) conB.add(c.nome); }
      const solo = conA.size >= conB.size ? [conA, cp.nomeA, cp.nomeB] : [conB, cp.nomeB, cp.nomeA];
      add('azione', 65, `${cp.nomeA} e ${cp.nomeB} si comprano insieme`, `Succede in ${cp.n} fatture, ${cp.lift.toFixed(1)} volte più spesso del caso.${solo[0].size ? ` ${solo[0].size} ${solo[0].size === 1 ? 'cliente compra' : 'clienti comprano'} ${solo[1]} ma non ${solo[2]}: proponiglielo.` : ''}`, null, { tab: 'prodotti' });
    }
    if (A.distanze) { const f50 = A.distanze.fasce.filter(f => f.r <= 50).reduce((s, f) => s + f.fatt, 0); add('territorio', 60, `${pct(f50 / Math.max(1, A.fatturato))} del fatturato entro 50 km`, `Metà del fatturato viene da clienti entro ${A.distanze.mediana ?? '—'} km dalla sede. ${A.regioni[0] ? `La regione più forte è ${A.regioni[0].n} (${pct(A.regioni[0].fatt / Math.max(1, A.fatturato))}).` : ''}${A.estero.length ? ` All'estero ${A.estero.length} ${A.estero.length === 1 ? 'paese' : 'paesi'}: ${A.estero.map(e => e.paese).join(', ')}.` : ''}`, 'Apri la mappa', { tab: 'mappa' }); }
    if (A.note > 0 && A.note / Math.max(1, A.fatturato + A.note) >= 0.02) { const top = A.clienti.filter(c => c.note > 0).sort((a, b) => b.note - a.note)[0]; add('rischio', 52, `Note di credito: ${pct(A.note / (A.fatturato + A.note))} del fatturato`, `${eur(A.note)} in ${A.nNote} note di credito${top ? `, soprattutto con ${top.nome} (${eur(top.note)})` : ''}. Resi e correzioni costano: vale la pena capire perché.`); }
    if (A.pagamenti.termini != null) add('incassi', A.pagamenti.termini > 60 ? 58 : 35, `Termini di pagamento medi: ${A.pagamenti.termini} giorni`, `${A.pagamenti.lunghi.length ? `${A.pagamenti.lunghi.length} clienti hanno 90 giorni o più (${A.pagamenti.lunghi.slice(0, 3).map(c => c.nome).join(', ')}): stai finanziando i loro acquisti.` : 'Nessun cliente ha termini oltre 90 giorni.'} Nei prossimi 30 giorni scadono fatture per ${eur(A.pagamenti.futuro[0].imp)} (dalle fatture: verifica gli incassi in banca).`, null, { tab: 'incassi' });
    if (A.previsione) { const tot3 = A.previsione.mesi.reduce((s, m) => s + m.val, 0); add('previsione', 48, `Stima dei prossimi 3 mesi: ${eur(tot3)}`, `Con la tendenza e la stagionalità degli ultimi ${A.mesi.length} mesi (${A.previsione.mesi.map(m => `${m.nome.split(' ')[0]} ${eur(m.val)}`).join(', ')}). È una stima, non una promessa.`, null, { tab: 'tempo' }); }
    return S.sort((a, b) => b.peso - a.peso);
  }

  return { prepara, analizza, filtra, luogo, km, geo, lonLat, MESI, MESI3, MOD_PAG, PAESI, eur, pct, meseNome };
})();

/* ---------- lo strumento: filtri in alto, schede, mappa, dettagli nel pannello laterale ---------- */