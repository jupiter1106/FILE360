const DocRead = (() => {
  // testo e righe di tutte le pagine; le pagine senza testo passano dall'OCR
  async function pages(doc, { getWorker = null, onPage = () => {}, alive = () => true, dpi = 300 } = {}) {
    const out = [];
    for (let p = 1; p <= doc.numPages && alive(); p++) {
      const page = await doc.pdfjs.getPage(p), vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      let items = DocFields.itemsFromPdf(tc, vp), ocr = false;
      // pagina mista (scansione con testo aggiunto dopo): si legge anche la scansione, il testo del PDF resta com'è
      const few = items.map(i => i.str).join('').replace(/\s/g, '').length < 20, mixed = !few && getWorker && (await PageText.kind(doc.pdfjs, p)).kind === 'mixed';
      if ((few || mixed) && getWorker && typeof Tesseract !== 'undefined') {
        onPage(p, true);
        try {
          const rec = await ocrRecognizePage(await getWorker(), doc.pdfjs, p, { dpi, auto: true, fix: true, langs: new Set(['ita']) });
          const k = vp.width / (rec.r.canvas.width || vp.width * dpi / 72);
          const read = (rec.data.lines || []).flatMap(l => (l.words || []).filter(w => (w.text || '').trim() && w.bbox && (w.confidence ?? 100) >= 30)
            .map(w => ({ str: w.text, x0: w.bbox.x0 * k, x1: w.bbox.x1 * k, y0: w.bbox.y0 * k, y1: w.bbox.y1 * k })));
          items = mixed ? [...items, ...read.filter(w => !PageText.covered(items, w.x0, w.y0, w.x1, w.y1))] : read;
          rec.r.canvas.width = 0; rec.prep?.release?.(); ocr = true;
        } catch (e) { console.warn(e); }
      }
      const lines = DocFields.layout({ items, height: vp.height });
      lines.forEach((L, i) => { L.i = i; L.p = p; });
      out.push({ p, w: vp.width, h: vp.height, lines, text: lines.map(L => L.text).join('\n'), ocr });
      onPage(p, false);
    }
    return out;
  }
  // i pezzi di una riga, parola per parola, con la posizione stimata (per le colonne)
  function tokens(L) {
    const out = [];
    for (const c of L.cells) {
      const parts = c.text.split(/(\s+)/), len = c.text.length || 1; let at = 0;
      for (const part of parts) { if (part.trim()) out.push({ t: part, x0: c.x0 + (c.x1 - c.x0) * at / len, x1: c.x0 + (c.x1 - c.x0) * (at + part.length) / len, cell: c }); at += part.length; }
    }
    return out;
  }
  const boxOf = (L, x0 = null, x1 = null) => ({ p: L.p, x0: x0 ?? Math.min(...L.cells.map(c => c.x0)), x1: x1 ?? Math.max(...L.cells.map(c => c.x1)), y0: L.y - L.size * 1.05, y1: L.y + L.size * 0.3 });
  // importo: «1.234,56», «-1.234,56», «1.234,56-», «€ 12,00», «1,234.56»; null se non è un importo
  function amt(s0, { ints = false } = {}) {
    let s = String(s0 ?? '').trim().replace(/^(?:€|eur(?:o)?)\s*/i, '').replace(/\s*(?:€|eur(?:o)?)$/i, '').trim(), neg = false;
    if (/^[-−–]/.test(s)) { neg = true; s = s.slice(1).trim(); } else if (/^\+/.test(s)) s = s.slice(1).trim();
    if (/[-−–]$/.test(s)) { neg = true; s = s.slice(0, -1).trim(); }
    let v = null;
    if (/^\d{1,3}(?:[.'\s]\d{3})*,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) v = +s.replace(/[.'\s]/g, '').replace(',', '.');
    else if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(s) || /^\d+\.\d{2}$/.test(s)) v = +s.replace(/,/g, '');
    else if (ints && (/^\d{1,3}(?:\.\d{3})+$/.test(s) || /^\d{1,9}$/.test(s))) v = +s.replace(/\./g, '');
    return v == null ? null : neg ? -v : v;
  }
  const pad = n => String(n).padStart(2, '0');
  function dateOf(s, year = null) {
    s = String(s || '').trim();
    let m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})$/.exec(s);
    if (m) { let y = +m[3]; if (y < 100) y += y > 60 ? 1900 : 2000; const d = +m[1], mo = +m[2]; return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${y}-${pad(mo)}-${pad(d)}` : null; }
    m = /^(\d{1,2})[\/.](\d{1,2})$/.exec(s);
    if (m && year) { const d = +m[1], mo = +m[2]; return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${year}-${pad(mo)}-${pad(d)}` : null; }
    return null;
  }
  const dateIt = iso => iso ? iso.split('-').reverse().join('/') : '';
  const fmt = v => v == null ? '' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  // tipo di documento dal testo delle prime pagine
  function detect(pg) {
    const t = pg.slice(0, 3).map(x => x.text).join('\n'), T = t.toUpperCase(), sc = {};
    const add = (k, re, w = 1) => { const n = (t.match(re) || []).length; if (n) sc[k] = (sc[k] || 0) + Math.min(n, 6) * w; };
    add('banca', /estratto (di )?conto|saldo (iniziale|finale|contabile|precedente|disponibile)|data valuta|\bvaluta\b|\bdare\b|\bavere\b|addebit|accredit|movimenti/gi, 2);
    add('banca', /\bIBAN\b|\bBIC\b|conto corrente/gi);
    add('f24', /modello (di pagamento )?(unificato )?f24|codice tributo|sezione erario|delega irrevocabile|importi a (debito|credito)|causale contributo|sezione inps|tributi locali/gi, 3);
    add('dich', /certificazione unica|modello 730|730-3|redditi (20\d\d )?(persone fisiche|società|enti)|dichiarazione (iva|irap)|\bquadro [A-Z]{2}\b|prospetto di liquidazione|periodo d['’]imposta/gi, 3);
    add('camerale', /visura (ordinaria|camerale|storica)|registro (delle )?imprese|camera di commercio|numero rea|\bREA\b|forma giuridica|capitale sociale|oggetto sociale/gi, 3);
    add('catasto', /visura (attuale )?(per immobile|per soggetto|catastale)|immobile di catasto (fabbricati|terreni)|catasto (fabbricati|terreni)|agenzia (delle )?entrate.*territorio|rendita|particella|\bfoglio\b|zona cens|categoria [A-F]\/\d/gi, 3);
    add('lab', /esami? (di )?laboratorio|referto|valori di riferimento|unit[aà] di misura|emocromo|glucosio|colesterolo|creatinina|emoglobina|\bmg\/dl\b|g\/dl|u\/l\b|ui\/l|leucociti|piastrine/gi, 3);
    if (/CODICE TRIBUTO|SEZIONE ERARIO/.test(T) && /F24/.test(T)) sc.f24 = (sc.f24 || 0) + 3;
    const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 4 ? best[0] : null;
  }
  // anteprima della pagina con il dato evidenziato (per controllare a colpo d'occhio)
  async function showOnPage(doc, box, title = '') {
    if (!box) return;
    const r = await renderPageCanvas(doc.pdfjs, box.p, 110, { maxPixels: 6e6 }), c = r.canvas, k = r.scale;
    const pad = 3, g = c.getContext('2d');
    g.save(); g.fillStyle = 'rgba(255, 194, 52, .28)'; g.strokeStyle = '#E8246A'; g.lineWidth = Math.max(2, 2 * k / 1.5);
    g.fillRect((box.x0 - pad) * k, (box.y0 - pad) * k, (box.x1 - box.x0 + 2 * pad) * k, (box.y1 - box.y0 + 2 * pad) * k);
    g.strokeRect((box.x0 - pad) * k, (box.y0 - pad) * k, (box.x1 - box.x0 + 2 * pad) * k, (box.y1 - box.y0 + 2 * pad) * k); g.restore();
    const img = h('div', { class: 'dr-pv' }, c);
    modal([h('h3', {}, title || `Pagina ${box.p}`), h('p', { class: 'muted small' }, `Pagina ${box.p} di ${doc.numPages} · il dato è evidenziato in giallo`), img], { width: 860, cls: 'dr-modal', onClose: () => { c.width = 0; } });
    requestAnimationFrame(() => { img.scrollTop = Math.max(0, (box.y0 * k) * (img.clientWidth / c.width) - 120); });
  }
  return { pages, tokens, boxOf, amt, dateOf, dateIt, fmt, detect, showOnPage };
})();

/* ---------- estratto conto: movimenti con data, valuta, descrizione, entrate, uscite, saldo ---------- */
const BankRead = (() => {
  const { tokens, boxOf, amt, dateOf } = DocRead;
  const HEAD = [['data', /^data(\s*(contabile|cont\.?|operazione|oper\.?|op\.?|reg\.?|registrazione|mov\.?))?$|^contabile$/i], ['valuta', /^(data\s*)?valuta$|^val\.?$/i],
    ['desc', /descrizione|causale|operazion[ei]|dettagli|movimento|^motivazione/i], ['out', /^(dare|addebiti?|uscite|pagamenti|importi? (in )?uscita|importi? dare|debiti|prelievi)$/i],
    ['in', /^(avere|accrediti?|entrate|versamenti|importi? (in )?entrata|importi? avere|crediti)$/i], ['amt', /^importo(\s*(eur|€|in euro))?$|^ammontare$/i], ['bal', /^saldo(\s*(contabile|progressivo|disponibile))?$/i]];
  const SKIP = /^(saldo (iniziale|finale|precedente|contabile|disponibile|al)|totale|totali|riporto|a riportare|riportato|pagina \d|pag\.? \d|segue|continua|estratto conto|elenco movimenti)/i;
  const TIPI = [
    ['F24 e tributi', /\bf24\b|delega|tribut|agenzia (delle )?entrate|inps\b|pagopa|imposta (di registro|sostitutiva)/i],
    ['Stipendio o pensione', /stipendi|emolument|pension|cedolin|retribuz|competenze mese/i],
    ['Addebito diretto (SDD)', /\bsdd\b|addebito diretto|addebito sepa|\brid\b|mandato|core direct debit/i],
    ['Carta / POS', /\bpos\b|pagamento carta|carta (di )?(debito|credito)|pagobancomat|contactless|apple ?pay|google ?pay|acquisto/i],
    ['Prelievo', /prelev|\batm\b|bancomat/i],
    ['Commissioni e spese', /commission|spese|canone|imposta di bollo|\bbollo\b|competenze di chiusura|oneri/i],
    ['Interessi', /interess/i],
    ['Assegno', /assegn/i],
    ['Giroconto', /giroconto|giro conto|trasferimento tra/i],
    ['Bonifico', /bonific|\bbon\.|sepa credit|\bsct\b|\binst\b|disposizione|trn|cro\b/i],
    ['Utenze', /enel|\beni\b|a2a|hera|iren|acea|\btim\b|vodafone|fastweb|wind|iliad|bollett|utenz/i],
  ];
  const tipoOf = (d, v) => { for (const [t, re] of TIPI) if (re.test(d)) return t === 'Bonifico' ? (v > 0 ? 'Bonifico in entrata' : 'Bonifico in uscita') : t; return ''; };
  const CP = /(?:a favore (?:di|del|della)?|a fav\.?|favore|beneficiario|\bben(?:ef)?\.?:?|ordinante|\bord(?:\.|:)|disposto da|\bda:|\bpresso|\bda (?=[A-Z]{2,}))\s*:?\s*([A-Z0-9][A-Za-zÀ-ÿ0-9&'’.\- ]{2,60}?)(?=\s+(?:causale|rif|ric\.?|cro|trn|id|mandato|data|iban|bic|per)\b|[,;]|\s{2}|$)/i;
  function parse(pg) {
    const all = pg.flatMap(x => x.lines), txt = pg.map(x => x.text).join('\n');
    // anno per le date senza anno (dal periodo del documento)
    const yHint = (() => { const m = /(?:al|fino al|periodo[^\n]{0,40}?)\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-](\d{4}))/i.exec(txt) || /(\d{1,2}[\/.\-]\d{1,2}[\/.\-](20\d\d))/.exec(txt); return m ? +m[2] : new Date().getFullYear(); })();
    let cols = null; const rows = []; let ini = null, fin = null, warn = new Set();
    const isHeader = L => { const t = tokens(L), found = {}; for (const c of L.cells) for (const [k, re] of HEAD) { const parts = c.text.split(/\s{2,}|\s(?=data\b|valuta\b|descrizione\b|dare\b|avere\b|saldo\b|importo\b|entrate\b|uscite\b|addebiti\b|accrediti\b)/i); let at = 0; for (const part of parts) { const s = c.text.indexOf(part, at); at = s + part.length; if (re.test(part.trim()) && !found[k]) { const len = c.text.length || 1; found[k] = { x0: c.x0 + (c.x1 - c.x0) * s / len, x1: c.x0 + (c.x1 - c.x0) * (s + part.length) / len }; } } } void t;
      const n = Object.keys(found).length; return n >= 3 && (found.out || found.in || found.amt) ? found : null; };
    const amtCols = () => cols ? Object.entries(cols).filter(([k]) => ['out', 'in', 'amt', 'bal'].includes(k)) : [];
    const colOf = tk => { const list = amtCols(); if (!list.length) return null; const cx = tk.x1; let best = null, bd = Infinity; for (const [k, r] of list) { const d = Math.min(Math.abs(cx - r.x1), Math.abs((tk.x0 + tk.x1) / 2 - (r.x0 + r.x1) / 2)); if (d < bd) { bd = d; best = k; } } return best; };
    let last = null;
    for (const L of all) {
      const head = isHeader(L); if (head) { cols = head; continue; }
      const t = L.text.trim(), tks = tokens(L);
      const sal = /saldo\s*(iniziale|precedente|contabile iniziale|di apertura|riportato|al\s+\d)/i.exec(t), salF = /saldo\s*(finale|contabile finale|di chiusura|contabile$|disponibile finale)/i.exec(t);
      if ((sal || salF) && !dateOf(tks[0]?.t || '', yHint)) {
        const am = tks.map(k => ({ k, v: amt(k.t) })).filter(x => x.v != null); if (!am.length) continue;
        const a = am[am.length - 1]; let v = a.v; const col = colOf(a.k); if (col === 'out' && v > 0) v = -v; if (/\b(debitore|a debito|negativo)\b/i.test(t) && v > 0) v = -v;
        const isFin = salF || (sal && /saldo\s*al/i.test(t) && rows.length);
        if (isFin) fin = { v, box: boxOf(L) }; else if (!rows.length && ini == null) ini = { v, box: boxOf(L) };
        continue;
      }
      // date all'inizio della riga (contabile e valuta)
      const dates = []; let k = 0;
      while (k < tks.length && dates.length < 2) { const d = dateOf(tks[k].t, yHint); if (!d) break; dates.push(d); k++; }
      const amts = [], text = [];
      for (let j = k; j < tks.length; j++) {
        const tk = tks[j]; let v = amt(tk.t);
        // «1.234 56» (euro e centesimi in due caselle)
        if (v == null && /^\d{1,3}(?:\.\d{3})*$/.test(tk.t) && /^\d{2}$/.test(tks[j + 1]?.t || '') && tks[j + 1].x0 - tk.x1 < 14) { v = amt(tk.t + ',' + tks[j + 1].t); if (v != null) { amts.push({ v, tk: { ...tk, x1: tks[j + 1].x1 } }); j++; continue; } }
        const zone = amtCols().length ? Math.min(...amtCols().map(([, r]) => r.x0)) - 6 : -Infinity, inAmtZone = tk.x1 >= zone;
        if (v != null && inAmtZone && (j >= tks.length - 4)) amts.push({ v, tk }); else if (!dateOf(tk.t) || text.length) text.push(tk.t);
      }
      if (dates.length && (amts.length || text.length)) {
        if (SKIP.test(text.join(' '))) continue;
        const r = { date: dates[0], val: dates[1] || null, desc: text.join(' '), out: null, in: null, amt: null, bal: null, box: boxOf(L), sure: true };
        for (const a of amts) { const c = colOf(a.tk); if (c === 'out') r.out = Math.abs(a.v); else if (c === 'in') r.in = Math.abs(a.v); else if (c === 'bal') r.bal = a.v; else if (c === 'amt') r.amt = a.v; else if (r.amt == null) r.amt = a.v; else r.bal = a.v; }
        if (!cols && amts.length >= 2 && r.bal == null) { r.bal = amts[amts.length - 1].v; r.amt = amts[amts.length - 2].v; }
        rows.push(r); last = r; continue;
      }
      // seguito della descrizione sulla riga sotto
      if (last && !dates.length && text.length && !amts.length && !SKIP.test(t) && L.y - last.box.y1 < L.size * 3.2 && L.p === last.box.p) { last.desc += ' ' + text.join(' '); last.box.y1 = L.y + L.size * 0.3; continue; }
      if (last && (L.p !== last.box.p || L.y - last.box.y1 >= L.size * 3.2)) last = null;
    }
    // segno: colonna Dare/Avere; altrimenti segno dell'importo; altrimenti differenza dei saldi; altrimenti dalle parole (da controllare)
    let prevBal = ini?.v ?? null;
    for (const r of rows) {
      if (r.out != null || r.in != null) r.v = (r.in || 0) - (r.out || 0);
      else if (r.amt != null && r.amt < 0) r.v = r.amt;
      else if (r.amt != null && prevBal != null && r.bal != null && Math.abs(Math.abs(r.bal - prevBal) - Math.abs(r.amt)) < 0.005) r.v = r.bal - prevBal;
      else if (r.amt != null) {
        const minus = /addebit|pagament|prelev|commission|spese|bollo|canone|disposizione|a favore|\bpos\b|acquisto|\bsdd\b|f24|utenz/i.test(r.desc), plus = /accredit|versament|stipend|emolument|pension|bonifico (da|a vostro favore)|ricevut|incasso|interessi creditori|\bda\s+[A-Z]/i.test(r.desc);
        r.v = minus && !plus ? -Math.abs(r.amt) : Math.abs(r.amt); r.sure = minus !== plus; if (!r.sure) warn.add('segno');
      } else r.v = 0;
      if (r.bal != null) prevBal = r.bal; else if (prevBal != null) prevBal = Math.round((prevBal + r.v) * 100) / 100;
      r.tipo = tipoOf(r.desc, r.v); r.cp = (CP.exec(r.desc)?.[1] || '').trim();
    }
    // controlli
    const sum = Math.round(rows.reduce((t, r) => t + r.v, 0) * 100) / 100, inS = rows.reduce((t, r) => t + (r.v > 0 ? r.v : 0), 0), outS = rows.reduce((t, r) => t + (r.v < 0 ? -r.v : 0), 0);
    const checks = [];
    if (ini && fin) { const diff = Math.round((ini.v + sum - fin.v) * 100) / 100; checks.push(Math.abs(diff) < 0.01 ? { ok: true, msg: `I conti tornano: saldo iniziale ${DocRead.fmt(ini.v)} + movimenti ${DocRead.fmt(sum)} = saldo finale ${DocRead.fmt(fin.v)}.` } : { ok: false, msg: `I conti non tornano di ${DocRead.fmt(diff)} €: saldo iniziale ${DocRead.fmt(ini.v)} + movimenti ${DocRead.fmt(sum)} ≠ saldo finale ${DocRead.fmt(fin.v)}. Controlla i movimenti evidenziati o le righe su più pagine.` }); }
    else checks.push({ ok: null, msg: ini || fin ? 'Nel documento c’è solo uno dei due saldi: il totale dei movimenti non si può verificare.' : 'Saldo iniziale e finale non trovati: il totale dei movimenti non si può verificare.' });
    let runBad = 0; { let pb = ini?.v ?? null; for (const r of rows) { if (r.bal != null && pb != null && Math.abs(pb + r.v - r.bal) > 0.009) { runBad++; r.flag = 'saldo'; } if (r.bal != null) pb = r.bal; else if (pb != null) pb += r.v; } }
    if (runBad) checks.push({ ok: false, msg: `${plural(runBad, 'movimento ha', 'movimenti hanno')} un saldo progressivo che non torna: sono evidenziati.` });
    if (warn.has('segno')) checks.push({ ok: null, msg: `${plural(rows.filter(r => !r.sure).length, 'movimento ha', 'movimenti hanno')} il segno dedotto dalla descrizione: controllali (in giallo).` });
    const iban = (txt.match(/\bIT\s?\d{2}\s?[A-Z]\s?(?:\d\s?){10}(?:[A-Z0-9]\s?){12}/g) || []).map(s => s.replace(/\s/g, '')).find(s => EpcQr.ibanValid(s)) || '';
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    return { kind: 'banca', rows, ini: ini?.v ?? null, fin: fin?.v ?? null, sum, inS, outS, checks, iban, from: dates[0] || '', to: dates[dates.length - 1] || '', ok: rows.length > 0 };
  }
  return { parse, tipoOf };
})();

/* ---------- F24: una riga per ogni tributo, con sezione, codice, riferimento, anno, debito e credito ---------- */
const F24Read = (() => {
  const { tokens, boxOf, amt, dateOf } = DocRead;
  // descrizioni dei codici più usati (le altre restano vuote: il codice è sempre riportato)
  const COD = {
    '1001': 'Ritenute su retribuzioni, pensioni e trasferte', '1012': 'Ritenute su indennità di fine rapporto', '1019': 'Ritenute 4% condominio (IRPEF)', '1020': 'Ritenute 4% condominio (IRES)',
    '1038': 'Ritenute su provvigioni', '1040': 'Ritenute su redditi di lavoro autonomo', '1627': 'Eccedenza di versamenti di ritenute', '1631': 'Credito d’imposta rimborsato (730)',
    '1668': 'Interessi per pagamento rateale', '1712': 'Imposta sostitutiva rivalutazione TFR - acconto', '1713': 'Imposta sostitutiva rivalutazione TFR - saldo',
    '1840': 'Cedolare secca - acconto prima rata', '1841': 'Cedolare secca - acconto seconda rata o unica', '1842': 'Cedolare secca - saldo',
    '1989': 'Interessi ravvedimento IRPEF', '1990': 'Interessi ravvedimento IRES', '2001': 'IRES - acconto prima rata', '2002': 'IRES - acconto seconda rata o unica', '2003': 'IRES - saldo',
    '3800': 'IRAP - saldo', '3801': 'Addizionale regionale IRPEF', '3802': 'Addizionale regionale IRPEF trattenuta dal sostituto', '3812': 'IRAP - acconto prima rata', '3813': 'IRAP - acconto seconda rata o unica',
    '3843': 'Addizionale comunale IRPEF - acconto (autotassazione)', '3844': 'Addizionale comunale IRPEF - saldo (autotassazione)', '3847': 'Addizionale comunale IRPEF trattenuta dal sostituto - acconto', '3848': 'Addizionale comunale IRPEF trattenuta dal sostituto - saldo',
    '3850': 'Diritto annuale camera di commercio', '3912': 'IMU - abitazione principale e pertinenze', '3914': 'IMU - terreni', '3916': 'IMU - aree fabbricabili', '3918': 'IMU - altri fabbricati',
    '3925': 'IMU - immobili gruppo D (Stato)', '3930': 'IMU - immobili gruppo D (incremento Comune)', '3944': 'TARI', '4001': 'IRPEF - saldo', '4033': 'IRPEF - acconto prima rata', '4034': 'IRPEF - acconto seconda rata o unica',
    '6001': 'IVA - gennaio', '6002': 'IVA - febbraio', '6003': 'IVA - marzo', '6004': 'IVA - aprile', '6005': 'IVA - maggio', '6006': 'IVA - giugno', '6007': 'IVA - luglio', '6008': 'IVA - agosto',
    '6009': 'IVA - settembre', '6010': 'IVA - ottobre', '6011': 'IVA - novembre', '6012': 'IVA - dicembre', '6013': 'IVA - acconto mensile', '6031': 'IVA - primo trimestre', '6032': 'IVA - secondo trimestre',
    '6033': 'IVA - terzo trimestre', '6034': 'IVA - quarto trimestre', '6035': 'IVA - acconto trimestrale', '6099': 'IVA - saldo annuale', '8904': 'Sanzione IVA', '8906': 'Sanzione sostituti d’imposta',
    'DM10': 'Contributi lavoratori dipendenti', 'AF': 'Artigiani - contributi fissi', 'CF': 'Commercianti - contributi fissi', 'AP': 'Artigiani - contributi eccedenti il minimale', 'CP': 'Commercianti - contributi eccedenti il minimale',
    'CXX': 'Gestione separata - committenti', 'PXX': 'Gestione separata - professionisti',
  };
  const SECT = [['Erario', /sezione erario|\berario\b/i], ['INPS', /sezione inps|\binps\b(?!.*codice fiscale)/i], ['Regioni', /sezione regioni|\bregioni\b/i], ['IMU e tributi locali', /imu e altri tributi locali|tributi locali|sezione imu/i], ['INAIL', /\binail\b/i], ['Altri enti', /altri enti previdenziali/i]];
  const CAUS = /^(DM10|CXX|PXX|C10|AF|CF|AP|CP|AFR|CFR|APR|CPR|P10|LAA|RC01|EBNA|CPI|ACOR|DPC)$/;
  function parse(pg) {
    const txt = pg.map(x => x.text).join('\n'), rows = []; let sect = 'Erario', dc = null, saldo = null, totals = [];
    const cfs = PiiKit.cfsOf ? [...PiiKit.cfsOf(txt)] : [];
    const piva = (txt.match(/\b\d{11}\b/g) || []).find(x => PiiKit.pivaValid(x)) || '';
    const cfc = cfs[0] || piva;
    const dataV = (() => { const m = /data\s*(?:del\s*)?(?:versamento|pagamento|addebito|operazione|esecuzione)[^\d]{0,30}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(txt) || /estremi del versamento[\s\S]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(txt); return m ? dateOf(m[1]) : ''; })();
    const nome = (() => { for (const P of pg) for (const [i, L] of P.lines.entries()) if (/cognome,?\s*denominazione|ragione sociale/i.test(L.text)) { const n = P.lines[i + 1]; if (n && !/codice|dati anagrafici|nome/i.test(n.cells[0]?.text || '')) return n.cells[0].text; } return ''; })();
    for (const P of pg) for (const L of P.lines) {
      const t = L.text;
      for (const [s, re] of SECT) if (re.test(t) && t.length < 80 && !/\d{2},\d{2}/.test(t)) sect = s;
      if (/importi?\s*a\s*debito/i.test(t) && /credito/i.test(t)) { const tk = tokens(L), d = tk.find(k => /debito/i.test(k.t)), c = tk.find(k => /credito/i.test(k.t)); if (d && c) dc = { d: d.x1 + 10, c: c.x1 + 10 }; }
      if (/saldo\s*(finale|delega)|^\s*euro\s*\+|saldo\s*\(a\s*-\s*b\)/i.test(t)) { const v = tokens(L).map(k => amt(k.t)).filter(v => v != null).pop(); if (v != null && /finale|delega|euro/i.test(t)) saldo = { v, box: boxOf(L) }; continue; }
      if (/^\s*totale/i.test(t)) { const vs = tokens(L).map(k => amt(k.t)).filter(v => v != null); if (vs.length) totals.push({ sect, d: vs[0], c: vs[1] ?? 0 }); continue; }
      // importi in coda (anche «1.234 56» in due caselle)
      const tk = tokens(L), vals = [];
      for (let j = 0; j < tk.length; j++) { let v = amt(tk[j].t); if (v == null && /^\d{1,3}(?:\.\d{3})*$/.test(tk[j].t) && /^\d{2}$/.test(tk[j + 1]?.t || '')) { v = amt(tk[j].t + ',' + tk[j + 1].t); if (v != null) { vals.push({ v, x: tk[j + 1].x1, j }); j++; continue; } } if (v != null) vals.push({ v, x: tk[j].x1, j }); }
      if (!vals.length) continue;
      const head = tk.slice(0, vals[0].j).map(k => k.t), H = head.join(' ');
      if (!head.length || /totale|saldo|euro|importi|codice|sezione/i.test(H)) continue;
      const year = head.find(x => /^(19|20)\d\d$/.test(x)) || '';
      let r = null;
      if (/^[A-Z]\d{3}$/.test(head[0])) { // IMU e tributi locali: codice comune
        const code = head.slice(1).find(x => /^\d{4}$/.test(x) && x !== year) || ''; const after = head.slice(head.indexOf(code) + 1).filter(x => x !== year);
        r = { sect: 'IMU e tributi locali', code, ente: head[0], rif: after.find(x => /^\d{4}$/.test(x)) || '', year };
      } else if (head.some(x => CAUS.test(x)) || head.some(x => /^\d{2}\/\d{4}$/.test(x))) { // INPS
        const caus = head.find(x => CAUS.test(x)) || ''; const per = head.filter(x => /^\d{2}\/\d{4}$/.test(x));
        r = { sect: 'INPS', code: caus, ente: head[0] !== caus ? head[0] : '', rif: per.join(' - '), year: per.length ? per[per.length - 1].slice(3) : year, matr: head.filter(x => x !== caus && x !== head[0] && !per.includes(x)).join(' ') };
      } else if (/^\d{2}$/.test(head[0]) && /^38\d\d$/.test(head[1] || '')) { // Regioni
        r = { sect: 'Regioni', code: head[1], ente: head[0], rif: head.slice(2).find(x => /^\d{4}$/.test(x) && x !== year) || '', year };
      } else if (/^[0-9]{4}$|^[A-Z0-9]{4}$/.test(head[0]) && (year || COD[head[0]])) { // Erario
        r = { sect: sect === 'INPS' || sect === 'INAIL' ? 'Erario' : sect === 'Regioni' || sect === 'IMU e tributi locali' ? sect : 'Erario', code: head[0], ente: '', rif: head.slice(1).find(x => /^\d{4}$/.test(x) && x !== year) || '', year };
      } else if (sect === 'INAIL' && /^\d{5}$/.test(head[0])) r = { sect: 'INAIL', code: head[head.length - 1], ente: head[0], rif: head.slice(1, -1).join(' '), year: '' };
      if (!r) continue;
      // debito o credito: dalla colonna, altrimenti dall'ordine
      let d = 0, c = 0;
      if (dc && vals.length === 1) { const x = vals[0].x; if (Math.abs(x - dc.c) < Math.abs(x - dc.d)) c = vals[0].v; else d = vals[0].v; }
      else { d = vals[0].v; c = vals[1]?.v || 0; }
      rows.push({ ...r, descr: COD[r.code] || '', d, c, box: boxOf(L) });
    }
    const D = rows.reduce((t, r) => t + r.d, 0), C = rows.reduce((t, r) => t + r.c, 0), S = Math.round((D - C) * 100) / 100, checks = [];
    if (saldo) checks.push(Math.abs(S - saldo.v) < 0.01 ? { ok: true, msg: `I conti tornano: debiti ${DocRead.fmt(D)} − crediti ${DocRead.fmt(C)} = saldo finale ${DocRead.fmt(saldo.v)}.` } : { ok: false, msg: `Il saldo non torna: debiti − crediti = ${DocRead.fmt(S)} €, ma il saldo finale scritto è ${DocRead.fmt(saldo.v)} €. Controlla le righe.` });
    else checks.push({ ok: null, msg: `Saldo finale non trovato nel documento: debiti − crediti = ${DocRead.fmt(S)} €.` });
    return { kind: 'f24', rows, cf: cfc, nome, dataV, D, C, S, saldo: saldo?.v ?? null, checks, ok: rows.length > 0 };
  }
  return { parse, COD };
})();

/* ---------- dichiarazioni (CU, 730, Redditi, IRAP, IVA): ogni rigo con quadro, colonna, descrizione e valore ---------- */
const DichRead = (() => {
  const { tokens, boxOf, amt } = DocRead;
  const MODELS = [['CU', /certificazione unica/i], ['730', /modello 730|\b730-[1-4]\b|730\/20\d\d|\b730\b/i], ['IRAP', /\birap\b/i], ['IVA', /dichiarazione iva|\biva 20\d\d\b|quadro v[ae]\b/i],
    ['Redditi SC', /redditi.{0,20}societ[aà] di capitali|\bredditi sc\b/i], ['Redditi SP', /redditi.{0,20}societ[aà] di persone|\bredditi sp\b/i], ['Redditi ENC', /redditi.{0,20}enti non commerciali/i], ['Redditi PF', /redditi.{0,20}persone fisiche|\bredditi pf\b|unico persone fisiche/i]];
  const RIGO = /^[A-Z]{1,2}\d{1,3}$/;
  const BAD = /^(A[0-6]|B\d|C\d{3,}|[A-Z]\d{1,3}\/)$/;
  function parse(pg) {
    const txt = pg.slice(0, 3).map(x => x.text).join('\n');
    const model = (MODELS.find(([, re]) => re.test(txt)) || ['Dichiarazione'])[0];
    const year = (/periodo d['’]imposta\s*(20\d\d)/i.exec(txt) || /(?:redditi|730|irap|iva|certificazione unica)\s*(20\d\d)/i.exec(txt) || [])[1] || '';
    const cf = (PiiKit.cfsOf(pg.map(x => x.text).join('\n'))[0]) || '';
    const rows = [];
    for (const P of pg) {
      // numeri di colonna stampati in piccolo sopra le caselle
      const sizes = P.lines.map(L => L.size).sort((a, b) => a - b), med = sizes[sizes.length >> 1] || 9;
      const colLabels = [];
      for (const L of P.lines) for (const k of tokens(L)) if (/^\d{1,2}$/.test(k.t) && +k.t >= 1 && +k.t <= 30 && L.size < med * 0.85) colLabels.push({ n: +k.t, x: k.x0, y: L.y });
      for (const L of P.lines) {
        const tk = tokens(L); if (tk.length < 2) continue;
        const ri = RIGO.test(tk[0].t) && !BAD.test(tk[0].t) ? tk[0].t : null;
        const vals = [];
        for (let j = ri ? 1 : 0; j < tk.length; j++) { const v = amt(tk[j].t, { ints: true }); if (v != null && !(L.size < med * 0.85 && /^\d{1,2}$/.test(tk[j].t))) vals.push({ v, k: tk[j], j }); }
        if (!vals.length) continue;
        const desc = tk.filter((k, j) => !(ri && j === 0) && amt(k.t, { ints: true }) == null).map(k => k.t).join(' ').replace(/\s+/g, ' ').trim();
        if (!ri) {
          // CU e prospetti: «12 Ritenute IRPEF ... 1.234,56» (punto numerato all'inizio)
          const m = /^(\d{1,3})\s+(\D{6,})/.exec(L.text);
          if (!m || model !== 'CU' && !/730/.test(model)) continue;
          const v = vals.filter(x => /,\d{2}$/.test(x.k.t) || /\.\d{3}$/.test(x.k.t)).pop(); if (!v) continue;
          rows.push({ model, quadro: model === 'CU' ? 'Punti' : '', rigo: m[1], col: '', desc: m[2].replace(/\s+[\d.,]+$/, '').trim().slice(0, 140), v: v.v, box: boxOf(L) });
          continue;
        }
        for (const x of vals) {
          if (/^\d{4}$/.test(x.k.t) && +x.k.t >= 1990 && +x.k.t <= 2100 && !/,/.test(x.k.t)) continue; // anni, codici
          const lab = colLabels.filter(c => c.y < L.y && L.y - c.y < 18 && Math.abs(c.x - x.k.x0) < 60).sort((a, b) => Math.abs(a.x - x.k.x0) - Math.abs(b.x - x.k.x0))[0];
          rows.push({ model, quadro: ri.replace(/\d+$/, ''), rigo: ri, col: lab ? String(lab.n) : '', desc: desc.slice(0, 140), v: x.v, box: boxOf(L, x.k.x0 - 2, x.k.x1 + 2) });
        }
      }
    }
    const checks = [{ ok: null, msg: rows.length ? `${plural(rows.length, 'valore letto', 'valori letti')} da ${model}${year ? ' ' + year : ''}. Ogni valore ha pagina e posizione: tocca una riga per vederla sul documento.` : 'Nessun rigo riconosciuto: il documento potrebbe essere una scansione poco leggibile o un modello diverso.' }];
    if (rows.some(r => !r.col) && rows.some(r => r.col)) checks.push({ ok: null, msg: 'Per alcuni valori il numero di colonna non è stampato vicino: la colonna è vuota, il valore è comunque al suo rigo.' });
    return { kind: 'dich', model, year, cf, rows, checks, ok: rows.length > 0 };
  }
  return { parse };
})();

/* ---------- visura camerale: dati dell'impresa e persone con cariche ---------- */
const CameraleRead = (() => {
  const { boxOf, dateOf } = DocRead;
  const FIELDS = [
    ['denominazione', 'Denominazione', /^(denominazione|ragione sociale|ditta)\b/i], ['forma', 'Forma giuridica', /^forma giuridica/i],
    ['cf', 'Codice fiscale', /^codice fiscale(?: e n(?:\.|umero)? ?(?:di |d')?iscr(?:\.|izione)?(?: al)?(?: registro imprese)?)?|^c\.f\./i], ['piva', 'Partita IVA', /^partita iva|^p\.? ?iva/i], ['rea', 'Numero REA', /^(numero )?r\.?e\.?a\.?\b|^n\.? rea|^numero repertorio economico/i],
    ['sede', 'Sede legale', /^(indirizzo )?sede legale|^indirizzo sede/i], ['pec', 'PEC (domicilio digitale)', /^(indirizzo )?pec|^domicilio digitale/i],
    ['costituzione', 'Data di costituzione', /^data (atto di )?costituzione/i], ['iscrizione', 'Data di iscrizione', /^data (di )?iscrizione/i],
    ['capitale', 'Capitale sociale', /^capitale sociale|^capitale (sottoscritto|deliberato|versato)/i], ['ateco', 'Codice ATECO', /^codice ateco|^attivit[aà] prevalente|^codice:?\s*\d{2}\.\d/i],
    ['stato', 'Stato attività', /^stato (attivit[aà]|impresa)/i], ['addetti', 'Addetti', /^(numero )?addetti/i], ['inizio', 'Data inizio attività', /^data inizio attivit/i],
    ['telefono', 'Telefono', /^telefono\b/i], ['oggetto', 'Oggetto sociale', /^oggetto sociale\b/i],
  ];
  const ROLES = /amministratore unico|presidente del consiglio di amministrazione|vice presidente|amministratore delegato|consigliere|socio amministratore|legale rappresentante|titolare|socio accomandatario|socio accomandante|liquidatore|sindaco (effettivo|supplente)|presidente del collegio sindacale|revisore( legale)?|procuratore|institore|socio unico|\bsocio\b|amministratore/i;
  const LABEL_SKIP = /^(pec|e-?mail|iscr|al registro|registro imprese|amministrativo|\(rea\))/i;
  // valore di un'etichetta: nella stessa cella, nella cella a destra o nella riga sotto a destra; poi le righe che continuano
  // allineate al valore (indirizzi e PEC lunghi vanno a capo); si ferma alla prossima etichetta nella colonna delle etichette
  function valueOf(P, i, ci, re, joinTight) {
    const L = P.lines[i], c = L.cells[ci], m = re.exec(c.text);
    let v = c.text.slice(m ? m.index + m[0].length : 0).replace(/^[\s:.\-–'’\/]+/, '').replace(/^al\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*/i, '').trim(), vx = null, at = i;
    if (v.length < 3 || LABEL_SKIP.test(v)) v = '';
    if (!v) { const nx = L.cells[ci + 1]; if (nx) { v = nx.text; vx = nx.x0; } }
    if (!v) for (let j = i + 1; j <= i + 2 && j < P.lines.length; j++) {
      const N = P.lines[j]; if (N.y - L.y > L.size * 3.4) break;
      const r = N.cells.find(q => q.x0 > c.x1 - 2 && q.x0 > c.x0 + 20);
      if (r) { v = r.text; vx = r.x0; at = j; break; }
      if (j === i + 1 && Math.abs(N.cells[0].x0 - c.x0) < 8 && !FIELDS.some(f => f[2].test(N.cells[0].text))) { v = N.cells[0].text; at = j; break; }
    }
    if (v && vx != null) {
      let prev = P.lines[at].y;
      for (let j = at + 1; j <= at + (/^oggetto/i.test(c.text) ? 12 : 5) && j < P.lines.length; j++) {
        const N = P.lines[j]; if (N.y - prev > N.size * 2.3) break;
        const vc = N.cells.find(q => Math.abs(q.x0 - vx) < 9), lc = N.cells.find(q => q !== vc && Math.abs(q.x0 - c.x0) < 9);
        if (!vc && !lc) continue;   // una riga della colonna di sinistra in mezzo (la denominazione che va a capo)
        if (!vc || lc || FIELDS.some(f => f[2].test(vc.text)) || /:/.test(vc.text) && !joinTight && !/^oggetto/i.test(c.text)) break;
        v += (joinTight ? '' : ' ') + vc.text; prev = N.y;
      }
    }
    return v.replace(/\s{2,}/g, ' ').trim();
  }
  const NAME = /^[A-ZÀ-Ý][A-ZÀ-Ý'’.\- ]{2,70}$/;
  const NOT_NAME = /^(PROPRIETA|DOMICILIO|CARICA|CONSIGLIERE|PRESIDENTE|AMMINISTRAZIONE|SINDACO|REVISORE|SOCIO|TIPO DI DIRITTO|ELENCO|VISURA|REGISTRO|CAMERA|ATTIVIT|SEZIONE|CAPITALE)/;
  function parse(pg) {
    const out = {}, boxes = {};
    for (const P of pg) for (let i = 0; i < P.lines.length; i++) {
      const L = P.lines[i];
      L.cells.forEach((c, ci) => {
        const t = c.text.trim();
        for (const [k, , re] of FIELDS) {
          if (out[k] || !re.test(t)) continue;
          const v = valueOf(P, i, ci, re, k === 'pec');
          if (v && v.length < (k === 'oggetto' ? 2000 : 300) && (k !== 'pec' || /@/.test(v))) { out[k] = k === 'oggetto' ? v.slice(0, 600) : v; boxes[k] = boxOf(L, c.x0); }
        }
      });
    }
    const all = pg.map(x => x.text).join('\n');
    // denominazione nel titolo della prima pagina (visura del Registro Imprese): le righe a sinistra sotto «VISURA …»
    if (!out.denominazione && pg[0]) {
      const P = pg[0], k0 = P.lines.findIndex(L => /visura\s+(ordinaria|storica|camerale)/i.test(L.text));
      if (k0 >= 0) {
        const parts = [];
        for (const L of P.lines.slice(k0 + 1, k0 + 14)) {
          if (/qr code|^attivit|il qr/i.test(L.text)) break;
          const left = L.cells.filter(c => c.x0 < P.w * 0.45 && !(/^[A-Z0-9]{4,8}$/.test(c.text.trim())));
          if (left.length) parts.push(left.map(c => c.text).join(' '));
        }
        if (parts.length) { out.denominazione = parts.join(' ').replace(/\s+/g, ' ').trim(); boxes.denominazione = boxOf(P.lines[k0 + 1] || P.lines[k0]); }
      }
    }
    if (out.cf) { const c = (/\b(\d{11}|[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/i.exec(out.cf) || [])[1]; if (c) out.cf = c.toUpperCase(); }
    if (out.piva) { const c = (/\b\d{11}\b/.exec(out.piva) || [])[0]; if (c) out.piva = c; }
    if (!out.piva && out.cf && /^\d{11}$/.test(out.cf)) out.piva = out.cf;
    if (out.rea) { const c = (/\b([A-Z]{2})\s*[-–]?\s*(\d{4,8})\b/.exec(out.rea) || []); if (c[2]) out.rea = `${c[1]}-${c[2]}`; }
    if (out.capitale) { const m = /([\d.]+,\d{2})/.exec(out.capitale); if (m) out.capitale = m[1] + ' €'; }
    if (out.ateco) { const m = /(\d{2}\.\d{1,2}(?:\.\d{1,2})?)\s*[-–]?\s*(.*)/.exec(out.ateco); if (m) out.ateco = m[1] + (m[2] ? ' - ' + m[2].slice(0, 120) : ''); }
    if (out.sede) out.sede = out.sede.replace(/\s*luogo di conservazione.*$/i, '').replace(/\s*telefono:?.*$/i, '');
    if (out.telefono) out.telefono = (/[\d+][\d\s\/.\-]{5,}/.exec(out.telefono) || [out.telefono])[0].trim();
    if (out.addetti) out.addetti = (/\d[\d.]*/.exec(out.addetti) || [out.addetti])[0];
    if (!out.pec) { const m = /\b[\w.+-]+@(?:pec|legalmail|postacert|cert|arubapec|pec\.[\w-]+)\.[\w.]+\b/i.exec(all) || /\b[\w.+-]+@[\w-]+\.(?:pec\.it|legalmail\.it)\b/i.exec(all); if (m) out.pec = m[0].toLowerCase(); }
    const capN = out.capitale ? DocRead.amt(out.capitale.replace(/\s*€/, '')) : null;
    // persone: per sezione (soci, amministratori, sindaci) con quota, diritto, carica e data di nomina
    const people = [], seen = new Set(); let sect = '', quota = null;
    // tutte le righe in fila, anche tra una pagina e l'altra (un blocco può continuare sulla pagina dopo)
    const FL = pg.flatMap(P => P.lines.map(L => ({ L, P })));
    FL.forEach(({ L, P }, i) => {
      const t = L.text.trim();
      if (!/\.{4}/.test(t)) {
        if (/^\d{1,2}\s+soci e titolari/i.test(t)) sect = 'soci'; else if (/^\d{1,2}\s+amministratori/i.test(t)) sect = 'amm';
        else if (/^\d{1,2}\s+sindaci|^\d{1,2}\s+organi di controllo/i.test(t)) sect = 'sind'; else if (/^\d{1,2}\s+titolari di (altre )?cariche/i.test(t)) sect = 'car';
        else if (/^\d{1,2}\s+[A-Z][a-zà-ù]/.test(t) && L.cells.length === 1 && L.cells[0].x0 < P.w * 0.1) { sect = sect === 'soci' || sect === 'amm' || sect === 'sind' || sect === 'car' ? '' : sect; }
      }
      const qm = /quota di nominali:?\s*([\d.]+,\d{2})/i.exec(t); if (qm) quota = DocRead.amt(qm[1]);
      for (const cf of PiiKit.cfsOf(t)) {
        const key = cf + '|' + sect + '|' + (sect === 'soci' ? quota : ''); if (seen.has(key) || cf === out.cf) continue; seen.add(key);   // un socio può avere una quota sua e una in comune: sono due righe
        const isName = c => c && c.x0 < P.w * 0.4 && NAME.test(c.text.trim()) && !NOT_NAME.test(c.text.trim().toUpperCase()) && !/\d/.test(c.text);
        let nome = '';
        const own = L.cells.find(isName); if (own) nome = own.text.trim();
        else for (let j = i - 1; j >= Math.max(0, i - 4); j--) { const c = FL[j].L.cells.find(isName); if (c) { nome = c.text.trim(); break; } }
        if (!nome) nome = L.text.split(cf)[0].replace(/codice fiscale:?|c\.f\.:?|nat[oa] a.*$/ig, '').replace(/[,;:]\s*$/, '').trim();
        // nome che va a capo sotto (es. il secondo nome)
        const nx = FL[i + 1]?.L; const cont = nx && nx.cells.find(c => isName(c) && c.text.trim().split(' ').length <= 2); if (own && cont && !PiiKit.cfsOf(nx.text).length) nome += ' ' + cont.text.trim();
        const near = FL.slice(i, i + 16).map(x => x.L.text).join(' \n ');
        let role = '', dal = '', q = '';
        if (sect === 'soci') {
          // solo le righe di questa persona: fino al prossimo codice fiscale o alla prossima quota
          const own = []; for (let j = i; j < Math.min(FL.length, i + 7); j++) { const tx = FL[j].L.text; if (j > i && (PiiKit.cfsOf(tx).length || /quota di nominali/i.test(tx))) break; own.push(tx); }
          const mine = own.join(' \n ');
          const dir = /tipo di diritto:?\s*([a-zà-ù' ]+)/i.exec(mine), rag = /in ragione di\s*(\d+\s*\/\s*\d+)/i.exec(mine);
          role = 'Socio' + (dir ? ' · ' + dir[1].trim().replace(/a['’]$/i, 'à') : '') + (rag ? ' ' + rag[1].replace(/\s/g, '') : '');
          if (quota != null) { const share = rag ? (() => { const [a, b] = rag[1].split('/').map(Number); return b ? a / b : 1; })() : 1; q = DocRead.fmt(quota) + ' €' + (capN ? ` (${(quota / capN * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%${share < 1 ? ', in comune' : ''})` : ''); }
        } else {
          const crow = FL.slice(i, i + 18).map(x => x.L).find(x => x.cells[0] && /^carica$/i.test(x.cells[0].text.trim()));
          if (crow && crow.cells[1]) role = crow.cells[1].text.trim();
          // il ruolo scritto sopra il nome (es. «Consigliere»), se la riga «carica» non si trova
          if (!role) for (let j = i - 1; j >= Math.max(0, i - 3) && !role; j--) { const c = FL[j].L.cells.find(x => ROLES.test(x.text) && x.text.length < 50); if (c) role = c.text.trim(); }
          if (!role) role = (ROLES.exec(near) || [''])[0];
          const nom = /(?:data atto di nomina|nominat[oa]\s*(?:con atto)?\s*(?:del|in data)?)[:\s]*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i.exec(near);
          if (nom) dal = DocRead.dateIt(dateOf(nom[1]));
          if (sect === 'sind' && !role) role = 'Organo di controllo';
        }
        if (!sect || sect === 'soci' || sect === 'amm' || sect === 'sind' || sect === 'car' || role)
          people.push({ nome: nome.slice(0, 80), cf, role: role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '', dal, quota: q, box: boxOf(L) });
      }
    });
    const checks = [];
    if (out.cf) checks.push(PiiKit.cfValid(out.cf) || PiiKit.pivaValid(out.cf) ? { ok: true, msg: `Codice fiscale ${out.cf} con cifra di controllo corretta.` } : { ok: false, msg: `Il codice fiscale ${out.cf} non ha la cifra di controllo corretta: controllalo.` });
    if (out.piva && out.piva !== out.cf) checks.push(PiiKit.pivaValid(out.piva) ? { ok: true, msg: `Partita IVA ${out.piva} corretta.` } : { ok: false, msg: `La partita IVA ${out.piva} non è corretta: controllala.` });
    // le quote dei soci devono sommare il capitale sociale
    const soci = people.filter(p => /^Socio/.test(p.role)); 
    if (soci.length && capN) {
      let sum = 0, last = null; for (const P of pg) for (const L of P.lines) { const qm = /quota di nominali:?\s*([\d.]+,\d{2})/i.exec(L.text); if (qm) { sum += DocRead.amt(qm[1]); last = qm[1]; } }
      void last; const d = Math.round((sum - capN) * 100) / 100;
      checks.push(Math.abs(d) < 0.01 ? { ok: true, msg: `I conti tornano: le quote dei soci sommano ${DocRead.fmt(sum)} €, come il capitale sociale.` } : { ok: false, msg: `Le quote dei soci sommano ${DocRead.fmt(sum)} € ma il capitale sociale è ${DocRead.fmt(capN)} €: controlla l’elenco dei soci.` });
    }
    const nAmm = /amministratori\s+(\d+)\b/i.exec(all), am = people.filter(p => p.role && !/^Socio/.test(p.role)).length;
    if (nAmm && am && +nAmm[1] !== am && !/sindac/i.test(nAmm[0])) checks.push({ ok: null, msg: `La visura indica ${nAmm[1]} amministratori; ne ho letti ${am} con il codice fiscale.` });
    if (!out.denominazione) checks.push({ ok: null, msg: 'Denominazione non trovata: la visura potrebbe avere un formato diverso.' });
    const rows = FIELDS.filter(([k]) => out[k]).map(([k, label]) => ({ label, v: out[k], box: boxes[k] }));
    return { kind: 'camerale', data: out, rows, people, checks, ok: rows.length >= 2 };
  }
  return { parse, FIELDS };
})();

/* ---------- visura catastale: immobili (fabbricati e terreni), intestati, valore ai fini IMU ---------- */
const CatastoRead = (() => {
  const { tokens, boxOf, amt } = DocRead;
  // coefficienti IMU per categoria (rendita rivalutata del 5%)
  const coefOf = cat => { if (!cat) return null; const [g, n] = cat.split('/'); const k = +n; if (g === 'A') return k === 10 ? 80 : 160; if (g === 'B') return 140; if (g === 'C') return k === 1 ? 55 : [3, 4, 5].includes(k) ? 140 : 160; if (g === 'D') return k === 5 ? 80 : 65; return null; };
  const QUAL = /\b(SEMINATIVO(?: ARBORATO| IRRIGUO)?|ULIVETO|VIGNETO|FRUTTETO|PASCOLO(?: ARBORATO| CESPUGLIATO)?|PRATO|BOSCO (?:CEDUO|ALTO|MISTO)|INCOLTO (?:PRODUTTIVO|STERILE)|AGRUMETO|CANNETO|ORTO(?: IRRIGUO)?|ENTE URBANO|FABBRICATO RURALE|CASTAGNETO|NOCCIOLETO|SEMIN ARBOR|SEMIN IRRIG|PASC CESPUG)\b/;
  // visura «per soggetto» o «per immobile» del formato attuale: un blocco per immobile (dati identificativi, indirizzo,
  // classamento, superficie, intestati) su due colonne; a destra le causali, che non servono
  function parseRecords(pg, com) {
    const L = [];
    for (const P of pg) for (const ln of P.lines) {
      const left = ln.cells.filter(c => c.x0 < P.w * 0.47); if (!left.length) continue;
      const t = left.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
      if (!t || /^(direzione provinciale|ufficio provinciale|servizi catastali|data:|ora:|numero pratica|pag:)/i.test(t)) continue;
      L.push({ t, ln });
    }
    const recs = []; let r = null, owner = null;
    const E = s0 => DocRead.amt(s0);
    for (let i = 0; i < L.length; i++) {
      const { t, ln } = L[i];
      const st = /immobile di catasto (fabbricati|terreni)/i.exec(t);
      if (st) { r = { cat: /terreni/i.test(st[1]) ? 'Terreni' : 'Fabbricati', foglio: '', part: '', sub: '', sez: '', ind: '', box: boxOf(ln), owners: [] }; recs.push(r); owner = null; continue; }
      if (!r) continue;
      if (/^totale parziale|^totale immobili|^immobili siti nel comune/i.test(t)) { r = null; continue; }
      let m;
      if (!r.foglio && (m = /(?:sezione(?: urbana)?\s+(\w+)\s+)?foglio\s+(\w+)\s+particella\s+(\w+)(?:\s+subalterno\s+(\w+))?/i.exec(t))) { r.sez = m[1] || ''; r.foglio = m[2]; r.part = m[3]; r.sub = m[4] || ''; r.box = boxOf(ln); }
      if (/^indirizzo$/i.test(t) && L[i + 1]) r.ind = L[i + 1].t;
      if ((m = /rendita:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t))) r.rendita = E(m[1]);
      if ((m = /categoria\s+([A-F])\s?\/\s?(\d{1,2})/i.exec(t))) r.categoria = `${m[1].toUpperCase()}/${m[2]}`;
      if ((m = /classe\s+(\w+)/i.exec(t)) && !r.classe) r.classe = m[1].replace(/[^\w]/g, '');
      if ((m = /consistenza\s+([\d.,]+)\s*(vani|m2|m²|mq|m3|m³|m(?![a-zà-ÿ]))/i.exec(t))) { const u = m[2].toLowerCase(); r.cons = `${m[1]} ${u === 'vani' ? 'vani' : /3|³/.test(u) ? 'm³' : 'm²'}`; }
      if ((m = /^totale:?\s*([\d.]+)\s*m(?:2|²|q)?(?![a-z])/i.exec(t))) r.sup = +m[1].replace(/\./g, '');   // il «2» di m² a volte è un pezzo a parte, più in alto
      if ((m = /dominicale:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t))) r.rdom = E(m[1]);
      if ((m = /agrario:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t))) r.ragr = E(m[1]);
      if ((m = /qualit[aà]:?\s*([A-Z][A-Z ]+?)\s*(?:di\s+)?classe\s+(\w+)/i.exec(t))) { r.qualita = m[1].trim().toUpperCase(); r.classe = m[2]; }
      if (r.cat === 'Terreni' && (m = /superficie:?\s*(?:(\d+)\s*ha\s*)?(?:(\d+)\s*are\s*)?(?:(\d+)\s*ca)?/i.exec(t)) && (m[1] || m[2] || m[3])) r.sup = (+m[1] || 0) * 10000 + (+m[2] || 0) * 100 + (+m[3] || 0);
      // intestati: «1. Cognome Nome», «(CF …)», «Diritto di: Proprieta' per 1000/1000»
      if ((m = /^(\d{1,3})\.\s+(?!\s*(?:voltura|costituzione|variazione|frazionamento|denuncia|atto|istrumento|successione))(.{3,80})$/i.exec(t)) && !/\d{2}\/\d{2}\/\d{4}/.test(t)) { owner = { nome: m[2].trim(), cf: '', diritto: '', quota: '', box: boxOf(ln) }; r.owners.push(owner); }
      const cfs = PiiKit.cfsOf(t); if (owner && cfs.length && !owner.cf) owner.cf = cfs[0];
      if (owner && (m = /diritto di:?\s*([^\d(]+?)\s*(?:per\s+)?(\d+\s*\/\s*\d+)?(?:\s*\(|$)/i.exec(t))) { owner.diritto = m[1].trim().replace(/a['’]$/i, 'à').replace(/^propriet[aà]/i, 'Proprietà'); owner.quota = (m[2] || '').replace(/\s/g, ''); }
    }
    const rows = recs.filter(x => x.foglio && (x.rendita != null || x.rdom != null)).map(x => {
      const k = x.categoria ? coefOf(x.categoria) : 135;
      return x.cat === 'Terreni' ? { ...x, base: x.rdom != null ? Math.round(x.rdom * 1.25 * 135 * 100) / 100 : null, coef: 135 } : { ...x, base: x.rendita != null && k ? Math.round(x.rendita * 1.05 * k * 100) / 100 : null, coef: k };
    });
    return rows;
  }
  function parse(pg) {
    const all = pg.map(x => x.text).join('\n'), rows = [], owners = [];
    const com = /comune di\s+([A-ZÀ-Ý' .\-]{2,40}?)\s*\(\s*(?:codice:?\s*)?([A-Z]\d{3})\s*\)/i.exec(all);
    let cat = /catasto terreni/i.test(all) && !/catasto fabbricati/i.test(all) ? 'Terreni' : 'Fabbricati', cols = null;
    for (const P of pg) P.lines.forEach((L, i) => {
      const t = L.text;
      if (/catasto terreni/i.test(t)) cat = 'Terreni'; else if (/catasto fabbricati/i.test(t)) cat = 'Fabbricati';
      if (/foglio/i.test(t) && /particella|mappale/i.test(t)) { const tk = tokens(L), at = re => tk.find(k => re.test(k.t)); cols = { foglio: at(/^foglio/i), part: at(/^(particella|mappale)/i), sub: at(/^sub/i) }; return; }
      const tk = tokens(L), nums = tk.filter(k => /^\d{1,5}$/.test(k.t));
      if (nums.length < 2) return;
      let foglio = null, part = null, sub = '';
      if (cols?.foglio && cols?.part) {
        const near = col => col ? nums.filter(k => Math.abs((k.x0 + k.x1) / 2 - (col.x0 + col.x1) / 2) < 26).sort((a, b) => Math.abs(a.x0 - col.x0) - Math.abs(b.x0 - col.x0))[0] : null;
        foglio = near(cols.foglio)?.t; part = near(cols.part)?.t; sub = near(cols.sub)?.t || '';
      }
      if (cat === 'Fabbricati') {
        const c = /\b([A-F])\s?\/\s?(\d{1,2})\b/.exec(t); if (!c) return;
        const rend = /(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t) || /\b(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/.exec(t); if (!rend) return;
        if (!foglio) { const head = t.slice(0, c.index).match(/\b\d{1,5}\b/g) || []; const h2 = head.slice(head.length >= 4 && head[0].length <= 2 && +head[0] < 50 ? 1 : 0); foglio = h2[0]; part = h2[1]; sub = h2[2] || ''; }
        if (!foglio || !part) return;
        const after = t.slice(c.index + c[0].length);
        const classe = (/^\s*(\d{1,2}|U)\b/.exec(after) || [])[1] || '';
        const cons = (/(\d+(?:[.,]\d+)?)\s*(vani|m²|mq|m2|metri quadri|m(?![a-z]))/i.exec(after) || []);
        const sup = (/totale:?\s*(\d+)\s*(?:m²|mq|m2)/i.exec(after + ' ' + (P.lines[i + 1]?.text || '')) || [])[1] || '';
        const r = amt(rend[1]), categoria = `${c[1]}/${c[2]}`, k = coefOf(categoria);
        let ind = ''; for (const N of P.lines.slice(i + 1, i + 4)) { if (/^(indirizzo|via|viale|v\.le|piazza|p\.zza|corso|strada|localit|largo|vicolo)\b/i.test(N.text)) { ind = N.text.replace(/^indirizzo:?\s*/i, '').trim(); break; } }
        rows.push({ cat: 'Fabbricati', foglio, part, sub, categoria, classe, cons: cons[1] ? `${cons[1]} ${cons[2].toLowerCase().replace('mq', 'm²').replace('m2', 'm²')}` : '', sup: sup ? +sup : null, rendita: r, base: r != null && k ? Math.round(r * 1.05 * k * 100) / 100 : null, coef: k, ind, box: boxOf(L) });
      } else {
        const q = QUAL.exec(t); const eur = [...t.matchAll(/(?:euro|€)\s*([\d.]+,\d{2})/gi)].map(m => amt(m[1]));
        if (!q || eur.length < 1) return;
        if (!foglio) { const head = t.slice(0, q.index).match(/\b\d{1,5}\b/g) || []; foglio = head[head.length >= 3 && +head[0] < 50 && head[0].length <= 2 ? 1 : 0]; part = head[head.length >= 3 && +head[0] < 50 && head[0].length <= 2 ? 2 : 1]; }
        if (!foglio || !part) return;
        const after = t.slice(q.index + q[0].length), classe = (/^\s*(\d{1,2}|U)\b/.exec(after) || [])[1] || '';
        const ha = /(\d{1,4})\s+(\d{1,2})\s+(\d{1,2})(?=\s+(?:euro|€))/i.exec(after);
        const mq = ha ? +ha[1] * 10000 + +ha[2] * 100 + +ha[3] : (/(\d[\d.]*)\s*(?:m²|mq|m2)/i.exec(after) ? +/(\d[\d.]*)\s*(?:m²|mq|m2)/i.exec(after)[1].replace(/\./g, '') : null);
        const rd = eur[0], ra = eur[1] ?? null;
        rows.push({ cat: 'Terreni', foglio, part, sub, qualita: q[1], classe, sup: mq, rdom: rd, ragr: ra, base: rd != null ? Math.round(rd * 1.25 * 135 * 100) / 100 : null, coef: 135, box: boxOf(L) });
      }
    });
    // intestati: codice fiscale + diritto
    const seen = new Set();
    for (const P of pg) P.lines.forEach((L, i) => {
      for (const cf of PiiKit.cfsOf(L.text)) {
        if (seen.has(cf)) continue; seen.add(cf);
        const near = [L.text, P.lines[i + 1]?.text || ''].join(' ');
        const dir = /\b(propriet[aà]|nuda propriet[aà]|usufrutto|diritto di abitazione|superficie|enfiteusi|uso)\b[^\d\n]{0,20}(\d+\s*\/\s*\d+)?/i.exec(near);
        const nome = L.text.split(cf)[0].replace(/^\s*\d+\s+/, '').replace(/nat[oa] a .*$/i, '').trim();
        owners.push({ nome: nome.slice(0, 80), cf, diritto: dir ? dir[1].replace(/^./, c => c.toUpperCase()) : '', quota: dir?.[2]?.replace(/\s/g, '') || '', box: boxOf(L) });
      }
    });
    let recRows = [];
    if (/immobile di catasto (fabbricati|terreni)/i.test(all)) {
      recRows = parseRecords(pg, com);
      if (recRows.length) {
        rows.length = 0; rows.push(...recRows);
        // intestati presi dai blocchi (uno per codice fiscale, con il numero di immobili)
        owners.length = 0; const byCf = new Map();
        for (const x of recRows) for (const o of x.owners) { const k = o.cf || o.nome; const e = byCf.get(k); if (e) { e.n++; if (o.quota && !e.quote.includes(o.quota)) e.quote.push(o.quota); } else byCf.set(k, { ...o, n: 1, quote: o.quota ? [o.quota] : [] }); }
        for (const o of byCf.values()) owners.push({ nome: o.nome, cf: o.cf, diritto: o.diritto, quota: o.quote.join(', '), immobili: o.n, box: o.box });
      }
    }
    const checks = [];
    const tot = rows.reduce((t, r) => t + (r.rendita || 0), 0);
    // il totale scritto in fondo alla visura: la somma delle rendite lette deve dare lo stesso numero
    const totM = /totale immobili:?[^\n]*?rendita:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(all);
    const nM = /totale immobili:?\s*(?:di catasto fabbricati\s*)?(\d+)/i.exec(all) || /totali immobili:?\s*di catasto fabbricati\s*(\d+)/i.exec(all);
    if (totM && rows.length) { const T = DocRead.amt(totM[1]), d = Math.round((tot - T) * 100) / 100; checks.push(Math.abs(d) < 0.01 ? { ok: true, msg: `I conti tornano: la somma delle rendite lette (${DocRead.fmt(tot)} €) è uguale al totale della visura.` } : { ok: false, msg: `La somma delle rendite lette (${DocRead.fmt(tot)} €) non è uguale al totale della visura (${DocRead.fmt(T)} €): manca qualche immobile, controlla.` }); }
    if (nM && rows.length && rows.filter(r => r.cat === 'Fabbricati').length !== +nM[1] && !/terreni/i.test(all.slice(0, 2000))) checks.push({ ok: false, msg: `La visura indica ${nM[1]} immobili, ne ho letti ${rows.length}.` });
    if (rows.length) checks.push({ ok: true, msg: `${plural(rows.length, 'immobile letto', 'immobili letti')}${tot ? ` · rendita totale ${DocRead.fmt(tot)} €` : ''}. Valore IMU = rendita × 1,05 × coefficiente della categoria (per i terreni: reddito dominicale × 1,25 × 135).` });
    else checks.push({ ok: null, msg: 'Nessun immobile riconosciuto: la visura potrebbe essere una scansione poco leggibile.' });
    const q = owners.map(o => o.quota).filter(Boolean);
    if (q.length > 1) { const s = q.reduce((t, x) => { const [a, b] = x.split('/').map(Number); return t + (b ? a / b : 0); }, 0); if (Math.abs(s - 1) > 0.001 && s > 0) checks.push({ ok: null, msg: `Le quote degli intestati sommano ${Math.round(s * 1000) / 10}%: possono riguardare immobili diversi, controlla.` }); }
    return { kind: 'catasto', comune: com ? `${com[1].trim()} (${com[2]})` : '', rows, owners, checks, ok: rows.length > 0 };
  }
  return { parse, coefOf };
})();

/* ---------- esami di laboratorio: esame, valore, unità, intervallo di riferimento, fuori intervallo ---------- */