/* ============================================================
   XbrlKit — dal file XBRL del bilancio (Registro Imprese, tassonomia PCI) a un modello di documento:
   dati anagrafici, prospetti contabili su due esercizi, nota integrativa con testi, prospetti e tabelle
   delle tuple, e un'appendice con ogni dato che non ha trovato posto. Nessun dato viene scartato.
   ============================================================ */
var XBRL_TAXONOMIES = typeof XBRL_TAXONOMIES !== 'undefined' ? XBRL_TAXONOMIES : [];
const XbrlKit = (() => {
  const XBRLI = 'http://www.xbrl.org/2003/instance', LINK = 'http://www.xbrl.org/2003/linkbase', XL = 'http://www.w3.org/1999/xlink', XSI = 'http://www.w3.org/2001/XMLSchema-instance';
  const LSK = 'officina-xbrl-tax-';
  /* ---------- tassonomie ---------- */
  const models = {};
  function b64u8(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function taxonomyList() {
    const out = XBRL_TAXONOMIES.map(t => ({ v: t.v, ns: t.ns, builtin: true }));
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LSK)) { const v = k.slice(LSK.length); if (!out.some(o => o.v === v)) out.push({ v, builtin: false }); } } } catch { }
    return out;
  }
  function model(v) {
    if (models[v]) return models[v];
    let z = XBRL_TAXONOMIES.find(t => t.v === v)?.z;
    if (!z) { try { z = localStorage.getItem(LSK + v); } catch { } }
    if (!z) return null;
    return (models[v] = JSON.parse(new TextDecoder().decode(pako.inflateRaw(b64u8(z)))));
  }
  /* tassonomia caricata dall'utente (zip ufficiale): compilata e salvata nel browser */
  async function addTaxonomyZip(file) {
    const zip = await JSZip.loadAsync(file);
    const files = {};
    for (const [p, e] of Object.entries(zip.files)) if (!e.dir && !/__MACOSX/.test(p) && /\.(xsd|xml)$/i.test(p)) files[p] = await e.async('string');
    const m = XbrlTax.compile(files, DOMParser);
    if (!m.v || !Object.keys(m.ep).length) throw new Error('Lo zip non sembra una tassonomia XBRL PCI (mancano gli schemi o i linkbase).');
    models[m.v] = m;
    try {
      const json = new TextEncoder().encode(JSON.stringify(m));
      const def = typeof CompressionStream !== 'undefined' ? new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : null;
      if (def) { let s = ''; for (let i = 0; i < def.length; i += 0x8000) s += String.fromCharCode.apply(null, def.subarray(i, i + 0x8000)); localStorage.setItem(LSK + m.v, btoa(s)); }
    } catch (e) { console.warn(e); }
    return m.v;
  }
  /* ---------- istanza ---------- */
  function parseInstance(text) {
    const d = new DOMParser().parseFromString(text, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('Il file non è un XML valido: ' + d.getElementsByTagName('parsererror')[0].textContent.slice(0, 160));
    const root = d.documentElement;
    if (root.localName !== 'xbrl' || root.namespaceURI !== XBRLI) throw new Error('Il file non è un documento XBRL (manca l’elemento xbrli:xbrl).');
    const schemaRefs = Array.from(root.getElementsByTagNameNS(LINK, 'schemaRef')).map(e => e.getAttributeNS(XL, 'href') || '');
    const contexts = {}, units = {};
    for (const c of Array.from(root.getElementsByTagNameNS(XBRLI, 'context'))) {
      const per = c.getElementsByTagNameNS(XBRLI, 'period')[0];
      const g = n => per?.getElementsByTagNameNS(XBRLI, n)[0]?.textContent.trim().slice(0, 10) || null;
      const idf = c.getElementsByTagNameNS(XBRLI, 'identifier')[0];
      // lo «scenario» dei bilanci depositati (itcc-ci-…:scen = depositato) non è una dimensione: il contesto resta quello dell'esercizio
      const scenKids = Array.from(c.getElementsByTagNameNS(XBRLI, 'scenario')).flatMap(x => Array.from(x.children || []));
      const extra = c.getElementsByTagNameNS(XBRLI, 'segment').length + scenKids.filter(k => k.localName !== 'scen').length;
      const scen = scenKids.filter(k => k.localName === 'scen').map(k => k.textContent.trim()).join(' ');
      contexts[c.getAttribute('id')] = { id: c.getAttribute('id'), instant: g('instant'), start: g('startDate'), end: g('endDate'), forever: !!per?.getElementsByTagNameNS(XBRLI, 'forever').length, entity: idf?.textContent.trim() || '', scheme: idf?.getAttribute('scheme') || '', dims: extra, scen };
    }
    for (const u of Array.from(root.getElementsByTagNameNS(XBRLI, 'unit'))) units[u.getAttribute('id')] = Array.from(u.getElementsByTagNameNS(XBRLI, 'measure')).map(m => m.textContent.trim().replace(/^.*:/, '')).join('/');
    const facts = [], tuples = [];
    let seq = 0;
    const isFactEl = e => e.nodeType === 1 && e.namespaceURI !== XBRLI && e.namespaceURI !== LINK && !(e.namespaceURI || '').startsWith('http://www.xbrl.org/');
    function walk(parent, tup) {
      for (const e of Array.from(parent.childNodes)) {
        if (!isFactEl(e)) continue;
        const ctx = e.getAttribute('contextRef');
        if (!ctx) { // tupla
          const t = { c: e.localName, ns: e.namespaceURI, idx: tuples.filter(x => x.c === e.localName).length, kids: [], seq: seq++, parent: tup };
          tuples.push(t); walk(e, t); continue;
        }
        const nil = e.getAttributeNS(XSI, 'nil') === 'true';
        // testo con marcatori XHTML non «escapati»: si conserva il markup
        const v = nil ? null : (e.children && e.children.length ? Array.from(e.childNodes).map(n => n.nodeType === 1 ? new XMLSerializer().serializeToString(n) : (n.nodeValue || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('') : e.textContent);
        const f = { c: e.localName, ns: e.namespaceURI, ctx, unit: e.getAttribute('unitRef') || '', dec: e.getAttribute('decimals'), v, nil, id: e.getAttribute('id') || '', seq: seq++, tup };
        facts.push(f); if (tup) tup.kids.push(f);
      }
    }
    walk(root, null);
    const nsMap = {}; for (const f of facts) nsMap[f.ns] = (nsMap[f.ns] || 0) + 1;
    return { schemaRefs, contexts, units, facts, tuples, ns: Object.keys(nsMap).sort((a, b) => nsMap[b] - nsMap[a])[0] || '' };
  }
  const base = p => (p || '').replace(/^.*[\\/]/, '');
  function pickTaxonomy(inst) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(inst.ns) || /(\d{4}-\d{2}-\d{2})/.exec(inst.schemaRefs.join(' '));
    return m ? m[1] : null;
  }
  function pickEntry(M, inst) {
    for (const r of inst.schemaRefs) { const b = base(r); if (M.ep[b]) return b; }
    // dal nome: …-abb-…, …-micr-…
    const s = inst.schemaRefs.join(' ');
    const k = Object.keys(M.ep).find(e => { const t = /-(ese|abb|micr|cons)-/.exec(e); return t && new RegExp('-' + t[1] + '-').test(s); });
    if (k) return k;
    // dai fatti presenti: l'ingresso che ne copre di più
    const names = new Set(inst.facts.map(f => f.c));
    let best = null, bn = -1;
    for (const [e, ep] of Object.entries(M.ep)) { const used = new Set(); for (const p of ep.pre) { for (const r of p.roots) used.add(r); for (const [f, ks] of Object.entries(p.ch)) { used.add(f); ks.forEach(k => used.add(k[0])); } } let n = 0; names.forEach(x => used.has(x) && n++); if (n > bn) { bn = n; best = e; } }
    return best;
  }
  const KIND = { ese: 'Bilancio ordinario', abb: 'Bilancio in forma abbreviata', micr: 'Bilancio delle micro-imprese', cons: 'Bilancio consolidato' };
  /* ---------- periodi ---------- */
  const dayBefore = s => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const itDate = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  function periods(inst) {
    const ctxs = Object.values(inst.contexts).filter(c => !c.dims);
    const durs = ctxs.filter(c => c.start && c.end);
    let cur = null;
    if (durs.length) {
      // l'esercizio è il periodo più lungo che finisce per ultimo (di solito un anno)
      const byEnd = [...durs].sort((a, b) => b.end.localeCompare(a.end) || a.start.localeCompare(b.start));
      cur = { start: byEnd[0].start, end: byEnd[0].end };
    } else {
      const ins = ctxs.filter(c => c.instant).map(c => c.instant).sort();
      const e = ins[ins.length - 1]; if (e) cur = { start: (+e.slice(0, 4) - 1) + e.slice(4) , end: e };
      if (cur) cur.start = dayBefore(cur.start).slice(0, 4) === cur.start.slice(0, 4) ? cur.start : cur.start;
    }
    if (!cur) return null;
    const curStartInstant = dayBefore(cur.start);
    const prevDur = durs.filter(c => c.end === curStartInstant || c.end === cur.start).sort((a, b) => a.start.localeCompare(b.start))[0];
    const prev = prevDur ? { start: prevDur.start, end: prevDur.end } : { start: (+cur.start.slice(0, 4) - 1) + cur.start.slice(4), end: curStartInstant };
    return { cur, prev };
  }
  /* classe del contesto rispetto all'esercizio: dCur, dPrev, iCur, iPrev (= inizio esercizio), iPrev2 (= inizio esercizio precedente) */
  function ctxClass(c, P) {
    if (!c || c.dims) return null;
    if (c.start && c.end) { if (c.start === P.cur.start && c.end === P.cur.end) return 'dCur'; if (c.start === P.prev.start && c.end === P.prev.end) return 'dPrev'; return null; }
    if (c.instant) {
      if (c.instant === P.cur.end) return 'iCur';
      if (c.instant === P.prev.end || c.instant === P.cur.start) return 'iPrev';
      if (c.instant === dayBefore(P.prev.start) || c.instant === P.prev.start) return 'iPrev2';
    }
    return null;
  }
  /* ---------- formattazione dei valori ---------- */
  const thousands = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  function fmtNumber(v, dec) {
    const s = String(v).trim(); if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return s;
    let n = s; if (/e/i.test(n)) n = Number(n).toString();
    const neg = n.startsWith('-'); n = n.replace(/^[+-]/, '');
    let [i, f = ''] = n.split('.');
    i = i.replace(/^0+(?=\d)/, '') || '0';
    const d = dec == null || dec === '' || dec === 'INF' ? f.replace(/0+$/, '').length : Math.max(0, +dec);
    if (dec !== 'INF' && dec != null && dec !== '' && +dec >= 0) { f = (f + '0'.repeat(d)).slice(0, d); } else f = f.replace(/0+$/, '');
    const out = thousands(i) + (f ? ',' + f : '');
    return (neg && /[1-9]/.test(i + f) ? '-' : '') + out;
  }
  function display(f, M) {
    if (f.nil) return '—';
    const t = M.c[f.c]?.t || '';
    const v = f.v ?? '';
    switch (t) {
      case 'monetaryItemType': case 'sharesItemType': case 'decimalItemType': case 'integerItemType': case 'nonNegativeIntegerItemType': return fmtNumber(v, f.dec);
      case 'percentItemType': { const s = v.trim(); if (!/^[+-]?\d*\.?\d+$/.test(s)) return s; const x = Number(s) * 100; let r = (Math.round(x * 1e8) / 1e8).toString(); return fmtNumber(r, null) + '%'; }
      case 'booleanItemType': return /^(true|1)$/i.test(v.trim()) ? 'sì' : /^(false|0)$/i.test(v.trim()) ? 'no' : v.trim();
      case 'dateItemType': { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim()); return m ? `${m[3]}/${m[2]}/${m[1]}` : v.trim(); }
      case 'textBlockItemType': return v;
      default: return v.trim();
    }
  }
  const isNum = t => /monetary|shares|decimal|integer|percent|pure|float|double/i.test(t || '');

  /* ---------- etichette e colonne dei prospetti ---------- */
  const LBL = { '': 'l', l: 'l', r: 'r', t: 't', s: 's', e: 'e', v: 'v', n: 'n' };
  function label(M, c, pl) { const L = M.l[c] || {}; return L[LBL[pl] || 'l'] || L.l || L.v || c.replace(/([a-z])([A-Z])/g, '$1 $2'); }
  const noAbb = s => s.replace(/\s+(in forma )?abbreviat[oa]$/i, ''); // «Attivo circolante abbreviato» → «Attivo circolante»
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const lc = s => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const splitParts = s => s.replace(/\s*\((colonna|gruppo di colonne|prospetto)\)\s*$/i, '').split(/,\s+/).map(x => x.trim()).filter(Boolean);
  const STOP = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'e', 'a', 'in', 'per', 'da', 'la', 'il', 'le', 'lo', 'gli', 'o', 'ed', 'al', 'alla', 'alle', 'ai', 'agli', 'nel', 'nella', 'nelle', 'nei', 'sul', 'sulla', 'con', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi']);
  const toks = s => new Set(lc(s).replace(/[^a-zà-ÿ0-9' ]+/g, ' ').replace(/\b[ld]'/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)));
  const tokSub = (p, hay) => { const a = toks(p), b = toks(hay); return a.size > 0 && [...a].every(t => b.has(t)); };
  // come tokSub, ma contando anche articoli e preposizioni: una parte si toglie dall'etichetta della riga solo se
  // colonna o titolo la dicono parola per parola («di flussi» ≠ «dei flussi»), così nulla dell'etichetta va perso
  const allW = s => new Set(lc(s).match(/[\p{L}\p{N}']+/gu) || []);
  const tokSubX = (p, hay) => { const a = allW(p), b = allW(hay); return tokSub(p, hay) && [...a].every(t => b.has(t)); };
  const wordIn = (needle, hay) => { const n = lc(needle), h = lc(hay); if (!n) return false; const i = h.indexOf(n); if (i < 0) return false; const a = i === 0 || /[\s(,'-]/.test(h[i - 1]), b = i + n.length === h.length || /[\s),'-]/.test(h[i + n.length]); return a && b; };

  /* ---------- costruzione del documento ---------- */
  const STMT_ROLE = /\/(Sp|SP|CE|RF)[A-Za-z]*$/;
  function build(text, opts = {}) {
    const inst = parseInstance(text);
    const v = opts.version || pickTaxonomy(inst);
    const M = v && model(v);
    if (!M) { const e = new Error(v ? `Il bilancio usa la tassonomia XBRL ${v}, che non è inclusa. Caricala una volta (zip dal sito di XBRL Italia) e verrà ricordata.` : 'Non riesco a capire quale tassonomia XBRL usa il file.'); e.needTaxonomy = v; throw e; }
    const entry = pickEntry(M, inst);
    if (!entry) throw new Error('Il file non corrisponde a nessuno degli schemi di bilancio della tassonomia.');
    const P = periods(inst);
    if (!P) throw new Error('Il file non contiene periodi (contesti) validi.');
    const EP = M.ep[entry];
    const used = new Set(); // fatti mostrati
    const F = {}; // concetto → classe → fatto (fuori dalle tuple)
    const dup = [];
    for (const f of inst.facts) {
      if (f.tup) continue;
      const k = ctxClass(inst.contexts[f.ctx], P) || 'x:' + f.ctx;
      const m = F[f.c] = F[f.c] || {};
      if (m[k]) { if ((m[k].v ?? '') !== (f.v ?? '')) dup.push(f); else used.add(f); continue; }
      m[k] = f;
    }
    const get = (c, k) => F[c]?.[k] || null;
    const colTitle = k => itDate({ iCur: P.cur.end, iPrev: P.prev.end, dCur: P.cur.end, dPrev: P.prev.end }[k]);
    const blocks = [];
    const yearCur = P.cur.end.slice(0, 4);
    // tipo: ordinario / abbreviato / …
    const kindKey = (/-(ese|abb|micr|cons)-/.exec(entry) || [])[1];
    const info = {};
    for (const n of ['DatiAnagraficiDenominazione', 'DatiAnagraficiSede', 'DatiAnagraficiCodiceFiscale', 'DatiAnagraficiPartitaIva', 'DatiAnagraficiNumeroRea', 'DatiAnagraficiCodiceCciaa', 'DatiAnagraficiFormaGiuridica']) { const f = Object.values(F[n] || {})[0]; if (f) info[n] = display(f, M); }
    const tupleByName = {}; for (const t of inst.tuples) (tupleByName[t.c] = tupleByName[t.c] || []).push(t);
    const tupleUsed = new Set();

    /* righe di un prospetto contabile a due colonne */
    function stmtRows(role, root, depth0 = 0) {
      const rows = [];
      const kidsOf = c => (role.ch[c] || []);
      const valsFor = (c, pl) => {
        const cc = M.c[c]; if (!cc) return [null, null];
        if (cc.p === 'i') {
          if (pl === 's') return [get(c, 'iPrev'), get(c, 'iPrev2')];
          // voci che per nome sono «di inizio esercizio» (es. disponibilità liquide a inizio esercizio):
          // c'è chi le data a fine esercizio e chi, correttamente, all'inizio. Si segue il file.
          if (/InizioEsercizio/.test(c) && !get(c, 'iCur') && (get(c, 'iPrev') || get(c, 'iPrev2'))) return [get(c, 'iPrev'), get(c, 'iPrev2')];
          return [get(c, 'iCur'), get(c, 'iPrev')];
        }
        return [get(c, 'dCur'), get(c, 'dPrev')];
      };
      (function rec(c, pl, depth) {
        const cc = M.c[c];
        if (cc && cc.t === 'tuple') return; // le tuple non stanno nei prospetti contabili
        const start = rows.length;
        if (cc && !cc.a) {
          const fs = valsFor(c, pl);
          rows.push({ c, label: label(M, c, pl), depth, vals: fs, total: pl === 't' || /^totale\b/i.test(label(M, c, pl)) });
        } else rows.push({ c, label: label(M, c, pl), depth, heading: true });
        for (const [k, kpl] of kidsOf(c)) rec(k, kpl || '', depth + 1);
        // via le righe vuote; via le intestazioni senza contenuto
        const mine = rows[start];
        if (mine.heading) { if (rows.length === start + 1) rows.pop(); }
        else if (!mine.vals.some(Boolean) && rows.length === start + 1) rows.pop();
      })(root, '', depth0);
      return rows;
    }
    /* colonne e righe di un «(prospetto)» */
    function tableOf(role, node) {
      const kids = role.ch[node] || [];
      const cols = [];
      const others = [];
      for (const [k, pl] of kids) {
        const lab = label(M, k, 'l');
        if (/\(gruppo di colonne\)\s*$/i.test(lab)) { for (const [kk, kpl] of role.ch[k] || []) if (/\(colonna\)\s*$/i.test(label(M, kk, 'l'))) cols.push({ c: kk, pl: kpl || pl || '', group: k }); else others.push([kk, kpl]); }
        else if (/\(colonna\)\s*$/i.test(lab)) cols.push({ c: k, pl: pl || '' });
        else others.push([k, pl]);
      }
      if (!cols.length) return { cols: [], others };
      // intestazioni: tolte le parti comuni a tutte le colonne
      const cparts = cols.map(c => splitParts(label(M, c.c, 'l')));
      const common = cparts[0].filter(p => cparts.every(cp => cp.some(x => lc(x) === lc(p))));
      cols.forEach((c, i) => { c.parts = cparts[i]; c.headParts = cparts[i].filter(p => !common.some(x => lc(x) === lc(p))); });
      if (cols.length > 1) {
        const first = cols.map(c => (c.headParts[0] || '').split(' '));
        // si toglie solo un prefisso «di servizio» comune (es. «Movimenti di»), mai parole che distinguono le colonne
        const GENERIC = /^(movimenti|variazioni|variazione|analisi|dettaglio|dettagli|di|dei|delle|degli|del|della|dello|importo|valore)$/i;
        let n = 0; while (first.every(w => w.length > n + 1 && lc(w[n]) === lc(first[0][n])) && GENERIC.test(first[0][n])) n++;
        if (n) cols.forEach((c, i) => { c.headParts = [...c.headParts]; c.headParts[0] = first[i].slice(n).join(' '); });
      } else if (cols[0].headParts[0]) {
        cols[0].headParts[0] = cols[0].headParts[0].replace(/^(movimenti|variazioni|analisi|dettaglio) (di|dei|delle|degli|del|della|dello) /i, '');
        if (cols[0].headParts.length > 1 && /^(movimenti|variazioni|analisi|dettaglio|importo)$/i.test(cols[0].headParts[0])) cols[0].headParts = cols[0].headParts.slice(1);
      }
      const groups = {};
      cols.forEach(c => {
        if (!c.group) return;
        const gp = splitParts(label(M, c.group, 'l'));
        groups[c.group] = cap(gp.filter(p => !common.some(x => lc(x) === lc(p))).join(', '));
        // ciò che dice il gruppo non si ripete nella colonna né nelle righe
        c.headParts = c.headParts.filter(p => !gp.some(g => lc(g) === lc(p)));
        c.parts = [...c.parts, ...gp];
      });
      cols.forEach(c => { c.head = cap(c.headParts.join(', ') || splitParts(label(M, c.c, 'l')).join(', ')); });
      // righe di ogni colonna, nell'ordine della tassonomia
      const tableTitle = splitParts(label(M, node, 'l')).join(' ');
      const colTokAll = cols.map(col => toks(col.parts.join(' ')));
      const perCol = cols.map(col => {
        const list = [], colToks = toks(col.parts.join(' '));
        (function rec(c, parentParts, depth) {
          for (const [k, kpl0] of role.ch[c] || []) {
            const kpl = kpl0 || '';
            const effPl = kpl || (col.pl === 's' || col.pl === 'e' ? col.pl : '');
            const lab = label(M, k, effPl);
            // prima via le parti uguali a quelle della colonna, poi quelle contenute nel suo titolo (se resta qualcosa)
            let parts = splitParts(lab).filter(p => !col.parts.some(cp => lc(cp) === lc(p)));
            const colAll = col.parts.join(' ');
            const narrower = parts.filter(p => !col.parts.some(cp => wordIn(p, cp) || tokSubX(p, cp)) && !tokSubX(p, colAll));
            if (narrower.length) parts = narrower;
            const noTitle = parts.filter(p => !tokSubX(p, tableTitle)); // ciò che dice già il titolo del prospetto
            if (noTitle.length) parts = noTitle;
            let rel = parts;
            if (parentParts.length && parts.length > parentParts.length && parentParts.every((p, i) => lc(p) === lc(parts[i]))) rel = parts.slice(parentParts.length);
            const cc = M.c[k];
            let cell = null;
            if (cc && !cc.a && cc.t !== 'tuple') {
              // etichetta «inizio esercizio»: istante di inizio, oppure — per le voci di durata — l'esercizio precedente
              const cls = cc.p === 'i' ? (effPl === 's' ? 'iPrev' : 'iCur') : (effPl === 's' ? 'dPrev' : 'dCur');
              cell = { c: k, f: get(k, cls), pl: effPl, cls };
            }
            // per l'allineamento contano le parole che non descrivono la colonna
            const all = toks(parts.join(' ') || lab), own = new Set([...all].filter(t => !colToks.has(t)));
            if (cell) cell.lab = cap(rel.join(', ') || lab);
            list.push({ label: cap(rel.join(', ') || lab), weak: !parts.length, toks: own.size ? own : all, depth, heading: !cell, cell, k });
            rec(k, parts, depth + 1);
          }
        })(col.c, [], 0);
        return list;
      });
      // allineamento delle colonne: la stessa voce sta sulla stessa riga anche se l'etichetta cambia un po'
      // (es. «I - Capitale» / «Origine / natura, capitale»; «Debiti, esigibili entro…» / «Esigibili entro…»)
      const ref = perCol.reduce((a, b, i) => (b.length > perCol[a].length ? i : a), 0);
      const newRow = (e, ci) => ({ depth: e.depth, heading: e.heading, labels: e.weak ? [] : [e.label], weakLabel: e.label, toks: e.toks, ks: new Set([e.k]), cells: Object.assign(new Array(cols.length).fill(null), { [ci]: e.cell }), refLabel: e.weak ? '' : e.label });
      let merged = perCol[ref].map(e => newRow(e, ref));
      perCol.forEach((list, ci) => {
        if (ci === ref) return;
        const n = merged.length, m = list.length;
        const cT = colTokAll[ci];
        const sim = (a, b) => { if (a.ks.has(b.k)) return 1.5; let A = a.toks; const A2 = new Set([...A].filter(t => !cT.has(t))); if (A2.size) A = A2; const B = b.toks; let inter = 0; A.forEach(t => B.has(t) && inter++); const u = A.size + B.size - inter; const j = u ? inter / u : 0; return j < 0.34 ? -1 : j + (a.depth === b.depth ? 0.25 : 0); };
        const S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
        for (let a = n - 1; a >= 0; a--) for (let b = m - 1; b >= 0; b--) {
          const sm = merged[a].cells[ci] ? -1 : sim(merged[a], list[b]);
          S[a][b] = Math.max(S[a + 1][b], S[a][b + 1], sm >= 0 ? sm + S[a + 1][b + 1] : -1e9);
        }
        const out = []; let a = 0, b = 0;
        while (a < n || b < m) {
          if (a < n && b < m) {
            const sm = merged[a].cells[ci] ? -1 : sim(merged[a], list[b]);
            if (sm >= 0 && Math.abs(S[a][b] - (sm + S[a + 1][b + 1])) < 1e-9) { const r = merged[a], e = list[b]; r.cells[ci] = e.cell; r.ks.add(e.k); if (!e.weak) { r.labels.push(e.label); if (!r.refLabel) r.refLabel = e.label; } if (!e.heading) r.heading = false; out.push(r); a++; b++; continue; }
            if (S[a][b] === S[a + 1][b]) { out.push(merged[a]); a++; continue; }
          } else if (a < n) { out.push(merged[a]); a++; continue; }
          out.push(newRow(list[b], ci)); b++;
        }
        merged = out;
      });
      // etichetta della riga: quella della colonna di riferimento, oppure la parte comune
      for (const r of merged) {
        const uniq = [...new Set(r.labels)];
        if (!uniq.length) { r.label = r.weakLabel; continue; }
        if (uniq.length === 1) { r.label = uniq[0]; continue; }
        const full = uniq.filter(l => { const lt = toks(l); return uniq.every(o => [...toks(o)].every(t => lt.has(t))); });
        if (full.length) { r.label = full.sort((a, b) => b.length - a.length)[0]; continue; }
        const pl = uniq.map(l => splitParts(l));
        const commonParts = pl[0].filter(p => pl.every(q => q.some(x => lc(x) === lc(p))));
        if (commonParts.length) { r.label = cap(commonParts.join(', ')); continue; }
        const ws = uniq.map(l => l.split(/\s+/));
        let k = 0; while (ws.every(w => w.length > k && lc(w[k]) === lc(ws[0][k]))) k++;
        r.label = k ? cap(ws[0].slice(0, k).join(' ').replace(/[,;:]$/, '')) : r.refLabel;
      }
      let rows = merged;
      // voci che portano il periodo nel nome (…EsercizioPrecedente, …InizioEsercizio) datate dal file in modo diverso:
      // se la voce ha un solo posto nel prospetto e il file ne ha un solo valore, va lì (mai in due righe)
      const slots = new Map();
      rows.forEach(r => r.cells.forEach(x => { if (x) slots.set(x.c, (slots.get(x.c) || 0) + 1); }));
      rows.forEach(r => r.cells.forEach(x => {
        if (!x || x.f || slots.get(x.c) !== 1 || !/EsercizioPrecedente|InizioEsercizio|EsercizioCorrente/.test(x.c)) return;
        const alt = ['iCur', 'iPrev', 'iPrev2', 'dCur', 'dPrev'].map(k => get(x.c, k)).filter(Boolean);
        if (alt.length === 1) x.f = alt[0];
      }));
      // via righe e colonne vuote
      const hasVal = r => r.cells.some(x => x?.f);
      const keepRow = rows.map((r, i) => hasVal(r) || (r.heading && rows.slice(i + 1).some((x, j) => x.depth > r.depth && hasVal(x) && rows.slice(i + 1, i + 1 + j).every(y => y.depth > r.depth))));
      rows = rows.filter((r, i) => keepRow[i]);
      const keepCol = cols.map((c, ci) => rows.some(r => r.cells[ci]?.f));
      const kc = cols.filter((c, i) => keepCol[i]);
      rows.forEach(r => { r.cells = r.cells.filter((x, i) => keepCol[i]); });
      // controllo: per ogni valore, riga (con le sue intestazioni) + colonna + titolo devono dire tutta l'etichetta della voce.
      // Se una riga «unita» (es. «Totale») non basta per qualche colonna, quei valori vanno su una riga propria con la loro etichetta.
      {
        const W = x => new Set(lc(x).match(/[\p{L}\p{N}']+/gu) || []);
        const covers = (txt, need) => { const h = W(txt); return [...W(need)].every(w => h.has(w)); };
        const out = [], st = [];
        for (const r of rows) {
          st.length = r.depth; const anc = st.filter(Boolean).join(' ');
          const ctx = ci => [anc, kc[ci].head, kc[ci].group ? groups[kc[ci].group] : '', tableTitle].join(' ');
          const lost = [];
          r.cells.forEach((x, ci) => { if (x?.f && !covers(ctx(ci) + ' ' + r.label, label(M, x.c, x.pl))) lost.push(ci); });
          const extra = new Map();
          for (const ci of lost) {
            const x = r.cells[ci], full = label(M, x.c, x.pl);
            const lb = x.lab && covers(ctx(ci) + ' ' + x.lab, full) ? x.lab : cap(full);
            if (!extra.has(lb)) extra.set(lb, { ...r, label: lb, heading: false, cells: new Array(kc.length).fill(null) });
            extra.get(lb).cells[ci] = x; r.cells[ci] = null;
          }
          if (r.cells.some(x => x?.f) || r.heading) out.push(r);
          out.push(...extra.values());
          st[r.depth] = r.label;
        }
        rows = out;
      }
      // percorso della riga come stampato (intestazioni di gruppo › voce)
      const stack = [];
      rows.forEach(r => { stack.length = r.depth; r.path = [...stack.filter(Boolean), r.label]; stack[r.depth] = r.label; });
      return { cols: kc, rows, groups, others };
    }
    /* tabella di una tupla (una riga per ogni ripetizione) */
    function tupleTable(role, tname, totals = []) {
      const list = tupleByName[tname] || [];
      list.forEach(t => tupleUsed.add(t));
      const pk = role.ch[tname] || [];
      const kidDefs = pk.length ? pk.map(k => ({ c: k[0], pl: k[1] || '' })) : (M.c[tname]?.k || []).map(c => ({ c, pl: '' }));
      const tl = label(M, tname, 'l');
      const tparts = splitParts(tl);
      const headOf = (k, pl) => cap(splitParts(label(M, k, pl)).filter(p => !tparts.some(tp => wordIn(p, tp) || tokSub(p, tp))).join(', ') || label(M, k, pl));
      const cols = kidDefs.map(({ c, pl }) => ({ c, pl, head: headOf(c, pl) }));
      // in ogni ripetizione: ogni fatto va nella colonna del suo concetto e del suo periodo (inizio/fine esercizio)
      const clsOf = f => ctxClass(inst.contexts[f.ctx], P);
      const fits = (col, f) => { const k = clsOf(f); if (col.pl === 's') return k === 'iPrev' || k === 'iPrev2'; if (cols.some(o => o !== col && o.c === col.c && o.pl === 's')) return k !== 'iPrev' && k !== 'iPrev2'; return true; };
      const rows = list.map(t => {
        const taken = new Set();
        const cells = cols.map(col => { const f = t.kids.find(x => x.c === col.c && !taken.has(x) && fits(col, x)); if (!f) return null; taken.add(f); return { c: col.c, f, tuple: t }; });
        return { cells, tuple: t, taken };
      });
      // fatti della tupla senza una colonna prevista: colonne aggiuntive
      for (const r of rows) for (const f of r.tuple.kids) {
        if (r.taken.has(f)) continue;
        let ci = cols.findIndex(c => c.extra && c.c === f.c && c.cls === clsOf(f));
        if (ci < 0) { cols.push({ c: f.c, extra: true, cls: clsOf(f), head: cap(label(M, f.c, 'l')) + (clsOf(f) === 'iPrev' ? ' (inizio esercizio)' : '') }); rows.forEach(x => x.cells.push(null)); ci = cols.length - 1; }
        if (!r.cells[ci]) { r.cells[ci] = { c: f.c, f, tuple: r.tuple }; r.taken.add(f); }
      }
      const keep = cols.map((c, i) => rows.some(r => r.cells[i]?.f));
      const kc = cols.filter((c, i) => keep[i]);
      rows.forEach(r => r.cells = r.cells.filter((x, i) => keep[i]));
      // totali: sotto la colonna che sommano (relazioni «Somme degli importi nelle tuple»)
      const totalRows = [];
      for (const [tc, tpl] of totals) {
        const f = get(tc, M.c[tc]?.p === 'i' ? (tpl === 's' ? 'iPrev' : 'iCur') : 'dCur'); if (!f) continue;
        let ci = -1;
        for (const cal of Object.values(EP.cal)) { const arcs = cal[tc]; if (arcs) { const hit = arcs.find(a => kc.some(col => col.c === a[0])); if (hit) { ci = kc.findIndex(col => col.c === hit[0]); break; } } }
        if (ci < 0) { const tt = toks(label(M, tc, tpl || '')); let best = -1, bl = 0; kc.forEach((col, i) => { const ht = toks(col.head); if (ht.size && [...ht].every(t => tt.has(t)) && ht.size > bl) { best = i; bl = ht.size; } }); ci = best; }
        totalRows.push({ label: label(M, tc, tpl || ''), f, c: tc, ci });
      }
      return { title: tl, cols: kc, rows: rows.filter(r => r.cells.some(Boolean)), totals: totalRows, tname };
    }
    /* sezioni non contabili: nota integrativa, informazioni, dichiarazioni */
    function generic(role, root) {
      const out = [];
      let simple = null; // gruppo di valori semplici consecutivi
      const flush = () => { if (simple && simple.rows.length) out.push(simple); simple = null; };
      const addSimple = (c, pl, depth) => {
        const cc = M.c[c];
        const cands = cc.p === 'i' ? [['iCur', pl === 's' ? 'iPrev' : 'iCur'], ['iPrev', pl === 's' ? 'iPrev2' : 'iPrev']] : [['dCur', 'dCur'], ['dPrev', 'dPrev']];
        const fs = cands.map(([, k]) => get(c, k));
        if (!fs.some(Boolean)) return;
        if (!simple) simple = { type: 'pairs', rows: [], two: false };
        simple.rows.push({ c, label: label(M, c, pl), vals: fs, depth, num: isNum(cc.t) });
        if (fs[1]) simple.two = true;
      };
      (function rec(c, pl, depth) {
        const cc = M.c[c]; const lab = label(M, c, pl);
        if (!cc) return;
        if (cc.t === 'tuple') { flush(); const t = tupleTable(role, c, []); if (t.rows.length) out.push({ type: 'tuple', depth, ...t }); return; }
        if (cc.a && /\(prospetto\)\s*$/i.test(label(M, c, 'l'))) {
          flush();
          const T = tableOf(role, c);
          const title = noAbb(cap(splitParts(label(M, c, 'l')).join(', ')));
          if (T.cols.length && T.rows.length) out.push({ type: 'table', depth, title, ...T, c });
          // tuple e totali dentro il prospetto
          const tupKids = T.others.filter(([k]) => M.c[k]?.t === 'tuple');
          const rest = T.others.filter(([k]) => M.c[k]?.t !== 'tuple');
          if (tupKids.length) {
            for (const [k] of tupKids) { const tt = tupleTable(role, k, tupKids.length === 1 ? rest : []); if (tt.rows.length || tt.totals.length) out.push({ type: 'tuple', depth, ...tt, title: title }); }
            if (tupKids.length === 1) rest.forEach(([k]) => { const cc2 = M.c[k]; if (cc2?.a) rec(k, '', depth + 1); });
            else rest.forEach(([k, kpl]) => rec(k, kpl || '', depth + 1));
          } else rest.forEach(([k, kpl]) => rec(k, kpl || '', depth + 1));
          flush();
          return;
        }
        if (cc.a) {
          flush();
          const at = out.length;
          out.push({ type: 'h', depth, text: noAbb(cap(lab)), c });
          for (const [k, kpl] of role.ch[c] || []) rec(k, kpl || '', depth + 1);
          flush();
          if (out.length === at + 1 || out.slice(at + 1).every(b => b.type === 'h')) out.length = at; // intestazione senza contenuto
          return;
        }
        if (cc.t === 'textBlockItemType') {
          flush();
          for (const k of ['dCur', 'iCur', 'dPrev', 'iPrev']) { const f = get(c, k); if (f) out.push({ type: 'text', depth, label: lab, caption: !/^(introduzione|commento)\b/i.test(lab), f, c, cls: k }); }
          return;
        }
        if (cc.t === 'stringItemType' && (get(c, 'dCur')?.v || '').length > 120) { flush(); out.push({ type: 'text', depth, label: lab, caption: true, f: get(c, 'dCur'), c, cls: 'dCur', plain: true }); return; }
        addSimple(c, pl, depth);
      })(root, '', 0);
      flush();
      return out;
    }

    // —— documento
    for (const pr of EP.pre) {
      const roleDef = M.roles[pr.role] || pr.role.split('/').pop();
      for (const root of pr.roots) {
        if (/InfoGenerali$/.test(pr.role)) {
          const rows = [];
          (function rec(c, pl) {
            const cc = M.c[c];
            if (cc && !cc.a && cc.t !== 'tuple') { for (const k of ['dCur', 'iCur', 'dPrev', 'iPrev']) { const f = get(c, k); if (f) { rows.push({ c, label: label(M, c, pl), f }); break; } } }
            for (const [k, kpl] of pr.ch[c] || []) rec(k, kpl || '');
          })(root, '');
          if (rows.length) blocks.push({ type: 'kv', section: roleDef, role: pr.role, title: cap(label(M, root, '')), rows });
        } else if (STMT_ROLE.test(pr.role)) {
          const rows = stmtRows(pr, root);
          // es. rendiconto diretto e indiretto: se questo prospetto ripete solo voci già mostrate (le disponibilità liquide), non si stampa
          const seenStmt = new Set(blocks.filter(b => b.type === 'stmt').flatMap(b => b.rows.filter(r => !r.heading).map(r => r.c)));
          const own = rows.filter(r => !r.heading && r.vals.some(Boolean));
          if (own.length && own.every(r => seenStmt.has(r.c)) && blocks.some(b => b.type === 'stmt' && /^RF/.test(b.role.split('/').pop()) && /^RF/.test(pr.role.split('/').pop()))) continue;
          if (rows.length > 1 || (rows.length === 1 && !rows[0].heading)) blocks.push({ type: 'stmt', section: roleDef, role: pr.role, title: cap(label(M, root, '')), cols: [colTitle('iCur'), colTitle('iPrev')], rows: rows.slice(rows[0]?.c === root ? 1 : 0).map(r => ({ ...r, depth: Math.max(0, r.depth - 1) })) });
        } else {
          const items = generic(pr, root);
          if (items.length) blocks.push({ type: 'section', section: roleDef, role: pr.role, title: cap(label(M, root, '')), items: items[0]?.type === 'h' && items[0].c === root ? items.slice(1) : items });
        }
      }
    }
    // —— prospetti «fantasma»: un prospetto (rendiconto, tabella della nota integrativa, elenco) fatto solo di valori
    // che il bilancio mostra già altrove non è stato presentato dalla società — l'ha ricostruito la tassonomia — e non si stampa.
    // Si toglie dal fondo, uno per volta, e solo se ogni suo valore resta visibile in un altro punto: nulla va perso.
    {
      const units = [];
      const fixed = new Map(); // valori in parti che non si tolgono mai (dati generali, testi, SP e CE)
      const addFixed = f => f && fixed.set(f, (fixed.get(f) || 0) + 1);
      for (const b of blocks) {
        if (b.type === 'kv') b.rows.forEach(r => addFixed(r.f));
        if (b.type === 'stmt') {
          const fs = new Set(b.rows.flatMap(r => (r.vals || []).filter(Boolean)));
          if (/\/RF[A-Za-z]*$/.test(b.role)) units.push({ fs, drop: () => { blocks.splice(blocks.indexOf(b), 1); } });
          else fs.forEach(addFixed);
        }
        if (b.type === 'section') for (const it of b.items) {
          let fs = null;
          if (it.type === 'pairs') fs = new Set(it.rows.flatMap(r => r.vals.filter(Boolean)));
          if (it.type === 'table') fs = new Set(it.rows.flatMap(r => r.cells.map(x => x?.f).filter(Boolean)));
          if (it.type === 'tuple') fs = new Set([...it.rows.flatMap(r => r.cells.map(x => x?.f).filter(Boolean)), ...it.totals.map(t => t.f)]);
          if (it.type === 'text') addFixed(it.f);
          if (fs) units.push({ fs, drop: () => { it.phantom = true; } });
        }
      }
      const cnt = new Map(fixed);
      units.forEach(u => u.fs.forEach(f => cnt.set(f, (cnt.get(f) || 0) + 1)));
      for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        if (u.fs.size && [...u.fs].every(f => cnt.get(f) > 1)) { u.fs.forEach(f => cnt.set(f, cnt.get(f) - 1)); u.drop(); }
      }
      for (const b of blocks.slice()) {
        if (b.type !== 'section') continue;
        let items = b.items.filter(it => !it.phantom);
        // intestazioni rimaste senza contenuto sotto di sé
        items = items.filter((it, i) => it.type !== 'h' || items.slice(i + 1).some((x, j, rest) => x.type !== 'h' && x.depth > it.depth && rest.slice(0, j).every(y => y.depth > it.depth)) && (() => { const nx = items[i + 1]; return nx && !(nx.type === 'h' && nx.depth <= it.depth); })());
        b.items = items;
        if (!items.some(it => it.type !== 'h')) blocks.splice(blocks.indexOf(b), 1);
      }
    }
    // —— appendice: ogni dato che non è stato mostrato
    const shown = new Set();
    const mark = f => f && shown.add(f);
    for (const b of blocks) {
      if (b.type === 'kv') b.rows.forEach(r => mark(r.f));
      if (b.type === 'stmt') b.rows.forEach(r => (r.vals || []).forEach(mark));
      if (b.type === 'section') for (const it of b.items) {
        if (it.type === 'pairs') it.rows.forEach(r => r.vals.forEach(mark));
        if (it.type === 'text') mark(it.f);
        if (it.type === 'table') it.rows.forEach(r => r.cells.forEach(x => mark(x?.f)));
        if (it.type === 'tuple') { it.rows.forEach(r => r.cells.forEach(x => mark(x?.f))); it.totals.forEach(t => mark(t.f)); }
      }
    }
    const orphans = inst.facts.filter(f => !shown.has(f) && !used.has(f));
    const describeCtx = id => { const c = inst.contexts[id]; if (!c) return id; return c.instant ? 'al ' + itDate(c.instant) : c.start ? `dal ${itDate(c.start)} al ${itDate(c.end)}` : id; };
    if (orphans.length) blocks.push({ type: 'other', section: 'Altri dati presenti nel file', title: 'Altri dati presenti nel file',
      note: 'Questi dati sono nel file XBRL ma non rientrano nei prospetti del bilancio per il periodo indicato (ad esempio valori di altri esercizi o duplicati con valore diverso). Sono riportati per completezza, così che nessuna informazione vada persa.',
      rows: orphans.map(f => ({ c: f.c, label: cap(label(M, f.c, '')) + (f.tup ? ` (${label(M, f.tup.c, '')} n. ${f.tup.idx + 1})` : ''), period: describeCtx(f.ctx), f, dupOf: dup.includes(f) })) });
    // —— calcoli (solo informativo): somme dei prospetti contabili
    const calc = [];
    for (const [role, arcs] of Object.entries(EP.cal)) {
      if (!STMT_ROLE.test(role)) continue;
      for (const [tot, items] of Object.entries(arcs)) for (const k of ['iCur', 'iPrev', 'dCur', 'dPrev']) {
        const ft = get(tot, k); if (!ft || ft.nil) continue;
        let s = 0, any = false; for (const [c, w = 1] of items) { const f = get(c, k); if (f && !f.nil) { s += Number(f.v) * w; any = true; } }
        if (any && Math.abs(s - Number(ft.v)) > 1.5) calc.push({ role: M.roles[role], c: tot, label: label(M, tot, ''), k, expected: s, found: Number(ft.v) });
      }
    }
    return {
      M, inst, P, entry, kind: KIND[kindKey] || 'Bilancio', kindKey, version: v, info, blocks, orphans, dup, calc,
      stats: { facts: inst.facts.length, tuples: inst.tuples.length, shown: shown.size, orphans: orphans.length },
      title: `${KIND[kindKey] || 'Bilancio'} al ${itDate(P.cur.end)}`, yearCur,
      display: f => display(f, M), label: (c, pl) => label(M, c, pl), itDate, describeCtx,
      // valore numerico di un concetto (fuori dalle tuple): esercizio e precedente
      num: c => { const m = F[c]; if (!m) return null; const v = k => { const f = m[k]; return f && !f.nil && f.v != null && f.v !== '' && Number.isFinite(+f.v) ? +f.v : null; }; return { cur: v('iCur') ?? v('dCur'), prev: v('iPrev') ?? v('dPrev') }; },
      text: c => { const f = Object.values(F[c] || {}).find(x => x && !x.nil); return f ? f.v : null; },
      concepts: () => Object.keys(F),
    };
  }
  return { build, parseInstance, taxonomyList, addTaxonomyZip, model, display, fmtNumber, itDate };
})();

/* Tassonomia XBRL PCI 2018-11-04 (XBRL Italia / InfoCamere), precompilata */
XBRL_TAXONOMIES.push({ v: '2018-11-04', ns: "http://www.infocamere.it/itnn/fr/itcc/ci/2018-11-04", z: '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' });

/* ============================================================
   XbrlPdf — impagina il documento costruito da XbrlKit in un PDF A4 (pdf-lib)
   e annota ogni valore stampato (pagina, riga, colonna) nella «mappa di stampa»,
   usata dai controlli automatici per dimostrare che nessun dato manca.
   ============================================================ */
const XbrlPdf = (() => {
  const W = 595.28, H = 841.89, ML = 42, MR = 42, MT = 56, MB = 58, CW = W - ML - MR;
  // colori di file360 (gli stessi del sito)
  const C = { ink: [0.09, 0.094, 0.11], mute: [0.435, 0.447, 0.486], line: [0.827, 0.804, 0.749], soft: [0.945, 0.933, 0.906], head: [0.09, 0.094, 0.11], acc: [0.878, 0.271, 0.227], neg: [0.09, 0.094, 0.11], band: [0.988, 0.918, 0.906] };
  const col = a => rgb(a[0], a[1], a[2]);

  /* ---------- HTML dei testi della nota integrativa → blocchi ---------- */
  // HTML «escapato» due volte (&lt;p&gt;…): si decodifica una volta
  const unescapeTwice = src => (!/<[a-z]/i.test(src) && /&lt;\/?[a-z]/i.test(src) ? new DOMParser().parseFromString('<!doctype html><body><textarea>' + src.replace(/</g, '&lt;') + '</textarea>', 'text/html').querySelector('textarea').value : src);
  function htmlBlocks(src) {
    src = unescapeTwice(String(src || ''));
    if (!/<[a-z][\s\S]*>/i.test(src)) {
      return src.replace(/\r\n?/g, '\n').split(/\n{1,}/).map(s => s.trim()).filter(Boolean).map(t => ({ t: 'p', runs: [{ text: t }] }));
    }
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + src, 'text/html');
    const blocks = [];
    let cur = null;
    const flush = () => { if (cur && cur.runs.some(r => r.text.trim())) blocks.push(cur); cur = null; };
    const BLOCK = /^(P|DIV|H[1-6]|LI|TR|TABLE|UL|OL|BR|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TBODY|THEAD|DL|DT|DD|HR)$/;
    function inline(n, st, runs) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' '); if (t) runs.push({ text: t, ...st }); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { runs.push({ text: '\n', ...st }); return; }
      const s2 = { ...st };
      if (/^(B|STRONG|TH)$/.test(n.tagName) || /font-weight:\s*(bold|[6-9]00)/i.test(n.getAttribute('style') || '')) s2.b = true;
      if (/^(I|EM)$/.test(n.tagName) || /font-style:\s*italic/i.test(n.getAttribute('style') || '')) s2.i = true;
      if (n.tagName === 'U' || /underline/i.test(n.getAttribute('style') || '')) s2.u = true;
      for (const k of n.childNodes) inline(k, s2, runs);
    }
    function walk(n, st, listCtx) {
      for (const k of Array.from(n.childNodes)) {
        if (k.nodeType === 3) { if (k.nodeValue.trim()) { cur = cur || { t: 'p', runs: [] }; inline(k, st, cur.runs); } continue; }
        if (k.nodeType !== 1) continue;
        const tag = k.tagName;
        if (tag === 'TABLE') {
          flush();
          const rows = [];
          for (const tr of Array.from(k.querySelectorAll('tr'))) {
            if (tr.closest('table') !== k) continue;
            const cells = Array.from(tr.children).filter(c => /^(TD|TH)$/.test(c.tagName)).map(c => { const runs = []; inline(c, { b: c.tagName === 'TH' }, runs); return { runs, span: +(c.getAttribute('colspan') || 1), head: c.tagName === 'TH', align: (c.getAttribute('align') || (/text-align:\s*(right|center)/i.exec(c.getAttribute('style') || '') || [])[1] || '').toLowerCase() }; });
            if (cells.length) rows.push(cells);
          }
          if (rows.length) blocks.push({ t: 'table', rows });
          continue;
        }
        if (tag === 'UL' || tag === 'OL') { flush(); walk(k, st, { ordered: tag === 'OL', n: 0, depth: (listCtx?.depth ?? -1) + 1 }); flush(); continue; }
        if (tag === 'LI') { flush(); const lc = listCtx || { ordered: false, n: 0, depth: 0 }; lc.n++; cur = { t: 'li', runs: [], bullet: lc.ordered ? lc.n + '.' : '•', depth: lc.depth }; const sub = []; for (const c of Array.from(k.childNodes)) { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) sub.push(c); else inline(c, st, cur.runs); } flush(); for (const s of sub) { walk({ childNodes: [s] }, st, lc); } continue; }
        if (/^H[1-6]$/.test(tag)) { flush(); cur = { t: 'h', runs: [] }; inline(k, { ...st, b: true }, cur.runs); flush(); continue; }
        if (tag === 'HR') { flush(); continue; }
        if (BLOCK.test(tag)) { flush(); walk(k, st, listCtx); flush(); continue; }
        cur = cur || { t: 'p', runs: [] }; inline(k, st, cur.runs);
      }
    }
    walk(doc.body, {}, null);
    flush();
    return blocks;
  }
  function plainText(src) {
    // il testo visibile, blocco per blocco (come viene stampato, senza i pallini degli elenchi)
    const parts = [];
    for (const b of htmlBlocks(src)) {
      if (b.t === 'table') for (const r of b.rows) for (const c of r) parts.push(c.runs.map(x => x.text).join(''));
      else parts.push(b.runs.map(x => x.text).join(''));
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }


  async function render(D, { onProgress, signers = [] } = {}) {
    const pdf = await PDFDocument.create();
    const FN = await Brand.pdfFonts(pdf);
    const fontOf = st => FN[(st?.b ? 'b' : '') + (st?.i ? 'i' : '') || 'r'] || FN.r;
    const S = s => pdfSafe(FN.r, String(s ?? ''));
    const map = [];
    let page = null, y = 0, pageNo = 0, section = '';
    const pages = [];
    const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); pageNo++; y = H - MT; };
    const need = h => { if (!page || (y - h < MB && y < H - MT - 1)) { newPage(); return true; } return false; }; // su una pagina appena iniziata non se ne apre un'altra (evita pagine bianche)
    const tw = (t, f, s) => f.widthOfTextAtSize(S(t), s);
    function wrapText(t, f, s, w) {
      const out = [];
      for (const para of String(t ?? '').split('\n')) {
        let line = '';
        for (const word of para.split(/ +/)) {
          const tryL = line ? line + ' ' + word : word;
          if (tw(tryL, f, s) <= w || !line) {
            if (!line && tw(word, f, s) > w) { // parola lunghissima: a pezzi
              let piece = '';
              for (const ch of word) { if (tw(piece + ch, f, s) > w && piece) { out.push(piece); piece = ''; } piece += ch; }
              line = piece;
            } else line = tryL;
          } else { out.push(line); line = word; }
        }
        out.push(line);
      }
      return out;
    }
    const txt = (t, x, yy, f, s, c = C.ink) => page.drawText(S(t), { x, y: yy, size: s, font: f, color: col(c), ...(Brand.italic(f) ? { xSkew: degrees(11) } : {}) });
    const rule = (x1, x2, yy, c = C.line, th = 0.5) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: th, color: col(c) });
    const rec = (f, o) => { if (!f) return; map.push({ concept: f.c, context: f.ctx, tuple: f.tup ? `${f.tup.c}#${f.tup.idx}` : null, nil: !!f.nil, section, page: pageNo, ...o }); };

    /* ---------- intestazione ---------- */
    newPage();
    const name = D.info.DatiAnagraficiDenominazione || 'Bilancio';
    y -= 6;
    page.drawRectangle({ x: ML, y: y - 3, width: 28, height: 3, color: col(C.acc) }); y -= 16;
    for (const l of wrapText(name, FN.x, 22, CW)) { txt(l, ML, y - 22, FN.x, 22, C.head); y -= 27; }
    txt(D.title, ML, y - 12, FN.m, 12, C.acc); y -= 19;
    txt(`Esercizio dal ${D.itDate(D.P.cur.start)} al ${D.itDate(D.P.cur.end)} · tassonomia XBRL PCI ${D.version}`, ML, y - 9, FN.r, 8.5, C.mute); y -= 16;
    for (const sg of signers) { for (const l of wrapText(sg, FN.r, 8.5, CW)) { txt(l, ML, y - 9, FN.r, 8.5, C.mute); y -= 12; } }
    if (signers.length) y -= 4;
    rule(ML, W - MR, y, C.line, 0.8); y -= 16;

    /* ---------- titoli ---------- */
    function h1(t) { flushHeads(0); need(90); y -= 8; for (const l of wrapText(t, FN.x, 13.5, CW)) { txt(l, ML, y - 13.5, FN.x, 13.5, C.head); y -= 18; } y -= 3; page.drawRectangle({ x: ML, y, width: 24, height: 2.4, color: col(C.acc) }); rule(ML + 28, W - MR, y + 1.2, C.line, 0.6); y -= 11; }
    // i titoli non si disegnano subito: aspettano il contenuto che introducono, così non restano soli in fondo alla pagina
    let pend = [], firstMark = null;
    const hSize = depth => depth <= 1 ? 11 : depth === 2 ? 10 : 9.2;
    function h(t, depth) { pend.push({ lines: wrapText(t, FN.b, hSize(depth), CW - depth * 4), depth }); }
    function flushHeads(extra) {
      if (!pend.length) return;
      const hh = pend.reduce((a, p) => a + (p.depth <= 1 ? 8 : 5) + p.lines.length * (hSize(p.depth) + 3) + 2, 0);
      if (hh + extra > H - MT - MB) need(hh + 40); else need(hh + extra);
      for (const p of pend) { const sz = hSize(p.depth); y -= p.depth <= 1 ? 8 : 5; for (const l of p.lines) { txt(l, ML, y - sz, FN.b, sz, p.depth <= 1 ? C.head : C.ink); y -= sz + 3; } y -= 2; }
      pend = [];
    }

    /* ---------- tabella generica: colonne con larghezze, righe con celle (testo già formattato) ---------- */
    // cols: [{w, align:'l'|'r', head}] ; rows: [{cells:[{t, bold, map}], depth, bold, line, fill, heading}]
    function grid(cols, rows, { size = 8.2, headSize = 7.4, groups = null, title = null, kind = 'table', sectionTitle = '' } = {}) {
      const pad = 3, lh = size + 2.6;
      const xs = []; let x = ML; for (const c of cols) { xs.push(x); x += c.w; }
      const headLines = cols.map(c => wrapText(c.head || '', FN.b, headSize, c.w - pad * 2));
      // gruppi di colonne: l'intestazione va a capo, mai tagliata
      const gLines = (groups || []).map(g => { const x0 = xs[g.from], x1 = xs[g.to] + cols[g.to].w; return wrapText(g.label || '', FN.b, headSize, x1 - x0 - 6); });
      const gH = groups ? Math.max(1, ...gLines.map(l => l.length)) * (headSize + 2) + 6 : 0;
      const headH = Math.max(1, ...headLines.map(l => l.length)) * (headSize + 2) + 6 + gH;
      const drawHead = (cont) => {
        if (cont && title) { const t = S(title + ' (segue)'); txt(wrapText(t, FN.i, 8, CW)[0], ML, y - 8, FN.i, 8, C.mute); y -= 12; }
        let yy = y;
        page.drawRectangle({ x: ML, y: y - headH, width: CW, height: headH, color: col(C.ink) });
        if (groups) {
          groups.forEach((g, gi) => { const x0 = xs[g.from], x1 = xs[g.to] + cols[g.to].w; const ls = gLines[gi]; const top = gH - 6 - ls.length * (headSize + 2); ls.forEach((gl, k) => txt(gl, x0 + (x1 - x0 - tw(gl, FN.b, headSize)) / 2, yy - top - (k + 1) * (headSize + 2) + 0, FN.b, headSize, [1, 1, 1])); rule(x0 + 3, x1 - 3, yy - gH + 3, [0.55, 0.56, 0.6], 0.5); });
          yy -= gH;
        }
        cols.forEach((c, i) => headLines[i].forEach((l, k) => { const wv = tw(l, FN.b, headSize); const xx = c.align === 'r' ? xs[i] + c.w - pad - wv : xs[i] + pad; txt(l, xx, yy - (k + 1) * (headSize + 2) - 1, FN.b, headSize, [1, 1, 1]); }));
        y -= headH; rule(ML, W - MR, y, C.acc, 0.8);
      };
      const cwOf = (r, i) => { let w = cols[i].w; const sp = r.cells[i]?.span || 1; for (let k = 1; k < sp; k++) w += cols[i + k]?.w || 0; return w; };
      const linesOf = r => r.cells.map((cell, i) => {
        if (!cell) return [''];
        const f = cell.bold || r.bold ? FN.b : cell.italic ? FN.i : FN.r;
        const indent = i === 0 ? (r.depth || 0) * 8 : 0;
        return wrapText(cell.t ?? '', f, size, cwOf(r, i) - pad * 2 - indent);
      });
      const hOf = r => Math.max(1, ...linesOf(r).map(l => l.length)) * lh + 3;
      // il titolo e l'intestazione non restano mai soli in fondo alla pagina: con loro almeno le prime righe
      const firstH = rows.slice(0, 2).reduce((a, r) => a + hOf(r), 0) || lh * 2;
      const tl0 = title ? wrapText(title, FN.b, 9, CW) : [];
      flushHeads(title ? tl0.length * 12 + headH + firstH + 8 : headH + firstH + 2);
      if (title) { const tl = tl0; need(tl.length * 12 + headH + firstH + 8); if (firstMark) { firstMark(); firstMark = null; } y -= 4; for (const l of tl) { txt(l, ML, y - 9, FN.b, 9, C.ink); y -= 12; } y -= 2; }
      else { need(headH + firstH + 2); if (firstMark) { firstMark(); firstMark = null; } }
      const hasHead = cols.some(c => c.head);
      if (hasHead) drawHead();
      const open = []; // intestazioni di riga aperte (per ripeterle, «(segue)», sulla pagina nuova)
      rows.forEach((r, ri) => {
        const cw = i => cwOf(r, i);
        const lines = linesOf(r);
        const n = Math.max(1, ...lines.map(l => l.length));
        const rh = n * lh + 3;
        open.length = Math.min(open.length, r.depth || 0);
        const anc = open.filter(Boolean);
        // un'intestazione di riga va sulla stessa pagina della riga che la segue
        const keep = r.heading && rows[ri + 1] ? hOf(rows[ri + 1]) : 0;
        if (need(rh + 2 + keep)) {
          if (hasHead) drawHead(true);
          else if (title) { txt(wrapText(S(title + ' (segue)'), FN.i, 8, CW)[0], ML, y - 8, FN.i, 8, C.mute); y -= 12; }
          for (const a of anc) { const ah = lh + 3; const t = wrapText(a.t + ' (segue)', FN.b, size, cols[0].w - pad * 2 - a.depth * 8)[0]; txt(t, ML + pad + a.depth * 8, y - lh + 1.5, a.bold ? FN.b : FN.r, size, C.mute); y -= ah; rule(ML, W - MR, y, [0.906, 0.89, 0.851], 0.35); }
        }
        if (r.heading) open[r.depth || 0] = { t: r.cells[0]?.t ?? '', depth: r.depth || 0, bold: !!r.cells[0]?.bold };
        if (r.fill) page.drawRectangle({ x: ML, y: y - rh, width: CW, height: rh, color: col(C.soft) });
        if (r.line) rule(ML, W - MR, y, C.mute, 0.6);
        r.cells.forEach((cell, i) => {
          if (!cell) return;
          const f = cell.bold || r.bold ? FN.b : cell.italic ? FN.i : FN.r;
          const indent = i === 0 ? (r.depth || 0) * 8 : 0;
          const ls = lines[i];
          // i valori numerici stanno sull'ultima riga dell'etichetta (come nei bilanci a stampa)
          const offset = cols[i].align === 'r' && i > 0 ? Math.max(0, lines[0].length - ls.length) : 0;
          ls.forEach((l, k) => {
            const wv = tw(l, f, size);
            const xx = (cell.align || cols[i].align) === 'r' ? xs[i] + cw(i) - pad - wv : xs[i] + pad + indent;
            txt(l, xx, y - (k + offset + 1) * lh + 1.5, f, size, cell.color || C.ink);
          });
          if (cell.map) rec(cell.map.f, { kind: cell.map.kind || kind, row: cell.map.row ?? '', col: cell.map.col ?? '', display: cell.t, ...(title ? { table: title } : {}) });
        });
        y -= rh;
        rule(ML, W - MR, y, [0.906, 0.89, 0.851], 0.35);
      });
      y -= 6;
    }

    /* ---------- testo con stili ---------- */
    function richText(blocks, { size = 9, indent = 0, mapEntry = null } = {}) {
      const lh = size * 1.38;
      let startPage = null;
      const width = CW - indent;
      for (const b of blocks) {
        if (b.t === 'table') { if (startPage == null) firstMark = () => { startPage = pageNo; }; tableHtml(b, size - 0.8, indent); firstMark = null; continue; }
        const ind = indent + (b.t === 'li' ? 12 + (b.depth || 0) * 12 : 0);
        const w = CW - ind;
        // a capo su parole, mantenendo grassetto/corsivo
        const words = [];
        for (const r of b.runs) { const parts = r.text.split(/(\s+|\n)/); for (const p of parts) { if (!p) continue; if (p === '\n' || /\n/.test(p)) words.push({ br: true }); else if (/^\s+$/.test(p)) words.push({ sp: true, st: r }); else words.push({ text: p, st: b.t === 'h' ? { ...r, b: true } : r }); } }
        const lines = []; let line = [], lw = 0;
        const spW = FN.r.widthOfTextAtSize(' ', size);
        for (const wd of words) {
          if (wd.br) { lines.push(line); line = []; lw = 0; continue; }
          if (wd.sp) { if (line.length) { line.push({ sp: true }); lw += spW; } continue; }
          const f = fontOf(wd.st), ww = f.widthOfTextAtSize(S(wd.text), size);
          if (lw + ww > w && line.length) { while (line.length && line[line.length - 1].sp) line.pop(); lines.push(line); line = []; lw = 0; }
          line.push({ text: wd.text, f, u: wd.st.u, w: ww }); lw += ww;
        }
        if (line.length) lines.push(line);
        flushHeads(Math.min(lines.length, 3) * lh + 4);
        need(Math.min(lines.length, 3) * lh + 4);
        if (startPage == null) startPage = pageNo;
        if (b.t === 'h') y -= 3;
        lines.forEach((ln, li) => {
          if (need(lh)) { }
          let x = ML + ind;
          if (li === 0 && b.t === 'li') txt(b.bullet, ML + ind - 10, y - size, FN.r, size);
          for (const seg of ln) {
            if (seg.sp) { x += spW; continue; }
            txt(seg.text, x, y - size, seg.f, size);
            if (seg.u) rule(x, x + seg.w, y - size - 1.2, C.ink, 0.5);
            x += seg.w;
          }
          y -= lh;
        });
        y -= b.t === 'li' ? 1 : 4;
      }
      if (mapEntry) rec(mapEntry.f, { kind: 'text', row: mapEntry.row, col: '', display: mapEntry.display, page: startPage ?? pageNo });
    }
    function tableHtml(b, size0, indent) {
      const ncol = Math.max(...b.rows.map(r => r.reduce((a, c) => a + (c.span || 1), 0)));
      const avail = CW - indent;
      const NUM = /^[-+(]?\s?[\d.,]+\s?%?\)?-?$/, NEUTRAL = /^[-–—]?$/;
      const textOf = c => c.runs.map(x => x.text).join('').replace(/\s+/g, ' ').trim();
      // larghezze proporzionali al contenuto; se non ci stanno, si rimpicciolisce il carattere
      let size = size0, need_, minW;
      for (let pass = 0; pass < 6; pass++) {
        need_ = new Array(ncol).fill(16); minW = new Array(ncol).fill(18);
        for (const r of b.rows) { let k = 0; for (const c of r) { const t = textOf(c); const f = c.head || c.runs.some(x => x.b) ? FN.b : FN.r; if ((c.span || 1) === 1) { need_[k] = Math.max(need_[k], Math.min(260, f.widthOfTextAtSize(S(t), size) + 7)); for (const w of t.split(/\s+/)) minW[k] = Math.max(minW[k], Math.min(150, f.widthOfTextAtSize(S(w), size) + 7)); } k += c.span || 1; } }
        if (minW.reduce((a, b) => a + b, 0) <= avail || size <= 6) break;
        size = Math.max(6, size * avail / minW.reduce((a, b) => a + b, 0) - 0.1);
      }
      const tot = need_.reduce((a, b) => a + b, 0);
      let ws;
      if (tot <= avail) ws = need_.slice();
      else { const fixed = minW.reduce((a, b) => a + b, 0); ws = minW.map((m, i) => m + (need_[i] - m) * Math.max(0, avail - fixed) / Math.max(1, tot - fixed)); }
      const sc = avail / ws.reduce((a, b) => a + b, 0); if (sc < 1) ws = ws.map(w => w * sc);
      // colonne numeriche: tutte le celle sono numeri, trattini o vuote (intestazioni escluse)
      const numCol = new Array(ncol).fill(null).map((_, i) => {
        let nums = 0, other = 0, dash = 0;
        b.rows.forEach((r, ri) => { let k = 0; for (const c of r) { if (k === i && (c.span || 1) === 1 && !c.head && ri > 0 && !(c.runs.every(x => x.b) && !NUM.test(textOf(c)))) { const t = textOf(c); if (NUM.test(t)) nums++; else if (/^[-–—]$/.test(t)) dash++; else if (!NEUTRAL.test(t)) other++; } k += c.span || 1; } });
        return (nums > 0 || dash > 0) && other === 0;
      });
      // tabella a tutta larghezza: lo spazio in più va alle colonne di testo
      const free = avail - ws.reduce((a, b) => a + b, 0);
      if (free > 1) { const txt = ws.map((w, i) => (numCol[i] ? 0 : w)); const tw_ = txt.reduce((a, b) => a + b, 0) || 1; ws = ws.map((w, i) => w + free * (numCol.some(Boolean) ? txt[i] / tw_ : w / ws.reduce((a, b) => a + b, 0))); }
      const cols = ws.map((w, i) => ({ w, align: numCol[i] ? 'r' : 'l' }));
      const rows = b.rows.map(r => {
        const cells = []; let k = 0;
        for (const c of r) { const t = textOf(c); const sp = Math.min(c.span || 1, ncol - k); cells[k] = { t, bold: c.head || c.runs.some(x => x.b), span: sp > 1 ? sp : undefined, align: sp > 1 ? (c.align === 'right' ? 'r' : 'l') : numCol[k] ? 'r' : c.align === 'right' ? 'r' : 'l' }; k += c.span || 1; }
        return { cells: Array.from({ length: ncol }, (_, i) => cells[i] || null) };
      });
      grid(cols, rows, { size, kind: 'html' });
    }

    /* ---------- blocchi ---------- */
    const NUMCOL = 82;
    for (let bi = 0; bi < D.blocks.length; bi++) {
      const b = D.blocks[bi];
      section = b.section;
      onProgress?.(bi / D.blocks.length);
      if (b.type === 'kv') {
        h1(b.title);
        const lw = 210;
        grid([{ w: lw, align: 'l' }, { w: CW - lw, align: 'l' }], b.rows.map(r => ({ cells: [{ t: r.label ? r.label[0].toUpperCase() + r.label.slice(1) : r.label }, { t: D.display(r.f), map: { f: r.f, kind: 'kv', row: r.label } }] })), { kind: 'kv' });
        continue;
      }
      if (b.type === 'stmt') {
        h1(b.title);
        const cols = [{ w: CW - 2 * NUMCOL, align: 'l', head: '' }, { w: NUMCOL, align: 'r', head: b.cols[0] }, { w: NUMCOL, align: 'r', head: b.cols[1] }];
        grid(cols, b.rows.map(r => r.heading
          ? { cells: [{ t: r.label, bold: r.depth === 0 }, null, null], depth: r.depth, heading: true }
          : { cells: [{ t: r.label, bold: r.total }, ...r.vals.map((f, i) => f ? { t: D.display(f), bold: r.total, map: { f, kind: 'stmt', row: r.label, col: b.cols[i] } } : null)], depth: r.depth, line: r.total && r.depth <= 1, bold: false }), { kind: 'stmt' });
        continue;
      }
      if (b.type === 'section') {
        h1(b.title);
        for (const it of b.items) {
          if (it.type === 'h') { h(it.text, it.depth); continue; }
          if (it.type === 'text') {
            if (it.caption) { const s = 9.2; const ls = wrapText(it.label, FN.b, s, CW); flushHeads(ls.length * 12 + 40); need(ls.length * 12 + 40); y -= 2; for (const l of ls) { txt(l, ML, y - s, FN.b, s, C.ink); y -= s + 3; } y -= 1; }
            if (!it.caption) y -= 3;
            const raw = D.display(it.f);
            const blocks = it.f.nil ? [{ t: 'p', runs: [{ text: '—' }] }] : htmlBlocks(raw);
            richText(blocks, { mapEntry: { f: it.f, row: it.caption ? it.label : '', display: it.f.nil ? '—' : plainText(raw) } });
            continue;
          }
          if (it.type === 'pairs') {
            const num = it.rows.every(r => r.num);
            if (it.two || num) {
              const cols = [{ w: CW - 2 * NUMCOL, align: 'l', head: '' }, { w: NUMCOL, align: 'r', head: D.itDate(D.P.cur.end) }, ...(it.two ? [{ w: NUMCOL, align: 'r', head: D.itDate(D.P.prev.end) }] : [])];
              if (!it.two) cols[0].w = CW - NUMCOL;
              grid(cols, it.rows.map(r => ({ cells: [{ t: r.label }, ...r.vals.slice(0, it.two ? 2 : 1).map((f, i) => f ? { t: D.display(f), map: { f, kind: 'table', row: r.label, col: cols[i + 1].head } } : null)] })), { kind: 'table' });
            } else {
              const lw = 230;
              grid([{ w: lw, align: 'l' }, { w: CW - lw, align: 'l' }], it.rows.map(r => ({ cells: [{ t: r.label }, r.vals[0] ? { t: D.display(r.vals[0]), map: { f: r.vals[0], kind: 'kv', row: r.label } } : null] })).concat(it.rows.filter(r => r.vals[1]).map(r => ({ cells: [{ t: r.label + ' (esercizio precedente)' }, { t: D.display(r.vals[1]), map: { f: r.vals[1], kind: 'kv', row: r.label + ' (esercizio precedente)' } }] }))), { kind: 'kv' });
            }
            continue;
          }
          if (it.type === 'table') {
            // colonne a gruppi se troppe per la pagina
            const LW = 150, maxPer = Math.max(1, Math.floor((CW - LW) / 62)), per = Math.ceil(it.cols.length / Math.ceil(it.cols.length / maxPer));
            for (let s = 0; s < it.cols.length; s += per) {
              const cs = it.cols.slice(s, s + per);
              const vw = Math.min(110, (CW - LW) / cs.length);
              const cols = [{ w: CW - vw * cs.length, align: 'l', head: '' }, ...cs.map(c => ({ w: vw, align: 'r', head: c.head }))];
              let groups = null;
              if (cs.some(c => c.group)) { groups = []; cs.forEach((c, i) => { if (!c.group) return; const g = groups.find(g => g.key === c.group && g.to === i); if (g) g.to = i + 1; else groups.push({ key: c.group, label: it.groups[c.group], from: i + 1, to: i + 1 }); }); }
              // in ogni parte, solo le righe con valori nelle sue colonne (e le intestazioni che li introducono)
              const hv = r => r.cells.slice(s, s + per).some(x => x?.f);
              const rs = it.rows.filter((r, i) => hv(r) || (r.heading && (() => { for (let j = i + 1; j < it.rows.length && it.rows[j].depth > r.depth; j++) if (hv(it.rows[j])) return true; return false; })()));
              grid(cols, rs.map(r => ({ heading: r.heading, cells: [{ t: r.label, bold: r.heading }, ...r.cells.slice(s, s + per).map((x, i) => x?.f ? { t: D.display(x.f), map: { f: x.f, kind: 'table', row: r.path.join(' › '), col: (cs[i].group && it.groups[cs[i].group] ? it.groups[cs[i].group] + ' › ' : '') + cs[i].head } } : null)], depth: r.depth, bold: false })), { title: it.title + (it.cols.length > per ? ` (${Math.floor(s / per) + 1} di ${Math.ceil(it.cols.length / per)})` : ''), groups, kind: 'table' });
            }
            continue;
          }
          if (it.type === 'tuple') {
            const N = it.cols.length || 1;
            const textual = it.cols.map((c, i) => it.rows.some(r => r.cells[i]?.f && !/^[-\d.,%—]+$/.test(D.display(r.cells[i].f))));
            const fsz = N > 7 ? 7.6 : 8.2;
            // larghezza minima: la parola più lunga dell'intestazione e il valore più largo (i numeri non vanno mai a capo)
            const minw = it.cols.map((c, i) => Math.max(...String(c.head).split(/\s+/).map(w => FN.b.widthOfTextAtSize(S(w), 7.4) + 8), ...it.rows.map(r => r.cells[i]?.f && !textual[i] ? FN.r.widthOfTextAtSize(S(D.display(r.cells[i].f)), fsz) + 8 : 0), ...it.totals.filter(t => t.ci === i).map(t => FN.b.widthOfTextAtSize(S(D.display(t.f)), fsz) + 8), 30));
            const want = it.cols.map((c, i) => textual[i] ? Math.max(minw[i], 120) : minw[i]);
            // troppe colonne per la pagina: a parti, ripetendo in ognuna le colonne che identificano la riga
            const chunks = [];
            if (minw.reduce((a, b) => a + b, 0) <= CW) chunks.push(it.cols.map((c, i) => i));
            else {
              const key = []; for (let i = 0; i < N && textual[i] && key.length < 2; i++) key.push(i);
              if (!key.length) key.push(0);
              const keyW = key.reduce((a, i) => a + Math.max(minw[i], 90), 0);
              let cur = [], w = keyW;
              for (let i = 0; i < N; i++) { if (key.includes(i)) continue; if (cur.length && w + minw[i] > CW) { chunks.push([...key, ...cur]); cur = []; w = keyW; } cur.push(i); w += minw[i]; }
              if (cur.length) chunks.push([...key, ...cur]);
            }
            const W_ = x => new Set(String(x).toLowerCase().replace(/[’`]/g, "'").match(/[\p{L}\p{N}']+/gu) || []);
            chunks.forEach((idx, chi) => {
              const n = idx.length;
              let wantC = idx.map(i => want[i]), minC = idx.map(i => minw[i]);
              let sum = wantC.reduce((a, b) => a + b, 0);
              let ws = wantC.map(v => v * CW / sum);
              if (sum > CW) { const fixed = minC.reduce((a, b) => a + b, 0); ws = minC.map((m, i) => m + (wantC[i] - m) * Math.max(0, CW - fixed) / Math.max(1, sum - fixed)); const k = CW / ws.reduce((a, b) => a + b, 0); ws = ws.map(w => w * k); }
              const cols = idx.map((ci, i) => ({ w: ws[i], align: textual[ci] ? 'l' : 'r', head: it.cols[ci].head }));
              // le colonne ripetute in ogni parte (che identificano la riga) si registrano una volta sola: sono lo stesso dato
              const rep = ci => chi > 0 && chunks[0].includes(ci);
              const rows = it.rows.map(r => ({ cells: idx.map(ci => { const x = r.cells[ci]; return x?.f ? { t: D.display(x.f), map: rep(ci) ? null : { f: x.f, kind: 'tuple', row: '', col: it.cols[ci].head } } : null; }) }));
              // totali sotto le colonne che sommano: una sola riga «Totale» se cadono in colonne diverse
              // (solo per i totali la cui etichetta è detta per intero da «Totale» + intestazione della colonna; gli altri hanno una riga propria)
              const covered = t => { const hw = W_('totale ' + it.cols[t.ci].head); return [...W_(t.label)].every(w => hw.has(w)); };
              const placedAll = it.totals.filter(t => t.ci > 0 && N > 1 && idx.indexOf(t.ci) > 0);
              const inOne = placedAll.filter(covered);
              const oneRow = inOne.length > 1 && new Set(inOne.map(t => t.ci)).size === inOne.length;
              const placed = oneRow ? placedAll.filter(t => !inOne.includes(t)) : placedAll;
              if (oneRow) {
                const first = Math.min(...inOne.map(t => idx.indexOf(t.ci)));
                const cells = new Array(n).fill(null); cells[0] = { t: 'Totale', bold: true, span: first, align: 'l' };
                for (const t of inOne) cells[idx.indexOf(t.ci)] = { t: D.display(t.f), bold: true, map: { f: t.f, kind: 'table', row: 'Totale', col: it.cols[t.ci].head } };
                rows.push({ cells, line: true });
              }
              for (const t of placed) { const k = idx.indexOf(t.ci); const cells = new Array(n).fill(null); cells[0] = { t: t.label, bold: true, span: k, align: 'l' }; cells[k] = { t: D.display(t.f), bold: true, map: { f: t.f, kind: 'table', row: t.label, col: it.cols[t.ci].head } }; rows.push({ cells, line: true }); }
              grid(cols, rows, { title: it.title + (chunks.length > 1 ? ` (${chi + 1} di ${chunks.length})` : ''), kind: 'tuple', size: fsz });
            });
            const loose = it.totals.filter(t => !(t.ci > 0 && N > 1 && chunks.some(idx => idx.indexOf(t.ci) > 0)));
            if (loose.length) grid([{ w: CW - NUMCOL, align: 'l' }, { w: NUMCOL, align: 'r' }], loose.map(t => ({ cells: [{ t: t.label, bold: true }, { t: D.display(t.f), bold: true, map: { f: t.f, kind: 'table', row: t.label, col: '' } }] })), { kind: 'tuple' });
            continue;
          }
        }
        continue;
      }
      if (b.type === 'other') {
        need(150);
        h1(b.title);
        richText([{ t: 'p', runs: [{ text: b.note, i: true }] }], { size: 8.5 });
        grid([{ w: CW - 150 - 110, align: 'l', head: 'Voce' }, { w: 150, align: 'l', head: 'Periodo' }, { w: 110, align: 'r', head: 'Valore' }],
          b.rows.map(r => ({ cells: [{ t: r.label + (r.dupOf ? ' — valore duplicato diverso' : '') }, { t: r.period }, { t: M_isText(D, r.f) ? '(testo, vedi sotto)' : D.display(r.f), map: M_isText(D, r.f) ? null : { f: r.f, kind: 'other', row: r.label, col: r.period } }] })), { kind: 'other' });
        for (const r of b.rows.filter(r => M_isText(D, r.f))) { h(r.label + ' — ' + r.period, 3); richText(htmlBlocks(D.display(r.f)), { mapEntry: { f: r.f, row: r.label, display: plainText(D.display(r.f)) } }); }
        continue;
      }
    }
    flushHeads(0);
    /* ---------- intestazione e piè di pagina di file360 ---------- */
    const N = pages.length;
    Brand.decorate(pdf, FN, { label: `${name} · ${D.title}`, ml: ML, mr: MR, foot: MB - 30 });
    pdf.setTitle(`${name} - ${D.title}`); pdf.setSubject('Bilancio XBRL convertito in PDF'); pdf.setProducer('file360'); pdf.setCreator('file360'); pdf.setLanguage('it-IT');
    pdf.setCreationDate(new Date());
    const bytes = await pdf.save({ useObjectStreams: true });
    return { bytes, map, pages: N };
  }
  const M_isText = (D, f) => D.M.c[f.c]?.t === 'textBlockItemType' && !f.nil && (f.v || '').length > 60;
  return { render, htmlBlocks, plainText };
})();

/* ============================================================
   Strumento «XBRL in PDF»
   ============================================================ */
async function xbrlConvert(text, opts = {}) {
  const D = XbrlKit.build(text);
  const R = await XbrlPdf.render(D, opts);
  // verifica di completezza: ogni fatto del file deve comparire nella stampa
  const key = (c, ctx, t) => `${c}|${ctx}|${t || ''}`;
  const printed = new Set(R.map.map(e => key(e.concept, e.context, e.tuple)));
  const missing = D.inst.facts.filter(f => !printed.has(key(f.c, f.ctx, f.tup ? `${f.tup.c}#${f.tup.idx}` : '')));
  // i duplicati identici contano come riportati
  const dupSame = missing.filter(f => !f.tup && D.inst.facts.some(g => g !== f && g.c === f.c && g.ctx === f.ctx && (g.v ?? '') === (f.v ?? '') && printed.has(key(g.c, g.ctx, ''))));
  const miss = missing.filter(f => !dupSame.includes(f));
  return { D, ...R, missing: miss };
}
/* righe del bilancio così come stampate nel PDF (stesso ordine, stesse etichette), per CSV ed Excel */
function xbrlRows(out) {
  const D = out.D, M = D.M;
  const fx = new Map(D.inst.facts.map(f => [`${f.c}|${f.ctx}|${f.tup ? f.tup.c + '#' + f.tup.idx : ''}`, f]));
  const NUMT = /monetary|shares|decimal|integer|percent|pure|float|double/i;
  return out.map.map(e => {
    const f = fx.get(`${e.concept}|${e.context}|${e.tuple || ''}`);
    const t = M.c[e.concept]?.t || '';
    let num = null;
    if (f && !f.nil && NUMT.test(t) && /^\s*[+-]?\d*\.?\d+\s*$/.test(f.v || '')) num = Number(f.v);
    const isText = t === 'textBlockItemType';
    const text = isText ? XbrlPdf.plainText(f?.v || '') : (e.display ?? '');
    const tup = e.tuple ? D.label(e.tuple.split('#')[0], '') + ' n. ' + (+e.tuple.split('#')[1] + 1) : '';
    return { section: e.section || '', table: (e.table || '').replace(/\s*\(\d+ di \d+\)$/, ''), row: e.row || tup, col: e.col || '', value: num != null ? num : text, num: num != null, pct: /percent/i.test(t), dec: f?.dec, period: D.describeCtx(e.context), concept: e.concept, page: e.page };
  });
}
function xbrlCsv(rows) {
  // separatore «;» e virgola decimale: si apre direttamente in Excel italiano
  const q = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = (v, pct) => { const x = pct ? v * 100 : v; let s = String(Math.round(x * 1e10) / 1e10); if (/e/i.test(s)) s = x.toFixed(10).replace(/0+$/, '').replace(/\.$/, ''); return s.replace('.', ',') + (pct ? '%' : ''); };
  const lines = [['Sezione', 'Prospetto', 'Voce', 'Colonna', 'Valore', 'Periodo', 'Codice tassonomia', 'Pagina del PDF'].join(';')];
  for (const r of rows) lines.push([r.section, r.table, r.row, r.col, r.num ? num(r.value, r.pct) : r.value, r.period, r.concept, r.page].map(q).join(';'));
  return new TextEncoder().encode('\uFEFF' + lines.join('\r\n') + '\r\n');
}
async function xbrlXlsx(rows, title, D = null) {
  // primo foglio: il bilancio da lavorare (voce | esercizio | esercizio precedente); poi un foglio per sezione con tutti i dati
  let bil = null;
  try { const m = D && BilancioKit.fromXbrl(D); if (m) bil = BilancioKit.sheet(m); } catch (e) { console.warn('foglio Bilancio', e); }
  const bySec = new Map();
  for (const r of rows) { if (!bySec.has(r.section)) bySec.set(r.section, []); bySec.get(r.section).push(r); }
  const head = ['Prospetto', 'Voce', 'Colonna', 'Valore', 'Periodo', 'Codice tassonomia'].map(v => ({ t: 's', v, bold: true, fill: Brand.C.ink, color: '#FFFFFF', valign: 'center', border: { b: 'medium' } }));
  const sheets = [...bySec].map(([sec, list]) => ({
    name: sec.replace(/^Nota [Ii]ntegrativa[:,]?\s*/, 'NI ').replace(/\s*\(schema civilistico\)/i, '') || 'Bilancio', freeze: 1, tabColor: Brand.C.ink2,
    widths: [40, 48, 30, 18, 26, 40],
    rows: [head, ...list.map(r => [r.table ? { t: 's', v: r.table } : null, { t: 's', v: r.row }, r.col ? { t: 's', v: r.col } : null,
      r.num ? { t: 'n', v: r.pct ? r.value : r.value, fmt: r.pct ? '0.00%' : (r.dec != null && +r.dec > 0 ? '#,##0.' + '0'.repeat(Math.min(6, +r.dec)) : '#,##0') } : { t: 's', v: String(r.value).slice(0, 32000), wrap: String(r.value).length > 60 },
      { t: 's', v: r.period }, { t: 's', v: r.concept }])],
  }));
  return XlsxOut.build(bil ? [bil, ...sheets] : sheets, { title, font: 'Instrument Sans', fontSize: 10 });
}
// apre il file (anche .xbrl.p7m firmato o dentro uno zip) e restituisce il testo XBRL
async function xbrlPrepare(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  let name = file.name, signed = null;
  if (!/^\s*</.test(new TextDecoder('latin1').decode(bytes.subarray(0, 64))) && typeof FirmaKit !== 'undefined') {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const zip = await JSZip.loadAsync(bytes);
      const e = Object.values(zip.files).find(x => !x.dir && /\.(xbrl|xml)(\.p7m)?$/i.test(x.name));
      if (!e) throw new Error('Nello zip non c’è un file .xbrl.');
      bytes = await e.async('uint8array'); name = e.name;
    }
    if (!/^\s*</.test(new TextDecoder('latin1').decode(bytes.subarray(0, 64)))) {
      const r = await FirmaKit.open(bytes, name);
      if (!r.signed) throw new Error(`«${file.name}» non è un file XBRL.`);
      signed = r; bytes = r.content; name = r.name;
    }
  }
  // chi ha firmato il file (.p7m): riportato in copertina, con l'esito della verifica
  const signers = signed ? signed.layers.flatMap(l => l.sigs || []).filter(x => x.who).map(x => `File firmato digitalmente da ${x.who.name}${x.who.cf ? ' (CF ' + x.who.cf + ')' : ''}${x.signingTime ? ' il ' + FirmaKit.fmt(x.signingTime, false) : ''} · firma ${x.valid ? 'verificata' : 'NON valida'}`) : [];
  return { text: new TextDecoder('utf-8').decode(bytes), name, signed, signers };
}
// tassonomia mancante: si chiede lo zip una volta sola
function xbrlAskTaxonomy(e) {
  return new Promise((res, rej) => {
    const inp = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true, onchange: async () => {
      const f = inp.files[0]; if (!f) return;
      try { const ver = await withBusy('Lettura della tassonomia…', () => XbrlKit.addTaxonomyZip(f)); m.close(); res(ver); } catch (err) { toast(err.message, 'error'); }
    } });
    const m = modal([h('h3', {}, 'Serve la tassonomia del bilancio'),
      h('p', {}, e.message),
      h('p', { class: 'muted small' }, 'La trovi sul sito di XBRL Italia (it.xbrl.org), sezione Tassonomie: scarica lo zip della versione indicata e sceglilo qui. Viene letto sul tuo dispositivo e ricordato per le prossime volte.'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => { m.close(); rej(e); } }, 'Annulla'), h('button', { class: 'btn primary', onclick: () => inp.click() }, ic('upload', 16), 'Scegli lo zip'), inp),
    ], { width: 520, onClose: () => rej(e) });
  });
}
const xbrlOutName = D => (D.info.DatiAnagraficiDenominazione ? D.info.DatiAnagraficiDenominazione.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + ' - ' : '') + D.title.replace(/\//g, '-') + '.pdf';

async function startXbrl(stage, files) {
  if (files.length > 1) return startXbrlMany(stage, files);
  const file = files[0];
  const { text, signed, signers } = await withBusy('Lettura del bilancio…', () => xbrlPrepare(file));
  let out;
  const attempt = () => withBusy('Impaginazione del bilancio…', () => xbrlConvert(text, { signers }));
  try { out = await attempt(); }
  catch (e) {
    if (e.needTaxonomy === undefined) throw e;
    await xbrlAskTaxonomy(e);
    out = await attempt();
  }
  window.__xbrlLast = out;
  const { D } = out;
  const doc = await openPdf(new File([out.bytes], 'bilancio.pdf', { type: 'application/pdf' }));
  const viewer = new Viewer(doc, { fit: IS_TOUCH ? 'width' : 'width' });
  onLeave(() => viewer.destroy());
  requestAnimationFrame(() => viewer.render());
  const outName = xbrlOutName(D);
  const ok = !out.missing.length;
  const fmtN = n => n.toLocaleString('it-IT');
  const side = [
    h('div', { class: 'sig-head s-' + (ok ? 'ok' : 'bad') }, ic(ok ? 'check' : 'x', 22, 2.4),
      h('div', {}, h('b', {}, ok ? 'Tutti i dati del file sono nel PDF' : `${out.missing.length} dati non riportati`),
        h('div', { class: 'small' }, `${fmtN(D.inst.facts.length)} valori${D.inst.tuples.length ? `, ${fmtN(D.inst.tuples.length)} righe di elenchi` : ''} · ${out.pages} pagine`))),
    sec('Bilancio',
      h('dl', { class: 'sig-dl', style: { borderTop: 0, padding: 0 } },
        ...[['Società', D.info.DatiAnagraficiDenominazione], ['Codice fiscale', D.info.DatiAnagraficiCodiceFiscale], ['Tipo', D.kind], ['Esercizio', `dal ${D.itDate(D.P.cur.start)} al ${D.itDate(D.P.cur.end)}`], ['Esercizio precedente', `al ${D.itDate(D.P.prev.end)}`], ['Tassonomia', 'PCI ' + D.version]].filter(r => r[1]).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
    D.orphans.length ? h('div', { class: 'hint' }, `${plural(D.orphans.length, 'dato non rientra', 'dati non rientrano')} nei prospetti (per esempio valori di altri esercizi): è riportato in fondo, in «Altri dati presenti nel file».`) : null,
    D.calc.length ? h('details', { class: 'sigc s-warn' }, h('summary', {}, h('span', { class: 'sig-badge' }, ic('shield', 16, 2.6)), h('span', { class: 'sig-t' }, h('b', {}, `${plural(D.calc.length, 'somma non torna', 'somme non tornano')} nel file`), h('span', { class: 'muted small' }, 'Errori del bilancio depositato, non della conversione'))),
      h('div', { class: 'sig-msgs' }, ...D.calc.slice(0, 30).map(c => h('div', { class: 'sig-m warn' }, `${c.label} (${c.k.startsWith('i') || c.k === 'dCur' ? (c.k === 'iCur' || c.k === 'dCur' ? 'esercizio' : 'esercizio precedente') : ''}): nel file ${XbrlKit.fmtNumber(String(c.found), 0)}, somma delle voci ${XbrlKit.fmtNumber(String(Math.round(c.expected)), 0)}`)))) : null,
    !ok ? h('div', { class: 'hint warn' }, 'Alcuni valori non sono stati stampati: ' + out.missing.slice(0, 5).map(f => f.c).join(', ')) : null,
    signed ? h('div', { class: 'hint ok' }, `File firmato digitalmente${signed.layers.flatMap(l => l.sigs || []).map(s => s.who?.name).filter(Boolean).length ? ' da ' + signed.layers.flatMap(l => l.sigs || []).map(s => s.who?.name).filter(Boolean).join(', ') : ''}: il bilancio è stato estratto dalla busta .p7m.`) : null,
  ].filter(Boolean);
  const base = outName.replace(/\.pdf$/, '');
  const exportAll = async () => {
    const rows = xbrlRows(out);
    const files = [
      { name: outName, bytes: out.bytes, info: `${out.pages} pagine` },
      { name: base + '.csv', bytes: xbrlCsv(rows), type: 'text/csv;charset=utf-8', info: `${rows.length.toLocaleString('it-IT')} righe · separatore «;», si apre in Excel` },
      { name: base + '.xlsx', bytes: await xbrlXlsx(rows, D.title, D), type: XlsxOut.MIME, info: 'Excel: foglio «Bilancio» con voce, esercizio ed esercizio precedente (pronto per i calcoli), più tutti i dati per sezione' },
    ];
    showResult(files, { title: 'Bilancio convertito', primary: 0, zipName: base + '.zip', note: ok ? 'Tutti i dati del file XBRL sono nel PDF, nel CSV e nell’Excel, nello stesso ordine e con le stesse etichette.' : 'Attenzione: alcuni dati non sono stati riportati.' });
  };
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: exportAll }, ic('download', 18), 'Scarica PDF, CSV ed Excel');
  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), side, [runBtn]);
}

/* più bilanci insieme: ognuno con i suoi file (PDF, e a scelta CSV ed Excel) */
async function startXbrlMany(stage, files) {
  const rows = files.map(f => batchRow(f.name, fmtSize(f.size), ic('xbrl', 22)));
  const st = { csv: false, xlsx: true };
  workspace(stage, batchMain(rows, `${plural(files.length, 'bilancio', 'bilanci')}`), [
    h('div', { class: 'hint ok' }, 'Ogni bilancio resta separato: per ciascuno ottieni il suo PDF leggibile (e, se vuoi, CSV ed Excel), con il nome della società e l’esercizio.'),
    sec('File da creare per ogni bilancio',
      checkbox('PDF leggibile', true, () => {}, 'Sempre incluso.'),
      checkbox('Excel (.xlsx)', st.xlsx, v => st.xlsx = v, 'Foglio «Bilancio» con voce, esercizio ed esercizio precedente, più tutti i dati per sezione.'),
      checkbox('CSV', st.csv, v => st.csv = v, 'Tutti i valori in un elenco, separatore «;».')),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('xbrl', 18), `Converti ${files.length} bilanci`)]);
  const pdfBox = stage.querySelector('.side input[type=checkbox]'); if (pdfBox) pdfBox.disabled = true;

  async function run() {
    rows.forEach(r => r.reset());
    let todo = rows.map((r, i) => i), results = new Array(files.length).fill(null), errors = [];
    for (let round = 0; round < 2 && todo.length; round++) {
      const need = [];
      await withBusy('Conversione dei bilanci…', async () => {
        const sub = todo.map(i => rows[i]);
        const R = await batchPool(sub, 1, async (k, r, ctx, prog) => {
          const i = todo[k];
          prog(0.1, 'Lettura…');
          const { text, signers } = await xbrlPrepare(files[i]);
          prog(0.3, 'Impaginazione…');
          let out;
          try { out = await xbrlConvert(text, { signers }); }
          catch (e) { if (e.needTaxonomy !== undefined && round === 0) { need.push([i, e]); r.reset(); r.stEl.textContent = 'Serve la tassonomia'; return null; } throw e; }
          const { D } = out, pdfName = xbrlOutName(D), base = pdfName.replace(/\.pdf$/, '');
          const outs = [{ name: pdfName, bytes: out.bytes, info: `${out.pages} pagine${out.missing.length ? ` · ${out.missing.length} dati non riportati` : ''}` }];
          if (st.csv || st.xlsx) {
            prog(0.8, 'CSV ed Excel…');
            const xr = xbrlRows(out);
            if (st.xlsx) outs.push({ name: base + '.xlsx', bytes: await xbrlXlsx(xr, D.title, D), type: XlsxOut.MIME, info: 'Excel del bilancio' });
            if (st.csv) outs.push({ name: base + '.csv', bytes: xbrlCsv(xr), type: 'text/csv;charset=utf-8', info: `${xr.length.toLocaleString('it-IT')} righe` });
          }
          r.subEl.textContent = `${D.info.DatiAnagraficiDenominazione || ''}${D.info.DatiAnagraficiDenominazione ? ' · ' : ''}${D.title}`;
          return { outs, ok: !out.missing.length };
        });
        R.results.forEach((x, k) => { if (x) results[todo[k]] = x; });
        errors.push(...R.errors);
      }, { cancellable: true });
      if (!need.length) break;
      try { await xbrlAskTaxonomy(need[0][1]); } catch { need.forEach(([i]) => { rows[i].fail(); errors.push(`${files[i].name}: tassonomia mancante`); }); break; }
      todo = need.map(([i]) => i);
    }
    const outs = results.filter(Boolean).flatMap(x => x.outs);
    if (!outs.length) return toast(errors[0] || 'Nessun bilancio convertito', 'error');
    uniqueNames(outs.map(o => o.name)).forEach((n, i) => outs[i].name = n);
    const incomplete = results.filter(x => x && !x.ok).length;
    showResult(outs, { title: 'Bilanci convertiti', zipName: 'bilanci.zip',
      note: batchNote(outs.length, errors, [incomplete ? `Attenzione: in ${plural(incomplete, 'bilancio', 'bilanci')} alcuni dati non sono stati riportati.` : '']) });
  }
}

/* =====================================================================
   XlsxOut — scrive un file Excel (.xlsx) vero: più fogli, numeri e date come valori
   (con il loro formato), grassetto, testo a capo, celle unite, larghezza delle colonne.
   ===================================================================== */
const XlsxOut = (() => {
  const esc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26; } return s; };
  const ref = (r, c) => colName(c) + (r + 1);
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // nomi dei fogli: max 31 caratteri, senza []:*?/\ e unici
  function sheetNames(list) {
    const used = new Set();
    return list.map((n, i) => {
      let b = String(n || `Foglio ${i + 1}`).replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Foglio ${i + 1}`;
      let name = b, k = 2;
      while (used.has(name.toLowerCase())) { const suf = ` (${k++})`; name = b.slice(0, 31 - suf.length) + suf; }
      used.add(name.toLowerCase());
      return name;
    });
  }
  /* sheets: [{ name, rows: [[cell|null]], merges: [[r0,c0,r1,c1]], widths?: [caratteri], heights?: [punti], landscape?, freeze?, fit? }]
     cell: { v, t: 'n'|'d'|'s', fmt?, bold?, italic?, wrap?, align?: 'left'|'right'|'center', valign?: 'top'|'center'|'bottom',
             size?: punti, font?: 'Arial', color?: '#RRGGBB', indent?: livelli, f?: formula (v = valore calcolato), border?: { t, b, l, r: 'thin'|'medium'|'hair' }, fill?: '#RRGGBB' } */
  async function build(sheets, { title = '', creator = 'file360', font: baseFont = 'Calibri', fontSize = 11 } = {}) {
    const zip = new JSZip();
    const numFmts = new Map();
    const fmtId = code => { if (!code || code === 'General') return 0; if (code === '0') return 1; if (code === '0.00') return 2; if (code === '#,##0') return 3; if (code === '#,##0.00') return 4; if (code === '0%') return 9; if (code === '0.00%') return 10; if (!numFmts.has(code)) numFmts.set(code, 164 + numFmts.size); return numFmts.get(code); };
    const reg = () => { const list = [], idx = new Map(); return { list, id: (key, xml) => { if (!idx.has(key)) { idx.set(key, list.length); list.push(xml); } return idx.get(key); } }; };
    const fontsR = reg(), bordersR = reg(), fillsR = reg();
    const fontXml = (name, sz, b, i, col) => `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${sz}"/>${col ? `<color rgb="FF${col.replace('#', '').toUpperCase()}"/>` : ''}<name val="${esc(name)}"/><family val="2"/></font>`;
    fontsR.id([baseFont, fontSize, 0, 0, ''].join('|'), fontXml(baseFont, fontSize, 0, 0));
    fillsR.id('none', '<fill><patternFill patternType="none"/></fill>'); fillsR.id('gray125', '<fill><patternFill patternType="gray125"/></fill>');
    bordersR.id('', '<border><left/><right/><top/><bottom/><diagonal/></border>');
    const side = (tag, st) => st ? `<${tag} style="${st}"><color rgb="FF000000"/></${tag}>` : `<${tag}/>`;
    const xfs = [], xfKey = new Map();
    const styleOf = c => {
      const fname = c.font || baseFont, sz = Math.round((c.size || fontSize) * 2) / 2;
      const font = fontsR.id([fname, sz, c.bold ? 1 : 0, c.italic ? 1 : 0, c.color || ''].join('|'), fontXml(fname, sz, c.bold, c.italic, c.color));
      const bd = c.border || {};
      const bkey = ['l', 'r', 't', 'b'].map(k => bd[k] || '').join('|');
      const border = bkey === '|||' ? 0 : bordersR.id(bkey, `<border>${side('left', bd.l)}${side('right', bd.r)}${side('top', bd.t)}${side('bottom', bd.b)}<diagonal/></border>`);
      const fill = c.fill ? fillsR.id(c.fill, `<fill><patternFill patternType="solid"><fgColor rgb="FF${c.fill.replace('#', '').toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const key = [fmtId(c.fmt), font, border, fill, c.wrap ? 1 : 0, c.align || '', c.valign || '', c.indent ? Math.min(15, Math.round(c.indent)) : 0].join('|');
      if (!xfKey.has(key)) { xfKey.set(key, xfs.length); xfs.push(key); }
      return xfKey.get(key);
    };
    styleOf({});
    const sst = [], sstIdx = new Map();
    const si = s => { if (!sstIdx.has(s)) { sstIdx.set(s, sst.length); sst.push(s); } return sstIdx.get(s); };
    let nStr = 0;
    const names = sheetNames(sheets.map(s => s.name));
    sheets.forEach((sh, k) => {
      const rows = sh.rows || [];
      const nCols = Math.max(1, sh.widths ? sh.widths.length : 0, ...rows.map(r => r.length));
      const widths = sh.widths || Array.from({ length: nCols }, (_, c) => {
        let w = 6;
        rows.forEach(r => { const x = r[c]; if (!x || x.span) return; if (x.t === 's' && r.filter(y => y && y.v !== '').length === 1 && r.length >= 1 && nCols > 1) return; /* testo da solo sulla riga: in Excel scorre nelle celle vuote accanto */ const t = x.t === 'n' ? (x.shown || String(x.v)) : x.t === 'd' ? '00/00/0000' : String(x.v); const longest = x.wrap ? Math.max(...t.split('\n').map(l => l.length)) : t.length; w = Math.max(w, Math.min(60, longest * (x.bold ? 1.1 : 1) + 2)); });
        return w;
      });
      const xml = [HEAD, '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
      xml.push(sh.fit || sh.tabColor ? `<sheetPr>${sh.tabColor ? `<tabColor rgb="FF${sh.tabColor.replace('#', '').toUpperCase()}"/>` : ''}${sh.fit ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>` : '');
      const last = rows.length ? ref(Math.max(0, rows.length - 1), nCols - 1) : 'A1';
      xml.push(`<dimension ref="A1:${last}"/>`);
      xml.push(`<sheetViews><sheetView workbookViewId="0"${k === 0 ? ' tabSelected="1"' : ''}${sh.noGrid ? ' showGridLines="0"' : ''}${sh.zoom ? ` zoomScale="${sh.zoom}"` : ''}>${sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>`);
      xml.push('<sheetFormatPr defaultRowHeight="15"/>');
      xml.push('<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${(Math.round(Math.max(0.3, w) * 100) / 100).toFixed(2)}" customWidth="1"/>`).join('') + '</cols>');
      xml.push('<sheetData>');
      // celle unite: bordi e stile sulle celle coperte (Excel li vuole su tutto il bordo dell'area unita)
      const covered = new Map();
      for (const [r0, c0, r1, c1] of sh.merges || []) {
        const top = rows[r0]?.[c0]; if (!top) continue;
        const bd = top.border || {};
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          if (r === r0 && c === c0) continue;
          const b = { t: r === r0 ? bd.t : null, b: r === r1 ? bd.b : null, l: c === c0 ? bd.l : null, r: c === c1 ? bd.r : null };
          if (b.t || b.b || b.l || b.r || top.fill) covered.set(r + ',' + c, { t: 's', v: '', border: b, fill: top.fill, _cov: true });
        }
        if (r1 > r0 || c1 > c0) top.border = { t: bd.t, l: bd.l, b: r1 === r0 ? bd.b : null, r: c1 === c0 ? bd.r : null };
      }
      const nRows = Math.max(rows.length, sh.heights ? sh.heights.length : 0);
      for (let ri = 0; ri < nRows; ri++) {
        const r = rows[ri] || [];
        const cells = [];
        const n = Math.max(r.length, nCols);
        for (let ci = 0; ci < n; ci++) {
          let x = r[ci] || covered.get(ri + ',' + ci) || null;
          if (!x) continue;
          const empty = x.v === '' || x.v == null;
          if (empty && !x.f && !x.bold && !x.border && !x.fill && !x._cov) continue;
          const s = styleOf(x);
          const sa = s ? ` s="${s}"` : '';
          if (x.f) cells.push(`<c r="${ref(ri, ci)}"${sa}${x.t === 's' ? ' t="str"' : ''}><f>${esc(x.f)}</f>${empty || (x.t !== 's' && !Number.isFinite(x.v)) ? '' : `<v>${esc(x.v)}</v>`}</c>`);
          else if (!empty && (x.t === 'n' || x.t === 'd')) { if (Number.isFinite(x.v)) cells.push(`<c r="${ref(ri, ci)}"${sa}><v>${x.v}</v></c>`); }
          else if (!empty) { nStr++; cells.push(`<c r="${ref(ri, ci)}"${sa} t="s"><v>${si(String(x.v))}</v></c>`); }
          else cells.push(`<c r="${ref(ri, ci)}"${sa}/>`);
        }
        const ht = sh.heights?.[ri];
        let attr = '';
        if (ht != null) attr = ` ht="${Math.max(0.75, Math.min(409, Math.round(ht * 100) / 100))}" customHeight="1"`;
        else { const lines = Math.max(1, ...r.map(x => (x && x.wrap ? String(x.v).split('\n').length : 1))); if (lines > 1) attr = ` ht="${15 * lines}" customHeight="1"`; }
        xml.push(`<row r="${ri + 1}"${attr}>${cells.join('')}</row>`);
      }
      xml.push('</sheetData>');
      if (sh.autoFilter) xml.push(`<autoFilter ref="${sh.autoFilter}"/>`);
      const merges = (sh.merges || []).filter(([r0, c0, r1, c1]) => r1 > r0 || c1 > c0);
      if (merges.length) xml.push(`<mergeCells count="${merges.length}">` + merges.map(([r0, c0, r1, c1]) => `<mergeCell ref="${ref(r0, c0)}:${ref(r1, c1)}"/>`).join('') + '</mergeCells>');
      xml.push(sh.margins ? `<pageMargins left="${sh.margins}" right="${sh.margins}" top="${sh.margins}" bottom="${sh.margins}" header="0.1" footer="0.1"/>` : '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
      xml.push(`<pageSetup paperSize="${sh.paper || 9}" orientation="${sh.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`);
      xml.push('</worksheet>');
      zip.file(`xl/worksheets/sheet${k + 1}.xml`, xml.join(''));
    });
    const xfXml = xfs.map(key => {
      const [f, font, border, fill, w, al, va, ind] = key.split('|');
      const align = +w || al || va || +ind ? `<alignment${al || +ind ? ` horizontal="${al || 'left'}"` : ''}${` vertical="${va || 'top'}"`}${+w ? ' wrapText="1"' : ''}${+ind ? ` indent="${ind}"` : ''}/>` : '';
      return `<xf numFmtId="${f}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${+f ? ' applyNumberFormat="1"' : ''}${+font ? ' applyFont="1"' : ''}${+border ? ' applyBorder="1"' : ''}${+fill ? ' applyFill="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
    });
    zip.file('xl/styles.xml', HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.size ? `<numFmts count="${numFmts.size}">` + [...numFmts].map(([c, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(c)}"/>`).join('') + '</numFmts>' : '') +
      `<fonts count="${fontsR.list.length}">${fontsR.list.join('')}</fonts>` +
      `<fills count="${fillsR.list.length}">${fillsR.list.join('')}</fills>` +
      `<borders count="${bordersR.list.length}">${bordersR.list.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfXml.length}">${xfXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    zip.file('xl/sharedStrings.xml', HEAD + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${nStr}" uniqueCount="${sst.length}">` + sst.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>');
    zip.file('xl/workbook.xml', HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${names.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    zip.file('_rels/.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', HEAD + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.file('docProps/app.xml', HEAD + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${esc(creator)}</Application></Properties>`);
    zip.file('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      names.map((n, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return { build, colName, MIME };
})();
if (typeof module !== 'undefined') module.exports = XlsxOut;

/* =====================================================================
   PDF in Excel — le tabelle del PDF (anche senza linee, anche scansionate) diventano
   celle vere: colonne riconosciute dall'allineamento del testo o dalle linee della griglia,
   importi e date come numeri (formato italiano o inglese riconosciuto da solo), righe che
   vanno a capo riunite, intestazioni in grassetto.
   ===================================================================== */
const ExcelKit = (() => {
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const NUM_LIKE = /^[-+−–(]?\s?(?:€\s?)?[\d][\d.,' ]*\d?(?:\s?%)?\)?-?$|^[-+−–(]?\d+[.,]?\d*\)?-?$/;
  const isNumLike = t => { t = String(t).trim(); return /\d/.test(t) && NUM_LIKE.test(t) && !/[a-z]/i.test(t.replace(/€/g, '')); };
  const DATE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})$/;
  const isDateLike = t => DATE.test(String(t).trim());

  /* formato dei numeri del documento: «1.234,56» (italiano) o «1,234.56» (inglese) */
  function detectLocale(texts) {
    let it = 0, en = 0;
    for (const t of texts) {
      for (const m of String(t).matchAll(/\d[\d.,]*\d/g)) {
        const s = m[0];
        if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) it += 3; else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) en += 3;
        else if (/^\d+,\d{1,2}$/.test(s)) it++; else if (/^\d+\.\d{1,2}$/.test(s) && !DATE.test(s)) en++;
      }
    }
    return en > it * 1.5 && en >= 3 ? 'en' : 'it';
  }
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  /* valore di una cella: numero (con il suo formato), data, oppure testo così com'è */
  function parseValue(s, loc = 'it') {
    const raw0 = String(s ?? '').replace(/\s+/g, ' ').trim();
    // segni attaccati da una scansione («‘08/04/2024», «| 8.623,73 €»): se senza di loro è un numero o una data, vale quello
    const clean = raw0.replace(/^[‘’'"`|¦_—–=~:;,\s]+/, '').replace(/[‘’'"`|¦_—=~:;,\s]+$/, '');
    if (clean && clean !== raw0) { const p = parseValue1(clean, loc); if (p.t !== 's') return p; }
    return parseValue1(raw0, loc);
  }
  function parseValue1(s, loc) {
    const raw = s;
    if (!raw) return { t: 's', v: '' };
    const txt = { t: 's', v: raw };
    const dm = DATE.exec(raw);
    if (dm) {
      let d = +dm[1], m = +dm[2], y = +dm[3];
      if (loc === 'en' && m > 12 && d <= 12) [d, m] = [m, d];
      if (dm[3].length === 2) y += y < 50 ? 2000 : 1900;
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (m >= 1 && m <= 12 && d >= 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2200) return { t: 'd', v: serial(y, m, d), fmt: dm[3].length === 2 ? 'dd/mm/yy' : 'dd/mm/yyyy', shown: raw };
      return txt;
    }
    let t = raw.replace(/^(?:€|eur|euro)\s*/i, '').replace(/\s*(?:€|eur|euro)$/i, '');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
    if (/^[-−–]\s?/.test(t)) { neg = !neg; t = t.replace(/^[-−–]\s?/, ''); } else if (/^\+\s?/.test(t)) t = t.replace(/^\+\s?/, '');
    t = t.replace(/^(?:€|eur)\s*/i, '');
    if (/\s?[-−–]$/.test(t)) { neg = !neg; t = t.replace(/\s?[-−–]$/, ''); }
    let pct = false;
    if (/\s?%$/.test(t)) { pct = true; t = t.replace(/\s?%$/, ''); }
    const dec = loc === 'en' ? '.' : ',', th = loc === 'en' ? ',' : '.';
    const E = c => '\\' + c;
    const reTh = new RegExp(`^\\d{1,3}(?:${E(th)}\\d{3})+(?:${E(dec)}\\d+)?$`), rePlain = new RegExp(`^\\d+(?:${E(dec)}\\d+)?$`), reDecOnly = new RegExp(`^${E(dec)}\\d+$`);
    if (!(reTh.test(t) || rePlain.test(t) || reDecOnly.test(t))) return txt;
    const [ip0, fp = ''] = t.split(dec);
    const ip = ip0.split(th).join('');
    // codici, non numeri: zeri iniziali (CAP, codici), numeri lunghi senza separatori (partite IVA, telefoni, conti)
    if (ip.length > 1 && ip[0] === '0' && !t.includes(th)) return txt;
    if (!t.includes(th) && !fp && ip.length >= 11) return txt;
    const v0 = Number((ip || '0') + (fp ? '.' + fp : ''));
    if (!Number.isFinite(v0)) return txt;
    let v = neg ? -v0 : v0;
    let fmt = (t.includes(th) || fp) ? '#,##0' + (fp ? '.' + '0'.repeat(Math.min(fp.length, 6)) : '') : '';
    if (pct) { v = v / 100; fmt = '0' + (fp ? '.' + '0'.repeat(Math.min(fp.length, 6)) : '') + '%'; }
    if (/€|\beur(o)?\b/i.test(raw) && !pct) fmt = (fmt || '#,##0') + ' "€"';
    if (neg && fmt) fmt = `${fmt};-${fmt}`;
    return { t: 'n', v: Math.round(v * 1e10) / 1e10, fmt, shown: raw };
  }

  const joinWords = ws => ws.reduce((s, w, i) => s + (i && !w.glue ? ' ' : '') + w.t, '');
  /* una riga di testo divisa in pezzi separati da spazi larghi (le possibili celle) */
  function segments(line) {
    const ws = [...line.words].sort((a, b) => a.x0 - b.x0);
    const em = line.size || 10;
    const segs = [];
    let cur = null;
    for (const w of ws) {
      if (cur) {
        const gap = w.x0 - cur.x1;
        const last = cur.words[cur.words.length - 1];
        const nb = isNumLike(w.t) || isDateLike(w.t), pb = isNumLike(last.t) || isDateLike(last.t);
        let split = gap > 0.9 * em;
        if (!split && gap > 0.42 * em && nb && pb) split = true;          // due importi vicini
        if (!split && gap > 0.6 * em && nb !== pb && !/[.:]$/.test(last.t)) split = true; // testo e importo
        if (!split) { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1); continue; }
      }
      cur = { words: [w], x0: w.x0, x1: w.x1 };
      segs.push(cur);
    }
    for (const s of segs) { s.t = joinWords(s.words); s.b = s.words.every(w => w.b); s.num = isNumLike(s.t) || isDateLike(s.t); }
    return segs;
  }

  /* colonne di un gruppo di righe: le fasce orizzontali che il testo occupa in (quasi) tutte le righe */
  function columnsOf(lines) {
    const counts = lines.map(l => l.segs.length);
    const maxC = Math.max(...counts);
    // le colonne si leggono dalle righe con gli importi (le intestazioni, spesso su più parole vicine, non fanno da ponte)
    const data = lines.filter(l => l.segs.length >= 2 && l.segs.some(s => s.num));
    const strong = data.length >= 2 ? data : lines.filter(l => l.segs.length >= Math.max(2, Math.round(maxC * 0.6)));
    const X0 = Math.floor(Math.min(...lines.flatMap(l => l.segs.map(s => s.x0)))), X1 = Math.ceil(Math.max(...lines.flatMap(l => l.segs.map(s => s.x1))));
    const W = X1 - X0 + 2, cov = new Uint16Array(W);
    for (const l of strong) for (const s of l.segs) for (let x = Math.max(0, Math.floor(s.x0 - X0)); x < Math.min(W, Math.ceil(s.x1 - X0)); x++) cov[x]++;
    const thr = Math.floor(strong.length * 0.12);
    const hulls = [];
    let a = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && cov[x] > thr;
      if (on && a < 0) a = x;
      if (!on && a >= 0) { hulls.push({ x0: a + X0, x1: x + X0 }); a = -1; }
    }
    // pezzi che cadono fuori da tutte le colonne (valori presenti solo in poche righe): colonna propria
    for (const l of lines) for (const s of l.segs) {
      if (hulls.some(h => Math.min(h.x1, s.x1) - Math.max(h.x0, s.x0) > 0)) continue;
      hulls.push({ x0: s.x0, x1: s.x1 });
    }
    hulls.sort((p, q) => p.x0 - q.x0);
    const merged = [];
    for (const h of hulls) { const l = merged[merged.length - 1]; if (l && h.x0 < l.x1 - 0.5) l.x1 = Math.max(l.x1, h.x1); else merged.push({ ...h }); }
    return merged;
  }
  const overlap = (h, s) => Math.min(h.x1, s.x1) - Math.max(h.x0, s.x0);
  function assign(cols, s) {
    let best = -1, bo = 0;
    cols.forEach((h, i) => { const o = overlap(h, s); if (o > bo) { bo = o; best = i; } });
    if (best >= 0) return best;
    const cx = (s.x0 + s.x1) / 2;
    let bd = Infinity; cols.forEach((h, i) => { const d = Math.min(Math.abs(cx - h.x0), Math.abs(cx - h.x1)); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* in una colonna di codici (CAP, codici articolo…) anche quelli senza zeri iniziali restano testo, come gli altri */
  function codeColumns(rows, r0, r1) {
    const nC = Math.max(0, ...rows.slice(r0, r1).map(r => r.length));
    for (let c = 0; c < nC; c++) {
      const col = rows.slice(r0, r1).map(r => r[c]).filter(Boolean);
      if (!col.some(x => x.t === 's' && /^0\d+$/.test(x.v))) continue;
      for (const x of col) if (x.t === 'n' && !x.fmt && /^\d+$/.test(x.shown || '')) { x.t = 's'; x.v = x.shown; delete x.fmt; }
    }
  }
  /* una pagina (righe di testo e tabelle con griglia, in punti) → righe di celle per il foglio */
  function pageGrid(layout, { loc = 'it', merge = true, content = 'all', types = true } = {}) {
    const val = (s, bold) => { const p = types ? parseValue(s, loc) : { t: 's', v: String(s).trim() }; if (bold) p.bold = true; return p; };
    const lines = (layout.lines || []).filter(l => l.words.length).map(l => ({ ...l, segs: segments(l) })).sort((a, b) => a.base - b.base);
    // gruppi di righe vicine che contengono almeno due righe «a colonne»
    const blocks = [];
    {
      let run = [];
      const flush = () => {
        // dentro il gruppo, due righe di seguito «a un solo pezzo» separano due tabelle diverse
        let cur = [];
        const close = () => { const multi = cur.filter(l => l.segs.length >= 2); if (multi.length >= 2) { const a = cur.indexOf(multi[0]), b = cur.lastIndexOf(multi[multi.length - 1]); blocks.push(cur.slice(a, b + 1)); } cur = []; };
        // (le righe brevi a un pezzo — titoletti come «2) crediti» — restano dentro la tabella; le righe di testo lunghe la chiudono)
        const rx0 = Math.min(...run.map(l => l.x0)), rx1 = Math.max(...run.map(l => l.x1));
        const wide = l => l.segs.length < 2 && (l.x1 - l.x0) > (rx1 - rx0) * 0.55;
        run.forEach((l, i) => { if (wide(l) && cur.length && wide(cur[cur.length - 1])) { const keep = cur.pop(); close(); cur.push(keep); } cur.push(l); });
        close(); run = [];
      };
      lines.forEach((l, i) => {
        const prev = run[run.length - 1];
        if (prev && l.top - prev.bottom > Math.max(prev.size, l.size) * 1.9) flush();
        run.push(l);
      });
      flush();
    }
    const inBlock = new Map();
    blocks.forEach((b, bi) => b.forEach(l => inBlock.set(l, bi)));
    const items = [
      ...lines.filter(l => !inBlock.has(l)).map(l => ({ y: l.top, kind: 'line', l })),
      ...blocks.map((b, bi) => ({ y: b[0].top, kind: 'block', b, bi })),
      ...(layout.tables || []).map(t => ({ y: t.y0, kind: 'table', t })),
    ].sort((p, q) => p.y - q.y);
    const rows = [], merges = [], shapes = [];
    let lastBottom = null, nTables = 0;
    const gapRow = (top, size) => { if (lastBottom != null && rows.length && top - lastBottom > (size || 10) * 1.6 && rows[rows.length - 1].length) rows.push([]); };
    for (const it of items) {
      if (it.kind === 'line') {
        if (content === 'tables') continue;
        const l = it.l;
        gapRow(l.top, l.size);
        rows.push(l.segs.length >= 2 && l.segs.some(s => s.num) ? l.segs.map(s => val(s.t, s.b)) : [val(joinWords(l.segs.flatMap(s => s.words)), l.words.every(w => w.b))]);
        lastBottom = l.bottom;
        continue;
      }
      if (it.kind === 'block') {
        const b = it.b;
        if (content === 'tables' && rows.length) rows.push([]); else gapRow(b[0].top, b[0].size);
        const cols = columnsOf(b);
        const pitches = b.slice(1).map((l, i) => l.base - b[i].base);
        const mp = median(pitches) || (b[0].size * 1.2);
        const out = [];
        let firstData = -1;
        b.forEach((l, i) => {
          const cells = new Array(cols.length).fill(null);
          // intestazione su più colonne scritta come un pezzo solo: si divide parola per parola tra le colonne
          const segsL = l.segs.length < 2 || l.segs.some(s => s.num) ? l.segs : l.segs.flatMap(s => {
            if (s.words.length < 2) return [s];
            const ks = s.words.map(w => assign(cols, w));
            if (new Set(ks).size < 2 || ks.some((k, j) => j && k < ks[j - 1])) return [s];
            const parts = [];
            s.words.forEach((w, j) => { const last = parts[parts.length - 1]; if (last && last.k === ks[j]) { last.words.push(w); last.x1 = w.x1; } else parts.push({ k: ks[j], words: [w], x0: w.x0, x1: w.x1 }); });
            return parts.map(q => ({ ...q, t: joinWords(q.words), num: false, b: q.words.every(w => w.b) }));
          });
          for (const s of segsL) { const c = assign(cols, s); cells[c] = cells[c] ? { ...cells[c], t: cells[c].t + ' ' + s.t, words: [...cells[c].words, ...s.words] } : { t: s.t, words: s.words, num: s.num }; }
          const prev = out[out.length - 1];
          // riga che continua la precedente (descrizione andata a capo)
          if (merge && prev && i > 0) {
            const filled = cells.map((c, k) => c ? k : -1).filter(k => k >= 0);
            const noNum = filled.every(k => !isNumLike(cells[k].t) && !isDateLike(cells[k].t));
            const sameCols = filled.every(k => prev.cells[k] && !isNumLike(prev.cells[k].t) && !isDateLike(prev.cells[k].t));
            const tight = l.base - b[i - 1].base < mp * 0.86;
            const noLead = filled[0] > 0 && prev.cells[0];
            const prevHasData = prev.cells.some(c => c && (isNumLike(c.t) || isDateLike(c.t)));
            if (filled.length && noNum && sameCols && (tight || (noLead && prevHasData))) {
              filled.forEach(k => { prev.cells[k] = { ...prev.cells[k], t: prev.cells[k].t + ' ' + cells[k].t, words: [...prev.cells[k].words, ...cells[k].words] }; });
              prev.bottom = l.bottom;
              return;
            }
          }
          if (firstData < 0 && cells.some(c => c && (isNumLike(c.t) || isDateLike(c.t)))) firstData = out.length;
          out.push({ cells, l, bottom: l.bottom });
        });
        const r0 = rows.length;
        out.forEach((r, ri) => {
          const header = firstData > 0 && ri < firstData;
          rows.push(r.cells.map(c => c ? val(c.t, header || c.words.every(w => w.b)) : null));
        });
        codeColumns(rows, r0, rows.length);
        shapes.push({ kind: 'block', x0: Math.min(...cols.map(c => c.x0)), x1: Math.max(...cols.map(c => c.x1)), y0: b[0].top, y1: b[b.length - 1].bottom, cols: cols.slice(1).map((c, i) => (cols[i].x1 + c.x0) / 2) });
        nTables++;
        lastBottom = b[b.length - 1].bottom;
        continue;
      }
      // tabella con la griglia disegnata
      const t = it.t;
      if (content === 'tables' && rows.length) rows.push([]); else gapRow(t.y0, 10);
      // righe della griglia che contengono più righe di testo allineate in più colonne (elenco senza linee orizzontali): si dividono
      const bands = [];
      for (let r = 0; r < t.R; r++) {
        const cs = t.cells.filter(c => c.r0 === r && c.r1 === r + 1);
        const bases = [];
        for (const c of cs) for (const rr of c.rows || []) bases.push({ base: rr.base, c, size: median(rr.words.map(w => w.size || 10)) || 10 });
        bases.sort((p, q) => p.base - q.base);
        const cl = [];
        for (const x of bases) { const k = cl.find(q => Math.abs(q.base - x.base) < x.size * 0.5); if (k) k.n.add(x.c); else cl.push({ base: x.base, n: new Set([x.c]) }); }
        const multiCols = cs.filter(c => (c.rows || []).length >= 2).length;
        bands.push(cl.length >= 2 && multiCols >= 2 && cl.filter(q => q.n.size >= 2).length >= 2 ? cl.map(q => q.base) : null);
      }
      const rowStart = []; let acc = 0;
      for (let r = 0; r < t.R; r++) { rowStart.push(acc); acc += bands[r] ? bands[r].length : 1; }
      const base0 = rows.length;
      const grid = Array.from({ length: acc }, () => new Array(t.C).fill(null));
      for (const c of t.cells) {
        const txtRows = (c.rows || []).map(r => ({ base: r.base, t: joinWords(r.words), b: r.words.every(w => w.b) }));
        if (c.r1 - c.r0 === 1 && bands[c.r0]) {
          const bs = bands[c.r0];
          for (const tr of txtRows) {
            let k = 0, bd = Infinity; bs.forEach((b, i) => { const d = Math.abs(b - tr.base); if (d < bd) { bd = d; k = i; } });
            const gr = rowStart[c.r0] + k;
            const prev = grid[gr][c.c0];
            grid[gr][c.c0] = prev ? { t: prev.t + ' ' + tr.t, b: prev.b && tr.b } : { t: tr.t, b: tr.b };
          }
          continue;
        }
        const r0 = rowStart[c.r0], r1 = (c.r1 < t.R ? rowStart[c.r1] : acc) - 1;
        grid[r0][c.c0] = { t: txtRows.map(r => r.t).join(' '), b: txtRows.length > 0 && txtRows.every(r => r.b) };
        if (r1 > r0 || c.c1 - c.c0 > 1) merges.push([base0 + r0, c.c0, base0 + r1, c.c1 - 1]);
      }
      grid.forEach(r => rows.push(r.map(c => c && c.t ? val(c.t, c.b) : null)));
      codeColumns(rows, base0, rows.length);
      shapes.push({ kind: 'table', x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, cols: t.xs.slice(1, -1) });
      nTables++;
      lastBottom = t.y1;
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    return { rows, merges, shapes, nTables };
  }
  /* ---------- foglio che riproduce la tabella come nel PDF: larghezze delle colonne, altezze delle righe,
     bordi, celle unite, allineamenti e dimensione del testo ---------- */
  const PT2CH = pt => Math.max(0.4, (pt * 96 / 72 - 5) / 7); // larghezza colonna di Excel (caratteri «0» di Calibri 11)
  function cellLines(c) {
    if (c.lines) return c.lines;
    return (c.rows || []).map(r => {
      const size = median(r.words.map(w => w.size || 10)) || 10;
      return { text: r.words.reduce((t, w, i) => t + (i && !w.glue ? ' ' : '') + w.t, ''), size, base: r.base,
        words: r.words.map(w => ({ ...w, y0: r.base - (w.size || size) * 0.78, y1: r.base + (w.size || size) * 0.22 })) };
    });
  }
  /* celle «unite» solo perché nella scansione manca un pezzo di linea: se il testo dentro sta in colonne (o righe)
     distinte della griglia, la cella si divide di nuovo, così ogni dato torna nella sua cella */
  function regroup(words) {
    const ws = [...words].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const lines = [];
    for (const w of ws) {
      const l = lines.find(l => Math.min(l.y1, w.y1) - Math.max(l.y0, w.y0) > Math.min(l.y1 - l.y0, w.y1 - w.y0) * 0.5);
      if (l) { l.words.push(w); l.y0 = Math.min(l.y0, w.y0); l.y1 = Math.max(l.y1, w.y1); } else lines.push({ y0: w.y0, y1: w.y1, words: [w] });
    }
    return lines.sort((a, b) => a.y0 - b.y0).map(l => { l.words.sort((a, b) => a.x0 - b.x0); return { text: l.words.map(w => w.t).join(' '), size: median(l.words.map(w => w.size || 9)), words: l.words }; });
  }
  function splitMerged(t) {
    const out = [];
    for (const c of t.cells) {
      // cella unita davvero (dove la griglia è interrotta non c'è nemmeno un pezzo di linea): il testo resta insieme
      if (c.cut != null && c.cut < 0.15) { out.push(c); continue; }
      const ls = cellLines(c);
      const words = ls.flatMap(l => l.words.map(w => ({ ...w, size: w.size || l.size })));
      let parts = [c];
      if (words.length && c.c1 - c.c0 > 1) {
        const xs = t.xs.slice(c.c0, c.c1 + 1);
        const colOfW = w => { const cx = (w.x0 + w.x1) / 2; for (let k = 0; k < xs.length - 1; k++) if (cx >= xs[k] && cx < xs[k + 1]) return k; return -1; };
        const crosses = words.some(w => xs.slice(1, -1).some(x => w.x0 < x - 2 && w.x1 > x + 2));
        const used = new Set(words.map(colOfW));
        if (!crosses && used.size >= 2 && !used.has(-1)) {
          parts = xs.slice(0, -1).map((x, k) => {
            const ws = words.filter(w => colOfW(w) === k);
            return { ...c, c0: c.c0 + k, c1: c.c0 + k + 1, x0: xs[k], x1: xs[k + 1], bl: true, br: true, lines: regroup(ws), rows: undefined };
          });
        }
      }
      for (const q of parts) {
        const ws = cellLines(q).flatMap(l => l.words.map(w => ({ ...w, size: w.size || l.size })));
        if (ws.length && q.r1 - q.r0 > 1) {
          const ys = t.ys.slice(q.r0, q.r1 + 1);
          const rowOfW = w => { const cy = (w.y0 + w.y1) / 2; for (let k = 0; k < ys.length - 1; k++) if (cy >= ys[k] && cy < ys[k + 1]) return k; return -1; };
          const crosses = ws.some(w => ys.slice(1, -1).some(y => w.y0 < y - 2 && w.y1 > y + 2));
          const used = new Set(ws.map(rowOfW));
          if (!crosses && used.size >= 2 && !used.has(-1)) {
            ys.slice(0, -1).forEach((y, k) => out.push({ ...q, r0: q.r0 + k, r1: q.r0 + k + 1, y0: ys[k], y1: ys[k + 1], bt: true, bb: true, lines: regroup(ws.filter(w => rowOfW(w) === k)), rows: undefined }));
            continue;
          }
        }
        out.push(q);
      }
    }
    return { ...t, cells: out };
  }
  // dimensione del carattere dalla larghezza della riga (metriche di Helvetica/Arial): in Excel il testo occupa la stessa larghezza che nel PDF
  let _hv = null, _hb = null;
  function sizeFromWidth(text, widthPt, bold) {
    try {
      if (!_hv) { _hv = PDFLib.StandardFontEmbedder.for(PDFLib.StandardFonts.Helvetica); _hb = PDFLib.StandardFontEmbedder.for(PDFLib.StandardFonts.HelveticaBold); }
      const t = String(text).replace(/[^\x20-\x7e\xa0-\xff]/g, 'n');
      if (t.replace(/\s/g, '').length < 4) return null;
      const a = _hv.widthOfTextAtSize(t, 1), b = _hb.widthOfTextAtSize(t, 1);
      const adv = bold === true ? b : bold === false ? a : (a + b) / 2;
      return adv > 0 ? widthPt / adv : null;
    } catch { return null; }
  }
  function geoSheet(L, { loc = 'it', types = true, oneLine = false } = {}) {
    const tables = (L.tables || []).filter(t => t.cells && t.cells.length).map(splitMerged);
    if (!tables.length) return null;
    const val = (s, extra) => { const p = types ? parseValue(s, loc) : { t: 's', v: String(s).trim() }; return Object.assign(p, extra); };
    // confini delle colonne: quelli di tutte le tabelle della pagina (più l'inizio del testo libero, se sta più a sinistra)
    const free = (L.lines || []).filter(l => l.words && l.words.length);
    let X = tables.flatMap(t => t.xs);
    const minFree = free.length ? Math.min(...free.map(l => l.x0)) : Infinity;
    if (minFree < Math.min(...X) - 4) X.push(minFree - 1);
    X.sort((a, b) => a - b);
    const XS = [];
    for (const x of X) { const l = XS[XS.length - 1]; if (l && x - l.max <= 2.5) { l.max = x; l.sum += x; l.n++; } else XS.push({ max: x, sum: x, n: 1 }); }
    X = XS.map(c => c.sum / c.n);
    const near = x => { let k = 0, d = Infinity; X.forEach((v, i) => { if (Math.abs(v - x) < d) { d = Math.abs(v - x); k = i; } }); return k; };
    const startCol = x => { let k = 0; X.forEach((v, i) => { if (v <= x + 1.5) k = i; }); return Math.min(k, Math.max(0, X.length - 2)); };
    // elementi dall'alto in basso: tabelle e fasce di testo libero
    const bands = [];
    for (const l of [...free].sort((a, b) => a.top - b.top)) {
      const b = bands[bands.length - 1];
      if (b && l.top < b.y1 - Math.min(b.h, l.bottom - l.top) * 0.4) { b.lines.push(l); b.y1 = Math.max(b.y1, l.bottom); }
      else bands.push({ y0: l.top, y1: l.bottom, h: l.bottom - l.top, lines: [l] });
    }
    const items = [...tables.map(t => ({ y0: t.ys[0], y1: t.ys[t.ys.length - 1], t })), ...bands.map(b => ({ y0: b.y0, y1: b.y1, b }))].sort((a, b) => a.y0 - b.y0);
    const rows = [], heights = [], merges = [];
    const ensure = (r, c) => { while (rows.length <= r) { rows.push([]); heights.push(null); } return rows[r]; };
    let cur = null, nTables = 0;
    const shapes = [];
    for (const it of items) {
      if (cur != null && it.y0 - cur > 2) { ensure(rows.length); heights[rows.length - 1] = Math.min(409, it.y0 - cur); }
      if (it.t) {
        const t = it.t, base = rows.length;
        for (let i = 0; i < t.ys.length - 1; i++) { ensure(base + i); heights[base + i] = t.ys[i + 1] - t.ys[i]; }
        const thick = (t.border || 6) >= 12 ? 'medium' : 'thin';
        { // dimensione tipica del testo della tabella (per uniformare le stime riga per riga)
          const all = t.cells.flatMap(c => cellLines(c).filter(l => l.text && l.words?.length).map(l => { const a = Math.min(...l.words.map(q => q.x0)), z = Math.max(...l.words.map(q => q.x1)); return sizeFromWidth(l.text, z - a, null) || l.size; })).filter(Boolean);
          t._med = all.length >= 4 ? median(all) : null;
        }
        for (const c of t.cells) {
          const R0 = base + c.r0, R1 = base + c.r1 - 1, C0 = near(c.x0), C1 = Math.max(near(c.x0), near(c.x1) - 1);
          const ls = cellLines(c).filter(l => l.text && l.text.trim());
          const border = { t: c.bt !== false ? thick : null, b: c.bb !== false ? thick : null, l: c.bl !== false ? thick : null, r: c.br !== false ? thick : null };
          let cell = { t: 's', v: '', border, font: 'Arial', size: 9, wrap: true, valign: 'top' };
          if (ls.length) {
            const ws = ls.flatMap(l => l.words);
            const bk = ws.some(q => q.b != null) ? ws.filter(q => q.b).length > ws.length / 2 : null;
            const sizes = ls.map(l => { const a = Math.min(...l.words.map(q => q.x0)), z = Math.max(...l.words.map(q => q.x1)); return sizeFromWidth(l.text, z - a, bk) || l.size || 9; });
            let size = median(sizes) || 9;
            if (t._med) size = clamp(size, t._med * 0.8, t._med * 1.2);
            size = Math.floor(size * 0.97 * 2) / 2;
            const bold = ws.filter(w => w.b).length > ws.length / 2;
            // allineamento orizzontale e verticale del testo dentro la cella
            const w = c.x1 - c.x0, hh = c.y1 - c.y0;
            const gaps = ls.map(l => { const a = Math.min(...l.words.map(q => q.x0)), z = Math.max(...l.words.map(q => q.x1)); return [a - c.x0, c.x1 - z]; });
            let align = 'left';
            if (gaps.every(([a, z]) => Math.abs(a - z) < Math.max(3, w * 0.12)) && gaps.some(([a]) => a > Math.max(4, w * 0.08))) align = 'center';
            else if (gaps.every(([a, z]) => z < a && z < Math.max(6, w * 0.15))) align = 'right';
            const iy0 = Math.min(...ws.map(q => q.y0)), iy1 = Math.max(...ws.map(q => q.y1));
            const tg = iy0 - c.y0, bg = c.y1 - iy1;
            const valign = Math.abs(tg - bg) < Math.max(3, hh * 0.15) ? 'center' : bg < tg ? 'bottom' : 'top';
            const text = oneLine || ls.length === 1 ? ls.map(l => l.text).join(' ') : ls.map(l => l.text).join('\n');
            cell = ls.length === 1 || oneLine ? val(text, {}) : { t: 's', v: text };
            Object.assign(cell, { border, font: 'Arial', size: clamp(size, 5, 36), bold, align, valign, wrap: true });
          }
          ensure(R1); rows[R0][C0] = cell; // il valore di una cella unita sta nella prima riga dell'area unita
          if (R1 > R0 || C1 > C0) merges.push([R0, C0, R1, C1]);
        }
        shapes.push({ kind: 'table', x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, cols: t.xs.slice(1, -1) });
        nTables++;
      } else {
        const r = rows.length; ensure(r);
        const b = it.b;
        heights[r] = Math.max(b.y1 - b.y0, 6) * 1.12;
        for (const l of b.lines) {
          const size = Math.round((l.size || median(l.words.map(w => w.size || 10)) || 10) * 2) / 2;
          // pezzi della riga separati da spazi larghi (es. «TOTALE» e l'importo): ognuno nella colonna dove sta sulla pagina
          for (const sg of segments({ ...l, size })) {
            let C = startCol(sg.x0);
            // testo allineato a destra di una colonna (come «TOTALE» accanto all'importo): va nella colonna dove finisce
            const Cend = Math.max(0, X.findIndex(x => x >= sg.x1 - 1.5) - 1);
            const rightAligned = Cend >= 0 && Cend > C && Math.abs(X[Cend + 1] - sg.x1) < 6;
            if (rightAligned) C = Cend;
            const v = val(sg.t, { font: 'Arial', size: clamp(size, 5, 36), bold: sg.words.every(w => w.b), valign: 'bottom', ...(rightAligned ? { align: 'right' } : {}) });
            if (rows[r][C] && rows[r][C].v !== '') rows[r][C] = val(String(rows[r][C].shown || rows[r][C].v) + ' ' + sg.t, { font: 'Arial', size: clamp(size, 5, 36), valign: 'bottom' });
            else rows[r][C] = v;
          }
        }
      }
      cur = Math.max(cur ?? it.y1, it.y1);
    }
    const widths = X.slice(1).map((x, i) => PT2CH(x - X[i]));
    return { rows, merges, heights, widths, shapes, nTables, geo: true, landscape: (L.w || 0) > (L.h || 0), colsPt: X };
  }
  /* più pagine con la stessa tabella in un solo foglio: colonne allineate, intestazione ripetuta una volta */
  function concatGeo(gs) {
    const ref = gs[0];
    const same = gs.every(g => g.widths.length === ref.widths.length && g.widths.every((w, i) => Math.abs(w - ref.widths[i]) <= Math.max(1, ref.widths[i] * 0.06)));
    if (!same) return null;
    const rows = [], heights = [], merges = [], seen = new Set();
    gs.forEach((g, gi) => {
      const skip = new Set();
      g.rows.forEach((r, i) => {
        const filled = r.filter(c => c && c.v !== '');
        if (filled.length < 2) return;
        const key = r.map(c => c ? String(c.v) : '').join('\u0001');
        const isHead = filled.every(c => c.t === 's') && (filled.some(c => c.bold) || i < 3);
        if (isHead && seen.has(key)) skip.add(i); else if (isHead) seen.add(key);
      });
      const map = []; let k = rows.length;
      g.rows.forEach((r, i) => { map[i] = k; if (!skip.has(i)) { rows.push(r); heights.push(g.heights[i]); k++; } else map[i] = -1; });
      for (const [r0, c0, r1, c1] of g.merges) if (map[r0] >= 0 && map[r1] >= 0) merges.push([map[r0], c0, map[r1], c1]);
    });
    return { rows, heights, merges, widths: ref.widths, landscape: ref.landscape, geo: true };
  }
  function texts(layout) {
    return [...(layout.lines || []).flatMap(l => l.words.map(w => w.t)), ...(layout.tables || []).flatMap(t => t.cells.flatMap(c => (c.rows || []).flatMap(r => r.words.map(w => w.t))))];
  }
  /* più pagine in un solo foglio: righe una sotto l'altra; le intestazioni di tabella ripetute a ogni pagina si tolgono */
  function concat(grids) {
    const rows = [], merges = [], seenHead = new Set();
    grids.forEach((g, gi) => {
      if (gi && rows.length) rows.push([]);
      const off = rows.length;
      const skip = new Set();
      g.rows.forEach((r, i) => {
        const key = r.map(c => c ? String(c.v) : '').join('\u0001');
        const isHead = r.filter(Boolean).length >= 2 && r.every(c => !c || (c.bold && c.t === 's'));
        if (isHead) { if (seenHead.has(key)) skip.add(i); else seenHead.add(key); }
      });
      const map = []; let k = 0;
      g.rows.forEach((r, i) => { map[i] = off + k; if (!skip.has(i)) { rows.push(r); k++; } });
      for (const [r0, c0, r1, c1] of g.merges) if (!skip.has(r0)) merges.push([map[r0], c0, map[r1], c1]);
    });
    return { rows, merges };
  }
  return { parseValue, detectLocale, segments, pageGrid, geoSheet, concatGeo, texts, concat, isNumLike, splitMerged };
})();
if (typeof module !== 'undefined') module.exports = ExcelKit;

/* ----------------------------- interfaccia ------------------------------ */
// motore: legge le pagine (testo o OCR) e prepara i fogli; usato sia per un file sia per tanti
function excelEngine(doc, { getWorker, status = () => {}, parallel = 1 }) {
  const N = doc.numPages;
  const layouts = new Map(), kinds = new Array(N).fill(null);
  const isScan = async p => {
    if (kinds[p - 1]) return kinds[p - 1] === 'scan';
    // le scansioni con testo aggiunto dopo si leggono con l'OCR (legge anche il testo aggiunto)
    const has = await pageHasText(doc.pdfjs, p) && !(await pageMixed(doc, p));
    kinds[p - 1] = has ? 'text' : 'scan';
    return !has;
  };
  // una pagina si legge una volta sola, anche se la chiedono insieme l'anteprima, la lettura anticipata e la conversione
  const inflight = new Map();
  function layoutOf(p, opts = {}) {
    if (layouts.has(p)) return Promise.resolve(layouts.get(p));
    if (inflight.has(p)) return inflight.get(p).then(L => L || (opts.ocr === false ? null : layoutOf(p, opts)));
    const pr = layoutOfRaw(p, opts);
    if (opts.ocr === false) return pr;
    inflight.set(p, pr); pr.finally(() => inflight.delete(p)).catch(() => {});
    return pr;
  }
  async function layoutOfRaw(p, { ocr = true, slot = 0 } = {}) {
    if (layouts.has(p)) return layouts.get(p);
    let L;
    if (await isScan(p)) {
      if (!ocr) return null;
      const w = await getWorker(slot);
      const { data, prep, r } = await ocrRecognizePage(w, doc.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']), onPhase: () => {} });
      // la pagina preparata in RGBA (grigio: R = G = B), senza passare da un canvas
      const rgba = new Uint8ClampedArray(prep.img.w * prep.img.h * 4);
      for (let i = 0, j = 0; j < prep.img.g.length; i += 4, j++) { const v = prep.img.g[j]; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; }
      const lay = DocxOut.fromOcr(data, prep.img, r.scale, rgba, { images: false });
      // tabelle con la griglia: ogni cella si rilegge da sola, così il suo testo resta unito e preciso
      const sc = r.scale, pt = v => v / sc;
      const rk = await SharedRead.key(doc.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) }).catch(() => null);
      const T = await SharedRead.memo(rk, 'cells', () => ocrTableCells(w, prep, sc, { pageWords: data.words || [], onCell: (k, n) => status(`Pagina ${p} — lettura delle celle della tabella (${k + 1} di ${n})`) }));
      const lsize = l => { const lt = l.text, hh = (l.bbox.y1 - l.bbox.y0) / sc; const desc = /[gjpqyQ,;()]/.test(lt), asc = /[A-Z0-9bdfhklt'"()]/.test(lt); return clamp(hh / (desc ? (asc ? 0.93 : 0.73) : (asc ? 0.72 : 0.52)), 4, 40); };
      // tabella storta nella scansione: le posizioni del testo si riportano nel rettangolo di riferimento delle celle
      const straight = (t, b) => { const k = t.skew; if (!k) return b; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, dx = -k.v * (cy - k.cy), dy = -k.h * (cx - k.cx); return { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy }; };
      const box = (t, b) => { const q = straight(t, b); return { x0: pt(q.x0), x1: pt(q.x1), y0: pt(q.y0), y1: pt(q.y1) }; };
      const tables = T.map(t => ({ xs: t.xs.map(pt), ys: t.ys.map(pt), x0: pt(t.x0), x1: pt(t.x1), y0: pt(t.y0), y1: pt(t.y1), R: t.R, C: t.C, border: t.border,
        cells: t.cells.map(c => ({ r0: c.r0, r1: c.r1, c0: c.c0, c1: c.c1, x0: pt(c.x0), x1: pt(c.x1), y0: pt(c.y0), y1: pt(c.y1), bt: c.bt, bb: c.bb, bl: c.bl, br: c.br, cut: c.cut,
          marks: c.marks && c.marks.map(m => box(t, m)),
          lines: (c.lines || []).map(l => { const size = l.mark ? null : lsize(l); return { text: l.text, size, words: l.words.map(w => ({ t: w.t, ...box(t, w), size, mark: w.mark })) }; }) })) }));
      // testo fuori dalle tabelle: dalla lettura della pagina intera
      const inTab = l => tables.some(t => (l.x0 + l.x1) / 2 > t.x0 && (l.x0 + l.x1) / 2 < t.x1 && (l.top + l.bottom) / 2 > t.y0 && (l.top + l.bottom) / 2 < t.y1);
      L = { lines: lay.lines.filter(l => !inTab(l)), tables: tables.length ? tables : lay.tables, scale: sc, ocr: true, w: prep.img.w / sc, h: prep.img.h / sc };
      if (r.canvas) r.canvas.width = r.canvas.height = 0; prep.release?.();
    } else {
      const lay = await DocxOut.fromPdfPage(doc.pdfjs, p, { images: false });
      L = { lines: lay.lines, tables: lay.tables, w: lay.w, h: lay.h };
    }
    layouts.set(p, L);
    return L;
  }
  const optsOf = (st, locale) => ({ loc: locale || 'it', merge: st.merge, content: st.content, types: st.types, oneLine: st.oneLine });
  // tabella con la griglia: foglio che la riproduce (misure, bordi, celle unite); altrimenti colonne dall'allineamento del testo
  const gridOf = (L, st, locale) => (st.geo && ExcelKit.geoSheet(L, optsOf(st, locale))) || ExcelKit.pageGrid(L, optsOf(st, locale));
  // il file Excel delle pagine scelte
  async function build(pages, st, progress = () => {}) {
    // le pagine scansionate si leggono in parallelo (un motore OCR per gruppo), le altre sono immediate
    let next = 0, done = 0;
    const slot = async k => {
      for (;;) {
        Busy.check();
        const i = next++; if (i >= pages.length) return;
        const p = pages[i];
        progress(done / pages.length, `Pagina ${p} di ${N}${(await isScan(p)) && !layouts.has(p) ? ' — riconoscimento del testo (OCR)' : ''}`);
        await layoutOf(p, { slot: k });
        done++;
        await tick();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, pages.length)) }, (_, k) => slot(k)));
    const locale = ExcelKit.detectLocale(pages.flatMap(p => ExcelKit.texts(layouts.get(p))));
    const grids = pages.map(p => ({ p, g: gridOf(layouts.get(p), st, locale) }));
    const nTables = grids.reduce((n, x) => n + x.g.nTables, 0);
    const brandRows = rows => rows.map(r => r.map(c => c ? { font: 'Instrument Sans', ...c } : c));
    const sheetOf = (name, g) => g.geo ? { name, rows: g.rows, merges: g.merges, widths: g.widths, heights: g.heights, landscape: g.landscape, fit: true, margins: 0.3, paper: 9, tabColor: Brand.C.ink2 } : { name, rows: brandRows(g.rows), merges: g.merges, tabColor: Brand.C.ink2 };
    let sheets;
    if (st.sheets === 'one' && pages.length > 1) {
      const allGeo = grids.every(x => x.g.geo);
      const cg = allGeo ? ExcelKit.concatGeo(grids.map(x => x.g)) : null;
      sheets = cg ? [sheetOf(doc.base.slice(0, 31) || 'Foglio 1', cg)]
        : allGeo ? grids.map(x => sheetOf(`Pagina ${x.p}`, x.g)) // tabelle diverse tra le pagine: un foglio ciascuna, per non deformarle
        : [(c => ({ name: doc.base.slice(0, 31) || 'Foglio 1', ...c, rows: brandRows(c.rows), tabColor: Brand.C.ink2 }))(ExcelKit.concat(grids.map(x => x.g)))];
    } else sheets = grids.map(x => sheetOf(pages.length === 1 ? (doc.base.slice(0, 31) || 'Foglio 1') : `Pagina ${x.p}`, x.g));
    // tutte le tabelle del documento in un foglio solo, in testa: una tabella che continua su più pagine diventa una tabella
    // (intestazione una volta sola, niente righe vuote in mezzo); i fogli pagina per pagina restano dopo, con tutto il resto
    if (st.content === 'all' && nTables && pages.length > 1) {
      try {
        const tg = pages.map(p => gridOf(layouts.get(p), { ...st, content: 'tables', geo: false }, locale)).filter(g => g.nTables && g.rows.some(r => r.some(Boolean)));
        if (tg.length) {
          // solo righe di tabella: almeno due celle, nessuna frase lunga (quella è testo), in sequenze di almeno due righe
          const prose = c => c && c.t === 's' && (String(c.v).length > 40 || String(c.v).trim().split(/\s+/).length >= 6);
          const rowOk = r => r.filter(Boolean).length >= 2 && !r.some(prose);
          const onlyTables = rows => { const out = []; let run = []; const flush = () => { if (run.length >= 2) out.push(...run); run = []; }; for (const r of rows) { if (rowOk(r)) run.push(r); else flush(); } flush(); return out; };
          const c = ExcelKit.concat(tg.map(g => ({ ...g, geo: false, merges: [], rows: onlyTables(g.rows.filter(r => r.some(Boolean))) })).filter(g => g.rows.length));
          const filled = r => (r || []).filter(Boolean).length;
          for (let i = c.rows.length - 2; i > 0; i--) if (!filled(c.rows[i]) && filled(c.rows[i - 1]) && filled(c.rows[i - 1]) === filled(c.rows[i + 1])) {
            c.rows.splice(i, 1); c.merges = (c.merges || []).map(m => m[0] > i ? [m[0] - 1, m[1], m[2] - 1, m[3]] : m);
          }
          sheets = [sheetOf('Tabelle', { ...c, geo: false }), ...sheets];
        }
      } catch (e) { console.warn('foglio delle tabelle', e); }
    }
    // bilancio: primo foglio con voce | esercizio | esercizio precedente
    let bil = null;
    if (st.bilancio) { try { bil = BilancioKit.fromLayouts(pages.map(p => layouts.get(p)), { loc: locale }); } catch (e) { console.warn('bilancio', e); } }
    if (bil) sheets = [BilancioKit.sheet(bil), ...sheets];
    progress(1, 'Creazione del file Excel…');
    const bytes = await XlsxOut.build(sheets, { title: doc.base });
    const ocrN = pages.filter(p => layouts.get(p)?.ocr).length;
    return { bytes, sheets, nTables, bil, locale, ocrN };
  }
  return { N, layouts, kinds, isScan, layoutOf, gridOf, build };
}
const excelInfo = r => `${plural(r.sheets.length, 'foglio', 'fogli')} · ${r.nTables ? plural(r.nTables, 'tabella', 'tabelle') : 'nessuna tabella riconosciuta'}${r.bil ? ' · bilancio riconosciuto' : ''}${r.ocrN ? ` · ${plural(r.ocrN, 'pagina letta', 'pagine lette')} con l’OCR` : ''}`;

async function startExcel(stage, files) {
  if (files.length > 1) return startExcelMany(stage, files);
  let file = files[0];
  if (isImage(file)) file = await withBusy('Preparazione dell’immagine…', () => imagesToPdfFile([file], stripExt(file.name) + '.pdf'));
  const doc = await withBusy('Apertura del documento…', () => openPdf(file));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const st = { sheets: 'page', content: 'all', merge: true, types: true, geo: true, oneLine: false, bilancio: true, range: 'all', rangeText: `1-${N}` };
  let locale = null;
  // un motore OCR per gruppo di pagine (creati solo se servono, chiusi uscendo)
  const workers = [];
  onLeave(() => { workers.forEach(w => w.then(x => x.terminate()).catch(() => {})); });
  const ocrWorker = (k = 0) => {
    if (!workers[k]) {
      workers[k] = makeOcrWorker(new Set(['ita']), 300).then(w => { w._box.log = m => { if (OCR_STATUS[m.status]) Busy.set(null, OCR_STATUS[m.status]); }; return w; });
      workers[k].catch(() => { workers[k] = null; });
    }
    return workers[k];
  };
  const eng = excelEngine(doc, { getWorker: ocrWorker, status: t => Busy.set(null, t), parallel: batchSlots(N) });
  const { layouts, kinds, isScan, layoutOf } = eng;
  const gridOf = L => eng.gridOf(L, st, locale);

  // anteprima: la pagina a sinistra (con le tabelle trovate evidenziate), il foglio a destra
  const prev = h('div', { class: 'xl-sheet', tabindex: '0', role: 'region', 'aria-label': 'Anteprima del foglio (si scorre con le frecce)' });
  const prevHead = h('div', { class: 'xl-head' });
  let shown = 0, curGrid = null;
  const viewer = new Viewer(doc, {
    fit: 'width',
    onOverlay: (i, ov, k) => {
      ov.replaceChildren();
      if (!curGrid || shown !== i + 1) return;
      // le coordinate delle forme sono in punti dall'alto della pagina
      for (const s of curGrid.shapes) {
        ov.append(h('div', { class: 'xl-shape', style: { left: s.x0 * k - 3 + 'px', top: s.y0 * k - 3 + 'px', width: (s.x1 - s.x0) * k + 6 + 'px', height: (s.y1 - s.y0) * k + 6 + 'px' } },
          ...s.cols.map(x => h('div', { class: 'xl-colline', style: { left: (x - s.x0) * k + 3 + 'px' } }))));
      }
    },
    onChange: p => showPreview(p),
  });
  onLeave(() => viewer.destroy());
  const fmtCell = c => {
    if (!c) return '';
    if (c.t === 'd') { const d = new Date(Date.UTC(1899, 11, 30) + c.v * 86400000); return d.toISOString().slice(0, 10).split('-').reverse().join('/'); }
    if (c.t === 'n') {
      const pct = /%/.test(c.fmt || ''); const dec = ((c.fmt || '').match(/\.(0+)/) || ['', ''])[1].length;
      return (pct ? c.v * 100 : c.v).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: c.fmt ? dec : 10, useGrouping: /#,##0/.test(c.fmt || '') }) + (pct ? '%' : '');
    }
    return String(c.v);
  };
  function renderSheet(g) {
    const nC = Math.max(1, g.widths ? g.widths.length : 0, ...g.rows.map(r => r.length));
    if (g.geo) return renderGeo(g, nC);
    const covered = new Set(), span = new Map();
    for (const [r0, c0, r1, c1] of g.merges) { span.set(`${r0},${c0}`, [r1 - r0 + 1, c1 - c0 + 1]); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered.add(`${r},${c}`); }
    const MAXR = 400;
    const tb = h('table', { class: 'xl-grid' },
      h('thead', {}, h('tr', {}, h('th', { class: 'xl-rn' }), ...Array.from({ length: nC }, (_, c) => h('th', {}, XlsxOut.colName(c))))),
      h('tbody', {}, ...g.rows.slice(0, MAXR).map((r, ri) => h('tr', {}, h('th', { class: 'xl-rn' }, String(ri + 1)),
        ...Array.from({ length: nC }, (_, c) => {
          if (covered.has(`${ri},${c}`)) return null;
          const filled = r.filter(y => y && y.v !== '').length;
          if (filled <= 1 && c > 0 && !r[c] && r.slice(0, c).some(Boolean)) return null; // il testo scorre a destra, come in Excel
          const x = r[c];
          const sp = span.get(`${ri},${c}`) || (filled === 1 && x?.t === 's' && c === r.findIndex(Boolean) ? [1, nC - c] : null);
          return h('td', { class: [x?.t === 'n' || x?.t === 'd' ? 'num' : '', x?.bold ? 'b' : '', x?.italic ? 'i' : ''].join(' '), ...(sp ? { rowSpan: sp[0], colSpan: sp[1] } : {}), title: x?.f ? '=' + x.f : x?.shown && x.shown !== fmtCell(x) ? 'Nel PDF: ' + x.shown : '',
            style: { paddingLeft: x?.indent ? 6 + x.indent * 12 + 'px' : '', background: x?.fill || '', color: x?.color && x.fill ? x.color : '', borderTop: x?.border?.t ? '1px solid #555' : '', textAlign: x?.align || '' } }, fmtCell(x));
        }).filter(Boolean)))));
    return [tb, g.rows.length > MAXR ? h('div', { class: 'muted small', style: { padding: '8px' } }, `Anteprima limitata alle prime ${MAXR} righe: nel file ci sono tutte (${g.rows.length}).`) : null];
  }
  // anteprima fedele: larghezze, altezze, bordi, allineamenti e dimensione del testo come nel file Excel
  function renderGeo(g, nC) {
    const covered = new Set(), span = new Map();
    for (const [r0, c0, r1, c1] of g.merges) { span.set(`${r0},${c0}`, [r1 - r0 + 1, c1 - c0 + 1]); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered.add(`${r},${c}`); }
    const px = w => Math.round(w * 7 + 5), ptpx = v => v * 96 / 72;
    const k = 1;
    const bd = s => s === 'medium' ? '2px solid #111' : s ? '1px solid #222' : '1px solid transparent';
    const MAXR = 400;
    const tb = h('table', { class: 'xl-grid geo' },
      h('colgroup', {}, h('col', { style: { width: '34px' } }), ...g.widths.map(w => h('col', { style: { width: px(w) * k + 'px' } }))),
      h('thead', {}, h('tr', {}, h('th', { class: 'xl-rn' }), ...Array.from({ length: nC }, (_, c) => h('th', {}, XlsxOut.colName(c))))),
      h('tbody', {}, ...g.rows.slice(0, MAXR).map((r, ri) => h('tr', { style: { height: ptpx(g.heights[ri] || 15) * k + 'px' } }, h('th', { class: 'xl-rn' }, String(ri + 1)),
        ...Array.from({ length: nC }, (_, c) => {
          if (covered.has(`${ri},${c}`)) return null;
          const x = r[c], sp = span.get(`${ri},${c}`);
          const b = x?.border || {};
          const freeText = x && !x.border && x.t === 's';
          return h('td', { class: (x?.bold ? 'b ' : '') + (freeText ? 'ov' : ''), ...(sp ? { rowSpan: sp[0], colSpan: sp[1] } : {}), title: x?.shown && x.shown !== fmtCell(x) ? 'Nel PDF: ' + x.shown : '',
            style: { borderTop: bd(b.t), borderBottom: bd(b.b), borderLeft: bd(b.l), borderRight: bd(b.r), textAlign: x?.align || (x?.t === 'n' || x?.t === 'd' ? 'right' : 'left'), verticalAlign: x?.valign === 'center' ? 'middle' : x?.valign || 'top',
              fontSize: ptpx(x?.size || 11) * k + 'px', fontFamily: x?.font === 'Arial' ? 'Arial, Helvetica, sans-serif' : '', whiteSpace: x?.wrap ? 'pre-wrap' : 'pre', maxWidth: freeText ? 'none' : '' } }, fmtCell(x));
        }).filter(Boolean)))));
    return [tb, g.rows.length > MAXR ? h('div', { class: 'muted small', style: { padding: '8px' } }, `Anteprima limitata alle prime ${MAXR} righe.`) : null];
  }
  async function showPreview(p) {
    shown = p;
    let L = layouts.get(p);
    if (!L) {
      if (await isScan(p)) {
        curGrid = null; viewer.refresh();
        prevHead.replaceChildren(h('b', {}, `Pagina ${p}`), h('span', { class: 'muted small' }, ' · scansione'));
        prev.replaceChildren(h('div', { class: 'xl-empty' }, h('p', {}, 'Questa pagina è un’immagine (scansione): il testo verrà riconosciuto con l’OCR durante la conversione.'),
          h('button', { class: 'btn', onclick: async () => { await withBusy(`Riconoscimento della pagina ${p}…`, () => layoutOf(p)); showPreview(p); } }, ic('ocr', 16), 'Riconosci ora questa pagina')));
        return;
      }
      prev.replaceChildren(h('div', { class: 'xl-empty muted' }, 'Analisi della pagina…'));
      L = await layoutOf(p, { ocr: false });
      if (shown !== p) return;
    }
    if (!locale) locale = ExcelKit.detectLocale(ExcelKit.texts(L));
    curGrid = gridOf(L);
    viewer.refresh();
    prevHead.replaceChildren(h('b', {}, `Pagina ${p}`), h('span', { class: 'muted small' }, ` · ${curGrid.nTables ? plural(curGrid.nTables, 'tabella trovata', 'tabelle trovate') : 'nessuna tabella'}${L.ocr ? ' · testo riconosciuto con OCR' : ''}`));
    prev.replaceChildren(...(curGrid.rows.length ? renderSheet(curGrid).filter(Boolean) : [h('div', { class: 'xl-empty muted' }, st.content === 'tables' ? 'In questa pagina non ci sono tabelle.' : 'Pagina senza testo.')]));
  }
  const refreshAll = () => { if (shown) showPreview(shown); };
  // bilancio: foglio con voce | esercizio | esercizio precedente
  let bilModel = null;
  async function bilancioOf(pages, { ocr = true } = {}) {
    const Ls = [];
    for (const p of pages) { const L = ocr ? await layoutOf(p) : await layoutOf(p, { ocr: false }); if (L) Ls.push(L); }
    if (!locale) locale = ExcelKit.detectLocale(Ls.flatMap(L => ExcelKit.texts(L)));
    return BilancioKit.fromLayouts(Ls, { loc: locale || 'it' });
  }
  async function showBilancio() {
    const all = Array.from({ length: N }, (_, i) => i + 1);
    const m = await withBusy('Lettura del bilancio…', async () => { const r = []; for (const p of all) if (!(await isScan(p))) r.push(p); return r.length ? bilancioOf(r, { ocr: false }) : null; });
    bilModel = m;
    shown = 0; curGrid = null; viewer.refresh();
    if (!m) { prevHead.replaceChildren(h('b', {}, 'Foglio «Bilancio»')); prev.replaceChildren(h('div', { class: 'xl-empty' }, h('p', {}, kinds.some(k => k === 'scan') ? 'Le pagine sono scansioni: il foglio «Bilancio» si crea durante la conversione, dopo la lettura con l’OCR.' : 'Non ho trovato i prospetti del bilancio (stato patrimoniale, conto economico) con gli importi in colonna.'))); return; }
    const sh = BilancioKit.sheet(m);
    const nV = m.sections.reduce((n, s) => n + s.rows.filter(r => r.cur != null || r.prev != null).length, 0);
    prevHead.replaceChildren(h('b', {}, 'Foglio «Bilancio»'), h('span', { class: 'muted small' }, ` · ${m.sections.map(s => s.title).join(', ')} · ${plural(nV, 'voce con importi', 'voci con importi')}`));
    prev.replaceChildren(...renderSheet({ rows: sh.rows, merges: [] }).filter(Boolean));
  }
  const bilBox = h('div', { hidden: true },
    h('div', { class: 'hint ok' }, h('b', {}, 'È un bilancio. '), 'Nel file Excel il primo foglio, «Bilancio», ha le voci in una colonna, l’esercizio nella successiva e l’esercizio precedente nell’ultima: importi come numeri, totali in grassetto, variazioni già calcolate.'),
    h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => showBilancio().catch(e => Errors.show(e)) }, ic('table', 15), 'Vedi il foglio «Bilancio»'));
  (async () => {
    try {
      let txt = '';
      for (let p = 1; p <= Math.min(N, 8); p++) { const tc = await (await doc.pdfjs.getPage(p)).getTextContent(); txt += tc.items.map(i => i.str).join(' ') + '\n'; }
      if (BilancioKit.looksLike(txt)) bilBox.hidden = false;
    } catch { }
  })();
  const rangeIn = h('input', { class: 'input', value: st.rangeText, oninput: () => { st.rangeText = rangeIn.value; } });
  const rangeBox = h('div', { style: { display: 'none', marginTop: '8px' } }, rangeIn);
  const main = h('div', { class: 'ws-main xl-split' }, h('div', { class: 'xl-left' }, viewer.el), h('div', { class: 'xl-right' }, prevHead, prev));
  workspace(stage, main, [
    bilBox,
    sec('Fogli di Excel', seg([['page', 'Un foglio per pagina'], ['one', 'Tutto in un foglio']], st.sheets, v => { st.sheets = v; }),
      h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Con «Tutto in un foglio» le pagine vanno una sotto l’altra e le intestazioni di tabella ripetute a ogni pagina compaiono una volta sola: ideale per estratti conto e elenchi lunghi.')),
    sec('Cosa riportare', seg([['all', 'Tutta la pagina'], ['tables', 'Solo le tabelle']], st.content, v => { st.content = v; refreshAll(); })),
    sec('Opzioni',
      checkbox('Importi e date come numeri', st.types, v => { st.types = v; refreshAll(); }, 'Così in Excel puoi sommarli e ordinarli. Il formato (1.234,56 o 1,234.56) è riconosciuto da solo; codici, CAP, partite IVA restano testo.'),
      checkbox('Riproduci le tabelle come nel PDF', st.geo, v => { st.geo = v; refreshAll(); }, 'Per le tabelle con i bordi: stesse colonne, stesse larghezze e altezze, bordi, celle unite, allineamenti e dimensione del testo. Ogni cella del PDF è una cella di Excel.'),
      checkbox('Testo di ogni cella su una riga', st.oneLine, v => { st.oneLine = v; refreshAll(); }, 'Toglie gli a capo dentro le celle (comodo per filtrare e ordinare); altrimenti restano come nel PDF.'),
      checkbox('Bilancio: foglio pronto per i calcoli', st.bilancio, v => { st.bilancio = v; }, 'Se il PDF è un bilancio (anche scansionato), il primo foglio ha voce, esercizio ed esercizio precedente in tre colonne, con la variazione calcolata.'),
      checkbox('Riunisci le descrizioni che vanno a capo', st.merge, v => { st.merge = v; refreshAll(); }, 'Nelle tabelle senza bordi: la seconda riga di una descrizione lunga resta nella stessa cella, non diventa una riga a sé.')),
    sec('Pagine', seg([['all', 'Tutte'], ['some', 'Solo alcune']], st.range, v => { st.range = v; rangeBox.style.display = v === 'some' ? '' : 'none'; }), rangeBox),
    h('div', { class: 'hint' }, 'Sulla pagina sono evidenziate le tabelle trovate, con le divisioni tra le colonne; accanto vedi il foglio come sarà in Excel. Le pagine scansionate vengono lette con l’OCR.'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), 'Converti in Excel')]);
  requestAnimationFrame(() => viewer.render());

  /* lettura anticipata delle pagine scansionate: mentre si guarda l'anteprima e si scelgono le opzioni (che non cambiano
     la lettura), le scansioni si leggono già; la conversione poi le trova pronte. Motori a parte (indici 100+), un
     processore lasciato libero, pausa durante gli altri lavori. */
  const specEl = h('div', { class: 'spec-note', hidden: true });
  { const run0 = stage.querySelector('.side-foot .btn-run'); if (run0) run0.before(specEl); }
  let specAlive = true;
  onLeave(() => { specAlive = false; });
  if (typeof Tesseract !== 'undefined' && (!IS_TOUCH || (navigator.deviceMemory || 0) >= 6)) setTimeout(async () => {
    const scans = [];
    for (let p = 1; p <= N && specAlive; p++) if (await isScan(p)) scans.push(p);
    if (!scans.length || !specAlive) return;
    const draw = () => {
      const ready = scans.filter(p => layouts.has(p)).length, all = ready >= scans.length;
      specEl.hidden = false; specEl.className = 'spec-note' + (all ? ' ok' : '');
      specEl.replaceChildren(all ? ic('check', 14, 2.6) : h('span', { class: 'jp-spin' }),
        h('span', {}, all ? `Scansioni già lette in anticipo (${scans.length}): la conversione sarà quasi immediata.` : `Lettura anticipata delle scansioni: ${ready} di ${scans.length} pronte`));
    };
    draw();
    let next = 0;
    const slot = async k => {
      for (;;) {
        while (specAlive && typeof Jobs !== 'undefined' && Jobs.running) await new Promise(r => setTimeout(r, 700));
        if (!specAlive) return;
        const i = next++; if (i >= scans.length) return;
        try { await layoutOf(scans[i], { slot: 100 + k }); } catch (e) { if (!e?.cancel) console.warn('lettura anticipata', e); }
        if (specAlive) { draw(); if (shown === scans[i]) showPreview(shown); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, parallelSlots() - 1), scans.length) }, (_, k) => slot(k)));
    // i motori della lettura anticipata si chiudono (la conversione usa i suoi)
    for (let k = 100; k < workers.length; k++) if (workers[k]) { workers[k].then(x => x.terminate()).catch(() => {}); workers[k] = null; }
  }, 900);

  async function run() {
    let pages;
    try { pages = st.range === 'all' ? Array.from({ length: N }, (_, i) => i + 1) : [...new Set(parseRanges(st.rangeText, N).flat())].sort((a, b) => a - b); }
    catch (e) { return Errors.show(e); }
    await withBusy('Conversione in Excel…', async () => {
      const R = await eng.build(pages, st, (f, t) => Busy.set(f, t));
      const { bytes, bil, ocrN } = R;
      locale = R.locale;
      setTimeout(refreshAll, 0); // l'anteprima mostra ora le pagine lette
      showResult([{ name: `${doc.base}.xlsx`, bytes, type: XlsxOut.MIME, info: `${plural(R.sheets.length, 'foglio', 'fogli')} · ${R.nTables ? plural(R.nTables, 'tabella', 'tabelle') : 'nessuna tabella riconosciuta'}` }], {
        title: 'Conversione in Excel completata', primary: 0,
        note: [bil ? `Bilancio riconosciuto: il foglio «Bilancio» ha ${bil.sections.map(x => x.title.toLowerCase()).join(', ')} con ${bil.cols.join(' e ')} affiancati, pronti per i calcoli.` : '', locale === 'en' ? 'Numeri nel formato inglese (1,234.56): convertiti in valori.' : '', ocrN ? `${plural(ocrN, 'pagina scansionata letta', 'pagine scansionate lette')} con l’OCR: controlla gli importi.` : ''].filter(Boolean).join(' ') || null,
      });
    }, { cancellable: true });
  }
}

/* più PDF insieme: un file Excel per ciascuno */
async function startExcelMany(stage, files) {
  const docs = await batchOpenPdfs(files);
  if (docs.length === 1) return startExcel(stage, [docs[0].file]);
  const st = { sheets: 'page', content: 'all', merge: true, types: true, geo: true, oneLine: false, bilancio: true };
  const rows = docs.map(d => batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)));
  const totalPages = docs.reduce((t, d) => t + d.numPages, 0);
  workspace(stage, batchMain(rows, `${plural(docs.length, 'file', 'file')} · ${plural(totalPages, 'pagina', 'pagine')} in totale`), [
    h('div', { class: 'hint ok' }, 'Ogni PDF diventa un file Excel separato, con lo stesso nome: li scarichi uno per uno o tutti insieme in uno ZIP. Le pagine scansionate vengono lette con l’OCR.'),
    sec('Fogli di Excel', seg([['page', 'Un foglio per pagina'], ['one', 'Tutto in un foglio']], st.sheets, v => { st.sheets = v; }),
      h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Con «Tutto in un foglio» le pagine di ogni file vanno una sotto l’altra: ideale per estratti conto e elenchi lunghi.')),
    sec('Cosa riportare', seg([['all', 'Tutta la pagina'], ['tables', 'Solo le tabelle']], st.content, v => { st.content = v; })),
    sec('Opzioni',
      checkbox('Importi e date come numeri', st.types, v => { st.types = v; }, 'Così in Excel puoi sommarli e ordinarli.'),
      checkbox('Riproduci le tabelle come nel PDF', st.geo, v => { st.geo = v; }, 'Stesse colonne, larghezze, bordi e celle unite delle tabelle con i bordi.'),
      checkbox('Testo di ogni cella su una riga', st.oneLine, v => { st.oneLine = v; }),
      checkbox('Bilancio: foglio pronto per i calcoli', st.bilancio, v => { st.bilancio = v; }, 'Per i file che sono bilanci: voce, esercizio ed esercizio precedente in tre colonne.'),
      checkbox('Riunisci le descrizioni che vanno a capo', st.merge, v => { st.merge = v; })),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), `Converti ${docs.length} file in Excel`)]);

  async function run() {
    const workers = [];
    rows.forEach(r => r.reset());
    await withBusy('Conversione in Excel…', async () => {
      const S = parallelSlots(), K = batchSlots(docs.length), perDoc = Math.max(1, Math.floor(S / K));
      const { results, errors } = await batchPool(rows, K, async (i, r, ctx, prog) => {
        const d = docs[i];
        const eng = excelEngine(d, {
          parallel: perDoc,
          getWorker: k => {
            ctx.w ||= [];
            if (!ctx.w[k]) {
              prog(null, 'Avvio del motore OCR…');
              ctx.w[k] = makeOcrWorker(new Set(['ita']), 300).then(w => { workers.push(w); w._box.log = () => {}; return w; });
              ctx.cleanup = async () => { for (const wp of ctx.w) { try { (await wp).terminate(); } catch { } } };
            }
            return ctx.w[k];
          },
          status: t => prog(null, t),
        });
        const res = await eng.build(Array.from({ length: d.numPages }, (_, k) => k + 1), st, prog);
        r.subEl.textContent = `${plural(d.numPages, 'pagina', 'pagine')} · ${excelInfo(res)}`;
        return res;
      });
      const outs = [];
      results.forEach((res, i) => { if (res) outs.push({ name: `${docs[i].base}.xlsx`, bytes: res.bytes, type: XlsxOut.MIME, info: excelInfo(res) }); });
      if (!outs.length) throw new Error(errors[0] || 'Nessun file convertito');
      uniqueNames(outs.map(o => o.name)).forEach((n, i) => outs[i].name = n);
      const ocrTot = results.reduce((t, r) => t + (r?.ocrN || 0), 0);
      showResult(outs, { title: 'Conversione in Excel completata', zipName: 'pdf-in-excel.zip',
        note: batchNote(outs.length, errors, [ocrTot ? `${plural(ocrTot, 'pagina scansionata letta', 'pagine scansionate lette')} con l’OCR: controlla gli importi.` : '']) });
    }, { cancellable: true, onCancel: () => { workers.forEach(w => { try { w.terminate(); } catch { } }); } });
  }
}

/* =====================================================================
   BilancioKit — il bilancio (da XBRL o da PDF, anche scansionato) in un foglio Excel
   pensato per lavorarci: una colonna con le voci (con la loro gerarchia), una con
   l'esercizio del bilancio, una con l'esercizio precedente; importi come numeri,
   totali in grassetto, variazione assoluta e percentuale calcolate con formule.
   ===================================================================== */
const BilancioKit = (() => {
  const SECTIONS = [
    [/^stato\s+patrimoniale\b/i, 'Stato patrimoniale'],
    [/^conto\s+economico\b/i, 'Conto economico'],
    [/^rendiconto\s+finanziario\b/i, 'Rendiconto finanziario'],
  ];
  // dove finiscono i prospetti numerici
  const STOP = /^(nota\s+integrativa|relazione\s+(sulla|della|del)|parte\s+iniziale|criteri\s+di\s+(valutazione|formazione)|dichiarazione\s+di\s+conformit|il\s+presente\s+bilancio)/i;
  const NOISE = /^(pag(\.|ina)?\s*\d+(\s*(di|\/)\s*\d+)?|generato\s+automaticamente|v\.\s*\d+(\.\d+)+|bilancio\s+(di\s+esercizio|abbreviato|ordinario|micro|consolidato)?\s*al\s+\d|importi\s+(in|espressi)|valori\s+(in|espressi)|\(?euro\)?|\(?importi\s+in\s+euro\)?)$/i;
  const YEAR = /^(19|20)\d{2}$/, DATEY = /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]((19|20)\d{2})$/;
  const DASH = /^[-–—]+$/;
  const PAGENO = /\bpag(\.|ina)\s*\d+(\s*(di|\/)\s*\d+)?\s*$/i;
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const numOf = f => f && !f.nil && /^\s*[+-]?\d*\.?\d+\s*$/.test(f.v || '') ? Number(f.v) : null;
  const yearOf = s => { const m = String(s || '').match(/((19|20)\d{2})/g); return m ? m[m.length - 1] : ''; };

  /* —— dal file XBRL: i prospetti già ordinati con la loro gerarchia —— */
  function fromXbrl(D) {
    const st = D.blocks.filter(b => b.type === 'stmt');
    if (!st.length) return null;
    const cols = st[0].cols || ['', ''];
    let decimals = 0;
    const sections = st.map(b => ({
      title: b.title,
      rows: b.rows.map(r => {
        if (r.heading) return { label: r.label, depth: r.depth || 0, heading: true, c: r.c };
        const cur = numOf(r.vals[0]), prev = numOf(r.vals[1]);
        for (const v of [cur, prev]) if (v != null && !Number.isInteger(v)) decimals = 2;
        return { label: r.label, depth: r.depth || 0, total: !!r.total, cur, prev, c: r.c };
      }),
    }));
    const per = D.P?.cur ? `dal ${D.itDate(D.P.cur.start)} al ${D.itDate(D.P.cur.end)}` : '';
    return {
      company: D.info?.DatiAnagraficiDenominazione || '',
      subtitle: [D.title, D.info?.DatiAnagraficiCodiceFiscale ? 'C.F. ' + D.info.DatiAnagraficiCodiceFiscale : '', per ? 'esercizio ' + per : ''].filter(Boolean).join(' · '),
      cols: cols.map(c => yearOf(c) ? `Esercizio ${yearOf(c)}` : c), dates: cols, decimals, sections,
    };
  }

  /* —— dal PDF: righe visive della pagina (testo libero + celle delle tabelle sulla stessa riga) —— */
  function visualLines(L) {
    const frag = [];
    for (const l of L.lines || []) { const ws = (l.words || []).filter(w => w.t && !w.tab); if (ws.length) frag.push({ words: ws, top: l.top, bottom: l.bottom, size: l.size || 10 }); }
    for (const t of L.tables || []) for (const c of t.cells || []) {
      if (c.lines) for (const l of c.lines) { const ws = (l.words || []).filter(w => w.t); if (ws.length) frag.push({ words: ws, top: Math.min(...ws.map(w => w.y0)), bottom: Math.max(...ws.map(w => w.y1)), size: l.size || 10 }); }
      else for (const r of c.rows || []) { const ws = (r.words || []).filter(w => w.t); if (!ws.length) continue; const sz = median(ws.map(w => w.size || 10)) || 10; frag.push({ words: ws, top: r.base - sz * 0.85, bottom: r.base + sz * 0.25, size: sz }); }
    }
    frag.sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));
    const out = [];
    for (const f of frag) {
      const l = out.find(o => Math.min(o.bottom, f.bottom) - Math.max(o.top, f.top) > Math.min(o.bottom - o.top, f.bottom - f.top) * 0.55 && !o.words.some(q => f.words.some(w => Math.min(q.x1, w.x1) - Math.max(q.x0, w.x0) > 1)));
      if (l) { l.words.push(...f.words); l.top = Math.min(l.top, f.top); l.bottom = Math.max(l.bottom, f.bottom); }
      else out.push({ ...f, words: [...f.words] });
    }
    for (const l of out) { l.words.sort((a, b) => a.x0 - b.x0); l.text = l.words.reduce((s, w, i) => s + (i && !w.glue ? ' ' : '') + w.t, '').trim(); l.bold = l.words.filter(w => w.b).length > l.words.length / 2; }
    return out.sort((a, b) => a.top - b.top);
  }
  const isAmount = (t, loc) => DASH.test(t) || (ExcelKit.isNumLike(t) && ExcelKit.parseValue(t, loc).t === 'n');
  /* importi in fondo alla riga (a destra), etichetta prima */
  function split(l, W, loc) {
    const ws = l.words; let k = ws.length;
    while (k > 0 && ws[k - 1].x0 > W * 0.4 && isAmount(ws[k - 1].t, loc)) k--;
    // «1)» «2.» all'inizio dell'etichetta non sono importi: almeno una parola resta all'etichetta se l'etichetta è solo numeri
    const label = ws.slice(0, k), am = ws.slice(k);
    return { label, am };
  }
  function clusters(xs, tol) {
    const s = [...xs].sort((a, b) => a - b), out = [];
    for (const x of s) { const c = out[out.length - 1]; if (c && x - c.max <= tol) { c.xs.push(x); c.max = x; } else out.push({ xs: [x], max: x }); }
    return out.map(c => ({ x: median(c.xs), n: c.xs.length }));
  }
  function depthOf(label) {
    if (/^[A-H]\s*[).]\s|^[A-H]\s*[-–]\s/.test(label)) return 0;
    if (/^(I{1,3}|IV|VI{0,3}|IX|X)\s*[).\-–]\s/.test(label)) return 1;
    if (/^\d{1,2}(\s?(bis|ter|quater))?\s*[).]\s/i.test(label)) return 2;
    if (/^[a-z]\s*\)[\s,]/.test(label)) return 3;
    return null;
  }
  function fromLayouts(Ls, { loc = 'it' } = {}) {
    if (typeof ExcelKit === 'undefined') return null;
    const pages = Ls.map((L, pi) => ({ L, pi, lines: L ? visualLines(L) : [], W: L?.w || 595 }));
    const allText = pages.flatMap(p => p.lines.map(l => l.text)).join('\n');
    if (!/stato\s+patrimoniale|conto\s+economico/i.test(allText)) return null;
    // righe ripetute su più pagine (intestazioni e piè di pagina)
    const rep = new Map();
    for (const p of pages) for (const t of new Set(p.lines.map(l => l.text.replace(/\d+/g, '#')))) rep.set(t, (rep.get(t) || 0) + 1);
    const repeated = t => pages.length >= 3 && (rep.get(t.replace(/\d+/g, '#')) || 0) >= Math.max(2, pages.length * 0.5);
    const secOf = (l, am) => { if (am.length || l.text.split(/\s+/).length > 9) return null; const t = l.text.replace(/^[\d.\s]+/, ''); for (const [re, name] of SECTIONS) if (re.test(t)) return name; return null; };
    // posizioni delle colonne degli importi: per pagina (le pagine possono avere impaginazioni diverse)
    let company = '', title = '';
    const sections = []; let sec = null, cols = null, labels = null, decimals = 0, stopped = false;
    const firstLines = pages[0]?.lines.slice(0, 8) || [];
    for (const l of firstLines) { if (!title && /bilancio/i.test(l.text) && /\d{4}/.test(l.text)) title = l.text; }
    company = (firstLines.find(l => /[A-Za-z]{3}/.test(l.text) && !/bilancio|^pag|stato patrimoniale|conto economico|^\(?euro|^v\.\s*\d/i.test(l.text)) || {}).text || '';
    let lastRow = null;
    for (const p of pages) {
      const parsed = p.lines.map(l => ({ l, ...split(l, p.W, loc) }));
      const amXs = parsed.flatMap(x => x.am.map(w => w.x1));
      let cl = clusters(amXs, 9).filter(c => c.n >= 3).sort((a, b) => b.n - a.n).slice(0, 2).sort((a, b) => a.x - b.x);
      if (cl.length) cols = cl; // altrimenti si tengono quelle della pagina prima
      // fin dove arrivano le etichette: una riga che arriva fin lì è andata a capo
      const lx = parsed.filter(x => x.label.length && x.am.length).map(x => x.label[x.label.length - 1].x1).sort((a, b) => a - b);
      const labRight = lx.length ? lx[Math.floor(lx.length * 0.95)] : p.W * 0.6;
      // distanza tipica tra due voci con importi: le righe più vicine sono la stessa voce che va a capo
      const pv = parsed.map((x, i) => i && x.am.length && parsed[i - 1].am.length ? x.l.top - parsed[i - 1].l.top : 0).filter(d => d > 3);
      const rowPitch = pv.length >= 3 ? median(pv) : 0;
      for (const x of parsed) {
        const { l, label, am } = x;
        const text = l.text;
        if (!text || NOISE.test(text)) continue;
        // intestazione delle colonne: due anni o due date
        const yw = l.words.map(w => ({ w, y: (w.t.match(DATEY) || [])[1] || (YEAR.test(w.t) ? w.t : null) })).filter(o => o.y);
        if (yw.length >= 2 && l.words.length <= 10 && l.words.every(w => yw.some(o => o.w === w) || /^(esercizio|anno|al|euro|corrente|precedente|importi|in|valori|\(?euro\)?|[-–])$/i.test(w.t))) {
          labels = yw.slice(-2).map(o => ({ y: o.y, x: o.w.x1 }));
          continue;
        }
        const sname = secOf(l, am);
        if (!sname && repeated(text) && am.length <= 1) continue; // intestazioni e piè di pagina
        if (PAGENO.test(text) && am.length <= 1) continue;
        if (sname) {
          if (sec && sec.title === sname) continue; // «Stato patrimoniale (segue)» sulla pagina dopo
          if (stopped && sections.some(s => s.title === sname)) continue; // nella nota integrativa: non è il prospetto
          sec = sections.find(s => s.title === sname);
          if (!sec) { sec = { title: sname, rows: [], minX: Infinity }; sections.push(sec); }
          lastRow = null; continue;
        }
        if (STOP.test(text) && !am.length && text.split(/\s+/).length <= 12) { sec = null; lastRow = null; stopped = true; continue; }
        if (!sec) continue;
        const lab = label.reduce((s, w, i) => s + (i && !w.glue ? ' ' : '') + w.t, '').trim();
        // importi nelle colonne
        let vals = null;
        if (am.length && cols?.length) {
          vals = [null, null];
          const used = new Set();
          for (const w of am) {
            let best = -1, bd = 30;
            cols.forEach((c, i) => { const d = Math.abs(c.x - w.x1); if (d < bd && !used.has(i)) { bd = d; best = i; } });
            if (best < 0) continue;
            used.add(best);
            const v = DASH.test(w.t) ? null : ExcelKit.parseValue(w.t, loc);
            if (v && v.t === 'n') { vals[best] = v.v; if (!Number.isInteger(v.v)) decimals = 2; }
            else vals[best] = vals[best] ?? null;
          }
          if (cols.length === 1) vals = [vals[0], null];
        } else if (am.length) vals = [ExcelKit.parseValue(am[0].t, loc).v ?? null, am[1] ? ExcelKit.parseValue(am[1].t, loc).v ?? null : null];
        const hasVals = !!am.length;
        const x0 = label[0]?.x0 ?? l.words[0].x0;
        const cont = /^[a-zàèéìòù(]/.test(lab) && depthOf(lab) == null && lastRow && !/[:.]$/.test(lastRow.label) && lastRow.x1 > labRight - Math.max(60, (labRight - (lastRow.x0 || 0)) * 0.22) && x0 >= lastRow.x0 - 2 && (!rowPitch || lastRow.page !== p.pi || l.top - lastRow.top < rowPitch * 0.92);
        if (!lab && hasVals) { // importi su una riga a sé: vanno alla voce sopra
          if (lastRow && lastRow.cur == null && lastRow.prev == null) { lastRow.cur = vals[0]; lastRow.prev = vals[1]; lastRow.heading = false; }
          continue;
        }
        if (cont && (!hasVals || (lastRow.heading && lastRow.cur == null && lastRow.prev == null))) {
          lastRow.label += ' ' + lab; lastRow.x1 = label[label.length - 1].x1; lastRow.top = l.top;
          if (hasVals) { lastRow.cur = vals[0]; lastRow.prev = vals[1]; lastRow.heading = false; }
          continue;
        }
        const row = { label: lab, x0, top: l.top, page: p.pi, x1: label.length ? label[label.length - 1].x1 : x0, bold: l.bold, heading: !hasVals, cur: hasVals ? vals[0] : null, prev: hasVals ? vals[1] : null, pre: depthOf(lab) };
        row.total = /^totale\b/i.test(lab) || (l.bold && hasVals) || (/utile|perdita|risultato/i.test(lab) && /esercizio/i.test(lab) && hasVals && row.pre == null);
        sec.rows.push(row); sec.minX = Math.min(sec.minX, x0);
        lastRow = row;
      }
    }
    // gerarchia: dalle sigle (A), I, 1), a)) e, se mancano, dal rientro del testo
    for (const s of sections) {
      // livelli di rientro: le posizioni distinte d'inizio delle voci (a meno di 3 punti sono la stessa)
      // (se il testo non ha rientri, valgono le sigle: A) I 1) a))
      const lv = []; for (const x of s.rows.map(r => r.x0).sort((a, b) => a - b)) if (!lv.length || x - lv[lv.length - 1] > 4) lv.push(x);
      const flat = lv.length < 2;
      for (const r of s.rows) {
        const ind = Math.max(0, lv.findIndex((x, i) => i === lv.length - 1 || r.x0 < (x + lv[i + 1]) / 2));
        r.depth = Math.min(6, flat ? (r.pre ?? (r.total ? 0 : 1)) : ind);
        delete r.x0; delete r.x1; delete r.pre; delete r.top; delete r.page;
      }
      s.rows = s.rows.filter(r => r.label || r.cur != null || r.prev != null);
    }
    const good = sections.filter(s => s.rows.filter(r => r.cur != null || r.prev != null).length >= 4);
    if (!good.length) return null;
    // quale colonna è l'esercizio corrente: quella con l'anno più recente (di solito la prima)
    let names = ['Esercizio corrente', 'Esercizio precedente'];
    if (labels && labels.length === 2) {
      const [a, b] = labels;
      if (+a.y < +b.y) { for (const s of good) for (const r of s.rows) [r.cur, r.prev] = [r.prev, r.cur]; names = [`Esercizio ${b.y}`, `Esercizio ${a.y}`]; }
      else names = [`Esercizio ${a.y}`, `Esercizio ${b.y}`];
    }
    const sub = company && title.startsWith(company) ? title.slice(company.length).replace(/^[\s·\-–]+/, '') : title;
    return { company, subtitle: sub, cols: names, decimals, sections: good, fromPdf: true };
  }

  /* —— il foglio Excel (colori e carattere di file360) —— */
  function sheet(model, { name = 'Bilancio' } = {}) {
    const B = Brand.C, FONT = 'Instrument Sans';
    const rows = [];
    const S = (v, o = {}) => ({ t: 's', v: v ?? '', font: FONT, ...o });
    const NF = model.decimals ? '#,##0.00;-#,##0.00' : '#,##0;-#,##0';
    const NFV = model.decimals ? '#,##0.00;[Red]-#,##0.00' : '#,##0;[Red]-#,##0';
    rows.push([S(model.company || 'Bilancio', { bold: true, size: 16, color: B.ink })]);
    rows.push([S(model.subtitle || '', { size: 10, color: B.muted })]);
    rows.push([S('Importi in euro · variazione e variazione % sono formule: puoi modificarle o aggiungerne altre · creato con file360', { size: 8.5, italic: true, color: B.muted })]);
    const HB = { b: 'medium' };
    const H = (v, o = {}) => S(v, { bold: true, fill: B.ink, color: '#FFFFFF', border: HB, valign: 'center', size: 10.5, ...o });
    rows.push([H('Voce'), H(model.cols[0], { align: 'right' }), H(model.cols[1], { align: 'right' }), H('Variazione', { align: 'right', fill: B.ink2 }), H('Var. %', { align: 'right', fill: B.ink2 })]);
    const heights = [26, 16, 14, 24];
    let longest = 20;
    for (const s of model.sections) {
      rows.push([]); heights.push(10);
      const band = o => S('', { fill: B.soft, ...o });
      rows.push([S(s.title.toUpperCase(), { bold: true, fill: B.soft, color: B.accent2, size: 11, valign: 'center' }), band(), band(), band(), band()]); heights.push(21);
      for (const r of s.rows) {
        const ri = rows.length + 1; // riga di Excel (da 1)
        const d = Math.max(0, Math.min(6, r.depth || 0));
        longest = Math.max(longest, r.label.length + d * 2);
        const bold = r.total || (r.heading && d === 0);
        const lab = S(r.label, { bold, italic: r.heading && d > 0, indent: d, color: r.heading && d > 0 ? B.ink2 : B.ink });
        if (r.heading && r.cur == null && r.prev == null) { rows.push([lab]); heights.push(null); continue; }
        const bt = r.total ? { t: 'thin' } : undefined;
        const n = v => v == null ? S('', { border: bt }) : { t: 'n', v, fmt: NF, bold, border: bt, font: FONT, color: B.ink };
        const both = r.cur != null && r.prev != null;
        const dv = both ? Math.round((r.cur - r.prev) * 100) / 100 : null;
        const pv = both && r.prev !== 0 ? (r.cur - r.prev) / Math.abs(r.prev) : null;
        rows.push([lab, n(r.cur), n(r.prev),
          both ? { t: 'n', f: `B${ri}-C${ri}`, v: dv, fmt: NFV, bold, color: B.muted, border: bt, font: FONT } : S('', { border: bt }),
          both ? (pv == null ? { t: 's', f: `IF(C${ri}=0,"",(B${ri}-C${ri})/ABS(C${ri}))`, v: '', border: bt, font: FONT } : { t: 'n', f: `IF(C${ri}=0,"",(B${ri}-C${ri})/ABS(C${ri}))`, v: Math.round(pv * 1e6) / 1e6, fmt: '0.0%;[Red]-0.0%', color: B.muted, bold, border: bt, font: FONT }) : S('', { border: bt })]);
        heights.push(null);
      }
    }
    return { name, rows, heights, widths: [Math.max(46, Math.min(95, longest * 1.02 + 3)), 18, 18, 16, 10], freeze: 4, fit: true, paper: 9, margins: 0.4, bilancio: true, tabColor: B.accent, noGrid: true };
  }
  /* è un bilancio? (testo delle prime pagine) */
  const looksLike = text => /stato\s+patrimoniale/i.test(text) && /(conto\s+economico|totale\s+(attivo|passivo))/i.test(text);
  return { fromXbrl, fromLayouts, sheet, looksLike, visualLines };
})();
if (typeof module !== 'undefined') module.exports = BilancioKit;

/* =====================================================================
   Dati di riferimento per l’analisi di bilancio (dal progetto DeltaFinance):
   settori Damodaran Europa (beta, struttura del debito, aliquota, costo del capitale,
   multipli EV/EBITDA ed EV/EBIT), corrispondenza ATECO 2007 → settore, tasso privo di rischio.
   ===================================================================== */
const AnalisiDati = {"fonte":"Damodaran, dati settoriali Europa (gennaio 2025); Rendistato Banca d’Italia 2025","campi":["nome","imprese","betaUnlevered","debitoSuEquity","aliquota","costoEquity","wacc","evEbitda","evEbit"],"settori":{"Advertising":["Pubblicità",84,0.613,0.6035,0.1543,0.0732,0.0572,15.27,25.74],"Aerospace/Defense":["Aerospazio e difesa",49,1.1148,0.2196,0.1488,0.0976,0.0855,11.76,17.67],"Air Transport":["Trasporto aereo",39,0.6116,0.8417,0.1786,0.0799,0.0574,30.18,null],"Apparel":["Abbigliamento e tessile",124,0.8806,0.2317,0.1577,0.0816,0.072,18.87,22.36],"Auto & Truck":["Autoveicoli",25,0.6799,1.6515,0.1671,0.1123,0.0614,8.32,11.33],"Auto Parts":["Componentistica auto",55,1.1867,0.559,0.2124,0.1214,0.0888,7.6,12.79],"Bank (Money Center)":["Banche",122,0.2555,5.348,0.193,0.0981,0.0413,null,null],"Banks (Regional)":["Banche regionali",69,0.1626,2.6565,0.1898,0.0491,0.0326,null,null],"Beverage (Alcoholic)":["Bevande alcoliche",51,0.4466,0.4412,0.1756,0.0552,0.0477,15.1,19.18],"Beverage (Soft)":["Bevande analcoliche",16,0.5013,0.2814,0.1567,0.0559,0.0503,15.82,21.54],"Broadcasting":["Radio e televisione",23,0.9887,0.3116,0.1856,0.0929,0.0781,6.96,8.53],"Brokerage & Investment Banking":["Intermediazione finanziaria",69,0.5752,0.3061,0.127,0.062,0.0546,22.32,23.46],"Building Materials":["Materiali da costruzione",86,0.8259,0.2942,0.1621,0.0801,0.0689,14.86,19.0],"Business & Consumer Services":["Servizi alle imprese e alle persone",207,0.8396,0.3318,0.17,0.0826,0.0697,18.03,26.04],"Cable TV":["TV via cavo",8,0.4672,2.0064,0.2047,0.0909,0.0507,7.41,12.23],"Chemical (Basic)":["Chimica di base",53,0.6732,0.4761,0.1348,0.0746,0.0604,9.14,11.77],"Chemical (Diversified)":["Chimica diversificata",7,1.3897,0.3761,0.1625,0.127,0.0995,5.54,7.64],"Chemical (Specialty)":["Chimica specialistica",95,1.0383,0.22,0.1287,0.0922,0.0811,14.44,20.99],"Coal & Related Energy":["Carbone ed energia",16,0.9365,0.2198,0.0817,0.0851,0.0758,4.97,38.63],"Computer Services":["Servizi informatici",204,0.9265,0.1699,0.1825,0.0822,0.0747,19.84,24.53],"Computers/Peripherals":["Computer e periferiche",38,1.2258,0.2244,0.1064,0.1057,0.0925,11.99,14.57],"Construction Supplies":["Forniture per l’edilizia",111,0.8681,0.4971,0.1452,0.0914,0.0713,9.68,14.46],"Diversified":["Diversificato",65,0.8672,0.6084,0.1458,0.0959,0.0712,8.77,9.77],"Drugs (Biotechnology)":["Biotecnologie",202,1.3394,0.115,0.0155,0.1069,0.0993,22.2,null],"Drugs (Pharmaceutical)":["Farmaceutico",116,0.9869,0.2127,0.0753,0.0883,0.0787,13.25,15.61],"Education":["Istruzione",12,0.5603,1.7257,0.0953,0.0978,0.0573,15.52,19.42],"Electrical Equipment":["Apparecchiature elettriche",131,1.1292,0.2371,0.1095,0.0995,0.0869,18.87,30.03],"Electronics (Consumer & Office)":["Elettronica di consumo",17,1.2725,0.0898,0.1246,0.101,0.0955,15.27,19.42],"Electronics (General)":["Elettronica",160,1.1491,0.1593,0.1195,0.0968,0.0881,20.41,27.97],"Engineering/Construction":["Costruzioni e ingegneria",139,0.7045,0.7857,0.1711,0.0873,0.0624,10.33,18.82],"Entertainment":["Intrattenimento",152,0.973,0.3167,0.0808,0.092,0.078,23.86,59.51],"Environmental & Waste Services":["Ambiente e rifiuti",49,0.7567,0.3625,0.1303,0.0774,0.0658,16.74,26.56],"Farming/Agriculture":["Agricoltura",47,0.4132,1.1224,0.1577,0.0656,0.0471,10.3,13.96],"Financial Svcs. (Non-bank & Insurance)":["Servizi finanziari",127,0.1884,5.7319,0.1396,0.0807,0.0407,23.04,29.09],"Food Processing":["Alimentare",144,0.6097,0.2116,0.1477,0.0618,0.0564,17.35,23.08],"Food Wholesalers":["Commercio all’ingrosso alimentare",11,0.1429,5.7491,0.248,0.066,0.0359,8.47,13.27],"Furn/Home Furnishings":["Mobili e arredamento",44,0.8605,0.4112,0.1612,0.0874,0.0717,7.9,10.1],"Green & Renewable Energy":["Energie rinnovabili",48,0.5657,0.8147,0.1814,0.0746,0.0549,18.79,38.31],"Healthcare Products":["Prodotti medicali",183,1.1189,0.1331,0.0639,0.0934,0.0864,22.16,31.51],"Healthcare Support Services":["Servizi sanitari",46,0.6107,0.7898,0.1697,0.0783,0.0573,9.98,13.73],"Heathcare Information and Technology":["Informatica sanitaria",93,1.0009,0.1569,0.0985,0.0867,0.0795,30.3,44.41],"Homebuilding":["Costruzione di edifici",45,0.9786,0.0831,0.1937,0.0818,0.0779,8.24,8.4],"Hospitals/Healthcare Facilities":["Ospedali e strutture sanitarie",31,0.3569,1.4415,0.1653,0.0646,0.0445,19.76,36.8],"Hotel/Gaming":["Alberghi e turismo",109,0.6431,0.6527,0.1156,0.0774,0.0601,20.0,null],"Household Products":["Prodotti per la casa",72,0.7619,0.1695,0.1334,0.071,0.0651,18.81,22.38],"Information Services":["Servizi di informazione",30,0.9555,0.1182,0.103,0.0819,0.0768,44.61,70.31],"Insurance (General)":["Assicurazioni",45,0.6706,0.4545,0.1919,0.0737,0.0589,7.86,8.72],"Insurance (Life)":["Assicurazioni vita",20,0.6278,1.1776,0.1823,0.0913,0.0585,14.36,15.72],"Insurance (Prop/Cas.)":["Assicurazioni danni",16,0.6448,0.2301,0.1888,0.0648,0.0577,12.15,12.84],"Investments & Asset Management":["Gestione del risparmio",337,0.6818,0.3011,0.07,0.0697,0.0607,10.9,10.99],"Machinery":["Macchinari",214,1.1652,0.1621,0.167,0.098,0.0886,16.99,22.19],"Metals & Mining":["Metalli e attività estrattive",101,0.9696,0.4129,0.0817,0.0961,0.0779,4.34,5.98],"Office Equipment & Services":["Forniture per ufficio",26,0.8731,0.4735,0.1301,0.0909,0.0715,5.09,6.13],"Oil/Gas (Integrated)":["Petrolio e gas (integrato)",14,0.8909,0.5484,0.3084,0.0955,0.0725,5.52,21.19],"Oil/Gas (Production and Exploration)":["Estrazione di petrolio e gas",110,0.834,1.1087,0.0822,0.1123,0.071,4.9,10.42],"Oil/Gas Distribution":["Distribuzione di gas",27,0.7115,1.0342,0.0605,0.0962,0.0644,13.52,43.25],"Oilfield Svcs/Equip.":["Servizi per l’estrazione",68,1.0947,0.522,0.1064,0.1116,0.0849,6.98,12.71],"Packaging & Container":["Imballaggi",51,0.7869,0.5347,0.1464,0.0861,0.0668,10.9,17.54],"Paper/Forest Products":["Carta e legno",36,0.8668,0.299,0.1715,0.0833,0.0712,10.74,15.33],"Power":["Energia elettrica",71,0.5406,0.7689,0.1827,0.071,0.0535,9.37,18.14],"Precious Metals":["Metalli preziosi",59,0.9184,0.291,0.0829,0.0868,0.0749,3.42,5.31],"Publishing & Newspapers":["Editoria",89,0.5813,0.5066,0.1335,0.0678,0.0553,15.35,28.1],"R.E.I.T.":["Fondi immobiliari",169,0.3567,0.7496,0.0271,0.0531,0.0416,27.7,27.86],"Real Estate (Development)":["Sviluppo immobiliare",60,0.4958,0.7684,0.1364,0.0667,0.051,12.48,13.95],"Real Estate (General/Diversified)":["Immobiliare",66,0.4129,0.9696,0.1249,0.0626,0.0469,35.79,40.1],"Real Estate (Operations & Services)":["Servizi immobiliari",246,0.2998,0.8416,0.1353,0.0489,0.0406,31.93,33.42],"Recreation":["Sport e tempo libero",59,0.6484,0.3599,0.188,0.069,0.0589,18.75,61.46],"Reinsurance":["Riassicurazione",4,0.8306,0.2374,0.1828,0.0783,0.0683,11.24,12.11],"Restaurant/Dining":["Ristorazione",40,0.642,0.4331,0.1363,0.0707,0.0586,25.53,null],"Retail (Automotive)":["Commercio di autoveicoli",25,0.4039,1.3328,0.1564,0.0685,0.0469,6.69,9.57],"Retail (Building Supply)":["Commercio di materiali edili",22,0.5098,1.2524,0.1571,0.0795,0.0523,7.61,9.11],"Retail (Distributors)":["Commercio all’ingrosso",112,0.5866,0.6852,0.17,0.0731,0.0559,15.4,19.09],"Retail (General)":["Commercio al dettaglio",16,0.3564,1.7805,0.1919,0.0701,0.0448,10.46,14.78],"Retail (Grocery and Food)":["Commercio alimentare",27,0.4162,1.1792,0.1885,0.067,0.0473,10.62,15.05],"Retail (Online)":["Commercio online",79,1.1739,0.0641,0.0978,0.0933,0.0897,22.27,null],"Retail (Special Lines)":["Commercio specializzato",72,0.8524,0.3413,0.1553,0.084,0.0712,14.2,23.4],"Rubber& Tires":["Gomma e pneumatici",8,0.8778,0.5587,0.13,0.0948,0.0703,7.43,11.43],"Semiconductor":["Semiconduttori",34,1.6638,0.1609,0.0822,0.1316,0.1181,16.26,28.08],"Semiconductor Equip":["Macchine per semiconduttori",19,2.0282,0.0337,0.0692,0.1443,0.1407,39.31,43.78],"Shipbuilding & Marine":["Cantieristica navale",62,0.8449,0.8893,0.0876,0.1049,0.0714,6.54,8.17],"Shoe":["Calzature",8,1.5949,0.3371,0.2506,0.1401,0.1125,35.41,50.07],"Software (Entertainment)":["Videogiochi",46,1.2537,0.0679,0.079,0.0985,0.0944,37.98,119.99],"Software (Internet)":["Software e internet",30,0.8951,0.1784,0.0802,0.0804,0.0734,21.86,124.86],"Software (System & Application)":["Software",283,1.0471,0.1252,0.0959,0.0882,0.0822,27.92,37.47],"Steel":["Siderurgia",55,0.8725,0.7645,0.1186,0.1027,0.0715,3.12,3.87],"Telecom (Wireless)":["Telefonia mobile",13,0.4457,1.3229,0.1307,0.0734,0.0491,8.0,19.23],"Telecom. Equipment":["Apparati per telecomunicazioni",56,1.0921,0.257,0.1047,0.0979,0.0848,9.45,11.9],"Telecom. Services":["Telecomunicazioni",78,0.4024,1.1796,0.156,0.0655,0.0466,6.99,15.59],"Tobacco":["Tabacco",6,0.3881,0.6272,0.2132,0.0538,0.0433,8.35,9.19],"Transportation":["Trasporti e logistica",37,0.5634,0.9001,0.2008,0.0766,0.0549,10.65,14.96],"Transportation (Railroads)":["Trasporto ferroviario",5,0.4279,1.5038,0.2273,0.0748,0.0483,5.04,8.99],"Trucking":["Autotrasporto",26,0.4201,2.1215,0.1717,0.0859,0.0483,15.03,25.31],"Utility (General)":["Servizi di pubblica utilità",21,0.3828,0.9962,0.2301,0.0599,0.0432,8.24,13.16],"Utility (Water)":["Servizio idrico",10,0.2764,1.0015,0.2238,0.0487,0.0375,15.52,27.21],"Total Market (without financials)":["Mercato europeo (media)",5897,0.7985,0.4606,0.1281,0.0843,0.0683,11.86,18.27]},"div":{"01":"Farming/Agriculture","02":"Paper/Forest Products","03":"Farming/Agriculture","05":"Coal & Related Energy","06":"Oil/Gas (Production and Exploration)","07":"Metals & Mining","08":"Metals & Mining","09":"Oilfield Svcs/Equip.","10":"Food Processing","11":"Beverage (Alcoholic)","12":"Tobacco","13":"Apparel","14":"Apparel","15":"Apparel","16":"Paper/Forest Products","17":"Paper/Forest Products","18":"Publishing & Newspapers","19":"Oil/Gas (Integrated)","20":"Chemical (Basic)","21":"Drugs (Pharmaceutical)","22":"Rubber& Tires","23":"Building Materials","24":"Steel","25":"Metals & Mining","26":"Electronics (General)","27":"Electrical Equipment","28":"Machinery","29":"Auto Parts","30":"Aerospace/Defense","31":"Furn/Home Furnishings","32":"Healthcare Products","33":"Machinery","35":"Power","36":"Utility (Water)","37":"Environmental & Waste Services","38":"Environmental & Waste Services","39":"Environmental & Waste Services","41":"Homebuilding","42":"Engineering/Construction","43":"Engineering/Construction","45":"Retail (Automotive)","46":"Retail (Distributors)","47":"Retail (General)","49":"Transportation","50":"Transportation","51":"Air Transport","52":"Transportation","53":"Transportation","55":"Hotel/Gaming","56":"Restaurant/Dining","58":"Publishing & Newspapers","59":"Entertainment","60":"Broadcasting","61":"Telecom. Services","62":"Computer Services","63":"Information Services","64":"Bank (Money Center)","65":"Insurance (General)","66":"Investments & Asset Management","68":"Real Estate (Development)","69":"Business & Consumer Services","70":"Business & Consumer Services","71":"Engineering/Construction","72":"Healthcare Products","73":"Advertising","74":"Business & Consumer Services","75":"Healthcare Support Services","77":"Business & Consumer Services","78":"Business & Consumer Services","79":"Hotel/Gaming","80":"Business & Consumer Services","81":"Business & Consumer Services","82":"Business & Consumer Services","85":"Education","86":"Hospitals/Healthcare Facilities","87":"Healthcare Support Services","88":"Healthcare Support Services","90":"Entertainment","91":"Entertainment","92":"Hotel/Gaming","93":"Recreation","94":"Business & Consumer Services","95":"Business & Consumer Services","96":"Business & Consumer Services"},"cat":{"1041":"Food Processing","1051":"Food Processing","1061":"Food Processing","1071":"Food Processing","1102":"Beverage (Alcoholic)","1105":"Beverage (Alcoholic)","1107":"Beverage (Soft)","1320":"Apparel","1812":"Publishing & Newspapers","2059":"Chemical (Specialty)","2110":"Drugs (Pharmaceutical)","2120":"Drugs (Pharmaceutical)","2363":"Building Materials","2511":"Steel","2562":"Machinery","2611":"Semiconductor","2620":"Computers/Peripherals","2630":"Telecom. Equipment","2710":"Electrical Equipment","2899":"Machinery","2910":"Auto & Truck","2930":"Auto Parts","3030":"Aerospace/Defense","3315":"Shipbuilding & Marine","4711":"Retail (Grocery and Food)","4791":"Retail (Special Lines)","5510":"Hotel/Gaming","5610":"Restaurant/Dining","5811":"Publishing & Newspapers","5813":"Publishing & Newspapers","5821":"Software (Entertainment)","5829":"Software (System & Application)","6010":"Broadcasting","6020":"Broadcasting","6110":"Telecom. Services","6120":"Telecom (Wireless)","6201":"Software (System & Application)","6202":"Computer Services","6311":"Information Services","6411":"Bank (Money Center)","6419":"Banks (Regional)","6491":"Financial Svcs. (Non-bank & Insurance)","6499":"Brokerage & Investment Banking","6511":"Insurance (Life)","6512":"Insurance (General)","6520":"Reinsurance","6630":"Investments & Asset Management","6810":"Real Estate (Operations & Services)","6820":"R.E.I.T.","6831":"Real Estate (Operations & Services)","6832":"Real Estate (Operations & Services)","7211":"Drugs (Biotechnology)","7311":"Advertising","7912":"Hotel/Gaming","8610":"Hospitals/Healthcare Facilities","8621":"Healthcare Support Services","9101":"Education","9311":"Recreation","9312":"Recreation","9319":"Recreation","9329":"Recreation"},"ateco":[["01.11","Coltivazione di cereali, legumi"],["01.13","Coltivazione di ortaggi e meloni"],["01.21","Coltivazione di uva"],["01.41","Allevamento di bovini da latte"],["01.50","Coltivazioni agricole e allevamento (attività mista)"],["02.10","Silvicoltura"],["03.11","Pesca marina"],["05.10","Estrazione di antracite"],["06.10","Estrazione di petrolio greggio"],["06.20","Estrazione di gas naturale"],["08.11","Estrazione di pietre ornamentali"],["10.11","Lavorazione e conservazione di carne"],["10.20","Lavorazione di pesce, crostacei"],["10.31","Lavorazione e conservazione di patate"],["10.32","Produzione di succhi di frutta e di ortaggi"],["10.39","Lavorazione e conservazione di frutta e ortaggi"],["10.41","Produzione di oli e grassi vegetali e animali"],["10.42","Produzione di margarina e di grassi commestibili simili"],["10.51","Lattiero-casearia"],["10.52","Produzione di gelati"],["10.61","Lavorazione delle granaglie"],["10.71","Pane, pasticceria fresca"],["10.72","Produzione di fette biscottate, biscotti, prodotti pasticceria conservati"],["10.73","Produzione di paste alimentari"],["10.81","Produzione di zucchero"],["10.82","Produzione di cacao, cioccolato, caramelle e confetterie"],["10.83","Lavorazione di tè e caffè"],["10.84","Produzione di condimenti e spezie"],["10.85","Pasti e piatti preparati"],["10.86","Produzione di alimenti omogeneizzati e dietetici"],["10.89","Produzione di altri prodotti alimentari nca"],["10.91","Produzione di mangimi per animali da allevamento"],["10.92","Produzione di alimenti per animali domestici"],["11.01","Distillazione, rettifica e miscelatura di alcolici"],["11.02","Vini da uve"],["11.05","Birra"],["11.07","Industria delle bibite analcoliche, acque minerali"],["12.00","Industria del tabacco"],["13.10","Preparazione e filatura fibre tessili"],["13.20","Tessitura"],["13.30","Finissaggio dei tessili"],["13.91","Fabbricazione di tessuti a maglia"],["13.92","Confezionamento di articoli tessili (esclusi gli articoli di vestiario)"],["13.99","Fabbricazione di altri prodotti tessili nca"],["14.11","Confezione di abbigliamento in pelle"],["14.12","Confezione di indumenti da lavoro"],["14.13","Confezione indumenti esterni"],["14.14","Confezione di biancheria intima"],["14.19","Confezione altri articoli di abbigliamento"],["14.31","Fabbricazione di calze, calzini e simili"],["14.39","Fabbricazione di altri articoli di maglieria"],["15.11","Preparazione e concia del cuoio e pelliccia"],["15.12","Fabbricazione di articoli da viaggio, borse e simili in cuoio e simili"],["15.20","Calzature"],["16.10","Taglio e piallatura del legno"],["16.23","Elementi in legno per l'edilizia"],["17.12","Carta e cartone"],["18.12","Altra stampa"],["20.13","Prodotti chimici inorganici"],["20.30","Pitture, vernici, smalti"],["20.41","Saponi e detergenti"],["20.59","Altri prodotti chimici"],["21.10","Prodotti farmaceutici di base"],["21.20","Medicinali e preparati farmaceutici"],["22.11","Pneumatici e camere d'aria"],["22.21","Lastre, fogli, tubi in plastica"],["22.29","Altri articoli in plastica"],["23.11","Vetro piano"],["23.51","Cemento"],["23.61","Prodotti in calcestruzzo per edilizia"],["24.10","Siderurgia"],["24.20","Tubi, condotti, profilati in acciaio"],["25.11","Strutture metalliche e parti"],["25.62","Lavori di meccanica generale"],["26.11","Componenti elettronici"],["26.20","Computer e periferiche"],["26.30","Apparecchi per telecomunicazioni"],["26.51","Strumenti di misurazione"],["27.11","Motori, generatori, trasformatori elettrici"],["27.51","Elettrodomestici"],["28.11","Motori e turbine"],["28.30","Macchine per agricoltura"],["28.41","Macchine utensili (formatura metalli)"],["28.99","Altre macchine per impieghi speciali"],["29.10","Autoveicoli"],["29.32","Parti e accessori per autoveicoli"],["30.30","Aeromobili e veicoli spaziali"],["31.01","Mobili per ufficio e negozi"],["31.09","Altri mobili"],["32.50","Strumenti e forniture mediche"],["33.12","Riparazione di macchinari"],["33.20","Installazione macchine industriali"],["35.11","Produzione di energia elettrica"],["35.14","Commercio di energia elettrica"],["35.21","Produzione di gas"],["36.00","Raccolta, trattamento e fornitura acqua"],["37.00","Gestione reti fognarie"],["38.11","Raccolta rifiuti non pericolosi"],["38.32","Recupero per riciclaggio materiale metallico"],["41.10","Sviluppo progetti immobiliari (senza costruzione)"],["41.20","Costruzione edifici"],["42.11","Costruzione strade, autostrade"],["42.21","Opere per trasporto fluidi"],["43.21","Installazione impianti elettrici"],["43.22","Impianti idraulici, riscaldamento, condizionamento"],["43.34","Tinteggiatura, posa vetri"],["45.11","Commercio autovetture"],["45.20","Manutenzione e riparazione autoveicoli"],["45.32","Commercio al dettaglio parti auto"],["46.18","Intermediari del commercio specializzati"],["46.31","Commercio all'ingrosso frutta e ortaggi"],["46.46","Commercio all'ingrosso prodotti farmaceutici"],["46.49","Commercio all'ingrosso altri beni di consumo"],["46.51","Commercio all'ingrosso computer e software"],["46.69","Commercio all'ingrosso altre macchine"],["46.90","Commercio all'ingrosso non specializzato"],["47.11","Commercio al dettaglio non specializzato (alimentari, supermercati)"],["47.19","Commercio al dettaglio non specializzato"],["47.30","Commercio al dettaglio carburanti"],["47.42","Commercio al dettaglio telecomunicazioni"],["47.71","Commercio al dettaglio abbigliamento"],["47.91","Commercio al dettaglio online (e-commerce)"],["49.20","Trasporto ferroviario merci"],["49.41","Trasporto merci su strada"],["50.10","Trasporto marittimo passeggeri"],["51.10","Trasporto aereo passeggeri"],["52.10","Magazzinaggio e custodia"],["52.29","Altre attività di supporto ai trasporti"],["53.10","Poste nazionali"],["53.20","Altre attività postali e di corriere"],["55.10","Alberghi"],["55.20","Alloggi per vacanze e brevi soggiorni (B&B, case vacanze, residence)"],["55.30","Aree di campeggio e aree attrezzate per camper e roulotte"],["55.90","Altri alloggi (foresterie, alloggi universitari)"],["56.10","Ristoranti, attività di ristorazione mobile"],["56.21","Catering per eventi, banqueting"],["56.29","Mense, catering continuativo su base contrattuale"],["56.30","Bar e altri esercizi simili senza cucina"],["58.11","Edizione di libri"],["58.13","Edizione di quotidiani"],["58.21","Edizione di giochi per computer"],["58.29","Edizione di altro software"],["59.11","Produzione cinematografica, video, TV"],["60.20","Programmazione e trasmissione TV"],["61.10","Telecomunicazioni fisse"],["61.20","Telecomunicazioni mobili"],["62.01","Produzione software"],["62.02","Consulenza IT"],["62.03","Gestione strutture informatizzate"],["62.09","Altre attività IT"],["63.11","Elaborazione dati, hosting"],["63.12","Portali web"],["64.11","Banca Centrale"],["64.19","Banche commerciali"],["64.20","Holding"],["64.30","Società fiduciarie, fondi"],["64.91","Leasing finanziario"],["65.11","Assicurazioni vita"],["65.12","Assicurazioni non vita"],["66.12","Negoziazione titoli e merci"],["66.19","Altre attività ausiliarie finanziarie"],["66.30","Gestione di fondi (asset management)"],["68.10","Compravendita immobili"],["68.20","Affitto e gestione immobili propri"],["68.31","Mediazione immobiliare"],["68.32","Gestione immobili per conto terzi"],["69.10","Studi legali"],["69.20","Contabilità, revisione, consulenza fiscale"],["70.10","Holding (gestione imprese)"],["70.22","Consulenza imprenditoriale, gestionale"],["71.11","Studi di architettura"],["71.12","Studi di ingegneria"],["71.20","Collaudi e analisi tecniche"],["72.11","R&D biotecnologie"],["72.19","R&D scienze naturali"],["73.11","Agenzie pubblicitarie"],["73.12","Concessionarie pubblicitarie"],["73.20","Ricerche di mercato"],["74.10","Attività di design"],["74.20","Attività fotografiche"],["74.30","Traduzione e interpretariato"],["74.90","Altre attività professionali"],["77.11","Noleggio autovetture"],["77.39","Noleggio macchine, attrezzature"],["78.10","Agenzie di collocamento"],["78.20","Agenzie di lavoro interinale"],["79.11","Agenzie di viaggio"],["79.12","Tour operator"],["80.10","Servizi di vigilanza privata"],["81.21","Pulizia generale edifici"],["82.11","Servizi integrati di supporto uffici"],["82.99","Altri servizi di sostegno imprese"],["85.10","Istruzione prescolastica"],["85.32","Istruzione secondaria tecnica"],["85.42","Istruzione universitaria"],["86.10","Servizi ospedalieri"],["86.21","Studi medici di medicina generale"],["86.22","Studi medici specialistici"],["86.23","Studi odontoiatrici"],["87.10","Assistenza infermieristica residenziale"],["87.30","Assistenza residenziale anziani e disabili"],["90.01","Rappresentazioni artistiche"],["90.04","Teatri e sale da concerto"],["91.02","Musei"],["92.00","Lotterie, scommesse, case da gioco"],["93.11","Impianti sportivi"],["93.12","Club sportivi (società sportive professionistiche)"],["93.13","Palestre"],["93.21","Parchi di divertimento"],["93.29","Altre attività ricreative"],["94.11","Organizzazioni economiche, datori di lavoro"],["95.11","Riparazione computer e periferiche"],["95.22","Riparazione elettrodomestici"],["96.01","Lavaggio articoli tessili"],["96.02","Parrucchieri, trattamenti estetici"]],"rf":{"btp10":0.03505,"btp5":0.02883,"btp20":0.03932,"fonte":"Rendistato Banca d’Italia, dicembre 2025 (titoli da 8 anni e 7 mesi a 12 anni e 6 mesi)"}};
