const FT = {
  fatture: [], righe: [], selInv: new Set(), selRig: new Set(), scarti: [],
  q: '', dal: '', al: '', cliente: '', codiva: '', tipodoc: '', origine: '', pag: '',
  ordine: { fatture: 'data', prestazioni: 'data' }, verso: { fatture: 1, prestazioni: 1 },
  cfg: { modo: 'fatture', tipo: 'attive', layout: 'cmp', tipopref: false },
};
try { Object.assign(FT.cfg, JSON.parse(localStorage.getItem('officina.fatture.cfg') || '{}')); } catch (e) { /* preferenze non disponibili */ }
const ftSaveCfg = () => { try { localStorage.setItem('officina.fatture.cfg', JSON.stringify(FT.cfg)); } catch (e) { /* niente */ } };
const FT_EXT = /\.(xml|p7m|zip|pdf)$/i;

/* —— file da una cartella trascinata (anche sottocartelle) —— */
async function filesFromDrop(dt) {
  const direct = dt.files ? [...dt.files] : [];
  const entries = [];
  if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) for (const it of [...dt.items]) { if (it.kind && it.kind !== 'file') continue; const en = it.webkitGetAsEntry(); if (en) entries.push(en); }
  if (!entries.some(e => e.isDirectory)) return direct;
  const out = [];
  const walk = async en => {
    if (en.isFile) await new Promise(res => en.file(f => { out.push(f); res(); }, res));
    else if (en.isDirectory) { const r = en.createReader(); let batch; do { batch = await new Promise(res => r.readEntries(res, () => res([]))); for (const e of batch) await walk(e); } while (batch.length); }
  };
  for (const en of entries) { try { await walk(en); } catch (e) { /* voce saltata */ } }
  return out.length ? out : direct;
}

async function startFatture(stage, files) {
  const K = FattureKit, { eur, qty, price, dt } = K.fmt;
  const c = FT.cfg;
  const inPrest = () => c.modo === 'prestazioni';
  const orig = inv => inv.origine || 'xml';
  // con il QR di pagamento SEPA (fatture emesse con IBAN nei dati di pagamento), dove c'è spazio in fondo all'ultima pagina
  const pdfOf = async inv => {
    const b = await K.creaPdf(inv, c.layout);
    if (!c.qr || typeof QrPay === 'undefined') return b;
    const d = QrPay.fromInvoice(inv); if (!EpcQr.build(d).ok) return b;
    try { return await QrPay.stamp(b, d, { pos: 'auto' }); } catch (e) { console.warn(e); return b; }
  };
  const chiave = inv => [inv.cedente.pivaRaw || inv.cedente.cf, inv.tipo, inv.numero, inv.data].join('|');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

  /* —— acquisizione —— */
  async function intake(list) {
    const fs = [...list].filter(f => FT_EXT.test(f.name));
    if (!fs.length) { toast('Nessun file XML, P7M, PDF o ZIP fra quelli scelti', 'error'); return; }
    const nuove = [], scarti = [];
    // se intanto passi a un altro strumento la lettura finisce lo stesso, ma senza toccare la sua attesa
    const g = GEN, live = () => GEN === g, set = (fr, m) => { if (live()) Busy.set(fr, m); };
    Busy.show('Lettura delle fatture…');
    try {
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        set(i / fs.length, f.name); await tick();
        try {
          if (/\.zip$/i.test(f.name)) {
            const entries = await K.zipRead(await f.arrayBuffer());
            for (const e of entries) {
              if (!/\.(xml|p7m|pdf)$/i.test(e.name)) continue;
              const nome = e.name.split('/').pop();
              try {
                if (/\.pdf$/i.test(nome)) { set(i / fs.length, nome); await tick(); nuove.push(...await K.leggiPdf(e.data, nome)); }
                else nuove.push(...K.leggiBytes(e.data, nome));
              } catch (err) { scarti.push([e.name, err.message]); }
            }
          } else if (/\.pdf$/i.test(f.name)) nuove.push(...await K.leggiPdf(new Uint8Array(await f.arrayBuffer()), f.name));
          else nuove.push(...K.leggiBytes(new Uint8Array(await f.arrayBuffer()), f.name));
        } catch (err) { scarti.push([f.name, err.message || 'file non leggibile']); }
      }
    } finally { if (Busy.gen === g) Busy.hide(); }
    const idx = new Map(FT.fatture.map(inv => [chiave(inv), inv]));
    let dupli = 0, agg = 0, sost = 0;
    for (const inv of nuove) {
      const k = chiave(inv), gia = idx.get(k);
      if (gia) {
        // la stessa fattura già letta da PDF: l'XML, esatto, prende il suo posto
        if (orig(gia) !== 'xml' && orig(inv) === 'xml') { rimuovi(gia); sost++; agg--; } else { dupli++; continue; }
      }
      idx.set(k, inv); FT.fatture.push(inv); FT.selInv.add(inv.id);
      const r = K.esplodi(inv); r.forEach(x => FT.selRig.add(x.id)); FT.righe.push(...r);
      agg++;
    }
    FT.fatture.sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.numero || '').localeCompare(b.numero || ''));
    FT.scarti = FT.scarti.concat(scarti);
    FT.refresh();   // la vista attuale (anche se nel frattempo lo strumento è stato riaperto)
    if (!live() && CURRENT_TOOL !== 'fatture') return;
    const daPdf = nuove.filter(x => orig(x) === 'pdf' && FT.fatture.includes(x));
    const daVerif = daPdf.filter(x => x.avvisi && x.avvisi.length).length;
    const n = agg + sost;
    toast(n > 0 ? [plural(n, 'fattura', 'fatture'), plural(FT.righe.length, 'prestazione', 'prestazioni'),
      daPdf.length ? `${daPdf.length} da PDF${daVerif ? ` (${daVerif} da verificare)` : ''}` : '', sost ? `${sost} sostituite dall’XML` : '', dupli ? `${dupli} già presenti` : '',
      scarti.length ? plural(scarti.length, 'file non elaborato', 'file non elaborati') : ''].filter(Boolean).join(' · ')
      : dupli ? 'Erano già tutte in elenco' : 'Nessuna fattura trovata', n > 0 ? 'ok' : 'error');
  }
  function rimuovi(inv) {
    FT.fatture = FT.fatture.filter(i => i !== inv);
    FT.righe = FT.righe.filter(r => { if (r.inv === inv) { FT.selRig.delete(r.id); return false; } return true; });
    FT.selInv.delete(inv.id);
  }

  /* —— filtri —— */
  const selCliente = h('select', { class: 'input', onchange: e => { FT.cliente = e.target.value; draw(); } });
  const selIva = h('select', { class: 'input', onchange: e => { FT.codiva = e.target.value; draw(); } });
  const selTipo = h('select', { class: 'input', onchange: e => { FT.tipodoc = e.target.value; draw(); } });
  const selOrig = h('select', { class: 'input', onchange: e => { FT.origine = e.target.value; draw(); } },
    [['', 'Tutte'], ['xml', 'Da XML'], ['pdf', 'Lette da PDF'], ['verif', 'Da verificare']].map(([v, l]) => h('option', { value: v }, l)));
  const inDal = h('input', { class: 'input', type: 'date', onchange: e => { FT.dal = e.target.value; draw(); } });
  const inAl = h('input', { class: 'input', type: 'date', onchange: e => { FT.al = e.target.value; draw(); } });
  const selPag = h('select', { class: 'input', onchange: e => { FT.pag = e.target.value; draw(); } });
  /* metodo di pagamento: la famiglia (Bonifico, Carta, Contanti…), «oltre soglia» per i contanti da 5.000 euro in su */
  const famDi = inv => inv.metodo ? inv.metodo.famiglia : 'nd';
  const FAMN = K.tabelle.PAG_FAM_NOME, ORD_FAM = ['bonifico', 'carta', 'contanti', 'addebito', 'bollettino', 'assegno', 'altro', 'misto', 'nd'];
  const passaPag = (inv, f = FT.pag) => !f || (f === 'soglia' ? !!(inv.metodo && inv.metodo.oltreSoglia) : famDi(inv) === f);
  function popolaFiltri() {
    const cl = new Set(), ci = new Set(), td = new Set();
    FT.fatture.forEach(inv => { const n = K.nomeControparte(inv, c.tipo); if (n) cl.add(n); (inv.codiciIva || []).forEach(k => ci.add(k)); if (inv.tipo) td.add(inv.tipo + ' — ' + inv.tipoBreve); });
    const fill = (el, voci, tutti, curv) => { el.replaceChildren(h('option', { value: '' }, tutti), ...voci.map(v => h('option', { value: v }, v))); el.value = voci.includes(curv) ? curv : ''; return el.value; };
    FT.cliente = fill(selCliente, [...cl].sort((a, b) => a.localeCompare(b, 'it')), 'Tutte', FT.cliente);
    FT.codiva = fill(selIva, [...ci].sort(), 'Tutti', FT.codiva);
    FT.tipodoc = fill(selTipo, [...td].sort(), 'Tutti', FT.tipodoc);
    const fams = ORD_FAM.filter(f => FT.fatture.some(inv => famDi(inv) === f)), soglia = FT.fatture.some(inv => inv.metodo && inv.metodo.oltreSoglia);
    selPag.replaceChildren(h('option', { value: '' }, 'Tutti'), ...fams.map(f => h('option', { value: f }, FAMN[f])), soglia ? h('option', { value: 'soglia' }, 'Contanti da 5.000 € in su') : null);
    if (![...selPag.options].some(o => o.value === FT.pag)) FT.pag = '';
    selPag.value = FT.pag;
    selOrig.value = FT.origine; inDal.value = FT.dal; inAl.value = FT.al;
  }
  const daVerificare = inv => orig(inv) === 'pdf' ? !!(inv.avvisi && inv.avvisi.length) : inv.quadra === false;
  function passa(inv, codRiga) {
    const d = inv.data || '';
    if (FT.dal && d < FT.dal) return false;
    if (FT.al && d > FT.al) return false;
    if (FT.cliente && K.nomeControparte(inv, c.tipo) !== FT.cliente) return false;
    if (FT.tipodoc && (inv.tipo + ' — ' + inv.tipoBreve) !== FT.tipodoc) return false;
    if (FT.origine === 'xml' && orig(inv) === 'pdf') return false;
    if (FT.origine === 'pdf' && orig(inv) === 'xml') return false;
    if (FT.origine === 'verif' && !daVerificare(inv)) return false;
    if (FT.codiva && !(codRiga !== undefined ? [codRiga] : (inv.codiciIva || [])).includes(FT.codiva)) return false;
    if (!passaPag(inv)) return false;
    return true;
  }
  const parole = () => FT.q.toLowerCase().split(/\s+/).filter(Boolean);
  const metodoTxt = inv => inv.metodo && inv.metodo.codici.length ? [inv.metodo.nome, K.metodoBreve(inv.metodo), inv.metodo.codici.join(' '), 'pagamento'].join(' ') : '';
  const testoF = inv => [K.nomeControparte(inv, c.tipo), inv.numero, inv.tipoBreve, dt(inv.data), (inv.codiciIva || []).join(' '), (inv.causali || []).join(' '), inv.srcName, (inv.righe || []).map(l => l.desc).join(' '), metodoTxt(inv)].join(' ').toLowerCase();
  const testoR = r => [r.desc, r.codici, r.sconti, r.gestionali, r.rifAmm, r.cessione, K.nomeControparte(r.inv, c.tipo), r.inv.numero, dt(r.inv.data), r.codIva, r.periodo, r.inv.tipoBreve, (r.inv.causali || []).join(' '), r.inv.srcName, metodoTxt(r.inv)].join(' ').toLowerCase();
  const match = (t, p) => !p.length || p.every(w => t.includes(w));
  const fattureF = () => { const p = parole(); return FT.fatture.filter(inv => passa(inv) && match(testoF(inv), p)); };
  const righeF = () => { const p = parole(); return FT.righe.filter(r => passa(r.inv, r.codIva) && match(testoR(r), p)); };
  const filtrate = () => inPrest() ? righeF() : fattureF();
  const selCorr = () => inPrest() ? FT.selRig : FT.selInv;
  function ordina(list) {
    const m = c.modo, v = FT.verso[m], k = FT.ordine[m];
    const keys = inPrest() ? { nome: r => K.nomeControparte(r.inv, c.tipo).toLowerCase(), desc: r => (r.desc || '').toLowerCase(), num: r => (r.inv.numero || '').toLowerCase(), data: r => (r.inv.data || '') + ' ' + (r.inv.numero || ''), importo: r => r.importo || 0 }
      : { nome: i => K.nomeControparte(i, c.tipo).toLowerCase(), tipo: i => i.tipoBreve || '', pag: i => ORD_FAM.indexOf(famDi(i)) + ' ' + K.metodoBreve(i.metodo), num: i => (i.numero || '').toLowerCase(), data: i => (i.data || '') + ' ' + (i.numero || ''), importo: i => i.totale || 0 };
    const key = keys[k] || keys.data;
    return list.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'it')) * v; });
  }
  function evid(t) {
    const ws = parole().filter(w => w.length > 1);
    const s0 = String(t == null ? '' : t);
    if (!ws.length) return esc(s0);
    const re = new RegExp('(' + ws.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return s0.split(re).map((part, i) => i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join('');
  }
  function marca(inv) {
    const o = orig(inv); let s = '';
    if (o === 'pdf') s += inv.daScansione ? ' <span class="ft-orig" title="Fattura scansionata: pagina migliorata e letta con il riconoscimento del testo (OCR)">OCR</span>' : ' <span class="ft-orig" title="Dati letti dal layout del PDF">PDF</span>';
    if (o === 'pdfxml') s += ' <span class="ft-orig" title="PDF con l’XML della fattura incorporato: dati esatti">PDF·XML</span>';
    if (o === 'pdf' && inv.avvisi && inv.avvisi.length) s += ` <span class="ft-warn" title="${esc('Da verificare: ' + inv.avvisi.join('; '))}">!</span>`;
    return s;
  }

  /* —— registro —— */
  const COL = {
    fatture: [{ l: 'Tipo', s: 'tipo', c: 'hide-s' }, { l: 'Numero', s: 'num' }, { l: 'Data', s: 'data' }, { l: 'Controparte', s: 'nome' }, { l: 'Pagamento', s: 'pag', c: 'hide-s' }, { l: 'Cod. IVA', c: 'hide-m' },
      { l: 'Imponibile', n: 1, c: 'hide-m' }, { l: 'Imposta', n: 1, c: 'hide-m' }, { l: 'Ritenuta', n: 1, c: 'hide-s' }, { l: 'Totale', n: 1, s: 'importo' }, { l: '' }],
    prestazioni: [{ l: 'Nome / Cognome', s: 'nome' }, { l: 'Descrizione', s: 'desc' }, { l: 'Fattura', s: 'num', c: 'hide-s' }, { l: 'Data', s: 'data' },
      { l: 'Importo', n: 1, s: 'importo' }, { l: 'Cod. IVA', c: 'hide-m' }, { l: 'Imposte', n: 1, c: 'hide-m' }, { l: 'Ritenute', n: 1, c: 'hide-m' }, { l: '' }],
  };
  const PREV = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const DLI = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>';
  function rigaF(inv) {
    const on = FT.selInv.has(inv.id), cp = K.controparte(inv, c.tipo) || {};
    const warn = inv.quadra === false && orig(inv) !== 'pdf' ? ' <span class="ft-warn" title="Imponibile più imposta non coincide con il totale dichiarato">!</span>' : '';
    return `<tr class="${on ? 'sel' : ''}" data-id="${inv.id}"><td class="ctrl"><input type="checkbox" ${on ? 'checked' : ''} aria-label="Seleziona"></td>` +
      `<td class="tipo hide-s"><span class="ft-tipo">${esc(inv.tipoBreve)}</span></td><td class="docnum">${evid(inv.numero)}${marca(inv)}</td><td class="date">${esc(dt(inv.data))}</td>` +
      `<td class="cp">${evid(cp.nome || '')}<small>${esc(cp.piva || cp.cf || '')}</small></td><td class="pag hide-s">${K.pagChip(inv.metodo)}</td><td class="iva hide-m">${esc((inv.codiciIva || []).join(' · '))}</td>` +
      `<td class="num hide-m">${eur(inv.imponibile)}</td><td class="num hide-m">${eur(inv.imposta)}</td><td class="num hide-s">${inv.ritenutaTot ? eur(inv.ritenutaTot) : ''}</td>` +
      `<td class="num tot">${inv.totale == null ? '' : eur(inv.totale)}${warn}</td>` +
      `<td class="acts"><button class="icon-btn" data-act="prev" title="Anteprima" aria-label="Anteprima">${PREV}</button><button class="icon-btn" data-act="pdf" title="Scarica il PDF" aria-label="Scarica il PDF">${DLI}</button></td></tr>`;
  }
  function rigaP(r) {
    const on = FT.selRig.has(r.id), cp = K.controparte(r.inv, c.tipo) || {};
    const nota = [r.codici, r.cessione, r.qta != null ? qty(r.qta) + (r.um ? ' ' + r.um : '') + ' × ' + price(r.prezzo) : '', r.sconti, r.periodo, r.gestionali, r.rifAmm ? 'rif. amm. ' + r.rifAmm : '', r.conRitenuta ? 'soggetta a ritenuta' : ''].filter(Boolean).join('  ·  ');
    return `<tr class="${on ? 'sel' : ''}" data-id="${r.id}" data-inv="${r.inv.id}"><td class="ctrl"><input type="checkbox" ${on ? 'checked' : ''} aria-label="Seleziona"></td>` +
      `<td class="cp">${evid(cp.nome || '')}<small>${esc(cp.piva || cp.cf || '')}</small></td>` +
      `<td class="de">${r.vuota ? '<span class="ft-deriv">(fattura senza righe di dettaglio)</span>' : r.desc ? evid(r.desc) : '<span class="ft-deriv">(descrizione assente)</span>'}${nota ? `<small>${esc(nota)}</small>` : ''}</td>` +
      `<td class="docnum hide-s">${evid(r.inv.numero)}${marca(r.inv)}</td><td class="date">${esc(dt(r.inv.data))}</td>` +
      `<td class="num">${r.importo == null ? '' : eur(r.importo)}</td><td class="iva hide-m">${esc(r.codIva)}</td>` +
      `<td class="num hide-m">${r.imposta == null ? '' : eur(r.imposta)}${r.derivata && r.imposta ? ' <span class="ft-deriv" title="Calcolata dall’aliquota di riga: il tracciato non espone l’imposta per singola riga">°</span>' : ''}</td>` +
      `<td class="num hide-m">${r.ritenuta ? eur(r.ritenuta) + ' <span class="ft-deriv" title="Ripartita fra le righe: il tracciato espone la ritenuta solo a livello di documento">°</span>' : ''}</td>` +
      `<td class="acts"><button class="icon-btn" data-act="prev" title="Anteprima della fattura" aria-label="Anteprima">${PREV}</button></td></tr>`;
  }
  function totali(list) {
    if (!list.length) return '';
    const sel = selCorr(), scelte = list.filter(r => sel.has(r.id));
    const riga = (et, l, cls) => {
      if (inPrest()) {
        const s = l.reduce((a, r) => ({ importo: a.importo + (r.importo || 0), imposta: a.imposta + (r.imposta || 0), ritenuta: a.ritenuta + (r.ritenuta || 0) }), { importo: 0, imposta: 0, ritenuta: 0 });
        const nf = new Set(l.map(r => r.inv.id)).size;
        return `<tr class="${cls}"><td></td><td colspan="2" class="lab">${et} · ${plural(l.length, 'prestazione', 'prestazioni')} da ${plural(nf, 'fattura', 'fatture')}</td><td class="hide-s"></td><td></td><td class="num">${eur(s.importo)}</td><td class="hide-m"></td><td class="num hide-m">${eur(s.imposta)}</td><td class="num hide-m">${s.ritenuta ? eur(s.ritenuta) : ''}</td><td></td></tr>`;
      }
      const s = l.reduce((a, i) => ({ imponibile: a.imponibile + (i.imponibile || 0), imposta: a.imposta + (i.imposta || 0), ritenuta: a.ritenuta + (i.ritenutaTot || 0), totale: a.totale + (i.totale || 0) }), { imponibile: 0, imposta: 0, ritenuta: 0, totale: 0 });
      return `<tr class="${cls}"><td></td><td class="hide-s"></td><td colspan="3" class="lab">${et} · ${plural(l.length, 'fattura', 'fatture')}</td><td class="hide-s"></td><td class="hide-m"></td><td class="num hide-m">${eur(s.imponibile)}</td><td class="num hide-m">${eur(s.imposta)}</td><td class="num hide-s">${s.ritenuta ? eur(s.ritenuta) : ''}</td><td class="num">${eur(s.totale)}</td><td></td></tr>`;
    };
    let out = riga('Totale in elenco', list, '');
    if (scelte.length && scelte.length !== list.length) out += riga('Di cui selezionate', scelte, 'second');
    return out;
  }

  /* —— anteprima: le pagine disegnate, il download e gli allegati della fattura —— */
  async function anteprima(inv) {
    const bytes = await withBusy('Creazione dell’anteprima…', () => pdfOf(inv));
    if (!bytes) return;
    const nome = K.nomeFile(inv, c);
    const pages = h('div', { class: 'ft-pages' });
    const att = K.allegati(inv);
    const m = modal([
      h('div', { class: 'ft-prev-head' },
        h('div', { class: 'grow' }, h('h3', {}, nome.replace(/\.pdf$/, ''), ' ', h('span', { html: K.pagChip(inv.metodo) })), h('div', { class: 'muted small' }, inv.pdfBytes ? 'PDF originale' + (inv.tot > 1 ? `, documento ${inv.idx + 1} di ${inv.tot}` : '') : c.layout === 'min' ? 'Layout esteso, con tutte le sezioni' : 'Layout standard del foglio di stile')),
        h('button', { class: 'btn sm primary', onclick: () => download(bytes, nome, 'application/pdf') }, ic('download', 15), 'Scarica il PDF'),
        iconBtn('x', 'Chiudi', () => m.close())),
      att.length ? h('div', { class: 'ft-att' }, h('span', { class: 'sec-t' }, plural(att.length, 'allegato nella fattura', 'allegati nella fattura')),
        att.map(a => h('button', { class: 'chip', title: a.desc || a.nome, onclick: () => download(a.bytes, a.nome, /\.pdf$/i.test(a.nome) ? 'application/pdf' : 'application/octet-stream') }, ic('download', 14), a.nome))) : null,
      pages,
    ], { width: 900 });
    let d = null;
    try {
      d = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      const W = Math.min(820, window.innerWidth - 64), dpr = Math.min(2, window.devicePixelRatio || 1);
      for (let p = 1; p <= d.numPages; p++) {
        if (!pages.isConnected && p > 1) break;
        const pg = await d.getPage(p), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: W / v0.width * dpr });
        const cv = h('canvas', { class: 'ft-page', width: Math.floor(v.width), height: Math.floor(v.height) });
        cv.style.width = W + 'px';
        pages.append(cv);
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise;
      }
    } catch (e) { console.warn(e); pages.append(h('p', { class: 'muted' }, 'Anteprima non disponibile: scarica il PDF per vederlo.')); }
    finally { try { d?.destroy(); } catch (e) { /* già chiuso */ } }
  }

  /* —— esportazione —— */
  async function scaricaUno(inv) {
    if (Busy.el) return;   // niente doppi download con il doppio clic
    const bytes = await withBusy('Creazione del PDF…', () => pdfOf(inv));
    if (bytes) download(bytes, K.nomeFile(inv, c), 'application/pdf');
  }
  const oggi = () => new Date().toISOString().slice(0, 10);
  async function esportaPdf() {
    const scelte = ordina(fattureF()).filter(i => FT.selInv.has(i.id));
    if (!scelte.length) return;
    const nomi = K.nomiUnivoci(scelte, c);
    if (scelte.length === 1) {
      const bytes = await withBusy('Creazione del PDF…', () => pdfOf(scelte[0]));
      if (!bytes) return;
      showResult([{ name: nomi[0], bytes, type: 'application/pdf', info: scelte[0].pdfBytes ? 'PDF originale' : c.layout === 'min' ? 'layout esteso' : 'layout standard' }], { title: 'La fattura è pronta' });
      return;
    }
    const files = [], errori = [];
    // un lavoro vero (anche centinaia di fatture): si può annullare o mandare in secondo piano
    await withBusy('Creazione dei PDF delle fatture…', async () => {
      for (let i = 0; i < scelte.length; i++) {
        Busy.check();
        Busy.set(i / scelte.length, `${i + 1} di ${scelte.length} — ${nomi[i]}`); await tick();
        try { files.push({ name: nomi[i], data: await pdfOf(scelte[i]) }); }
        catch (e) { errori.push([nomi[i], 'errore in stampa: ' + e.message]); }
      }
      if (errori.length) { FT.scarti.push(...errori); draw(); }
      if (!files.length) { toast('Nessun PDF creato: vedi «File non elaborati»', 'error'); return; }
      Busy.set(1, 'Creazione dell’archivio…'); await tick();
      const zip = K.zipCreate(files);
      showResult([{ name: `Fatture ${oggi()} (${files.length}).zip`, bytes: zip, type: 'application/zip', info: plural(files.length, 'PDF', 'PDF') }],
        { title: `${plural(files.length, 'fattura pronta', 'fatture pronte')} in un unico archivio`, note: errori.length ? `${plural(errori.length, 'fattura non creata', 'fatture non create')}: vedi «File non elaborati».` : null });
    }, { cancellable: true });
  }
  /* colonne dell'Excel delle prestazioni: le stesse di Fatture XML, nello stesso ordine */
  const cfCp = inv => { const a = K.controparte(inv, c.tipo); return a ? (a.cf || a.pivaRaw || '') : ''; };
  const pivaCp = inv => { const a = K.controparte(inv, c.tipo); return a && a.piva ? a.piva : ''; };
  const COLS_X = [
    ['Nome / Cognome', 32, 's', r => K.nomeControparte(r.inv, c.tipo)], ['Codice fiscale', 20, 's', r => cfCp(r.inv)], ['Partita IVA', 18, 's', r => pivaCp(r.inv)],
    ['Descrizione', 60, 's', r => r.desc], ['Riferimento fattura', 18, 's', r => r.inv.numero], ['Data', 12, 'd', r => r.inv.data], ['Importo', 14, 'n', r => r.importo],
    ['Codice IVA', 12, 's', r => r.codIva], ['Imposte', 14, 'n', r => r.imposta], ['Ritenute', 14, 'n', r => r.ritenuta],
    ['Tipo documento', 20, 's', r => r.inv.tipo + (r.inv.tipoBreve ? ' ' + r.inv.tipoBreve : '')], ['N. linea', 9, 's', r => r.n], ['Quantità', 11, 'n', r => r.qta], ['U.M.', 8, 's', r => r.um],
    ['Prezzo unitario', 14, 'n', r => r.prezzo], ['Sconto / magg.', 18, 's', r => r.sconti], ['Periodo', 20, 's', r => r.periodo], ['Codice articolo', 22, 's', r => r.codici],
    ['Riferimento normativo', 24, 's', r => r.norma], ['Tipo cessione', 16, 's', r => r.cessione], ['Altri dati gestionali', 26, 's', r => r.gestionali], ['Rif. amministrazione', 20, 's', r => r.rifAmm],
    ['Soggetta a ritenuta', 16, 's', r => r.conRitenuta ? 'SI' : ''], ['Causale documento', 34, 's', r => (r.inv.causali || []).join(' · ')], ['Metodo di pagamento', 24, 's', r => metodoX(r.inv)], ['File di origine', 28, 's', r => r.inv.srcName],
    ['Origine dato', 22, 's', r => ({ xml: 'XML', pdf: 'PDF (lettura del layout)', pdfxml: 'PDF (XML incorporato)' })[orig(r.inv)]],
    ['Esito controlli', 48, 's', r => orig(r.inv) === 'pdf' ? (r.inv.avvisi && r.inv.avvisi.length ? 'DA VERIFICARE: ' + r.inv.avvisi.join('; ') : 'OK') : (r.inv.quadra === false ? 'imponibile più imposta non coincide con il totale' : '')],
  ];
  // nel foglio: il nome completo del metodo; «non indicato» quando la fattura non ha i dati di pagamento; la soglia del contante segnalata
  const metodoX = inv => !inv.metodo || !inv.metodo.codici.length ? 'Non indicato' : inv.metodo.nome + (inv.metodo.oltreSoglia ? ' (contanti da 5.000 € in su: da verificare)' : '');
  const HEAD = v => ({ t: 's', v, bold: true, fill: Brand.C.ink, color: '#FFFFFF', valign: 'center', wrap: true, border: { b: 'medium' } });
  const cellX = (t, v) => {
    if (v == null || v === '') return null;
    if (t === 'n') return typeof v === 'number' && isFinite(v) ? { t: 'n', v, fmt: '#,##0.00' } : { t: 's', v: String(v) };
    if (t === 'd') { const s = K.serialeData(v); return s != null ? { t: 'd', v: s, fmt: 'dd/mm/yyyy' } : { t: 's', v: String(v) }; }
    return { t: 's', v: String(v), valign: 'top', wrap: String(v).length > 60 };
  };
  const fogliRegistro = list => {
    const cols = [['Tipo', 16, 's', i => i.tipo + ' ' + (i.tipoBreve || '')], ['Numero', 14, 's', i => i.numero], ['Data', 12, 'd', i => i.data], ['Controparte', 34, 's', i => K.nomeControparte(i, c.tipo)],
      ['Codice fiscale', 20, 's', i => cfCp(i)], ['Partita IVA', 18, 's', i => pivaCp(i)], ['Codici IVA', 14, 's', i => (i.codiciIva || []).join(' · ')], ['Imponibile', 14, 'n', i => i.imponibile],
      ['Imposta', 14, 'n', i => i.imposta], ['Ritenuta', 14, 'n', i => i.ritenutaTot || null], ['Totale documento', 16, 'n', i => i.totale], ['Metodo di pagamento', 24, 's', i => metodoX(i)], ['Codice modalità', 12, 's', i => i.metodo ? i.metodo.codici.join(' · ') : ''],
      ['Contanti', 14, 'n', i => i.metodo && i.metodo.contanti ? i.metodo.contanti : null], ['File di origine', 28, 's', i => i.srcName],
      ['Origine dato', 22, 's', i => ({ xml: 'XML', pdf: 'PDF (lettura del layout)', pdfxml: 'PDF (XML incorporato)' })[orig(i)]]];
    const n = list.length, L = XlsxOut.colName;
    const sum = ci => ({ t: 'n', v: list.reduce((a, i) => a + (cols[ci][3](i) || 0), 0), f: `SUBTOTAL(9,${L(ci)}2:${L(ci)}${n + 1})`, fmt: '#,##0.00', bold: true, border: { t: 'thin' } });
    return { name: 'Fatture', freeze: 1, tabColor: Brand.C.ink2, autoFilter: `A1:${L(cols.length - 1)}${n + 1}`, widths: cols.map(x => x[1]),
      rows: [cols.map(x => HEAD(x[0])), ...list.map(i => cols.map(x => cellX(x[2], x[3](i)))),
        cols.map((x, ci) => ci === 0 ? { t: 's', v: 'Totale', bold: true, border: { t: 'thin' } } : x[2] === 'n' ? sum(ci) : { t: 's', v: '', border: { t: 'thin' } })] };
  };
  async function esportaXls() {
    const scelte = ordina(righeF()).filter(r => FT.selRig.has(r.id));
    if (!scelte.length) return;
    const n = scelte.length, L = XlsxOut.colName;
    const sheet = { name: 'Prestazioni', freeze: 1, tabColor: Brand.C.accent, autoFilter: `A1:${L(COLS_X.length - 1)}${n + 1}`, widths: COLS_X.map(x => x[1]), heights: [30],
      rows: [COLS_X.map(x => HEAD(x[0])), ...scelte.map(r => COLS_X.map(x => cellX(x[2], x[3](r))))] };
    const invs = [...new Set(scelte.map(r => r.inv))];
    try {
      const bytes = await withBusy('Creazione del foglio Excel…', () => XlsxOut.build([sheet, fogliRegistro(invs)], { title: 'Prestazioni', font: 'Instrument Sans', fontSize: 10 }));
      if (!bytes) return;
      showResult([{ name: `Prestazioni ${oggi()} (${n}).xlsx`, bytes, type: XlsxOut.MIME, info: `${plural(n, 'riga', 'righe')} · ${COLS_X.length} colonne` }],
        { title: 'Il foglio delle prestazioni è pronto', note: `Foglio «Prestazioni» con tutte le ${COLS_X.length} colonne e foglio «Fatture» con il registro delle ${plural(invs.length, 'fattura', 'fatture')} e i totali.` });
    } catch (e) { console.error(e); toast('Non è stato possibile creare il file: ' + e.message, 'error'); }
  }
  async function esportaRegistro() {
    const scelte = ordina(fattureF()).filter(i => FT.selInv.has(i.id));
    if (!scelte.length) return;
    try {
      const bytes = await withBusy('Creazione del registro…', () => XlsxOut.build([fogliRegistro(scelte)], { title: 'Registro fatture', font: 'Instrument Sans', fontSize: 10 }));
      if (!bytes) return;
      showResult([{ name: `Registro fatture ${oggi()} (${scelte.length}).xlsx`, bytes, type: XlsxOut.MIME, info: plural(scelte.length, 'fattura', 'fatture') }], { title: 'Il registro è pronto' });
    } catch (e) { console.error(e); toast('Non è stato possibile creare il file: ' + e.message, 'error'); }
  }

  /* —— interfaccia —— */
  const regBtn = h('button', { class: 'btn sm ft-reg', title: 'Il registro delle fatture selezionate, con i totali', onclick: esportaRegistro }, ic('table', 15), h('span', { class: 'th-l' }, 'Registro Excel'));
  const fileInp = h('input', { type: 'file', multiple: true, hidden: true, accept: '.xml,.p7m,.zip,.pdf,application/xml,text/xml,application/zip,application/pdf', onchange: () => { const f = [...fileInp.files]; fileInp.value = ''; intake(f); } });
  const dirInp = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: '', directory: '', onchange: () => { const f = [...dirInp.files]; dirInp.value = ''; intake(f); } });
  const search = h('input', { class: 'input ft-search', type: 'search', placeholder: 'Cerca', autocomplete: 'off', 'aria-label': 'Cerca', value: FT.q, oninput: e => { FT.q = e.target.value; drawList(); } });
  const title = h('h3', { class: 'ft-title' });
  const count = h('span', { class: 'ft-count muted small' });
  const thead = h('thead'), tbody = h('tbody'), tfoot = h('tfoot');
  const table = h('table', { class: 'ft-table' }, thead, tbody, tfoot);
  const empty = h('div', { class: 'ft-empty' });
  const errBox = h('div', { class: 'ft-err' });
  const pagBar = h('div', { class: 'pag-bar', role: 'group', 'aria-label': 'Metodo di pagamento' });
  const twrap = h('div', { class: 'ft-tw' }, table);
  { const sh = h('div', { class: 'ft-sh', 'aria-hidden': 'true' }, h('i', { class: 'l' }), h('i', { class: 'r' })); twrap.prepend(sh);
    const upd = () => { sh.style.setProperty('--h', twrap.clientHeight + 'px'); twrap.classList.toggle('sl', twrap.scrollLeft > 2); twrap.classList.toggle('sr', twrap.scrollLeft + twrap.clientWidth < twrap.scrollWidth - 2); };
    twrap.addEventListener('scroll', upd, { passive: true }); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(upd).observe(twrap); requestAnimationFrame(upd); }
  const main = h('div', { class: 'ws-main ft-main' },
    h('div', { class: 'ft-head' }, h('div', { class: 'ft-ht' }, title, count),
      h('div', { class: 'ft-tools' }, search,
        h('button', { class: 'btn sm ghost', onclick: () => { const s = selCorr(); filtrate().forEach(r => s.add(r.id)); draw(); } }, 'Seleziona tutto'),
        h('button', { class: 'btn sm ghost', onclick: () => { const s = selCorr(); filtrate().forEach(r => s.delete(r.id)); draw(); } }, 'Deseleziona'),
        regBtn,
        h('button', { class: 'btn sm ghost ft-clear', title: 'Togli tutte le fatture dall’elenco', onclick: svuota }, ic('trash', 15), h('span', { class: 'th-l' }, 'Svuota')))),
    pagBar, empty, twrap, errBox, fileInp, dirInp);

  const noteTipo = h('p', { class: 'muted small ft-note' }), noteLay = h('p', { class: 'muted small ft-note' });
  const nameSpec = h('code', { class: 'ft-name' });
  const modoSeg = h('div', { class: 'ft-modo' });
  const drawModo = () => modoSeg.replaceChildren(...[['fatture', 'Fatture', 'PDF', 'file'], ['prestazioni', 'Prestazioni', 'Excel', 'table']].map(([v, l, s, icn]) =>
    h('button', { class: 'ft-mode' + (c.modo === v ? ' on' : ''), 'aria-pressed': String(c.modo === v), onclick: () => { if (c.modo === v) return; c.modo = v; ftSaveCfg(); drawModo(); draw(); } }, ic(icn, 18), h('span', {}, h('b', {}, l), h('small', {}, s)))));
  drawModo();
  const exportBtn = h('button', { class: 'btn primary big btn-run', onclick: () => inPrest() ? esportaXls() : esportaPdf() });
  const actNote = h('div', { class: 'muted small ft-act' });
  workspace(stage, main, [
    sec('Cosa vuoi ottenere', modoSeg),
    sec('Fatture da elaborare', seg([['attive', 'Emesse (attive)'], ['passive', 'Ricevute (passive)']], c.tipo, v => { c.tipo = v; ftSaveCfg(); FT.cliente = ''; popolaFiltri(); draw(); }), noteTipo),
    sec('Layout del PDF', seg([['cmp', 'Standard'], ['min', 'Esteso']], c.layout, v => { c.layout = v; ftSaveCfg(); draw(); }), noteLay,
      checkbox('Tipo documento come prefisso del nome', c.tipopref, v => { c.tipopref = v; ftSaveCfg(); draw(); }, 'Al posto di «Fattura»: Nota di credito, Parcella…'),
      checkbox('QR di pagamento SEPA sul PDF', !!c.qr, v => { c.qr = v; ftSaveCfg(); }, 'Per le fatture con l’IBAN nei dati di pagamento: chi la riceve paga inquadrando il codice con l’app della banca.'),
      h('div', { class: 'ft-spec' }, h('span', { class: 'muted small' }, 'Nome del PDF'), nameSpec)),
    sec('Filtri',
      h('label', { class: 'ft-f' }, h('span', {}, 'Controparte'), selCliente),
      h('div', { class: 'ft-f2' }, h('label', { class: 'ft-f' }, h('span', {}, 'Dal'), inDal), h('label', { class: 'ft-f' }, h('span', {}, 'Al'), inAl)),
      h('div', { class: 'ft-f2' }, h('label', { class: 'ft-f' }, h('span', {}, 'Codice IVA'), selIva), h('label', { class: 'ft-f' }, h('span', {}, 'Tipo doc.'), selTipo)),
      h('div', { class: 'ft-f2' }, h('label', { class: 'ft-f' }, h('span', {}, 'Pagamento'), selPag), h('label', { class: 'ft-f' }, h('span', {}, 'Origine dei dati'), selOrig)),
      h('button', { class: 'btn sm ghost', style: { width: '100%' }, onclick: () => { FT.q = FT.dal = FT.al = FT.cliente = FT.codiva = FT.tipodoc = FT.origine = FT.pag = ''; search.value = ''; popolaFiltri(); draw(); } }, ic('reset', 15), 'Azzera i filtri')),
    sec('Aggiungi fatture',
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm', onclick: () => fileInp.click() }, ic('plus', 15), 'File'),
        h('button', { class: 'btn sm', onclick: () => dirInp.click() }, ic('layers', 15), 'Cartella')),
      h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, '.xml, .xml.p7m, ZIP del cassetto fiscale, PDF nel formato del foglio di stile. Puoi anche trascinarli sull’elenco.')),
  ], [actNote, exportBtn]);
  // si possono trascinare fatture (anche cartelle) su tutto lo strumento, pannello compreso
  const ws = stage.querySelector('.ws');
  ws.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); main.classList.add('over'); } });
  ws.addEventListener('dragleave', e => { if (!ws.contains(e.relatedTarget)) main.classList.remove('over'); });
  ws.addEventListener('drop', async e => { e.preventDefault(); main.classList.remove('over'); intake(await filesFromDrop(e.dataTransfer)); });

  function drawHead() {
    const fr = s => s === FT.ordine[c.modo] ? ` <span class="fr">${FT.verso[c.modo] > 0 ? '↑' : '↓'}</span>` : '';
    thead.innerHTML = '<tr><th class="ctrl"><input type="checkbox" class="ft-all" aria-label="Seleziona tutte"></th>' +
      COL[c.modo].map(x => `<th class="${[x.n ? 'num' : '', x.c || '', x.s ? 'ord' : ''].filter(Boolean).join(' ')}"${x.s ? ` data-s="${x.s}" tabindex="0"` : ''}>${x.l}${x.s ? fr(x.s) : ''}</th>`).join('') + '</tr>';
  }
  thead.addEventListener('change', e => { if (!e.target.classList.contains('ft-all')) return; const s = selCorr(); filtrate().forEach(r => e.target.checked ? s.add(r.id) : s.delete(r.id)); draw(); });
  const sortBy = th => { const m = c.modo; if (FT.ordine[m] === th.dataset.s) FT.verso[m] = -FT.verso[m]; else { FT.ordine[m] = th.dataset.s; FT.verso[m] = 1; } draw(); };
  thead.addEventListener('click', e => { const th = e.target.closest('th.ord'); if (th) sortBy(th); });
  thead.addEventListener('keydown', e => { const th = e.target.closest('th.ord'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortBy(th); } });
  tbody.addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const inv = FT.fatture.find(i => i.id === (tr.dataset.inv || tr.dataset.id));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'prev') { if (inv) anteprima(inv); return; }
    if (act === 'pdf') { if (inv) scaricaUno(inv); return; }
    if (e.target.tagName !== 'INPUT') { const box = tr.querySelector('input'); box.checked = !box.checked; }
    const s = selCorr();
    if (tr.querySelector('input').checked) s.add(tr.dataset.id); else s.delete(tr.dataset.id);
    draw();
  });
  function svuota() {
    if (!FT.fatture.length) return;
    FT.fatture = []; FT.righe = []; FT.selInv.clear(); FT.selRig.clear(); FT.scarti = [];
    FT.q = FT.dal = FT.al = FT.cliente = FT.codiva = FT.tipodoc = FT.origine = FT.pag = ''; search.value = '';
    popolaFiltri(); draw(); toast('Elenco svuotato');
  }
  function drawList() {
    const prest = inPrest(), list = ordina(filtrate()), sel = selCorr(), vuoto = !FT.fatture.length;
    const tot = prest ? FT.righe.length : FT.fatture.length;
    const n = list.filter(r => sel.has(r.id)).length;   // quelle che verranno esportate
    count.textContent = vuoto ? '' : `${list.length} di ${tot} · ${n} ${n === 1 ? 'selezionata' : 'selezionate'}`;
    drawHead();
    tbody.innerHTML = list.map(x => prest ? rigaP(x) : rigaF(x)).join('');
    tfoot.innerHTML = totali(list);
    const all = thead.querySelector('.ft-all'); if (all) all.checked = list.length > 0 && list.every(r => sel.has(r.id));
    twrap.hidden = vuoto || !list.length;
    if (!vuoto && !list.length) { empty.hidden = false; empty.replaceChildren(h('b', {}, 'Nessun risultato'), h('span', {}, 'Nessuna voce corrisponde alla ricerca o ai filtri.')); }
    else if (vuoto) {
      empty.hidden = false;
      empty.replaceChildren(h('div', { class: 'dz-ic' }, ic('upload', 28)), h('b', {}, 'Nessuna fattura caricata'),
        h('span', {}, prest ? 'Ogni riga di dettaglio diventerà una riga qui, cercabile ed esportabile in Excel.' : 'Qui comparirà l’elenco delle fatture, con imponibili, imposte e totali.'),
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => fileInp.click() }, ic('file', 16), 'Scegli i file'), h('button', { class: 'btn', onclick: () => dirInp.click() }, ic('layers', 16), 'Cartella')));
    } else empty.hidden = true;
    drawPag();
    exportBtn.disabled = n === 0;
    exportBtn.replaceChildren(ic(prest ? 'table' : n === 1 ? 'file' : 'zip', 18), prest ? 'Esporta in Excel' + (n ? ` (${n})` : '') : n === 1 ? 'Crea il PDF' : 'Crea i PDF' + (n ? ` (${n})` : ''));
    regBtn.hidden = prest; regBtn.disabled = n === 0;
    actNote.textContent = prest ? (n === 0 ? 'Seleziona le prestazioni da esportare.' : `${plural(n, 'prestazione pronta', 'prestazioni pronte')} · ${COLS_X.length} colonne`)
      : n === 0 ? 'Seleziona le fatture da convertire.' : n === 1 ? 'Una fattura selezionata: esce come PDF singolo.' : `${n} fatture selezionate: escono in un archivio unico.`;
  }
  /* riepilogo per metodo di pagamento delle fatture in elenco (gli altri filtri valgono, questo no): un tocco filtra */
  function drawPag() {
    const base = FT.fatture.filter(inv => { const f = FT.pag; FT.pag = ''; const ok = passa(inv); FT.pag = f; return ok; });
    const g = new Map(); base.forEach(inv => { const f = famDi(inv), x = g.get(f) || { n: 0, tot: 0 }; x.n++; x.tot += inv.totale || 0; g.set(f, x); });
    const soglia = base.filter(inv => inv.metodo && inv.metodo.oltreSoglia);
    pagBar.hidden = !base.length || (g.size === 1 && g.has('nd'));
    if (pagBar.hidden) return;
    const btn = (key, chip, n, tot, title) => h('button', { 'aria-pressed': String(FT.pag === key), title, onclick: () => { FT.pag = FT.pag === key ? '' : key; selPag.value = FT.pag; draw(); } },
      h('span', { html: chip }), h('em', {}, `${n} · ${eur(tot)} €`));
    pagBar.replaceChildren(h('span', {}, 'Pagamento'),
      ...ORD_FAM.filter(f => g.has(f)).map(f => btn(f, K.pagChip(null, { famiglia: f, label: f === 'nd' ? FAMN.nd : FAMN[f] }), g.get(f).n, g.get(f).tot, `Mostra solo: ${FAMN[f]}`)),
      soglia.length ? btn('soglia', K.pagChip(null, { famiglia: 'contanti', label: 'Contanti da 5.000 €', soglia: true }), soglia.length, soglia.reduce((a, i) => a + (i.metodo.contanti || 0), 0),
        'Pagamenti in contanti da 5.000 euro in su: fra soggetti diversi non sono ammessi (d.lgs. 231/2007). Da verificare.') : null);
  }
  function draw() {
    const prest = inPrest();
    title.textContent = prest ? 'Prestazioni' : 'Registro fatture';
    search.placeholder = prest ? 'Cerca nelle descrizioni, nei clienti, nei numeri' : 'Cerca fra le fatture';
    noteTipo.textContent = c.tipo === 'passive' ? 'La controparte è il fornitore.' : 'La controparte è il cliente.';
    noteLay.textContent = c.layout === 'min' ? 'Tutte le sezioni, campo per campo, con la grafica di file360: utile per il controllo.' : 'Riproduce l’impaginazione consueta della fattura elettronica (foglio di stile dell’Agenzia).';
    nameSpec.textContent = FT.fatture[0] ? K.nomeFile(FT.fatture[0], c) : (c.tipopref ? 'Parcella' : 'Fattura') + ' Rossi Srl n. 12 del 15-03-2026.pdf';
    drawList();
    errBox.hidden = !FT.scarti.length;
    if (FT.scarti.length) errBox.replaceChildren(
      h('div', { class: 'ft-err-h' }, h('b', {}, ic('x', 15), plural(FT.scarti.length, 'file non elaborato', 'file non elaborati')), h('button', { class: 'btn sm ghost', onclick: () => { FT.scarti = []; draw(); } }, 'Nascondi')),
      h('ul', {}, FT.scarti.map(([n, m]) => h('li', {}, h('b', {}, n), h('span', {}, m)))));
  }
  FT.refresh = () => { popolaFiltri(); draw(); };
  FT.refresh();
  if (files && files.length) await intake(files);
}

/* =====================================================================
   Servizi per professione (src/pro.js): letture di documenti ricorrenti (estratto conto, F24 e dichiarazioni,
   visure, esami di laboratorio), QR di pagamento SEPA, copia conforme, misure in scala, conteggio delle parole,
   tesi, immagine in SVG. Tutto gira nel browser: niente intelligenza artificiale, niente server.
   build.py mette questo file nei blocchi rimandati, subito prima dell'anteprima dei risultati.
   ===================================================================== */

/* ---------- codice QR (ISO/IEC 18004), modo byte; algoritmo classico con correzione d'errore Reed-Solomon ---------- */
const QR = (() => {
  const ECL = { L: 0, M: 1, Q: 2, H: 3 }, FORMAT = [1, 0, 3, 2];
  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * BLOCKS[e][v];
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; };
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gmul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    const r = new Array(div.length).fill(0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); }
    return r;
  }
  function alignPos(v, size) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
    for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
    return out;
  }
  // testo → matrice di moduli (true = scuro)
  function encode(text, { ecl = 'M', minVersion = 1 } = {}) {
    const bytes = [...new TextEncoder().encode(String(text))], e = ECL[ecl] ?? 1;
    let v = minVersion, cap;
    for (; v <= 40; v++) { cap = dataCodewords(v, e) * 8; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) break; }
    if (v > 40) throw new Error('Testo troppo lungo per un codice QR');
    const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // blocchi con correzione d'errore, intercalati
    const nb = BLOCKS[e][v], el = ECC_PER_BLOCK[e][v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
    }
    const cw = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
    // disegno
    const size = v * 4 + 17, M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPos(v, size), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const formatBits = mask => {
      const d = (FORMAT[e] << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, g(i));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
      set(8, size - 8, true);
    };
    formatBits(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && i < cw.length * 8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = get => { let run = 1, prev = get(0); for (let k = 1; k < size; k++) { const c = get(k); if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { run = 1; prev = c; } }
        for (let k = 0; k + 10 < size; k++) { const s = Array.from({ length: 11 }, (_, q) => get(k + q) ? 1 : 0).join(''); if (s === '10111010000' || s === '00001011101') p += 40; } };
      for (let y = 0; y < size; y++) line(k => M[y][k]);
      for (let x = 0; x < size; x++) line(k => M[k][x]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (M[y][x]) dark++;
      const tot = size * size; p += Math.ceil(Math.abs(dark * 20 - tot * 10) / tot - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); formatBits(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } apply(m); }
    apply(best); formatBits(best);
    return { size, version: v, modules: M };
  }
  // SVG con margine bianco di 4 moduli (necessario per la lettura)
  function svg(q, { border = 4, dark = '#000000', light = '#FFFFFF', px = null } = {}) {
    const n = q.size + border * 2; let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + border} ${y + border}h1v1h-1z`;
    const wh = px ? ` width="${px}" height="${px}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${wh} shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
  function canvas(q, px = 600, { border = 4 } = {}) {
    const n = q.size + border * 2, s = Math.max(1, Math.floor(px / n)), c = document.createElement('canvas'); c.width = c.height = n * s;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) g.fillRect((x + border) * s, (y + border) * s, s, s);
    return c;
  }
  // disegno vettoriale in una pagina PDF (pdf-lib), angolo in basso a sinistra in (x, y), lato «side» in punti
  function drawPdf(page, q, x, y, side, { border = 4 } = {}) {
    const n = q.size + border * 2, m = side / n;
    page.drawRectangle({ x, y, width: side, height: side, color: PDFLib.rgb(1, 1, 1) });
    for (let r = 0; r < q.size; r++) {
      let c = 0;
      while (c < q.size) {
        if (!q.modules[r][c]) { c++; continue; }
        let e = c; while (e < q.size && q.modules[r][e]) e++;
        page.drawRectangle({ x: x + (c + border) * m, y: y + side - (r + border + 1) * m, width: (e - c) * m + 0.01, height: m + 0.01, color: PDFLib.rgb(0, 0, 0) });
        c = e;
      }
    }
  }
  return { encode, svg, canvas, drawPdf };
})();

/* ---------- bonifico SEPA in un QR (standard EPC069-12, «QR di pagamento» delle app bancarie) ---------- */