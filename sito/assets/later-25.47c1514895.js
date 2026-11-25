async function startContratto(stage, files = []) {
  const C = Contratti, KEY = 'officina-contratto', DAY = 864e5;
  const load = () => { try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); return x && x.st && Date.now() - x.t < 30 * DAY ? x : null; } catch { return null; } };
  const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), st })); } catch { } };
  let st = C.nuovo(), resumed = null;
  const json = files.find(f => /\.json$/i.test(f.name || '')), pdfIn = files.find(f => /\.pdf$/i.test(f.name || '') || f.type === 'application/pdf');
  if (json) { try { st = C.normalizza(JSON.parse(await json.text())); resumed = 'file'; } catch { toast('Il file non è una bozza di contratto valida', 'error'); } }
  else { const x = load(); if (x) { st = C.normalizza(x.st); resumed = x.t; } }
  // le sezioni con i dati da scrivere sono aperte: si compila scorrendo, senza aprire e chiudere (le clausole restano chiuse)
  const APERTE = ['tipo', 'A', 'B', 'imm', 'dur', 'can', 'dep', 'spese', 'firma'];
  const open = new Set(APERTE), touched = new Set(), touchedSec = new Set();
  let showAll = false, editing = null, k = C.controlla(st), guida = null, vista = 'dati';
  const AUTO = {};   // valori proposti dal programma (intestatario, luogo della firma): seguono la fonte finché nessuno li cambia
  const get = p => p.split('.').reduce((o, x) => o == null ? o : o[x], st);
  const set = (p, v) => { const ks = p.split('.'); let o = st; for (const x of ks.slice(0, -1)) o = o[x]; o[ks[ks.length - 1]] = v; };
  const T = () => C.TIPI[st.tipo], loc = () => C.isLoc(st), abit = () => C.isAbit(st), r = () => C.R(st);

  /* campi */
  const errOf = p => k.req.find(x => x.path === p);
  function F(path, label, o = {}) {
    const id = 'ct-' + path.replace(/\./g, '-'), v = get(path);
    const after = () => { derive(); saveLocal(); if (o.rebuild) rebuild(); else soon(); };
    const tocca = () => { touched.add(path); const sec = inp.closest('.ct-sec')?.dataset.sec; if (sec) touchedSec.add(sec); };
    let inp;
    if (o.type === 'select') inp = h('select', { class: 'select', id, onchange: e => { set(path, o.num ? +e.target.value : e.target.value); tocca(); after(); } }, o.opts.map(([kk, l]) => h('option', { value: String(kk), selected: String(v) === String(kk) }, l)));
    else if (o.type === 'textarea') { inp = h('textarea', { class: 'input', id, rows: o.rows || 3, placeholder: o.ph || '', oninput: e => { set(path, e.target.value); after(); }, onblur: () => { tocca(); refreshErrors(); renderPreview(); } }); inp.value = v || ''; }
    else inp = h('input', { class: 'input', id, type: o.type || 'text', value: v ?? '', placeholder: o.ph || '', inputmode: o.im || null, autocomplete: 'off', spellcheck: o.type ? null : 'false', min: o.min, max: o.max, maxlength: o.maxlength || null, list: o.comune ? 'ct-comuni' : null,
      oninput: e => { let x = e.target.value; if (o.up) { const pos = e.target.selectionStart; x = x.toUpperCase(); e.target.value = x; try { e.target.setSelectionRange(pos, pos); } catch { } } set(path, x); o.onInput?.(x); if (o.comune) suggerisci(x); after(); },
      onblur: () => { tocca(); if (o.fmt) { const f = o.fmt(get(path)); if (f !== get(path)) { set(path, f); inp.value = f; saveLocal(); soon(); } } if (o.comune) comuneScelto(path, o.comune); refreshErrors(); renderPreview(); } });
    if (o.req) inp.setAttribute('aria-required', 'true');
    // etichetta collegata al campo; suggerimento ed errore come descrizione (non fanno parte del nome del campo)
    const err = h('span', { class: 'ct-e', id: id + '-e' }); inp.setAttribute('aria-describedby', (o.hint ? id + '-h ' : '') + id + '-e');
    return h('div', { class: 'ct-f' + (o.w ? ' ' + o.w : ''), 'data-path': path }, h('label', { class: 'ct-l', for: id }, label, o.req ? h('span', { class: 'ct-req', 'aria-hidden': 'true' }, ' *') : null), inp, o.hint ? h('span', { class: 'ct-h', id: id + '-h' }, o.hint) : null, err);
  }
  const CB = (path, label, sub, o = {}) => { const el = checkbox(label, !!get(path), v => { set(path, v); saveLocal(); if (o.rebuild !== false) rebuild(); else soon(); }, sub); el.dataset.path = path; if (o.disabled) { el.querySelector('input').disabled = true; el.classList.add('ct-dis'); } return el; };
  const row = (...kids) => h('div', { class: 'ct-row' }, kids);
  // scrive un valore anche nel campo visibile (senza ridisegnare la colonna)
  const metti = (p, v, sempre = false) => { set(p, v); const el = side?.querySelector(`[data-path="${CSS.escape(p)}"] input, [data-path="${CSS.escape(p)}"] select`); if (el && (sempre || el !== document.activeElement)) el.value = v; };
  // valori che si ricavano da altri: l'intestatario del conto è il locatore, la firma di solito si fa nel Comune dell'immobile
  function derive() {
    const put = (p, v) => { const cur = String(get(p) ?? ''); v = String(v || '').trim(); if (v && (cur === '' || cur === AUTO[p]) && cur !== v) { AUTO[p] = v; metti(p, v); } else if (!v && cur && cur === AUTO[p]) { AUTO[p] = ''; metti(p, ''); } };
    const a = st.A[0];
    if (C.isLoc(st)) put('can.intestatario', st.A.length === 1 ? (a.tipo === 'pg' ? a.den : `${a.nome.trim()} ${a.cognome.trim()}`) : '');
    put('firma.luogo', st.imm.comune);
  }
  // Comuni: suggerimenti mentre si scrive (elenco ISTAT) e, a Comune scelto, il nome scritto giusto e la provincia
  const comuniDl = h('datalist', { id: 'ct-comuni' });
  const suggerisci = q => comuniDl.replaceChildren(...C.Comuni.cerca(q, 8).map(c => h('option', { value: c.n, label: `${c.n} (${c.s})` })));
  function comuneScelto(path, provPath) {
    const v = String(get(path) || '').trim(), m = v ? C.Comuni.daNome(v) : [];
    if (m.length && m[0].n !== v && m.every(c => c.n === m[0].n)) metti(path, m[0].n, true);
    if (m.length === 1 && typeof provPath === 'string' && !String(get(provPath) || '').trim()) metti(provPath, m[0].s);
    derive(); saveLocal(); soon();
  }
  const note = (t, cls = '') => h('div', { class: 'ct-note ' + cls }, t);
  const btn = (label, onclick, icon = null, cls = 'btn sm') => h('button', { type: 'button', class: cls, onclick }, icon ? ic(icon, 15) : null, label);

  /* una persona (parte o garante) */
  function personaUI(base, p, ruolo, i, list) {
    const P = (f, l, o = {}) => F(`${base}.${f}`, l, o);
    // dal codice fiscale: data, luogo e provincia di nascita e titolo (solo nei campi ancora vuoti)
    const cfInput = v => { const d = C.daCf(v); if (!d) return; let ch = false; for (const f of ['dataN', 'sesso', 'luogoN', 'provN']) if (d[f] && !String(p[f] || '').trim()) { p[f] = d[f]; ch = true; } if (ch) rebuild(); };
    const head = h('div', { class: 'ct-ph' }, list && list.length > 1 || base.startsWith('gar') ? h('b', {}, list && list.length > 1 ? `${ruolo} ${i + 1}` : ruolo) : null,
      base.startsWith('gar') ? null : seg([['pf', 'Persona'], ['pg', 'Società o ente']], p.tipo, v => { p.tipo = v; saveLocal(); rebuild(); }),
      list && list.length > 1 ? h('button', { type: 'button', class: 'icon-btn ct-x', title: `Togli ${ruolo} ${i + 1}`, 'aria-label': `Togli ${ruolo} ${i + 1}`, onclick: () => { list.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16)) : null);
    if (p.tipo === 'pg') return h('div', { class: 'ct-card' }, head,
      P('den', 'Denominazione', { req: true, ph: 'Immobiliare Esempio S.r.l.' }),
      row(P('cf', 'Codice fiscale', { req: true, up: true, w: 'half', maxlength: 16 }), P('piva', 'Partita IVA', { w: 'half', im: 'numeric', maxlength: 13 })),
      row(P('comune', 'Comune della sede', { req: true, w: 'grow', comune: `${base}.prov` }), P('prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      row(P('indirizzo', 'Indirizzo della sede', { req: true, w: 'grow' }), P('cap', 'CAP', { w: 'xs', im: 'numeric', maxlength: 5 })),
      row(P('lr', 'Legale rappresentante', { req: true, w: 'half', ph: 'Nome e cognome' }), P('lrRuolo', 'In qualità di', { w: 'half' })),
      P('lrCf', 'Codice fiscale del rappresentante', { up: true, maxlength: 16 }),
      row(P('pec', 'PEC', { w: 'half', type: 'email' }), P('tel', 'Telefono', { w: 'half', type: 'tel' })));
    return h('div', { class: 'ct-card' }, head,
      row(P('nome', 'Nome', { req: true, w: 'half' }), P('cognome', 'Cognome', { req: true, w: 'half' })),
      row(P('cf', 'Codice fiscale', { req: true, up: true, w: 'grow', maxlength: 16, onInput: cfInput, hint: 'Data e luogo di nascita si scrivono da soli.' }), P('sesso', 'Titolo', { type: 'select', w: 'sm', opts: [['', '—'], ['M', 'Sig.'], ['F', 'Sig.ra']], rebuild: true })),
      row(P('luogoN', 'Luogo di nascita', { req: true, w: 'grow', comune: `${base}.provN` }), P('provN', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      P('dataN', 'Data di nascita', { req: true, type: 'date' }),
      row(P('comune', 'Comune di residenza', { req: true, w: 'grow', comune: `${base}.prov` }), P('prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      row(P('indirizzo', 'Indirizzo', { req: true, w: 'grow', ph: 'via Roma 10' }), P('cap', 'CAP', { w: 'xs', im: 'numeric', maxlength: 5 })),
      row(P('email', 'E-mail o PEC', { w: 'half', type: 'email' }), P('tel', 'Telefono', { w: 'half', type: 'tel' })));
  }

  /* sezioni della colonna, ciascuna con lo stato (completa / dati mancanti) */
  // stato di una sezione: in grigio quello che resta da fare; in rosso solo dopo aver provato a scaricare; gli avvisi
  // compaiono quando si è lavorato nella sezione (all'apertura nessun allarme)
  const avvisi = () => k.warn.filter(w => showAll || touchedSec.has(w.sec) || (w.path && touched.has(w.path)));
  function chip(id) {
    if (id === 'tipo') return ['', TIPO_UI[st.tipo][1]];
    const n = k.req.filter(x => x.sec === id).length, w = avvisi().filter(x => x.sec === id).length;
    return n ? [showAll ? 'bad' : '', `${n} da completare`] : w ? ['warn', `${w} ${w === 1 ? 'avviso' : 'avvisi'}`] : ['ok', 'completa'];
  }
  function sezione(id, title, kids, sub = null) {
    const [cls, txt] = chip(id);
    const d = h('details', { class: 'ct-sec', 'data-sec': id, open: open.has(id), ontoggle: () => { if (d.open) open.add(id); else open.delete(id); } },
      h('summary', {}, h('span', { class: 'ct-st' }, title), h('span', { class: 'ct-chip ' + cls, 'data-chip': id }, txt)),
      sub ? h('div', { class: 'ct-sub' }, sub) : null, h('div', { class: 'ct-body' }, kids));
    return d;
  }
  /* tipo di contratto: riquadri compatti; «Aiutami a scegliere» porta al tipo giusto con poche domande */
  const TIPO_UI = { libero: ['home', '4+4 canone libero'], concordato: ['seal', '3+2 concordato'], transitorio: ['clock', 'Transitorio'], studenti: ['cap', 'Studenti'], commerciale: ['building', 'Negozio o ufficio'], foresteria: ['user', 'Foresteria'], box: ['key', 'Box o posto auto'], fondo: ['grid', 'Terreni agricoli'], comodato: ['hand', 'Comodato gratuito'] };
  function setTipo(id) {
    const x = C.TIPI[id]; st.tipo = id;
    if (id === 'fondo') { st.dep.mesi = 0; st.dur.anni = Math.max(+st.dur.anni || 0, 15); st.can.periodo = 'annuale'; } else if (st.can.periodo === 'annuale' || st.can.periodo === 'semestrale') st.can.periodo = 'mensile';
    if (x.anni) st.dur.anni = Math.max(+st.dur.anni || 0, x.anni[0]); if (x.mesi) st.dur.mesi = Math.min(x.mesi[1], Math.max(x.mesi[0], +st.dur.mesi || x.mesi[0]));
    if (id === 'commerciale' && st.can.istat > 75) st.can.istat = 75;
    saveLocal(); rebuild();
  }
  const GUIDA = {
    start: ['Che cosa dai?', [['Una casa', 'casa'], ['Un negozio, un ufficio o un laboratorio', 'neg'], ['Un box o un posto auto', 'box'], ['Un terreno agricolo', 'ter']]],
    casa: ['A chi?', [['Una persona o una famiglia', 'pers'], ['Uno studente universitario fuori sede', '=studenti', 'Iscritto all’università in un Comune diverso da quello in cui vive.'], ['Un’impresa per i suoi dipendenti', '=foresteria', 'La casa serve a dipendenti, collaboratori od ospiti dell’impresa.']]],
    pers: ['In cambio di che cosa?', [['Con un canone', 'durata'], ['Gratis', '=comodato', 'Per esempio a un figlio o a un genitore.']]],
    durata: ['Per quanto tempo?', [['Per anni', 'canone'], ['Per pochi mesi', '=transitorio', 'Da 1 a 18 mesi, per un bisogno temporaneo da scrivere e documentare.']]],
    canone: ['Che canone?', [['Canone libero', '=libero', 'Lo decidete voi. Dura 4 anni, poi altri 4.'], ['Canone concordato', '=concordato', 'Entro i valori dell’Accordo del Comune. Meno tasse per tutti e due. Dura 3 anni, poi altri 2.'], ['Non lo so', '=libero', 'È il più usato. Se il Comune ha un Accordo territoriale, chiedi del concordato: si pagano meno tasse.']]],
    neg: ['In cambio di che cosa?', [['Con un canone', '=commerciale'], ['Gratis', '=comodato']]],
    box: ['In cambio di che cosa?', [['Con un canone', '=box'], ['Gratis', '=comodato']]],
    ter: ['In cambio di che cosa?', [['Con un canone', '=fondo'], ['Gratis', '=comodato']]],
  };
  function guidaUI() {
    const g = guida, chiudi = h('button', { type: 'button', class: 'icon-btn ct-x', title: 'Chiudi', 'aria-label': 'Chiudi la guida', onclick: () => { guida = null; rebuild(); } }, ic('x', 16));
    const fatto = g.storia.length ? h('div', { class: 'ct-gs' }, g.storia.join(' · ')) : null;
    if (g.esito) {
      const [id, nota] = g.esito, x = C.TIPI[id];
      return h('div', { class: 'ct-guida', role: 'group', 'aria-label': 'Aiuto per scegliere il tipo' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Il tipo giusto'), chiudi), fatto,
        h('div', { class: 'ct-gr' }, ic(TIPO_UI[id][0], 20), h('div', {}, h('b', {}, x.label), h('div', { class: 'ct-h' }, nota || x.desc))),
        h('div', { class: 'ct-row' }, h('button', { type: 'button', class: 'btn sm primary', 'data-ct-usa': '', onclick: () => { guida = null; setTipo(id); side.querySelector('[data-ct-guida]')?.focus({ preventScroll: true }); } }, ic('check', 15), 'Usa questo tipo'), btn('Ricomincia', () => { guida = { nodo: 'start', storia: [] }; rebuild(); }, 'undo', 'btn sm ghost')));
    }
    const [dom, opts] = GUIDA[g.nodo];
    return h('div', { class: 'ct-guida', role: 'group', 'aria-label': 'Aiuto per scegliere il tipo' }, h('div', { class: 'ct-ph' }, h('b', {}, dom), chiudi), fatto,
      h('div', { class: 'ct-gopts' }, opts.map(([l, to, nota]) => h('button', { type: 'button', class: 'ct-gopt', onclick: () => { g.storia.push(l); if (to[0] === '=') g.esito = [to.slice(1), nota]; else g.nodo = to; rebuild(); side.querySelector('.ct-guida button')?.focus({ preventScroll: true }); } }, l))),
      g.storia.length ? btn('Indietro', () => { g.storia.pop(); let n = 'start'; for (const l of g.storia) n = GUIDA[n][1].find(o => o[0] === l)[1]; g.nodo = n; g.esito = null; rebuild(); }, 'back', 'btn sm ghost') : null);
  }
  function sideKids() {
    const t = T(), R0 = r(), I = st.imm;
    const out = [];
    // tipo
    out.push(sezione('tipo', 'Tipo di contratto', [
      h('div', { class: 'ct-types', role: 'radiogroup', 'aria-label': 'Tipo di contratto' }, Object.entries(C.TIPI).map(([id, x]) => h('label', { class: 'ct-type' + (st.tipo === id ? ' on' : ''), title: x.label },
        h('input', { type: 'radio', name: 'ct-tipo', value: id, checked: st.tipo === id, 'aria-describedby': st.tipo === id ? 'ct-tipo-desc' : null, onchange: () => setTipo(id) }), ic(TIPO_UI[id][0], 18), h('span', {}, TIPO_UI[id][1])))),
      h('p', { class: 'ct-tdesc' }, h('span', { id: 'ct-tipo-desc' }, t.desc), guida ? null : [' ', h('button', { type: 'button', class: 'linkbtn ct-gbtn', 'data-ct-guida': '', onclick: () => { guida = { nodo: 'start', storia: [] }; rebuild(); side.querySelector('.ct-guida button.ct-gopt')?.focus({ preventScroll: true }); } }, 'Non sai quale scegliere? Ti aiuto io')]),
      guida ? guidaUI() : null]));
    // parti
    const parti = (sec, key, ruolo, ruoloP) => sezione(sec, ruolo[0].toUpperCase() + ruolo.slice(1) + (st[key].length > 1 ? ` (${st[key].length})` : ''), [
      ...st[key].map((p, i) => personaUI(`${key}.${i}`, p, ruolo[0].toUpperCase() + ruolo.slice(1), i, st[key])),
      row(btn(`Aggiungi un altro ${ruolo}`, () => { st[key].push(C.persona()); saveLocal(); rebuild(); }, 'plus'),
        sec === 'A' && typeof FillKit !== 'undefined' ? btn('Usa i miei dati', mieiDati, 'user') : null),
      sec === 'B' && st.tipo === 'studenti' ? h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Iscrizione all’università')), F('stud.universita', 'Università', { req: true }), F('stud.corso', 'Corso di studi', { req: true, ph: 'laurea magistrale in …' })) : null,
    ], st[key].length > 1 ? `Più ${ruoloP}: nel contratto sono indicati insieme e firmano tutti.` : null);
    out.push(parti('A', 'A', R0.A, R0.Ap), parti('B', 'B', R0.B, R0.Bp));
    // immobile
    const pertUI = I.pert.map((x, i) => h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, `Pertinenza ${i + 1}`), h('button', { type: 'button', class: 'icon-btn ct-x', title: 'Togli la pertinenza', 'aria-label': `Togli la pertinenza ${i + 1}`, onclick: () => { I.pert.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16))),
      row(F(`imm.pert.${i}.tipo`, 'Tipo', { type: 'select', w: 'half', opts: ['cantina', 'box auto', 'posto auto', 'soffitta', 'giardino', 'magazzino', 'altro'].map(v => [v, v]) }), F(`imm.pert.${i}.descr`, 'Descrizione', { w: 'half', ph: 'al piano interrato' })),
      row(F(`imm.pert.${i}.foglio`, 'Foglio', { w: 'third' }), F(`imm.pert.${i}.part`, 'Particella', { w: 'third' }), F(`imm.pert.${i}.sub`, 'Sub.', { w: 'third' })),
      row(F(`imm.pert.${i}.categoria`, 'Categoria', { w: 'half', up: true, ph: 'C/6' }), F(`imm.pert.${i}.rendita`, 'Rendita €', { w: 'half', im: 'decimal' }))));
    const tipo = st.tipo, isBox = tipo === 'box', isFondo = tipo === 'fondo', isFores = tipo === 'foresteria';
    if (isFondo) {
      const TR = st.fondo.terreni;
      const trUI = TR.map((x, i) => h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, `Terreno ${i + 1}`), h('button', { type: 'button', class: 'icon-btn ct-x', title: 'Togli il terreno', 'aria-label': `Togli il terreno ${i + 1}`, onclick: () => { TR.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16))),
        row(F(`fondo.terreni.${i}.foglio`, 'Foglio', { req: true, w: 'third' }), F(`fondo.terreni.${i}.part`, 'Particella', { req: true, w: 'third' }), F(`fondo.terreni.${i}.sup`, 'Superficie (ettari)', { w: 'third', im: 'decimal', ph: '1,2500' })),
        row(F(`fondo.terreni.${i}.qualita`, 'Qualità', { w: 'third', ph: 'seminativo' }), F(`fondo.terreni.${i}.rd`, 'Reddito dominicale €', { w: 'third', im: 'decimal' }), F(`fondo.terreni.${i}.ra`, 'Reddito agrario €', { w: 'third', im: 'decimal' }))));
      out.push(sezione('imm', 'Terreni', [
        row(btn('Compila dalla visura catastale (PDF)', () => pickVisura(), 'upload'), h('span', { class: 'ct-h' }, 'Terreni, superfici, redditi e proprietari si leggono dalla visura del Catasto Terreni, sul tuo dispositivo.')),
        row(F('imm.comune', 'Comune', { req: true, w: 'grow', comune: 'imm.prov' }), F('imm.prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
        F('imm.indirizzo', 'Località (facoltativa)', { ph: 'contrada …' }),
        h('div', { class: 'ct-group' }, 'Catasto Terreni (dalla visura)'),
        ...trUI, row(btn('Aggiungi un terreno', () => { TR.push({ foglio: TR[TR.length - 1]?.foglio || '', part: '', sup: '', qualita: '', rd: '', ra: '' }); saveLocal(); rebuild(); }, 'plus')),
        F('fondo.coltura', 'Indirizzo colturale (facoltativo)', { ph: 'seminativo, vigneto, uliveto…' }),
        CB('fondo.coltivatore', 'L’affittuario è coltivatore diretto o imprenditore agricolo professionale', 'Il contratto ricorda il suo diritto di prelazione in caso di vendita (art. 8 L. 590/1965).'),
      ], TR.length ? null : 'Aggiungi i terreni con foglio e particella: si leggono dalla visura del Catasto Terreni.'));
    } else out.push(sezione('imm', tipo === 'commerciale' ? 'Locali' : isBox ? 'Box o posto auto' : 'Immobile', [
      row(btn('Compila dalla visura catastale (PDF)', () => pickVisura(), 'upload'), h('span', { class: 'ct-h' }, 'Dati catastali, indirizzo, pertinenze e proprietari si leggono dalla visura, sul tuo dispositivo.')),
      row(F('imm.comune', 'Comune', { req: true, w: 'grow', comune: 'imm.prov' }), F('imm.prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      row(F('imm.indirizzo', 'Indirizzo e numero civico', { req: true, w: 'grow', ph: 'via Garibaldi 12' }), F('imm.cap', 'CAP', { w: 'xs', im: 'numeric', maxlength: 5 })),
      row(F('imm.scala', 'Scala', { w: 'third' }), F('imm.piano', 'Piano', { w: 'third' }), F('imm.interno', 'Interno', { w: 'third' })),
      F('imm.descr', tipo === 'commerciale' ? 'Descrizione dei locali' : isBox ? 'Descrizione' : 'Composizione', { req: true, type: 'textarea', rows: 2, ph: tipo === 'commerciale' ? 'un locale al piano terra con vetrina, retro e bagno' : isBox ? 'box auto al piano interrato con porta basculante' : 'ingresso, soggiorno, cucina, due camere e bagno' }),
      isBox ? F('imm.mq', 'Superficie m²', { im: 'decimal' }) : row(F('imm.mq', 'Superficie m²', { w: 'half', im: 'decimal' }), F('imm.arredo', 'Arredi', { type: 'select', w: 'half', rebuild: true, opts: [['no', 'Non arredato'], ['si', 'Arredato'], ['parz', 'Parzialmente arredato']] })),
      isBox ? row(F('box.uso', 'Destinato a', { w: 'grow' }), F('box.targa', 'Targa (facoltativa)', { w: 'sm', up: true, maxlength: 10 })) : null,
      isFores ? F('fores.destinatari', 'Chi lo abiterà', { req: true, hint: 'Per esempio: «propri dipendenti, collaboratori e ospiti».' }) : null,
      I.arredo !== 'no' && !isBox ? F('imm.inventario', 'Inventario degli arredi (uno per riga)', { type: 'textarea', rows: 4, ph: 'Cucina con elettrodomestici\nDivano tre posti\nLetto matrimoniale con materasso', hint: 'Diventa l’allegato «Inventario degli arredi».' }) : null,
      st.tipo === 'commerciale' ? F('comm.attivita', 'Attività che si svolgerà', { req: true, ph: 'vendita al dettaglio di abbigliamento' }) : null,
      st.tipo === 'commerciale' ? CB('comm.pubblico', 'L’attività comporta contatti diretti con il pubblico', 'Dà diritto all’indennità di avviamento e alla prelazione (artt. 34, 38–40 L. 392/1978).') : null,
      h('div', { class: 'ct-group' }, 'Dati catastali (dalla visura)'),
      row(F('imm.cat.foglio', 'Foglio', { req: true, w: 'third' }), F('imm.cat.part', 'Particella', { req: true, w: 'third' }), F('imm.cat.sub', 'Subalterno', { w: 'third' })),
      row(F('imm.cat.categoria', 'Categoria', { req: true, w: 'third', up: true, ph: 'A/2' }), F('imm.cat.classe', 'Classe', { w: 'third' }), F('imm.cat.rendita', 'Rendita €', { w: 'third', im: 'decimal' })),
      F('imm.cat.sez', 'Sezione urbana (se c’è)', { w: 'half' }),
      ...pertUI, row(btn('Aggiungi una pertinenza (box, cantina…)', () => { I.pert.push({ tipo: 'cantina', descr: '', foglio: I.cat.foglio, part: I.cat.part, sub: '', categoria: '', rendita: '' }); saveLocal(); rebuild(); }, 'plus')),
      loc() && !isBox ? row(F('imm.ape.classe', 'Classe energetica (APE)', { req: true, type: 'select', w: 'half', opts: [['', 'Scegli…'], ...['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'].map(v => [v, v]), ['esente', 'Non richiesto (casi esclusi)']] }), F('imm.ape.codice', 'Codice dell’attestato', { w: 'half' })) : null,
      !isBox ? CB('imm.riscAut', 'Riscaldamento autonomo', 'Esercizio e manutenzione della caldaia a chi abita (D.P.R. 74/2013).') : null,
      abit() || isFores || isBox ? CB('imm.condominio', 'L’immobile è in un condominio', abit() ? 'Regolamento allegato e voto del conduttore sul riscaldamento (art. 10 L. 392/1978).' : 'Regolamento di condominio allegato e da rispettare.') : null,
      abit() ? F('imm.conviventi', 'Persone che abiteranno con il conduttore (facoltativo)', { ph: 'nomi o «nessuno»' }) : null,
    ]));
    // durata
    const mesi = C.mesiDurata(st), fine = mesi && C.parseIso(st.dur.inizio) ? C.fineDurata(st.dur.inizio, mesi) : null;
    out.push(sezione('dur', 'Durata', [
      F('dur.inizio', 'Data di inizio', { req: true, type: 'date' }),
      t.anni ? F('dur.anni', `Durata in anni (per legge almeno ${C.anniMinimi(st)})`, { type: 'number', min: 1, max: 99, im: 'numeric' }) : null,
      t.mesi ? F('dur.mesi', `Durata in mesi (per legge da ${t.mesi[0]} a ${t.mesi[1]})`, { type: 'number', min: 1, max: 600, im: 'numeric' }) : null,
      st.tipo === 'box' ? F('box.disdetta', 'Preavviso per la disdetta e il recesso (giorni)', { type: 'number', min: 1, max: 365, im: 'numeric' }) : null,
      st.tipo === 'fondo' ? CB('fondo.deroga', 'Patti in deroga con le organizzazioni agricole', 'Durata e patti diversi dalla legge, con l’assistenza delle organizzazioni professionali agricole che firmano il contratto (art. 45 L. 203/1982).') : null,
      st.tipo === 'fondo' && st.fondo.deroga ? F('fondo.org', 'Organizzazioni che assistono le parti', { req: true, ph: 'nomi delle organizzazioni e dei loro rappresentanti' }) : null,
      st.tipo === 'commerciale' ? CB('dur.alberghiero', 'Attività alberghiera o teatrale', 'Durata minima 9 anni, rinnovo di 9, disdetta 18 mesi prima.') : null,
      fine ? note(`Fine: ${C.dataEstesa(fine)}${st.tipo === 'libero' ? ' (poi rinnovo di 4 anni)' : st.tipo === 'concordato' ? ' (poi proroga di 2 anni)' : st.tipo === 'commerciale' ? ` (poi rinnovo di ${st.dur.alberghiero ? 9 : 6} anni)` : st.tipo === 'box' ? ' (poi di anno in anno)' : st.tipo === 'foresteria' || (st.tipo === 'fondo' && !st.fondo.deroga) ? ' (poi rinnovo per uguale durata)' : ''}`) : null,
      st.tipo === 'comodato' ? CB('dur.termine', 'Con una data di fine', 'Senza data di fine il comodatario restituisce l’immobile quando il comodante lo chiede (art. 1810 c.c.).') : null,
      st.tipo === 'comodato' && st.dur.termine ? F('dur.fine', 'Data di fine', { req: true, type: 'date' }) : null,
      st.tipo === 'comodato' && !st.dur.termine ? F('dur.preavviso', 'Giorni per restituirlo dopo la richiesta', { type: 'number', min: 1, im: 'numeric' }) : null,
      st.tipo === 'transitorio' ? h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Esigenza transitoria')),
        F('trans.chi', 'Di chi è l’esigenza', { type: 'select', rebuild: true, opts: [['conduttore', 'Del conduttore'], ['locatore', 'Del locatore']] }),
        F('trans.esigenza', 'Esigenza', { req: true, type: 'textarea', rows: 2, ph: st.trans.chi === 'locatore' ? 'rientro in Italia del figlio previsto per il …' : 'trasferimento temporaneo per lavoro fino al …', hint: 'Deve rientrare tra quelle previste dall’Accordo territoriale del Comune.' }),
        F('trans.doc', 'Documento che la prova (allegato)', { req: true, ph: 'lettera del datore di lavoro del …' }),
        F('trans.preavviso', 'Preavviso per il recesso per gravi motivi (mesi)', { type: 'number', min: 1, max: 12, im: 'numeric' })) : null,
    ]));
    // canone
    if (loc()) {
      const can = C.num(st.can.mensile), pg = st.A.some(p => p.tipo === 'pg');
      const accordo = t.accordo || st.tipo === 'transitorio';
      out.push(sezione('can', 'Canone e pagamento', [
        row(F('can.mensile', st.tipo === 'fondo' ? 'Canone annuo €' : 'Canone mensile €', { req: true, w: 'half', im: 'decimal', ph: st.tipo === 'fondo' ? '3.000,00' : '750,00', fmt: v => { const n = C.num(v); return isFinite(n) && n > 0 ? C.eur(n) : v; } }), F('can.periodo', 'Rate', { type: 'select', w: 'half', opts: st.tipo === 'fondo' ? [['annuale', 'Una rata annuale'], ['semestrale', 'Semestrali']] : [['mensile', 'Mensili'], ['trimestrale', 'Trimestrali']] })),
        can > 0 && st.tipo !== 'fondo' ? note(`Canone annuo: ${C.eur(can * 12)} € (${C.eurLettere(can * 12)})`) : can > 0 ? note(`${C.eurLettere(can)}`) : null,
        F('can.giorno', 'Da pagare entro il giorno', { type: 'number', min: 1, max: 31, im: 'numeric' }),
        F('can.modo', 'Modalità di pagamento', { type: 'select', rebuild: true, opts: [['bonifico', 'Bonifico bancario'], ['altro', 'Altra modalità tracciabile']], hint: abit() ? 'Per l’abitativo il contante non è ammesso (art. 1, c. 50, L. 147/2013).' : null }),
        st.can.modo === 'bonifico' ? F('can.iban', 'IBAN', { req: true, up: true, maxlength: 42, fmt: C.ibanFmt }) : null,
        st.can.modo === 'bonifico' ? F('can.intestatario', 'Intestatario del conto', { req: true }) : F('can.altro', 'Modalità', { req: true, ph: 'assegno bancario non trasferibile' }),
        accordo ? h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Accordo territoriale')),
          row(F('can.accordo.comune', 'Comune dell’Accordo', { req: st.tipo !== 'transitorio', w: 'half', comune: true }), F('can.accordo.zona', 'Zona o fascia', { w: 'half', ph: 'es. zona C, fascia 2' })),
          st.tipo === 'transitorio' ? note('Compila solo se nel Comune il canone dei transitori è fissato dall’Accordo territoriale.', 'muted') : null,
          st.tipo === 'concordato' ? F('can.accordo.assistenza', 'Come si stipula', { type: 'select', rebuild: true, opts: [['attestazione', 'Da soli, poi attestazione di un’organizzazione'], ['assistito', 'Con l’assistenza delle organizzazioni']] }) : null,
          st.tipo === 'concordato' && st.can.accordo.assistenza === 'assistito' ? F('can.accordo.org', 'Organizzazioni', { req: true, ph: 'nomi delle organizzazioni di proprietari e inquilini' }) : null,
          st.tipo === 'concordato' ? CB('can.alta', 'Comune ad alta tensione abitativa', 'Solo per il promemoria fiscale: base del registro al 70% e cedolare al 10%.') : null) : null,
        abit() ? CB('can.cedolare', 'Cedolare secca', pg ? 'Non disponibile: c’è un locatore società.' : 'Niente registro e bollo; il locatore rinuncia all’aggiornamento ISTAT.', { disabled: pg && !st.can.cedolare }) : null,
        st.tipo === 'commerciale' || st.tipo === 'box' ? CB('can.iva', 'Canone più IVA', 'Se il locatore è soggetto IVA e sceglie di applicarla.') : null,
        !(abit() && st.can.cedolare) ? F('can.istat', 'Aggiornamento ISTAT annuale (% della variazione, 0 = nessuno)', { type: 'number', min: 0, max: 100, im: 'numeric', hint: ['commerciale', 'foresteria'].includes(st.tipo) ? 'Al massimo il 75% (art. 32 L. 392/1978).' : (C.mesiDurata(st) <= 12 && st.tipo !== 'box' ? 'Non si applica ai contratti fino a 12 mesi.' : null) }) : null,
      ]));
      // deposito e garanzie
      const dm = +st.dep.mesi || 0;
      out.push(sezione('dep', 'Deposito e garanzie', [
        F('dep.mesi', 'Deposito cauzionale (mensilità, 0 = nessuno)', { type: 'number', min: 0, max: 12, im: 'numeric', hint: can > 0 && dm ? `${C.eur(can * dm)} €, restituito con gli interessi legali.` : 'Per legge non più di tre mensilità (art. 11 L. 392/1978).' }),
        CB('gar.on', 'C’è un garante (fideiussore)', 'Una persona che garantisce i pagamenti dell’inquilino.'),
        st.gar.on ? personaUI('gar.p', st.gar.p, 'Garante') : null,
        st.gar.on ? F('gar.max', 'Importo massimo garantito €', { req: true, im: 'decimal', hint: 'Obbligatorio per legge (art. 1938 c.c.): di solito da 6 a 12 mensilità.', fmt: v => { const n = C.num(v); return isFinite(n) && n > 0 ? C.eur(n) : v; } }) : null,
      ]));
      if (!['box', 'fondo'].includes(st.tipo)) out.push(sezione('spese', 'Spese e utenze', [
        F('spese.oneri', 'Spese condominiali (oneri accessori)', { type: 'select', rebuild: true, opts: [['acconto', 'Acconto mensile e conguaglio annuale'], ['consuntivo', 'A consuntivo, su richiesta'], ['inclusi', 'Comprese nel canone']] }),
        st.spese.oneri === 'acconto' ? F('spese.acconto', 'Acconto mensile €', { im: 'decimal', fmt: v => { const n = C.num(v); return isFinite(n) && n > 0 ? C.eur(n) : v; } }) : null,
        F('spese.utenze', 'Utenze (luce, gas, acqua, internet)', { type: 'select', opts: [['conduttore', 'Intestate al conduttore'], ['locatore', 'Restano al locatore, con rimborso dei consumi']] }),
      ]));
    } else out.push(sezione('spese', 'Spese', [
      F('comod.uso', 'Uso dell’immobile', { req: true }),
      F('comod.spCond', 'Spese condominiali ordinarie', { type: 'select', opts: [['comodatario', 'A carico del comodatario'], ['comodante', 'A carico del comodante']] }),
      F('comod.spReg', 'Spese di registrazione', { type: 'select', opts: [['comodatario', 'A carico del comodatario'], ['comodante', 'A carico del comodante'], ['meta', 'Metà ciascuno']] }),
      CB('comod.parente', 'Comodato a un figlio o a un genitore', 'Per la riduzione IMU del 50%: il contratto indica l’uso come abitazione principale.'),
      st.comod.parente ? F('comod.rel', 'Il comodatario è', { type: 'select', opts: [['figlio', 'Figlio o figlia del comodante'], ['genitore', 'Genitore del comodante']] }) : null,
    ]));
    // clausole facoltative
    const cl = st.cl, CL = (key, label, sub, extra = null, when = true) => when ? h('div', { class: 'ct-cl' + (cl[key].on ? ' on' : '') }, CB(`cl.${key}.on`, label, sub), cl[key].on && extra ? h('div', { class: 'ct-clx' }, extra) : null) : null;
    out.push(sezione('cl', 'Clausole facoltative', [
      CL('recesso', 'Recesso libero dell’inquilino', 'Oltre ai «gravi motivi» di legge, può lasciare l’immobile quando vuole con un preavviso.', F('cl.recesso.mesi', 'Preavviso (mesi)', { type: 'number', min: 1, max: 24, im: 'numeric' }), loc() && !['studenti', 'box', 'fondo'].includes(st.tipo)),
      CL('risolutiva', 'Clausola risolutiva espressa', 'Il contratto si risolve se l’inquilino non paga alcune rate (art. 1456 c.c.).', F('cl.risolutiva.rate', 'Rate non pagate', { type: 'number', min: 1, max: 12, im: 'numeric' }), loc()),
      CL('animali', 'Animali domestici', 'Una regola chiara evita discussioni.', F('cl.animali.mode', 'Regola', { type: 'select', opts: [['consenso', 'Solo con consenso scritto'], ['si', 'Ammessi'], ['no', 'Non ammessi']] }), !['box', 'fondo'].includes(st.tipo)),
      CL('fumo', 'Divieto di fumo all’interno', '', null, !['box', 'fondo'].includes(st.tipo)),
      CL('subParz', 'Vietata anche la sublocazione parziale', 'La legge vieta solo quella totale.', null, abit()),
      CL('assic', 'Assicurazione dell’inquilino', 'Responsabilità civile e danni da incendio e acqua.'),
      CL('visite', 'Visite all’immobile con preavviso', 'Anche per mostrarlo a chi vuole comprarlo o affittarlo.', F('cl.visite.giorni', 'Preavviso (giorni)', { type: 'number', min: 1, max: 60, im: 'numeric' })),
      CL('migliorie', 'Lavori e migliorie solo con consenso scritto', 'Restano all’immobile senza indennità.', null, loc() && st.tipo !== 'fondo'),
      CL('esonero', 'Esonero del locatore per fatti di terzi', 'Danni causati da altri inquilini o da terzi, furti, interruzioni dei servizi non dovute al locatore.', null, loc() && st.tipo !== 'fondo'),
      CL('bombole', 'Divieto di bombole di gas', 'Niente GPL o combustibili in recipienti mobili nell’abitazione.', null, abit() || ['foresteria', 'comodato'].includes(st.tipo)),
      CL('clima', 'Climatizzatori e pompe di calore consentiti', 'L’inquilino può installarli a sue spese e li toglie alla riconsegna, ripristinando.', null, !['box', 'fondo'].includes(st.tipo)),
      CL('noPrel', 'Nessuna prelazione all’inquilino', 'Né in caso di vendita né per una nuova locazione (la legge non la prevede per questi contratti).', null, ['libero', 'concordato', 'transitorio', 'studenti', 'foresteria', 'box'].includes(st.tipo)),
      CL('pec', 'Comunicazioni anche via PEC ed e-mail', 'La PEC vale come raccomandata.'),
      CL('regLoc', 'Imposte di registro e bollo tutte a carico del locatore', 'Per legge sono divise (bollo al conduttore).', null, loc() && !(abit() && st.can.cedolare)),
      CL('verbale', 'Verbale di consegna allegato', 'Letture dei contatori, chiavi e stato dell’immobile alla consegna.', [
        F('cl.verbale.data', 'Data della consegna', { type: 'date' }),
        row(F('cl.verbale.luce', 'Contatore luce', { w: 'third' }), F('cl.verbale.gas', 'Contatore gas', { w: 'third' }), F('cl.verbale.acqua', 'Contatore acqua', { w: 'third' })),
        F('cl.verbale.chiavi', 'Chiavi consegnate', { ph: '2 portone, 3 appartamento, 1 cantina' }),
        F('cl.verbale.note', 'Stato dell’immobile e osservazioni', { type: 'textarea', rows: 2 })]),
    ]));
    // clausole personalizzate e articoli tolti
    const doc = C.documento(st);
    out.push(sezione('pers', 'Clausole personalizzate', [
      ...st.pers.map((c, i) => h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, `Clausola ${i + 1}`), h('button', { type: 'button', class: 'icon-btn ct-x', title: 'Togli la clausola', 'aria-label': `Togli la clausola ${i + 1}`, onclick: () => { st.pers.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16))),
        F(`pers.${i}.titolo`, 'Titolo', { ph: 'Posto bici in cortile' }), F(`pers.${i}.testo`, 'Testo', { type: 'textarea', rows: 4, hint: 'Una riga vuota separa i paragrafi.' }), CB(`pers.${i}.onerosa`, 'Da approvare specificamente (artt. 1341–1342 c.c.)', 'Per le clausole che limitano i diritti di una parte.', { rebuild: false }))),
      row(btn('Aggiungi una clausola', () => { st.pers.push({ titolo: '', testo: '', onerosa: false }); open.add('pers'); saveLocal(); rebuild(); }, 'plus')),
      doc.off.length ? h('div', { class: 'ct-off' }, h('div', { class: 'ct-group' }, 'Articoli tolti'), doc.off.map(a => row(h('span', {}, a.title), btn('Rimetti', () => { delete st.off[a.key]; saveLocal(); rebuild(); })))) : null,
    ], 'Ogni articolo si può anche modificare direttamente nell’anteprima.'));
    out.push(sezione('firma', 'Firma', [row(F('firma.luogo', 'Luogo', { req: true, w: 'half', comune: true }), F('firma.data', 'Data', { req: true, type: 'date', w: 'half' }))]));
    return out;
  }

  /* anteprima del contratto: carta, articoli modificabili */
  // un dato mancante nell'anteprima porta al suo campo (clic, Invio o spazio)
  const runsEl = t => C.pezzi(t).map(x => x.ph != null ? h('mark', { class: 'paper-ph', role: 'button', tabindex: '0', title: `Compila: ${x.ph}`, 'data-k': x.k || null, onclick: () => vaiAlCampo(x.k, x.ph), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vaiAlCampo(x.k, x.ph); } } }, x.ph) : x.b ? h('b', {}, x.t) : x.t);
  const parasEl = t => t.split('\n').flatMap((l, i) => i ? [h('br'), ...runsEl(l)] : runsEl(l));
  // modifica diretta: Modifica, doppio clic o Invio su un articolo (anche titolo), sull'intestazione, sulle parti o sulla chiusura
  const apri = key => { editing = key; renderPreview(); };
  function editorEl(key, label, testo, auto, mano, titolo = null) {
    const ta = h('textarea', { class: 'input paper-ta', rows: Math.min(18, Math.max(4, testo.length / 70 + testo.split('\n').length + 1)), 'aria-label': `Testo: ${label}` }); ta.value = C.senzaPercorsi(testo);
    const ti = titolo ? h('input', { class: 'input paper-ti', value: titolo.v, 'aria-label': `Titolo: ${label}` }) : null;
    setTimeout(() => (ti || ta).focus(), 0);
    const salva = () => {
      if (ti) { const v = ti.value.trim(); if (v && v !== titolo.auto) st.ovT[key] = v; else delete st.ovT[key]; }
      if (C.senzaPercorsi(auto).trim() !== ta.value.trim()) st.ov[key] = ta.value; else delete st.ov[key];
      editing = null; saveLocal(); rebuild();
    };
    return h('section', { class: 'paper-art editing', 'data-key': key }, ti ? h('div', { class: 'ct-f' }, h('span', { class: 'ct-l' }, 'Titolo'), ti) : h('h3', { class: 'paper-h' }, label),
      h('div', { class: 'ct-h' }, 'Modifica liberamente il testo. Una riga vuota separa i paragrafi; ⟦…⟧ indica un dato da completare.'), ta,
      h('div', { class: 'paper-acts' }, btn('Salva il testo', salva, 'check', 'btn sm primary'), btn('Annulla', () => { editing = null; renderPreview(); }),
        mano ? btn('Ripristina il testo automatico', () => { delete st.ov[key]; delete st.ovT[key]; editing = null; saveLocal(); rebuild(); }, 'undo') : null));
  }
  const modificabile = (key, label, el, mano, extra = null) => h('section', { class: 'paper-art paper-blk' + (mano ? ' edited' : ''), 'data-key': key, ondblclick: e => { if (!e.target.closest('mark, button')) apri(key); } },
    h('div', { class: 'paper-hrow paper-hrow-s' }, mano ? h('span', { class: 'ct-chip warn', title: 'Testo scritto a mano: non cambia più con i dati' }, 'modificato') : null,
      h('span', { class: 'paper-acts' }, btn(`Modifica ${label}`, () => apri(key), 'edit', 'btn sm ghost'), extra)), el);
  function articleEl(a) {
    if (editing === a.key) return editorEl(a.key, `articolo ${a.n}`, a.paras.join('\n\n'), a.auto.join('\n\n'), a.edited, { v: a.title, auto: a.titoloAuto });
    return h('section', { class: 'paper-art' + (a.edited ? ' edited' : ''), 'data-key': a.key, ondblclick: e => { if (!e.target.closest('mark, button')) apri(a.key); } },
      h('div', { class: 'paper-hrow' }, h('h3', { class: 'paper-h' }, `Art. ${a.n} – ${a.title}`), a.edited ? h('span', { class: 'ct-chip warn', title: 'Testo modificato a mano: non cambia più con i dati' }, 'modificato') : null,
        h('span', { class: 'paper-acts' }, btn('Modifica', () => apri(a.key), 'edit', 'btn sm ghost'), !a.fixed ? btn('Togli', () => { st.off[a.key] = true; saveLocal(); rebuild(); toast(`Articolo «${a.title}» tolto: puoi rimetterlo da «Clausole personalizzate»`); }, 'x', 'btn sm ghost') : null)),
      a.paras.map(t => h('p', {}, parasEl(t))));
  }
  const paper = h('article', { class: 'paper ct-paper', 'aria-label': 'Anteprima del contratto' });
  const status = h('div', { class: 'ct-status', role: 'status' });
  let firmaCarta = '';
  function renderPreview() {
    const d = C.documento(st);
    // la carta si ridisegna solo se il testo è cambiato (un clic su un dato mancante non si perde mentre il campo si chiude)
    const sig = JSON.stringify([d.title, d.sub, d.intro, d.arts.map(a => [a.key, a.n, a.title, a.paras, a.edited, a.fixed]), d.allegati, d.chiusa, d.firme, d.approv, d.mano, editing]);
    const blocco = (key, label, testo, el) => editing === key ? editorEl(key, label, testo, d.auto[key], d.mano[key]) : modificabile(key, label, el, d.mano[key]);
    if (sig !== firmaCarta) { firmaCarta = sig; paper.replaceChildren(
      blocco('_titolo', 'l’intestazione', `${d.title}\n${d.sub}`, [h('h2', { class: 'paper-t' }, d.title), h('div', { class: 'paper-s' }, d.sub)]),
      blocco('_intro', 'le parti', d.intro.join('\n\n'), d.intro.map(t => h('p', { class: 'paper-i' }, parasEl(t)))),
      ...d.arts.map(articleEl),
      d.allegati.length ? h('p', { class: 'paper-i' }, h('b', {}, 'Allegati: '), parasEl(d.allegati.join('; ') + '.')) : null,
      blocco('_chiusa', 'la chiusura', d.chiusa, h('p', { class: 'paper-i' }, parasEl(d.chiusa))),
      h('div', { class: 'paper-sign' }, d.firme.map(f => h('div', {}, h('div', {}, f.ruolo), h('div', { class: 'paper-line' }), h('div', { class: 'paper-n' }, runsEl(f.nome))))),
      d.approv ? h('p', { class: 'paper-ap' }, parasEl(d.approv)) : null); }
    // stato: dati obbligatori e avvisi
    const req = k.req, warn = avvisi().filter(w => !w.path);
    refreshProg();
    status.replaceChildren(
      req.length ? h('div', { class: 'ct-sline ' + (showAll ? 'bad' : 'todo') }, ic(showAll ? 'alert' : 'edit', 16), h('b', {}, showAll ? `Mancano ${plural(req.length, 'dato obbligatorio', 'dati obbligatori')}` : `Da compilare: ${plural(req.length, 'dato obbligatorio', 'dati obbligatori')}, segnati con *`), h('span', { class: 'ct-miss' }, req.slice(0, 8).map(x => h('button', { type: 'button', class: 'ct-mbtn', onclick: () => goTo(x) }, x.label)), req.length > 8 ? h('span', { class: 'muted' }, ` e altri ${req.length - 8}`) : null))
        : h('div', { class: 'ct-sline ok' }, ic('check', 16), h('b', {}, 'Dati obbligatori completi'), h('span', { class: 'muted' }, ` · ${plural(d.arts.length, 'articolo', 'articoli')}`)),
      warn.length ? h('ul', { class: 'ct-warn' }, warn.map(w => h('li', {}, w.msg))) : '');   // (replaceChildren scriverebbe «null» come testo)
  }
  function vaiAlCampo(path, label) {
    if (!path || !side.querySelector(`[data-path="${CSS.escape(path)}"]`)) { const r0 = k.req.find(x => x.path === path) || k.req.find(x => x.label.startsWith(label)); if (r0) path = r0.path; }
    if (!path) return;
    setVista('dati');
    let f = side.querySelector(`[data-path="${CSS.escape(path)}"]`);
    const sec = f?.closest('.ct-sec')?.dataset.sec || k.req.find(x => x.path === path)?.sec;
    if (sec && (!open.has(sec) || !f)) { open.add(sec); rebuild(); f = side.querySelector(`[data-path="${CSS.escape(path)}"]`); }
    const el = f?.querySelector('input:not([type=radio]), select, textarea') || f?.closest('.ct-body')?.querySelector('button');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => el.focus({ preventScroll: true }), 250);
    f.classList.remove('ct-flash'); void f.offsetWidth; f.classList.add('ct-flash');
  }
  function goTo(x) {
    open.add(x.sec); showAll = true; setVista('dati'); rebuild();
    const el = side.querySelector(`[data-path="${CSS.escape(x.path)}"] input, [data-path="${CSS.escape(x.path)}"] select, [data-path="${CSS.escape(x.path)}"] textarea`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 250); }
  }
  // errori accanto ai campi (dopo che il campo è stato toccato, o dopo aver provato a scaricare) e stato delle sezioni
  function refreshErrors() {
    k = C.controlla(st);
    side.querySelectorAll('.ct-f[data-path]').forEach(f => {
      const p = f.dataset.path, e = errOf(p), w0 = k.warn.find(x => x.path === p), vis = showAll || touched.has(p) || !!w0?.der, show = e && vis, w = !show && vis && w0;
      const inp = f.querySelector('input,select,textarea'), msg = f.querySelector('.ct-e');
      if (inp) inp.setAttribute('aria-invalid', show ? 'true' : 'false');
      if (msg) {
        // fuori dai limiti di legge: si può tenere il proprio valore, con un clic consapevole (e tornare indietro)
        const der = w && w.der ? h('button', { type: 'button', class: 'linkbtn ct-der', onclick: () => { st.der = { ...(st.der || {}), [w.der]: !w.on }; if (w.on) delete st.der[w.der]; saveLocal(); rebuild(); } }, w.on ? 'Torna al valore di legge' : `Usa comunque ${w.scelto}`) : null;
        // si ridisegna solo se cambia (il clic su «Usa comunque» non si perde mentre il campo si chiude)
        const firma = `${show ? e.msg : w ? w.msg : ''}|${der ? der.textContent : ''}`;
        if (msg.dataset.firma !== firma) { msg.dataset.firma = firma; msg.replaceChildren(show ? e.msg : w ? w.msg : '', ...(der ? [' ', der] : [])); }
        msg.classList.toggle('warn', !!w);
      }
    });
    side.querySelectorAll('[data-chip]').forEach(c => { const [cls, txt] = chip(c.dataset.chip); c.className = 'ct-chip ' + cls; c.textContent = txt; });
    refreshProg();
  }
  // avanzamento: dati obbligatori compilati sul totale del tipo scelto (nella barra in alto e nella scheda «Dati» al telefono)
  const prog = h('div', { class: 'ct-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-label': 'Dati obbligatori compilati' }, h('span', { class: 'ct-prog-t' }), h('span', { class: 'ct-prog-bar' }, h('i')));
  function refreshProg() {
    const tot = k.tot || 1, done = Math.max(0, tot - k.req.filter(x => x.need).length);
    prog.setAttribute('aria-valuemax', String(tot)); prog.setAttribute('aria-valuenow', String(done)); prog.setAttribute('aria-valuetext', `${done} di ${tot}`);
    prog.querySelector('.ct-prog-t').textContent = done >= tot ? 'Dati obbligatori completi' : `${done} di ${tot} dati obbligatori`;
    prog.querySelector('i').style.width = `${Math.round(done / tot * 100)}%`; prog.classList.toggle('ok', done >= tot);
    const n = vistaBtns.dati.querySelector('.ct-vn'); if (n) n.textContent = done >= tot ? '✓' : `${done}/${tot}`;
  }
  // al telefono: «Dati» e «Anteprima» come due schede, l'anteprima a un tocco
  const vistaBtn = (v, label) => h('button', { type: 'button', class: 'ct-vb', 'data-ct-vista': v, 'aria-pressed': String(vista === v), onclick: () => { setVista(v); scrollTo({ top: 0 }); } }, label, v === 'dati' ? h('span', { class: 'ct-vn' }) : null);
  const vistaBtns = { dati: vistaBtn('dati', 'Dati'), anteprima: vistaBtn('anteprima', 'Anteprima') };
  const vistaBar = h('div', { class: 'ct-vista', role: 'group', 'aria-label': 'Che cosa mostrare' }, vistaBtns.dati, vistaBtns.anteprima);
  function setVista(v) { vista = v; ws.dataset.vista = v; for (const [kk, b] of Object.entries(vistaBtns)) b.setAttribute('aria-pressed', String(kk === v)); }
  // passo 2: completati i dati obbligatori si aprono le clausole facoltative (una volta sola, senza togliere il fuoco)
  let fase2 = false;
  const passo2 = () => { if (!fase2 && touched.size && !k.req.length) { fase2 = true; open.add('cl'); const d = side.querySelector('.ct-sec[data-sec="cl"]'); if (d && !d.open) d.open = true; toast('Dati obbligatori completi: ora scegli le clausole da aggiungere'); } };
  let tm = 0; const soon = () => { clearTimeout(tm); tm = setTimeout(() => { refreshErrors(); renderPreview(); passo2(); }, 40); };
  // ridisegno della colonna (cambia la struttura): il fuoco e la posizione restano dove erano
  function rebuild() {
    const ae = document.activeElement, path = ae?.closest?.('[data-path]')?.dataset.path, sc = sideScroll.scrollTop;
    k = C.controlla(st);
    sideScroll.replaceChildren(...sideKids().filter(Boolean));
    sideScroll.scrollTop = sc;
    const on = sideScroll.querySelector('.ct-type.on'), row0 = on?.parentElement; if (row0 && row0.scrollWidth > row0.clientWidth) row0.scrollLeft = on.offsetLeft - row0.offsetLeft - 16;
    if (path) { const el = side.querySelector(`[data-path="${CSS.escape(path)}"] input:not([type=radio]), [data-path="${CSS.escape(path)}"] select, [data-path="${CSS.escape(path)}"] textarea`); if (el) { el.focus({ preventScroll: true }); try { if (el.setSelectionRange && /text|search|tel/.test(el.type)) el.setSelectionRange(el.value.length, el.value.length); } catch { } } }
    refreshErrors(); renderPreview();
  }

  /* visura catastale e «I miei dati» */
  const title = s => String(s || '').toLowerCase().replace(/(^|[\s'’(\-/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Di|Del|Della|Dei|Degli|Delle|De|Da|In|E|Al|Alla|Via|Viale|Piazza|Corso|Vicolo|Largo|Strada|Contrada|Località)\b/g, w => w.toLowerCase()).replace(/^\p{Ll}/u, c => c.toUpperCase());
  const codice = s => { const t = String(s).toUpperCase().replace(/[^A-Z]/g, ''), c = t.replace(/[AEIOU]/g, ''), v = t.replace(/[^AEIOU]/g, ''); return (c + v + 'XXX').slice(0, 3); };
  function nomeDaVisura(full, cf) {
    const w = String(full || '').trim().split(/\s+/); if (w.length < 2) return { cognome: title(full), nome: '' };
    if (cf && C.cfOk(cf)) for (let i = 1; i < w.length; i++) if (codice(w.slice(0, i).join('')) === cf.toUpperCase().slice(0, 3)) return { cognome: title(w.slice(0, i).join(' ')), nome: title(w.slice(i).join(' ')) };
    return { cognome: title(w[0]), nome: title(w.slice(1).join(' ')) };
  }
  function pickVisura() { const inp = h('input', { type: 'file', accept: '.pdf,application/pdf', hidden: true, onchange: () => { const f = inp.files[0]; inp.remove(); if (f) importaVisura(f); } }); document.body.append(inp); inp.click(); }
  async function importaVisura(file) {
    let worker = null, msg = null;
    await withBusy('Lettura della visura catastale…', async () => {
      try {
        const doc = await openPdf(file); if (!doc) throw withBusy.last || new Error('Impossibile aprire il file');
        const pages = await DocRead.pages(doc, { getWorker: async () => worker ||= await makeOcrWorker(new Set(['ita']), 300) });
        const v = CatastoRead.parse(pages), fab = (v.rows || []).filter(x => x.cat === 'Fabbricati');
        // proprietari → locatori (solo se il locatore non è ancora compilato)
        const aiLocatori = () => { let nOwn = 0; const vuoto = p => !p.nome.trim() && !p.cognome.trim() && !p.cf.trim() && !p.den.trim();
        if ((v.owners || []).length && st.A.every(vuoto)) {
          st.A = v.owners.slice(0, 4).map(o => { const p = C.persona(), cf = String(o.cf || '').toUpperCase(); if (/^\d{11}$/.test(cf)) { p.tipo = 'pg'; p.den = o.nome; p.cf = cf; } else { Object.assign(p, nomeDaVisura(o.nome, cf)); p.cf = cf; const dd = C.daCf(cf); if (dd) Object.assign(p, dd); } return p; });
          nOwn = st.A.length;
        }
        return nOwn; };
        // fondo rustico: i terreni del Catasto Terreni (superficie in ettari, qualità, redditi)
        const cmn = /^(.*?)\s*\(([A-Z0-9]{2,4})\)/.exec(v.comune || '');
        // una visura con soli terreni porta da sola al contratto di affitto di fondo rustico
        if (st.tipo !== 'fondo' && !fab.length && (v.rows || []).some(x => x.cat === 'Terreni')) { st.tipo = 'fondo'; st.dep.mesi = 0; st.dur.anni = Math.max(+st.dur.anni || 0, 15); st.can.periodo = 'annuale'; }
        if (st.tipo === 'fondo') {
          const ter = (v.rows || []).filter(x => x.cat === 'Terreni');
          if (!ter.length) { msg = ['Non ho trovato terreni del Catasto Terreni in questa visura.', 'error']; return; }
          if (cmn) { st.imm.comune = title(cmn[1]); if (/^[A-Z]{2}$/.test(cmn[2])) st.imm.prov = cmn[2]; }
          let n = 0;
          for (const x of ter) if (!st.fondo.terreni.some(t => t.foglio === String(x.foglio) && t.part === String(x.part))) {
            st.fondo.terreni.push({ foglio: String(x.foglio || ''), part: String(x.part || ''), sup: num(x.sup) > 0 ? (x.sup / 10000).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '', qualita: String(x.qualita || '').toLowerCase(), rd: x.rdom != null ? C.eur(x.rdom) : '', ra: x.ragr != null ? C.eur(x.ragr) : '' }); n++;
          }
          const nO = aiLocatori();
          msg = [`Dalla visura: ${plural(n, 'terreno', 'terreni')} con foglio, particella, superficie e redditi${nO ? `, ${plural(nO, 'proprietario', 'proprietari')} come ${r().Ap}` : ''}.`, ''];
          open.add('imm'); saveLocal(); return;
        }
        if (!fab.length) { msg = ['Non ho trovato immobili del Catasto Fabbricati: è una visura catastale?', 'error']; return; }
        const main = (st.tipo === 'box' ? fab.find(x => /^C\/?[67]$/i.test(x.categoria || '')) : st.tipo === 'commerciale' ? fab.find(x => /^(C\/?[13]|D|A\/?10)/i.test(x.categoria || '')) : null) || fab.find(x => /^A/i.test(x.categoria || '')) || fab[0], I = st.imm;
        Object.assign(I.cat, { foglio: String(main.foglio || ''), part: String(main.part || ''), sub: String(main.sub || ''), categoria: String(main.categoria || '').toUpperCase(), classe: String(main.classe || ''), rendita: main.rendita != null ? C.eur(main.rendita) : '', sez: String(main.sez || '') });
        // «ROMA (H501)»: il nome del Comune; la provincia solo se è una sigla di due lettere (non il codice catastale)
        const cm = /^(.*?)\s*\(([A-Z0-9]{2,4})\)/.exec(v.comune || ''); if (cm) { I.comune = title(cm[1]); if (/^[A-Z]{2}$/.test(cm[2])) I.prov = cm[2]; }
        if (main.ind) {
          let s = String(main.ind); const g = re => { const m = re.exec(s); if (m) { s = s.replace(m[0], ' '); return m[1]; } return ''; };
          const piano = g(/\bpiano:?\s*([\w-]+)/i), interno = g(/\binterno:?\s*([\w-]+)/i), scala = g(/\bscala:?\s*([\w-]+)/i);
          s = s.replace(/\s{2,}/g, ' ').replace(/[\s,;]+$/, '').trim(); if (s) I.indirizzo = title(s).replace(/\bN\.\s*/g, 'n. ');
          if (piano) I.piano = piano.toUpperCase() === 'T' ? 'terra' : piano; if (interno) I.interno = interno; if (scala) I.scala = scala;
        }
        if (num(main.sup) > 0 && !I.mq) I.mq = String(main.sup);
        const TIPO = { 'C/2': 'cantina', 'C/6': 'box auto', 'C/7': 'posto auto' };
        const pert = fab.filter(x => x !== main && TIPO[(x.categoria || '').toUpperCase()]);
        for (const x of pert) if (!I.pert.some(p => p.foglio === String(x.foglio) && p.part === String(x.part) && p.sub === String(x.sub || ''))) I.pert.push({ tipo: TIPO[x.categoria.toUpperCase()], descr: '', foglio: String(x.foglio || ''), part: String(x.part || ''), sub: String(x.sub || ''), categoria: x.categoria.toUpperCase(), rendita: x.rendita != null ? C.eur(x.rendita) : '' });
        const nOwn = aiLocatori();
        const others = fab.filter(x => x !== main && !TIPO[(x.categoria || '').toUpperCase()]).length;
        msg = [`Dalla visura: dati catastali (${main.categoria || 'categoria'}), indirizzo${pert.length ? `, ${plural(pert.length, 'pertinenza', 'pertinenze')}` : ''}${nOwn ? `, ${plural(nOwn, 'proprietario', 'proprietari')} come ${r().Ap}` : ''}.${others ? ` La visura contiene altre ${others} unità: controlla di aver preso quella giusta.` : ''} Controlla i dati prima di firmare.`, 'ok'];
        open.add('imm'); touchedSec.add('imm'); saveLocal();
      } finally { try { await worker?.terminate(); } catch { } }
    });
    if (msg) toast(msg[0], msg[1] === 'error' ? 'error' : ''); derive(); rebuild();
  }
  function mieiDati() {
    const pr = FillKit.profile(); if (!pr || !Object.values(pr).some(Boolean)) return toast('Non hai ancora salvato «I miei dati»: si compilano nel Centro privacy o nella compilazione dei moduli.', 'error');
    const p = st.A[0], d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(pr.dataNascita || '');
    Object.assign(p, { tipo: 'pf', nome: pr.nome || p.nome, cognome: pr.cognome || p.cognome, cf: (pr.cf || p.cf).toUpperCase(), luogoN: pr.luogoNascita || p.luogoN, provN: pr.provNascita || p.provN, comune: pr.comune || p.comune, prov: pr.prov || p.prov, indirizzo: pr.indirizzo || p.indirizzo, cap: pr.cap || p.cap, email: pr.pec || pr.email || p.email, tel: pr.telefono || p.tel });
    if (d) p.dataN = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; const dd = C.daCf(p.cf); if (dd) { p.sesso ||= dd.sesso; p.dataN ||= dd.dataN; }
    if (pr.iban && !st.can.iban) { st.can.iban = C.ibanFmt(pr.iban); st.can.intestatario ||= `${p.nome} ${p.cognome}`.trim(); }
    touchedSec.add('A'); derive(); saveLocal(); rebuild(); toast('Locatore compilato con i tuoi dati');
  }
  const num = v => C.num(v);

  /* scarica: contratto PDF e Word, promemoria, lettera per la cedolare */
  async function run() {
    k = C.controlla(st);
    if (k.req.length) {
      showAll = true; rebuild();
      const go = await new Promise(res => {
        const m = modal(h('div', { class: 'ct-dlg' }, h('h3', {}, `Mancano ${plural(k.req.length, 'dato obbligatorio', 'dati obbligatori')}`),
          h('ul', { class: 'ct-dl' }, k.req.slice(0, 10).map(x => h('li', {}, x.msg))), k.req.length > 10 ? h('p', { class: 'muted' }, `e altri ${k.req.length - 10}.`) : null,
          h('p', { class: 'muted' }, 'Puoi completarli ora, oppure scaricare una bozza con gli spazi da compilare a mano.'),
          h('div', { class: 'ct-dacts' }, h('button', { class: 'btn primary', 'data-autofocus': '', onclick: () => { res(false); m.close(); goTo(k.req[0]); } }, 'Completa i dati'), h('button', { class: 'btn', onclick: () => { res(true); m.close(); } }, 'Scarica la bozza'))), { width: 520, onClose: () => res(false) });
      });
      if (!go) return;
    }
    const bozza = k.req.length > 0;
    await withBusy(bozza ? 'Preparazione della bozza…' : 'Preparazione del contratto…', async () => {
      const p = await C.pdf(st), w = await C.docx(st), pr = await C.promemoriaPdf(st, p.pages);
      const tipoN = st.tipo === 'comodato' ? 'Contratto di comodato' : 'Contratto di locazione';
      const base = `${bozza ? 'Bozza - ' : ''}${tipoN} - ${p.doc.immBreve}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 110);
      const outs = [{ name: base + '.pdf', bytes: p.bytes, type: 'application/pdf', info: `${plural(p.pages, 'pagina', 'pagine')} · PDF accessibile` },
        { name: base + '.docx', bytes: w, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', info: 'Word, da modificare' },
        { name: 'Promemoria - cosa fare dopo la firma.pdf', bytes: pr, type: 'application/pdf', info: 'Scadenze, imposte, comunicazioni' }];
      if (C.isAbit(st) && st.can.cedolare) outs.push({ name: 'Lettera per la cedolare secca.pdf', bytes: await C.letteraCedolare(st), type: 'application/pdf', info: 'Da consegnare all’inquilino' });
      const a = C.adempimenti(st, p.pages);
      showResult(outs, { title: bozza ? 'Bozza pronta' : 'Contratto pronto', zipName: base + '.zip', note: `${plural(p.doc.arts.length, 'articolo', 'articoli')}${bozza ? `; ${plural(k.req.length, 'dato è', 'dati sono')} da completare a mano` : ''}. ${a.lim ? `Registrazione entro il ${C.dataEstesa(a.lim)}. ` : ''}Stampa due originali e firmate ogni pagina. Il testo segue le norme citate; per i casi particolari fallo vedere a un professionista.` });
    });
  }
  function nuovo() {
    const m = modal(h('div', { class: 'ct-dlg' }, h('h3', {}, 'Ricominciare da capo?'), h('p', {}, 'I dati inseriti in questo contratto si cancellano da questo dispositivo. Se vuoi conservarli, prima salva la bozza.'),
      h('div', { class: 'ct-dacts' }, h('button', { class: 'btn danger', onclick: () => { m.close(); st = C.nuovo(); editing = null; guida = null; touched.clear(); touchedSec.clear(); for (const kk of Object.keys(AUTO)) delete AUTO[kk]; showAll = false; try { localStorage.removeItem(KEY); } catch { } open.clear(); APERTE.forEach(x => open.add(x)); setVista('dati'); rebuild(); banner.replaceChildren(); } }, 'Ricomincia'), h('button', { class: 'btn', 'data-autofocus': '', onclick: () => m.close() }, 'Annulla'))), { width: 460 });
  }
  function salvaBozza() { download(new Blob([JSON.stringify({ tipo: 'file360-contratto', salvato: new Date().toISOString(), ...st }, null, 1)], { type: 'application/json' }), `Bozza contratto - ${C.documento(st).immBreve}.json`.replace(/[\\/:*?"<>|]+/g, '-'), 'application/json'); toast('Bozza salvata: riaprila trascinando il file .json nello strumento'); }

  /* impaginazione */
  const banner = h('div', { class: 'ct-banner' });
  if (resumed) banner.append(h('div', { class: 'ct-sline' }, ic('clock', 16), h('span', {}, resumed === 'file' ? 'Bozza riaperta dal file.' : `Ho ripreso la bozza del ${new Date(resumed).toLocaleDateString('it-IT')}, salvata solo su questo dispositivo.`), btn('Ricomincia da capo', nuovo, null, 'btn sm ghost')));
  const main = h('div', { class: 'ws-main ct-main' },
    h('div', { class: 'toolbar ct-tb' }, prog, h('div', { class: 'ct-tba' }, btn('Salva bozza', salvaBozza, 'download', 'btn sm ghost'), btn('Nuovo', nuovo, 'plus', 'btn sm ghost'))),
    banner, status, h('div', { class: 'ct-legal muted small' }, 'Il contratto segue le norme indicate in ogni articolo e cambia con le tue scelte. Ogni parte si riscrive con un doppio clic. I dati restano su questo dispositivo. Per i casi particolari fallo vedere a un professionista.'), paper);
  const sideScroll = h('div');
  const ws = workspace(stage, main, [sideScroll], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), 'Scarica il contratto'), h('div', { class: 'muted small ct-foot' }, 'PDF, Word e promemoria di registrazione')]);
  const side = ws.querySelector('.side'); ws.classList.add('ct-ws'); ws.dataset.vista = vista; ws.append(vistaBar, comuniDl);
  sideScroll.className = 'ct-side';
  rebuild();
  if (pdfIn) importaVisura(pdfIn);
}

/* =====================================================================
   Rilevatore di testo AI (analisi e misure in RILEVATORE-AI.md)
   1. prove certe: impronte dei programmi che gli assistenti AI usano per creare i file (python-docx, docx.js,
      python-pptx, PptxGenJS, openpyxl, ReportLab…), nomi di assistenti nei metadati, caratteri delle chat, testo nascosto;
   2. prove forti: residui di una chat (Markdown, «Spero ti sia utile», «Fammi sapere…»);
   3. stile: modello statistico (n-grammi, regressione logistica) addestrato su 970 testi di Claude (Haiku, Sonnet,
      Opus) e oltre 40.000 testi umani scritti prima degli assistenti AI; soglia tarata per gruppo di testi umani.
      È una valutazione, non una prova: lo strumento lo dice sempre.
   Le prove e lo stile restano separati e non si mescolano in un solo numero.
   Nessuna AI esterna, nessuna richiesta di rete: il modello è un insieme di pesi dentro la pagina, tutto è calcolo locale.
   ===================================================================== */