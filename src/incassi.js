/* =====================================================================
   Incassi e pagamenti veri: l'estratto conto abbinato alle fatture emesse e ricevute. Quali fatture sono state davvero
   incassate o pagate, quando, con quanto ritardo; quali sono scadute e non saldate (con il sollecito già scritto); quali
   movimenti della banca non hanno una fattura. Tutto sul dispositivo: estratti conto in PDF (anche scansionati, con l'OCR)
   o CSV dell'home banking, fatture XML, P7M, ZIP o PDF. Nessuna intelligenza artificiale: regole sui dati scritti.
   ===================================================================== */
const Incassi = (() => {
  const DAY = 864e5, r2 = v => Math.round(v * 100) / 100;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // parole che non distinguono una controparte (forma societaria, parole comuni nelle causali)
  const VUOTE = new Set('srl spa snc sas srls sapa societa soc coop cooperativa scarl ditta studio associato associati di del della dei e ed la il lo le gli and co ltd gmbh sa sl bv ag inc group gruppo servizi italia italiana'.split(' '));
  const parole = nome => norm(nome).split(' ').filter(w => w.length >= 3 && !VUOTE.has(w) && !/^\d+$/.test(w));

  /* ---------- estratto conto in CSV (home banking): data, descrizione, importo oppure dare/avere ---------- */
  function leggiCsv(testo) {
    const righe = String(testo).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!righe.length) return { rows: [], ok: false };
    const sep = [';', '\t', ','].map(s => [s, (righe.slice(0, 8).join('\n').match(new RegExp(s === '\t' ? '\t' : '\\' + s, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const cella = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
    let hi = righe.findIndex(l => /data/i.test(l) && /(importo|dare|avere|entrate|uscite|accredit|addebit)/i.test(l));
    if (hi < 0) hi = 0;
    const H = cella(righe[hi]).map(x => norm(x));
    const col = re => H.findIndex(x => re.test(x));
    const cData = col(/^data( contabile| operazione| registrazione)?$|^data$/) >= 0 ? col(/^data( contabile| operazione| registrazione)?$|^data$/) : col(/data/),
      cVal = col(/valuta/), cDesc = col(/descrizione|causale|dettagli|operazione|movimento/),
      cImp = col(/^importo|ammontare/), cDare = col(/^dare$|addebit|uscit/), cAvere = col(/^avere$|accredit|entrat/);
    const num = s => { s = String(s || '').replace(/[€\s]/g, ''); if (!s) return null; const neg = /^-|\(.*\)$|-$/.test(s); s = s.replace(/[()+-]/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); const v = parseFloat(s); return isFinite(v) ? (neg ? -v : v) : null; };
    const data = s => { const m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s || '') || null; if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } const i = /(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return i ? i[0] : ''; };
    const rows = [];
    for (const l of righe.slice(hi + 1)) {
      const c = cella(l), date = data(c[cData]);
      if (!date) continue;
      let v = cImp >= 0 ? num(c[cImp]) : null;
      if (v == null) { const d = cDare >= 0 ? num(c[cDare]) : null, a = cAvere >= 0 ? num(c[cAvere]) : null; v = (a ? Math.abs(a) : 0) - (d ? Math.abs(d) : 0); }
      if (!v) continue;
      rows.push({ date, valuta: cVal >= 0 ? data(c[cVal]) : '', desc: (cDesc >= 0 ? c[cDesc] : c.filter((_, i) => i !== cData && i !== cImp).join(' ')).replace(/\s+/g, ' ').trim(), v: r2(v) });
    }
    return { rows, ok: rows.length > 0 };
  }

  /* ---------- abbinamento ---------- */
  // quanto si doveva incassare o pagare: le rate scritte in fattura (importo dei DettaglioPagamento) o il totale meno la ritenuta
  // fattura estera integrata (TD17-19): al fornitore si paga l'imponibile; split payment della PA: il cliente versa l'IVA all'Erario
  const dovuto = f => { const s = (f.scadenze || []).reduce((a, x) => a + (x.imp || 0), 0); if (s > 0) return r2(s); if (f.estero) return r2(Math.abs(f.imp || f.tot)); return r2(Math.abs(f.tot) - Math.abs(f.rit || 0) - (f.split ? Math.abs(f.iva || 0) : 0)); };
  const scadenzaDi = f => { const t = (f.scadenze || []).map(x => x.t).filter(Boolean).sort((a, b) => a - b)[0]; return t || f.t + 30 * DAY; };
  // il numero della fattura scritto nella causale («FT 145/2026», «fattura n. 145», «saldo 145-2026»)
  function haNumero(desc, numero) {
    const n = String(numero || '').trim(); if (!n) return false;
    const d = ' ' + norm(desc) + ' ', nn = norm(n), base = (nn.match(/\d+/) || [''])[0];
    if (nn.length >= 3 && d.includes(' ' + nn + ' ')) return true;
    if (!base || base.length < 2) return false;
    return new RegExp(`(fatt\\w*|ft|fat|fattura|doc|n|nr|num|saldo|acconto|rif)\\s+(n\\s+)?0*${base}( |$)`).test(d);
  }
  const haNome = (desc, ws) => { if (!ws.length) return 0; const d = ' ' + norm(desc) + ' '; const n = ws.filter(w => d.includes(' ' + w + ' ') || (w.length >= 6 && d.includes(w.slice(0, 6)))).length; return n / ws.length; };
  function punteggio(f, m, ws) {
    const amt = Math.abs(m.v), due = f.due, dm = Date.parse(m.date), dv = m.valuta ? Date.parse(m.valuta) : dm;
    if (dm < f.t - 5 * DAY || dm > f.t + 1100 * DAY || (dm > f.t + 420 * DAY && !haNumero(m.desc, f.numero))) return 0;   // oltre 14 mesi solo se la causale cita la fattura
    let s = 0;
    const esatto = Math.abs(amt - due) <= 0.011, rata = !esatto && (f.scadenze || []).some(x => x.imp && Math.abs(amt - x.imp) <= 0.011);
    if (esatto) s += 50; else if (rata) s += 38; else return 0;
    const nome = haNome(m.desc, ws), num = haNumero(m.desc, f.numero);
    s += nome >= 0.99 ? 32 : nome >= 0.5 ? 24 : nome > 0 ? 12 : 0;
    if (num) s += 28;
    const sc = scadenzaDi(f), dd = Math.abs((dv || dm) - sc) / DAY;
    s += dd <= 7 ? 10 : dd <= 30 ? 6 : dd <= 90 ? 2 : 0;
    return s;
  }
  function abbina(fatture, movimenti, { verso }) {
    // verso: 'in' (fatture emesse ↔ entrate) o 'out' (fatture ricevute ↔ uscite)
    // del nome contano le parole che distinguono: una parola presente nel nome di molte controparti («Edilizia», «Cliente») no
    const df = new Map(); for (const [, nome] of new Map(fatture.map(f => [f.cpKey, f.cp]))) for (const w of new Set(parole(nome))) df.set(w, (df.get(w) || 0) + 1);
    const distintive = nome => { const ws = parole(nome), d = ws.filter(w => df.get(w) <= 2); return d.length ? d : ws; };
    const F = fatture.filter(f => f.segno > 0).map(f => ({ f, due: dovuto(f), t: f.t, numero: f.numero, scadenze: f.scadenze, ws: distintive(f.cp), pagato: 0, mov: [] }));
    const M = movimenti.map((m, i) => ({ ...m, i, libero: true })).filter(m => verso === 'in' ? m.v > 0 : m.v < 0);
    const unici = new Map(); for (const x of F) unici.set(x.due.toFixed(2), (unici.get(x.due.toFixed(2)) || 0) + 1);
    // 1) una fattura, un movimento: importo uguale e almeno il nome o il numero (o un importo che nessun'altra fattura ha)
    const coppie = [];
    for (const x of F) for (const m of M) { let s = punteggio(x, m, x.ws); if (!s) continue; if (s < 60 && unici.get(x.due.toFixed(2)) === 1 && Math.abs(Math.abs(m.v) - x.due) <= 0.011 && x.due >= 50) s += 15; if (s >= 60) coppie.push([s, x, m]); }
    coppie.sort((a, b) => b[0] - a[0] || Math.abs(Date.parse(a[2].date) - scadenzaDi(a[1])) - Math.abs(Date.parse(b[2].date) - scadenzaDi(b[1])));
    for (const [s, x, m] of coppie) { if (!m.libero || x.pagato >= x.due - 0.011) continue; if (Math.abs(Math.abs(m.v) - x.due) > 0.011 && x.pagato + Math.abs(m.v) > x.due + 0.011) continue; m.libero = false; x.pagato = r2(x.pagato + Math.abs(m.v)); x.mov.push({ m, come: Math.abs(Math.abs(m.v) - x.due) <= 0.011 ? 'importo e riferimenti' : 'rata', s }); }
    // 2) un movimento paga più fatture della stessa controparte (al netto delle sue note di credito): tra le combinazioni che
    //    fanno l'importo vince quella con più numeri di fattura scritti nella causale, poi quella con le fatture più vecchie
    const perCp = new Map(); for (const x of F) { const k = x.f.cpKey; if (!perCp.has(k)) perCp.set(k, []); perCp.get(k).push(x); }
    const note = new Map(); for (const f of fatture) if (f.segno < 0) { const k = f.cpKey; if (!note.has(k)) note.set(k, []); note.get(k).push({ f, due: -dovuto(f), t: f.t, numero: f.numero, nota: true, usata: false }); }
    for (const m of M) {
      if (!m.libero) continue;
      for (const [k, L] of perCp) {
        const dm = Date.parse(m.date);
        const tutte = L.filter(x => x.pagato < 0.01 && dm >= x.t - 5 * DAY && (dm <= x.t + 420 * DAY || (dm <= x.t + 1100 * DAY && haNumero(m.desc, x.numero)))), citate = tutte.filter(x => haNumero(m.desc, x.numero));
        const aperte = [...citate, ...tutte.filter(x => !citate.includes(x)).slice(-(10 - Math.min(citate.length, 6)))].sort((a, b) => a.t - b.t), nc = (note.get(k) || []).filter(x => !x.usata && dm >= x.t - 5 * DAY && dm <= x.t + 420 * DAY).slice(-2);
        const voci = [...aperte, ...nc];
        if (!aperte.length || aperte.length + Math.min(nc.length, 1) < 2 || haNome(m.desc, aperte[0].ws) < 0.5) continue;
        const amt = Math.abs(m.v), n = voci.length; let best = null;
        for (let mask = 3; mask < (1 << n); mask++) {
          if ((mask & (mask - 1)) === 0) continue;
          let sum = 0, c = 0, pos = 0, numeri = 0, eta = 0;
          for (let b = 0; b < n; b++) if (mask & (1 << b)) { const v = voci[b]; sum += v.due; c++; if (!v.nota) { pos++; eta += b; } if (haNumero(m.desc, v.numero)) numeri++; }
          if (!pos || c > 6 || Math.abs(sum - amt) > 0.02) continue;
          const sc = numeri * 100 - eta;
          if (!best || sc > best.sc) best = { mask, sc };
        }
        if (best) { m.libero = false; for (let b = 0; b < n; b++) if (best.mask & (1 << b)) { const x = voci[b]; if (x.nota) { x.usata = true; continue; } x.pagato = x.due; x.mov.push({ m, come: nc.some((y, j) => best.mask & (1 << (aperte.length + j))) ? 'un bonifico al netto della nota di credito' : 'un bonifico per più fatture', s: 70 }); } break; }
      }
    }
    // 3) una fattura pagata in più volte: movimenti con il nome della controparte che insieme fanno l'importo
    for (const x of F) {
      if (x.pagato > 0.01) continue;
      const cand = M.filter(m => m.libero && Date.parse(m.date) >= x.t - 5 * DAY && Date.parse(m.date) <= x.t + 420 * DAY && haNome(m.desc, x.ws) >= 0.5 && Math.abs(m.v) < x.due).slice(0, 12);
      const n = cand.length; let trovato = null;
      for (let mask = 3; mask < (1 << n) && !trovato; mask++) { if ((mask & (mask - 1)) === 0) continue; let sum = 0, c = 0; for (let b = 0; b < n; b++) if (mask & (1 << b)) { sum += Math.abs(cand[b].v); c++; } if (c <= 5 && Math.abs(sum - x.due) <= 0.02) trovato = mask; }
      if (trovato) for (let b = 0; b < n; b++) if (trovato & (1 << b)) { const m = cand[b]; m.libero = false; x.pagato = r2(x.pagato + Math.abs(m.v)); x.mov.push({ m, come: 'in più rate', s: 65 }); }
    }
    // 4) acconti: un movimento più piccolo con il nome e il numero della fattura
    for (const x of F) {
      if (x.pagato >= x.due - 0.011) continue;
      for (const m of M) { if (!m.libero || Math.abs(m.v) >= x.due - x.pagato + 0.011 || Date.parse(m.date) < x.t - 5 * DAY) continue; if (haNumero(m.desc, x.numero) && haNome(m.desc, x.ws) >= 0.5) { m.libero = false; x.pagato = r2(x.pagato + Math.abs(m.v)); x.mov.push({ m, come: 'acconto', s: 60 }); } }
    }
    // 5) acconto senza numero: la causale dice «acconto» (o «rata», «parziale»), c'è il nome e la controparte ha una sola
    //    fattura aperta, già emessa, che può contenerlo
    for (const m of M) {
      if (!m.libero || !/\b(acconto|anticipo|rata|parziale)\b/.test(norm(m.desc))) continue;
      const dm = Date.parse(m.date), amt = Math.abs(m.v);
      const cand = F.filter(x => x.pagato < x.due - 0.011 && x.t <= dm + 5 * DAY && dm <= x.t + 420 * DAY && haNome(m.desc, x.ws) >= 0.5);
      // più fatture aperte: quella che scade a ridosso del movimento (entro 10 giorni, e nessun'altra entro 30)
      const vicine = cand.map(x => [x, Math.abs(scadenzaDi(x) - dm) / DAY]).sort((a, b) => a[1] - b[1]);
      const scelta = cand.length === 1 ? cand[0] : vicine.length > 1 && vicine[0][1] <= 10 && vicine[1][1] > 30 ? vicine[0][0] : null;
      if (scelta && amt < scelta.due - scelta.pagato + 0.011) { const x = scelta; m.libero = false; x.pagato = r2(x.pagato + amt); x.mov.push({ m, come: 'acconto', s: 60 }); }
    }
    return { F, liberi: M.filter(m => m.libero) };
  }

  /* ---------- analisi: stato di ogni fattura, controparti, movimenti senza fattura ---------- */
  function analizza(D, movimenti) {
    movimenti = movimenti.slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const fine = movimenti.length ? Date.parse(movimenti[movimenti.length - 1].date) : Date.now(), inizio = movimenti.length ? Date.parse(movimenti[0].date) : 0;
    const conCp = (L, k, n) => L.map(f => ({ ...f, cp: f[n], cpKey: f[k] }));
    const E = abbina(conCp(D.fatture, 'cli', 'cliNome'), movimenti, { verso: 'in' }), U = abbina(conCp(D.acquisti, 'forn', 'fornNome'), movimenti, { verso: 'out' });
    const stato = x => {
      const f = x.f, sc = scadenzaDi(f), ultimo = x.mov.length ? Math.max(...x.mov.map(y => Date.parse(y.m.date))) : null;
      const pagata = x.pagato >= x.due - 0.011, residuo = r2(Math.max(0, x.due - x.pagato));
      const dopo = f.t > fine;   // fattura successiva all'ultimo movimento dell'estratto: non si può sapere
      const st = pagata ? 'saldata' : dopo ? 'fuori periodo' : x.pagato > 0.01 ? 'parziale' : f.estero && !(f.scadenze || []).length ? 'da verificare' : sc < fine ? 'scaduta' : 'da saldare';
      return { id: f.id, numero: f.numero, data: f.t, cp: f.cp, cpKey: f.cpKey, tot: Math.abs(f.tot), due: x.due, pagato: x.pagato, residuo, scadenza: sc, stato: st, quando: ultimo,
        ritardo: pagata && ultimo ? Math.round((ultimo - sc) / DAY) : null, giorni: pagata && ultimo ? Math.round((ultimo - f.t) / DAY) : null, scadutaDa: (st === 'scaduta' || st === 'parziale') && sc < fine ? Math.round((fine - sc) / DAY) : null,
        come: x.mov.map(y => y.come)[0] || '', movimenti: x.mov.map(y => ({ date: y.m.date, desc: y.m.desc, v: y.m.v })), modalita: f.modalita, iban: f.iban || '' };
    };
    const emesse = E.F.map(stato), ricevute = U.F.map(stato);
    const controparti = L => { const G = new Map(); for (const x of L) { const g = G.get(x.cpKey) || { key: x.cpKey, nome: x.cp, n: 0, due: 0, pagato: 0, scaduto: 0, nScad: 0, ritardi: [], giorni: [], puntuali: 0, saldate: 0 }; g.n++; g.due += x.due; g.pagato += x.pagato;
      if (x.stato === 'scaduta' || x.stato === 'parziale') { g.scaduto += x.residuo; if (x.scadutaDa != null) g.nScad++; }
      if (x.ritardo != null) { g.ritardi.push(x.ritardo); g.giorni.push(x.giorni); g.saldate++; if (x.ritardo <= 5) g.puntuali++; } G.set(x.cpKey, g); }
      return [...G.values()].map(g => ({ ...g, due: r2(g.due), pagato: r2(g.pagato), scaduto: r2(g.scaduto), ritardo: g.ritardi.length ? Math.round(g.ritardi.reduce((a, b) => a + b, 0) / g.ritardi.length) : null,
        dso: g.giorni.length ? Math.round(g.giorni.reduce((a, b) => a + b, 0) / g.giorni.length) : null, puntualita: g.saldate ? g.puntuali / g.saldate : null })).sort((a, b) => b.scaduto - a.scaduto || b.due - a.due); };
    const tot = (L, s) => r2(L.filter(x => !s || s.includes(x.stato)).reduce((a, x) => a + (s && s.includes('scaduta') ? x.residuo : x.pagato), 0));
    const media = L => { const v = L.filter(x => x.ritardo != null); return v.length ? Math.round(v.reduce((a, x) => a + x.ritardo, 0) / v.length) : null; };
    const liberi = movimenti.map((m, i) => ({ ...m, i })).filter(m => E.liberi.some(x => x.i === m.i) || U.liberi.some(x => x.i === m.i));
    return {
      periodo: { da: inizio, a: fine }, movimenti: movimenti.length,
      emesse, ricevute, clienti: controparti(emesse), fornitori: controparti(ricevute),
      incassato: tot(emesse, null), daIncassare: tot(emesse, ['scaduta', 'parziale']), pagato: tot(ricevute, null), daPagare: tot(ricevute, ['scaduta', 'parziale']),
      ritardoClienti: media(emesse), ritardoFornitori: media(ricevute),
      entrateSenza: liberi.filter(m => m.v > 0), usciteSenza: liberi.filter(m => m.v < 0),
    };
  }

  /* ---------- sollecito: il testo per una controparte (lettera ed email) ---------- */
  const eur = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
  const gg = t => new Date(t).toLocaleDateString('it-IT');
  function sollecito(me, cliente, fatture, { iban = '' } = {}) {
    const L = fatture.filter(x => x.stato === 'scaduta' || x.stato === 'parziale'), tot = r2(L.reduce((a, x) => a + x.residuo, 0));
    const righe = L.map(x => `• fattura n. ${x.numero} del ${gg(x.data)}: ${eur(x.residuo)}${x.pagato > 0.01 ? ` (residuo, già pagati ${eur(x.pagato)})` : ''}, scaduta il ${gg(x.scadenza)}`);
    return { oggetto: `Sollecito di pagamento – ${plural(L.length, 'fattura', 'fatture')} scadut${L.length === 1 ? 'a' : 'e'}`, tot,
      testo: [`Spett.le ${cliente},`, '', `dai nostri controlli risultano ancora da saldare ${L.length === 1 ? 'la seguente fattura' : 'le seguenti fatture'}:`, '', ...righe, '', `per un totale di ${eur(tot)}.`, '',
        `Vi chiediamo cortesemente di provvedere al pagamento entro 10 giorni${iban ? ` con bonifico sull’IBAN ${iban}` : ''}.`, 'Se il pagamento è già stato effettuato, vi preghiamo di non tenere conto di questa comunicazione e di inviarci, se possibile, la contabile.', '',
        'Cordiali saluti', me || ''].join('\n') };
  }
  return { leggiCsv, abbina, analizza, sollecito, dovuto, haNumero, haNome, parole };
})();

/* ---------- lo strumento ---------- */
async function startIncassi(stage, files = []) {
  Later.serve('Vendite');
  const V = Vendite, eur = V.eur, DAY = 864e5;
  const data = t => t ? new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const invs = [], movimenti = [], errori = [], estratti = [];
  let worker = null; const getW = async () => { if (typeof Tesseract === 'undefined') await need('tesseract'); return worker ||= await makeOcrWorker(new Set(['ita']), 300); };
  async function leggi(name, bytes) {
    if (/\.zip$/i.test(name)) { for (const f of await FattureKit.zipRead(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))) await leggi(f.name, f.data); return; }
    if (/\.(xml|p7m)$/i.test(name)) { try { invs.push(...FattureKit.leggiBytes(bytes, name)); } catch (e) { errori.push([name, e.message]); } return; }
    if (/\.(csv|txt)$/i.test(name)) { const r = Incassi.leggiCsv(new TextDecoder().decode(bytes)); if (r.ok) { movimenti.push(...r.rows); estratti.push({ name, n: r.rows.length }); } else errori.push([name, 'nessun movimento riconosciuto nel CSV (servono le colonne data, descrizione e importo, oppure dare e avere)']); return; }
    if (/\.pdf$/i.test(name) || /\.(jpe?g|png|webp|heic)$/i.test(name)) {
      // prima come fattura (PDF della fattura elettronica), altrimenti come estratto conto
      if (/\.pdf$/i.test(name)) { try { const L = await FattureKit.leggiPdf(bytes, name); if (L.length) { invs.push(...L); return; } } catch { /* non è una fattura */ } }
      try {
        const file = new File([bytes], name, { type: /\.pdf$/i.test(name) ? 'application/pdf' : 'image/jpeg' });
        const doc = await openPdf(isImage(file) ? await imagesToPdfFile([file], name + '.pdf') : file);
        const pg = await DocRead.pages(doc, { getWorker: getW, onPage: (p, ocr) => Busy.set?.(null, `${name}: pagina ${p}${ocr ? ' (scansione: lettura con l’OCR)' : ''}`) });
        const r = BankRead.parse(pg);
        if (r.ok) { movimenti.push(...r.rows.map(x => ({ date: x.date, valuta: x.valuta || '', desc: x.desc || '', v: x.v }))); estratti.push({ name, n: r.rows.length, ocr: pg.some(x => x.ocr), checks: r.checks }); }
        else errori.push([name, 'né fattura né estratto conto riconoscibile']);
      } catch (e) { errori.push([name, e.message || 'file non leggibile']); }
    }
  }
  if (files.length) await withBusy('Lettura di fatture ed estratti conto…', async () => { Later.all(); for (const [i, f] of files.entries()) { Busy.set?.(i / files.length, f.name); await leggi(f.name, new Uint8Array(await f.arrayBuffer())); } }).finally(() => { try { worker?.terminate(); } catch { } });
  const D = V.prepara(invs);
  // IBAN dell'azienda dai dati di pagamento delle sue fatture (per il sollecito)
  const ibanMio = (() => { for (const f of invs) { if (D.me && String(f.cedente?.piva || f.cedente?.cf || '').toUpperCase().replace(/\s/g, '') !== D.me.key) continue; for (const p of f.pagamenti || []) for (const d of p.dettagli || []) if (d.iban) return d.iban; } return ''; })();
  const A = Incassi.analizza(D, movimenti);
  const st = { tab: 'incassare', cerca: '' };
  const main = h('div', { class: 'ws-main vd-main' }), side = h('div', { class: 'vd-side' });
  const kpi = (l, v, sub = null, cls = '') => h('div', { class: 'vd-kpi ' + cls }, h('span', {}, l), h('b', {}, v), sub ? h('small', {}, sub) : null);
  const sez = (t, ...k) => h('section', { class: 'vd-sec' }, h('h3', {}, t), ...k);
  const CHIP = { saldata: ['ok', 'saldata'], parziale: ['warn', 'in parte'], scaduta: ['bad', 'scaduta'], 'da saldare': ['', 'da saldare'], 'fuori periodo': ['', 'dopo l’estratto'], 'da verificare': ['', 'da verificare'] };
  const chip = s => h('span', { class: 'in-st ' + (CHIP[s]?.[0] || '') }, CHIP[s]?.[1] || s);
  function tabella(cols, righe, { vuoto = 'Nessuna riga.', onRow = null } = {}) {
    return h('div', { class: 'vd-tw in-tw', tabindex: '0', role: 'region', 'aria-label': 'Elenco' }, h('table', { class: 'vd-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.l)))),
      h('tbody', {}, righe.length ? righe.slice(0, 800).map(r => h('tr', { class: onRow ? 'cl' : '', tabindex: onRow ? '0' : null, onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? e => { if (e.key === 'Enter') onRow(r); } : null }, cols.map(c => h('td', { class: c.num ? 'num' : '' }, c.f(r))))) : h('tr', {}, h('td', { colspan: cols.length, class: 'muted' }, vuoto)))));
  }
  const filtro = L => { const q = st.cerca.toLowerCase(); return q ? L.filter(x => (x.cp || x.desc || '').toLowerCase().includes(q) || String(x.numero || '').toLowerCase().includes(q)) : L; };
  function schedaControparte(key, emesse = true) {
    const L = (emesse ? A.emesse : A.ricevute).filter(x => x.cpKey === key), g = (emesse ? A.clienti : A.fornitori).find(x => x.key === key); if (!g) return;
    const sc = L.filter(x => x.stato === 'scaduta' || x.stato === 'parziale');
    const S = emesse && sc.length ? Incassi.sollecito(D.me?.nome, g.nome, L, { iban: ibanMio }) : null;
    side.replaceChildren(h('div', { class: 'vd-sh' }, h('b', {}, g.nome), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onclick: () => { drawSide(); } }, ic('x', 16))),
      h('dl', { class: 'vd-dl' }, h('dt', {}, emesse ? 'Fatturato' : 'Acquisti'), h('dd', {}, eur(g.due)), h('dt', {}, emesse ? 'Incassato' : 'Pagato'), h('dd', {}, eur(g.pagato)),
        h('dt', {}, 'Scaduto'), h('dd', { class: g.scaduto > 0 ? 'vd-neg' : '' }, eur(g.scaduto)), h('dt', {}, 'Ritardo medio'), h('dd', {}, g.ritardo == null ? '—' : g.ritardo <= 0 ? `puntuale (${-g.ritardo} gg prima)` : `${g.ritardo} giorni dopo la scadenza`),
        h('dt', {}, 'Giorni per pagare'), h('dd', {}, g.dso == null ? '—' : `${g.dso} dalla data della fattura`), g.puntualita != null ? [h('dt', {}, 'Puntuale'), h('dd', {}, `${Math.round(g.puntualita * 100)}% delle volte`)] : null),
      h('div', { class: 'vd-st' }, 'Fatture'), h('ul', { class: 'vd-cl' }, L.slice().sort((a, b) => b.data - a.data).slice(0, 30).map(x => h('li', {}, h('div', { class: 'vd-clb', style: { cursor: 'default' } }, h('b', {}, `n. ${x.numero} · ${data(x.data)}`), h('span', {}, eur(x.due))), h('div', { class: 'small' }, chip(x.stato), ' ', x.quando ? `${emesse ? 'incassata' : 'pagata'} il ${data(x.quando)}${x.ritardo != null ? ` (${x.ritardo > 0 ? '+' + x.ritardo : x.ritardo} gg)` : ''}` : x.scadutaDa != null ? `scaduta da ${x.scadutaDa} giorni` : `scade il ${data(x.scadenza)}`)))),
      ...(S ? [h('div', { class: 'vd-st' }, 'Sollecito'), h('textarea', { class: 'input in-sol', rows: 12, 'aria-label': 'Testo del sollecito', value: S.testo }),
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm primary', onclick: () => copia(S.oggetto + '\n\n' + side.querySelector('.in-sol').value) }, ic('copy', 15), 'Copia il testo'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => pdfSollecito(g.nome, S.oggetto, side.querySelector('.in-sol').value) }, ic('download', 15), 'PDF del sollecito'))] : []));
    const ta = side.querySelector('.in-sol'); if (ta) ta.value = S.testo;
  }
  const copia = async t => { try { await navigator.clipboard.writeText(t); toast('Testo copiato: incollalo nell’email'); } catch { toast('Copia non riuscita: seleziona il testo e copialo', 'error'); } };
  async function pdfSollecito(nome, oggetto, testo) {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595.28, 841.89]), M = 64, W = 595.28 - 2 * M; let y = 841.89 - 80;
    const safe = s => pdfSafe(font, s);
    page.drawText(safe(D.me?.nome || ''), { x: M, y, size: 11, font: bold }); y -= 40;
    page.drawText(safe(oggetto), { x: M, y, size: 12, font: bold }); y -= 28;
    for (const par of testo.split('\n')) {
      if (!par.trim()) { y -= 8; continue; }
      let riga = ''; for (const w of par.split(' ')) { const t = riga ? riga + ' ' + w : w; if (font.widthOfTextAtSize(safe(t), 10.5) > W) { page.drawText(safe(riga), { x: M, y, size: 10.5, font }); y -= 15; riga = w; } else riga = t; }
      if (riga) { page.drawText(safe(riga), { x: M, y, size: 10.5, font }); y -= 15; }
    }
    pdf.setTitle(oggetto); download(await pdf.save(), `Sollecito ${nome}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'), 'application/pdf');
  }
  function drawSide() {
    side.replaceChildren(h('div', { class: 'vd-st' }, 'Dati letti'), h('dl', { class: 'vd-dl' },
      h('dt', {}, 'Azienda'), h('dd', {}, D.me?.nome || '—'),
      h('dt', {}, 'Fatture'), h('dd', {}, `${D.fatture.length} emesse · ${D.acquisti.length} ricevute`),
      h('dt', {}, 'Estratti conto'), h('dd', {}, estratti.length ? estratti.map(e => `${e.name} (${e.n} movimenti${e.ocr ? ', letto con l’OCR' : ''})`).join(' · ') : '—'),
      h('dt', {}, 'Periodo della banca'), h('dd', {}, A.movimenti ? `${data(A.periodo.da)} → ${data(A.periodo.a)}` : '—'),
      errori.length ? [h('dt', {}, 'Non letti'), h('dd', {}, errori.map(e => `${e[0]}: ${e[1]}`).join(' · '))] : null),
      h('div', { class: 'vd-st' }, 'Come leggere'),
      h('p', { class: 'small muted' }, 'Una fattura è «saldata» quando nell’estratto conto c’è il movimento che la paga: stesso importo (o le sue rate) e il nome della controparte o il numero della fattura nella causale; anche un bonifico che paga più fatture, o una fattura pagata in più volte. Le fatture dopo l’ultimo movimento dell’estratto non si possono giudicare; le integrazioni di fatture estere senza scadenza restano «da verificare».'),
      h('p', { class: 'small muted' }, 'Tocca un cliente o un fornitore per le sue fatture e, se ha fatture scadute, per il sollecito già scritto. Tutto avviene su questo dispositivo.'));
  }
  function contenuto() {
    if (!movimenti.length || !(D.fatture.length + D.acquisti.length)) return [h('div', { class: 'vd-empty' }, h('h3', {}, !movimenti.length ? 'Manca l’estratto conto' : 'Mancano le fatture'),
      h('p', {}, 'Carica insieme le fatture (XML, P7M, lo ZIP del cassetto fiscale o i PDF della fattura elettronica) e l’estratto conto dello stesso periodo (PDF della banca, anche scansionato, o il CSV dell’home banking).'))];
    const t = st.tab, scadE = A.emesse.filter(x => x.stato === 'scaduta' || x.stato === 'parziale'), scadU = A.ricevute.filter(x => x.stato === 'scaduta' || x.stato === 'parziale');
    const kpis = h('div', { class: 'vd-kpis' }, kpi('Incassato', eur(A.incassato), `${A.emesse.filter(x => x.stato === 'saldata').length} fatture saldate`),
      kpi('Da incassare, scaduto', eur(A.daIncassare), `${scadE.length} fatture · ${new Set(scadE.map(x => x.cpKey)).size} clienti`, A.daIncassare > 0 ? 'down' : 'up'),
      kpi('Ritardo medio dei clienti', A.ritardoClienti == null ? '—' : `${A.ritardoClienti} gg`, 'dalla scadenza all’incasso'),
      D.acquisti.length ? kpi('Pagato ai fornitori', eur(A.pagato), scadU.length ? `${eur(A.daPagare)} scaduti da pagare` : 'nessuna scadenza saltata') : null,
      kpi('Movimenti senza fattura', String(A.entrateSenza.length + A.usciteSenza.length), `${A.entrateSenza.length} entrate · ${A.usciteSenza.length} uscite`));
    const TABS = [['incassare', `Da incassare (${scadE.length})`], ['clienti', 'Clienti'], ['emesse', 'Tutte le emesse'], ...(D.acquisti.length ? [['pagare', `Da pagare (${scadU.length})`], ['fornitori', 'Fornitori'], ['ricevute', 'Tutte le ricevute']] : []), ['senza', 'Movimenti senza fattura']];
    const tabs = h('div', { class: 'vd-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'vd-tab' + (t === k ? ' on' : ''), 'aria-selected': String(t === k), onclick: () => { st.tab = k; draw(); } }, l)));
    const cerca = h('input', { class: 'input vd-q', type: 'search', placeholder: 'Cerca una controparte, un numero o una causale', value: st.cerca, 'aria-label': 'Cerca', oninput: e => { st.cerca = e.target.value; const p = e.target.selectionStart; draw(); const el = main.querySelector('.vd-q'); el?.focus(); try { el?.setSelectionRange(p, p); } catch { } } });
    const colF = emesse => [{ l: emesse ? 'Cliente' : 'Fornitore', f: x => h('b', {}, x.cp) }, { l: 'Fattura', f: x => `n. ${x.numero} · ${data(x.data)}` }, { l: 'Importo', num: true, f: x => eur(x.due) }, { l: 'Stato', f: x => chip(x.stato) },
      { l: emesse ? 'Incassata' : 'Pagata', f: x => x.quando ? `${data(x.quando)}${x.come && x.come !== 'importo e riferimenti' ? ` · ${x.come}` : ''}` : x.pagato > 0 ? `${eur(x.pagato)} su ${eur(x.due)}` : '—' },
      { l: 'Rispetto alla scadenza', num: true, f: x => x.ritardo != null ? h('span', { class: x.ritardo > 15 ? 'vd-neg' : '' }, x.ritardo > 0 ? `+${x.ritardo} gg` : `${x.ritardo} gg`) : x.scadutaDa != null ? h('span', { class: 'vd-neg' }, `scaduta da ${x.scadutaDa} gg`) : `scade ${data(x.scadenza)}` }];
    const body = [];
    if (t === 'incassare') body.push(sez('Fatture emesse scadute e non incassate', cerca, tabella(colF(true), filtro(scadE).sort((a, b) => (b.scadutaDa || 0) - (a.scadutaDa || 0)), { vuoto: 'Nessuna fattura scaduta da incassare: complimenti.', onRow: x => schedaControparte(x.cpKey, true) }),
      h('p', { class: 'muted small' }, 'Tocca una riga per la scheda del cliente con il sollecito già scritto (testo da copiare o PDF).')));
    if (t === 'clienti' || t === 'fornitori') { const em = t === 'clienti'; body.push(sez(em ? 'Clienti: come pagano davvero' : 'Fornitori: come li paghi', cerca, tabella([{ l: em ? 'Cliente' : 'Fornitore', f: g => h('b', {}, g.nome) }, { l: 'Fatture', num: true, f: g => String(g.n) }, { l: em ? 'Incassato' : 'Pagato', num: true, f: g => eur(g.pagato) }, { l: 'Scaduto', num: true, f: g => h('span', { class: g.scaduto > 0 ? 'vd-neg' : '' }, eur(g.scaduto)) },
      { l: 'Ritardo medio', num: true, f: g => g.ritardo == null ? '—' : `${g.ritardo > 0 ? '+' : ''}${g.ritardo} gg` }, { l: 'Giorni per pagare', num: true, f: g => g.dso == null ? '—' : `${g.dso} gg` }, { l: 'Puntuale', num: true, f: g => g.puntualita == null ? '—' : `${Math.round(g.puntualita * 100)}%` }],
      filtro((em ? A.clienti : A.fornitori).map(g => ({ ...g, cp: g.nome }))), { onRow: g => schedaControparte(g.key, em) }))); }
    if (t === 'emesse' || t === 'ricevute') body.push(sez(t === 'emesse' ? 'Tutte le fatture emesse' : 'Tutte le fatture ricevute', cerca, tabella(colF(t === 'emesse'), filtro(t === 'emesse' ? A.emesse : A.ricevute).sort((a, b) => b.data - a.data), { onRow: x => schedaControparte(x.cpKey, t === 'emesse') })));
    if (t === 'pagare') body.push(sez('Fatture ricevute scadute e non pagate', cerca, tabella(colF(false), filtro(scadU).sort((a, b) => (b.scadutaDa || 0) - (a.scadutaDa || 0)), { vuoto: 'Nessuna fattura di fornitori scaduta e non pagata.', onRow: x => schedaControparte(x.cpKey, false) })));
    if (t === 'senza') body.push(h('div', { class: 'vd-two' },
      sez('Entrate senza fattura', tabella([{ l: 'Data', f: m => data(Date.parse(m.date)) }, { l: 'Causale', f: m => m.desc }, { l: 'Importo', num: true, f: m => eur(m.v) }], filtro(A.entrateSenza), { vuoto: 'Ogni entrata ha la sua fattura.' }), h('p', { class: 'muted small' }, 'Incassi che non corrispondono a nessuna fattura caricata: fatture mancanti, anticipi, rimborsi, giroconti.')),
      sez('Uscite senza fattura', tabella([{ l: 'Data', f: m => data(Date.parse(m.date)) }, { l: 'Causale', f: m => m.desc }, { l: 'Importo', num: true, f: m => eur(m.v) }], filtro(A.usciteSenza), { vuoto: 'Ogni uscita ha la sua fattura.' }), h('p', { class: 'muted small' }, 'Stipendi, F24, commissioni, carte, prelievi o fatture di acquisto non caricate.'))));
    return [kpis, tabs, ...body];
  }
  function draw() { main.replaceChildren(h('div', { class: 'vd-body' }, ...contenuto().filter(Boolean))); }
  async function excel() {
    if (!movimenti.length) return toast('Carica anche l’estratto conto', 'error');
    await withBusy('Preparazione del file Excel…', async () => {
      const b = { bold: true, fill: '#EEF2FF' }, n = v => ({ v: +v || 0, t: 'n', fmt: '#,##0.00' }), d = t => t ? { v: Math.round((t - Date.UTC(1899, 11, 30)) / DAY), t: 'd', fmt: 'dd/mm/yyyy' } : null, s = v => ({ v: v ?? '' }), head = l => l.map(x => ({ v: x, ...b }));
      const fog = (nome, L, cp) => ({ name: nome, freeze: 1, widths: [34, 14, 12, 14, 14, 14, 14, 12, 14, 12, 50], rows: [head([cp, 'Numero', 'Data', 'Importo dovuto', 'Pagato', 'Residuo', 'Stato', 'Scadenza', 'Data pagamento', 'Giorni rispetto alla scadenza', 'Movimenti']),
        ...L.map(x => [s(x.cp), s(x.numero), d(x.data), n(x.due), n(x.pagato), n(x.residuo), s(CHIP[x.stato]?.[1] || x.stato), d(x.scadenza), d(x.quando), x.ritardo != null ? { v: x.ritardo, t: 'n', fmt: '0' } : (x.scadutaDa != null ? { v: x.scadutaDa, t: 'n', fmt: '0' } : null), s(x.movimenti.map(m => `${m.date} ${m.desc} ${m.v}`).join(' | '))])] });
      const sheets = [fog('Fatture emesse', A.emesse, 'Cliente'), ...(D.acquisti.length ? [fog('Fatture ricevute', A.ricevute, 'Fornitore')] : []),
        { name: 'Clienti', freeze: 1, widths: [34, 10, 14, 14, 14, 12, 12, 12], rows: [head(['Cliente', 'Fatture', 'Dovuto', 'Incassato', 'Scaduto', 'Ritardo medio (gg)', 'Giorni per pagare', 'Puntualità']), ...A.clienti.map(g => [s(g.nome), { v: g.n, t: 'n', fmt: '0' }, n(g.due), n(g.pagato), n(g.scaduto), g.ritardo != null ? { v: g.ritardo, t: 'n', fmt: '0' } : null, g.dso != null ? { v: g.dso, t: 'n', fmt: '0' } : null, g.puntualita != null ? { v: g.puntualita, t: 'n', fmt: '0%' } : null])] },
        { name: 'Movimenti senza fattura', freeze: 1, widths: [12, 70, 14], rows: [head(['Data', 'Causale', 'Importo']), ...[...A.entrateSenza, ...A.usciteSenza].sort((a, b) => a.date < b.date ? -1 : 1).map(m => [d(Date.parse(m.date)), s(m.desc), n(m.v)])] }];
      const bytes = await XlsxOut.build(sheets, { title: 'Incassi e pagamenti' });
      showResult([{ name: `Incassi e pagamenti - ${D.me?.nome || 'azienda'}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-'), bytes, type: XlsxOut.MIME, info: `${sheets.length} fogli` }], { title: 'Abbinamento pronto', note: 'Il file resta sul tuo dispositivo.' });
    });
  }
  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: excel }, ic('download', 18), 'Scarica l’abbinamento in Excel')]);
  ws.classList.add('vd-ws');
  if (errori.length && !invs.length && !movimenti.length) toast(`${errori.length} file non letti: ${errori[0][1]}`, 'error');
  draw(); drawSide();
}
