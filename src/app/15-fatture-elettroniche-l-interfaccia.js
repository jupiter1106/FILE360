/* =====================================================================
   Fatture elettroniche — l'interfaccia di «Fatture XML» dentro file360.
   Due modalità sullo stesso caricamento: Fatture (PDF singolo o ZIP) e
   Prestazioni (una riga per ogni linea di dettaglio, in Excel).
   Il registro resta in memoria anche quando passi a un altro strumento.
   ===================================================================== */
const FT = {
  fatture: [], righe: [], selInv: new Set(), selRig: new Set(), scarti: [],
  q: '', dal: '', al: '', cliente: '', codiva: '', tipodoc: '', origine: '',
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
  function popolaFiltri() {
    const cl = new Set(), ci = new Set(), td = new Set();
    FT.fatture.forEach(inv => { const n = K.nomeControparte(inv, c.tipo); if (n) cl.add(n); (inv.codiciIva || []).forEach(k => ci.add(k)); if (inv.tipo) td.add(inv.tipo + ' — ' + inv.tipoBreve); });
    const fill = (el, voci, tutti, curv) => { el.replaceChildren(h('option', { value: '' }, tutti), ...voci.map(v => h('option', { value: v }, v))); el.value = voci.includes(curv) ? curv : ''; return el.value; };
    FT.cliente = fill(selCliente, [...cl].sort((a, b) => a.localeCompare(b, 'it')), 'Tutte', FT.cliente);
    FT.codiva = fill(selIva, [...ci].sort(), 'Tutti', FT.codiva);
    FT.tipodoc = fill(selTipo, [...td].sort(), 'Tutti', FT.tipodoc);
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
    return true;
  }
  const parole = () => FT.q.toLowerCase().split(/\s+/).filter(Boolean);
  const testoF = inv => [K.nomeControparte(inv, c.tipo), inv.numero, inv.tipoBreve, dt(inv.data), (inv.codiciIva || []).join(' '), (inv.causali || []).join(' '), inv.srcName, (inv.righe || []).map(l => l.desc).join(' ')].join(' ').toLowerCase();
  const testoR = r => [r.desc, r.codici, r.sconti, r.gestionali, r.rifAmm, r.cessione, K.nomeControparte(r.inv, c.tipo), r.inv.numero, dt(r.inv.data), r.codIva, r.periodo, r.inv.tipoBreve, (r.inv.causali || []).join(' '), r.inv.srcName].join(' ').toLowerCase();
  const match = (t, p) => !p.length || p.every(w => t.includes(w));
  const fattureF = () => { const p = parole(); return FT.fatture.filter(inv => passa(inv) && match(testoF(inv), p)); };
  const righeF = () => { const p = parole(); return FT.righe.filter(r => passa(r.inv, r.codIva) && match(testoR(r), p)); };
  const filtrate = () => inPrest() ? righeF() : fattureF();
  const selCorr = () => inPrest() ? FT.selRig : FT.selInv;
  function ordina(list) {
    const m = c.modo, v = FT.verso[m], k = FT.ordine[m];
    const keys = inPrest() ? { nome: r => K.nomeControparte(r.inv, c.tipo).toLowerCase(), desc: r => (r.desc || '').toLowerCase(), num: r => (r.inv.numero || '').toLowerCase(), data: r => (r.inv.data || '') + ' ' + (r.inv.numero || ''), importo: r => r.importo || 0 }
      : { nome: i => K.nomeControparte(i, c.tipo).toLowerCase(), tipo: i => i.tipoBreve || '', num: i => (i.numero || '').toLowerCase(), data: i => (i.data || '') + ' ' + (i.numero || ''), importo: i => i.totale || 0 };
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
    if (o === 'pdf') s += ' <span class="ft-orig" title="Dati letti dal layout del PDF">PDF</span>';
    if (o === 'pdfxml') s += ' <span class="ft-orig" title="PDF con l’XML della fattura incorporato: dati esatti">PDF·XML</span>';
    if (o === 'pdf' && inv.avvisi && inv.avvisi.length) s += ` <span class="ft-warn" title="${esc('Da verificare: ' + inv.avvisi.join('; '))}">!</span>`;
    return s;
  }

  /* —— registro —— */
  const COL = {
    fatture: [{ l: 'Tipo', s: 'tipo', c: 'hide-s' }, { l: 'Numero', s: 'num' }, { l: 'Data', s: 'data' }, { l: 'Controparte', s: 'nome' }, { l: 'Cod. IVA', c: 'hide-m' },
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
      `<td class="cp">${evid(cp.nome || '')}<small>${esc(cp.piva || cp.cf || '')}</small></td><td class="iva hide-m">${esc((inv.codiciIva || []).join(' · '))}</td>` +
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
      return `<tr class="${cls}"><td></td><td class="hide-s"></td><td colspan="3" class="lab">${et} · ${plural(l.length, 'fattura', 'fatture')}</td><td class="hide-m"></td><td class="num hide-m">${eur(s.imponibile)}</td><td class="num hide-m">${eur(s.imposta)}</td><td class="num hide-s">${s.ritenuta ? eur(s.ritenuta) : ''}</td><td class="num">${eur(s.totale)}</td><td></td></tr>`;
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
        h('div', { class: 'grow' }, h('h3', {}, nome.replace(/\.pdf$/, '')), h('div', { class: 'muted small' }, inv.pdfBytes ? 'PDF originale' + (inv.tot > 1 ? `, documento ${inv.idx + 1} di ${inv.tot}` : '') : c.layout === 'min' ? 'Layout esteso, con tutte le sezioni' : 'Layout standard del foglio di stile')),
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
    ['Soggetta a ritenuta', 16, 's', r => r.conRitenuta ? 'SI' : ''], ['Causale documento', 34, 's', r => (r.inv.causali || []).join(' · ')], ['File di origine', 28, 's', r => r.inv.srcName],
    ['Origine dato', 22, 's', r => ({ xml: 'XML', pdf: 'PDF (lettura del layout)', pdfxml: 'PDF (XML incorporato)' })[orig(r.inv)]],
    ['Esito controlli', 48, 's', r => orig(r.inv) === 'pdf' ? (r.inv.avvisi && r.inv.avvisi.length ? 'DA VERIFICARE: ' + r.inv.avvisi.join('; ') : 'OK') : (r.inv.quadra === false ? 'imponibile più imposta non coincide con il totale' : '')],
  ];
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
      ['Imposta', 14, 'n', i => i.imposta], ['Ritenuta', 14, 'n', i => i.ritenutaTot || null], ['Totale documento', 16, 'n', i => i.totale], ['File di origine', 28, 's', i => i.srcName],
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
    empty, twrap, errBox, fileInp, dirInp);

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
      h('label', { class: 'ft-f' }, h('span', {}, 'Origine dei dati'), selOrig),
      h('button', { class: 'btn sm ghost', style: { width: '100%' }, onclick: () => { FT.q = FT.dal = FT.al = FT.cliente = FT.codiva = FT.tipodoc = FT.origine = ''; search.value = ''; popolaFiltri(); draw(); } }, ic('reset', 15), 'Azzera i filtri')),
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
    FT.q = FT.dal = FT.al = FT.cliente = FT.codiva = FT.tipodoc = FT.origine = ''; search.value = '';
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
    exportBtn.disabled = n === 0;
    exportBtn.replaceChildren(ic(prest ? 'table' : n === 1 ? 'file' : 'zip', 18), prest ? 'Esporta in Excel' + (n ? ` (${n})` : '') : n === 1 ? 'Crea il PDF' : 'Crea i PDF' + (n ? ` (${n})` : ''));
    regBtn.hidden = prest; regBtn.disabled = n === 0;
    actNote.textContent = prest ? (n === 0 ? 'Seleziona le prestazioni da esportare.' : `${plural(n, 'prestazione pronta', 'prestazioni pronte')} · ${COLS_X.length} colonne`)
      : n === 0 ? 'Seleziona le fatture da convertire.' : n === 1 ? 'Una fattura selezionata: esce come PDF singolo.' : `${n} fatture selezionate: escono in un archivio unico.`;
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
   Anteprima di un risultato prima di scaricarlo: PDF (pagine), immagini, Word, Excel, CSV, testo/XML, ZIP
   ===================================================================== */
const Preview = (() => {
  const ext = n => (String(n).match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const KIND = { pdf: 'pdf', png: 'img', jpg: 'img', jpeg: 'img', webp: 'img', gif: 'img', bmp: 'img', svg: 'img', docx: 'docx', xlsx: 'xlsx', csv: 'csv',
    txt: 'text', xml: 'text', json: 'text', html: 'text', htm: 'text', md: 'text', zip: 'zip' };
  const kindOf = name => KIND[ext(name)] || null;
  const can = o => !!(o && o.bytes && kindOf(o.name));
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', zip: 'application/zip' };
  const mimeOf = o => o.type || MIME[ext(o.name)] || 'application/octet-stream';
  const dec = b => new TextDecoder('utf-8').decode(b);
  const xmlDoc = s => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (n, tag) => [...n.childNodes].filter(c => c.nodeType === 1 && c.localName === tag);
  const all = (n, tag) => [...n.getElementsByTagNameNS('*', tag)];
  const attr = (n, a) => n && (n.getAttribute('w:' + a) ?? n.getAttribute(a));

  /* —— PDF: pagine disegnate man mano che si scorre —— */
  async function pdfView(o, body, status) {
    const d = await pdfDocument({ data: o.bytes.slice(), isEvalSupported: false }).promise;
    status(plural(d.numPages, 'pagina', 'pagine'));
    const W = Math.max(240, Math.min(680, body.clientWidth - 32)), dpr = Math.min(2, window.devicePixelRatio || 1);
    const first = await d.getPage(1), r0 = first.getViewport({ scale: 1 });
    const slots = [];
    for (let p = 1; p <= d.numPages; p++) {
      const slot = h('div', { class: 'pvw-page', style: { width: W + 'px', aspectRatio: `${r0.width} / ${r0.height}` } }, h('span', { class: 'pvw-n' }, String(p)));
      slot.dataset.p = p; slots.push(slot); body.append(slot);
    }
    const drawn = new Set();
    const draw = async slot => {
      const p = +slot.dataset.p; if (drawn.has(p)) return; drawn.add(p);
      try {
        const pg = await d.getPage(p), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: W / v0.width * dpr });
        slot.style.aspectRatio = `${v0.width} / ${v0.height}`;
        const cv = h('canvas', { width: Math.floor(v.width), height: Math.floor(v.height) });
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise;
        slot.prepend(cv); pg.cleanup();
      } catch (e) { console.warn(e); }
    };
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) draw(e.target); }), { root: body, rootMargin: '600px 0px' });
    slots.forEach(s => io.observe(s));
    return () => { io.disconnect(); d.destroy(); };
  }

  /* —— Word: paragrafi, titoli, grassetti, elenchi, tabelle, immagini —— */
  async function docxView(o, body, status) {
    const z = await JSZip.loadAsync(o.bytes);
    const docXml = await z.file('word/document.xml')?.async('string');
    if (!docXml) throw new Error('documento Word non leggibile');
    const rels = {}, urls = [];
    const relXml = await z.file('word/_rels/document.xml.rels')?.async('string');
    if (relXml) for (const r of all(xmlDoc(relXml), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const img = async id => {
      const t = rels[id]; if (!t) return null;
      const f = z.file('word/' + t.replace(/^\/?word\//, '').replace(/^\.\//, '')); if (!f) return null;
      const u = URL.createObjectURL(new Blob([await f.async('uint8array')], { type: MIME[ext(t)] || 'image/png' })); urls.push(u); return u;
    };
    const run = async r => {
      const rPr = kids(r, 'rPr')[0];
      const b = rPr && kids(rPr, 'b').length && attr(kids(rPr, 'b')[0], 'val') !== '0', i = rPr && kids(rPr, 'i').length, u = rPr && kids(rPr, 'u').length;
      const out = [];
      for (const c of r.childNodes) {
        if (c.localName === 't') out.push(document.createTextNode(c.textContent));
        else if (c.localName === 'tab') out.push(document.createTextNode('\t'));
        else if (c.localName === 'br') out.push(h('br'));
        else if (c.localName === 'drawing' || c.localName === 'pict') {
          const bl = all(c, 'blip')[0] || all(c, 'imagedata')[0];
          const id = bl && (bl.getAttribute('r:embed') || bl.getAttribute('r:id'));
          const ext0 = all(c, 'extent')[0];
          const u = id && await img(id);
          if (u) out.push(h('img', { src: u, alt: '', style: ext0 ? { width: Math.min(600, +ext0.getAttribute('cx') / 9525) + 'px' } : null }));
        }
      }
      if (!out.length) return null;
      let el = h('span', {}, ...out);
      if (b) el = h('b', {}, el); if (i) el = h('i', {}, el); if (u) el = h('u', {}, el);
      return el;
    };
    const para = async p => {
      const pPr = kids(p, 'pPr')[0];
      const style = (pPr && attr(kids(pPr, 'pStyle')[0], 'val')) || '';
      const al = pPr && attr(kids(pPr, 'jc')[0], 'val');
      const list = pPr && kids(pPr, 'numPr').length;
      const lvl = /heading\s*1|titolo\s*1|^title$|^titolo$/i.test(style) ? 'h2' : /heading\s*[23]|titolo\s*[23]/i.test(style) ? 'h3' : 'p';
      const parts = [];
      for (const c of p.childNodes) {
        if (c.localName === 'r') { const e = await run(c); if (e) parts.push(e); }
        else if (c.localName === 'hyperlink' || c.localName === 'smartTag' || c.localName === 'ins') for (const r of all(c, 'r')) { const e = await run(r); if (e) parts.push(e); }
      }
      const el = h(list ? 'li' : lvl, { style: { textAlign: al === 'both' ? 'justify' : al === 'center' ? 'center' : al === 'right' || al === 'end' ? 'right' : null } }, ...parts);
      if (!parts.length) el.innerHTML = '&nbsp;';
      return el;
    };
    const blockList = async parent => {
      const out = []; let ul = null;
      for (const c of parent.childNodes) {
        if (c.localName === 'p') { const e = await para(c); if (e.tagName === 'LI') { if (!ul) out.push(ul = h('ul')); ul.append(e); } else { ul = null; out.push(e); } }
        else if (c.localName === 'tbl') {
          ul = null;
          const t = h('table');
          for (const tr of kids(c, 'tr')) {
            const row = h('tr');
            for (const tc of kids(tr, 'tc')) {
              const span = +attr(kids(kids(tc, 'tcPr')[0] || tc, 'gridSpan')[0], 'val') || 1;
              row.append(h('td', { colspan: span > 1 ? span : null }, ...(await blockList(tc))));
            }
            t.append(row);
          }
          out.push(t);
        } else if (c.localName === 'sdt') { const ct = kids(c, 'sdtContent')[0]; if (ct) out.push(...(await blockList(ct))); }
      }
      return out;
    };
    const bodyEl = all(xmlDoc(docXml), 'body')[0];
    const page = h('div', { class: 'pvw-doc' }, ...(await blockList(bodyEl)));
    body.append(page);
    const words = (page.textContent.match(/\S+/g) || []).length;
    status(plural(words, 'parola', 'parole') + ' · anteprima semplificata: impaginazione e caratteri possono differire in Word');
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }

  /* —— Excel: un foglio per scheda, valori come appaiono —— */
  async function xlsxView(o, body, status) {
    const z = await JSZip.loadAsync(o.bytes);
    const wb = xmlDoc(await z.file('xl/workbook.xml').async('string'));
    const rels = {}; for (const r of all(xmlDoc(await z.file('xl/_rels/workbook.xml.rels').async('string')), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const ss = z.file('xl/sharedStrings.xml') ? all(xmlDoc(await z.file('xl/sharedStrings.xml').async('string')), 'si').map(si => all(si, 't').map(t => t.textContent).join('')) : [];
    // formati numerici: date e percentuali
    const st = z.file('xl/styles.xml') ? xmlDoc(await z.file('xl/styles.xml').async('string')) : null;
    const numFmts = {}; if (st) for (const n of all(st, 'numFmt')) numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode');
    const xfs = st ? all(all(st, 'cellXfs')[0] || st, 'xf').map(x => +x.getAttribute('numFmtId') || 0) : [];
    const fmtOf = s => { const id = xfs[+s || 0] || 0; const code = numFmts[id] || ''; return { id, code }; };
    const show = (v, s) => {
      const n = +v; if (!isFinite(n) || v === '') return v;
      const { id, code } = fmtOf(s);
      if ((id >= 14 && id <= 22) || /[dmy]{2}/i.test(code.replace(/"[^"]*"/g, ''))) { const d = new Date(Math.round((n - 25569) * 864e5)); return isNaN(d) ? v : d.toLocaleDateString('it-IT', { timeZone: 'UTC' }); }
      if (/%/.test(code) || id === 9 || id === 10) return (n * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '%';
      const dec0 = /0\.0+/.test(code) ? code.match(/0\.(0+)/)[1].length : (Number.isInteger(n) ? 0 : 2);
      return n.toLocaleString('it-IT', { minimumFractionDigits: /[#0],[#0]{3}|#,##/.test(code) || dec0 ? dec0 : 0, maximumFractionDigits: Math.max(dec0, Number.isInteger(n) ? 0 : 2) });
    };
    const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const sheets = all(wb, 'sheet').map(s => ({ name: s.getAttribute('name'), target: 'xl/' + rels[s.getAttribute('r:id')].replace(/^\/?xl\//, '') }));
    const tabs = h('div', { class: 'pvw-tabs', role: 'tablist' }), holder = h('div', { class: 'pvw-sheet' });
    const LIMIT = 400;
    const showSheet = async (i) => {
      tabs.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
      const x = xmlDoc(await z.file(sheets[i].target).async('string'));
      const rows = all(x, 'row'); const grid = []; let maxC = 0;
      for (const r of rows.slice(0, LIMIT)) {
        const ri = (+r.getAttribute('r') || grid.length + 1) - 1, line = [];
        for (const c of all(r, 'c')) {
          const t = c.getAttribute('t'), v = all(c, 'v')[0]?.textContent ?? '', is = all(c, 'is')[0];
          const val = t === 's' ? ss[+v] ?? '' : t === 'inlineStr' ? (is ? all(is, 't').map(n => n.textContent).join('') : '') : t === 'b' ? (v === '1' ? 'VERO' : 'FALSO') : t === 'str' || t === 'e' ? v : show(v, c.getAttribute('s'));
          const ci = c.getAttribute('r') ? col(c.getAttribute('r')) : line.length;
          line[ci] = { val, num: !t && v !== '' && isFinite(+v) }; maxC = Math.max(maxC, ci + 1);
        }
        grid[ri] = line;
      }
      const t = h('table', { class: 'pvw-grid' });
      const colName = k => { let s = ''; for (k++; k; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + (k - 1) % 26) + s; return s; };
      t.append(h('tr', {}, h('th'), ...Array.from({ length: maxC }, (_, k) => h('th', {}, colName(k)))));
      for (let r = 0; r < grid.length; r++) {
        const line = grid[r] || [];
        t.append(h('tr', {}, h('th', {}, String(r + 1)), ...Array.from({ length: maxC }, (_, k) => h('td', { class: line[k]?.num ? 'num' : null }, line[k]?.val ?? ''))));
      }
      holder.replaceChildren(t);
      status(`${sheets.length > 1 ? plural(sheets.length, 'foglio', 'fogli') + ' · ' : ''}${plural(rows.length, 'riga', 'righe')}${rows.length > LIMIT ? ` (anteprima delle prime ${LIMIT})` : ''}`);
    };
    sheets.forEach((s, i) => tabs.append(h('button', { class: 'chip', role: 'tab', onclick: () => showSheet(i) }, s.name)));
    if (sheets.length > 1) body.append(tabs);
    body.append(holder);
    await showSheet(0);
  }

  /* —— CSV e testo —— */
  function csvView(o, body, status) {
    const txt = dec(o.bytes).replace(/^﻿/, '');
    const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < txt.length && rows.length < 400; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"' && txt[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const t = h('table', { class: 'pvw-grid' }, rows.map((r, i) => h('tr', {}, r.map(c => h(i ? 'td' : 'th', {}, c)))));
    body.append(h('div', { class: 'pvw-sheet' }, t));
    status(plural(rows.length, 'riga', 'righe') + (rows.length >= 400 ? ' (anteprima delle prime 400)' : ''));
  }
  function textView(o, body, status) {
    let txt = dec(o.bytes.subarray(0, 400000));
    if (/\.xml$/i.test(o.name) && !/\n\s*</.test(txt.slice(0, 2000))) txt = txt.replace(/>\s*</g, '>\n<');
    body.append(h('pre', { class: 'pvw-text' }, txt));
    status(fmtSize(o.bytes.length) + (o.bytes.length > 400000 ? ' · anteprima dell’inizio del file' : ''));
  }
  function imgView(o, body, status) {
    const u = URL.createObjectURL(new Blob([o.bytes], { type: mimeOf(o) }));
    const im = h('img', { class: 'pvw-img', src: u, alt: o.name, onload: () => status(`${im.naturalWidth} × ${im.naturalHeight} px · ${fmtSize(o.bytes.length)}`) });
    body.append(im);
    return () => URL.revokeObjectURL(u);
  }
  async function zipView(o, body, status, openChild) {
    const z = await JSZip.loadAsync(o.bytes);
    const files = Object.values(z.files).filter(f => !f.dir);
    status(plural(files.length, 'file', 'file') + ' nell’archivio');
    const list = h('div', { class: 'pvw-zip' });
    for (const f of files) {
      const size = f._data?.uncompressedSize;
      list.append(h('div', { class: 'res-row' }, h('span', { class: 'muted' }, ic(kindOf(f.name) === 'img' ? 'image' : kindOf(f.name) === 'docx' ? 'textedit' : kindOf(f.name) === 'xlsx' || kindOf(f.name) === 'csv' ? 'table' : 'file', 20)),
        h('div', { class: 'rn' }, h('b', { title: f.name }, f.name), size != null ? h('span', { class: 'muted small' }, fmtSize(size)) : null),
        kindOf(f.name) ? h('button', { class: 'btn sm', onclick: async () => openChild({ name: f.name.split('/').pop(), bytes: await f.async('uint8array') }) }, ic('eye', 16), 'Anteprima') : null));
    }
    body.append(list);
  }

  /* —— finestra —— */
  async function open(o, { onDownload } = {}) {
    const k = kindOf(o.name);
    const info = h('div', { class: 'muted small pvw-info' }, 'Preparazione dell’anteprima…');
    const body = h('div', { class: 'pvw-body' + (k === 'pdf' ? ' pages' : '') });
    const dl = () => onDownload ? onDownload(o) : download(o.bytes, o.name, mimeOf(o));
    let cleanup = null;
    const m = modal([
      h('div', { class: 'pvw-head' },
        h('div', { class: 'pvw-t' }, h('span', { class: 'sec-t' }, 'Anteprima'), h('h3', { title: o.name }, o.name), info),
        h('button', { class: 'btn primary', onclick: dl }, ic('download', 17), h('span', { class: 'pvw-dl' }, 'Scarica')),
        iconBtn('x', 'Chiudi l’anteprima', () => m.close())),
      body,
    ], { width: 980, onClose: () => { try { cleanup && cleanup(); } catch (e) { console.warn(e); } } });
    m.box.classList.add('pvw');
    const status = t => { info.textContent = t; };
    try {
      if (k === 'pdf') cleanup = await pdfView(o, body, status);
      else if (k === 'img') cleanup = imgView(o, body, status);
      else if (k === 'docx') cleanup = await docxView(o, body, status);
      else if (k === 'xlsx') await xlsxView(o, body, status);
      else if (k === 'csv') csvView(o, body, status);
      else if (k === 'text') textView(o, body, status);
      else if (k === 'zip') await zipView(o, body, status, c => open(c));
      else throw new Error('formato senza anteprima');
    } catch (e) {
      console.warn(e);
      status('');
      body.replaceChildren(h('div', { class: 'pvw-none' }, ic('eye', 26), h('p', {}, 'Anteprima non disponibile per questo file.'), h('button', { class: 'btn primary', onclick: dl }, ic('download', 17), 'Scarica il file')));
    }
    return m;
  }
  return { open, can, kindOf };
})();

/* =====================================================================
   Spazi pubblicitari e contatore pubblico (solo nel sito pubblicato)

   Spazi:  home        banner orizzontale dopo gli strumenti (728×90, telefono 320×100)
           tool-info   banner tra le domande frequenti e «Altri strumenti» delle pagine strumento
           tool-side   rettangolo 300×250 sotto l'animazione, accanto al riquadro (schermi ≥ 1200 px)
           result      scheda sponsor in fondo alla finestra «Il tuo file è pronto»
   Regole: mai durante il lavoro, mai tra il titolo e il riquadro di caricamento, sempre con l'etichetta,
           spazio riservato (la pagina non salta), niente che somigli a un pulsante «Scarica».
   Configurazione (window.OFFICINA_ADS, scritta da build_site.py leggendo site.config.json):
     mode: 'off' | 'sponsor' | 'adsense'  ·  sponsors: [{ where, tools, title, text, cta, url, logo }]
     adsense: { client: 'ca-pub-…', slots: { home, 'tool-info', 'tool-side' } }
   Con ?anteprima-pubblicita nell'indirizzo gli spazi si vedono vuoti, con le misure, per provarli.
   ===================================================================== */
const Ads = (() => {
  const C = window.OFFICINA_ADS || { mode: 'off' };
  let preview = false; try { preview = /[?&]anteprima-pubblicita\b/.test(location.search) || sessionStorage.getItem('officina-ads-preview') === '1'; if (preview) sessionStorage.setItem('officina-ads-preview', '1'); } catch { }
  const mode = preview ? 'preview' : (C.mode || 'off');
  const FORMAT = { home: 'lb', 'tool-info': 'lb', 'tool-side': 'rect', result: 'native' };
  const FISCAL = new Set(['fatture', 'xbrl', 'firme']);
  const on = where => IS_SITE && mode !== 'off' && FORMAT[where] && !(where === 'tool-side' && innerWidth < 1200);

  // sponsor diretti: scelti per posizione e (se indicato) per strumento; i fiscali vanno sulle pagine fiscali
  const sponsorFor = (where, tool) => {
    const list = (C.sponsors || []).filter(s => (!s.where || s.where.includes(where)) && (!s.tools || (tool && s.tools.includes(tool)) || (s.tools.includes('fisco') && FISCAL.has(tool))));
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  };
  const label = (t, why = true) => h('div', { class: 'ad-l' }, h('span', {}, t), why ? h('a', { href: new URL('contatti/#pubblicita', SITE_BASE).pathname }, 'Perché vedo questo spazio?') : null);
  function native(sp) {
    return h('a', { class: 'ad-native', href: sp.url, target: '_blank', rel: 'sponsored noopener' },
      h('span', { class: 'lg' }, sp.logo ? h('img', { src: sp.logo, alt: '', loading: 'lazy' }) : ic('seal', 20)),
      h('span', { class: 'tx' }, h('b', {}, sp.title), h('span', {}, sp.text || '')),
      h('span', { class: 'go' }, sp.cta || 'Scopri'));
  }
  let adsenseLoaded = false;
  function adsense(box, where) {
    const slotId = C.adsense && C.adsense.slots && C.adsense.slots[where];
    if (!slotId || !C.adsense.client) return false;
    if (!adsenseLoaded) {
      adsenseLoaded = true;
      const s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(C.adsense.client);
      document.head.append(s);
    }
    const ins = h('ins', { class: 'adsbygoogle', style: { display: 'block', width: '100%', height: '100%' }, 'data-ad-client': C.adsense.client, 'data-ad-slot': slotId, 'data-ad-format': FORMAT[where] === 'rect' ? 'rectangle' : 'horizontal', 'data-full-width-responsive': 'false' });
    box.append(ins);
    // caricato solo quando lo spazio sta per entrare nello schermo
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { console.warn(e); } } }, { rootMargin: '200px' });
    io.observe(box);
    return true;
  }
  function slot(where, tool = null) {
    if (!on(where)) return null;
    const fmt = FORMAT[where];
    if (fmt === 'native') {
      const sp = mode === 'preview' ? { title: 'Spazio sponsor', text: 'Qui compare la scheda di uno sponsor: logo, una riga di testo e il collegamento.', url: '#', cta: 'Scopri' } : sponsorFor(where, tool);
      if (!sp) return null;
      return h('div', { class: 'ad res-ad' }, label('Sponsor'), native(sp));
    }
    const box = h('div', { class: 'ad-box' });
    const wrap = h('aside', { class: `ad ${fmt}`, 'aria-label': 'Spazio pubblicitario' }, label(mode === 'sponsor' ? 'Sponsor' : 'Pubblicità'), box);
    if (mode === 'preview') box.append(h('span', { class: 'ad-ph' }, fmt === 'rect' ? '300 × 250' : innerWidth < 760 ? '320 × 100' : '728 × 90'));
    else if (mode === 'sponsor') { const sp = sponsorFor(where, tool); if (!sp) return null; box.classList.add('has-native'); box.append(native(sp)); }
    else if (mode === 'adsense') { if (!adsense(box, where)) return null; }
    return wrap;
  }
  // preferenze sul consenso (il messaggio di consenso di Google, se attivo)
  const consentLink = () => mode === 'adsense' ? h('a', { href: '#', onclick: e => { e.preventDefault(); try { (window.googlefc = window.googlefc || {}).callbackQueue = window.googlefc.callbackQueue || []; window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage()); } catch (er) { console.warn(er); } } }, 'Preferenze cookie') : null;
  return { slot, consentLink, mode: () => mode };
})();

/* ---------- contatore pubblico: quanti documenti sono stati elaborati dal lancio ----------
   Il sito invia solo un numero (quanti file sono stati aperti), mai nomi o contenuti.
   Configurazione: window.OFFICINA_COUNTER = { url: '/api/contatore', min: 500 } */
const Counter = (() => {
  const C = window.OFFICINA_COUNTER || null;
  const enabled = () => IS_SITE && C && C.url;
  let pending = 0, timer = null, cache = null, shownAt = 0;
  function add(n = 1) {
    if (!enabled() || !(n > 0)) return;
    pending += Math.min(50, n);
    clearTimeout(timer); timer = setTimeout(flush, 1500);
  }
  function flush() {
    if (!pending) return;
    const k = pending; pending = 0;
    const body = JSON.stringify({ k });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(C.url, new Blob([body], { type: 'application/json' }))) return;
    } catch { }
    fetch(C.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => { });
  }
  addEventListener('pagehide', flush);
  async function value() {
    if (cache && Date.now() - cache.t < 60000) return cache.n;
    const r = await fetch(C.url, { cache: 'no-store' }); if (!r.ok) throw new Error('contatore');
    const j = await r.json(); cache = { n: +j.n || 0, t: Date.now() }; return cache.n;
  }
  // piccolo avviso in basso nella home: «12.345 documenti elaborati dal lancio»
  async function show() {
    if (!enabled()) return;
    const gen = GEN;
    let n; try { n = await value(); } catch { return; }
    if (gen !== GEN || CURRENT_TOOL || n < (C.min ?? 500) || document.querySelector('.counter-pop')) return;
    const num = h('b', {}, '0');
    const el = h('div', { class: 'counter-pop', role: 'status', title: 'Conteggio anonimo: viene contato solo il numero di documenti aperti, mai il loro contenuto.' },
      h('i', { class: 'counter-dot' }), h('span', {}, num, ' documenti elaborati dal lancio'));
    const fmt = v => Math.round(v).toLocaleString('it-IT');
    const hero = document.querySelector('.home .hero'); if (!hero) return;
    hero.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { num.textContent = fmt(n); return; }
    const t0 = performance.now(), from = n * 0.985, D = 900;
    const stepFn = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); num.textContent = fmt(from + (n - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(stepFn); };
    setTimeout(() => requestAnimationFrame(stepFn), 350);
    shownAt = Date.now();
  }
  // ogni file conta una volta sola (anche se passa dalla home a uno strumento)
  function files(list) { let n = 0; for (const f of list || []) { if (f && typeof f === 'object' && !f._counted) { try { f._counted = true; } catch { } n++; } } add(n); }
  return { add, files, show, flush };
})();

/* =====================================================================
   Promo — accanto al caricamento del file, un brevissimo «video» animato in loop
   che mostra come funziona lo strumento e che risultato aspettarsi.
   Sempre visibile: parte da solo, non si ferma e non si chiude.

   Regia: ogni scena è un piccolo palcoscenico 320×178 con elementi marcati
   data-a="chiave"; per ogni chiave una traccia di fotogrammi chiave a tempi
   assoluti (secondi nel giro di T). Le tracce diventano animazioni Web
   Animations con la stessa durata e iterazioni infinite: partono insieme e
   restano sincronizzate, giro dopo giro.
   Schema di ogni giro: prima l'azione (che cosa fai), poi la trasformazione
   e il risultato (che cosa ottieni); dissolvenza e si ricomincia.
   ===================================================================== */
const Promo = (() => {
  const T = 7;                       // secondi per giro
  const EASE = 'cubic-bezier(.45,0,.25,1)', POP = 'cubic-bezier(.3,1.45,.5,1)', LIN = 'linear';
  const CSS = `
.pv{position:relative;width:100%;max-width:340px;border-radius:20px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);padding:10px 10px 12px;animation:pvEnter .7s cubic-bezier(.2,.8,.2,1) both .15s}
.pv-stage{position:relative;height:178px;border-radius:14px;overflow:hidden;background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--hue) 20%,var(--surface)) 0%,color-mix(in srgb,var(--hue) 6%,var(--surface)) 60%,var(--surface-2) 100%)}
.pv-stage::before{content:"";position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--hue) 22%,transparent) 1px,transparent 1.2px);background-size:14px 14px;opacity:.35}
.pv-scene{position:absolute;left:50%;top:0;width:320px;height:178px;margin-left:-160px}
.pv-scene *{box-sizing:border-box}
.pv-scene [data-a],.pv-scene .ab{position:absolute}
.pv-doc{background:#fff;border-radius:6px;box-shadow:0 6px 16px rgba(20,20,30,.14),0 0 0 1px rgba(20,20,30,.06);padding:9px 7px 0;display:flex;flex-direction:column;gap:4px;overflow:hidden}
.pv-doc .hd{height:6px;border-radius:3px;width:58%;margin-bottom:2px;background:var(--hue);flex:none}
.pv-doc b{display:block;height:3px;border-radius:2px;background:#D5D7DE;flex:none}
.pv-doc b.k{background:#3A3D46}
.pv-pile{box-shadow:4px 4px 0 -1px #fff,4px 4px 0 0 rgba(20,20,30,.12),8px 8px 0 -1px #fff,8px 8px 0 0 rgba(20,20,30,.09),0 10px 22px rgba(20,20,30,.16)!important;overflow:visible!important}
.pv-tag{position:absolute;right:-3px;bottom:7px;font:800 8px/1 var(--font);letter-spacing:.04em;color:#fff;padding:3px 5px;border-radius:4px;font-style:normal;white-space:nowrap}
.pv-chip{display:flex;align-items:center;gap:6px;background:#fff;color:#1d1f25;border-radius:9px;padding:6px 9px;font:700 10.5px/1 var(--font);box-shadow:0 6px 14px rgba(20,20,30,.13);white-space:nowrap}
.pv-chip>i{width:16px;height:16px;border-radius:4px;display:grid;place-items:center;color:#fff;font:800 7px/1 var(--font);font-style:normal;flex:none}
.pv-chip .g{color:#15803D;font-weight:800}
.pv-ok{width:22px;height:22px;border-radius:50%;background:#16A34A;color:#fff;display:grid;place-items:center;box-shadow:0 4px 10px rgba(22,163,74,.4)}
.pv-dl{display:flex;align-items:center;gap:5px;background:var(--hue);color:#fff;border-radius:99px;padding:6px 11px;font:750 10px/1 var(--font);box-shadow:0 6px 14px color-mix(in srgb,var(--hue) 40%,transparent);white-space:nowrap}
.pv-cur{width:18px;height:18px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));z-index:9;left:0;top:0}
.pv-scene .pv-row{display:grid;font:600 7px/1 var(--font);color:#333;background:#fff}
.pv-scene .pv-row span{border-right:1px solid #E3E6EA;border-bottom:1px solid #E3E6EA;padding:3.5px 4px;white-space:nowrap;overflow:hidden}
.pv-scene .pv-row span.n{text-align:right;font-variant-numeric:tabular-nums}
.pv-scene .pv-row.h span{background:#17181C;color:#fff;font-weight:800;border-color:#2c2e35}
.pv-sheet{border-radius:6px;overflow:hidden;box-shadow:0 6px 16px rgba(20,20,30,.16)}
.pv-spin{display:block;width:12px;height:12px;border-radius:50%;border:2px solid color-mix(in srgb,var(--hue) 25%,#fff);border-top-color:var(--hue);animation:pvSpin .7s linear infinite}
.pv-cap{position:relative;height:40px;margin:10px 4px 0}
.pv-cap span{position:absolute;inset:0;font-weight:750;font-size:14.5px;line-height:1.25;letter-spacing:-.01em;color:var(--ink)}
.pv-cap span em{font-style:normal;color:color-mix(in oklab,var(--hue) 72%,var(--ink))}
.pv-foot{display:flex;align-items:center;gap:8px;margin:2px 4px 0;font-size:11.5px;color:var(--ink-2);font-weight:650}
.pv-bar{position:relative;flex:1;height:3px;border-radius:2px;background:var(--line);overflow:hidden}
.pv-bar i{position:absolute;inset:0;background:var(--hue);transform-origin:left}
.pv-dot{width:7px;height:7px;border-radius:50%;background:#E5484D;animation:pvRec 1.2s ease-in-out infinite}
@keyframes pvEnter{from{clip-path:inset(0 0 0 100% round 20px);transform:translateX(40px) scale(.97)}to{clip-path:inset(0 0 0 0 round 20px);transform:none}}
@keyframes pvEnterUp{from{clip-path:inset(0 0 100% 0 round 20px);transform:translateY(18px) scale(.97)}to{clip-path:inset(0 0 0 0 round 20px);transform:none}}
@media (max-width:980px){.pv{animation-name:pvEnterUp}}
@keyframes pvRec{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes pvSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.pv{animation:none}.pv-dot,.pv-spin{animation:none}}
`;
  let injected = false;
  const inject = () => { if (injected) return; injected = true; if (document.getElementById('promo-css')) return; document.head.append(h('style', { id: 'promo-css' }, inLegacy(CSS))); };

  /* —— tracce: uno stato che si porta avanti, un fotogramma per ogni .at() —— */
  const norm = p => { const o = { ...p }; if (o.s != null) { o.sx = o.sy = o.s; delete o.s; } return o; };
  const a = (init = {}) => {
    let cur = { o: 1, x: 0, y: 0, r: 0, sx: 1, sy: 1, ...norm(init) };
    const fr = [[0, { ...cur }, EASE]];
    const api = {
      fr,
      /* raggiunge p al tempo t (la transizione parte dal fotogramma precedente) */
      at(t, p = {}, e = EASE) { cur = { ...cur, ...norm(p) }; fr.push([t, { ...cur }, e]); return api; },
      /* fermo fino a t0, poi verso p entro t1 */
      go(t0, t1, p, e = EASE) { api.at(t0); return api.at(t1, p, e); },
      /* comparsa: dallo scostamento `from` (e trasparente) alla posizione attuale */
      show(t, d = .35, from = {}, e = EASE) {
        const b = { ...cur }, f = norm({ y: 8, ...from });
        api.at(t, { o: 0, x: b.x + (f.x || 0), y: b.y + (f.y || 0), r: b.r + (f.r || 0), sx: f.sx != null ? f.sx : b.sx, sy: f.sy != null ? f.sy : b.sy }, LIN);
        return api.at(t + d, { o: 1, x: b.x, y: b.y, r: b.r, sx: b.sx, sy: b.sy }, e);
      },
      pop(t, d = .38) { api.at(t, { o: 0, s: .5 }, LIN); return api.at(t + d, { o: 1, s: 1 }, POP); },
      hide(t, d = .3, p = {}) { api.at(t); return api.at(t + d, { o: 0, ...p }); },
      /* clic: piccolo schiacciamento */
      click(t) { const s = cur.sx; api.at(t); api.at(t + .08, { sx: s * .84, sy: s * .84 }); return api.at(t + .22, { sx: s, sy: s }); },
    };
    return api;
  };
  const TF = s => `translate(${s.x}px,${s.y}px) rotate(${s.r}deg) scale(${s.sx},${s.sy})`;
  const PROP = { clip: 'clipPath', w: 'width' };
  function keyframes(fr) {
    const used = Object.keys(PROP).filter(k => fr.some(f => f[1][k] != null));
    const sorted = fr.map((f, i) => [...f, i]).sort((p, q) => p[0] - q[0] || p[3] - q[3]);
    const first = {}; for (const k of used) first[k] = sorted.find(f => f[1][k] != null)[1][k];
    const out = sorted.map(([t, s, e]) => { const o = { offset: Math.min(1, Math.max(0, t / T)), easing: e, opacity: s.o, transform: TF(s) }; for (const k of used) o[PROP[k]] = s[k] != null ? s[k] : first[k]; return o; });
    // l'easing di .at() descrive il tratto che arriva al fotogramma; in WAAPI vale per il tratto che parte
    for (let i = 1; i < out.length; i++) out[i - 1].easing = out[i].easing;
    out[out.length - 1].easing = LIN;
    if (out[out.length - 1].offset < 1) out.push({ ...out[out.length - 1], offset: 1 });
    return out;
  }

  /* —— pezzi —— */
  const st = o => Object.entries(o).map(([k, v]) => `${k}:${typeof v === 'number' && !/^--|opacity|z-index/.test(k) ? v + 'px' : v}`).join(';');
  const lines = (n, k = [], ws = [92, 70, 84, 58, 88, 64, 78, 50]) => Array.from({ length: n }, (_, i) => `<b class="${k.includes(i) ? 'k' : ''}" style="width:${ws[i % ws.length]}%"></b>`).join('');
  const doc = (key, pos, { n = 6, head = null, tag = null, tagC = '#E5484D', k = [], inner = '', style = '', cls = '' } = {}) =>
    `<div${key ? ` data-a="${key}"` : ''} class="pv-doc ${key ? '' : 'ab'} ${cls}" style="${st(pos)};${style}">${head === false ? '' : `<i class="hd" style="${head ? 'background:' + head : ''}"></i>`}${lines(n, k)}${inner}${tag ? `<em class="pv-tag" style="background:${tagC}">${tag}</em>` : ''}</div>`;
  const chip = (key, pos, label, ext, c, style = '') => `<div data-a="${key}" class="pv-chip" style="${st(pos)};${style}"><i style="background:${c}">${ext}</i>${label}</div>`;
  const ok = (key, pos) => `<div data-a="${key}" class="pv-ok" style="${st(pos)}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>`;
  const DL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>';
  const dl = (key, pos, t) => `<div data-a="${key}" class="pv-dl" style="${st(pos)}">${DL}${t}</div>`;
  const cursor = key => `<svg data-a="${key}" class="pv-cur" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4 3.9 7.4-3 1.5-3.8-7.5L4 19z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const CHK = (c = '#fff', s = 9) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  const LOUPE = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>';
  const ROT = (c, s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>`;
  const SIGN = (c = '#1E3A8A') => `<svg width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c3-6 5-8 6-6s-2 8 1 7 4-7 6-6-1 6 2 5 3-4 5-4 2 3 4 3 3-2 6-3"/></svg>`;
  const row = (key, cells, cols, { head = false, style = '' } = {}) => `<div data-a="${key}" class="pv-row${head ? ' h' : ''}" style="position:relative;grid-template-columns:${cols};${style}">${cells.map((c, i) => `<span class="${i && /^[−\-+]?[\d.,/%]+( €)?$/.test(c) ? 'n' : ''}">${c}</span>`).join('')}</div>`;
  const PDF = '#E5484D';
  /* il finale comune: spunta e pulsante di download (premuto a metà del risultato) */
  const finale = (tr, okPos, dlPos, label = 'Scarica', tOk = 3.9) => { tr.ok = a({ o: 0 }).pop(tOk); tr.dl = a({ o: 0 }).show(tOk + .3, .35, { y: 8 }).click(5.3); return ok('ok', okPos) + dl('dl', dlPos, label); };

  /* —— le scene: () => { html, tr: {chiave: traccia}, cap: [prima, seconda], capAt } —— */
  const S = {
    flow() {
      const tr = {};
      const T0 = [1.3, 2.1, 3.0], DONE = [1.5, 2.3, 3.2];
      tr.f = a({ o: 0, y: -24 }).at(.45, { o: 1, y: 0 }).go(.75, 1.1, { o: 0, x: -10, y: 62, s: .55 });
      tr.d = a({ o: 0, s: .8, r: -90 }).go(.85, 1.15, { o: 1, s: 1 }, POP).go(2.15, 2.6, { r: 0 });
      tr.hl = a({ o: 0, sx: 0 }).go(1.35, 1.65, { o: 1, sx: 1 });
      tr.rd = a({ sx: 0 }).go(3.1, 3.4, { sx: 1 });
      const VT = [1.0, ...DONE];
      ['v1', 'v2', 'v3', 'v4'].forEach((k, i) => { const x = a({ o: 0, s: .6 }).at(VT[i]).at(VT[i] + .22, { o: 1, s: 1 }, POP); if (i < 3) x.at(VT[i + 1]).at(VT[i + 1] + .1, { o: 0 }); tr[k] = x; });
      [0, 1, 2].forEach(i => { tr['t' + i] = a({ o: 0 }).show(.9 + i * .12, .35, { x: 14, y: 0 }).click(T0[i]); tr['k' + i] = a({ o: 0 }).pop(DONE[i]); });
      tr.cur = a({ o: 0, x: 300, y: 172 }).go(.95, 1.05, { o: 1 }).at(1.28, { x: 206, y: 32 }).click(T0[0]).go(1.75, 2.08, { x: 206, y: 76 }).click(T0[1]).go(2.6, 2.98, { x: 206, y: 120 }).click(T0[2]).go(3.3, 3.7, { x: 300, y: 178, o: 0 });
      const html =
        `<div data-a="f" class="pv-chip" style="left:58px;top:6px"><i style="background:${PDF}">PDF</i>contratto.pdf</div>` +
        `<div data-a="d" class="pv-doc" style="left:66px;top:46px;width:64px;height:84px">
           <i class="hd"></i><b style="width:90%"></b><b style="width:72%"></b>
           <div style="position:relative;height:3px;flex:none"><b style="width:82%"></b><i data-a="hl" style="left:0;top:-1.5px;width:82%;height:6px;border-radius:2px;background:#F2711C;transform-origin:left"></i></div>
           <b style="width:64%"></b><b style="width:86%"></b>
           <div style="position:relative;height:3px;flex:none"><b style="width:76%"></b><i data-a="rd" style="left:0;top:-2px;width:76%;height:7px;border-radius:1.5px;background:#111;transform-origin:left"></i></div>
           <b style="width:58%"></b>
           ${['v1', 'v2', 'v3', 'v4'].map(k => `<em data-a="${k}" class="pv-tag" style="background:var(--accent);right:4px;bottom:5px">${k}</em>`).join('')}</div>` +
        [['✎', 'Modifica', '#F2711C'], [ROT('#fff', 9), 'Ruota', '#3E63DD'], ['■', 'Oscura', '#475467']].map(([n, l, c], i) =>
          `<div data-a="t${i}" class="pv-chip" style="left:182px;top:${22 + i * 44}px;width:104px"><i style="background:${c};font-size:9px">${n}</i>${l}<span data-a="k${i}" style="right:8px;top:6.5px;width:14px;height:14px;border-radius:50%;background:#16A34A;display:grid;place-items:center">${CHK('#fff', 8)}</span></div>`).join('') +
        cursor('cur') + finale(tr, { left: 132, top: 38 }, { left: 52, top: 140 }, 'Scarica v4', 3.85);
      return { html, tr, cap: ['Carica il file e <em>scegli cosa farci</em>…', '…uno strumento dopo l’altro, <em>sullo stesso documento</em>'], capAt: 3.6 };
    },
    unisci() {
      const tr = {};
      const D = [['#7C5CFC', 18, 18, -8, 8], ['#1E88E5', 44, 62, 6, 4], ['#F2711C', 16, 104, -3, 0]];
      D.forEach(([, x, y, r, off], i) => { tr['p' + i] = a({ o: 0, r }).show(.2 + i * .15, .35, { y: 10 }).go(1.15 + i * .25, 1.85 + i * .25, { x: 112 - x + off, y: 50 - y + off, r: 0 }).go(2.85, 3.05, { o: 0 }); });
      tr.m = a({ o: 0, s: .92 }).go(2.8, 3.15, { o: 1, s: 1 }, POP);
      tr.c = a({ o: 0 }).show(3.55, .35, { x: -8, y: 0 });
      const html = D.map(([c, x, y], i) => doc('p' + i, { left: x, top: y, width: 50, height: 64 }, { n: 5, head: c, tag: 'PDF', style: 'transform-origin:center' })).join('') +
        `<div data-a="m" class="pv-doc pv-pile" style="left:112px;top:50px;width:52px;height:68px;gap:3px">
           ${['#7C5CFC', '#1E88E5', '#F2711C'].map(c => `<i class="hd" style="background:${c};width:46%;height:4px;margin:2px 0 0"></i><b style="width:84%"></b><b style="width:66%"></b>`).join('')}<em class="pv-tag" style="background:${PDF}">PDF</em></div>` +
        `<div data-a="c" class="pv-chip" style="left:186px;top:72px"><i style="background:var(--hue)">3→1</i>un solo file</div>` +
        finale(tr, { left: 158, top: 36 }, { left: 186, top: 142 });
      return { html, tr, cap: ['Trascina più PDF, anche foto…', '…e ottieni <em>un unico PDF</em>, nell’ordine che vuoi'], capAt: 3.3 };
    },
    immagini() {
      const tr = {};
      tr.i0 = a({ o: 0, r: -6 }).show(.2, .4, { y: 10 }).go(1.3, 2.05, { x: 119, y: 18, r: 0, s: .62 });
      tr.i1 = a({ o: 0, r: 6 }).show(.4, .4, { y: 10 }).go(1.6, 2.35, { x: 184, y: -57, r: 0, s: .74 });
      tr.g0 = a({ o: 0, s: .85 }).go(.95, 1.25, { o: 1, s: 1 }, POP); tr.g1 = a({ o: 0, s: .85 }).go(1.1, 1.4, { o: 1, s: 1 }, POP);
      tr.n0 = a({ o: 0 }).pop(2.55); tr.n1 = a({ o: 0 }).pop(2.7);
      tr.c = a({ o: 0 }).show(3.5, .35, { y: 8 });
      const photo = (key, pos, bg, inner, label) => `<div data-a="${key}" style="${st(pos)};border-radius:7px;background:${bg};box-shadow:0 6px 14px rgba(0,0,0,.16);overflow:hidden;z-index:2">${inner}<em class="pv-tag" style="background:rgba(0,0,0,.45);right:4px;bottom:4px">${label}</em></div>`;
      const html =
        `<div data-a="g0" class="pv-doc" style="left:146px;top:30px;width:56px;height:76px;padding:0"><em data-a="n0" class="pv-tag" style="background:var(--hue);right:4px;bottom:4px;z-index:3">1</em></div>` +
        `<div data-a="g1" class="pv-doc" style="left:218px;top:30px;width:56px;height:76px;padding:0"><em data-a="n1" class="pv-tag" style="background:var(--hue);right:4px;bottom:4px;z-index:3">2</em></div>` +
        photo('i0', { left: 22, top: 26, width: 66, height: 48 }, 'linear-gradient(160deg,#7CC4FF,#3B82F6)', '<div style="position:absolute;left:8px;bottom:-13px;width:34px;height:34px;background:#16A34A;transform:rotate(45deg)"></div><div style="position:absolute;right:10px;top:7px;width:10px;height:10px;border-radius:50%;background:#FDE047"></div>', 'JPG') +
        photo('i1', { left: 40, top: 96, width: 44, height: 58 }, 'linear-gradient(160deg,#FDBA74,#DB2777)', '<div style="position:absolute;left:12px;top:14px;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.75)"></div><div style="position:absolute;left:6px;top:36px;width:32px;height:26px;border-radius:14px 14px 0 0;background:rgba(255,255,255,.6)"></div>', 'HEIC') +
        `<div data-a="c" class="pv-chip" style="left:150px;top:118px"><i style="background:${PDF}">PDF</i>2 pagine</div>` +
        finale(tr, { left: 266, top: 14 }, { left: 220, top: 146 });
      return { html, tr, cap: ['Foto, scansioni, HEIC dal telefono…', '…diventano <em>un PDF ordinato</em>, una pagina per immagine'], capAt: 3.3 };
    },
    dividi() {
      const tr = {};
      tr.s = a({ o: 0 }).show(.2, .4, { y: 10 }).go(2.0, 2.25, { o: 0, s: .92 });
      tr.c = a({ o: 0 }).show(.75, .35, { y: -8 }).click(1.45).hide(2.4, .3);
      tr.cur = a({ o: 0, x: 280, y: 170 }).go(.9, 1.0, { o: 1 }).at(1.42, { x: 150, y: 16 }).click(1.45).go(1.75, 2.1, { x: 290, y: 178, o: 0 });
      const X = [42, 135, 228];
      [0, 1, 2].forEach(i => { tr['p' + i] = a({ o: 0, x: 133 - X[i] }).go(1.95 + i * .1, 2.1 + i * .1, { o: 1 }).go(2.1 + i * .1, 2.85 + i * .1, { x: 0, r: (i - 1) * 5 }); });
      const html =
        `<div data-a="s" class="pv-doc pv-pile" style="left:131px;top:44px;width:54px;height:72px"><i class="hd"></i>${lines(6)}<em class="pv-tag" style="background:${PDF}">PDF</em></div>` +
        `<div data-a="c" class="pv-chip" style="left:112px;top:8px"><i style="background:var(--hue)">÷</i>Ogni pagina</div>` +
        X.map((x, i) => doc('p' + i, { left: x, top: 46, width: 50, height: 66 }, { n: 5, tag: (i + 1) + '.pdf', tagC: 'var(--hue)', style: 'transform-origin:center' })).join('') +
        cursor('cur') + finale(tr, { left: 268, top: 14 }, { left: 116, top: 140 }, 'Scarica i 3 file');
      return { html, tr, cap: ['Un PDF con tante pagine…', '…diviso in <em>file separati</em>: per pagine, intervalli o ogni N'], capAt: 3.2 };
    },
    comprimi() {
      const tr = {};
      tr.d = a({ o: 0 }).show(.2, .4, { y: 10 }).go(1.35, 2.2, { sx: .86, sy: .74 }).go(2.45, 2.85, { sx: .8, sy: .8 }, POP);
      tr.bt = a({ o: 0, y: -10 }).go(.9, 1.15, { o: 1, y: 0 }).go(1.35, 2.2, { y: 13 }).go(2.45, 2.8, { y: -6, o: 0 });
      tr.bb = a({ o: 0, y: 10 }).go(.9, 1.15, { o: 1, y: 0 }).go(1.35, 2.2, { y: -13 }).go(2.45, 2.8, { y: 6, o: 0 });
      tr.z1 = a({ o: 0 }).show(.5, .35, { x: -8, y: 0 }).go(2.2, 2.4, { o: 0, s: .7 });
      tr.z2 = a({ o: 0, s: .6 }).go(2.4, 2.75, { o: 1, s: 1 }, POP);
      const html =
        doc('d', { left: 92, top: 30, width: 76, height: 104 }, { n: 4, tag: 'PDF', inner: `<div style="height:30px;border-radius:3px;background:linear-gradient(160deg,#9AD7CF,#0FA38F);flex:none;margin:2px 0"></div>${lines(4)}`, style: 'transform-origin:center' }) +
        `<i data-a="bt" style="left:78px;top:16px;width:104px;height:8px;border-radius:4px;background:var(--hue);box-shadow:0 3px 8px color-mix(in srgb,var(--hue) 45%,transparent)"></i>` +
        `<i data-a="bb" style="left:78px;top:142px;width:104px;height:8px;border-radius:4px;background:var(--hue);box-shadow:0 -3px 8px color-mix(in srgb,var(--hue) 45%,transparent)"></i>` +
        `<div data-a="z1" class="pv-chip" style="left:190px;top:64px"><i style="background:${PDF}">MB</i>8,4 MB</div>` +
        `<div data-a="z2" class="pv-chip" style="left:190px;top:64px"><i style="background:#16A34A">MB</i>1,2 MB <span class="g">−86%</span></div>` +
        finale(tr, { left: 266, top: 14 }, { left: 206, top: 142 });
      return { html, tr, cap: ['PDF troppo pesante per la PEC?', '<em>Fino a 10 volte più leggero</em>, con la qualità che scegli'], capAt: 3.2 };
    },
    modifica() {
      const tr = {};
      tr.box = a({ o: 0, s: .96 }).go(1.05, 1.25, { o: 1, s: 1 }).hide(3.45, .3);
      tr.old = a({}).go(1.6, 1.72, { o: 0 });
      tr.sel = a({ o: 0, sx: 0 }).go(1.3, 1.55, { o: 1, sx: 1 }).go(1.6, 1.7, { o: 0 });
      tr.nw = a({ w: '0px' }).go(1.75, 2.65, { w: '50px' }, 'steps(10,end)').go(3.05, 3.1, { o: 0 });
      tr.nb = a({ o: 0 }).go(3.05, 3.1, { o: 1 });
      tr.car = a({ o: 0 }).go(1.7, 1.75, { o: 1 }).go(1.75, 2.65, { x: 50 }, 'steps(10,end)').hide(3.4, .2);
      tr.tb = a({ o: 0 }).show(1.3, .3, { y: 6 }).hide(3.45, .3);
      tr.bB = a({}).click(3.0);
      tr.cur = a({ o: 0, x: 300, y: 170 }).go(.3, .45, { o: 1 }).at(.98, { x: 100, y: 62 }).click(1.0).go(2.6, 2.95, { x: 120, y: 34 }).click(3.0).go(3.3, 3.7, { x: 300, y: 178, o: 0 });
      const html =
        `<div class="pv-doc ab" style="left:40px;top:12px;width:176px;height:154px;padding:14px 12px;gap:7px"><i class="hd" style="width:44%"></i><b style="width:92%"></b><b style="width:84%"></b>
           <div style="position:relative;height:12px;flex:none;margin:3px 0">
             <i data-a="box" style="left:-4px;top:-3px;width:118px;height:18px;border:1.5px solid var(--hue);border-radius:4px;background:color-mix(in srgb,var(--hue) 6%,#fff)"></i>
             <span class="ab" style="left:0;top:0;font:700 9px/12px var(--font);color:#3A3D46">Totale:</span>
             <i data-a="sel" style="left:35px;top:0;width:52px;height:12px;background:color-mix(in srgb,#3B82F6 30%,transparent);transform-origin:left"></i>
             <span data-a="old" style="left:36px;top:0;font:700 9px/12px var(--font);color:#3A3D46;white-space:nowrap">1.200,00 €</span>
             <span data-a="nw" style="left:36px;top:0;height:12px;overflow:hidden;font:600 9px/12px var(--font);color:var(--hue);white-space:nowrap">1.450,00 €</span>
             <span data-a="nb" style="left:36px;top:0;font:900 9px/12px var(--font);color:var(--hue);white-space:nowrap">1.450,00 €</span>
             <i data-a="car" style="left:36px;top:0;width:1.5px;height:12px;background:#17181C"></i>
           </div>${lines(7, [], [76, 88, 60, 82, 70, 86, 54])}</div>` +
        `<div data-a="tb" style="left:104px;top:24px;display:flex;gap:3px;padding:3px;background:#fff;border-radius:8px;box-shadow:0 6px 14px rgba(0,0,0,.16)"><b data-a="bB" style="position:relative;display:grid;place-items:center;width:20px;height:18px;border-radius:5px;background:color-mix(in srgb,var(--hue) 14%,#fff);font:900 10px var(--font);color:#222">B</b>${['<i>I</i>', '<u>U</u>', '<span style="color:#E5484D">A</span>'].map(x => `<div style="width:20px;height:18px;display:grid;place-items:center;font:700 10px var(--font);color:#222">${x}</div>`).join('')}</div>` +
        cursor('cur') + finale(tr, { left: 228, top: 14 }, { left: 228, top: 142 }, 'Salva PDF');
      return { html, tr, cap: ['Clicca su un testo del PDF…', '…e <em>riscrivilo come in Word</em>: stile, colore, paragrafi'], capAt: 3.4 };
    },
    ruota() {
      const tr = {};
      const X = [34, 135, 236], R0 = [0, 180, -90];
      X.forEach((x, i) => { tr['p' + i] = a({ o: 0, r: R0[i] }).show(.2 + i * .12, .35, { y: 10 }); tr['b' + i] = a({ o: 0 }).show(.6 + i * .1, .3, { y: 6 }); tr['k' + i] = a({ o: 0 }).pop(3.6 + i * .15); });
      tr.p1.go(1.15, 1.85, { r: 360 }); tr.p2.go(2.15, 2.7, { r: 0 });
      tr.b1.click(1.05); tr.b2.click(2.05);
      tr.cur = a({ o: 0, x: 290, y: 175 }).go(.6, .7, { o: 1 }).at(1.02, { x: 157, y: 127 }).click(1.05).go(1.6, 1.95, { x: 258, y: 127 }).click(2.05).go(2.8, 3.2, { x: 300, y: 178, o: 0 });
      const html = X.map((x, i) =>
          doc('p' + i, { left: x, top: 28, width: 52, height: 70 }, { n: 6, tag: 'PDF', style: 'transform-origin:center' }) +
          `<div data-a="b${i}" style="left:${x + 14}px;top:116px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 4px 10px rgba(0,0,0,.14);display:grid;place-items:center">${ROT('var(--hue)')}</div>` +
          `<div data-a="k${i}" style="left:${x + 16}px;top:118px;width:20px;height:20px;border-radius:50%;background:#16A34A;display:grid;place-items:center;box-shadow:0 4px 10px rgba(22,163,74,.35)">${CHK('#fff', 10)}</div>`).join('') +
        cursor('cur');
      return { html, tr, cap: ['Pagine storte o capovolte?', '<em>Raddrizzale</em> una a una o tutte insieme'], capAt: 3.3 };
    },
    ordina() {
      const tr = {};
      const X = [24, 90, 156, 222];
      tr.p3 = a({ o: 0 }).show(.2, .35, { y: 10 }).go(1.0, 1.2, { y: -6, r: -4, s: 1.08 }).go(1.25, 2.2, { x: 132, y: -6, r: -4, s: 1.08 }).go(2.25, 2.45, { x: 132, y: 0, r: 0, s: 1 });
      tr.p1 = a({ o: 0 }).show(.3, .35, { y: 10 }).go(1.55, 2.0, { x: -66 });
      tr.p2 = a({ o: 0 }).show(.4, .35, { y: 10 }).go(1.7, 2.15, { x: -66 });
      tr.cur = a({ o: 0, x: 280, y: 170 }).go(.45, .55, { o: 1 }).at(.95, { x: 46, y: 76 }).click(1.0).go(1.25, 2.2, { x: 178, y: 70 }).at(2.45, { x: 178, y: 76 }).go(2.6, 3.0, { x: 300, y: 178, o: 0 });
      tr.ph = a({ o: 0, s: .9 }).go(3.65, 3.95, { o: 1, s: 1 }, POP).go(4.35, 4.5, { o: 0 });
      tr.p4 = a({ o: 0, s: .9 }).go(4.35, 4.6, { o: 1, s: 1 }, POP);
      tr.ok = a({ o: 0 }).pop(4.9);
      const pg = (key, x, n, blank = false) => doc(key, { left: x, top: 46, width: 50, height: 66 }, { n: blank ? 0 : 5, head: blank ? false : null, tag: String(n), tagC: 'var(--hue)', style: 'transform-origin:center;z-index:' + (n === 3 ? 3 : 1) });
      const html = pg('p3', X[0], 3) + pg('p1', X[1], 1) + pg('p2', X[2], 2) +
        `<div data-a="ph" style="left:${X[3]}px;top:46px;width:50px;height:66px;border-radius:6px;border:1.5px dashed color-mix(in srgb,var(--hue) 70%,#fff);display:grid;place-items:center;color:var(--hue);font:800 18px var(--font)">+</div>` +
        pg('p4', X[3], 4, true) + ok('ok', { left: 262, top: 14 }) + cursor('cur');
      return { html, tr, cap: ['Trascina le pagine nell’ordine giusto…', '…<em>duplica, elimina</em> o aggiungi pagine bianche'], capAt: 3.4 };
    },
    numeri() {
      const tr = {};
      const X = [34, 129, 224];
      X.forEach((x, i) => { tr['p' + i] = a({ o: 0 }).show(.15 + i * .1, .35, { y: 10 }); tr['n' + i] = a({ o: 0, s: 1.6 }).go(1.45 + i * .22, 1.7 + i * .22, { o: 1, s: 1 }, POP).go(4.05, 4.45, { x: 16 }); tr['h' + i] = a({ o: 0, sx: 0 }).go(2.3 + i * .15, 2.6 + i * .15, { o: .55, sx: 1 }); });
      tr.c1 = a({ o: 0 }).show(.55, .35, { y: 8 }).click(1.15).hide(3.75, .2);
      tr.c2 = a({ o: 0 }).go(3.75, 3.95, { o: 1 }).click(3.9);
      tr.cur = a({ o: 0, x: 290, y: 175 }).go(.7, .8, { o: 1 }).at(1.12, { x: 140, y: 140 }).click(1.15).go(1.4, 1.8, { x: 300, y: 178, o: 0 }).go(3.4, 3.5, { o: 1 }).at(3.88, { x: 214, y: 140 }).click(3.9).go(4.2, 4.6, { x: 300, y: 178, o: 0 });
      tr.ok = a({ o: 0 }).pop(4.7);
      const html = X.map((x, i) => `<div data-a="p${i}" class="pv-doc" style="left:${x}px;top:16px;width:62px;height:100px;padding-top:12px"><i class="hd"></i>${lines(7)}
          <i data-a="h${i}" style="left:7px;right:7px;top:4px;height:3px;border-radius:2px;background:var(--hue);transform-origin:left"></i>
          <span data-a="n${i}" style="left:0;right:0;bottom:6px;text-align:center;font:800 7.5px var(--font);color:var(--hue)">${i + 1} di 3</span></div>`).join('') +
        `<div data-a="c1" class="pv-chip" style="left:84px;top:130px"><i style="background:var(--hue)">#</i>Pagina N di T · al centro</div>` +
        `<div data-a="c2" class="pv-chip" style="left:84px;top:130px"><i style="background:var(--hue)">#</i>Pagina N di T · a destra</div>` +
        ok('ok', { left: 288, top: 4 }) + cursor('cur');
      return { html, tr, cap: ['Numeri, intestazioni e piè di pagina…', '…con <em>anteprima dal vivo</em> su ogni pagina'], capAt: 3.4 };
    },
    ocr() {
      const tr = {};
      tr.d = a({ o: 0, r: -1.5 }).show(.15, .4, { y: 10 });
      tr.cr = a({ clip: 'inset(0px 0px 100% 0px)' }).go(.8, 2.6, { clip: 'inset(0px 0px 0% 0px)' }, LIN);
      tr.bm = a({ o: 0 }).go(.7, .8, { o: 1 }).go(.8, 2.6, { y: 148 }, LIN).go(2.6, 2.8, { o: 0 });
      tr.sel = a({ o: 0, sx: 0 }).go(3.0, 3.4, { o: 1, sx: 1 });
      tr.c1 = a({ o: 0 }).show(3.5, .35, { x: -10, y: 0 }); tr.c2 = a({ o: 0 }).show(3.85, .35, { x: -10, y: 0 });
      tr.ok = a({ o: 0 }).pop(4.4);
      const ws = [90, 80, 88, 64, 92, 74, 86, 58, 80, 70];
      const L = k => ws.map(w => `<b style="width:${w}%;${k ? 'background:#2F323A' : 'background:#B9B6AE;filter:blur(.7px)'}"></b>`).join('');
      const html =
        `<div data-a="d" class="pv-doc" style="left:40px;top:12px;width:124px;height:154px;padding:14px 11px;gap:9px;background:#EFECE6;transform-origin:center">
           <i class="hd" style="background:#999;filter:blur(.6px)"></i>${L(false)}
           <div data-a="cr" style="inset:0;padding:14px 11px;display:flex;flex-direction:column;gap:9px;background:#fff"><i class="hd" style="background:var(--hue);flex:none;height:6px;border-radius:3px;width:58%;margin-bottom:2px"></i>${L(true)}
             <i data-a="sel" style="left:9px;top:47px;width:96px;height:9px;border-radius:2px;background:color-mix(in srgb,#3B82F6 32%,transparent);transform-origin:left"></i></div></div>` +
        `<i data-a="bm" style="left:30px;top:10px;width:144px;height:3px;border-radius:2px;background:var(--hue);box-shadow:0 0 14px 4px color-mix(in srgb,var(--hue) 55%,transparent)"></i>` +
        `<div data-a="c1" class="pv-chip" style="left:178px;top:50px"><i style="background:var(--hue)">Aa</i>Testo copiabile</div>` +
        `<div data-a="c2" class="pv-chip" style="left:178px;top:88px"><i style="background:#3B82F6">${LOUPE}</i>Ricercabile</div>` + ok('ok', { left: 268, top: 14 });
      return { html, tr, cap: ['Una scansione o una foto…', '…diventa un PDF <em>ricercabile e copiabile</em>'], capAt: 3.3 };
    },
    word() {
      const tr = {};
      tr.p = a({ o: 0 }).show(.15, .4, { y: 10 });
      tr.ar = a({ o: 0 }).show(.7, .3, { x: -8, y: 0 });
      tr.pb = a({ sx: 0 }).go(.9, 2.3, { sx: 1 });
      tr.w = a({ o: 0, sx: 0 }).go(2.4, 2.8, { o: 1, sx: 1 }, POP);
      tr.ty = a({ w: '0px' }).go(3.7, 4.4, { w: '44px' }, 'steps(8,end)');
      const body = c => `<div style="display:flex;align-items:center;gap:5px;flex:none"><i style="width:12px;height:12px;border-radius:3px;background:linear-gradient(135deg,#F59E0B,#E5484D);flex:none"></i><i class="hd" style="background:${c};width:44%;margin:0"></i></div>${lines(5)}`;
      const html =
        `<div data-a="p" class="pv-doc" style="left:30px;top:26px;width:80px;height:110px;padding:10px 8px;gap:5px">${body('#3A3D46')}<div style="flex:none;align-self:flex-end;margin-top:2px">${SIGN()}</div><em class="pv-tag" style="background:${PDF}">PDF</em></div>` +
        `<div data-a="ar" style="left:122px;top:66px;width:38px;display:flex;flex-direction:column;align-items:center;gap:6px"><div style="width:30px;height:30px;border-radius:50%;background:var(--hue);color:#fff;display:grid;place-items:center;box-shadow:0 6px 16px color-mix(in srgb,var(--hue) 45%,transparent)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div><div style="position:relative;width:34px;height:3px;border-radius:2px;background:#D9DCE3;overflow:hidden"><i data-a="pb" style="left:0;top:0;width:100%;height:100%;background:var(--hue);transform-origin:left"></i></div></div>` +
        `<div data-a="w" class="pv-doc" style="left:176px;top:22px;width:88px;height:116px;padding:10px 8px;gap:5px">${body('#2B579A')}
           <div style="position:relative;height:3px;flex:none"><span data-a="ty" style="left:0;top:-3px;height:9px;overflow:hidden;font:700 6.5px/9px var(--font);color:#2B579A;white-space:nowrap">Rev. 2 · ok</span></div>
           <div style="flex:none;align-self:flex-end;margin-top:2px">${SIGN()}</div><em class="pv-tag" style="background:#2B579A">DOCX</em></div>` +
        finale(tr, { left: 256, top: 10 }, { left: 190, top: 146 }, 'Word');
      return { html, tr, cap: ['PDF e scansioni…', '…in <em>Word modificabile</em>, con loghi e firme al loro posto'], capAt: 3.1 };
    },
    pdfa() {
      const tr = {};
      const C = ['Font incorporati', 'Colori sRGB', 'Metadati XMP'];
      tr.d = a({ o: 0 }).show(.15, .4, { y: 10 }).go(3.35, 3.42, { y: 2 }).at(3.55, { y: 0 });
      C.forEach((_, i) => { tr['c' + i] = a({ o: 0 }).show(.6 + i * .25, .35, { x: -10, y: 0 }); tr['s' + i] = a({}).go(1.4 + i * .5, 1.5 + i * .5, { o: 0 }); tr['k' + i] = a({ o: 0, s: .4 }).go(1.45 + i * .5, 1.7 + i * .5, { o: 1, s: 1 }, POP); });
      tr.st = a({ o: 0, s: 1.9, r: -12 }).go(3.1, 3.35, { o: 1, s: 1 }, 'cubic-bezier(.5,0,.9,.6)').go(3.35, 3.48, { s: 1.04 }).at(3.62, { s: 1 });
      tr.dl = a({ o: 0 }).show(4.0, .35, { y: 8 }).click(5.3);
      const html =
        doc('d', { left: 40, top: 24, width: 96, height: 126 }, { n: 11, tag: 'PDF' }) +
        C.map((t, i) => `<div data-a="c${i}" class="pv-chip" style="left:158px;top:${26 + i * 36}px;width:130px"><i style="background:transparent;position:relative"><span data-a="s${i}" style="left:2px;top:2px"><i class="pv-spin"></i></span><span data-a="k${i}" style="inset:0;border-radius:4px;background:#16A34A;display:grid;place-items:center">${CHK()}</span></i>${t}</div>`).join('') +
        `<div data-a="st" style="left:46px;top:72px;border:3px solid var(--hue);color:var(--hue);font:900 15px/1 var(--font);padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.88);letter-spacing:.02em;white-space:nowrap">PDF/A-2b</div>` +
        dl('dl', { left: 172, top: 140 }, 'Scarica PDF/A');
      return { html, tr, cap: ['Serve il PDF/A per PEC o conservazione?', '<em>Conforme e verificato</em>, pronto da archiviare'], capAt: 3.2 };
    },
    moduli() {
      const tr = {};
      const F = [['Nome', 'Mario'], ['Cognome', 'Rossi'], ['Codice fiscale', 'RSSMRA80A01H501U']];
      tr.bm = a({ o: 0 }).go(.6, .7, { o: 1 }).go(.7, 2.1, { y: 116 }, LIN).go(2.1, 2.3, { o: 0 });
      [0, 1, 2, 3].forEach(i => { tr['f' + i] = a({ o: 0, s: .9 }).go(.95 + i * .3, 1.2 + i * .3, { o: 1, s: 1 }, POP); });
      tr.c = a({ o: 0 }).show(2.3, .35, { x: -10, y: 0 });
      const TT = [[3.75, 4.1, 5], [4.25, 4.6, 5], [4.75, 5.4, 16]];
      F.forEach(([, v], i) => { const [t0, t1, n] = TT[i]; tr['t' + i] = a({ w: '0px' }).go(t0, t1, { w: (v.length * 4.82 + 2).toFixed(1) + 'px' }, `steps(${n},end)`); });
      tr.x = a({ o: 0, s: .4 }).go(5.5, 5.7, { o: 1, s: 1 }, POP);
      tr.cur = a({ o: 0, x: 300, y: 172 }).go(3.45, 3.55, { o: 1 }).at(3.7, { x: 124, y: 48 }).click(3.72).go(4.15, 4.24, { x: 124, y: 76 }).click(4.24).go(4.65, 4.74, { x: 124, y: 104 }).click(4.74).go(5.25, 5.45, { x: 93, y: 132 }).click(5.48).go(5.7, 6.1, { x: 300, y: 178, o: 0 });
      tr.dl = a({ o: 0 }).show(5.7, .35, { y: 8 });
      const html =
        `<div class="pv-doc ab" style="left:28px;top:10px;width:178px;height:158px;padding:12px 12px">
           <i class="hd" style="width:52%"></i>
           ${F.map(([l, v], i) => `<div class="ab" style="left:12px;right:12px;top:${32 + i * 28}px;height:16px;display:flex;align-items:flex-end;gap:6px;font:700 7.5px var(--font);color:#555"><span style="padding-bottom:2px">${l}</span><i style="flex:1;height:1px;background:#AAA;margin-bottom:3px"></i></div>
             <i data-a="f${i}" style="left:${i === 2 ? 74 : 62}px;top:${32 + i * 28}px;width:${i === 2 ? 92 : 104}px;height:16px;border:1.5px solid var(--hue);border-radius:3px;background:color-mix(in srgb,var(--hue) 8%,#fff)"></i>
             <span data-a="t${i}" style="left:${(i === 2 ? 74 : 62) + 4}px;top:${32 + i * 28 + 2}px;height:12px;overflow:hidden;white-space:nowrap;font:700 8px/12px ui-monospace,monospace;color:#111">${v}</span>`).join('')}
           <div class="ab" style="left:12px;top:118px;height:16px;display:flex;align-items:center;font:700 7.5px var(--font);color:#555">Privacy</div>
           <i data-a="f3" style="left:62px;top:119px;width:14px;height:14px;border:1.5px solid var(--hue);border-radius:3px;background:#fff"></i>
           <span data-a="x" style="left:64px;top:121px;width:10px;height:10px;display:grid;place-items:center">${CHK('var(--hue)', 11)}</span>
         </div>` +
        `<i data-a="bm" style="left:20px;top:34px;width:194px;height:3px;border-radius:2px;background:var(--hue);box-shadow:0 0 14px 4px color-mix(in srgb,var(--hue) 50%,transparent)"></i>` +
        `<div data-a="c" class="pv-chip" style="left:214px;top:28px;padding:6px 8px"><i style="background:var(--hue)">4</i>campi</div>` +
        dl('dl', { left: 218, top: 142 }, 'Scarica') + cursor('cur');
      return { html, tr, cap: ['Un PDF da stampare e compilare a penna?', '<em>Campi riconosciuti da soli</em>: compilalo al computer'], capAt: 3.4 };
    },
    firme() {
      const tr = {};
      tr.env = a({ o: 0 }).show(.2, .4, { y: 10 }).click(1.2).go(1.6, 2.0, { o: 0, s: .85, y: 14 });
      tr.d = a({ o: 0, y: 26, s: .85 }).go(1.35, 1.5, { o: 1 }).go(1.5, 2.1, { y: -10, s: 1, r: -3 });
      tr.cur = a({ o: 0, x: 290, y: 170 }).go(.6, .7, { o: 1 }).at(1.15, { x: 80, y: 78 }).click(1.2).go(1.5, 1.9, { x: 300, y: 178, o: 0 });
      tr.pn = a({ o: 0 }).show(2.3, .35, { x: -10, y: 0 });
      [0, 1, 2, 3].forEach(i => { tr['r' + i] = a({ o: 0 }).show(2.5 + i * .28, .3, { x: -6, y: 0 }); });
      tr.dl = a({ o: 0 }).show(4.0, .35, { y: 8 }).click(5.3);
      const html =
        `<div data-a="d" style="left:46px;top:40px;transform-origin:center">${doc('', { left: 0, top: 0, width: 66, height: 88 }, { n: 7, tag: 'PDF', style: 'position:relative', inner: `<div style="flex:none;align-self:flex-end">${SIGN('#0F766E')}</div>` })}</div>` +
        `<div data-a="env" style="left:34px;top:44px;width:96px;height:72px;border-radius:10px;background:linear-gradient(160deg,#14B8A6,#0F766E);box-shadow:0 8px 18px rgba(0,0,0,.2);color:#fff;font:900 13px var(--font);display:grid;place-items:center;overflow:hidden">
           <svg class="ab" style="left:0;top:0" width="96" height="40" viewBox="0 0 96 40"><path d="M0 0l48 30L96 0" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/></svg>
           <span style="margin-top:22px">.p7m</span><i class="ab" style="left:40px;top:22px;width:16px;height:16px;border-radius:50%;background:#E5484D;box-shadow:0 0 0 2px rgba(255,255,255,.5)"></i></div>` +
        `<div data-a="pn" style="left:136px;top:26px;width:154px;background:#fff;border-radius:10px;box-shadow:0 8px 18px rgba(0,0,0,.14);padding:10px;font:600 8.5px/1 var(--font);color:#333;display:flex;flex-direction:column;gap:7px">
           ${['<b style="color:#16A34A;font-weight:800;font-size:10px">Firma valida</b>', 'Firmato da <b>M. Bianchi</b>', '12/03/2026 · CAdES', 'Certificato attendibile'].map((t, i) => `<div data-a="r${i}" style="position:relative;display:flex;align-items:center;gap:6px"><span style="width:13px;height:13px;border-radius:50%;background:#16A34A;display:grid;place-items:center;flex:none">${CHK('#fff', 8)}</span><span>${t}</span></div>`).join('')}</div>` +
        dl('dl', { left: 166, top: 138 }, 'Report PDF') + cursor('cur');
      return { html, tr, cap: ['Ti arriva un file firmato .p7m?', '<em>Aprilo</em> e verifica chi ha firmato e quando'], capAt: 2.5 };
    },
    xbrl() {
      const tr = {};
      tr.c = a({ o: 0 }).show(.15, .4, { y: 10 }).go(2.6, 3.0, { x: -4, s: .95 });
      tr.hl = a({ o: 0 }).go(.8, .95, { o: 1 }).go(1.2, 1.5, { y: 22 }).go(1.75, 2.05, { y: 44 }).go(2.3, 2.5, { o: 0 });
      tr.p = a({ o: 0 }).pop(2.75);
      const R = [['Voce', '2025', '2024'], ['Totale attivo', '505.595', '463.780'], ['Ricavi', '1.245.890', '1.132.470'], ['Utile', '81.560', '61.000']];
      R.forEach((_, i) => { tr['g' + i] = a({ o: 0 }).show(3.0 + i * .15, .3, { x: 8, y: 0 }); });
      tr.sh = a({ clip: 'inset(-20px -20px 100% -20px)' }).go(3.0, 3.75, { clip: 'inset(-20px -20px -20px -20px)' }, LIN);
      const code = `&lt;<span style="color:#89B4FA">xbrl</span>&gt;<br>&nbsp;&lt;<span style="color:#F9E2AF">TotaleAttivo</span>&gt;<br>&nbsp;&nbsp;<span style="color:#A6E3A1">505595</span><br>&nbsp;&lt;<span style="color:#F9E2AF">Ricavi</span>&gt;<br>&nbsp;&nbsp;<span style="color:#A6E3A1">1245890</span><br>&nbsp;&lt;<span style="color:#F9E2AF">Utile</span>&gt;<br>&nbsp;&nbsp;<span style="color:#A6E3A1">81560</span><br>&lt;/<span style="color:#89B4FA">xbrl</span>&gt;`;
      const html =
        `<div data-a="c" style="left:12px;top:22px;width:108px;height:136px;border-radius:9px;background:#1E1E2E;box-shadow:0 8px 18px rgba(0,0,0,.2);padding:10px 9px;font:600 7px/11px ui-monospace,monospace;color:#A6ADC8;white-space:nowrap;overflow:hidden;transform-origin:left center">
           <i data-a="hl" style="left:4px;right:4px;top:31px;height:12px;border-radius:3px;background:rgba(166,227,161,.18);box-shadow:inset 0 0 0 1px rgba(166,227,161,.45)"></i>${code}</div>` +
        doc('p', { left: 214, top: 6, width: 50, height: 66 }, { n: 6, tag: 'PDF' }) +
        `<div data-a="sh" class="pv-sheet" style="left:132px;top:80px;width:176px">${R.map((r, i) => row('g' + i, r, '70px 53px 53px', { head: !i })).join('')}</div>` +
        finale(tr, { left: 276, top: 6 }, { left: 132, top: 150 }, 'PDF + Excel', 3.9);
      return { html, tr, cap: ['Il bilancio XBRL della Camera di commercio…', 'in <em>PDF leggibile</em> e in <em>Excel</em>: voce, anno, anno prima'], capAt: 2.8 };
    },
    excel() {
      const tr = {};
      tr.p = a({ o: 0 }).show(.15, .4, { y: 10 });
      tr.bm = a({ o: 0 }).go(.7, .8, { o: 1 }).go(.8, 2.2, { y: 118 }, LIN).go(2.2, 2.4, { o: 0 });
      const R = [['Voce', '2025', '2024'], ['Ricavi', '1.245', '1.132'], ['Costi', '1.131', '1.050'], ['Imposte', '35', '26'], ['Utile', '79', '56']];
      R.forEach((_, i) => { tr['g' + i] = a({ o: 0 }).show(1.2 + i * .25, .3, { x: 8, y: 0 }); });
      tr.sh = a({ clip: 'inset(-20px -20px 100% -20px)' }).go(1.2, 2.5, { clip: 'inset(-20px -20px -20px -20px)' }, LIN);
      tr.cell = a({ o: 0, s: .9 }).go(3.6, 3.85, { o: 1, s: 1 }, POP);
      tr.fx = a({ o: 0 }).show(3.7, .35, { y: 8 });
      tr.dl = a({ o: 0 }).show(4.1, .35, { y: 8 }).click(5.3);
      const html =
        `<div data-a="p" class="pv-doc" style="left:14px;top:20px;width:102px;height:136px;padding:10px 8px;gap:6px"><i class="hd" style="background:#3A3D46"></i>${R.map((r, i) => `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:3px;flex:none;padding-bottom:3px;border-bottom:1px solid #E6E7EB">${r.map((c, j) => `<span style="font:${i ? 600 : 800} 5.5px/1 var(--font);color:#555;${j ? 'text-align:right' : ''}">${c}</span>`).join('')}</div>`).join('')}${lines(3)}<em class="pv-tag" style="background:${PDF}">PDF</em></div>` +
        `<i data-a="bm" style="left:8px;top:22px;width:114px;height:3px;border-radius:2px;background:var(--hue);box-shadow:0 0 14px 4px color-mix(in srgb,var(--hue) 50%,transparent)"></i>` +
        `<div data-a="sh" class="pv-sheet" style="left:142px;top:20px;width:164px">${R.map((r, i) => row('g' + i, r, '64px 50px 50px', { head: !i })).join('')}
           <i data-a="cell" style="left:64px;top:60px;width:50px;height:15px;border:2px solid #1D6F42;border-radius:1px"></i></div>` +
        `<div data-a="fx" class="pv-chip" style="left:142px;top:112px;font:700 10px/1 ui-monospace,monospace"><i style="background:#1D6F42;font-family:var(--font)">fx</i>=B2-B3-B4</div>` +
        dl('dl', { left: 226, top: 146 }, 'Excel');
      return { html, tr, cap: ['Tabelle in PDF, anche scansionate…', '…in <em>Excel con numeri veri</em>, bordi e colonne come nel PDF'], capAt: 3.3 };
    },
    ricevute() {
      const tr = {};
      tr.r = a({ o: 0 }).show(.2, .35, { x: -10, y: 0 }).go(1.3, 2.0, { x: 76, y: 20, s: .5, o: 0 });
      tr.k = a({ o: 0 }).show(.45, .35, { x: -10, y: 0 }).go(1.45, 2.15, { x: 74, y: -26, s: .5, o: 0 });
      tr.lk = a({ o: 0, s: .7 }).go(.9, 1.2, { o: 1, s: 1 }, POP).go(2.2, 2.35, { s: 1.12 }).go(2.35, 2.6, { o: 0, s: .8 });
      tr.sh = a({}).go(2.1, 2.3, { y: -5, r: 18 });
      tr.p = a({ o: 0, s: .7 }).go(2.45, 2.8, { o: 1, s: 1 }, POP);
      tr.es = a({ sx: 0 }).go(3.0, 3.35, { sx: 1 });
      tr.v = a({ o: 0 }).show(3.6, .35, { x: -10, y: 0 });
      const html =
        chip('r', { left: 16, top: 50 }, 'ricevuta.rcc', 'RCC', '#B45309') +
        chip('k', { left: 26, top: 96 }, 'UTEC.P12', '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><circle cx="8" cy="15" r="4.5"/><path d="M11.5 12L20 3.5M17 6.5l2.5 2.5"/></svg>', '#475467') +
        `<div data-a="lk" style="left:122px;top:62px;width:40px;height:44px"><svg width="40" height="44" viewBox="0 0 40 44" style="overflow:visible"><path data-a="sh" d="M11 20v-7a9 9 0 0 1 18 0v7" fill="none" stroke="var(--hue)" stroke-width="4" stroke-linecap="round" style="transform-origin:29px 20px"/><rect x="5" y="19" width="30" height="23" rx="6" fill="var(--hue)"/><circle cx="20" cy="30" r="3.4" fill="#fff"/></svg></div>` +
        `<div data-a="p" class="pv-doc" style="left:114px;top:12px;width:92px;height:118px;padding:12px 9px;gap:5px"><i class="hd"></i>${lines(3)}<div style="position:relative;height:16px;flex:none;margin:3px 0"><div data-a="es" style="inset:0;border-radius:5px;background:#DCFCE7;color:#15803D;font:900 7.5px/16px var(--font);padding:0 5px;transform-origin:left;white-space:nowrap">ESITO: ACCOLTA</div></div>${lines(3)}<em class="pv-tag" style="background:${PDF}">PDF</em></div>` +
        `<div data-a="v" class="pv-chip" style="left:84px;top:142px"><i style="background:#16A34A">${CHK()}</i>Firma dell’Agenzia verificata</div>` + ok('ok', { left: 196, top: 4 });
      tr.ok = a({ o: 0 }).pop(3.9);
      return { html, tr, cap: ['Le ricevute Entratel (.rcc)…', '…in <em>PDF stampabile</em>, con la firma dell’Agenzia verificata'], capAt: 2.6 };
    },
    oscura() {
      const tr = {};
      tr.b0 = a({ sx: 0 }).go(.95, 1.55, { sx: 1 }, LIN);
      tr.cur = a({ o: 0, x: 290, y: 172 }).go(.5, .6, { o: 1 }).at(.93, { x: 58, y: 54 }).go(.95, 1.55, { x: 186, y: 54 }, LIN).go(1.7, 2.0, { x: 300, y: 178, o: 0 });
      tr.au = a({ o: 0 }).show(1.75, .35, { y: -8 });
      tr.b1 = a({ sx: 0 }).go(2.15, 2.45, { sx: 1 }); tr.b2 = a({ sx: 0 }).go(2.45, 2.75, { sx: 1 });
      tr.sr = a({ o: 0 }).show(3.6, .35, { y: 8 });
      tr.ok = a({ o: 0 }).pop(4.2);
      const ln = (txt, bar, x, w) => `<div style="position:relative;flex:none;white-space:nowrap">${txt}<i data-a="${bar}" style="left:${x}px;top:-2px;width:${w}px;height:11px;background:#111;border-radius:2px;transform-origin:left"></i></div>`;
      const html =
        `<div class="pv-doc ab" style="left:20px;top:10px;width:196px;height:156px;padding:14px 12px;gap:10px;font:700 8px/1 ui-monospace,monospace;color:#333">
          <i class="hd"></i><b style="width:88%"></b>
          ${ln('IBAN IT60X0542811101000000123456', 'b0', 23, 132)}<b style="width:72%"></b>
          ${ln('C.F. RSSMRA80A01H501U', 'b1', 23, 79)}<b style="width:80%"></b>
          ${ln('mario.rossi@pec.it', 'b2', -1, 89)}<b style="width:64%"></b></div>` +
        `<div data-a="au" class="pv-chip" style="left:176px;top:6px"><i style="background:var(--hue)">${LOUPE}</i>Trova C.F. ed email</div>` +
        `<div data-a="sr" class="pv-chip" style="left:150px;top:142px"><i style="background:var(--hue)">${LOUPE}</i>«IT60…» · <span class="g">0 risultati</span></div>` +
        ok('ok', { left: 232, top: 62 }) + cursor('cur');
      return { html, tr, cap: ['IBAN, codici fiscali, email…', '…<em>oscurati per sempre</em>: il testo sotto non c’è più'], capAt: 3.3 };
    },
    fatture() {
      const tr = {};
      const F = [['IT01234567890_0001.xml', 'XML', '#0B7285'], ['fattura_0042.xml.p7m', 'P7M', '#0F766E'], ['fatture_marzo.zip', 'ZIP', '#475467']];
      F.forEach((_, i) => { tr['f' + i] = a({ o: 0 }).show(.15 + i * .18, .35, { x: 12, y: 0 }).go(1.05 + i * .15, 1.6 + i * .15, { x: -110, y: 20 - i * 30, s: .6, o: 0 }); });
      const R = [['Controparte', 'Data', 'Totale'], ['Alfa S.r.l.', '03/03', '1.220,00'], ['Beta S.p.A.', '11/03', '488,00'], ['Studio Gamma', '28/03', '2.537,60']];
      R.forEach((_, i) => { tr['g' + i] = a({ o: 0 }).show(1.3 + i * .2, .3, { x: -8, y: 0 }); });
      tr.sh = a({ clip: 'inset(-20px -20px 100% -20px)' }).go(1.3, 2.2, { clip: 'inset(-20px -20px -20px -20px)' }, LIN);
      tr.sel = a({ o: 0 }).go(2.35, 2.5, { o: 1 });
      tr.p0 = a({ o: 0, r: -6, x: -20, s: .8 }).go(3.0, 3.45, { o: 1, x: 0, s: 1 }, POP);
      tr.p1 = a({ o: 0, r: 5, x: -20, s: .8 }).go(3.15, 3.6, { o: 1, x: 0, s: 1 }, POP);
      tr.x = a({ o: 0 }).show(3.6, .35, { y: 8 });
      const inv = key => `<div data-a="${key}" class="pv-doc" style="left:${key === 'p0' ? 204 : 240}px;top:${key === 'p0' ? 18 : 30}px;width:56px;height:74px;padding:8px 6px;gap:3px"><div style="display:flex;gap:3px;flex:none"><i style="flex:1;height:14px;border:1px solid #BBB;border-radius:1px"></i><i style="flex:1;height:14px;border:1px solid #BBB;border-radius:1px"></i></div>${lines(5)}<em class="pv-tag" style="background:${PDF}">PDF</em></div>`;
      const html =
        F.map(([n, e, c], i) => chip('f' + i, { left: 132, top: 26 + i * 38 }, n, e, c, 'font-size:9.5px')).join('') +
        `<div data-a="sh" class="pv-sheet" style="left:12px;top:26px;width:176px">${R.map((r, i) => row('g' + i, r, '78px 40px 58px', { head: !i, style: 'font-size:7.5px' })).join('')}
           <i data-a="sel" style="left:0;right:0;top:15px;bottom:0;background:color-mix(in srgb,var(--hue) 12%,transparent);box-shadow:inset 3px 0 0 var(--hue)"></i></div>` +
        inv('p0') + inv('p1') +
        `<div data-a="x" class="pv-chip" style="left:204px;top:116px"><i style="background:#1D6F42">XLS</i>Prestazioni</div>` +
        finale(tr, { left: 284, top: 8 }, { left: 30, top: 142 }, 'Scarica i PDF (ZIP)', 4.0);
      return { html, tr, cap: ['XML, P7M o ZIP, anche a centinaia…', '…in <em>PDF leggibili</em> e nell’<em>Excel</em> delle prestazioni'], capAt: 2.9 };
    },
  };

  /* —— in pausa quando la scheda non si vede (risparmio di CPU): si fermano e ripartono insieme —— */
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => { for (const an of e.target.__pvAnims || []) e.isIntersecting ? an.play() : an.pause(); })) : null;
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const POSTER = 5.0; // fotogramma fermo per chi preferisce meno movimento

  function card(id, t) {
    const f = S[id]; if (!f) return null;
    inject();
    const { html, tr, cap, capAt = 3.4 } = f();
    const el = h('aside', { class: 'pv', style: { '--hue': t.hue }, 'aria-label': 'Come funziona: ' + t.title });
    const stage = h('div', { class: 'pv-stage' }); stage.innerHTML = `<div class="pv-scene" data-a="_scene">${html}</div>`;
    const capEl = h('div', { class: 'pv-cap' }); capEl.innerHTML = `<span data-a="_c1">${cap[0]}</span><span data-a="_c2">${cap[1]}</span>`;
    el.append(stage, capEl, h('div', { class: 'pv-foot' }, h('span', { class: 'pv-dot' }), 'Come funziona', h('span', { class: 'pv-bar' }, h('i', { 'data-a': '_bar' }))));
    const all = { ...tr,
      _scene: a({ o: 0 }).at(.3, { o: 1 }).go(6.65, 7, { o: 0 }),
      // didascalie a tendina, non in dissolvenza: il testo ha sempre il suo colore pieno (contrasto leggibile in ogni istante)
      _c1: a({ clip: 'inset(0% 100% 0% 0%)', y: 4 }).at(.3, { clip: 'inset(0% 0% 0% 0%)', y: 0 }).go(capAt - .25, capAt, { clip: 'inset(0% 0% 0% 100%)', y: 0 }),
      _c2: a({ clip: 'inset(0% 100% 0% 0%)', y: 4 }).go(capAt, capAt + .3, { clip: 'inset(0% 0% 0% 0%)', y: 0 }).go(6.6, 6.95, { clip: 'inset(0% 0% 0% 100%)', y: 0 }),
      _bar: a({ sx: 0 }).at(7, { sx: 1 }, LIN) };
    const anims = [];
    if (Element.prototype.animate) {
      for (const node of el.querySelectorAll('[data-a]')) {
        const k = node.getAttribute('data-a'), track = all[k]; if (!track) continue;
        try { anims.push(node.animate(keyframes(track.fr), { duration: T * 1000, iterations: Infinity, fill: 'both' })); } catch (e) { console.warn('promo', id, k, e); }
      }
      if (reduce()) for (const an of anims) { an.pause(); an.currentTime = POSTER * 1000; }
      else if (io) { el.__pvAnims = anims; io.observe(el); }
    }
    return el;
  }
  return { card, ids: () => Object.keys(S), T };
})();

/* =====================================================================
   Loader — durante l'attesa, una piccola animazione in loop dedicata allo strumento
   (la stessa mano del «video» accanto al caricamento: pagine bianche, colore dello strumento,
   gesti semplici). Solo trasformazioni e opacità: restano fluide anche quando il lavoro tiene
   impegnato il processore. Chi preferisce meno movimento vede un fotogramma fermo.
   ===================================================================== */
const Loader = (() => {
  const D = 2.8; // secondi per giro
  // pagina: righe di testo (::before) e intestazione colorata (::after)
  const pg = (cls, st = '', inner = '') => `<i class="ld-pg ${cls}" style="${st}">${inner}</i>`;
  const tag = (t, c, st = '') => `<b class="ld-tag" style="background:${c};${st}">${t}</b>`;
  const CHK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ok = (cls, st) => `<i class="ld-ok ${cls}" style="${st}">${CHK}</i>`;
  const PEN = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 20l1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.6 18.8z" fill="#F7C548" stroke="#1d1f25" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 20l1.2-4.6 3.4 3.4z" fill="#1d1f25"/><path d="M14 6.6l3.4 3.4" stroke="#1d1f25" stroke-width="1.4"/></svg>';
  const SCI = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--hue)" stroke-width="2.2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/></svg>';
  const STAR = (s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}"><path d="M12 1.5c.6 5.3 3.2 8 10.5 10.5-7.3 2.5-9.9 5.2-10.5 10.5C11.4 17.2 8.8 14.5 1.5 12 8.8 9.5 11.4 6.8 12 1.5z" fill="var(--hue)"/></svg>`;
  const SWAP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--hue)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h15l-4-4M20 16H5l4 4"/></svg>';
  const BASE = `
.ld{position:relative;width:224px;height:126px;margin:0 auto 12px;border-radius:16px;overflow:hidden;background:radial-gradient(120% 100% at 0% 0%,color-mix(in srgb,var(--hue) 18%,var(--surface)) 0%,color-mix(in srgb,var(--hue) 5%,var(--surface)) 62%);border:1px solid color-mix(in srgb,var(--hue) 16%,var(--line))}
.ld::before{content:"";position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--hue) 24%,transparent) 1px,transparent 1.2px);background-size:13px 13px;opacity:.35}
.ld svg *{position:static}
.ld *{position:absolute;box-sizing:border-box;font-style:normal;animation-duration:${D}s;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(.45,0,.25,1)}
.ld-pg{width:46px;height:60px;background:#fff;border-radius:5px;box-shadow:0 5px 14px rgba(20,20,30,.15),0 0 0 1px rgba(20,20,30,.06)}
.ld-pg::before{content:"";position:absolute;left:7px;right:9px;top:17px;bottom:8px;background:repeating-linear-gradient(#D7D9DF 0 2.5px,transparent 2.5px 7px);-webkit-mask:linear-gradient(90deg,#000 0 82%,transparent 82%) 0 0/100% 14px,linear-gradient(#000,#000);mask:linear-gradient(#000,#000)}
.ld-pg::after{content:"";position:absolute;left:7px;top:8px;width:55%;height:5px;border-radius:3px;background:var(--hue)}
.ld-pg.np::after{display:none}.ld-pg.np::before{top:9px}
.ld-tag{font:800 7.5px/1 var(--font,system-ui);color:#fff;padding:3px 4.5px;border-radius:4px;letter-spacing:.04em;white-space:nowrap}
.ld-ok{width:22px;height:22px;border-radius:50%;background:#16A34A;display:grid;place-items:center;box-shadow:0 4px 10px rgba(22,163,74,.4)}
.ld-ok svg{position:static;width:13px;height:13px}
.ld-chip{background:#fff;border-radius:7px;padding:4px 6px;font:750 8px/1 var(--font,system-ui);color:#1d1f25;box-shadow:0 4px 10px rgba(20,20,30,.13);white-space:nowrap}
.ld-hue{background:var(--hue)}
@media (prefers-reduced-motion:reduce){.ld *{animation-play-state:paused!important;animation-delay:-1.4s!important}}
`;
  // ogni scena: html (in coordinate di un palcoscenico 224×126) e css con le sue animazioni
  const S = {
    comprimi: {
      html: `<i class="c-plate t"></i><i class="c-plate b"></i>${pg('c-doc', 'left:89px;top:30px')}<i class="ld-chip c-kb" style="left:146px;top:22px">pesante</i><i class="ld-chip c-kb2" style="left:146px;top:22px;color:#15803D">leggero</i><i class="c-arr" style="left:28px;top:52px"></i><i class="c-arr r" style="left:178px;top:52px"></i>`,
      css: `.c-plate{left:72px;width:80px;height:9px;border-radius:5px;background:var(--hue);box-shadow:0 3px 8px color-mix(in srgb,var(--hue) 40%,transparent)}
.c-plate.t{top:12px;animation-name:cT}.c-plate.b{top:105px;animation-name:cB}
@keyframes cT{0%,15%{transform:none}45%,70%{transform:translateY(19px)}90%,100%{transform:none}}
@keyframes cB{0%,15%{transform:none}45%,70%{transform:translateY(-19px)}90%,100%{transform:none}}
.c-doc{animation-name:cD;transform-origin:50% 50%}
@keyframes cD{0%,15%{transform:none}45%,70%{transform:scaleY(.42) scaleX(1.06)}90%,100%{transform:none}}
.c-kb{animation-name:cK1}.c-kb2{animation-name:cK2}
@keyframes cK1{0%,35%{opacity:1;transform:none}48%,100%{opacity:0;transform:translateY(-6px)}}
@keyframes cK2{0%,45%{opacity:0;transform:translateY(6px) scale(.8)}55%,85%{opacity:1;transform:none}95%,100%{opacity:0}}
.c-arr{width:18px;height:18px;border-right:3px solid var(--hue);border-bottom:3px solid var(--hue);border-radius:2px;transform:rotate(-45deg);opacity:.5;animation-name:cA}
.c-arr.r{transform:rotate(135deg);animation-name:cAr}
@keyframes cA{0%,15%,90%,100%{transform:rotate(-45deg);opacity:.25}45%,70%{transform:translateX(10px) rotate(-45deg);opacity:.8}}
@keyframes cAr{0%,15%,90%,100%{transform:rotate(135deg);opacity:.25}45%,70%{transform:translateX(-10px) rotate(135deg);opacity:.8}}`,
    },
    unisci: {
      html: `${pg('u-a', 'left:22px;top:12px')}${pg('u-b', 'left:89px;top:-70px')}${pg('u-c', 'left:156px;top:12px')}<i class="u-stack ld-pg" style="left:89px;top:40px"></i>${tag('1 PDF', 'var(--hue)', 'left:120px;top:92px')}`,
      css: `.u-a{animation-name:uA}.u-b{animation-name:uB}.u-c{animation-name:uC}
@keyframes uA{0%{transform:translate(0,0) rotate(-8deg);opacity:0}12%{opacity:1}35%,100%{transform:translate(67px,28px) rotate(0);opacity:0}}
@keyframes uB{0%,18%{transform:translate(0,0);opacity:0}25%{opacity:1}52%,100%{transform:translate(0,110px);opacity:0}}
@keyframes uC{0%,32%{transform:translate(0,0) rotate(8deg);opacity:0}42%{opacity:1}68%,100%{transform:translate(-67px,28px) rotate(0);opacity:0}}
.u-stack{animation-name:uS;box-shadow:3px 3px 0 -1px #fff,3px 3px 0 0 rgba(20,20,30,.13),6px 6px 0 -1px #fff,6px 6px 0 0 rgba(20,20,30,.1),0 8px 18px rgba(20,20,30,.16)}
@keyframes uS{0%,30%{transform:scale(.92)}36%{transform:scale(1.05)}44%,100%{transform:none}}
.ld .ld-tag:last-child{animation-name:uT}
@keyframes uT{0%,66%{opacity:0;transform:scale(.6)}74%,92%{opacity:1;transform:none}100%{opacity:0}}`,
    },
    dividi: {
      html: `<i class="dv-l" style="left:56px;top:30px">${pg('', 'left:0;top:0')}</i><i class="dv-r" style="left:122px;top:30px">${pg('', 'left:0;top:0')}</i><i class="dv-cut" style="left:111px;top:14px"></i><i class="dv-sc" style="left:102px;top:4px">${SCI}</i>`,
      css: `.dv-l,.dv-r{width:46px;height:60px}.dv-l{animation-name:dvL}.dv-r{animation-name:dvR}
@keyframes dvL{0%,10%{transform:translateX(33px)}45%,100%{transform:none}}
@keyframes dvR{0%,10%{transform:translateX(-33px)}45%,100%{transform:none}}
.dv-cut{width:2px;height:96px;background:repeating-linear-gradient(var(--hue) 0 5px,transparent 5px 9px);animation-name:dvC;transform-origin:top}
@keyframes dvC{0%,8%{transform:scaleY(0);opacity:1}35%{transform:scaleY(1);opacity:1}55%,100%{opacity:0}}
.dv-sc{animation-name:dvS;line-height:0}
@keyframes dvS{0%{transform:translateY(0) rotate(90deg);opacity:0}8%{opacity:1}35%{transform:translateY(92px) rotate(90deg);opacity:1}45%,100%{transform:translateY(100px) rotate(90deg);opacity:0}}`,
    },
    ocr: {
      html: `<i class="ld-pg np o-pg" style="left:62px;top:14px;width:76px;height:98px"><i class="o-blur"></i><i class="o-txt"></i><i class="o-beam"></i></i><i class="ld-chip o-a" style="left:150px;top:30px">Aa</i><i class="ld-chip o-b" style="left:150px;top:62px">«testo»</i>`,
      css: `.o-pg::before{display:none}
.o-blur,.o-txt{left:8px;right:10px;top:10px;bottom:10px;background:repeating-linear-gradient(#C7CAD2 0 4px,transparent 4px 9px);filter:blur(1.4px);opacity:.75}
.o-txt{filter:none;opacity:1;background:repeating-linear-gradient(#2E3138 0 3px,transparent 3px 9px);transform-origin:top;animation-name:oT}
@keyframes oT{0%,6%{transform:scaleY(0)}70%,88%{transform:scaleY(1)}100%{transform:scaleY(1);opacity:0}}
.o-beam{left:-6px;right:-6px;top:6px;height:3px;border-radius:2px;background:var(--hue);box-shadow:0 0 12px 3px color-mix(in srgb,var(--hue) 55%,transparent);animation-name:oB}
@keyframes oB{0%,6%{transform:translateY(0);opacity:1}70%{transform:translateY(80px);opacity:1}78%,100%{transform:translateY(80px);opacity:0}}
.o-a{animation-name:oA}.o-b{animation-name:oC}
@keyframes oA{0%,25%{opacity:0;transform:translateX(-8px)}35%,88%{opacity:1;transform:none}100%{opacity:0}}
@keyframes oC{0%,50%{opacity:0;transform:translateX(-8px)}60%,88%{opacity:1;transform:none}100%{opacity:0}}`,
    },
    word: {
      html: `${pg('w-src', 'left:30px;top:32px', tag('PDF', '#E5484D', 'right:-4px;bottom:6px'))}<i class="w-ch" style="left:96px;top:54px"></i><i class="w-ch" style="left:106px;top:54px;animation-delay:.15s"></i><i class="w-ch" style="left:116px;top:54px;animation-delay:.3s"></i>${pg('w-dst', 'left:146px;top:32px', tag('W', '#2B579A', 'right:-4px;bottom:6px') + '<i class="w-car" style="left:30px;top:24px"></i>')}`,
      css: `.w-ch{width:10px;height:10px;border-right:3px solid var(--hue);border-top:3px solid var(--hue);transform:rotate(45deg);animation-name:wC}
@keyframes wC{0%,100%{opacity:.2}30%{opacity:1}}
.w-src{animation-name:wS}@keyframes wS{0%,20%{transform:none}40%{transform:translateX(6px) scale(.96)}60%,100%{transform:none}}
.w-dst{animation-name:wD}@keyframes wD{0%,35%{opacity:.25;transform:scale(.92)}52%,100%{opacity:1;transform:none}}
.w-car{width:2px;height:9px;background:#2B579A;animation-name:wK;animation-timing-function:steps(1)}
@keyframes wK{0%,49%{opacity:1}50%,100%{opacity:0}}`,
    },
    excel: {
      html: `<i class="x-grid" style="left:46px;top:20px">${Array.from({ length: 15 }, (_, i) => `<i class="x-c${i < 3 ? ' h' : ''}" style="left:${(i % 3) * 44}px;top:${Math.floor(i / 3) * 17}px;animation-delay:${(0.1 + i * .09).toFixed(2)}s"></i>`).join('')}</i>${tag('XLS', '#1D6F42', 'left:176px;top:96px')}`,
      css: `.x-grid{width:132px;height:85px;background:#fff;border-radius:6px;box-shadow:0 5px 14px rgba(20,20,30,.15);overflow:hidden}
.x-c{width:44px;height:17px;border-right:1px solid #E3E6EA;border-bottom:1px solid #E3E6EA}
.x-c::after{content:"";position:absolute;right:6px;top:6px;width:24px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--hue) 70%,#fff);transform-origin:right;animation:inherit;animation-name:xF;animation-delay:inherit}
.x-c.h{background:#17181C}.x-c.h::after{background:#fff;left:6px;right:auto;width:22px;transform-origin:left}
@keyframes xF{0%{transform:scaleX(0)}20%,85%{transform:scaleX(1)}100%{transform:scaleX(0)}}`,
    },
    ruota: {
      html: `${pg('r-doc', 'left:89px;top:33px')}<i class="r-arc" style="left:70px;top:22px"></i>`,
      css: `.r-doc{animation-name:rD}
@keyframes rD{0%,15%{transform:rotate(90deg)}45%,60%{transform:rotate(0)}60.01%,100%{transform:rotate(0)}}
.r-arc{width:84px;height:84px;border-radius:50%;border:3px solid transparent;border-top-color:var(--hue);border-right-color:var(--hue);animation-name:rA;opacity:.8}
.r-arc::after{content:"";position:absolute;right:2px;top:58px;border:6px solid transparent;border-top:8px solid var(--hue);transform:rotate(20deg)}
@keyframes rA{0%,15%{transform:rotate(-90deg);opacity:0}25%{opacity:.8}45%{transform:rotate(0);opacity:.8}60%,100%{transform:rotate(0);opacity:0}}`,
    },
    ordina: {
      html: ['3', '1', '2'].map((n, i) => `<i class="ld-pg np or-${n}" style="left:${42 + i * 50}px;top:36px;width:40px;height:52px"><b class="or-n">${n}</b></i>`).join(''),
      css: `.or-n{left:0;right:0;top:15px;text-align:center;font:800 18px/1 var(--font,system-ui);color:var(--hue)}
.ld-pg.np[class*="or-"]::before{display:none}
.or-3{animation-name:or3}.or-1{animation-name:or1}.or-2{animation-name:or2}
@keyframes or3{0%,15%{transform:none}25%{transform:translateY(-18px)}45%{transform:translate(100px,-18px)}55%,85%{transform:translate(100px,0)}100%{transform:none}}
@keyframes or1{0%,40%{transform:none}55%,85%{transform:translateX(-50px)}100%{transform:none}}
@keyframes or2{0%,40%{transform:none}55%,85%{transform:translateX(-50px)}100%{transform:none}}`,
    },
    numeri: {
      html: [0, 1, 2].map(i => pg('nu-p', `left:${40 + i * 52}px;top:26px;animation-delay:${i * .3}s`, `<b class="nu-n" style="animation-delay:${(.35 + i * .3).toFixed(2)}s">${i + 1}</b>`)).join(''),
      css: `.nu-p{animation-name:nuP}@keyframes nuP{0%{transform:translateY(6px);opacity:0}12%,90%{transform:none;opacity:1}100%{opacity:0}}
.nu-n{left:0;right:0;bottom:4px;text-align:center;font:800 9px/1 var(--font,system-ui);color:#fff;background:var(--hue);width:16px;margin:auto;border-radius:4px;padding:2px 0;animation-name:nuN}
@keyframes nuN{0%{transform:scale(2.2);opacity:0}10%{transform:scale(.9);opacity:1}16%,85%{transform:none;opacity:1}100%{opacity:0}}`,
    },
    pdfa: {
      html: `${pg('', 'left:80px;top:26px;width:54px;height:72px')}<i class="pa-seal" style="left:116px;top:62px"><b>PDF/A</b></i><i class="pa-shine"></i>${ok('pa-ok', 'left:150px;top:24px')}`,
      css: `.pa-seal{width:44px;height:44px;border-radius:50%;background:var(--hue);display:grid;place-items:center;box-shadow:0 0 0 3px #fff,0 6px 14px color-mix(in srgb,var(--hue) 45%,transparent);animation-name:paS}
.pa-seal b{position:static;font:800 8.5px/1 var(--font,system-ui);color:#fff}
@keyframes paS{0%,15%{transform:translateY(-60px) rotate(-30deg) scale(1.3);opacity:0}32%{transform:rotate(6deg) scale(.92);opacity:1}40%,88%{transform:rotate(-8deg);opacity:1}100%{opacity:0}}
.pa-shine{left:0;top:0;width:40px;height:126px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-60px) skewX(-18deg);animation-name:paH}
@keyframes paH{0%,45%{transform:translateX(-60px) skewX(-18deg)}70%,100%{transform:translateX(260px) skewX(-18deg)}}
.pa-ok{animation-name:paO}@keyframes paO{0%,48%{transform:scale(0)}56%{transform:scale(1.2)}62%,88%{transform:none}100%{transform:scale(0)}}`,
    },
    verificapdfa: {
      html: `${pg('', 'left:34px;top:24px;width:56px;height:76px')}<i class="vf-lens" style="left:40px;top:28px"></i>${[0, 1, 2].map(i => `<i class="vf-row" style="left:112px;top:${30 + i * 24}px;animation-delay:${(.4 + i * .45).toFixed(2)}s"><i class="vf-b"></i><i class="vf-k">${CHK}</i></i>`).join('')}`,
      css: `.vf-lens{width:30px;height:30px;border-radius:50%;border:4px solid var(--hue);background:rgba(255,255,255,.35);animation-name:vfL}
.vf-lens::after{content:"";position:absolute;width:4px;height:13px;border-radius:2px;background:var(--hue);left:27px;top:24px;transform:rotate(-45deg)}
@keyframes vfL{0%{transform:none}30%{transform:translate(18px,12px)}60%{transform:translate(4px,36px)}85%{transform:translate(20px,24px)}100%{transform:none}}
.vf-row{width:84px;height:16px;animation-name:vfR}
.vf-b{left:22px;top:5px;width:58px;height:5px;border-radius:3px;background:color-mix(in srgb,var(--hue) 35%,#fff)}
.vf-k{left:0;top:0;width:16px;height:16px;border-radius:50%;background:#16A34A;display:grid;place-items:center}.vf-k svg{position:static;width:10px;height:10px}
@keyframes vfR{0%{opacity:0;transform:translateX(-8px)}12%,85%{opacity:1;transform:none}100%{opacity:0}}`,
    },
    modifica: {
      html: `<i class="ld-pg np" style="left:66px;top:16px;width:76px;height:96px"><i class="md-l" style="top:14px;width:52px"></i><i class="md-l" style="top:24px;width:40px"></i><i class="md-w" style="top:38px"></i><i class="md-l" style="top:52px;width:48px"></i><i class="md-l" style="top:62px;width:34px"></i></i><i class="md-pen" style="left:80px;top:20px">${PEN}</i>`,
      css: `.md-l{left:10px;height:3px;border-radius:2px;background:#D7D9DF}
.md-w{left:10px;width:50px;height:4px;border-radius:2px;background:var(--hue);transform-origin:left;animation-name:mdW}
@keyframes mdW{0%,10%{transform:scaleX(0)}60%,85%{transform:scaleX(1)}100%{transform:scaleX(1);opacity:0}}
.md-pen{line-height:0;animation-name:mdP;filter:drop-shadow(0 3px 4px rgba(0,0,0,.2))}
@keyframes mdP{0%,10%{transform:translate(-6px,8px)}20%{transform:translate(4px,6px)}30%{transform:translate(14px,9px)}40%{transform:translate(24px,6px)}50%{transform:translate(34px,9px)}60%{transform:translate(44px,6px)}75%,100%{transform:translate(60px,-6px);opacity:.0}}`,
    },
    moduli: {
      html: `<i class="ld-pg np" style="left:56px;top:12px;width:112px;height:102px">${[0, 1, 2].map(i => `<i class="mo-f" style="top:${12 + i * 26}px"><i class="mo-t" style="animation-delay:${(i * .5).toFixed(1)}s"></i></i>`).join('')}<i class="mo-box" style="left:10px;top:86px"><i class="mo-x">${CHK}</i></i><i class="md-l" style="left:28px;top:90px;width:40px"></i></i>`,
      css: `.mo-f{left:10px;right:10px;height:16px;border:1.5px solid color-mix(in srgb,var(--hue) 55%,#ccc);border-radius:4px;background:color-mix(in srgb,var(--hue) 6%,#fff)}
.mo-t{left:5px;top:5px;width:60%;height:4px;border-radius:2px;background:#2E3138;transform-origin:left;animation-name:moT;animation-timing-function:steps(8)}
@keyframes moT{0%,5%{transform:scaleX(0)}30%,88%{transform:scaleX(1)}100%{transform:scaleX(1);opacity:0}}
.mo-box{width:12px;height:12px;border:1.5px solid var(--hue);border-radius:3px}
.mo-x{inset:-1.5px;background:var(--hue);border-radius:3px;display:grid;place-items:center;animation-name:moX}.mo-x svg{position:static;width:9px;height:9px}
@keyframes moX{0%,72%{transform:scale(0)}80%,90%{transform:none}100%{transform:scale(0)}}
.md-l{height:3px;border-radius:2px;background:#D7D9DF}`,
    },
    oscura: {
      html: `<i class="ld-pg np" style="left:66px;top:14px;width:84px;height:98px">${[14, 26, 38, 50, 62, 74].map((y, i) => `<i class="os-l" style="top:${y}px;width:${[58, 46, 62, 40, 54, 36][i]}px"></i>`).join('')}${[[26, 40, .2], [50, 30, .7], [74, 26, 1.2]].map(([y, w, d]) => `<i class="os-b" style="top:${y - 2}px;width:${w + 8}px;left:${[18, 30, 12][[26, 50, 74].indexOf(y)]}px;animation-delay:${d}s"></i>`).join('')}</i>`,
      css: `.os-l{left:10px;height:3px;border-radius:2px;background:#D7D9DF}
.os-b{height:8px;border-radius:2px;background:#111;transform-origin:left;animation-name:osB}
@keyframes osB{0%{transform:scaleX(0)}18%,85%{transform:scaleX(1)}100%{transform:scaleX(1);opacity:0}}`,
    },
    firme: {
      html: `${pg('', 'left:54px;top:16px;width:70px;height:94px')}<svg class="fi-sig" style="left:62px;top:72px" width="54" height="20" viewBox="0 0 54 20" fill="none" stroke="#1E3A8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M2 14c4-8 7-11 8-8s-3 11 2 9 5-9 8-8-1 8 3 7 4-6 7-6 3 4 6 4 4-3 8-4 4 0 6-1"/></svg><i class="fi-seal" style="left:132px;top:34px"><i class="fi-rib a"></i><i class="fi-rib b"></i><i class="fi-c">${CHK}</i></i>`,
      css: `.fi-sig path{stroke-dasharray:1;stroke-dashoffset:1;animation:fiS ${D}s infinite ease-in-out}
@keyframes fiS{0%,8%{stroke-dashoffset:1}50%,88%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0}}
.fi-seal{width:42px;height:42px;animation-name:fiE}
.fi-c{inset:0;border-radius:50%;background:var(--hue);display:grid;place-items:center;box-shadow:0 0 0 3px #fff,0 6px 14px color-mix(in srgb,var(--hue) 40%,transparent)}.fi-c svg{position:static;width:20px;height:20px}
.fi-rib{width:10px;height:20px;background:color-mix(in srgb,var(--hue) 80%,#000);top:32px;clip-path:polygon(0 0,100% 0,100% 100%,50% 75%,0 100%)}.fi-rib.a{left:8px;transform:rotate(18deg)}.fi-rib.b{left:24px;transform:rotate(-18deg)}
@keyframes fiE{0%,50%{transform:scale(0) rotate(-40deg)}62%{transform:scale(1.15)}70%,90%{transform:none}100%{transform:scale(0)}}`,
    },
    xbrl: {
      html: `<i class="ld-chip xb-t" style="left:18px;top:28px;color:var(--hue)">&lt;xbrl&gt;</i><i class="ld-chip xb-t" style="left:26px;top:58px;color:var(--hue);animation-delay:.25s">&lt;ricavi&gt;</i><i class="ld-chip xb-t" style="left:18px;top:88px;color:var(--hue);animation-delay:.5s">&lt;utile&gt;</i><i class="xb-ch" style="left:112px;top:20px">${[46, 62, 38, 74].map((hh, i) => `<i class="xb-b" style="left:${12 + i * 22}px;height:${hh}px;animation-delay:${(.5 + i * .15).toFixed(2)}s"></i>`).join('')}</i>`,
      css: `.xb-t{animation-name:xbT}@keyframes xbT{0%{opacity:0;transform:translateX(-10px)}10%,40%{opacity:1;transform:none}55%,100%{opacity:0;transform:translateX(40px)}}
.xb-ch{width:100px;height:86px;background:#fff;border-radius:8px;box-shadow:0 5px 14px rgba(20,20,30,.15)}
.xb-b{bottom:10px;width:14px;border-radius:3px 3px 0 0;background:var(--hue);transform-origin:bottom;animation-name:xbB}
@keyframes xbB{0%,10%{transform:scaleY(0)}35%,88%{transform:scaleY(1)}100%{transform:scaleY(0)}}`,
    },
    fatture: {
      html: `${['XML', 'P7M', 'ZIP'].map((t, i) => `<i class="ft-f" style="left:${24 + i * 30}px;top:8px;animation-delay:${(i * .2).toFixed(1)}s">${tag(t, ['#0B7285', '#0F766E', '#475467'][i], 'position:static')}</i>`).join('')}<i class="ld-pg np ft-inv" style="left:118px;top:24px;width:66px;height:86px"><i class="md-l" style="left:9px;top:12px;width:30px"></i><i class="md-l" style="left:9px;top:22px;width:44px"></i><i class="md-l" style="left:9px;top:32px;width:38px"></i><i class="ft-tot">1.220,00 €</i></i>`,
      css: `.ft-f{animation-name:ftF}@keyframes ftF{0%{transform:translate(0,0);opacity:0}10%{opacity:1}45%,100%{transform:translate(90px,60px) scale(.5);opacity:0}}
.ft-inv{animation-name:ftI}@keyframes ftI{0%,35%{transform:scale(.9);opacity:.35}50%,90%{transform:none;opacity:1}100%{opacity:.35}}
.md-l{height:3px;border-radius:2px;background:#D7D9DF}
.ft-tot{left:7px;right:7px;bottom:8px;font:800 8px/1 var(--font,system-ui);color:#fff;background:var(--hue);border-radius:4px;padding:4px 3px;text-align:center;animation-name:ftT}
@keyframes ftT{0%,48%{transform:scaleX(0)}60%,90%{transform:none}100%{transform:scaleX(0)}}`,
    },
    ricevute: {
      html: `<i class="rc-env" style="left:64px;top:52px"><i class="rc-rec ld-pg" style="left:14px;top:-4px;width:68px;height:56px"></i><i class="rc-front"></i><i class="rc-flap"></i></i>${ok('rc-ok', 'left:166px;top:20px')}`,
      css: `.rc-env{width:96px;height:58px}
.rc-front{inset:0;border-radius:6px;background:color-mix(in srgb,var(--hue) 75%,#fff);clip-path:polygon(0 0,50% 55%,100% 0,100% 100%,0 100%);box-shadow:0 6px 14px rgba(20,20,30,.15)}
.rc-flap{left:0;right:0;top:0;height:34px;background:var(--hue);clip-path:polygon(0 0,100% 0,50% 100%);transform-origin:top;animation-name:rcF}
@keyframes rcF{0%,10%{transform:none}30%,80%{transform:scaleY(-1)}95%,100%{transform:none}}
.rc-rec{animation-name:rcR}@keyframes rcR{0%,25%{transform:translateY(10px)}50%,80%{transform:translateY(-46px)}95%,100%{transform:translateY(10px)}}
.rc-ok{animation-name:paO}@keyframes paO{0%,48%{transform:scale(0)}56%{transform:scale(1.2)}62%,82%{transform:none}92%,100%{transform:scale(0)}}`,
    },
    immagini: {
      html: `<i class="ld-pg np im-pg" style="left:84px;top:26px;width:58px;height:78px"></i>${[0, 1, 2].map(i => `<i class="im-ph" style="left:${88}px;top:${30}px;animation-delay:${(i * .35).toFixed(2)}s;background:${['#F59E0B', '#22C55E', '#3B82F6'][i]}"><i class="im-m"></i><i class="im-s"></i></i>`).join('')}`,
      css: `.im-pg::before{display:none}
.im-ph{width:50px;height:38px;border-radius:4px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,.18);border:2px solid #fff;animation-name:imP}
.im-m{left:-6px;bottom:-10px;width:40px;height:30px;background:rgba(255,255,255,.55);transform:rotate(45deg)}
.im-s{right:6px;top:5px;width:9px;height:9px;border-radius:50%;background:#fff}
@keyframes imP{0%{transform:translate(-80px,-40px) rotate(-20deg);opacity:0}12%{opacity:1}30%,80%{transform:translate(0,0) rotate(0);opacity:1}95%,100%{transform:translate(0,0);opacity:0}}`,
    },
    immaginipdf: {
      html: `${pg('ip-src', 'left:34px;top:30px')}${[0, 1, 2].map(i => `<i class="im-ph ip-ph" style="left:44px;top:42px;animation-delay:${(i * .3).toFixed(1)}s;background:${['#F59E0B', '#22C55E', '#3B82F6'][i]};--tx:${100 + i * 26}px;--ty:${-22 + i * 22}px"><i class="im-m"></i><i class="im-s"></i></i>`).join('')}`,
      css: `.im-ph{width:42px;height:32px;border-radius:4px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,.18);border:2px solid #fff}
.im-m{left:-6px;bottom:-10px;width:36px;height:26px;background:rgba(255,255,255,.55);transform:rotate(45deg)}.im-s{right:5px;top:4px;width:8px;height:8px;border-radius:50%;background:#fff}
.ip-ph{animation-name:ipP}@keyframes ipP{0%,10%{transform:none;opacity:0}20%{opacity:1}50%,85%{transform:translate(var(--tx),var(--ty)) rotate(6deg);opacity:1}100%{transform:translate(var(--tx),var(--ty));opacity:0}}`,
    },
    impagina: {
      html: `<i class="ld-pg np ia-sheet" style="left:52px;top:30px;width:120px;height:80px"></i>${pg('ia-a', 'left:20px;top:8px;width:34px;height:46px')}${pg('ia-b', 'left:170px;top:8px;width:34px;height:46px')}`,
      css: `.ia-sheet::before{display:none}.ia-sheet::after{display:none}
.ia-a{animation-name:iaA}.ia-b{animation-name:iaB}
@keyframes iaA{0%{transform:translate(0,0) rotate(-10deg)}35%,85%{transform:translate(52px,40px)}100%{transform:translate(0,0) rotate(-10deg)}}
@keyframes iaB{0%,15%{transform:translate(0,0) rotate(10deg)}50%,85%{transform:translate(-56px,40px)}100%{transform:translate(0,0) rotate(10deg)}}`,
    },
    proteggi: {
      html: `<i class="pr-lock" style="left:88px;top:22px"><i class="pr-sh"></i><i class="pr-body"><i class="pr-key"></i></i></i><i class="ld-chip pr-aes" style="left:150px;top:88px">AES 256</i>`,
      css: `.pr-lock{width:48px;height:76px}
.pr-sh{left:9px;top:0;width:30px;height:36px;border:6px solid color-mix(in srgb,var(--hue) 85%,#000);border-bottom:0;border-radius:15px 15px 0 0;animation-name:prS}
@keyframes prS{0%,15%{transform:translateY(-12px)}40%,85%{transform:none}100%{transform:translateY(-12px)}}
.pr-body{left:0;top:30px;width:48px;height:40px;border-radius:9px;background:var(--hue);box-shadow:0 6px 14px color-mix(in srgb,var(--hue) 40%,transparent)}
.pr-key{left:20px;top:11px;width:8px;height:14px;border-radius:4px;background:rgba(255,255,255,.85);animation-name:prK}
@keyframes prK{0%,40%{opacity:.4}48%{opacity:1;transform:scale(1.3)}56%,100%{opacity:.85;transform:none}}
.pr-aes{animation-name:prA}@keyframes prA{0%,42%{opacity:0;transform:scale(.7)}52%,88%{opacity:1;transform:none}100%{opacity:0}}`,
    },
    migliora: {
      html: `<i class="mg-ph" style="left:74px;top:24px"><i class="mg-txt"></i><i class="mg-dark"></i></i>${[16, 12, 18].map((z, i) => `<i class="mg-sp" style="left:${[66, 150, 140][i]}px;top:${[18, 30, 92][i]}px;animation-delay:${(.6 + i * .2).toFixed(1)}s">${STAR(z)}</i>`).join('')}`,
      css: `.mg-ph{width:72px;height:80px;background:#fff;border-radius:4px;box-shadow:0 5px 14px rgba(20,20,30,.18);animation-name:mgP;overflow:hidden}
@keyframes mgP{0%,15%{transform:rotate(-14deg) skewX(6deg) scale(.92)}45%,85%{transform:none}100%{transform:rotate(-14deg) skewX(6deg) scale(.92)}}
.mg-txt{left:9px;right:12px;top:12px;bottom:10px;background:repeating-linear-gradient(#3A3D46 0 2.5px,transparent 2.5px 7px)}
.mg-dark{inset:0;background:linear-gradient(135deg,rgba(80,70,50,.55),rgba(30,30,30,.25));animation-name:mgD}
@keyframes mgD{0%,25%{opacity:1}50%,85%{opacity:0}100%{opacity:1}}
.mg-sp{color:var(--hue);font-size:16px;line-height:1;animation-name:mgS}
@keyframes mgS{0%,40%{transform:scale(0) rotate(0)}55%{transform:scale(1.3) rotate(90deg)}70%,100%{transform:scale(0) rotate(180deg)}}`,
    },
    confronta: {
      html: `${['l', 'r'].map((s, i) => `<i class="ld-pg np" style="left:${42 + i * 84}px;top:20px;width:58px;height:86px">${[12, 22, 32, 42, 52, 62, 72].map((y, k) => `<i class="md-l" style="left:8px;top:${y}px;width:${[40, 34, 42, 30, 38, 26, 36][k]}px"></i>`).join('')}<i class="cf-h ${s}" style="top:29px"></i><i class="cf-h ${s} d2" style="top:59px"></i></i>`).join('')}<i class="cf-sw" style="left:102px;top:52px">${SWAP}</i>`,
      css: `.md-l{height:3px;border-radius:2px;background:#D7D9DF}
.cf-h{left:5px;right:5px;height:9px;border-radius:3px;background:color-mix(in srgb,var(--hue) 35%,transparent);transform-origin:left;animation-name:cfH}.cf-h.r{background:color-mix(in srgb,#16A34A 35%,transparent)}.cf-h.d2{animation-delay:.6s}
@keyframes cfH{0%,15%{transform:scaleX(0)}35%,85%{transform:scaleX(1)}100%{transform:scaleX(0)}}
.cf-sw{font:800 18px/1 var(--font,system-ui);color:var(--hue);animation-name:cfS}@keyframes cfS{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}`,
    },
    assistente: {
      html: `<i class="as-w" style="left:26px;top:30px">${STAR(34)}</i>${[0, 1, 2].map(i => `<i class="as-r" style="left:78px;top:${24 + i * 28}px;animation-delay:${(.3 + i * .5).toFixed(1)}s"><i class="vf-k">${CHK}</i><i class="vf-b"></i></i>`).join('')}`,
      css: `.as-w{font-size:30px;color:var(--hue);line-height:1;animation-name:asW}@keyframes asW{0%,100%{transform:rotate(-12deg) scale(.9)}50%{transform:rotate(14deg) scale(1.1)}}
.as-r{width:120px;height:18px;background:#fff;border-radius:9px;box-shadow:0 3px 8px rgba(20,20,30,.12);animation-name:asR}
.as-r .vf-k{left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#16A34A;display:grid;place-items:center}.as-r .vf-k svg{position:static;width:9px;height:9px}
.as-r .vf-b{left:24px;top:7px;width:80px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--hue) 40%,#ddd)}
@keyframes asR{0%{opacity:0;transform:translateX(-14px)}12%,85%{opacity:1;transform:none}100%{opacity:0}}`,
    },
    analisi: {
      html: `<i class="xb-ch" style="left:40px;top:18px;width:144px;height:90px">${[30, 44, 38, 58, 70].map((hh, i) => `<i class="xb-b" style="left:${14 + i * 25}px;height:${hh}px;animation-delay:${(i * .15).toFixed(2)}s"></i>`).join('')}<svg class="an-ln" style="left:10px;top:8px" width="124" height="60" viewBox="0 0 124 60" fill="none" stroke="#E5484D" stroke-width="2.4" stroke-linecap="round"><path pathLength="1" d="M4 48 L30 36 L56 40 L82 22 L108 8"/></svg></i>`,
      css: `.xb-ch{background:#fff;border-radius:8px;box-shadow:0 5px 14px rgba(20,20,30,.15)}
.xb-b{bottom:10px;width:14px;border-radius:3px 3px 0 0;background:var(--hue);transform-origin:bottom;animation-name:xbB}
@keyframes xbB{0%,10%{transform:scaleY(0)}35%,88%{transform:scaleY(1)}100%{transform:scaleY(0)}}
.an-ln path{stroke-dasharray:1;stroke-dashoffset:1;animation:anL ${D}s infinite ease-in-out}@keyframes anL{0%,35%{stroke-dashoffset:1}65%,88%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0}}`,
    },
    estrai: {
      html: `${pg('', 'left:24px;top:22px;width:58px;height:80px')}<i class="vf-lens" style="left:34px;top:34px"></i>${['€ 1.220,00', 'IT60 X054…', '12/03/2026'].map((t, i) => `<i class="ld-chip es-c" style="left:108px;top:${26 + i * 28}px;animation-delay:${(.3 + i * .35).toFixed(2)}s">${t}</i>`).join('')}`,
      css: `.vf-lens{width:28px;height:28px;border-radius:50%;border:4px solid var(--hue);background:rgba(255,255,255,.35);animation-name:esL}
.vf-lens::after{content:"";position:absolute;width:4px;height:12px;border-radius:2px;background:var(--hue);left:25px;top:22px;transform:rotate(-45deg)}
@keyframes esL{0%{transform:none}33%{transform:translate(10px,20px)}66%{transform:translate(2px,36px)}100%{transform:none}}
.es-c{animation-name:esC;border-left:3px solid var(--hue)}@keyframes esC{0%{opacity:0;transform:translateX(-40px) scale(.7)}15%,85%{opacity:1;transform:none}100%{opacity:0}}`,
    },
    // pagine e lavori senza uno strumento (ricette, progetti, cloud): un nastro di passaggi
    lavoro: {
      html: `<i class="lv-belt" style="left:20px;top:84px"></i>${[0, 1, 2].map(i => pg('lv-p', `left:-50px;top:30px;width:38px;height:50px;animation-delay:${(i * D / 3).toFixed(2)}s`)).join('')}<i class="lv-st" style="left:98px;top:16px">${STAR(24)}</i>`,
      css: `.lv-belt{width:184px;height:6px;border-radius:3px;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--hue) 60%,#fff) 0 8px,color-mix(in srgb,var(--hue) 30%,#fff) 8px 16px)}
.lv-p{animation-name:lvP;animation-timing-function:linear}
@keyframes lvP{0%{transform:translateX(0)}100%{transform:translateX(320px)}}
.lv-st{font-size:22px;color:var(--hue);line-height:1;animation-name:asW}@keyframes asW{0%,100%{transform:rotate(-12deg) scale(.9)}50%{transform:rotate(14deg) scale(1.1)}}`,
    },
  };
  // strumenti che condividono una scena
  const ALIAS = { pdfaverifica: 'verificapdfa' };
  // regole della scena dentro .ld-<id> e animazioni con nomi propri (due scene possono usare lo stesso nome)
  function scope(css, id) {
    css = css.replace(/@keyframes\s+([\w-]+)/g, (m, n) => `@keyframes ${n}_${id}`).replace(/animation-name:\s*([\w-]+)/g, (m, n) => `animation-name:${n}_${id}`).replace(/animation:\s*([A-Za-z][\w-]*)\s/g, (m, n) => `animation:${n}_${id} `);
    let out = '', i = 0, depth = 0, sel = '';
    while (i < css.length) {
      const c = css[i];
      if (depth === 0 && c === '{') {
        const s2 = sel.trim(); sel = '';
        if (s2.startsWith('@')) { let d = 1, j = i + 1; while (j < css.length && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; } out += s2 + css.slice(i, j) + '\n'; i = j; continue; }
        out += s2.split(',').map(x => `.ld-${id} ${x.trim()}`).join(',') + '{'; depth = 1; i++; continue;
      }
      if (depth > 0) { out += c; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) out += '\n'; } i++; continue; }
      sel += c; i++;
    }
    return out;
  }
  let injected = new Set();
  function inject(id) {
    if (!injected.size) document.head.append(h('style', { id: 'ld-css' }, inLegacy(BASE)));
    if (injected.has(id)) return; injected.add(id);
    // ogni scena con le classi dentro .ld-<id> per non pestarsi i piedi
    document.head.append(h('style', { 'data-ld': id }, inLegacy(scope(S[id].css, id))));
  }
  function el(id) {
    id = ALIAS[id] || id;
    const key = S[id] ? id : 'lavoro';
    inject(key);
    const hue = (TOOLS[id] && TOOLS[id].hue) || (typeof PAGES !== 'undefined' && PAGES[id] && PAGES[id].hue) || 'var(--accent)';
    const box = h('div', { class: `ld ld-${key}`, style: { '--hue': hue }, 'aria-hidden': 'true' });
    box.innerHTML = S[key].html;
    return box;
  }
  return { el, ids: () => Object.keys(S) };
})();

/* =====================================================================
   Flow — il «documento attivo».
   Carichi un file (dalla home o da uno strumento) e resta aperto mentre passi da uno
   strumento all'altro, uno alla volta: modifichi il testo, poi ruoti una pagina, oscuri
   un dato, aggiungi una pagina bianca… Al cambio di strumento le modifiche fatte vengono
   applicate da sole e diventano una nuova versione (con cronologia per tornare indietro).
   ===================================================================== */
const Flow = (() => {
  // strumenti che lavorano sul documento PDF attivo (nell'ordine della barra e della home)
  const BAR = [
    ['Modifica', ['modifica', 'moduli', 'oscura', 'numeri']],
    ['Pagine', ['ordina', 'ruota', 'unisci', 'dividi']],
    ['Converti', ['word', 'excel', 'ocr', 'pdfa', 'comprimi']],
  ];
  const DOC_TOOLS = new Set(BAR.flatMap(g => g[1]).concat(['firme']));
  // strumenti il cui PDF prodotto è il documento stesso, modificato (diventa una nuova versione)
  const EDITS = new Set(['modifica', 'moduli', 'oscura', 'numeri', 'ordina', 'ruota', 'unisci', 'ocr', 'pdfa', 'comprimi', 'immagini', 'impagina', 'migliora']);
  // strumenti di ritocco: dopo l'applicazione basta un avviso (niente finestra che blocca)
  const QUICK = new Set(['modifica', 'moduli', 'oscura', 'numeri', 'ordina', 'ruota']);
  const VLABEL = { modifica: 'Testo modificato', moduli: 'Modulo compilabile', oscura: 'Dati oscurati', numeri: 'Numerazione aggiunta', ordina: 'Pagine organizzate', ruota: 'Pagine ruotate', unisci: 'PDF uniti', ocr: 'Testo riconosciuto (OCR)', pdfa: 'Convertito in PDF/A', comprimi: 'Compresso', immagini: 'Creato da immagini', impagina: 'Impaginato', migliora: 'Pagine migliorate' };
  const MAX_VERSIONS = 30;
  let S = null;          // { versions: [{ bytes, name, label, tool, at, pages }], cur }
  let WB = [];           // file caricati in home e non ancora aperti (più file, o file non PDF)
  let track = null;      // { sig, base } dello strumento aperto
  let capture = null;    // applicazione automatica in corso: { resolve }
  let openGen = 0, fromSession = false, applying = null, going = false;
  let wantPage = null;   // pagina da mostrare alla riapertura (dopo un'azione rapida)
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch { } });

  const kindOf = f => {
    if (f._kind) return f._kind;
    const n = (f.name || '').toLowerCase();
    if (/^[a-z]{2}[a-z0-9]{8,28}_[a-z0-9]{1,5}\.xml(\.p7m)?$/.test(n) && !/_(mt|rc|ns|mc|ne|dt|at|ec|se)_\d+\.xml$/.test(n)) return 'fattura';
    if (/\.(xbrl|xml)(\.p7m)?$/.test(n)) return 'xbrl';
    if (/\.(rcc|rel)(\.p7m)?$/.test(n) || /\.(p12|pfx|ks)$/.test(n)) return 'rcc';
    if (/\.pdf$/.test(n) || f.type === 'application/pdf') return 'pdf';
    if (/\.(p7m|tsd|m7m)$/.test(n)) return 'p7m';
    if (isImage(f)) return 'img';
    if (/\.zip$/.test(n)) return 'zip';
    if (/\.(docx|xlsx|xlsm|pptx|md|markdown|csv|html?|txt)$/.test(n)) return 'office';
    return 'other';
  };
  /* fatture elettroniche: si riconoscono dal contenuto (XML, P7M, ZIP del cassetto fiscale) */
  async function sniff(f) {
    const n = (f.name || '').toLowerCase();
    try {
      if (/\.(xml|p7m)$/.test(n) && f.size < 60e6) {
        const head = new TextDecoder('latin1').decode(new Uint8Array(await f.slice(0, 1 << 20).arrayBuffer()));
        if (/FatturaElettronica(Semplificata)?[\s>]/.test(head)) f._kind = 'fattura';
        else if (/xbrl/i.test(head)) f._kind = 'xbrl';
      } else if (/\.zip$/.test(n) && f.size < 2e9) {
        // basta l'indice in fondo all'archivio (anche per ZIP di centinaia di MB); se non si legge, si apre tutto
        let names = typeof zipNames === 'function' ? await zipNames(f).catch(() => null) : null;
        if (!names && f.size < 300e6 && typeof JSZip !== 'undefined') names = Object.keys((await JSZip.loadAsync(await f.arrayBuffer())).files);
        names ||= [];
        if (names.some(x => /(^|\/)[A-Za-z]{2}[A-Za-z0-9]{8,28}_[A-Za-z0-9]{1,5}\.xml(\.p7m)?$/i.test(x))) f._kind = 'fattura';
      }
    } catch (e) { /* si resta al nome */ }
  }
  const KIND_LABEL = { fattura: 'Fattura elettronica', pdf: 'PDF', img: 'Immagine', xbrl: 'Bilancio XBRL', rcc: 'Ricevuta Entratel', p7m: 'File firmato', zip: 'Archivio ZIP', other: 'File' };
  const KIND_COLOR = { fattura: '#0B7285', pdf: '#E0453A', img: '#DB2777', xbrl: '#4F46E5', rcc: '#B45309', p7m: '#0F766E', zip: '#475467', other: '#6F727C' };
  const takesPdf = id => TOOLS[id] && TOOLS[id].pdfIn !== false && !['xbrl', 'ricevute', 'fatture'].includes(id);

  /* —— documento attivo e versioni —— */
  const cur = () => S ? S.versions[S.cur] : null;
  const fileOf = () => { const v = cur(); if (!v) return null; return new File([v.bytes], v.name, { type: 'application/pdf' }); };
  const sessionFiles = () => { const arr = [fileOf()]; arr._fromSession = true; return arr; };
  async function countPages(bytes) { try { const d = await pdfDocument({ data: bytes.slice() }).promise; const n = d.numPages; d.destroy(); return n; } catch { return null; } }
  async function start(file, label = 'Originale') {
    const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
    const v = { bytes, name: file.name || 'documento.pdf', label, tool: null, at: new Date(), pages: null };
    S = { versions: [v], cur: 0 };
    // se non si riesce nemmeno a contarne le pagine non è un PDF leggibile: non resta come documento aperto
    countPages(bytes).then(n => { v.pages = n; if (n == null && S && S.versions.length === 1 && S.versions[0] === v) { end(); return; } changed(); });
    changed();
  }
  function push(bytes, name, tool, label) {
    if (!S) { start(Object.assign(bytes, { name }), label || VLABEL[tool] || 'Documento'); return; }
    const v = { bytes, name: S.versions[0]?.name || name, label: label || VLABEL[tool] || TOOLS[tool]?.short || 'Modifica', tool, at: new Date(), pages: null };
    S.versions.push(v);
    // cronologia limitata: si tengono l'originale e le ultime versioni
    while (S.versions.length > MAX_VERSIONS) S.versions.splice(1, 1);
    S.cur = S.versions.length - 1;
    countPages(bytes).then(n => { v.pages = n; changed(); });
    changed();
  }
  function end() { S = null; track = null; changed(); }
  const many = () => S && S.versions.length > 1;

  /* —— stato dello strumento aperto: cosa è cambiato rispetto all'ultima versione —— */
  function onOpen(id) { track = null; openGen = GEN; fromSession = false; }
  // ogni strumento che modifica il documento registra una «firma» del suo stato
  // opts.save/opts.restore: lo stato dello strumento si salva da solo e, alla ripresa, si rimette com'era
  let pendingDraft = null;
  function trackTool(sig, opts = {}) {
    if (GEN !== openGen) return;
    try {
      const save = opts.save || (opts.restore ? sig : null);
      track = { sig, base: sig(), gen: GEN, save, restore: opts.restore || null, saveBase: save ? save() : null };
    } catch { track = null; }
    // lavoro ripreso dopo una chiusura: lo strumento torna com'era
    if (track?.restore && pendingDraft && pendingDraft.tool === CURRENT_TOOL) {
      const d = pendingDraft; pendingDraft = null;
      setTimeout(() => { try { track.restore(d.state); toast('Ripreso il lavoro che non avevi ancora applicato'); } catch (e) { console.warn('ripresa', e); } }, 0);
    }
  }
  const dirty = () => { if (!track || track.gen !== GEN) return false; try { return track.sig() !== track.base; } catch { return false; } };
  const markClean = () => { if (track) try { track.base = track.sig(); if (track.save) track.saveBase = track.save(); } catch { } };
  // il lavoro in corso nello strumento (senza effetti collaterali), se diverso da com'era all'apertura
  function draft() {
    if (!track || track.gen !== GEN || !track.save || !CURRENT_TOOL) return null;
    try { const st = track.save(); return st === track.saveBase ? null : { tool: CURRENT_TOOL, state: st }; } catch { return null; }
  }
  // il documento attivo, per salvarlo e riprenderlo dopo una chiusura
  const exportSession = () => S ? { versions: S.versions.map(v => ({ bytes: v.bytes, name: v.name, label: v.label, tool: v.tool, at: +v.at })), cur: S.cur } : null;
  function importSession(o, draftIn) {
    S = { versions: o.versions.map(v => ({ ...v, at: new Date(v.at), pages: null })), cur: Math.min(o.cur, o.versions.length - 1) };
    S.versions.forEach(v => countPages(v.bytes).then(n => { v.pages = n; changed(); }));
    pendingDraft = draftIn || null;
    changed();
  }
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* applica le modifiche dello strumento aperto (come premere il suo pulsante), senza finestre */
  function applyPending(next) {
    if (applying) return applying;
    applying = doApply(next).finally(() => { applying = null; });
    return applying;
  }
  async function doApply(next) {
    if (!dirty()) return true;
    const btn = document.querySelector('.stage .btn-run');
    if (!btn || btn.disabled) return true;
    const tool = CURRENT_TOOL, n0 = S ? S.versions.length : 0;
    const got = new Promise(res => { capture = { resolve: res }; });
    btn.click();
    // aspetta il risultato; se lo strumento chiede qualcosa (una finestra) si aspetta la risposta dell'utente
    const outcome = await Promise.race([got, (async () => {
      let idle = 0;
      for (let t = 0; t < 6000; t++) {
        await new Promise(r => setTimeout(r, 100));
        if (!capture) return 'done';
        if (Busy.el || OPEN_MODALS.size || Jobs.activeFor(GEN)) { idle = 0; continue; }
        if (++idle > 25) return 'none';
      }
      return 'none';
    })()]);
    capture = null;
    if (outcome !== 'none') { const nv = S ? S.versions.length : 0; if (nv > n0) toast(`v${nv} · ${VLABEL[tool] || TOOLS[tool].short}`); return true; }
    return await new Promise(res => {
      let done = false; const fin = v => { if (done) return; done = true; res(v); };
      const m = modal([h('h3', {}, 'Modifiche non applicate'),
        h('p', {}, `Le modifiche fatte in «${TOOLS[tool].title}» non sono state applicate: controlla il messaggio dello strumento.`),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'wrap' } },
          h('button', { class: 'btn', onclick: () => { fin(false); m.close(); } }, 'Resta qui'),
          h('button', { class: 'btn primary', onclick: () => { fin(true); m.close(); } }, next && TOOLS[next] ? `Vai a ${TOOLS[next].short} senza applicarle` : 'Continua senza applicarle'))], { width: 460, onClose: () => fin(false) });
    });
  }
  /* chiamata da showResult */
  function onResult(outputs, opts) {
    // risultato arrivato dopo aver cambiato strumento: si ignora
    if (Busy.gen != null && Busy.gen !== GEN) { if (capture) { const c = capture; capture = null; c.resolve(outputs); } return { captured: true, stale: true }; }
    const pdfs = outputs.filter(o => /\.pdf$/i.test(o.name) && (!o.type || /pdf/.test(o.type)));
    const main = opts.primary != null ? outputs[opts.primary] : outputs.length === 1 ? outputs[0] : null;
    const one = main && /\.pdf$/i.test(main.name) ? main : pdfs.length === 1 && outputs.length === 1 ? pdfs[0] : null;
    let pushed = false;
    const same = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false; return true; };
    if (one && EDITS.has(CURRENT_TOOL) && S && fromSession && same(one.bytes, cur()?.bytes)) { markClean(); if (capture) { const c = capture; capture = null; c.resolve(outputs); return { captured: true }; } return { captured: false, pushed: false, unchanged: true }; }
    if (one && EDITS.has(CURRENT_TOOL)) {
      if (S && fromSession) push(one.bytes, one.name, CURRENT_TOOL);
      else { start(Object.assign(new Uint8Array(one.bytes), { name: one.name }), VLABEL[CURRENT_TOOL] || 'Documento'); fromSession = true; }
      markClean(); pushed = true;
    }
    if (capture) { const c = capture; capture = null; c.resolve(outputs); return { captured: true }; }
    return { captured: false, pushed, quick: pushed && QUICK.has(CURRENT_TOOL) && !window.__resultModal };
  }
  /* passa a un altro strumento con il documento attivo */
  async function go(id) {
    if (!TOOLS[id]) { nav(''); return; }
    if (id === CURRENT_TOOL || going) return;
    going = true;
    try {
      if (CURRENT_TOOL) { const ok = await applyPending(id); if (!ok) return; }
      if (S && takesPdf(id)) handoff(id, sessionFiles());
      else { skipGuard = true; nav(id); }
    } finally { going = false; }
  }
  // prima di cambiare pagina (indietro del browser, Home, logo…): le modifiche in sospeso si applicano
  let skipGuard = false;
  async function beforeRoute() {
    if (skipGuard || pendingHandoff) { skipGuard = false; return true; }
    if (!CURRENT_TOOL || !dirty()) return true;
    return applyPending(null);
  }
  // quando uno strumento si apre senza file e c'è un documento attivo, lo usa
  function preloadFor(id) { if (!S || !takesPdf(id)) return null; return sessionFiles(); }
  // file caricati in uno strumento: un solo PDF diventa il documento attivo
  function loaded(id, files) {
    if (files._fromSession) { fromSession = true; return; }
    if (files.length === 1 && kindOf(files[0]) === 'pdf' && takesPdf(id)) { fromSession = true; return start(files[0]); }
    fromSession = false;
    // più file (o file non PDF) in uno strumento: entrano nel progetto
    if (typeof Projects !== 'undefined' && files.length && !files._fromProject) Projects.addFiles(files);
  }
  // nuovo file al posto del documento aperto: conferma se ci sono versioni
  function confirmReplace() {
    if (!many() && !dirty()) return Promise.resolve(true);
    return new Promise(res => {
      let done = false; const fin = v => { if (done) return; done = true; res(v); };
      const m = modal([h('h3', {}, 'Chiudere il documento aperto?'),
        h('p', {}, `«${cur().name}» ha ${plural(S.versions.length, 'versione', 'versioni')}. Se ti serve, scarica prima la versione attuale.`),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'wrap' } },
          h('button', { class: 'btn', onclick: () => { fin(false); m.close(); } }, 'Annulla'),
          h('button', { class: 'btn', onclick: async () => { await downloadCurrent(); fin(true); m.close(); } }, ic('download', 15), 'Scarica e chiudi'),
          h('button', { class: 'btn primary', onclick: () => { fin(true); m.close(); } }, 'Chiudi documento'))], { width: 480, onClose: () => fin(false) });
    });
  }
  async function closeDoc() { if (!(await confirmReplace())) return false; end(); return true; }

  /* —— download —— */
  async function downloadCurrent() {
    if (CURRENT_TOOL && dirty()) { const ok = await applyPending(null); if (!ok) return; }
    const v = cur(); if (!v) return;
    download(v.bytes, versionName(v), 'application/pdf');
  }
  const versionName = v => S.versions[0] === v ? v.name : `${stripExt(v.name)}-v${S.versions.indexOf(v) + 1}.pdf`;

  /* —— azioni rapide sulla pagina, da qualunque strumento —— */
  const curPage = () => { const V = typeof Viewer !== 'undefined' ? Viewer.current : null; return V && V.el?.isConnected ? V.page : 1; };
  async function pageAction(kind, n) {
    if (!S) return;
    if (CURRENT_TOOL) { const ok = await applyPending(null); if (!ok) return; }
    const res = await withBusy('Aggiornamento del documento…', async () => {
      const src = await loadLib(cur().bytes);
      const N = src.getPageCount(); const i = clamp(n, 1, N) - 1;
      let label, show = i + 1;
      if (kind === 'rotr' || kind === 'rotl') { const p = src.getPage(i); p.setRotation(degrees((((p.getRotation().angle + (kind === 'rotr' ? 90 : -90)) % 360) + 360) % 360)); label = `Pagina ${i + 1} ruotata`; }
      else if (kind === 'blank') { const p = src.getPage(i); const { width, height } = p.getSize(); const r = p.getRotation().angle % 180 ? [height, width] : [width, height]; src.insertPage(i + 1, r); label = `Pagina bianca dopo la ${i + 1}`; show = i + 2; }
      else if (kind === 'dup') { const [cp] = await src.copyPages(src, [i]); src.insertPage(i + 1, cp); label = `Pagina ${i + 1} duplicata`; show = i + 2; }
      else if (kind === 'del') { if (N <= 1) throw new Error('Il documento non può restare senza pagine'); src.removePage(i); label = `Pagina ${i + 1} eliminata`; show = Math.min(i + 1, N - 1); }
      return { bytes: await saveDoc(src), label, show };
    });
    if (!res) return;
    push(res.bytes, cur().name, 'ordina', res.label);
    toast(`v${S.versions.length} · ${res.label}`);
    wantPage = res.show; wantGen = GEN + 1;
    if (CURRENT_TOOL && takesPdf(CURRENT_TOOL)) handoff(CURRENT_TOOL, sessionFiles());
  }
  function moreMenu() {
    const v = cur(); let m;
    const item = (icn, t, fn, cls = '') => h('button', { class: 'pm-a ' + cls, onclick: () => { m.close(); fn(); } }, ic(icn, 17), t);
    m = modal([h('h3', { class: 'db-m-name' }, v.name),
      h('p', { class: 'muted small', style: { margin: '2px 0 12px' } }, `${many() ? `Versione ${S.cur + 1} di ${S.versions.length} · ${v.label}` : 'Originale'}${v.pages ? ' · ' + plural(v.pages, 'pagina', 'pagine') : ''} · ${fmtSize(v.bytes.length)}`),
      h('div', { class: 'pm-list' },
        item('blank', 'Azioni sulla pagina (ruota, aggiungi, duplica, elimina)', () => pageMenu()),
        many() ? item('clock', 'Versioni del documento', () => showHistory()) : null,
        item('count', 'Conta parole e caratteri', () => { Later.all(); quickCount(cur().bytes, cur().name); }),
        item('download', 'Scarica la versione attuale', downloadCurrent),
        item('x', 'Chiudi il documento', async () => { if (await closeDoc()) { skipGuard = true; nav(''); } }, 'danger'))], { width: 440 });
  }
  function pageMenu(anchor) {
    const N = cur().pages || 1;
    const inp = h('input', { class: 'input', type: 'number', min: 1, max: N, value: Math.min(curPage(), N), style: { width: '76px' } });
    const go2 = k => { const n = parseInt(inp.value) || 1; m.close(); pageAction(k, n); };
    const act = (k, icn, t, cls = '') => h('button', { class: 'pm-a ' + cls, onclick: () => go2(k) }, ic(icn, 17), t);
    const m = modal([h('h3', {}, 'Azioni sulla pagina'),
      h('div', { class: 'row', style: { margin: '12px 0 14px' } }, h('span', { class: 'small', style: { fontWeight: 650 } }, 'Pagina'), inp, h('span', { class: 'muted small' }, `di ${N}`)),
      h('div', { class: 'pm-grid' },
        act('rotr', 'rotate', 'Ruota a destra'), act('rotl', 'rotl', 'Ruota a sinistra'),
        act('blank', 'blank', 'Pagina bianca dopo'), act('dup', 'copy', 'Duplica'),
        act('del', 'trash', 'Elimina pagina', 'danger')),
      h('p', { class: 'muted small', style: { margin: '12px 0 0' } }, 'Le modifiche in corso vengono applicate prima; ogni azione crea una versione che puoi annullare.')], { width: 440 });
    setTimeout(() => inp.select(), 50);
  }
  let wantGen = -1;
  const takeWantPage = () => { if (GEN !== wantGen) return null; const p = wantPage; wantPage = null; return p; };

  /* —— barra del documento (in ogni strumento PDF) —— */
  function bar(id) {
    if (!S || !takesPdf(id)) return null;
    const el = h('div', { class: 'docbar' });
    const draw = () => {
      if (!S) { el.remove(); return; }
      const v = cur();
      const tools = h('div', { class: 'db-tools', role: 'toolbar', 'aria-label': 'Passa a un altro strumento' }, BAR.flatMap(([g, ids], gi) => [gi ? h('span', { class: 'db-sep' }) : null, ...ids.map(t => h('button', { class: 'db-t' + (t === id ? ' on' : ''), style: { '--hue': TOOLS[t].hue }, 'data-tip': TOOLS[t].title, 'aria-label': TOOLS[t].title, 'aria-current': t === id ? 'page' : null, onclick: () => go(t) }, ic(TOOLS[t].icon, 15), h('span', { class: 'db-tl' }, TOOLS[t].short)))]).filter(Boolean));
      el.replaceChildren(
        h('div', { class: 'db-doc' },
          h('span', { class: 'db-ic' }, ic('file', 16)),
          h('div', { class: 'db-name' }, h('b', { title: v.name }, v.name), h('span', {}, `${many() ? `v${S.cur + 1} · ${v.label}` : 'Originale'}${v.pages ? ' · ' + plural(v.pages, 'pagina', 'pagine') : ''}`))),
        tools,
        h('div', { class: 'db-acts' },
          h('button', { class: 'btn sm ghost', title: 'Azioni sulla pagina: ruota, pagina bianca, duplica, elimina', 'aria-label': 'Azioni sulla pagina', onclick: e => pageMenu(e.currentTarget) }, ic('blank', 15), h('span', { class: 'db-l' }, 'Pagina')),
          many() ? h('button', { class: 'btn sm ghost', title: 'Cronologia delle versioni', 'aria-label': 'Versioni', onclick: () => showHistory() }, ic('clock', 15), h('span', { class: 'db-l' }, 'Versioni')) : null,
          h('button', { class: 'btn sm ghost', title: 'Parole e caratteri del documento', 'aria-label': 'Conta parole e caratteri', onclick: () => { Later.all(); quickCount(cur().bytes, cur().name); } }, ic('count', 15), h('span', { class: 'db-l' }, 'Parole')),
          h('button', { class: 'btn sm db-dl', title: 'Scarica la versione attuale', 'aria-label': 'Scarica', onclick: downloadCurrent }, ic('download', 15), h('span', { class: 'db-l' }, 'Scarica')),
          h('button', { class: 'icon-btn db-x', title: 'Chiudi il documento', 'aria-label': 'Chiudi il documento', onclick: async () => { if (await closeDoc()) { skipGuard = true; nav(''); } } }, ic('x', 16)),
          // telefono: nome del file e azioni meno frequenti in un menu, così la barra sta su una riga e il documento ha più spazio
          h('button', { class: 'icon-btn db-more', title: 'Documento: nome, pagine, versioni, chiudi', 'aria-label': 'Altre azioni sul documento', 'aria-haspopup': 'dialog', onclick: () => moreMenu() }, ic('more', 18))));
      requestAnimationFrame(() => { const on = tools.querySelector('.db-t.on'); if (on && tools.scrollWidth > tools.clientWidth) tools.scrollLeft = on.offsetLeft - tools.clientWidth / 2 + on.offsetWidth / 2; });
    };
    draw();
    listeners.add(draw); onLeave(() => listeners.delete(draw));
    return el;
  }
  async function resume(i) {
    if (CURRENT_TOOL && dirty()) { const ok = await applyPending(null); if (!ok) return; }
    S.cur = i; markClean(); changed();
    if (CURRENT_TOOL && takesPdf(CURRENT_TOOL)) handoff(CURRENT_TOOL, sessionFiles());
  }
  // i passaggi fatti sul documento che una ricetta sa ripetere
  const RECIPE_OF = { comprimi: ['compress', { mode: 'media' }], ocr: ['ocr', {}], pdfa: ['pdfa', { part: 1 }], numeri: ['numbers', {}], impagina: ['a4', {}], migliora: null };
  function showHistory() {
    const rows = S.versions.map((v, i) => ({ v, i })).reverse();
    const rsteps = S.versions.map(v => RECIPE_OF[v.tool]).filter(Boolean).map(([id, p]) => ({ id, p: { ...(typeof Ricette !== 'undefined' ? Ricette.STEPS[id]?.def : {}), ...p } }));
    const m = modal([h('h3', {}, 'Versioni del documento'),
      h('p', { class: 'muted small', style: { marginTop: '4px' } }, 'Ogni modifica applicata crea una versione. Puoi riprenderne una precedente o scaricarla.'),
      h('div', { class: 'ver-list' }, rows.map(({ v, i }) => h('div', { class: 'ver' + (i === S.cur ? ' on' : '') },
        h('span', { class: 'ver-n' }, String(i + 1)),
        h('div', { class: 'ver-t' }, h('b', {}, v.label), h('span', { class: 'small muted' }, `${v.at.toLocaleTimeString('it-IT')}${v.pages ? ' · ' + plural(v.pages, 'pagina', 'pagine') : ''} · ${fmtSize(v.bytes.length)}`)),
        i === S.cur ? h('span', { class: 'ver-cur' }, 'In uso') : h('button', { class: 'btn sm', onclick: () => { m.close(); resume(i); } }, 'Riprendi'),
        h('button', { class: 'icon-btn', title: 'Anteprima di questa versione', 'aria-label': 'Anteprima di questa versione', onclick: () => Preview.open({ bytes: v.bytes, name: versionName(v) }) }, ic('eye', 16)),
        h('button', { class: 'icon-btn', title: 'Scarica questa versione', 'aria-label': 'Scarica questa versione', onclick: () => download(v.bytes, versionName(v), 'application/pdf') }, ic('download', 16))))),
      rsteps.length && typeof Ricette !== 'undefined' ? h('div', { class: 'ver-rec' }, h('span', { class: 'muted small' }, `Rifai spesso questi passaggi (${rsteps.map(x => Ricette.STEPS[x.id].label.toLowerCase()).join(', ')})?`),
        h('button', { class: 'btn sm', onclick: () => { m.close(); Ricette.editor({ name: '', steps: rsteps }, () => toast('La trovi in «Ricette»')); } }, ic('recipe', 15), 'Salvali come ricetta')) : null], { width: 560 });
  }
  /* avviso dopo un ritocco (al posto della finestra): scarica o annulla */
  // strumenti che ripartono dalla nuova versione dopo l'applicazione (così non restano modifiche «in sospeso»)
  const RELOAD = new Set(['ruota', 'ordina', 'numeri', 'oscura']);
  /* dopo un ritocco che ha creato una nuova versione: alla chiusura della finestra lo strumento riparte da quella versione */
  function reloader(force = false) {
    if (!force && !RELOAD.has(CURRENT_TOOL)) return null;
    const tool = CURRENT_TOOL, gen = GEN, V = typeof Viewer !== 'undefined' ? Viewer.current : null, page = V && V.el?.isConnected ? V.page : null;
    return () => setTimeout(() => { if (CURRENT_TOOL !== tool || GEN !== gen || !S) return; if (page) { wantPage = page; wantGen = GEN + 1; } handoff(tool, sessionFiles()); }, 0);
  }
  function quickToast() {
    const v = cur(), n = S.versions.length;
    if (RELOAD.has(CURRENT_TOOL)) { const V = typeof Viewer !== 'undefined' ? Viewer.current : null; if (V && V.el?.isConnected) { wantPage = V.page; wantGen = GEN + 1; } setTimeout(() => handoff(CURRENT_TOOL, sessionFiles()), 0); }
    setTimeout(() => toastActions(`v${n} · ${v.label}`, [
      ['Anteprima', () => Preview.open({ bytes: v.bytes, name: versionName(v) })],
      ['Scarica', () => download(v.bytes, versionName(v), 'application/pdf')],
      n > 1 ? ['Annulla', () => resume(n - 2)] : null,
    ].filter(Boolean)), 30);
  }

  /* —— risultato: cosa dice la finestra —— */
  function resultNote(pushed) {
    if (!pushed || !S) return null;
    const n = S.versions.length;
    return h('div', { class: 'flow-res' }, ic('layers', 17),
      h('div', { class: 'flow-res-t' }, h('b', {}, `Documento aggiornato · versione ${n}`), h('div', { class: 'small muted' }, 'Puoi continuare con un altro strumento: lavora su questa versione. Tutte le versioni restano nel progetto.')),
      n > 1 ? h('div', { class: 'flow-res-a' },
        h('button', { class: 'btn sm flow-undo', title: `Non ti piace? Torna a «${S.versions[n - 2].label}»`, onclick: () => { closeAllModals(); resume(n - 2); toast(`Tornato alla versione ${n - 1} · ${S.versions[n - 2].label}`); } }, ic('undo', 15), `Torna alla v${n - 1}`),
        n > 2 ? h('button', { class: 'linkish small', onclick: () => { closeAllModals(); showHistory(); } }, 'Tutte le versioni') : null) : null);
  }
  function nextChips(closeModal) {
    if (!S) return null;
    return h('div', { class: 'res-next' },
      h('div', { class: 'sec-t' }, 'Cosa fare dopo'),
      (() => {
        // prima i passi successivi più utili per questo strumento, poi gli altri a richiesta
        const all = BAR.flatMap(g => g[1]).filter(t => t !== CURRENT_TOOL);
        const rel = ((typeof SEO !== 'undefined' && SEO.P[CURRENT_TOOL]?.rel) || []).filter(t => all.includes(t));
        const first = [...new Set([...rel, ...['comprimi', 'modifica', 'pdfa', 'unisci', 'word', 'oscura'].filter(t => all.includes(t))])].slice(0, 6);
        const chip = t => h('button', { class: 'chip', style: { '--hue': TOOLS[t].hue }, onclick: () => { closeModal(); go(t); } }, ic(TOOLS[t].icon, 14), TOOLS[t].short);
        const rest = all.filter(t => !first.includes(t));
        const box = h('div', { class: 'chips' }, first.map(chip));
        if (rest.length) box.append(h('button', { class: 'chip more', onclick: e => { e.currentTarget.replaceWith(...rest.map(chip)); } }, `Altri ${rest.length}…`));
        return box;
      })());
  }

  /* —— home: carica e scegli —— */
  function suggest(files) {
    const ks = files.map(kindOf), has = k => ks.includes(k);
    const pdfs = ks.filter(k => k === 'pdf' || k === 'p7m').length, imgs = ks.filter(k => k === 'img').length;
    const out = [];
    const add = (...ids) => ids.forEach(id => { if (TOOLS[id] && !out.includes(id)) out.push(id); });
    if (has('fattura')) add('fatture');
    if (has('xbrl') || files.some(f => /\.xbrl\.p7m$/i.test(f.name))) add('analisi', 'xbrl');
    if (has('zip')) add('xbrl');
    if (has('p7m')) add('firme');
    if (pdfs + imgs > 1) add('unisci');
    if (imgs && !pdfs) add('immagini', 'ocr', 'excel', 'word');
    if (pdfs) add('comprimi', 'pdfa', 'modifica', 'excel', 'word', 'ocr', 'ordina');
    if (imgs && pdfs) add('immagini');
    return out;
  }
  function toolCard(id, onClick) {
    const t = TOOLS[id];
    const b = h('button', { class: 'wb-tool', style: { '--hue': t.hue }, onclick: onClick },
      h('span', { class: 'led', 'aria-hidden': 'true' }),
      h('span', { class: 't-ic' }, ic(t.icon, 20)), h('span', { class: 'wb-tt' }, h('b', {}, t.title), h('span', { class: 'small muted' }, SHORT_DESC[id] || t.desc)), h('span', { class: 'wb-go' }, ic('arrow', 16)));
    return typeof starWrap === 'function' && typeof Favs !== 'undefined' ? starWrap(b, id) : b;
  }
  function homePanel() {
    const box = h('section', { class: 'wb', 'aria-label': 'Carica un file' });
    const input = h('input', { type: 'file', multiple: true, hidden: true, class: 'wb-input', onchange: () => { addFiles([...input.files]); input.value = ''; } });
    async function addFiles(list) {
      if (!list.length) return;
      // un solo PDF: diventa il documento attivo; altrimenti restano sul banco finché non scegli lo strumento
      if (S && !(await confirmReplace())) return;
      if (typeof Counter !== 'undefined') Counter.files(list);
      await Promise.all(list.map(sniff));
      if (list.length === 1 && kindOf(list[0]) === 'pdf') { WB = []; await start(list[0]); }
      else { end(); if (typeof Projects !== 'undefined') { if (!WB.length) await Projects.close(); Projects.addFiles(list); } WB = [...WB, ...list]; }
      draw(); box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.classList.remove('over'); });
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
    const thumb = async (cv, bytes) => {
      try { const d = await pdfDocument({ data: bytes.slice() }).promise; const p = await d.getPage(1); const v0 = p.getViewport({ scale: 1 }); const v = p.getViewport({ scale: 132 / v0.width * (window.devicePixelRatio || 1) }); cv.width = v.width; cv.height = v.height; await p.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise; d.destroy(); } catch (e) { console.warn(e); }
    };
    function grouped(onPick, only = null) {
      const favs = typeof Favs !== 'undefined' ? Favs.list().filter(id => !only || only.includes(id)) : [];
      const fav = favs.length ? h('div', { class: 'wb-group favs', style: { '--cat': '#D98A00' } }, h('div', { class: 'wb-gt' }, ic('star', 13), 'Preferiti'), h('div', { class: 'wb-tools' }, favs.map(id => toolCard(id, () => onPick(id))))) : null;
      return [fav, ...GROUPS.map(([label, ids, sub]) => {
        const list = ids.filter(id => (!only || only.includes(id)) && !favs.includes(id));
        if (!list.length) return null;
        const cs = typeof CAT_STYLE !== 'undefined' ? CAT_STYLE[label] : null;
        return h('div', { class: 'wb-group' + (label === FISCAL_GROUP ? ' fiscal' : '') + (cs ? '' : ' plain'), style: cs ? { '--cat': cs[0] } : null }, h('div', { class: 'wb-gt' }, cs ? h('i', { class: 'tcat-dot', 'aria-hidden': 'true' }) : null, cs ? cs[1] : label, sub && !cs ? h('span', {}, sub) : null), h('div', { class: 'wb-tools' }, list.map(id => toolCard(id, () => onPick(id)))));
      })].filter(Boolean);
    }
    function draw() {
      if (S) {
        const v = cur();
        const cv = h('canvas', { class: 'wb-thumb' });
        thumb(cv, v.bytes);
        box.replaceChildren(
          h('div', { class: 'wb-doc' },
            h('div', { class: 'wb-thumbw' }, cv),
            h('div', { class: 'wb-docinfo' },
              h('span', { class: 'wb-k' }, 'Documento aperto'),
              h('h2', { title: v.name }, v.name),
              h('p', { class: 'muted small' }, [v.pages ? plural(v.pages, 'pagina', 'pagine') : null, fmtSize(v.bytes.length), S.versions.length > 1 ? `versione ${S.cur + 1} (${v.label})` : null].filter(Boolean).join(' · ')),
              h('p', { class: 'wb-hint' }, 'Scegli cosa fare. Puoi passare da uno strumento all’altro quando vuoi: il documento resta aperto e le modifiche si sommano.'),
              h('div', { class: 'row wb-docacts' },
                h('button', { class: 'btn sm', onclick: downloadCurrent }, ic('download', 15), 'Scarica'),
                h('button', { class: 'btn sm ghost', onclick: () => input.click() }, ic('upload', 15), 'Apri un altro file'),
                h('button', { class: 'btn sm ghost', onclick: async () => { if (await closeDoc()) { WB = []; draw(); } } }, ic('x', 15), 'Chiudi'), input))),
          insightBox(v),
          h('div', { class: 'wb-q' }, 'Cosa vuoi fare?'),
          ...(() => {
            const allowed = new Set([...DOC_TOOLS, ...['assistente', 'analisi', 'proteggi', 'impagina', 'immaginipdf', 'estrai', 'confronta', 'migliora'].filter(t => TOOLS[t])]);
            const quick = [], favs = typeof Favs !== 'undefined' ? Favs.list() : [];
            if (typeof Recents !== 'undefined') Recents.get().forEach(id => { if (allowed.has(id) && !favs.includes(id) && !quick.includes(id)) quick.push(id); });
            const nodes = [];
            if (quick.length) {
              nodes.push(h('div', { class: 'home-quick' },
                h('div', { class: 'hq-label' }, 'Usati di recente'),
                ...quick.slice(0, 8).map(id => h('button', { class: 'chip', style: { '--hue': TOOLS[id].hue }, onclick: () => go(id) }, ic(TOOLS[id].icon, 14), TOOLS[id].short)),
                h('button', { class: 'chip more', onclick: () => Cmd.show() }, ic('search', 13), 'Cerca…')));
            }
            nodes.push(...grouped(id => go(id), [...allowed]));
            return nodes;
          })());
        return;
      }
      if (WB.length) {
        const kinds = WB.map(kindOf);
        const sug = suggest(WB);
        box.replaceChildren(
          h('div', { class: 'wb-head' }, h('div', {}, h('span', { class: 'wb-k' }, 'File caricati'), h('h2', {}, `Cosa vuoi fare con ${WB.length === 1 ? 'questo file' : `questi ${WB.length} file`}?`)),
            h('button', { class: 'btn ghost sm', onclick: () => { WB = []; if (typeof Projects !== 'undefined') Projects.close(); draw(); } }, ic('x', 15), 'Ricomincia')),
          h('div', { class: 'wb-files' }, WB.map((f, i) => h('div', { class: 'wb-file' },
            h('i', { class: 'wb-ext', style: { background: KIND_COLOR[kinds[i]] } }, (f.name.match(/\.([a-z0-9]{2,4})$/i)?.[1] || '?').toUpperCase()),
            h('div', { class: 'wb-fn' }, h('b', { title: f.name }, f.name), h('span', { class: 'small muted' }, `${KIND_LABEL[kinds[i]]} · ${fmtSize(f.size)}`)),
            iconBtn('x', 'Togli', () => { WB.splice(i, 1); draw(); }))),
            h('button', { class: 'wb-add', onclick: () => input.click() }, ic('plus', 16), 'Aggiungi file'), input),
          h('div', { class: 'wb-q' }, 'Consigliati'),
          h('div', { class: 'wb-tools' }, sug.map(id => toolCard(id, () => openWith(id)))));
        return;
      }
      const dz = h('div', { class: 'wb-drop', onclick: () => input.click() },
        h('div', { class: 'dz-ic' }, ic('upload', 30)),
        h('div', {}, h('h2', { class: 'dz-t' }, h('span', { class: 'dz-mouse' }, 'Trascina qui il tuo file'), h('span', { class: 'dz-touch' }, 'Apri un documento')),
          h('p', {}, 'PDF, foto, bilanci XBRL, file firmati .p7m. Poi scegli cosa farci, uno strumento alla volta.', IS_TOUCH ? null : h('span', { class: 'dz-kbd' }, ' Premi ', h('kbd', {}, /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘ K' : 'Ctrl K'), ' per cercare uno strumento.'))),
        h('button', { type: 'button', class: 'btn primary dz-pick' }, ic('file', 18), 'Scegli il file'),
        cameraButton(f => addFiles(f), { label: 'Fotografa un documento' }),
        typeof Cloud !== 'undefined' ? h('button', { class: 'btn sm ghost dz-cloud cloud-btn', title: 'Apri dal cloud', onclick: async e => { e.stopPropagation(); const f = await Cloud.pick({ multiple: true }); if (f?.length) addFiles(f); } }, ic('cloud', 15), 'Apri dal cloud') : null,
        h('span', { class: 'dz-note' }, ic('shield', 14), IS_SITE ? 'Elaborato nel browser, senza caricamenti su un server' : 'Resta sul tuo dispositivo: nessun caricamento online'), input);
      const pv = typeof Promo !== 'undefined' ? Promo.card('flow', { hue: 'var(--accent)', title: 'file360' }) : null;
      const rs = typeof Resume !== 'undefined' ? Resume.card(() => draw()) : null;
      const quick = quickChips();
      box.replaceChildren(...[typeof InstallTip !== 'undefined' ? InstallTip.el() : null, rs, quick, h('div', { class: 'wb-start' + (pv ? ' with-pv' : '') }, dz, pv)].filter(Boolean));
    }
    // i preferiti sopra il riquadro: la sezione c'è solo quando hai messo almeno una stellina
    function quickChips() {
      const favs = (typeof Favs !== 'undefined' ? Favs.list() : []).filter(id => TOOLS[id]);
      if (!favs.length) return null;
      return h('section', { class: 'home-favs', 'aria-labelledby': 'hf-h' },
        h('div', { class: 'hf-head' }, h('h2', { id: 'hf-h' }, ic('star', 14), 'I tuoi preferiti'), h('span', { class: 'hf-sub' }, plural(favs.length, 'strumento', 'strumenti') + ' · la stellina nell’elenco li toglie')),
        h('div', { class: 'hf-l' }, favs.map(id => {
          const t = TOOLS[id];
          const a = h('a', { class: 'hf-t', href: urlFor(id), draggable: 'false', dataset: { id }, style: { '--hue': t.hue }, title: t.desc,
            onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(id); } },
            h('span', { class: 'led', 'aria-hidden': 'true' }), h('span', { class: 't-ic', 'aria-hidden': 'true' }, ic(t.icon, 18)), h('span', { class: 'hf-n' }, t.title));
          if (typeof dropOpens === 'function') dropOpens(a, id);
          return a;
        })));
    }
    /* —— riconoscimento al caricamento: cosa ho notato e cosa conviene fare —— */
    let insOff = null;
    function insightBox(v) {
      insOff?.(); insOff = null;
      const box2 = h('div', { class: 'wb-ins', 'aria-live': 'polite' });
      if (typeof DocInsight === 'undefined') return box2;
      const paint = f => {
        if (!box2.isConnected && f.done) return;
        const adv = DocInsight.advise(f), sum = DocInsight.summary(f);
        box2.replaceChildren(
          h('div', { class: 'wb-ins-h' }, f.done ? ic('check', 15, 2.6) : h('span', { class: 'jp-spin' }),
            h('b', {}, f.done ? (adv.length ? 'Cosa ho notato' : 'Nessun intervento necessario') : 'Analisi del documento…'),
            sum ? h('span', { class: 'muted small' }, sum) : null),
          ...adv.slice(0, 6).map(a => h('div', { class: 'wb-ins-row', style: { '--hue': TOOLS[a.tool].hue } },
            h('span', { class: 't-ic' }, ic(TOOLS[a.tool].icon, 17)),
            h('span', { class: 'wb-ins-t' }, a.text),
            h('button', { class: 'btn sm', onclick: () => go(a.tool) }, a.cta, ic('arrow', 14)))),
          ...(f.done && !adv.length ? [h('div', { class: 'muted small', style: { padding: '2px 4px 4px' } }, 'Il documento ha già il testo, nessuna pagina storta, un peso contenuto: scegli tu cosa fare.')] : []));
      };
      const sub = DocInsight.of(v.bytes, paint);
      insOff = sub.off;
      return box2;
    }
    function openWith(id) {
      const t = TOOLS[id];
      const usable = WB.filter(f => t.anyFile || isPdf(f) || (/image/.test(t.accept) && isImage(f)));
      if (!usable.length) return toast(`${t.title} non lavora con questi file.`, 'error');
      if (!t.multiple && usable.length > 1) toast(`${t.short} lavora su un file alla volta: apro «${usable[0].name}».`);
      WB = [];
      handoff(id, t.multiple ? usable : [usable[0]]);
    }
    draw();
    const redraw = () => { if (box.isConnected) draw(); };
    listeners.add(redraw); onLeave(() => listeners.delete(redraw));
    // preferiti cambiati: si riordinano le schede (con il documento aperto) o l'accesso rapido
    const favRedraw = () => { if (!box.isConnected) return; if (S || WB.length) draw(); else { const q = box.querySelector('.home-favs'), n = quickChips(); if (q && n) q.replaceWith(n); else if (q) q.remove(); else if (n) box.querySelector('.wb-start')?.before(n); } };
    if (typeof Favs !== 'undefined') { Favs.on(favRedraw); onLeave(() => Favs.off(favRedraw)); }
    return box;
  }
  // la versione prima dell'ultima (per confrontare il risultato con il documento di partenza)
  const prevBytes = () => S && S.cur > 0 ? S.versions[S.cur - 1].bytes : null;
  function setWorkbench(files) { WB = [...files]; changed(); }
  return { setWorkbench, showHistory: () => S && showHistory(), resumeVersion: i => S && resume(i), exportSession, importSession, draft, onChange, prevBytes, isCapturing: () => !!capture, homePanel, onOpen, trackTool, dirty, markClean, onResult, go, beforeRoute, preloadFor, loaded, bar, resultNote, nextChips, quickToast, reloader, downloadCurrent, takesPdf, kindOf, suggest, confirmReplace, closeDoc, pageAction, takeWantPage, applyPending,
    close: () => { end(); WB = []; }, active: () => !!S, state: () => S && { n: S.versions.length, cur: S.cur, labels: S.versions.map(v => v.label), tools: S.versions.map(v => v.tool), name: cur()?.name } };
})();

/* =====================================================================
   Progetti: lo spazio di lavoro che resta. Ogni volta che apri dei file nasce un progetto con
   i file caricati, tutte le versioni del documento (l'originale e ogni modifica applicata), i risultati
   prodotti e il lavoro non ancora applicato nello strumento. Tutto si salva da solo in questo browser
   (IndexedDB): chiudi la scheda, torni domani e ritrovi tutto, come in un'app di grafica.
   ===================================================================== */
const Projects = (() => {
  const ST = 'progetti', BL = 'blobs', MAX_RESULTS = 40, MAX_AGE_OPEN = 30 * 86400e3;
  let cur = null;                 // il progetto aperto in questa scheda (solo i dati, i file sono nell'archivio)
  const keyOf = new WeakMap();    // contenuto già salvato → chiave nell'archivio (le versioni non si salvano due volte)
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch { } });
  let warnedSpace = false;

  /* —— file nell'archivio —— */
  async function putBlob(bytes, type = 'application/octet-stream') {
    let k = keyOf.get(bytes); if (k) return k;
    k = newId('b'); await Store.put(BL, new Blob([bytes], { type }), k); keyOf.set(bytes, k); return k;
  }
  async function getBytes(k) { const b = await Store.get(BL, k); if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); keyOf.set(u, k); return u; }
  const keysOf = p => [...(p.versions || []), ...(p.files || []), ...(p.results || [])].map(x => x.key).filter(Boolean);
  // file che nessun progetto usa più: via
  async function gc() {
    try {
      const used = new Set((await Store.all(ST)).flatMap(keysOf)); if (cur) keysOf(cur).forEach(k => used.add(k));
      const dead = (await Store.keys(BL)).filter(k => !used.has(k));
      if (dead.length) await Store.batch(BL, o => dead.forEach(k => o.delete(k)));
    } catch (e) { console.warn('progetti: pulizia non riuscita', e); }
  }
  async function write(p) {
    p.updated = Date.now();
    try { await Store.put(ST, JSON.parse(JSON.stringify(p))); }
    catch (e) { if (Store.isQuota(e)) { if (!warnedSpace) { warnedSpace = true; Errors.show(e, { noLog: true }); } } else console.warn('progetto non salvato', e); }
    changed(); spaceCheck();
  }
  async function spaceCheck() {
    if (warnedSpace) return;
    const est = await Store.estimate(); if (!est || !est.quota) return;
    if (est.usage / est.quota > 0.85) { warnedSpace = true; toastActions('Lo spazio per i progetti sta finendo: elimina quelli che non ti servono più', [['Apri i progetti', () => nav('progetti')]], 10000); }
  }

  /* —— il progetto aperto —— */
  function create(name) {
    cur = { id: newId('p'), name: stripExt(name || 'Progetto').slice(0, 80) || 'Progetto', created: Date.now(), updated: Date.now(), open: true, cur: 0, versions: [], files: [], results: [], draft: null, lastTool: null, thumb: null };
    Store.persist();
    return cur;
  }
  // il documento del progetto è stato chiuso (la chiusura si salva con un attimo di ritardo): i file nuovi vanno in un progetto nuovo
  const ensure = name => {
    if (cur && cur.versions.length && !Flow.active()) { const p = cur; p.open = false; cur = null; lastSig = ''; write(p); }
    return cur || create(name);
  };
  // file caricati (più file, file non PDF): entrano nel progetto
  async function addFiles(list) {
    list = [...(list || [])].filter(f => f && f.size != null && f.size < 400e6);
    if (!list.length) return;
    const p = ensure(list.length === 1 ? list[0].name : `${stripExt(list[0].name)} e altri ${list.length - 1}`);
    for (const f of list) {
      if (p.files.some(x => x.name === f.name && x.size === f.size)) continue;
      try { const bytes = new Uint8Array(await f.arrayBuffer()); p.files.push({ key: await putBlob(bytes, f.type), name: f.name, size: f.size, type: f.type || '', at: Date.now() }); }
      catch (e) { console.warn('file non salvato nel progetto', e); }
    }
    if (!p.thumb) thumbFrom(p, list.find(f => isPdf(f) || isImage(f)));
    p.open = true;
    await write(p);
  }
  // risultati prodotti: si ritrovano nel progetto (gli ultimi MAX_RESULTS)
  async function addResults(outputs, tool) {
    const outs = (outputs || []).filter(o => o && o.bytes && o.bytes.length < 300e6);
    if (!outs.length) return;
    const p = ensure(CURRENT_INPUT[0]?.name || outs[0].name);
    for (const o of outs) {
      try { p.results.push({ key: await putBlob(o.bytes instanceof Uint8Array ? o.bytes : new Uint8Array(o.bytes), o.type), name: o.name, size: o.bytes.length, type: o.type || '', tool: tool || null, at: Date.now() }); }
      catch (e) { console.warn('risultato non salvato nel progetto', e); }
    }
    if (p.results.length > MAX_RESULTS) p.results.splice(0, p.results.length - MAX_RESULTS);
    p.open = true;
    await write(p);
  }
  // il documento attivo (tutte le versioni) e il lavoro non applicato
  let lastSig = '', lastDraft = '', saving = null;
  async function saveDoc() {
    const s = Flow.exportSession();
    if (!s) { if (cur && lastSig) { lastSig = ''; cur.open = false; const p = cur; cur = null; await write(p); gc(); } return; }
    const sig = s.versions.map(v => `${v.bytes.length}:${v.at}`).join('|') + '#' + s.cur;
    if (sig === lastSig && cur) return;
    // un altro documento al posto di quello del progetto: il progetto si chiude (resta tra i progetti) e ne nasce uno nuovo
    if (cur && cur.versions.length && keyOf.get(s.versions[0].bytes) !== cur.versions[0].key) { cur.open = false; await write(cur); cur = null; }
    const p = ensure(s.versions[0].name);
    const prevThumbFor = p.versions[p.cur]?.key;
    p.versions = [];
    for (const v of s.versions) p.versions.push({ key: await putBlob(v.bytes, 'application/pdf'), name: v.name, label: v.label, tool: v.tool, at: +v.at, size: v.bytes.length });
    p.cur = s.cur; p.open = true; p.lastTool = CURRENT_TOOL || p.lastTool;
    lastSig = sig;
    await write(p);
    if (p.versions[p.cur]?.key !== prevThumbFor || !p.thumb) thumbFrom(p, s.versions[s.cur].bytes);
  }
  async function saveDraft() {
    if (!cur || !Flow.active()) return;
    const d = Flow.draft(), j = d ? JSON.stringify(d) : '';
    if (j === lastDraft) return;
    lastDraft = j; cur.draft = d ? { ...d, at: Date.now() } : null;
    await write(cur);
  }
  const schedule = (() => { let t = null; return () => { clearTimeout(t); t = setTimeout(() => { saving = (saving || Promise.resolve()).then(saveDoc).then(saveDraft).catch(e => console.warn(e)); }, 600); }; })();
  // miniatura della prima pagina (o della foto) per l'elenco dei progetti
  async function thumbFrom(p, src) {
    if (!src) return;
    try {
      let c;
      if (src instanceof Uint8Array || isPdf(src)) {
        const bytes = src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer());
        const d = await pdfDocument({ data: bytes.slice() }).promise;
        try { const pg = await d.getPage(1), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: 220 / v0.width }); c = h('canvas', { width: Math.round(v.width), height: Math.round(v.height) }); await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise; } finally { d.destroy(); }
      } else { const bmp = await createImageBitmap(src); const sc = 220 / bmp.width; c = h('canvas', { width: 220, height: Math.round(bmp.height * sc) }); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close(); }
      p.thumb = c.toDataURL('image/jpeg', 0.7); c.width = c.height = 0;
      if (p === cur || !cur) await write(p);
    } catch (e) { console.warn('miniatura', e); }
  }

  /* —— avvio: salvataggio automatico e passaggio dalla vecchia «ripresa» —— */
  let started = false;
  async function start() {
    if (started || typeof Flow === 'undefined') return; started = true;
    Flow.onChange(schedule);
    setInterval(() => { if (!document.hidden || Busy.el) saveDraft(); }, 4000);
    addEventListener('pagehide', () => { saveDraft(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
    try {
      const old = await Store.get('ripresa', 'sessione');
      if (old && old.versions?.length && Date.now() - old.at < 14 * 86400e3) {
        const d = await Store.get('ripresa', 'bozza');
        const p = { id: newId('p'), name: stripExt(old.versions[0].name), created: old.at, updated: old.at, open: true, cur: old.cur, versions: [], files: [], results: [], draft: d || null, lastTool: d?.tool || null, thumb: null };
        for (const v of old.versions) p.versions.push({ key: await putBlob(v.bytes, 'application/pdf'), name: v.name, label: v.label, tool: v.tool, at: v.at, size: v.bytes.length });
        await Store.put(ST, p); thumbFrom(p, old.versions[old.cur]?.bytes);
      }
      if (old) { await Store.del('ripresa', 'sessione'); await Store.del('ripresa', 'bozza'); }
    } catch (e) { console.warn('progetti: passaggio dalla ripresa', e); }
    setTimeout(gc, 4000);
  }

  /* —— aprire un progetto —— */
  const list = async () => (await Store.all(ST).catch(() => [])).sort((a, b) => b.updated - a.updated);
  async function openProject(id, { version = null, go = true } = {}) {
    if (Flow.active() && cur?.id !== id && !(await Flow.closeDoc())) return false;
    const p = await Store.get(ST, id); if (!p) { toast('Progetto non trovato', 'error'); return false; }
    const r = await withBusy('Apertura del progetto…', async () => {
      const versions = [];
      for (const [i, v] of p.versions.entries()) { Busy.set(i / Math.max(1, p.versions.length + p.files.length)); const b = await getBytes(v.key); if (b) versions.push({ bytes: b, name: v.name, label: v.label, tool: v.tool, at: v.at }); }
      const files = [];
      for (const f of p.files) { const b = await getBytes(f.key); if (b) files.push(new File([b], f.name, { type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '') })); }
      return { versions, files };
    });
    if (!r) return false;
    if (cur && cur.id !== id) { cur.open = false; await write(cur); }
    cur = p; cur.open = true; lastDraft = '';
    if (r.versions.length) {
      const at = version != null ? Math.min(version, r.versions.length - 1) : Math.min(p.cur, r.versions.length - 1);
      lastSig = r.versions.map(v => `${v.bytes.length}:${v.at}`).join('|') + '#' + at;
      Flow.importSession({ versions: r.versions, cur: at }, version == null ? p.draft : null);
    } else Flow.close();
    if (!r.versions.length && r.files.length) Flow.setWorkbench(r.files);
    await write(cur);
    if (go) { const d = version == null ? p.draft : null; if (d && TOOLS[d.tool] && r.versions.length) Flow.go(d.tool); else nav(''); }
    return true;
  }
  async function remove(id) {
    if (cur?.id === id) { cur = null; lastSig = ''; if (Flow.active()) Flow.close(); }
    await Store.del(ST, id); await gc(); changed();
  }
  async function rename(id, name) { const p = cur?.id === id ? cur : await Store.get(ST, id); if (!p || !name) return; p.name = name.slice(0, 80); await write(p); }
  async function forget(id) { const p = cur?.id === id ? cur : await Store.get(ST, id); if (!p) return; p.open = false; if (cur?.id === id) { cur = null; lastSig = ''; } await write(p); }

  /* —— in home: «Riprendi sessione» e i progetti recenti —— */
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'poco fa' : m < 60 ? `${m} min fa` : m < 1440 ? `${Math.round(m / 60)} ore fa` : m < 2880 ? 'ieri' : new Date(t).toLocaleDateString('it-IT'); };
  const counts = p => [p.files.length ? plural(p.files.length, 'file', 'file') : null, p.versions.length > 1 ? plural(p.versions.length, 'versione', 'versioni') : p.versions.length ? '1 documento' : null,
    p.results.length ? plural(p.results.length, 'risultato', 'risultati') : null].filter(Boolean).join(' · ');
  function resumeCard(onDone) {
    start();
    if (Flow.active()) return null;
    const box = h('div', { class: 'rs-wrap' });
    (async () => {
      const all = await list(); if (!all.length) return;
      const last = all.find(p => p.open && Date.now() - p.updated < MAX_AGE_OPEN);
      const kids = [];
      if (last) {
        const tool = last.draft && TOOLS[last.draft.tool];
        const name = last.versions[last.cur]?.name || last.name;
        const sub = [ago(Math.max(last.updated, last.draft?.at || 0)), tool ? `modifiche in «${tool.short}» da applicare` : counts(last)].filter(Boolean).join(' · ');
        // una riga discreta: si riprende con un clic, la × la toglie (il progetto resta tra i tuoi progetti)
        kids.push(h('div', { class: 'rs-line', role: 'group', 'aria-label': 'Riprendi il lavoro' },
          last.thumb ? h('img', { class: 'rs-thumb', src: last.thumb, alt: '' }) : h('span', { class: 'rs-ic', 'aria-hidden': 'true' }, ic('clock', 16)),
          h('span', { class: 'rs-t' }, h('b', { title: name }, 'Riprendi «', h('span', { class: 'rs-n' }, name), '»'), h('span', {}, sub)),
          h('button', { class: 'btn sm rs-go', onclick: async () => { const ok = await openProject(last.id); if (ok && !(last.draft && TOOLS[last.draft.tool])) onDone?.(); } }, 'Riprendi', ic('arrow', 14)),
          h('button', { class: 'icon-btn rs-no', 'aria-label': 'Non mi serve: il progetto resta tra i tuoi progetti', 'data-tip': 'Non mi serve', onclick: async () => { await forget(last.id); box.querySelector('.rs-line')?.remove(); } }, ic('x', 15))));
      }
      box.replaceChildren(...kids);
    })();
    return box;
  }

  /* —— la pagina dei progetti —— */
  function render(body) {
    const st = { q: '', open: null };
    const search = h('input', { class: 'input pj-q', type: 'search', placeholder: 'Cerca un progetto o un file', oninput: () => { st.q = search.value.trim().toLowerCase(); draw(); } });
    const space = h('span', { class: 'muted small pj-space' });
    const grid = h('div', { class: 'pj-grid' });
    const detail = h('div', { class: 'pj-detail' });
    let all = [];
    const dlBlob = async (k, name, type) => { const b = await getBytes(k); if (b) download(b, name, type || (/\.pdf$/i.test(name) ? 'application/pdf' : 'application/octet-stream')); else toast('File non più disponibile', 'error'); };
    const pvBlob = async (k, name) => { const b = await getBytes(k); if (b && typeof Preview !== 'undefined') Preview.open({ bytes: b, name }); };
    const openIn = async (k, name, type) => {
      const b = await getBytes(k); if (!b) return;
      const f = new File([b], name, { type: type || (/\.pdf$/i.test(name) ? 'application/pdf' : '') });
      const choose = Object.entries(TOOLS).filter(([id, t]) => t.pdfIn !== false && (isPdf(f) || /image/.test(t.accept || '')) && t.chain !== false);
      const m = modal([h('h3', {}, `Apri «${name}» con…`), h('div', { class: 'chips', style: { marginTop: '10px' } }, choose.map(([id, t]) => h('button', { class: 'chip', style: { '--hue': t.hue }, onclick: () => { m.close(); handoff(id, f); } }, ic(t.icon, 14), t.short)))], { width: 520 });
    };
    function card(p) {
      const isCur = cur?.id === p.id;
      return h('div', { class: 'pj-card' + (st.open === p.id ? ' on' : ''), dataset: { id: p.id } },
        h('button', { class: 'pj-thumb', title: 'Apri il progetto', onclick: () => openProject(p.id) }, p.thumb ? h('img', { src: p.thumb, alt: '' }) : ic('project', 34)),
        h('div', { class: 'pj-info' },
          h('b', { class: 'pj-name', title: p.name }, p.name, isCur ? h('span', { class: 'pj-cur' }, 'aperto') : null),
          h('span', { class: 'muted small' }, `Modificato ${ago(p.updated)}`),
          h('span', { class: 'muted small' }, counts(p) || 'vuoto'),
          p.draft && TOOLS[p.draft.tool] ? h('span', { class: 'pj-pend small' }, `Modifiche in «${TOOLS[p.draft.tool].short}» da applicare`) : null),
        h('div', { class: 'pj-acts' },
          h('button', { class: 'btn sm primary pj-open', onclick: () => openProject(p.id) }, 'Apri'),
          h('button', { class: 'btn sm pj-more', onclick: () => { st.open = st.open === p.id ? null : p.id; draw(); } }, st.open === p.id ? 'Chiudi' : 'Contenuto'),
          iconBtn('edit', 'Rinomina', async () => { const n = typeof askText === 'function' ? await askText('Nome del progetto', p.name) : prompt('Nome del progetto', p.name); if (n) { await rename(p.id, n); load(); } }),
          iconBtn('trash', 'Elimina il progetto', () => {
            const m = modal([h('h3', {}, 'Eliminare il progetto?'), h('p', {}, `«${p.name}»: file, versioni e risultati vengono cancellati da questo browser. I file che hai già scaricato restano dove li hai salvati.`),
              h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Annulla'),
                h('button', { class: 'btn danger pj-del-ok', onclick: async () => { m.close(); await remove(p.id); if (st.open === p.id) st.open = null; load(); } }, 'Elimina'))], { width: 440 });
          })));
    }
    function contents(p) {
      const sec2 = (t, rows, empty) => h('div', { class: 'pj-sec' }, h('div', { class: 'sec-t' }, t), rows.length ? h('div', { class: 'pj-rows' }, rows) : h('div', { class: 'muted small' }, empty));
      const row = (icn, name, sub, acts) => h('div', { class: 'pj-row' }, ic(icn, 17), h('div', { class: 'pj-rt' }, h('b', { title: name }, name), h('span', { class: 'muted small' }, sub)), h('div', { class: 'pj-ra' }, acts));
      const vers = p.versions.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => row('layers', `v${i + 1} · ${v.label}`, `${new Date(v.at).toLocaleString('it-IT')} · ${fmtSize(v.size)}${i === p.cur ? ' · in uso' : ''}`, [
        h('button', { class: 'btn sm pj-restore', onclick: () => openProject(p.id, { version: i }) }, i === p.cur ? 'Apri' : 'Riprendi questa'),
        iconBtn('eye', 'Anteprima', () => pvBlob(v.key, v.name)), iconBtn('download', 'Scarica', () => dlBlob(v.key, i ? `${stripExt(v.name)}-v${i + 1}.pdf` : v.name, 'application/pdf'))]));
      const files = p.files.map(f => row('file', f.name, `${fmtSize(f.size)} · caricato ${ago(f.at)}`, [h('button', { class: 'btn sm', onclick: () => openIn(f.key, f.name, f.type) }, 'Apri con…'), iconBtn('download', 'Scarica', () => dlBlob(f.key, f.name, f.type))]));
      const res = p.results.slice().reverse().map(r => row('check', r.name, `${fmtSize(r.size)} · ${r.tool && TOOLS[r.tool] ? TOOLS[r.tool].short + ' · ' : ''}${ago(r.at)}`, [
        typeof Preview !== 'undefined' && Preview.can({ name: r.name, bytes: new Uint8Array(1) }) ? iconBtn('eye', 'Anteprima', () => pvBlob(r.key, r.name)) : null,
        /\.pdf$/i.test(r.name) ? h('button', { class: 'btn sm', onclick: () => openIn(r.key, r.name, r.type) }, 'Apri con…') : null,
        typeof Cloud !== 'undefined' ? iconBtn('cloud', 'Salva sul cloud', async () => { const b = await getBytes(r.key); if (b) Cloud.saveOutputs([{ name: r.name, bytes: b, type: r.type }]); }, 'icon-btn cloud-btn') : null,
        iconBtn('download', 'Scarica', () => dlBlob(r.key, r.name, r.type))]));
      return h('div', { class: 'pj-content' },
        sec2('Versioni del documento', vers, 'Nessun documento PDF aperto in questo progetto.'),
        sec2('File caricati', files, 'Nessun altro file.'),
        sec2('Risultati', res, 'Ancora nessun risultato.'),
        h('p', { class: 'muted small' }, 'Puoi tornare a qualsiasi versione: le successive restano nella cronologia.'));
    }
    function draw() {
      const rows = all.filter(p => !st.q || [p.name, ...p.files.map(f => f.name), ...p.results.map(r => r.name), ...p.versions.map(v => v.name)].join(' ').toLowerCase().includes(st.q));
      if (!all.length) { grid.replaceChildren(h('div', { class: 'act-empty' }, ic('project', 26), h('b', {}, 'Ancora nessun progetto'), h('span', { class: 'muted small' }, 'Apri un file da qualunque strumento: nasce un progetto che si salva da solo, con versioni e risultati.'), h('button', { class: 'btn primary sm', onclick: () => nav('') }, 'Apri un file'))); detail.replaceChildren(); return; }
      grid.replaceChildren(...rows.map(card));
      const sel = all.find(p => p.id === st.open);
      detail.replaceChildren(...(sel ? [h('div', { class: 'pj-dh' }, h('b', {}, sel.name)), contents(sel)] : []));
      if (sel) { const c = grid.querySelector(`.pj-card[data-id="${sel.id}"]`); c?.after(detail); }
    }
    async function load() {
      all = await list(); draw();
      const est = await Store.estimate();
      space.textContent = est?.quota ? `Spazio usato: ${fmtSize(est.usage || 0)} di ${fmtSize(est.quota)}` : '';
    }
    const old = h('button', { class: 'btn sm ghost', onclick: async () => {
      const lim = Date.now() - 30 * 86400e3, olds = all.filter(p => p.updated < lim && cur?.id !== p.id);
      if (!olds.length) return toast('Nessun progetto più vecchio di 30 giorni');
      const m = modal([h('h3', {}, `Eliminare ${plural(olds.length, 'progetto', 'progetti')}?`), h('p', {}, 'Quelli non modificati negli ultimi 30 giorni.'),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Annulla'), h('button', { class: 'btn danger', onclick: async () => { m.close(); for (const p of olds) await Store.del(ST, p.id); await gc(); load(); } }, 'Elimina'))], { width: 420 });
    } }, ic('trash', 15), 'Più vecchi di 30 giorni');
    body.replaceChildren(h('div', { class: 'pj' }, h('div', { class: 'act-bar' }, search, h('span', { style: { flex: 1 } }), space, old), grid));
    load();
    listeners.add(load); onLeave(() => listeners.delete(load));
  }
  PAGES.progetti = { title: 'Progetti', short: 'Progetti', icon: 'project', hue: '#0B7285', desc: 'Il lavoro dei giorni scorsi: file caricati, tutte le versioni e i risultati, salvati in questo browser. Riprendi da dove eri, torna a qualsiasi versione.', render };

  // fine del lavoro su questo progetto (nuovi file al suo posto): resta tra i progetti
  async function close() { if (!cur) return; const p = cur; cur = null; lastSig = ''; p.open = false; await write(p); }
  return { start, addFiles, addResults, list, openProject, remove, rename, forget, close, resumeCard, current: () => cur, gc, getBytes };
})();
// compatibilità: la home chiede la «ripresa»
const Resume = { card: cb => Projects.resumeCard(cb), start: () => Projects.start() };
setTimeout(() => { try { Projects.start(); } catch (e) { console.warn(e); } }, 0);

/* =====================================================================
   Ricette: le tue sequenze di passaggi, salvate e rieseguibili con un clic.
   Esempio «Chiusura mensile»: comprimi le fatture, uniscile in un PDF, aggiungi la dicitura della marca da bollo. Si lanciano su file scelti o su una cartella (che si ricorda: il mese dopo basta un clic) e
   i risultati si scaricano, finiscono nella stessa cartella o sul cloud.
   ===================================================================== */
