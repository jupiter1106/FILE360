/* ---------- lavoro anticipato ----------
   Appena il file è aperto, le pagine da leggere con l'OCR si cominciano a leggere con le impostazioni del momento,
   mentre si scelgono le opzioni: premendo «Avvia» le pagine già lette non si rileggono e quelle in lettura si aspettano.
   Se si cambiano lingua, precisione o correzioni, la lettura anticipata riparte con le nuove impostazioni (le letture
   fatte con le vecchie non si usano mai). Usa un processore in meno di quelli disponibili, per lasciare la pagina
   fluida; si ferma quando parte un altro lavoro e quando si esce dallo strumento.
   La memoria resta sotto controllo: delle pagine lette si tiene il testo con le posizioni; l'immagine preparata si
   tiene finché c'è spazio e altrimenti si ricrea identica (stesso verso, stesso raddrizzamento) solo se serve. */
const ocrRecKey = st => { const Q = OCR_QUALITY[st.quality]; return JSON.stringify([Q.dpi, !!Q.twoPass, !!st.auto, !!st.fix, [...st.langs].sort()]); };
function createOcrCache(doc) {
  const mem = navigator.deviceMemory || 4;
  const BUDGET = (mem >= 8 ? 320 : mem >= 4 ? 160 : 60) * 1048576;   // byte di immagini preparate da tenere
  const done = new Map(), flying = new Map();   // pagina|chiave → risultato / promessa
  let used = 0;
  const id = (p, key) => p + '|' + key;
  const store = (p, key, rec) => {
    const img = rec.prep.img, bytes = img ? img.g.length : 0;
    const keep = img && used + bytes <= BUDGET;
    if (keep) used += bytes;
    const data = typeof structuredClone === 'function' ? structuredClone(rec.data) : rec.data;
    done.set(id(p, key), { data, straightened: rec.straightened, orient: rec.orient, fixLog: rec.fixLog || [], scale: rec.r.scale,
      M: rec.prep.M, angle: rec.prep.angle, img: keep ? img : null });
  };
  const view = e => {
    const data = typeof structuredClone === 'function' ? structuredClone(e.data) : e.data;
    return { data, straightened: e.straightened, orient: e.orient, fixLog: e.fixLog.map(x => ({ ...x })),
      prep: OCRPrep.lazyPrep({ img: e.img, M: e.M, angle: e.angle }), r: { scale: e.scale, canvas: null } };
  };
  return {
    has: (p, key) => done.has(id(p, key)) || flying.has(id(p, key)),
    isDone: (p, key) => done.has(id(p, key)),
    count: key => [...done.keys()].filter(k => k.endsWith('|' + key)).length,
    // risultato di una pagina letta (o in lettura) con le stesse impostazioni; null se non c'è
    async take(p, st) {
      const k = id(p, ocrRecKey(st));
      if (!done.has(k) && flying.has(k)) { try { await flying.get(k); } catch { } }
      const e = done.get(k);
      return e ? view(e) : null;
    },
    put(p, st, rec) { try { store(p, ocrRecKey(st), rec); } catch (e) { console.warn(e); } },
    _fly(p, key, pr) { const k = id(p, key); flying.set(k, pr); pr.finally(() => flying.delete(k)).catch(() => {}); },
    _put: store,
    clear() { done.clear(); flying.clear(); used = 0; },
  };
}
// ricrea la pagina a colori e la sua preparazione esattamente come durante la lettura (per Word e pagine pulite)
async function ocrRedoImages(doc, p, dpi, auto, rec) {
  const r = await renderPageCanvas(doc.pdfjs, p, dpi, { maxPixels: 34e6 });
  const prep = rec.prep.img ? rec.prep : OCRPrep.prepare(r.canvas, { deskew: auto, orient: rec.orient || 0, enhance: true, scale: r.scale });
  // la stessa correzione della curvatura delle righe usata per la lettura
  if (!rec.prep.img && rec.data?.warp) prep.img = OCRLayout.applyWarp(prep.img, rec.data.warp);
  return { prep, r };
}
// la lettura anticipata di un documento (un «lettore» per strumento aperto)
function createOcrSpec(doc, cache, { pages, onUpdate = () => {} }) {
  let key = null, st = null, run = 0, workers = [], alive = true, active = 0, target = 0;
  const slots = () => Math.max(1, parallelSlots() - 1);
  const stopWorkers = () => { const ws = workers; workers = []; ws.forEach(w => w && w.then(x => x.terminate()).catch(() => {})); };
  async function go(myRun) {
    let list;
    try { list = await pages(st); } catch { return; }
    if (myRun !== run || !alive) return;
    const todo = list.filter(p => !cache.has(p, key));
    target = list.length; onUpdate();
    if (!todo.length) return;
    let next = 0;
    const slot = async k => {
      for (;;) {
        // un altro lavoro in corso (anche l'OCR vero e proprio): non si ruba processore, si aspetta
        while (alive && myRun === run && typeof Jobs !== 'undefined' && Jobs.running) await new Promise(r => setTimeout(r, 700));
        if (!alive || myRun !== run) return;
        const i = next++; if (i >= todo.length) return;
        const p = todo[i];
        if (cache.has(p, key)) continue;
        if (!workers[k]) { workers[k] = makeOcrWorker(st.langs, OCR_QUALITY[st.quality].dpi); workers[k].catch(() => {}); }
        const Q = OCR_QUALITY[st.quality], myKey = key, mySt = { ...st, langs: new Set(st.langs) };
        const log = [];
        const job = (async () => {
          const rec = await ocrRecognizePage(workers[k], doc.pdfjs, p, { dpi: Q.dpi, twoPass: Q.twoPass, auto: mySt.auto, fix: mySt.fix, langs: mySt.langs, fixLog: log });
          if (rec.r.canvas) rec.r.canvas.width = rec.r.canvas.height = 0;
          cache._put(p, myKey, { ...rec, fixLog: log });
          rec.prep.release?.();
        })();
        cache._fly(p, myKey, job);
        active++; onUpdate();
        try { await job; } catch (e) { if (!e?.cancel) console.warn('lettura anticipata', p, e); }
        active--; onUpdate();
      }
    };
    await Promise.all(Array.from({ length: Math.min(slots(), todo.length) }, (_, k) => slot(k)));
    if (myRun === run) { stopWorkers(); onUpdate(); }
  }
  let timer = null;
  return {
    // (ri)parte con le impostazioni attuali; con impostazioni cambiate si ricomincia dopo una breve pausa
    update(state, { delay = 1200, force = false } = {}) {
      if (!alive) return;
      const k = ocrRecKey(state);
      if (k === key && !force) return;
      run++; stopWorkers(); key = k; st = { ...state, langs: new Set(state.langs) }; active = 0; onUpdate();
      clearTimeout(timer); const myRun = run;
      timer = setTimeout(() => go(myRun), delay);
    },
    stop() { alive = false; run++; clearTimeout(timer); stopWorkers(); },
    status: () => ({ ready: key ? cache.count(key) : 0, target, active, key }),
  };
}

/* ---------- revisione rapida e correzioni imparate ----------
   Dopo l'OCR si possono rivedere solo le parole lette con poca sicurezza (o che non sono parole italiane), una
   accanto all'altra con il pezzo di pagina: la correzione entra nel PDF ricercabile, nel Word e nel testo.
   Le correzioni si possono ricordare: la volta dopo lo stesso errore di lettura si corregge da solo (solo se la
   lettura è incerta e la parola letta non esiste nel dizionario, per non toccare mai parole giuste). */
const ocrWordKey = (p, w) => { const b = w.bbox; return `${p}|${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`; };
const OcrLearn = {
  KEY: 'officina.ocr.impara',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch { return {}; } },
  save(m) { try { localStorage.setItem(this.KEY, JSON.stringify(m)); } catch { } },
  learn(pairs) {
    const m = this.load();
    for (const [from, to] of pairs) { if (!from || !to || from === to || from.length > 40) continue; m[from] = { to, n: (m[from]?.to === to ? m[from].n : 0) + 1 }; }
    // al massimo 2000 correzioni ricordate (le più usate)
    const keys = Object.keys(m); if (keys.length > 2000) keys.sort((a, b) => m[a].n - m[b].n).slice(0, keys.length - 2000).forEach(k => delete m[k]);
    this.save(m);
  },
  count() { return Object.keys(this.load()).length; },
  forget() { try { localStorage.removeItem(this.KEY); } catch { } },
};
// applica le correzioni a mano (per posizione) e quelle imparate (per parola) a una pagina letta
function ocrApplyFixes(data, p, { fixes = null, learned = null, fixLog = null } = {}) {
  let changed = false;
  // parole eliminate nella revisione (correzione vuota): fuori dal testo estratto, dal PDF ricercabile e dal Word
  if (fixes && [...fixes.values()].some(v => v === '')) {
    const gone = new Set();
    for (const l of data.lines || []) {
      const keep = (l.words || []).filter(w => { if (w.bbox && fixes.get(ocrWordKey(p, w)) === '') { gone.add(w); fixLog?.push({ page: p, from: w.text, to: '', manual: true, removed: true }); return false; } return true; });
      if (keep.length !== (l.words || []).length) { l.words = keep; l.text = keep.map(w => w.text).join(' '); changed = true; }
    }
    if (gone.size) { data.lines = (data.lines || []).filter(l => (l.words || []).length); if (Array.isArray(data.words)) data.words = data.words.filter(w => !gone.has(w)); }
  }
  for (const l of data.lines || []) {
    let lc = false;
    for (const w of l.words || []) {
      if (!w.bbox) continue;
      const k = ocrWordKey(p, w);
      // una parola corretta a mano è certa: entra nel PDF anche se la lettura era illeggibile
      if (fixes && fixes.has(k)) { const to = fixes.get(k); if (to !== w.text) { fixLog?.push({ page: p, from: w.text, to, manual: true }); w.text = to; w.confidence = 99; lc = true; } continue; }
      const L = learned && learned[w.text];
      if (L && (w.confidence ?? 100) < 85 && !(typeof OCRFix !== 'undefined' && OCRFix.isWord(w.text.replace(/[^\p{L}]/gu, '')))) { fixLog?.push({ page: p, from: w.text, to: L.to, learned: true }); w.text = L.to; w.confidence = Math.max(w.confidence ?? 0, 80); lc = true; }
    }
    if (lc) { l.text = (l.words || []).map(w => w.text).join(' '); changed = true; }
  }
  if (changed && typeof OCRFix !== 'undefined') data.text = OCRFix.pageText(data.lines || []);
  return changed;
}
// le parole incerte delle pagine lette: poco sicure, o non parole del dizionario con sicurezza non piena
async function ocrUncertain(cache, st, pages, { max = 400 } = {}) {
  const out = [];
  for (const p of pages) {
    const rec = await cache.take(p, st); if (!rec) continue;
    for (const l of rec.data.lines || []) for (const w of l.words || []) {
      const t = (w.text || '').trim(), c = w.confidence ?? 100, core = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!w.bbox || core.length < 2 || !/\p{L}/u.test(core)) continue;
      const dict = typeof OCRFix !== 'undefined' && st.langs.has('ita') ? OCRFix.isWord(core) : true;
      if (c < 70 || (!dict && c < 90 && core.length >= 3 && !/^[A-Z0-9]{2,}$/.test(core))) out.push({ p, key: ocrWordKey(p, w), text: w.text, conf: Math.round(c), bbox: w.bbox, line: l.bbox, lineText: l.words.map(x => x.text).join(' ') });
    }
  }
  return out.sort((a, b) => a.p - b.p || a.line.y0 - b.line.y0 || a.bbox.x0 - b.bbox.x0).slice(0, max);
}
// la finestra di revisione: ritaglio della pagina, parola modificabile, Invio per passare alla successiva
async function openOcrReview({ doc, st, cache, items, onApply }) {
  const Q = OCR_QUALITY[st.quality];
  const imgs = new Map();
  const imgOf = async p => {
    if (imgs.has(p)) return imgs.get(p);
    const rec = await cache.take(p, st);
    let img = rec.prep.img;
    if (!img) { const r2 = await ocrRedoImages(doc, p, Q.dpi, st.auto, rec); img = r2.prep.img; r2.r.canvas.width = 0; }
    imgs.set(p, img); return img;
  };
  const crop = async it => {
    const img = await imgOf(it.p);
    const lh = it.line.y1 - it.line.y0, pad = Math.round(lh * 0.35);
    const x0 = Math.max(0, Math.round(it.bbox.x0 - lh * 2.2)), x1 = Math.min(img.w, Math.round(it.bbox.x1 + lh * 2.2));
    const y0 = Math.max(0, Math.round(it.line.y0 - pad)), y1 = Math.min(img.h, Math.round(it.line.y1 + pad));
    const w = Math.max(1, x1 - x0), hh = Math.max(1, y1 - y0);
    const c = h('canvas', { width: w, height: hh, class: 'rv-crop' }), cx = c.getContext('2d'), id = cx.createImageData(w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const v = img.g[(y0 + y) * img.w + x0 + x], i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    cx.putImageData(id, 0, 0);
    // la parola da controllare, evidenziata
    cx.fillStyle = 'rgba(224,69,58,.16)'; cx.strokeStyle = 'rgba(224,69,58,.9)'; cx.lineWidth = Math.max(1.5, lh / 22);
    cx.fillRect(it.bbox.x0 - x0 - 2, it.bbox.y0 - y0 - 2, it.bbox.x1 - it.bbox.x0 + 4, it.bbox.y1 - it.bbox.y0 + 4);
    cx.strokeRect(it.bbox.x0 - x0 - 2, it.bbox.y0 - y0 - 2, it.bbox.x1 - it.bbox.x0 + 4, it.bbox.y1 - it.bbox.y0 + 4);
    return c;
  };
  const state = items.map(it => ({ ...it, value: it.text, seen: false, removed: false }));
  const prog = h('span', { class: 'muted small' });
  const applyBtn = h('button', { class: 'btn primary', onclick: () => apply() });
  const learnCb = h('input', { type: 'checkbox', checked: true });
  const upd = () => {
    const ch = state.filter(x => !x.removed && x.value.trim() && x.value !== x.text).length, rm = state.filter(x => x.removed).length, seen = state.filter(x => x.seen || x.removed).length;
    prog.textContent = `${seen} di ${state.length} controllate · ${plural(ch, 'correzione', 'correzioni')}${rm ? ' · ' + plural(rm, 'eliminata', 'eliminate') : ''}`;
    applyBtn.textContent = ch || rm ? 'Applica' + (ch ? ' ' + plural(ch, 'correzione', 'correzioni') : '') + (ch && rm ? ' e' : '') + (rm ? ` ${rm === 1 ? 'l’eliminazione' : rm + ' eliminazioni'}` : '') : 'Fatto, nessuna correzione';
  };
  // una parola incerta si può togliere del tutto dal testo estratto (di nuovo: la si rimette)
  const setRemoved = (it, card, on) => { it.removed = on; card.classList.toggle('removed', on); const inp = card.querySelector('.rv-in'), b = card.querySelector('.rv-del'); inp.disabled = on; b.replaceChildren(ic(on ? 'undo' : 'trash', 15), on ? 'Rimetti' : 'Elimina'); b.title = on ? 'Rimetti la parola nel testo' : 'Togli questa parola dal testo estratto (non sarà né cercata né copiata)'; upd(); };
  const cards = state.map((it, i) => {
    const holder = h('div', { class: 'rv-img' }, h('span', { class: 'muted small' }, '…'));
    crop(it).then(c => holder.replaceChildren(c)).catch(() => holder.replaceChildren(h('span', { class: 'muted small' }, it.lineText)));
    const inp = h('input', { class: 'input rv-in', value: it.text, spellcheck: true, lang: 'it',
      oninput: () => { it.value = inp.value; card.classList.toggle('changed', it.value !== it.text); upd(); },
      onfocus: () => { it.seen = true; card.classList.add('seen'); upd(); },
      onkeydown: e => {
        if (e.key === 'Enter') { e.preventDefault(); (e.shiftKey ? cards[i - 1] : cards[i + 1])?.querySelector('input').focus(); if (!e.shiftKey && i === cards.length - 1) applyBtn.focus(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = it.text; it.value = it.text; card.classList.remove('changed'); upd(); }
        // Ctrl/⌘+Canc: elimina la parola e passa alla successiva
        if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setRemoved(it, card, true); cards[i + 1]?.querySelector('input').focus(); }
      } });
    const del = h('button', { class: 'btn sm ghost rv-del', type: 'button', onclick: () => setRemoved(it, card, !it.removed) });
    const card = h('div', { class: 'rv-card' }, holder,
      h('div', { class: 'rv-row' }, inp, del, h('span', { class: 'rv-meta muted small', title: 'Pagina e sicurezza della lettura' }, `p. ${it.p} · ${it.conf}%`)));
    setTimeout(() => setRemoved(it, card, false));
    return card;
  });
  const m = modal([
    h('div', { class: 'rv-head' }, h('div', {}, h('h3', {}, 'Revisione rapida'),
      h('div', { class: 'muted small' }, `Solo le ${plural(state.length, 'parola', 'parole')} lette con poca sicurezza. Correggi dove serve e premi Invio per passare alla successiva; Esc rimette la lettura. «Elimina» (o Ctrl+Canc) toglie una parola dal testo estratto.`)),
      h('div', { class: 'rv-tools' }, prog, h('button', { class: 'btn sm ghost rv-del-all', type: 'button', onclick: () => { state.forEach((it, i) => { if (!it.removed && it.value === it.text) setRemoved(it, cards[i], true); }); } }, ic('trash', 15), 'Elimina quelle non corrette'))),
    h('div', { class: 'rv-list' }, cards),
    h('div', { class: 'rv-foot' }, h('label', { class: 'check' }, learnCb, h('span', {}, 'Ricorda le correzioni per le prossime volte', h('div', { class: 'muted small' }, `Lo stesso errore di lettura si correggerà da solo${OcrLearn.count() ? ` (${OcrLearn.count()} già ricordate)` : ''}.`))),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Chiudi'), applyBtn)),
  ], { width: 980 });
  upd();
  setTimeout(() => cards[0]?.querySelector('input').focus(), 60);
  function apply() {
    const fixes = new Map(), pairs = [];
    for (const it of state) {
      if (it.removed) { fixes.set(it.key, ''); continue; }   // eliminata: fuori dal testo (non si impara)
      if (it.value.trim() && it.value !== it.text) { fixes.set(it.key, it.value.trim()); pairs.push([it.text, it.value.trim()]); }
    }
    m.close();
    if (!fixes.size) return;
    if (learnCb.checked) OcrLearn.learn(pairs);
    onApply(fixes);
  }
}

// le pagine da leggere con l'OCR (quelle con testo si saltano; per il Word le scansioni con testo già riconosciuto si rileggono;
// le scansioni con del testo aggiunto dopo si leggono comunque, tenendo solo quello che il PDF non ha già)
const pageMixed = async (doc, p) => { if (typeof PageText === 'undefined') Later.all(); return (await PageText.kind(doc.pdfjs, p)).kind === 'mixed'; };
async function ocrTodo(doc, st, pages, hasText, wordMode) {
  const todo = [], reread = new Set();
  for (const p of pages) {
    if (st.skipText) {
      if (hasText[p - 1] == null) hasText[p - 1] = await pageHasText(doc.pdfjs, p);
      if (hasText[p - 1] && await pageMixed(doc, p)) { todo.push(p); continue; }
      // per il Word, una scansione con testo già riconosciuto viene riletta: impaginazione, grassetti e firme escono molto meglio
      if (hasText[p - 1] && !(wordMode && await FormDetect.pageIsImage(await doc.pdfjs.getPage(p)))) continue;
      if (hasText[p - 1]) reread.add(p);
    }
    todo.push(p);
  }
  return { todo, reread };
}
async function ocrDocument(doc, st, opts) {
  // la sorgente delle pagine: le foto di documenti e le scansioni di libri passano prima dal pre-trattamento (OcrCheck),
  // se il guadagno è chiaro; chi ha già controllato e scelto (startOcr) passa il documento giusto con «checked».
  // Il documento migliorato creato qui si libera alla fine (memoria)
  if (!opts.checked && st.improve !== false && typeof OcrCheck !== 'undefined') {
    const src = await OcrCheck.sourceFor(doc, { progress: opts.progress || (() => {}) });
    if (src !== doc) { try { return await ocrDocumentOn(src, st, { ...opts, hasText: null }); } finally { try { src.pdfjs?.destroy?.(); } catch { } } }
  }
  return ocrDocumentOn(doc, st, opts);
}
async function ocrDocumentOn(doc, st, { wordMode = false, word = false, pages = null, hasText = null, getWorker, parallel = 1, progress = () => {}, cache = null, fixes = null }) {
  const learned = OcrLearn.load();
  const N = doc.numPages, Q = OCR_QUALITY[st.quality];
  pages = pages || Array.from({ length: N }, (_, i) => i + 1);
  hasText = hasText || new Array(N).fill(null);
  const fixLog = [];
  const { todo, reread } = await ocrTodo(doc, st, pages, hasText, wordMode);
  const wordPages = new Map();
  if (!todo.length) {
    if (!word) return { todo, nothing: true };
    // solo conversione in Word: il PDF ha già il testo
    // più pagine insieme: lettura del PDF (nel motore in background) e impaginazione si sovrappongono
    let done = 0;
    await inParallel(pages, parallelSlots(pages.length), async p => { wordPages.set(p, await DocxOut.fromPdfPage(doc.pdfjs, p, { images: st.wordImages })); done++; progress(done / pages.length, `${done} di ${pages.length} pagine convertite in Word`); });
    progress(1, 'creazione del documento Word…');
    const docx = await DocxOut.build(pages.map(p => wordPages.get(p)), { font: st.wordFont, title: doc.base, overlap: st.overlap });
    return { todo, docx, onlyWord: true, fixLog, words: 0, fixed: 0, text: '', improved: doc.improved || [] };
  }
  // più pagine insieme, ognuna con il suo motore (sui computer con più processori); il PDF resta nell'ordine originale
  const P = Math.max(1, Math.min(todo.length, parallel));
  const workers = [], frac = new Array(todo.length).fill(0), phase = new Array(todo.length).fill(''), texts = new Array(todo.length).fill('');
  let doneN = 0;
  const report = label => progress(frac.reduce((a, b) => a + b, 0) / todo.length, label);
  const pdf = await loadLib(doc.bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let words = 0, fixed = 0, next = 0;
  // PDF accessibile (taggato): quando tutte le pagine sono scansioni rilette e il file non aveva una sua struttura,
  // il testo riconosciuto diventa paragrafi taggati e l'immagine della pagina una decorazione
  let tagIt = todo.length === N && (!reread.size || st.clean) && !pdf.catalog.get(PDFLib.PDFName.of('StructTreeRoot'));
  const tagPages = [];
  const slot = async k => {
    for (;;) {
      Busy.check();
      const i = next++; if (i >= todo.length) return;
      const p = todo[i];
      const where = () => P > 1 ? `${doneN} di ${todo.length} pagine pronte` : `${i + 1} di ${todo.length}`;
      let nWords = 0, worker = null;
      // pagina già letta in anticipo (o in lettura): si usa quella, senza rileggerla
      let rec = cache ? await cache.take(p, st) : null;
      if (rec) { report(`pagina ${p} già letta (${where()})`); fixLog.push(...rec.fixLog); }
      else {
        // il motore si avvia mentre la prima pagina viene disegnata
        if (!workers[k]) { workers[k] = getWorker(k); workers[k].catch(() => {}); }
        worker = workers[k].then(w => { w._box.log = m => {
          if (m.status === 'recognizing text') { frac[i] = Math.max(frac[i], phase[i] === 'main' ? 0.15 + 0.8 * (m.progress || 0) : 0.1 * (m.progress || 0)); report(`pagina ${p} — ${phase[i] === 'main' ? Math.round((m.progress || 0) * 100) + '%' : 'analisi orientamento'}  (${where()})`); }
          else if (OCR_STATUS[m.status]) progress(null, OCR_STATUS[m.status]);
        }; return w; });
        report(`pagina ${p} (${where()}) — preparazione immagine`);
        await tick();
        const log = [];
        const got = await ocrRecognizePage(worker, doc.pdfjs, p, { dpi: Q.dpi, twoPass: Q.twoPass, auto: st.auto, fix: st.fix, langs: st.langs, fixLog: log, onPhase: ph => { phase[i] = ph; } });
        rec = { ...got, fixLog: log };
        fixLog.push(...log);
        cache?.put(p, st, rec);
      }
      const { data, straightened } = rec;
      // correzioni della revisione rapida e quelle imparate
      ocrApplyFixes(data, p, { fixes, learned, fixLog });
      // immagini della pagina: quelle appena usate, oppure ricreate identiche (stesso verso e raddrizzamento) se servono
      let { prep, r } = rec;
      if ((word || st.clean) && (!prep.img || !r.canvas || !r.canvas.width)) ({ prep, r } = await ocrRedoImages(doc, p, Q.dpi, st.auto, rec));
      if (straightened) fixed++;
      if (word) {
        progress(null, `pagina ${p} — impaginazione per Word`);
        // la pagina a colori con la stessa rotazione/raddrizzamento dell'OCR (colori del testo, sfondi, immagini)
        const cc = h('canvas', { width: prep.img.w, height: prep.img.h });
        const cx = cc.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cc.width, cc.height);
        cx.setTransform(...prep.M); cx.imageSmoothingQuality = 'high'; cx.drawImage(r.canvas, 0, 0); cx.setTransform(1, 0, 0, 1, 0, 0);
        let rgba = cx.getImageData(0, 0, cc.width, cc.height).data;
        // pagina con le righe incurvate raddrizzate per la lettura: la stessa correzione sulla pagina a colori (ritagli e colori al loro posto)
        if (data.warp) { const id = new ImageData(OCRLayout.warpRGBA(rgba, cc.width, cc.height, data.warp), cc.width, cc.height); cx.putImageData(id, 0, 0); rgba = id.data; }
        // tabelle con la griglia: ogni cella si rilegge da sola (come per Excel); il Word sceglie cella per cella la lettura migliore
        let cellText = null;
        try {
          if (DocxOut.detectTables(prep.img.g, prep.img.w, prep.img.h, r.scale, 150).length) {
            if (!workers[k]) { workers[k] = getWorker(k); workers[k].catch(() => {}); }
            progress(null, `pagina ${p} — lettura delle celle delle tabelle`);
            cellText = await ocrTableCells(await workers[k], prep, r.scale, { langs: st.langs, fix: st.fix, pageWords: data.words || [], only: c => DocxOut.cellNeedsReread(c, data.words || []) });
          }
        } catch (e) { if (e?.cancel) throw e; console.warn('rilettura delle celle', e); }
        const lay = DocxOut.fromOcr(data, prep.img, r.scale, rgba, { images: st.wordImages, cellText });
        lay.classify(p - 1);
        if (lay.images.length) await DocxOut.cropImages(lay.images, cc, r.scale);
        cc.width = cc.height = 0;
        wordPages.set(p, { w: prep.img.w / r.scale, h: prep.img.h / r.scale, lines: lay.lines, images: lay.images, tables: lay.tables });
      }
      texts[i] = (data.text || '').trim();
      // target page: original page, or a cleaned replacement
      let page = pdf.getPage(p - 1), toPage, disp = null, had = [];
      if (st.clean) {
        const pw = prep.img.w / r.scale, ph = prep.img.h / r.scale;
        const jpg = await pdf.embedJpg(await canvasToBytes(prep.canvas, 'image/jpeg', 0.82));
        pdf.removePage(p - 1);
        page = pdf.insertPage(p - 1, [pw, ph]);
        page.drawImage(jpg, { x: 0, y: 0, width: pw, height: ph });
        const T = pageTransform(page);
        toPage = (x, y) => T(x / r.scale, y / r.scale);
      } else {
        // dalle coordinate della lettura alla pagina originale (togliendo anche la correzione della curvatura delle righe)
        const T = pageTransform(page), Mi = OCRPrep.inv(prep.M), Wp = data.warp;
        disp = (x, y) => { if (Wp) [x, y] = OCRLayout.unwarp(Wp, x, y); const [ox, oy] = OCRPrep.apply(Mi, x, y); return [ox / r.scale, oy / r.scale]; };
        toPage = (x, y) => T(...disp(x, y));
        // il testo che il PDF ha già (es. scritto sopra una scansione) non si ripete nello strato invisibile
        // (se si forza la rilettura delle pagine con testo, invece, l'OCR le riscrive: il loro testo può essere illeggibile)
        if (st.skipText) try { const pg = await doc.pdfjs.getPage(p); had = typeof PageText !== 'undefined' ? PageText.boxes(await pg.getTextContent(), pg.getViewport({ scale: 1 })) : []; } catch { }
      }
      const key = page.node.newFontDictionary(font.name, font.ref);
      const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
      // le parole si raccolgono per paragrafo (come li ha trovati la lettura): un paragrafo, un elemento P
      const paraOf = new Map(); (data.paragraphs || []).forEach((pa, k) => (pa.lines || []).forEach(l => paraOf.set(l, k)));
      const groups = []; let gKey = null, gOps = ops;
      if (had.length) tagIt = false;
      for (const [li, line] of (data.lines || []).entries()) {
        const pk = paraOf.has(line) ? 'p' + paraOf.get(line) : 'l' + li;
        if (pk !== gKey) { gKey = pk; gOps = []; groups.push(gOps); }
        const rh = line.rowAttributes?.row_height;
        const size = clamp((rh && rh > 3 ? rh / 0.92 : (line.bbox.y1 - line.bbox.y0) / 1.18) / r.scale, 2, 200);
        const bl = line.baseline;
        // riga verticale (testo ruotato rimasto, es. in una tabella): la parola corre lungo y, nel verso della linea di base
        const vert = bl && Math.abs(bl.y1 - bl.y0) > 2 * Math.abs(bl.x1 - bl.x0), up = vert && bl.y1 < bl.y0;
        const baseAt = (x, w) => (bl && bl.x1 !== bl.x0) ? bl.y0 + (x - bl.x0) * (bl.y1 - bl.y0) / (bl.x1 - bl.x0) : w.bbox.y1 - (w.bbox.y1 - w.bbox.y0) * 0.18;
        const ends = w => {
          if (!vert) return [toPage(w.bbox.x0, baseAt(w.bbox.x0, w)), toPage(w.bbox.x1, baseAt(w.bbox.x1, w))];
          const bx = up ? w.bbox.x1 - (w.bbox.x1 - w.bbox.x0) * 0.18 : w.bbox.x0 + (w.bbox.x1 - w.bbox.x0) * 0.18;
          return up ? [toPage(bx, w.bbox.y1), toPage(bx, w.bbox.y0)] : [toPage(bx, w.bbox.y0), toPage(bx, w.bbox.y1)];
        };
        for (const w of line.words || []) {
          const txt = pdfSafe(font, (w.text || '').trim());
          if (!txt || (w.confidence ?? 100) < 15) continue;
          if (had.length) { const [ax, ay] = disp(w.bbox.x0, w.bbox.y0), [bx, by] = disp(w.bbox.x1, w.bbox.y1); if (PageText.covered(had, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by))) continue; }
          const [u0, u1] = ends(w);
          const len = Math.hypot(u1.x - u0.x, u1.y - u0.y);
          const natural = font.widthOfTextAtSize(txt, size);
          if (natural <= 0 || len <= 0) continue;
          const ang = Math.atan2(u1.y - u0.y, u1.x - u0.x) * 180 / Math.PI;
          gOps.push(setFontAndSize(key, size), setCharacterSqueeze(clamp(100 * len / natural, 10, 500)), rotateAndSkewTextDegreesAndTranslate(ang, 0, 0, u0.x, u0.y), showText(font.encodeText(txt + ' ')));
          nWords++;
        }
      }
      // testo dei riquadri ruotati: ruotato, al suo posto (riletto nel verso giusto); se la lettura non è sicura non si scrive
      for (const g of data.regions || []) {
        if (g.type !== 'rotated' || !g.lines || !g.words) continue;
        const rOps = []; groups.push(rOps);
        for (const w of g.words) {
          const txt = pdfSafe(font, (w.text || '').trim());
          if (!txt) continue;
          const u0 = toPage(w.p0[0], w.p0[1]), u1 = toPage(w.p1[0], w.p1[1]);
          const len = Math.hypot(u1.x - u0.x, u1.y - u0.y), size = clamp(w.size / r.scale, 2, 200), natural = font.widthOfTextAtSize(txt, size);
          if (natural <= 0 || len <= 0) continue;
          const ang = Math.atan2(u1.y - u0.y, u1.x - u0.x) * 180 / Math.PI;
          rOps.push(setFontAndSize(key, size), setCharacterSqueeze(clamp(100 * len / natural, 10, 500)), rotateAndSkewTextDegreesAndTranslate(ang, 0, 0, u0.x, u0.y), showText(font.encodeText(txt + ' ')));
          nWords++;
        }
      }
      // con i tag lo strato si scrive alla fine (quando si sa che tutte le pagine si possono taggare)
      if (!reread.has(p) || st.clean) tagPages.push({ p, page, head: ops, groups, tail: [endText(), popGraphicsState()] }); // le pagine che avevano già il testo non ne ricevono un secondo strato
      if (r.canvas) r.canvas.width = r.canvas.height = 0; prep.release?.();
      words += nWords;
      if (worker) (await worker)._box.log = null;
      frac[i] = 1; doneN++;
      report(`${doneN} di ${todo.length} pagine pronte`);
      await tick();
    }
  };
  await Promise.all(Array.from({ length: P }, (_, k) => slot(k)));
  tagPages.sort((a, b) => a.p - b.p);
  if (tagIt && tagPages.length) {
    try {
      if (typeof TagPdf === 'undefined') await Later.all();
      const root = TagPdf.node('Document'), tstate = TagPdf.state(), C = pdf.context, PO = PDFLib.PDFOperator, PN = PDFLib.PDFName;
      for (const tp of tagPages) {
        // il contenuto originale (la scansione) è una decorazione: il testo vero è quello riconosciuto
        tp.page.node.wrapContentStreams(C.register(C.contentStream([PO.of('BMC', [PN.of('Artifact')])])), C.register(C.contentStream([PO.of('EMC')])));
        const ops = [...tp.head];
        for (const g of tp.groups) { if (!g.length) continue; const n = TagPdf.node('P', root); ops.push(TagPdf.begin(pdf, tp.page, tstate, n), ...g, TagPdf.end()); }
        ops.push(...tp.tail);
        tp.page.node.addContentStream(C.register(C.contentStream(ops))); tp.done = true;
      }
      const LANG = { ita: 'it-IT', eng: 'en', fra: 'fr', deu: 'de', spa: 'es' };
      TagPdf.finish(pdf, root, tstate, { lang: LANG[[...(st.langs || ['ita'])][0]] || 'it-IT', title: doc.base });
    } catch (e) { console.warn('tag OCR', e); tagIt = false; }
  }
  if (!tagIt) for (const tp of tagPages) if (!tp.done) tp.page.pushOperators(...tp.head, ...tp.groups.flat(), ...tp.tail);
  const fullText = todo.map((p, i) => `\n\n===== Pagina ${p} =====\n\n` + texts[i]).join('');
  if (P > 1) fixLog.sort((a, b) => (a.page || 0) - (b.page || 0));
  let docx = null;
  if (word) {
    const rest = pages.filter(p => !wordPages.has(p));
    await inParallel(rest, parallelSlots(rest.length), async p => { progress(null, `pagina ${p} — conversione in Word`); wordPages.set(p, await DocxOut.fromPdfPage(doc.pdfjs, p, { images: st.wordImages })); });
    progress(1, 'creazione del documento Word…');
    docx = await DocxOut.build(pages.map(p => wordPages.get(p)), { font: st.wordFont, title: doc.base, overlap: st.overlap });
  }
  progress(1, 'salvataggio…');
  const bytes = await saveDoc(pdf);
  return { todo, bytes, docx, text: fullText.trim(), words, fixed, fixLog, improved: doc.improved || [] };
}
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OCR_LANGS = [['ita', 'Italiano'], ['eng', 'Inglese'], ['fra', 'Francese'], ['deu', 'Tedesco'], ['spa', 'Spagnolo']];

async function startOcr(stage, files, { wordMode = false } = {}) {
  if (files.length > 1) return startOcrMany(stage, files, { wordMode });
  let file = files[0];
  if (isImage(file)) file = await withBusy('Preparazione dell’immagine…', () => imagesToPdfFile([file], stripExt(file.name) + '.pdf'));
  if (!file) throw new Error('Immagine non leggibile');
  const doc = await withBusy('Apertura del documento…', () => openPdf(file));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages, LANGS = OCR_LANGS;
  const st = { langs: new Set(['ita']), quality: 'acc', range: 'all', rangeText: `1-${N}`, skipText: true, auto: true, clean: false, word: true, wordImages: true, wordFont: 'auto', fix: true, overlap: 'behind', improve: true };
  const QUALITY = OCR_QUALITY;
  const hasText = new Array(N).fill(null);
  const cards = [];
  const grid = h('div', { class: 'cards' });
  for (let p = 1; p <= N; p++) { const c = pageCard(doc, p); c.lbl = c.el.querySelector('.page-label'); cards.push(c); grid.append(c.el); }
  const textInfo = h('div', { class: 'hint' }, 'Analisi delle pagine in corso…'), mixed = [];
  (async () => {
    const gen = GEN;
    for (let p = 1; p <= N; p++) {
      if (gen !== GEN) return;
      try { hasText[p - 1] = await pageHasText(doc.pdfjs, p); } catch { hasText[p - 1] = false; }
      if (hasText[p - 1] && await pageMixed(doc, p).catch(() => false)) mixed.push(p);
      cards[p - 1].lbl.replaceChildren(`Pagina ${p}`, h('div', { class: 'muted small', style: { fontWeight: 600 } }, mixed.includes(p) ? 'scansione + testo aggiunto' : hasText[p - 1] ? 'contiene già testo' : 'immagine / scansione'));
    }
    const t = hasText.filter(Boolean).length - mixed.length, mx = mixed.length ? ` ${plural(mixed.length, 'pagina è una scansione', 'pagine sono scansioni')} con del testo aggiunto dopo: ${mixed.length === 1 ? 'si legge' : 'si leggono'} comunque, senza ripetere il testo che c’è già.` : '';
    textInfo.textContent = (t === 0 && !mixed.length ? 'Nessuna pagina contiene testo: è una scansione, l’OCR la renderà ricercabile.' : t === N ? 'Tutte le pagine contengono già testo selezionabile. Puoi comunque forzare l’OCR togliendo la spunta qui sotto.' : t ? `${plural(t, 'pagina contiene', 'pagine contengono')} già testo e ${t === 1 ? 'verrà saltata' : 'verranno saltate'} (se lasci la spunta).` : '') + mx;
  })();
  /* pre-trattamento: le foto di documenti (sfondo, prospettiva, ombre) passano prima da «Migliora scansioni e foto», le
     scansioni di libri perdono bande nere e pagina accanto. Se il guadagno è chiaro si fa da sé (si può togliere), se è
     dubbio solo un consiglio. L'OCR legge «src»: l'originale o la copia con le pagine migliorate. */
  let src = doc;
  const gen0 = GEN;
  const imp = { check: OcrCheck.analyze(doc, { file: files[0] }).catch(e => { console.warn('controllo delle pagine', e); return null; }), pages: new Set(), held: new Set(), job: null, a: null };
  const improveEl = h('div', { class: 'stack', hidden: true });
  // il documento con le pagine scelte migliorate (una volta per ogni scelta)
  const improvedDoc = () => {
    if (!st.improve || !imp.pages.size) return Promise.resolve(doc);
    const list = [...imp.pages].sort((a, b) => a - b), key = list.join(',');
    if (!imp.job || imp.job.key !== key) imp.job = { key, pr: OcrCheck.improve(doc, list, { plan: OcrCheck.planOf(imp.a) }) };
    return imp.job.pr;
  };
  // cambia il documento letto: le letture anticipate delle pagine che cambiano non valgono più
  function setSource(d) {
    if (d === src) return;
    const was = new Set(src.improved || []), now = new Set(d.improved || []), changed = [...new Set([...was, ...now])].filter(p => was.has(p) !== now.has(p));
    src = d;
    if (!changed.every(p => imp.held.has(p))) cache.clear();
    imp.held.clear();
    spec?.stop(); spec = makeSpec(); specUpdate({ delay: 300 });
  }
  async function ensureSource() {
    await imp.check;
    try { setSource(await improvedDoc()); }
    catch (e) { console.warn('miglioramento non riuscito', e); toast('Miglioramento delle pagine non riuscito: l’OCR legge le pagine originali.', 'error'); imp.pages.clear(); setSource(doc); }
    return src;
  }
  // lettura anticipata: le pagine si leggono mentre si scelgono le opzioni
  const cache = createOcrCache(doc);
  const specEl = h('div', { class: 'spec-note', hidden: true });
  const allPages = Array.from({ length: N }, (_, i) => i + 1);
  const canSpec = typeof Tesseract !== 'undefined' && (!IS_TOUCH || (navigator.deviceMemory || 0) >= 6);
  const makeSpec = () => canSpec ? createOcrSpec(src, cache, {
    // le pagine che aspettano il miglioramento non si leggono in anticipo dall'originale
    pages: async s2 => { await imp.check; return (await ocrTodo(src, s2, allPages, hasText, wordMode)).todo.filter(p => !imp.held.has(p)); },
    onUpdate: () => {
      const { ready, target, active, key } = spec.status();
      // sulle miniature: le pagine già lette
      cards.forEach((c, i) => c.el.classList.toggle('pre-read', !!key && cache.isDone(i + 1, key)));
      specEl.hidden = !target;
      if (!target) return;
      const all = ready >= target;
      specEl.className = 'spec-note' + (all ? ' ok' : '');
      specEl.replaceChildren(all ? ic('check', 14, 2.6) : h('span', { class: 'jp-spin' }),
        h('span', {}, all ? `Pagine già lette in anticipo (${target}): «${wordMode ? 'Converti' : 'Avvia'}» sarà quasi immediato.` : `Lettura anticipata: ${ready} di ${plural(target, 'pagina', 'pagine')} già pronte${active ? '' : ' (in pausa)'}`));
    },
  }) : null;
  let spec = makeSpec();
  onLeave(() => { spec?.stop(); cache.clear(); });
  const specUpdate = (o = {}) => spec?.update(st, o);
  const chips = h('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren(...LANGS.map(([k, l]) => h('button', { class: 'chip' + (st.langs.has(k) ? ' on' : ''), onclick: () => { st.langs.has(k) ? (st.langs.size > 1 && st.langs.delete(k)) : st.langs.add(k); drawChips(); specUpdate(); } }, l)));
  drawChips();
  const rangeIn = h('input', { class: 'input', value: st.rangeText, hidden: true, oninput: () => st.rangeText = rangeIn.value });
  const qHint = h('div', { class: 'muted small' });
  const drawQ = () => qHint.textContent = { fast: 'Per documenti stampati e puliti.', acc: 'Consigliata: corregge ombre, contrasto e pagine storte.', max: 'Per scansioni difficili e foto: se la lettura è incerta prova più versioni dell’immagine e tiene la migliore. Più lenta.' }[st.quality];
  drawQ();
  const fontSel = h('select', { class: 'input', onchange: () => st.wordFont = fontSel.value }, [['auto', 'Come nell’originale (rilevato)'], ...['Times New Roman', 'Arial', 'Calibri', 'Garamond', 'Verdana', 'Courier New'].map(f => [f, f])].map(([v, l]) => h('option', { value: v, selected: v === st.wordFont }, l)));
  const ovSel = h('select', { class: 'input', onchange: () => st.overlap = ovSel.value }, [['behind', 'Dietro al testo (consigliato)'], ['front', 'Davanti al testo'], ['inline', 'Tra un paragrafo e l’altro (mai sovrapposte)']].map(([v, l]) => h('option', { value: v, selected: v === st.overlap }, l)));
  const wordOpts = h('div', { class: 'stack' },
    h('label', { class: 'field' }, 'Carattere', fontSel),
    checkbox('Includi immagini, loghi, firme e timbri', st.wordImages, v => { st.wordImages = v; ovField.hidden = !v; }),
    h('label', { class: 'field' }, 'Firme e timbri sopra al testo', ovSel));
  const ovField = wordOpts.lastChild;
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, `${doc.name} · ${plural(N, 'pagina', 'pagine')}`)), grid), [
    improveEl,
    sec('Lingua del documento', chips, h('div', { class: 'muted small' }, 'Puoi sceglierne più di una se il testo è misto.')),
    sec('Precisione', seg(Object.entries(QUALITY).map(([k, v]) => [k, v.label]), st.quality, v => { st.quality = v; drawQ(); specUpdate(); }), qHint),
    advanced(wordMode ? 'word' : 'ocr', () => [st.fix ? 'testo corretto' : 'senza correzioni', st.auto ? 'pagine raddrizzate' : null, st.range === 'range' ? 'solo un intervallo' : 'tutte le pagine', !wordMode && st.word ? 'anche Word' : null].filter(Boolean).join(' · '),
    sec('Correzioni automatiche',
      checkbox('Correggi il testo letto (italiano)', st.fix, v => { st.fix = v; specUpdate(); }, 'Parole spezzate o attaccate, lettere scambiate o mancanti, accenti e apostrofi sbagliati: con dizionario completo e regole della lingua. Trovi l’elenco delle correzioni alla fine.'),
      checkbox('Raddrizza le pagine storte, ruotate o capovolte', st.auto, v => { st.auto = v; specUpdate(); }),
      checkbox('Salva nel PDF le pagine pulite e raddrizzate', st.clean, v => st.clean = v, 'Utile per foto e scansioni storte: le pagine diventano dritte, con sfondo bianco uniforme.')),
    sec('Pagine', seg([['all', 'Tutte'], ['range', 'Intervallo']], st.range, v => { st.range = v; rangeIn.hidden = v !== 'range'; }), rangeIn,
      checkbox('Salta le pagine che contengono già testo', st.skipText, v => { st.skipText = v; specUpdate({ force: true, delay: 600 }); }, 'Nel documento Word vengono comunque incluse, con il loro testo.')),
    sec('Documento Word',
      wordMode ? null : checkbox('Crea anche il file Word (.docx) modificabile', st.word, v => { st.word = v; wordOpts.hidden = !v; }, 'Paragrafi, titoli centrati, grassetto, sottolineato e rientri ricostruiti come nell’originale.'),
      wordOpts)),
    textInfo,
    h('div', { class: 'hint' }, wordMode
      ? 'Le pagine con testo vengono convertite direttamente; quelle scansionate vengono prima riconosciute con l’OCR. Intestazioni, loghi, firme e timbri diventano immagini separate che puoi spostare, ridimensionare o eliminare in Word.'
      : 'Al PDF viene aggiunto uno strato di testo invisibile perfettamente allineato: potrai cercare, selezionare e copiare. Ottieni anche il testo (.txt) e, se vuoi, il documento Word (.docx) da modificare.'),
  ], [specEl, h('button', { class: 'btn primary big btn-run', onclick: () => run() }, ic(wordMode ? 'textedit' : 'ocr', 18), wordMode ? 'Converti in Word' : 'Avvia OCR')]);
  specUpdate({ delay: 700 });
  // l'esito del controllo: pre-trattamento automatico (con l'opzione per toglierlo) o consiglio
  imp.check.then(a => {
    if (!a || GEN !== gen0) return;
    imp.a = a;
    const pp = list => list.length === N ? (N > 1 ? 'tutte le pagine' : 'la pagina') : `${list.length > 1 ? 'pagine' : 'pagina'} ${list.join(', ')}`;
    const whyOf = list => [...new Set(list.flatMap(p => a.pages[p - 1]?.why || []))].join(', ');
    const autoPhoto = a.pages.filter(x => x.level === 'auto' && x.kind === 'photo').map(x => x.p), autoTrim = a.pages.filter(x => x.level === 'auto' && x.kind === 'trim').map(x => x.p);
    a.auto.forEach(p => { imp.pages.add(p); imp.held.add(p); });
    const status = h('div', { class: 'muted small' });
    const go = () => {
      status.textContent = st.improve && imp.pages.size ? 'Preparazione delle pagine migliorate…' : '';
      ensureSource().then(() => { status.textContent = st.improve && src.improved?.length ? `Pronto: ${pp(src.improved)} ${src.improved.length > 1 ? 'migliorate' : 'migliorata'}.` : ''; drawCmp(); });
    };
    const cmpBtn = h('button', { class: 'btn sm', hidden: true, onclick: () => compareModal(doc.bytes, src.bytes, { title: 'Prima e dopo il miglioramento', labels: ['Originale', 'Migliorata'] }) }, ic('eye', 15), 'Prima e dopo');
    const drawCmp = () => { cmpBtn.hidden = !(st.improve && src.improved?.length); };
    const toMigliora = () => handoff('migliora', [files[0]]);
    const kids = [];
    if (a.auto.length) {
      const label = autoPhoto.length ? 'Migliora la foto prima dell’OCR (ritaglio e luce) — consigliato' : 'Ripulisci i bordi prima dell’OCR (bande nere, pagina accanto) — consigliato';
      const sub = [autoPhoto.length ? `${pp(autoPhoto)[0].toUpperCase() + pp(autoPhoto).slice(1)}: ${whyOf(autoPhoto)}. Si ritaglia il foglio, si raddrizza la prospettiva e si tolgono ombre e colore della carta.` : '',
        autoTrim.length ? `${pp(autoTrim)[0].toUpperCase() + pp(autoTrim).slice(1)}: ${whyOf(autoTrim)}. Si coprono di bianco i bordi scuri e il pezzo di pagina accanto, così il testo tagliato non viene letto.` : ''].filter(Boolean).join(' ');
      kids.push(checkbox(label, st.improve, v => { st.improve = v; go(); }, sub));
    }
    if (a.advise.length) {
      const adv = h('div', { class: 'hint' }, `${pp(a.advise)[0].toUpperCase() + pp(a.advise).slice(1)}: ${whyOf(a.advise)}. Sembra una foto: migliorare la foto prima (ritaglio e luce) può aiutare l’OCR.`,
        h('div', { class: 'row', style: { marginTop: '8px', gap: '6px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm', onclick: e => { e.currentTarget.disabled = true; st.improve = true; a.advise.forEach(p => imp.pages.add(p)); go(); } }, ic('wand', 15), 'Migliora qui'),
          h('button', { class: 'btn sm ghost', onclick: toMigliora }, 'Apri in «Migliora scansioni e foto»')));
      kids.push(adv);
    }
    if (a.pages.some(x => x.m?.curve >= 1.2 && x.m?.book?.any)) kids.push(h('div', { class: 'muted small' }, 'Righe incurvate verso la rilegatura: durante la lettura si prova a raddrizzarle.'));
    if (!kids.length) return;
    kids.push(h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, cmpBtn, a.auto.length ? h('button', { class: 'btn sm ghost', onclick: toMigliora }, 'Regola in «Migliora»') : null), status);
    improveEl.replaceChildren(sec('Prima dell’OCR', ...kids)); improveEl.hidden = false;
    if (a.auto.length) go();
  });

  // correzioni della revisione rapida (si sommano se si rivede più volte)
  const allFixes = new Map();
  async function run(fixes = null) {
    if (fixes) for (const [k, v] of fixes) allFixes.set(k, v);
    let pages;
    try { pages = st.range === 'all' ? Array.from({ length: N }, (_, i) => i + 1) : [...new Set(parseRanges(st.rangeText, N).flat())].sort((a, b) => a - b); }
    catch (e) { return Errors.show(e); }
    const workers = [];
    const stopAll = async () => { const ws = workers.splice(0); for (const w of ws) { try { await w.terminate(); } catch { } } };
    await withBusy('Riconoscimento del testo…', async () => {
      if (imp.pages.size && st.improve && !src.improved) Busy.set(null, 'Miglioramento delle pagine prima dell’OCR…');
      const source = await ensureSource();
      const res = await ocrDocument(source, st, { wordMode, word: st.word, pages, hasText, parallel: batchSlots(pages.length), cache, fixes: allFixes.size ? allFixes : null, checked: true,
        getWorker: async () => { Busy.set(null, 'Caricamento del motore OCR…'); const w = await makeOcrWorker(st.langs, OCR_QUALITY[st.quality].dpi); workers.push(w); return w; },
        progress: (f, label) => Busy.set(f, label ? label.charAt(0).toUpperCase() + label.slice(1) : null) });
      if (res.nothing) throw new Error('Tutte le pagine scelte contengono già testo: togli la spunta “Salta le pagine…” per forzare l’OCR.');
      if (res.onlyWord) {
        showResult([{ name: `${doc.base}.docx`, bytes: res.docx, type: DOCX_TYPE, info: `Documento Word modificabile · ${plural(pages.length, 'pagina', 'pagine')}` }],
          { title: 'Conversione in Word completata', primary: 0, note: 'Il PDF conteneva già il testo: è stato convertito direttamente in Word, senza OCR.' });
        return;
      }
      await stopAll();
      const { bytes, docx, text: fullText, words, fixed, fixLog, todo } = res;
      const ta = h('textarea', { class: 'input ocr-text', readonly: true }, fullText || '(nessun testo riconosciuto)');
      // revisione rapida: le parole incerte (escluse quelle già corrette a mano)
      const unc = (await ocrUncertain(cache, st, todo)).filter(x => !allFixes.has(x.key));
      const manual = fixLog.filter(x => x.manual).length, learnedN = fixLog.filter(x => x.learned).length;
      const reviewEl = unc.length ? h('div', { class: 'rv-cta' }, ic('eye', 18),
        h('div', { class: 'grow' }, h('b', {}, `${plural(unc.length, 'parola incerta', 'parole incerte')}`), h('div', { class: 'muted small' }, 'Controllale in un minuto: vedi il pezzo di pagina accanto alla parola letta.')),
        h('button', { class: 'btn sm primary rv-open', onclick: () => openOcrReview({ doc: source, st, cache, items: unc, onApply: fx => { closeAllModals(); run(fx); } }) }, 'Rivedi')) : null;
      showResult([
        { name: `${doc.base}-ocr.pdf`, bytes, info: `${plural(todo.length, 'pagina riconosciuta', 'pagine riconosciute')}, ${words.toLocaleString('it-IT')} parole` },
        ...(docx ? [{ name: `${doc.base}.docx`, bytes: docx, type: DOCX_TYPE, info: 'Documento Word modificabile' }] : []),
        { name: `${doc.base}-testo.txt`, bytes: new TextEncoder().encode(fullText), type: 'text/plain;charset=utf-8' },
      ], {
        title: wordMode ? 'Conversione in Word completata' : 'OCR completato', primary: wordMode && docx ? 1 : 0, zipName: `${doc.base}-ocr.zip`,
        note: [source.photos?.length ? `Ho migliorato la foto prima del riconoscimento (ritaglio del foglio, prospettiva e luce): ${plural(source.photos.length, 'pagina', 'pagine')}.` : '',
          source.trimmed?.length ? `Bordi ripuliti prima del riconoscimento (bande nere, pagina accanto): ${plural(source.trimmed.length, 'pagina', 'pagine')}.` : '',
          fixed ? `${plural(fixed, 'pagina raddrizzata', 'pagine raddrizzate')} automaticamente prima del riconoscimento.` : '',
          fixLog.length - manual - learnedN ? `${plural(fixLog.length - manual - learnedN, 'correzione automatica', 'correzioni automatiche')} del testo.` : '',
          manual ? `${plural(manual, 'correzione tua applicata', 'correzioni tue applicate')}.` : '', learnedN ? `${plural(learnedN, 'errore di lettura già corretto', 'errori di lettura già corretti')} con le correzioni ricordate.` : '',
          docx?.stats?.tables ? `${plural(docx.stats.tables, 'tabella ricostruita', 'tabelle ricostruite')} nel Word.` : ''].filter(Boolean).join(' ') || null,
        extra: h('div', {}, reviewEl,
          fixLog.length ? h('details', { class: 'sec fixlog' }, h('summary', { class: 'sec-t' }, `Correzioni automatiche (${fixLog.length})`),
            h('div', { class: 'fixlist' }, fixLog.slice(0, 400).map(c => h('div', { class: 'fixrow' }, h('span', { class: 'muted small' }, `p. ${c.page}`), h('s', {}, c.from), ic('arrow', 12), h('b', {}, c.to))))) : null,
          h('div', { class: 'sec', style: { marginBottom: '14px' } }, h('div', { class: 'row' }, h('div', { class: 'sec-t grow' }, 'Testo riconosciuto'),
            h('button', { class: 'btn sm', onclick: () => copyText(fullText, ta) }, ic('copy', 15), 'Copia')), ta)),
      });
    }, { cancellable: true, onCancel: () => { workers.forEach(w => { try { w.terminate(); } catch { } }); } });
    await stopAll();
  }
}

/* più file insieme: ognuno resta un documento a sé (un PDF leggibile per file), elaborati in parallelo */
function uniqueNames(list) {
  const seen = new Map();
  return list.map(n => { const k = n.toLowerCase(); const c = seen.get(k) || 0; seen.set(k, c + 1); return c ? n.replace(/(\.[^.]+)$/, ` (${c + 1})$1`) : n; });
}

/* ----------------------------- PIÙ FILE INSIEME: ognuno resta separato ------------------------------ */
// una riga dell'elenco, con la sua barra di avanzamento e il suo stato
function batchRow(name, sub, thumb) {
  const stEl = h('span', { class: 'muted small fr-st' }, 'In attesa'), bar = h('i');
  const subEl = h('div', { class: 'muted small fr-sub' }, sub || '');
  const el = h('div', { class: 'filerow' },
    h('div', { class: 'fr-thumb' }, thumb || ic('file', 22)),
    h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, name), subEl, h('div', { class: 'fr-prog' }, bar)), stEl);
  const r = { name, el, stEl, subEl, bar, f: 0,
    reset() { r.f = 0; bar.style.width = '0%'; stEl.textContent = 'In attesa'; el.classList.remove('done', 'err', 'busy'); },
    start(label = 'In corso…') { r.f = 0; bar.style.width = '0%'; el.classList.remove('done', 'err'); el.classList.add('busy'); stEl.textContent = label; },
    prog(f, label) { if (f != null) { r.f = Math.min(0.99, Math.max(r.f, f)); bar.style.width = Math.round(r.f * 100) + '%'; } if (label) stEl.textContent = label.charAt(0).toUpperCase() + label.slice(1); },
    done(label = 'Fatto') { r.f = 1; bar.style.width = '100%'; el.classList.remove('busy'); el.classList.add('done'); stEl.textContent = label; },
    fail(label = 'Errore') { r.f = 1; el.classList.remove('busy'); el.classList.add('err'); stEl.textContent = label; },
  };
  return r;
}
const batchThumb = d => lazyThumb(d.pdfjs, 1, h('canvas'), 40, 52);
// quanti file insieme: dipende dai processori (sul telefono uno alla volta, per la memoria)
const batchSlots = (n, heavy = true) => { if (heavy) return parallelSlots(n); const cores = navigator.hardwareConcurrency || 4; return Math.max(1, Math.min(n, IS_TOUCH ? 1 : Math.min(4, Math.max(2, cores >> 1)))); };
// elabora i file in K gruppi paralleli; un errore su un file non ferma gli altri
async function batchPool(rows, K, job) {
  const results = new Array(rows.length).fill(null), errors = [];
  const update = () => {
    const done = rows.filter(r => r.el.classList.contains('done') || r.el.classList.contains('err')).length;
    const doing = rows.filter(r => r.el.classList.contains('busy'));
    Busy.set(rows.reduce((t, r) => t + r.f, 0) / rows.length, `${done} di ${rows.length} completati${doing.length ? ' · in corso: ' + doing.map(r => r.name).join(', ') : ''}`);
  };
  let next = 0;
  const slot = async () => {
    const ctx = {};
    try {
      for (;;) {
        Busy.check();
        const i = next++; if (i >= rows.length) break;
        const r = rows[i]; r.start(); update();
        try {
          results[i] = await job(i, r, ctx, (f, label) => { r.prog(f, label); update(); });
          if (r.el.classList.contains('busy')) r.done();
        } catch (e) {
          if (e?.cancel || Busy.cancelled) throw e;
          console.error(e); errors.push(`${r.name}: ${e.message || e}`); r.fail();
        }
        update();
        await tick();
      }
    } finally { try { await ctx.cleanup?.(); } catch { } }
  };
  await Promise.all(Array.from({ length: K }, slot));
  return { results, errors };
}
function batchMain(rows, title) {
  return h('div', { class: 'ws-main' },
    h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, title)),
    h('div', { class: 'filelist' }, rows.map(r => r.el)));
}
// apre i PDF (e le foto, ognuna come PDF a sé); i file illeggibili vengono segnalati e saltati
async function batchOpenPdfs(files) {
  const docs = [];
  await withBusy('Apertura dei file…', async () => {
    for (const [i, f0] of files.entries()) {
      Busy.set(i / files.length, f0.name);
      try {
        const f = isImage(f0) ? await imagesToPdfFile([f0], stripExt(f0.name) + '.pdf') : f0;
        const d = await openPdf(f);
        if (d) docs.push(d); else toast(`${f0.name}: impossibile aprire il file`, 'error');
      } catch (e) { toast(`${f0.name}: ${e.message}`, 'error'); }
    }
  });
  if (!docs.length) throw new Error('Nessun file leggibile');
  return docs;
}
const batchNote = (n, errors, extra = []) => [`${plural(n, 'file pronto', 'file pronti')}, ognuno separato: scaricali uno per uno o tutti insieme.`, ...extra, errors.length ? `Non elaborati: ${errors.join('; ')}.` : ''].filter(Boolean).join(' ');

async function startOcrMany(stage, files, { wordMode = false } = {}) {
  const docs = await batchOpenPdfs(files);
  if (docs.length === 1) return startOcr(stage, [docs[0].file], { wordMode });
  const st = { langs: new Set(['ita']), quality: 'acc', skipText: true, auto: true, clean: false, word: wordMode, wordImages: true, wordFont: 'auto', fix: true, overlap: 'behind', improve: true };
  const rows = docs.map(d => batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)));
  const chips = h('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren(...OCR_LANGS.map(([k, l]) => h('button', { class: 'chip' + (st.langs.has(k) ? ' on' : ''), onclick: () => { st.langs.has(k) ? (st.langs.size > 1 && st.langs.delete(k)) : st.langs.add(k); drawChips(); } }, l)));
  drawChips();
  const totalPages = docs.reduce((t, d) => t + d.numPages, 0);
  workspace(stage, batchMain(rows, `${plural(docs.length, 'file', 'file')} · ${plural(totalPages, 'pagina', 'pagine')} in totale`), [
    h('div', { class: 'hint ok' }, wordMode ? 'Ogni file diventa un documento Word separato: li scarichi uno per uno o tutti insieme in uno ZIP.' : 'Ogni file resta separato: ottieni un PDF ricercabile per ciascuno, da scaricare uno per uno o tutti insieme in uno ZIP. Per farne un unico documento usa «Unisci PDF».'),
    sec('Lingua dei documenti', chips),
    sec('Precisione', seg(Object.entries(OCR_QUALITY).map(([k, v]) => [k, v.label]), st.quality, v => { st.quality = v; })),
    advanced(wordMode ? 'word-n' : 'ocr-n', () => [st.fix ? 'testo corretto' : 'senza correzioni', st.improve ? 'foto migliorate' : null, !wordMode && st.word ? 'anche Word' : null].filter(Boolean).join(' · '),
    sec('Correzioni automatiche',
      checkbox('Correggi il testo letto (italiano)', st.fix, v => st.fix = v),
      checkbox('Raddrizza le pagine storte, ruotate o capovolte', st.auto, v => st.auto = v),
      checkbox('Migliora foto e scansioni prima dell’OCR, se serve', st.improve, v => st.improve = v, 'Foto ritagliate e schiarite, bande nere e pagina accanto coperte di bianco: nei file ottenuti ci sono le pagine migliorate.'),
      checkbox('Salva nel PDF le pagine pulite e raddrizzate', st.clean, v => st.clean = v)),
    sec('Pagine', checkbox('Salta le pagine che contengono già testo', st.skipText, v => st.skipText = v)),
    wordMode ? null : sec('Documento Word', checkbox('Crea anche un file Word (.docx) per ogni documento', st.word, v => st.word = v))),
  ].filter(Boolean), [h('button', { class: 'btn primary big btn-run', onclick: run }, ic(wordMode ? 'textedit' : 'ocr', 18), wordMode ? `Converti ${docs.length} file in Word` : `Avvia OCR su ${docs.length} file`)]);

  async function run() {
    const workers = [];
    rows.forEach(r => r.reset());
    await withBusy('Riconoscimento del testo…', async () => {
      // ogni gruppo parallelo ha il suo motore OCR
      // i processori si dividono tra i file aperti insieme; dentro ogni file più pagine alla volta
      const S = parallelSlots(), K = batchSlots(docs.length), perDoc = Math.max(1, Math.floor(S / K));
      const { results, errors } = await batchPool(rows, K, async (i, r, ctx, prog) => {
        const res = await ocrDocument(docs[i], st, { wordMode, word: st.word, parallel: perDoc,
          getWorker: k => {
            ctx.w ||= [];
            if (!ctx.w[k]) {
              prog(null, 'Avvio del motore OCR…');
              ctx.w[k] = makeOcrWorker(st.langs, OCR_QUALITY[st.quality].dpi).then(w => { workers.push(w); return w; });
              ctx.cleanup = async () => { for (const wp of ctx.w) { try { (await wp).terminate(); } catch { } } };
            }
            return ctx.w[k];
          }, progress: prog });
        r.done(res.nothing ? 'Aveva già il testo' : 'Fatto');
        return res;
      });
      const outs = [];
      results.forEach((res, i) => {
        if (!res) return;
        const d = docs[i];
        if (res.nothing) { outs.push({ name: `${d.base}.pdf`, bytes: d.bytes, info: 'conteneva già il testo: lasciato invariato' }); return; }
        if (!wordMode && res.bytes) outs.push({ name: `${d.base}-ocr.pdf`, bytes: res.bytes, info: res.onlyWord ? '' : `${plural(res.todo.length, 'pagina riconosciuta', 'pagine riconosciute')}, ${res.words.toLocaleString('it-IT')} parole` });
        if (res.docx) outs.push({ name: `${d.base}.docx`, bytes: res.docx, type: DOCX_TYPE, info: 'Documento Word modificabile' });
      });
      if (!outs.length) throw new Error(errors[0] || 'Nessun file elaborato');
      uniqueNames(outs.map(o => o.name)).forEach((n, i) => outs[i].name = n);
      const fixedTot = results.reduce((t, r) => t + (r?.fixed || 0), 0), impTot = results.reduce((t, r) => t + (r?.improved?.length || 0), 0);
      showResult(outs, {
        title: wordMode ? 'Conversione in Word completata' : 'OCR completato', zipName: wordMode ? 'documenti-word.zip' : 'pdf-ricercabili.zip',
        // le pagine sostituite dal pre-trattamento (foto ritagliate e schiarite, bordi scuri coperti di bianco): va detto
        note: batchNote(outs.length, errors, [impTot ? `${plural(impTot, 'pagina migliorata', 'pagine migliorate')} prima del riconoscimento (foto ritagliate e schiarite, bordi scuri e pagina accanto coperti di bianco): nei file ottenuti ci sono le pagine migliorate.` : '',
          fixedTot ? `${plural(fixedTot, 'pagina raddrizzata', 'pagine raddrizzate')} automaticamente.` : '']),
      });
    }, { cancellable: true, onCancel: () => { workers.forEach(w => { try { w.terminate(); } catch { } }); } });
  }
}

/* ----------------------------- OSCURA (rettangoli dei caratteri, usati anche da Moduli) ------------------------------ */
function itemCharBox(it, k0, k1, vp) {
  const [a, b, c, d, e, f] = it.transform;
  const len = it.str.length || 1;
  const n = Math.hypot(a, b) || 1;
  const ux = a / n, uy = b / n, vx = -uy, vy = ux;
  const fh = Math.hypot(c, d) || it.height || 10;
  const offs = charOffsets(it, it._fam);
  const s0 = it.width * (offs[k0] ?? k0 / len), s1 = it.width * (offs[k1] ?? k1 / len);
  const pts = [];
  for (const s of [s0, s1]) for (const t of [-0.28 * fh, 0.95 * fh]) {
    const [x, y] = vp.convertToViewportPoint(e + ux * s + vx * t, f + uy * s + vy * t);
    pts.push([x, y]);
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pad = 1.5;
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
}

/* =====================================================================
   PiiKit — riconosce i dati personali in un testo (italiano): codici fiscali
   (con il carattere di controllo), partite IVA, IBAN (mod 97), email, telefoni,
   indirizzi, date e luoghi di nascita, documenti d'identità, nomi e cognomi.
   I nomi si trovano in tre modi: dal codice fiscale presente nel documento (le
   consonanti di nome e cognome), dal contesto (Sig., Dott., «il sottoscritto»,
   «Cognome:»…) e da un elenco di nomi propri italiani accanto a un cognome.
   Funzioni pure: detect(text, ctx) → [{ cat, start, end, text, sure }].
   ===================================================================== */
const PiiKit = (() => {
  const CATS = {
    nome: 'Nomi e cognomi', cf: 'Codici fiscali', piva: 'Partite IVA', iban: 'IBAN', email: 'Email', tel: 'Telefoni',
    indirizzo: 'Indirizzi', nascita: 'Nascita (data e luogo)', doc: 'Documenti d’identità', targa: 'Targhe',
    carta: 'Carte di pagamento e conti', sanita: 'Dati sanitari', giudiziari: 'Dati giudiziari', particolari: 'Dati particolari (religione, politica, sindacato, origine, vita sessuale)',
    web: 'Indirizzi IP e siti personali', utenza: 'Utenze e codici cliente', importo: 'Importi in denaro', data: 'Altre date', segno: 'Firme, timbri e codici QR',
  };
  const ORDER = ['email', 'iban', 'carta', 'cf', 'piva', 'tel', 'doc', 'targa', 'utenza', 'web', 'nascita', 'indirizzo', 'nome', 'sanita', 'giudiziari', 'particolari', 'segno', 'importo', 'data'];
  // potenzialmente sensibili: si mostrano, ma da scegliere (non oscurati in automatico)
  const SOFT = new Set(['importo', 'data']);

  /* —— codice fiscale —— */
  const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
  const EVEN = c => /\d/.test(c) ? +c : c.charCodeAt(0) - 65;
  function cfValid(cf) {
    cf = cf.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    let s = 0;
    for (let i = 0; i < 15; i++) s += i % 2 === 0 ? ODD[cf[i]] : EVEN(cf[i]);
    return String.fromCharCode(65 + (s % 26)) === cf[15];
  }
  const CF_LOOSE = new RegExp('(?<![A-Z0-9])' + ['[A-Z]', '[A-Z]', '[A-Z]', '[A-Z]', '[A-Z]', '[A-Z]', '[0-9LMNPQRSTUV]', '[0-9LMNPQRSTUV]', '[ABCDEHLMPRST]', '[0-9LMNPQRSTUV]', '[0-9LMNPQRSTUV]', '[A-Z]', '[0-9LMNPQRSTUV]', '[0-9LMNPQRSTUV]', '[0-9LMNPQRSTUV]', '[A-Z]'].join('[ _.|\\-]{0,6}') + '(?![A-Z0-9])', 'gi');
  const V = /[AEIOU]/, CONS = s => s.replace(/[^B-DF-HJ-NP-TV-Z]/g, ''), VOW = s => s.replace(/[^AEIOU]/g, '');
  const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  function codeSurname(s) { s = plain(s); return (CONS(s) + VOW(s) + 'XXX').slice(0, 3); }
  function codeName(s) { s = plain(s); const c = CONS(s); if (c.length >= 4) return c[0] + c[2] + c[3]; return (c + VOW(s) + 'XXX').slice(0, 3); }

  /* —— partita IVA (cifra di controllo) —— */
  function pivaValid(p) {
    p = p.replace(/\D/g, ''); if (p.length !== 11 || /^0{11}$/.test(p)) return false;
    let s = 0;
    for (let i = 0; i < 11; i++) { let d = +p[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } s += d; }
    return s % 10 === 0;
  }
  /* —— IBAN (mod 97, lunghezza per paese) —— */
  const IBAN_LEN = { IT: 27, SM: 27, VA: 22, DE: 22, FR: 27, ES: 24, GB: 22, CH: 21, AT: 20, BE: 16, NL: 18, PT: 25, LU: 20, IE: 22, MT: 31, GR: 27, PL: 28, RO: 24, HR: 21, SI: 19, MC: 27, LI: 21 };
  function ibanValid(s) {
    s = s.replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (IBAN_LEN[s.slice(0, 2)] && IBAN_LEN[s.slice(0, 2)] !== s.length) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let m = 0;
    for (const ch of r) { const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of v) m = (m * 10 + +d) % 97; }
    return m === 1;
  }

  /* —— nomi propri italiani più comuni (per riconoscere «Mario Rossi», «ROSSI MARIO») —— */
  const NAMES = new Set(('abele achille ada adele adelaide adriana adriano agata agnese agostino alba alberto alda aldo alessandra alessandro alessia alessio alfonso alfredo alice alida allegra amalia amedeo amelia anastasia andrea angela angelica angelo anita anna annalisa annamaria antonella antonietta antonino antonio arianna armando arturo assunta aurelio aurora barbara bartolomeo beatrice benedetta benedetto beniamino bernardo bianca bruna bruno calogero camilla carla carlo carlotta carmela carmelo carmen carolina caterina cecilia celeste cesare chiara cinzia clara claudia claudio clelia concetta corrado cosimo costanza cristian cristiana cristina cristiano damiano daniela daniele dante dario davide debora denis denise diana diego dino domenico donatella donato dora edoardo elena eleonora elia elisa elisabetta elvira emanuela emanuele emilia emiliano emilio emma enrico enza enzo ermanno ernesto erika ester ettore eugenio eva evelina fabiana fabio fabrizio federica federico felice fernanda fernando filippo fiorella flavia flavio francesca francesco franco gabriele gabriella gaetano gaia gerardo giacomo giada gianfranco giancarlo gianluca gianluigi gianna gianni gilberto gina gino giorgia giorgio giovanna giovanni gisella giulia giuliana giuliano giulio giuseppa giuseppe giuseppina gloria grazia graziella gregorio guglielmo guido ida ignazio ilaria ines ingrid irene iris isabella italo ivan ivana ivano jacopo laura lazzaro lea leonardo letizia lia liliana lino lisa livia lorella lorena lorenzo loredana luana luca lucia luciana luciano lucio luigi luigia luisa maddalena manuel manuela mara marcella marcello marco margherita maria mariagrazia mariangela marianna mariano marika marilena marina marino mario marisa marta martina massimiliano massimo matilde matteo mattia maurizio mauro melissa michela michele milena mirco mirella miriam monica nadia natale natalia nazzareno nicola nicoletta nicolò nicolo nino noemi norma olga oliviero orazio ornella osvaldo ottavio paola paolo pasquale patrizia patrizio pierluigi piero pietro pina pino raffaela raffaele raffaella rebecca renata renato riccardo rita roberta roberto rocco romano rosa rosalba rosalia rosanna rosaria rosario rossana rossella ruggero sabrina salvatore samuele sandra sandro santa santo sara saverio sebastiano serena sergio silvana silvano silvia silvio simona simone sofia sonia stefania stefano susanna tania teresa tiziana tiziano tommaso tullio ugo umberto valentina valentino valeria valerio vanessa vanna veronica vincenza vincenzo viola virginia vito vittoria vittorio walter zaira').split(' '));
  // parole che sembrano nomi ma sono etichette, titoli o parole comuni dei documenti
  const STOP = new Set(('ministero ministeri tribunale corte procura prefettura questura regione regioni agenzia ufficio uffici direzione dipartimento servizio servizi settore ente enti azienda aziende società repubblica stato consiglio giunta presidente presidenza segretario segreteria dirigente responsabile assessorato distretto ambito istituto università scuola camera senato governo decreto legge articolo art allegato contratto cognome nome nomi data luogo nascita codice fiscale partita iva via viale piazza corso residente residenza nato nata comune provincia indirizzo telefono email sesso firma il la lo le gli i di da del della dei delle a al alla e ed o in con per su tra fra se che non anno anni mese giorno spett spettabile oggetto totale importo euro pagina allegato sede sig sig.ra dott avv ing geom rag prof gentile egregio egr cliente fornitore studio società srl spa snc sas srls s.r.l s.p.a ditta ufficio comunicazione richiesta dichiarazione modulo domanda servizio stato repubblica italiana italia regione città tel fax cell pec iban cap n. nr num numero cf c.f p.iva ai sensi art articolo legge decreto dpr dlgs gdpr privacy consenso dati trattamento informativa saldo acconto fattura ricevuta documento carta identità patente passaporto rilasciato scadenza valido esente imposta imu tari tasi irpef inps inail agenzia entrate banca conto corrente intestatario beneficiario causale bonifico versamento rata scadenze dicembre gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre lunedì martedì mercoledì giovedì venerdì sabato domenica').split(' '));
  const isCap = w => !/\d/.test(w) && /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’]+$/.test(w) || /^[A-ZÀ-ÖØ-Ý]{2,}$/.test(w) || /^[A-ZÀ-ÖØ-Ý]['’][A-ZÀ-ÖØ-Ýa-zà-öø-ÿ]+$/.test(w);
  const bare = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, '');
  const PARTICLE = /^(de|di|del|della|dello|dei|degli|da|dal|la|lo|le|van|von|mac|mc|d['’]|De|Di|Del|Della|Dello|Dei|Da|Dal|La|Lo|Le|D['’])$/;

  /* parole della riga con le loro posizioni (non attraversa gli a capo) */
  function tokens(text) {
    const out = [], re = /[\p{L}\p{N}'’.]+/gu; let m;
    while ((m = re.exec(text))) { const raw = m[0]; const b = bare(raw); if (!b) continue; const off = raw.indexOf(b[0]); out.push({ t: b, s: m.index + off, e: m.index + off + b.length }); }
    // un token e il successivo sono «vicini» se fra loro c'è solo spazio orizzontale
    for (let i = 0; i < out.length - 1; i++) out[i].near = /^[ \t\u00A0]{1,3}$/.test(text.slice(out[i].e, out[i + 1].s));
    return out;
  }

  /* trova tutto in un testo; ctx: { cfs: [codici fiscali validi del documento], names: Set di parole già riconosciute come nomi } */
  function detect(text, ctx = {}) {
    const found = [];
    const add = (cat, s, e, sure = true) => { if (e > s) found.push({ cat, start: s, end: e, text: text.slice(s, e), sure }); };
    const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } fn(m); } };
    // email
    each(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.?/gu, m => add('email', m.index, m.index + m[0].length, /\.[\p{L}]{2,}$/u.test(m[0])));   // anche se l'OCR ha perso la parte finale
    // IBAN (anche a gruppi separati da spazi); si prova la lunghezza giusta per il paese
    each(/(?:\b|(?<=[0-9|]))[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}/g, m => {   // (anche con un segno spurio attaccato davanti, come lo legge l'OCR)
      const raw = m[0];
      for (let L = raw.length; L >= 14; L--) {
        const cand = raw.slice(0, L); if (/\s$/.test(cand)) continue;
        if (ibanValid(cand)) { add('iban', m.index, m.index + L); return; }
      }
      // letto da una scansione: lettere e cifre scambiate dall'OCR nella parte numerica (O/0, I/1, S/5, B/8, Z/2, G/6)
      // e l'IBAN italiano (27 caratteri, CIN lettera): valido solo se il controllo matematico torna dopo la correzione
      const fixd = s => s.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2').replace(/G/g, '6');
      const comp = raw.replace(/\s/g, '');
      if (/^IT/.test(comp) && comp.length >= 27) {
        const c = comp.slice(0, 27), fixed = 'IT' + fixd(c.slice(2, 4)) + c[4].replace(/0/, 'O').replace(/1/, 'I').replace(/5/, 'S').replace(/8/, 'B') + fixd(c.slice(5));
        if (ibanValid(fixed)) { let n = 0, e = m.index; while (e < m.index + raw.length && n < 27) { if (!/\s/.test(text[e])) n++; e++; } add('iban', m.index, e, true); return; }
      }
    });
    // codice fiscale (anche con spazi fra i caratteri, come nelle caselle dei moduli)
    const CFS = '[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]';
    each(/(?<![A-Z0-9])[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z](?![A-Z0-9])/gi, m => add('cf', m.index, m.index + m[0].length, cfValid(m[0])));
    each(/(?<![A-Z0-9])(?:[A-Z][ ]){5}[A-Z](?:[ ][0-9LMNPQRSTUV]){2}[ ][ABCDEHLMPRST](?:[ ][0-9LMNPQRSTUV]){2}[ ][A-Z](?:[ ][0-9LMNPQRSTUV]){3}[ ][A-Z](?![A-Z0-9])/gi, m => { if (new RegExp('^' + CFS + '$', 'i').test(m[0].replace(/ /g, ''))) add('cf', m.index, m.index + m[0].length, cfValid(m[0])); });
    // codice fiscale a gruppi irregolari (caselle dei moduli: «CCCGN N 7 3E 2…»): valido solo se torna la cifra di controllo
    each(CF_LOOSE, m => { const c = m[0].replace(/[^A-Z0-9]/gi, ''); if (/[^A-Z0-9]/i.test(m[0]) && cfValid(c)) add('cf', m.index, m.index + m[0].length, true); });
    // partita IVA: con la cifra di controllo, oppure dopo «P.IVA», «partita IVA», «VAT», «C.F.»
    each(/(?<![\d.,])(?:IT[ ]?)?\d{11}(?!\d|[.,]\d)/g, m => {
      const ctx0 = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
      const kw = /(p\.?\s?iva|partita\s+iva|vat|c\.?\s?f\.?|codice\s+fiscale|cod\.?\s*fisc)/.test(ctx0);
      if (pivaValid(m[0]) || kw) add('piva', m.index, m.index + m[0].length, pivaValid(m[0]));
    });
    // telefoni (italiani e internazionali), non date, non importi, non codici lunghi
    each(/(?<![\w.,/+-])(?:(?:\+|00)\s?39[\s.-]?)?(?:3\d{2}|0\d{1,4})(?:[\s./-]?\d){5,8}(?![\w/]|[.,]\d)|(?<![\w.,/])\+\d{1,3}(?:[\s.-]?\d){7,13}(?![\w/]|[.,]\d)/g, m => {
      const s = m[0], digits = s.replace(/\D/g, '').replace(/^(00)?39(?=[03]\d{5,})/, '');
      if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s.trim())) return;
      const ctx0 = text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
      const kw = /(tel|cell|telefono|fax|mobile|cellulare|recapito|contatto|whatsapp|☎|📞)/.test(ctx0);
      const mobile = /^3\d{8,9}$/.test(digits), land = /^0\d{5,10}$/.test(digits), intl = /^\+/.test(s.trim());
      if (/^\d{11}$/.test(digits) && pivaValid(digits) && !kw) return;      // è una partita IVA
      if (!kw && /(n\.|nr\.?|n°|num\.?|numero|prot\.?|protocollo|fattura|pratica|rif\.?|riferimento|codice|cod\.|matricola|ordine|cig|cup|pos\.?)\s*:?\s*$/.test(ctx0)) return;   // un numero di documento
      if (mobile || (land && (kw || /[\s./-]/.test(s.trim()) || digits.length >= 9)) || (intl && digits.length >= 8)) add('tel', m.index, m.index + s.length, mobile || kw || intl);
    });
    // documenti d'identità (carta d'identità elettronica e cartacea, passaporto, patente) solo vicino alle parole chiave
    each(/\b(?:[A-Z]{2}\d{5}[A-Z]{2}|[A-Z]{2}\d{7}|[A-Z]{1,2}\d{6,8}[A-Z]?)\b/g, m => {
      const ctx0 = text.slice(Math.max(0, m.index - 60), m.index).toLowerCase();
      if (/(carta\s+d['’]?identit|c\.?\s?i\.?\b|documento|passaporto|patente|n\.\s*doc)/.test(ctx0)) add('doc', m.index, m.index + m[0].length);
    });
    // targhe dei veicoli, vicino a «targa»/«targato»
    // (o da sola sulla sua riga in una pagina con pochissimo testo: la targa fotografata di un'auto, un cartello)
    const fewText = text.replace(/\s/g, '').length < 300;
    each(/\b[A-Z]{2}[ ]?\d{3}[ ]?[A-Z]{2}\b/g, m => { const ls = text.lastIndexOf('\n', m.index) + 1, le = (text.indexOf('\n', m.index) + 1 || text.length + 1) - 1, alone = text.slice(ls, le).trim() === m[0];
      if (/targ/.test(text.slice(Math.max(0, m.index - 30), m.index).toLowerCase()) || (alone && fewText)) add('targa', m.index, m.index + m[0].length); });
    // nascita: «nato/a a Città (PR) il 01/02/1980», «data di nascita: …», «luogo di nascita: …»
    const DATE = '\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{1,2}°?\\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\\s+\\d{4}';
    const CITY = "[A-ZÀ-Ü][\\p{L}'’]+(?:[ -](?:[A-ZÀ-Ü][\\p{L}'’]+|di|de|del|della|sul|sull['’]|in|al))*(?:\\s*\\(\\s*[A-Z]{2}\\s*\\))?";
    each(new RegExp(`\\bnat[oaie](?:\\/[oaie])?\\s+(?:(?:a|ad|in)[\\s_.:]+(${CITY}))?(?:[\\s,]+(?:il\\s+)?(${DATE}))?`, 'giu'), m => {
      let p = m.index;
      for (let g = 1; g <= 2; g++) if (m[g] && !(g === 1 && /^[a-zà-ÿ]/.test(m[g]))) { const v = g === 1 ? m[g].replace(/[\s,]+(?:il|in|al|prov|provincia)$/i, '') : m[g], s = text.indexOf(v, p); add('nascita', s, s + v.length); p = s + v.length; }
    });
    // «nato/a a … prov. XX il 01/02/1980»: la data sulla stessa riga, anche con altro in mezzo
    each(new RegExp(`\\bnat[oaie](?:\\/[oaie])?\\b[^\\n]{0,90}?\\bil[\\s_.:]+(${DATE})`, 'giu'), m => { const s = m.index + m[0].lastIndexOf(m[1]); add('nascita', s, s + m[1].length); });
    each(new RegExp(`(?:data\\s+(?:di\\s+)?nascita|nato\\s+il|nata\\s+il)\\s*[:.]?\\s*(${DATE})`, 'giu'), m => { const s = m.index + m[0].lastIndexOf(m[1]); add('nascita', s, s + m[1].length); });
    each(new RegExp(`(?:luogo\\s+di\\s+nascita|comune\\s+di\\s+nascita)\\s*[:.]?\\s*(${CITY})`, 'gu'), m => { const s = m.index + m[0].lastIndexOf(m[1]); add('nascita', s, s + m[1].length); });
    // indirizzi: tipo di strada + nome + numero civico, con CAP e città se seguono
    const STREET = '(?:via|viale|v\\.le|piazza|p\\.zza|p\\.za|piazzale|corso|c\\.so|largo|vicolo|vico|contrada|c\\.da|strada|località|loc\\.|borgo|salita|traversa|lungomare|lungotevere|circonvallazione|rotonda|calle|frazione|fraz\\.)';
    each(new RegExp(`\\b${STREET}[ \\t]+(?:[A-ZÀ-Ü0-9][\\p{L}0-9'’.]*|d[ei]l?l?[aoei]?|de|di|del|della|dei|degli|dello|san|santa|s\\.)(?:[ \\t]+(?:[A-ZÀ-Ü0-9][\\p{L}0-9'’.]*|d[ei]l?l?[aoei]?|de|di|del|della|dei|degli|dello|delle|san|santa|s\\.|e)){0,6}(?:,?[ \\t]*(?:n\\.?|nr\\.?|n°)?[ \\t]*\\d{1,4}(?!\\d)[ \\t]?[A-Za-z]?(?:\\/[A-Za-z0-9]{1,3})?)?(?:[ \\t]*[,–-]?[ \\t]*(?:\\d{5}[ \\t]+)?${CITY.replace(/\\s\*/g, '[ \\t]*')})?`, 'giu'), m => {
      let s = m[0];
      // il nome della via deve cominciare con una maiuscola o un numero (non «via e-mail»)
      if (!/^\S+[ \t]+(?:[A-ZÀ-Ü0-9]|d[ei]|de|san|santa|s\.)/u.test(s) || /^\S+[ \t]+(?:e-?mail|pec|posta|internet|telefono|web|fax)/i.test(s)) return;
      s = s.replace(/[ \t,–-]+$/, '');
      const tail = /^\/[A-Za-z0-9]{1,3}\b/.exec(text.slice(m.index + s.length)); if (tail) s += tail[0];   // 12/B
      // non oltre l'eventuale etichetta seguente («Tel», «Email», «CF»…)
      const cut = s.search(/[ \t,](?:tel|cell|fax|email|e-mail|pec|c\.?f\.?|p\.?\s?iva|cap)\b/i); if (cut > 6) s = s.slice(0, cut).replace(/[ \t,–-]+$/, '');
      add('indirizzo', m.index, m.index + s.length, /\d/.test(s));
    });
    each(/\b\d{5}[ \t]+(?=[A-ZÀ-Ü])[\p{L}'’]+(?:[ -][A-ZÀ-Ü][\p{L}'’]+)*(?:[ \t]*\([ \t]*[A-Z]{2}[ \t]*\))/gu, m => add('indirizzo', m.index, m.index + m[0].length, false));

    // carte di pagamento (13-19 cifre con il controllo di Luhn, anche a gruppi), BIC/SWIFT e numeri di conto vicino alle parole chiave
    const luhn = d => { let s2 = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s2 += n; alt = !alt; } return s2 % 10 === 0; };
    each(/(?<![\d.,])(?:\d[ -]?){12,18}\d(?![\d.,]\d|\d)/g, m => {
      const d = m[0].replace(/\D/g, ''); if (d.length < 13 || d.length > 19 || !luhn(d) || /^(\d)\1+$/.test(d)) return;
      const ctx0 = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
      if (/^[3-6]/.test(d) || /(carta|card|visa|mastercard|amex|bancomat|postepay|pan)/.test(ctx0)) add('carta', m.index, m.index + m[0].length, /^[3-6]/.test(d));
    });
    each(/\b[A-Z]{4}(?:IT|SM|VA|DE|FR|ES|GB|CH|AT|BE|NL|PT|LU|IE)[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, m => { if (/(bic|swift)/i.test(text.slice(Math.max(0, m.index - 24), m.index))) add('carta', m.index, m.index + m[0].length); });
    each(/(?:c\/c|conto\s+corrente|conto\s+n\.?|n\.\s*conto|numero\s+di\s+conto|abi|cab|cin)\s*[:.n°]*\s*([A-Z0-9][A-Z0-9 /-]{3,22}[A-Z0-9])/gi, m => { if (!/\d{3}/.test(m[1])) return; const s0 = m.index + m[0].lastIndexOf(m[1]); add('carta', s0, s0 + m[1].length, false); });
    // indirizzi IP, profili e siti personali
    each(/(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.]\d)/g, m => { if (!/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(m[0])) add('web', m.index, m.index + m[0].length); });
    each(/\b(?:https?:\/\/)?(?:www\.)?(?:facebook|instagram|linkedin|twitter|x|tiktok)\.com\/[\w.\-\/]+/gi, m => add('web', m.index, m.index + m[0].length));
    // utenze: POD della luce, PDR del gas, codici cliente vicino alle parole chiave
    each(/\bIT\d{3}E\d{8}\b/g, m => add('utenza', m.index, m.index + m[0].length));
    each(/(?:pdr|pod|codice\s+cliente|cod\.\s*cliente|n\.\s*cliente|matricola(?:\s+inps|\s+inail)?|codice\s+utente|numero\s+utente)\s*[:.n°]*\s*([A-Z0-9][A-Z0-9-]{4,20})/gi, m => { if (!/\d{4}/.test(m[1])) return; const s0 = m.index + m[0].lastIndexOf(m[1]); add('utenza', s0, s0 + m[1].length); });
    // tessera sanitaria (numero della carta TEAM, 20 cifre che iniziano con 80380)
    each(/\b80380\d{15}\b/g, m => add('sanita', m.index, m.index + m[0].length));
    // categorie particolari (art. 9 e 10 del GDPR): la frase dopo la parola chiave, da controllare
    const clause = (cat, re) => each(re, m => { let e = m.index + m[0].length; const rest = text.slice(e, e + 140), stop = rest.search(/[.;\n]|\s{3,}/); e += stop < 0 ? Math.min(rest.length, 90) : stop; add(cat, m.index, e, false); });
    clause('sanita', /\b(?:diagnosi|patologi[ae]|malatti[ae]|affett[oa]\s+da|terapi[ae]|farmac[oi]|ricover[oi]|invalidit[àa]|disabilit[àa]|handicap|legge\s+104|l\.\s*104|esenzione(?:\s+ticket)?|anamnesi|prognosi|referto|certificato\s+medico|gravidanza|interruzione\s+di\s+gravidanza|oncolog\w*|tumor\w*|neoplasi\w*|diabet\w*|hiv|aids|psichiatr\w*|tossicodipenden\w*|dipendenza\s+da|alcolismo|sieropositiv\w*|asl\s+di|codice\s+esenzione)\b/giu);
    clause('giudiziari', /\b(?:condann[ae]t?[oaie]?|reat[oi]|procedimento\s+penale|procedimenti\s+penali|r\.?\s?g\.?\s?n\.?\s?r\.?|casellario\s+giudiziale|carichi\s+pendenti|misure?\s+cautelar\w*|arresti\s+domiciliari|imputat[oaie]|indagat[oaie]|sentenza\s+penale)\b/giu);
    clause('particolari', /\b(?:religion[ei]|confessione\s+religiosa|fede\s+religiosa|orientamento\s+sessuale|vita\s+sessuale|origine\s+(?:etnica|razziale)|etnia|opinioni\s+politiche|iscrizione\s+(?:al\s+)?(?:partito|sindacato)|iscritt[oa]\s+al(?:la)?\s+(?:partito|sindacato|cgil|cisl|uil)|tessera\s+sindacale|trattenuta\s+sindacale|dati\s+biometrici|dati\s+genetici)\b/giu);
    // potenzialmente sensibili (da scegliere): importi e date
    each(/(?:€|eur(?:o)?\.?)\s?-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\s?(?:€|euro\b)/gi, m => add('importo', m.index, m.index + m[0].length, false));
    each(new RegExp(`(?<![\\d/.-])(?:${DATE})(?![\\d/.-]\\d)`, 'giu'), m => add('data', m.index, m.index + m[0].length, false));

    // —— nomi e cognomi ——
    const tk = tokens(text);
    const nameRun = (i, max = 4) => { // sequenza di parole con la maiuscola (con particelle), sulla stessa riga
      let j = i, n = 0;
      while (j < tk.length && n < max) {
        const w = tk[j].t, low = w.toLowerCase().replace(/\.$/, '');
        if (STOP.has(low) || (!isCap(w) && !(PARTICLE.test(w) && j + 1 < tk.length && isCap(tk[j + 1].t)))) break;
        if (j > i && !tk[j - 1].near) break;
        j++; n++;
      }
      return j;
    };
    const addRun = (i, j, sure) => { while (j > i && PARTICLE.test(tk[j - 1].t)) j--; if (j > i) add('nome', tk[i].s, tk[j - 1].e, sure); };
    // 1) dal contesto: titoli e formule
    const TITLE = /^(sig|sig\.ra|sigra|signor|signora|signore|sig\.na|dott|dott\.ssa|dottssa|dottor|dottore|dottoressa|avv|avvocato|ing|geom|rag|prof|prof\.ssa|profssa|arch|notaio|egr|gent|gentile|egregio|caro|cara|on|mr|mrs|ms)\.?$/i;
    for (let i = 0; i < tk.length - 1; i++) {
      if (TITLE.test(tk[i].t) && tk[i].near) { const j = nameRun(i + 1, 4); if (j > i + 1) addRun(i + 1, j, true); }
    }
    each(/(?:sottoscritt[oaie]|nominativo|cognome\s+e\s+nome|nome\s+e\s+cognome|intestat[oaie]\s+a|a\s+favore\s+di|beneficiario|titolare|richiedente|dichiarante|ordinante|conferente|delegato|delegante|erede|de\s+cuius|paziente|assistito|cliente\s*:|signor[ae]?)[ \t]*[:.]?[ \t]*/giu, m => {
      const at = m.index + m[0].length, i = tk.findIndex(t => t.s >= at && t.s - at < 3); if (i >= 0 && /\n/.test(text.slice(at, tk[i].s))) return;
      if (i >= 0) { const j = nameRun(i, 4); if (j > i) addRun(i, j, true); }
    });
    each(/(?<![\p{L}])(cognome|nome)[ \t]*:[ \t]*/giu, m => {
      const at = m.index + m[0].length, i = tk.findIndex(t => t.s >= at && t.s - at < 3);
      if (i >= 0) { const j = nameRun(i, 3); if (j > i) addRun(i, j, true); }
    });
    // 2) nome proprio dell'elenco accanto a un cognome (Mario Rossi, ROSSI MARIO, Rossi Mario)
    for (let i = 0; i < tk.length; i++) {
      const low = tk[i].t.toLowerCase();
      if (!NAMES.has(low) || !isCap(tk[i].t)) continue;
      let j = nameRun(i, 4);
      if (j > i + 1) { addRun(i, j, true); continue; }
      // cognome prima del nome
      if (i > 0 && tk[i - 1].near && isCap(tk[i - 1].t) && !STOP.has(tk[i - 1].t.toLowerCase()) && !NAMES.has(tk[i - 1].t.toLowerCase())) add('nome', tk[i - 1].s, tk[i].e, true);
    }
    // 3) dalle consonanti dei codici fiscali del documento
    for (const cf of ctx.cfs || []) {
      const sc = cf.slice(0, 3), nc = cf.slice(3, 6);
      for (let i = 0; i < tk.length; i++) {
        if (!isCap(tk[i].t) || STOP.has(tk[i].t.toLowerCase()) || tk[i].t.length < 2) continue;
        for (let n = 1; n <= 3 && i + n <= tk.length; n++) {
          if (n > 1 && !tk[i + n - 2].near) break;
          const part = tk.slice(i, i + n), str = part.map(t => t.t).join('');
          if (part.some(t => !isCap(t.t) && !PARTICLE.test(t.t))) break;
          if (codeSurname(str) === sc && str.length >= 2) {
            // cognome trovato; il nome può essere subito prima o subito dopo
            let s0 = part[0].s, e0 = part[n - 1].e;
            const nx = tk[i + n], pv = tk[i - 1];
            if (nx && part[n - 1].near && isCap(nx.t) && codeName(nx.t) === nc) e0 = nx.e;
            else if (pv && pv.near && isCap(pv.t) && codeName(pv.t) === nc) s0 = pv.s;
            add('nome', s0, e0, true);
          }
        }
      }
    }
    // 4) le parole già riconosciute come cognomi altrove nel documento («il Rossi»)
    if (ctx.names && ctx.names.size) for (const t of tk) if (ctx.names.has(t.t.toUpperCase()) && isCap(t.t)) add('nome', t.s, t.e, true);
    return resolve(found);
  }
  /* sovrapposizioni: vince la categoria più specifica, poi la più lunga */
  function resolve(list) {
    const rank = c => ORDER.indexOf(c);
    list.sort((a, b) => rank(a.cat) - rank(b.cat) || (b.end - b.start) - (a.end - a.start));
    const out = [];
    for (const f of list) {
      const ov = out.find(o => f.start < o.end && o.start < f.end);
      if (!ov) { out.push(f); continue; }
      // stesso tipo: si uniscono (es. nome + cognome trovati in due modi)
      if (ov.cat === f.cat) { ov.start = Math.min(ov.start, f.start); ov.end = Math.max(ov.end, f.end); ov.sure = ov.sure || f.sure; }
    }
    return out.sort((a, b) => a.start - b.start);
  }
  /* i codici fiscali validi di un testo (per riconoscere i nomi in tutto il documento) */
  function cfsOf(text) {
    { CF_LOOSE.lastIndex = 0; let m2; const o2 = new Set(); while ((m2 = CF_LOOSE.exec(text))) { const c = m2[0].replace(/[^A-Z0-9]/gi, '').toUpperCase(); if (cfValid(c)) o2.add(c); } if (o2.size) return [...o2, ...cfsOf0(text)].filter((v, i, a) => a.indexOf(v) === i); }
    return cfsOf0(text);
  }
  function cfsOf0(text) {
    const out = new Set(), re = /(?<![A-Z0-9])[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z](?![A-Z0-9])/gi; let m;
    while ((m = re.exec(text))) if (cfValid(m[0])) out.add(m[0].toUpperCase());
    const re2 = /(?<![A-Z0-9])(?:[A-Z][ ]){15}[A-Z](?![A-Z0-9])|(?<![A-Z0-9])(?:[A-Z0-9][ ]){15}[A-Z0-9](?![A-Z0-9])/gi;
    while ((m = re2.exec(text))) { const c = m[0].replace(/ /g, ''); if (cfValid(c)) out.add(c.toUpperCase()); }
    return [...out];
  }
  /* cognomi certi (parole lunghe almeno 3 lettere, non nomi propri comuni) per cercarli in tutto il documento */
  function surnamesOf(found) {
    const out = new Set();
    for (const f of found) if (f.cat === 'nome' && f.sure) for (const w of f.text.split(/\s+/)) { const b = bare(w); if (b.length >= 3 && !NAMES.has(b.toLowerCase()) && !STOP.has(b.toLowerCase()) && !PARTICLE.test(b)) out.add(b.toUpperCase()); }
    return out;
  }
  return { detect, cfValid, pivaValid, ibanValid, codeSurname, codeName, cfsOf, surnamesOf, CATS, ORDER, SOFT };
})();
if (typeof module !== 'undefined') module.exports = PiiKit;

/* =====================================================================
   Che documento è? Tipo, data, numero, controparte e oggetto, letti dal testo.
   Serve a: riconoscimento al caricamento, nomi dei file presi dal contenuto, estrazione dei dati chiave.
   Solo regole sul testo (nessun servizio esterno): ogni tipo ha indizi forti e deboli; vince il punteggio
   più alto, e sotto una soglia minima il tipo resta «documento» (meglio nessun nome che un nome sbagliato).
   ===================================================================== */
const DocKind = (() => {
  // [tipo, etichetta, articolo, indizi forti (3 punti), indizi deboli (1 punto)]
  const TYPES = [
    ['fattura', 'fattura', 'una', [/^\s*invoice\b|\binvoice\s+(?:no\.?|number|date)\b/im, /\bfattura\s*(?:n\.?|nr\.?|num(?:ero)?\.?)\s*[:°]?\s*\w/i, /\bimponibile\b/i, /\btotale\s+(?:documento|fattura)\b/i, /\bfattura\s+(?:elettronica|immediata|differita)\b/i, /\bcedente\s*\/?\s*prestatore\b/i], [/\bfattura\b/i, /\bi\.?v\.?a\.?\b/i, /\bpartita\s+iva\b|\bp\.?\s?iva\b/i, /\baliquota\b/i]],
    ['mandato', 'mandato di pagamento', 'un', [/\bmandato\s+di\s+pagamento\b/i, /\breversale\s+di\s+incasso\b/i], [/\bbeneficiario\b/i, /\bcapitolo\b/i, /\besercizio\b/i]],
    ['notacredito', 'nota di credito', 'una', [/\bnota\s+di\s+credito\s*(?:n\.?|nr\.?)/i, /\bTD04\b/], [/\bnota\s+di\s+credito\b/i]],
    ['preventivo', 'preventivo', 'un', [/\bpreventivo\s*(?:n\.?|nr\.?|num)/i, /\boffert[ao]\s+(?:economica|n\.?)/i], [/\bpreventivo\b/i, /\bvalidit[àa]\s+(?:dell'?\s*offerta|del\s+preventivo)/i]],
    ['ricevuta', 'ricevuta', 'una', [/\bricevuta\s+(?:di\s+pagamento|n\.?|fiscale)/i, /\bquietanza\b/i], [/\bricevut[ao]\b/i, /\bpagat[oa]\b/i]],
    ['f24', 'modello F24', 'un', [/\bmodello\s+f\s?24\b|\bdelega\s+irrevocabile\b/i, /\bcodice\s+tributo\b/i, /\bsezione\s+erario\b/i], [/\bf\s?24\b/i, /\banno\s+di\s+riferimento\b/i]],
    ['cartella', 'cartella di pagamento', 'una', [/\bcartella\s+di\s+pagamento\b/i, /\bagenzia\s+(?:delle\s+)?entrate[\s-]+riscossione\b/i, /\bavviso\s+di\s+(?:accertamento|addebito)\b/i], [/\bruolo\b/i, /\bintimazione\b/i]],
    ['cu', 'Certificazione Unica', 'una', [/\bcertificazione\s+unica\b/i, /\bCU\s+20\d\d\b/], [/\bsostituto\s+d'?imposta\b/i, /\bredditi\s+di\s+lavoro\b/i]],
    ['cedolino', 'busta paga', 'una', [/\bcedolino\b|\bbusta\s+paga\b|\blibro\s+unico\s+del\s+lavoro\b/i, /\bnetto\s+in\s+busta\b/i], [/\bretribuzione\b/i, /\btrattenute\b/i, /\bcontributi\b/i]],
    ['estratto', 'estratto conto', 'un', [/\bestratto\s+(?:di\s+)?conto\b/i, /\bsaldo\s+(?:iniziale|finale|contabile|disponibile)\b/i], [/\bmovimenti\b/i, /\bdare\b.*\bavere\b/i, /\bvaluta\b/i]],
    ['bilancio', 'bilancio', 'un', [/\bstato\s+patrimoniale\b/i, /\bconto\s+economico\b/i, /\bnota\s+integrativa\b/i], [/\besercizio\b/i, /\btotale\s+attivo\b/i]],
    ['visuracat', 'visura catastale', 'una', [/\bvisura\s+(?:attuale\s+)?(?:per\s+(?:soggetto|immobile)|catastale|storica\s+per\s+immobile)\b/i, /\bcatasto\s+(?:fabbricati|terreni)\b/i, /\bservizi\s+catastali\b|\bufficio\s+provinciale\s*-\s*territorio\b/i], [/\brendita\b/i, /\bparticella\b/i, /\bsubalterno\b/i, /\bfoglio\b/i]],
    ['referto', 'referto di laboratorio', 'un', [/\bvalori\s+di\s+riferimento\b|\bintervallo\s+di\s+riferimento\b/i, /\bdata\s+(?:del\s+)?prelievo\b|\blaboratorio\s+(?:di\s+)?analisi\b/i], [/\bmg\/dl\b|\bg\/dl\b|\bu\/l\b/i, /\bemocromo\b|\bglucosio\b|\bcolesterolo\b|\bcreatinina\b/i]],
    ['visura', 'visura camerale', 'una', [/\bvisura\b/i, /\bregistro\s+(?:delle\s+)?imprese\b/i, /\bnumero\s+rea\b|\bREA\b/], [/\bcamera\s+di\s+commercio\b/i, /\bcodice\s+ateco\b/i]],
    ['durc', 'DURC', 'un', [/\bDURC\b|\bdocumento\s+unico\s+di\s+regolarit[àa]\s+contributiva\b/i], [/\bINPS\b/, /\bINAIL\b/]],
    ['determina', 'determina', 'una', [/\bdetermin(?:a|azione)\s+(?:dirigenziale|del\s+(?:responsabile|dirigente)|n\.?|nr\.?)/i, /\bil\s+responsabile\s+del\s+(?:settore|servizio|procedimento)\b[\s\S]{0,400}\bdetermina\b/i], [/\bdetermina\b/i, /\bvisto\s+il\b|\bvista\s+la\b/i, /\bd\.?\s?lgs\.?\s*n?\.?\s*267\/2000\b|\bTUEL\b/i]],
    ['delibera', 'delibera', 'una', [/\bdeliberazione\s+(?:del(?:la)?\s+)?(?:giunta|consiglio)\b|\bdelibera\s+(?:di\s+|del(?:la)?\s+)?(?:giunta|consiglio)\b/i, /\bverbale\s+di\s+deliberazione\b/i], [/\bdelibera\b/i, /\bla\s+giunta\b|\bil\s+consiglio\b/i]],
    ['ordinanza', 'ordinanza', 'un\'', [/\bordinanza\s+(?:sindacale|n\.?|nr\.?|dirigenziale)\b/i], [/\bordina\b/i]],
    ['decreto', 'decreto', 'un', [/\bdecreto\s+(?:sindacale|dirigenziale|n\.?|nr\.?|del\s+presidente|ingiuntivo)\b/i], [/\bdecret[ao]\b/i]],
    ['bando', 'avviso pubblico', 'un', [/\bavviso\s+pubblico\b|\bbando\s+(?:di|per)\b/i, /\bscadenza\s+(?:per\s+la\s+)?presentazione\s+delle\s+domande\b/i], [/\brequisiti\s+di\s+ammissione\b/i, /\bgraduatoria\b/i]],
    ['verbale', 'verbale', 'un', [/\bverbale\s+(?:di|n\.?|della\s+seduta)\b/i, /\bl'?anno\s+(?:duemila\w*|\d{4})[,\s]+(?:il\s+giorno|addì)\b/i], [/\bverbale\b/i, /\bsono\s+presenti\b/i]],
    ['contratto', 'contratto', 'un', [/\bcontratto\s+(?:di|n\.?|per)\b/i, /\btra\s+(?:le\s+parti|il\s+sig|la\s+societ[àa])[\s\S]{0,300}\b(?:premesso|si\s+conviene|si\s+stipula)\b/i, /\bsi\s+conviene\s+e\s+si\s+stipula\b/i], [/\bcontratto\b/i, /\bart\.\s*1\b/i, /\bclausol[ae]\b/i]],
    ['dichiarazione', 'dichiarazione sostitutiva', 'una', [/\bdichiarazione\s+sostitutiva\b|\bautocertificazione\b/i, /\bD\.?P\.?R\.?\s*(?:n\.?\s*)?445\/2000\b/i], [/\bil\/la\s+sottoscritt[oa]\b|\bil\s+sottoscritto\b/i, /\bdichiara\b/i]],
    ['domanda', 'domanda', 'una', [/\b(?:il|la|il\/la)\s+sottoscritt[oa][\s\S]{0,600}\bchiede\b/i, /\bistanza\s+(?:di|per)\b/i], [/\bchiede\b/i, /\ballega\b/i]],
    ['sentenza', 'sentenza', 'una', [/\bin\s+nome\s+del\s+popolo\s+italiano\b/i, /\bsentenza\s+n\.?\b/i], [/\btribunale\b|\bcorte\b|\bT\.?A\.?R\.?\b/i, /\bP\.?Q\.?M\.?\b/]],
    ['cv', 'curriculum vitae', 'un', [/\bcurriculum\s+vitae\b|\bformato\s+europeo\b|\bEuropass\b/i], [/\besperienz[ae]\s+lavorativ[ae]\b/i, /\bistruzione\s+e\s+formazione\b/i]],
    ['pec', 'ricevuta PEC', 'una', [/\bricevuta\s+di\s+(?:accettazione|avvenuta\s+consegna)\b/i, /\bposta\s+certificata\b/i], [/\bPEC\b/]],
    ['relazione', 'relazione', 'una', [/\brelazione\s+(?:tecnica|illustrativa|annuale|finale|sull'?attivit[àa])\b/i], [/\brelazione\b/i]],
    ['lettera', 'lettera', 'una', [/^\s*oggetto\s*:/im, /\b(?:distinti|cordiali)\s+saluti\b/i, /\bspett(?:\.le|abile)\b/i], [/\begregi[oa]\b|\bgentile\b/i]],
  ];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const pad = x => String(x).padStart(2, '0');
  // tutte le date del testo (con la posizione), in formato ISO
  function dates(text) {
    const out = [];
    const ok = (d, m, y) => { if (y < 100) y += y > 50 ? 1900 : 2000; return d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1950 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : null; };
    let re = /\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})\b/g, m;
    while ((m = re.exec(text))) { const iso = ok(+m[1], +m[2], +m[3]); if (iso) out.push({ iso, at: m.index, raw: m[0] }); }
    re = new RegExp(`\\b(\\d{1,2})(?:°|º)?\\s+(${MESI.join('|')})\\s+(\\d{4})\\b`, 'gi');
    while ((m = re.exec(text))) { const iso = ok(+m[1], MESI.indexOf(m[2].toLowerCase()) + 1, +m[3]); if (iso) out.push({ iso, at: m.index, raw: m[0] }); }
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re.exec(text))) { const iso = ok(+m[3], +m[2], +m[1]); if (iso) out.push({ iso, at: m.index, raw: m[0] }); }
    return out.sort((a, b) => a.at - b.at);
  }
  // la data del documento: quella dopo «data», «del», «lì», nelle prime righe; mai una data di nascita o una scadenza
  function mainDate(text, type) {
    const all = dates(text).filter(d => !/nat[oa]\s+(?:a\s+\S+\s+)?il\s*$|nascita\s*:?\s*$|scadenz\w*\s*:?\s*$|valid\w*\s+(?:fino\s+)?al\s*$|entro\s+il\s*$/i.test(text.slice(Math.max(0, d.at - 40), d.at)));
    if (!all.length) return null;
    const near = re => all.find(d => re.test(text.slice(Math.max(0, d.at - 60), d.at)));
    const pref = type === 'fattura' || type === 'notacredito' ? near(/(?:data\s+(?:documento|fattura|emissione)|del)\s*:?\s*$/i)
      : near(/(?:data|del|lì|li|addì|in\s+data)\s*[,:]?\s*$/i);
    return (pref || all.find(d => d.at < 3000) || all[0]).iso;
  }
  function number(text, type) {
    const pats = {
      fattura: [/\bfattura\s*(?:elettronica\s*)?(?:n\.?|nr\.?|num(?:ero)?\.?|#)\s*[:°]?\s*([A-Z0-9][\w\/\-.]{0,20})/i, /\bnumero\s+(?:documento|fattura)\s*[:.]?\s*([A-Z0-9][\w\/\-.]{0,20})/i, /\bdoc(?:umento)?\.?\s*n\.?\s*[:°]?\s*([A-Z0-9][\w\/\-.]{0,20})/i],
      notacredito: [/\bnota\s+di\s+credito\s*(?:n\.?|nr\.?)\s*[:°]?\s*([A-Z0-9][\w\/\-.]{0,20})/i],
      determina: [/\bdetermin(?:a|azione)\s+(?:dirigenziale\s+)?(?:n\.?|nr\.?|numero)\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i, /\bregistro\s+generale\s*(?:n\.?)?\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
      delibera: [/\bdelibera(?:zione)?\s+(?:di\s+\w+\s+)?(?:n\.?|nr\.?|numero)\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
      ordinanza: [/\bordinanza\s+(?:sindacale\s+|dirigenziale\s+)?(?:n\.?|nr\.?)\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
      decreto: [/\bdecreto\s+(?:\w+\s+)?(?:n\.?|nr\.?)\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
      sentenza: [/\bsentenza\s+n\.?\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
      preventivo: [/\b(?:preventivo|offerta)\s*(?:n\.?|nr\.?|num)\s*[:°]?\s*([A-Z0-9][\w\/\-.]{0,20})/i],
      contratto: [/\bcontratto\s+(?:(?:di|per)\s+[\wÀ-ÿ']+(?:\s+[\wÀ-ÿ']+)?\s+)?(?:rep\.?\s*)?(?:n\.?|nr\.?)\s*[:°]?\s*([A-Z0-9][\w\/\-.]{0,20})/i, /\brep(?:ertorio)?\.?\s*n\.?\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
      verbale: [/\bverbale\s+(?:n\.?|nr\.?)\s*[:°]?\s*(\d[\w\/\-.]{0,15})/i],
    }[type] || [];
    for (const re of [...pats, /\bprot(?:ocollo)?\.?\s*(?:n\.?|nr\.?|gen\.?)?\s*[:°]?\s*(\d[\w\/\-.]{2,20})/i]) { const m = text.match(re); if (m && /\d/.test(m[1])) return m[1].replace(/[.\-\/]+$/, ''); }
    return null;
  }
  const COMPANY = /\b([A-ZÀ-Ý][\wÀ-ÿ&'’.\- ]{1,60}?\s(?:S\.?\s?R\.?\s?L\.?(?:\s?S\.?)?|S\.?\s?P\.?\s?A\.?|S\.?\s?N\.?\s?C\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?C\.?\s?A\.?\s?R\.?\s?L\.?|S\.?\s?C\.?\s?(?:P\.?\s?A\.?)?|ONLUS|A\.?P\.?S\.?|SOCIET[ÀA]\s+(?:COOPERATIVA|AGRICOLA|SEMPLICE)))(?![A-Za-z])/;
  function party(text, type) {
    const tidy = s => s.replace(/\s+/g, ' ').replace(/^(?:spett\.?le|spettabile|ditta|societ[àa]|soc\.)\s+/i, '').trim().slice(0, 60);
    if (type === 'fattura' || type === 'notacredito' || type === 'preventivo' || type === 'ricevuta') {
      const zone = text.match(/(?:cedente|prestatore|fornitore|emittente|venditore)[\s\S]{0,400}/i);
      // chi emette: prima società nell'intestazione, ma mai quella dopo «cessionario», «committente», «spett.le»
      const buyer = text.search(/\b(?:cessionario|committente|destinatario|spett(?:\.le|abile)|cliente)\b/i);
      const headZone = text.slice(0, buyer > 0 ? Math.min(buyer, 1500) : 1500);
      const m = (zone && zone[0].match(COMPANY)) || headZone.match(COMPANY);
      if (m) return tidy(m[1]);
      // un'intestazione in maiuscolo come prima riga (spesso è il fornitore)
      const first = headZone.split('\n').map(l => l.trim()).find(l => l.length > 3);
      if (first && /^[A-Z0-9À-Ý&'’.\- ]{4,60}$/.test(first.split(/\s[-–]\s/)[0]) && !/\b(?:FATTURA|DOCUMENTO|PAGINA)\b/.test(first)) return tidy(first.split(/\s[-–]\s/)[0]);
      // l'ente si cerca solo nell'intestazione (dopo «cessionario» è il cliente, non chi emette)
      const e2 = headZone.match(/\b((?:Comune|Provincia|Regione|Azienda\s+Sanitaria|Universit[àa]|Ministero|Agenzia)[ \t]+(?:di|del|della|delle|degli|dell')[ \t]+[A-Za-zÀ-ÿ][\wÀ-ÿ'’]+(?:[ \t]+[A-ZÀ-Ý][\wÀ-ÿ'’]+){0,3})/i);
      return e2 ? tidy(e2[1]) : null;
    }
    const ente = text.slice(0, 3000).match(/\b((?:Comune|Citt[àa]\s+(?:metropolitana|di)|Provincia|Regione|Libero\s+Consorzio|Azienda\s+Sanitaria|ASP|ASL|Universit[àa]|Ministero|Agenzia|Camera\s+di\s+Commercio|Tribunale|Corte\s+d'?\s?\w+|T\.?A\.?R\.?|INPS|INAIL)(?:[ \t]+(?:di|del|della|degli|dell'|per[ \t]+il|delle)[ \t]+[A-Za-zÀ-ÿ][\wÀ-ÿ'’]+(?:[ \t]+[A-ZÀ-Ý][\wÀ-ÿ'’]+){0,3})?)/i);
    if (ente && !/^(?:Agenzia|Ministero)$/i.test(ente[1].trim())) {
      // «COMUNE DI CARINI» → «Comune di Carini»
      const e = ente[1].trim();
      return tidy(e === e.toUpperCase() ? e.toLowerCase().replace(/(^|[\s'’])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Di|Del|Della|Degli|Delle|Dell'|Per|Il)\b/g, w => w.toLowerCase()) : e);
    }
    const m = text.slice(0, 2500).match(COMPANY);
    return m ? tidy(m[1]) : null;
  }
  function subject(text) {
    const m = text.match(/^\s*oggetto\s*[:.\-]\s*(.{6,220}?)(?:\n\s*\n|\n(?=[A-Z][a-z]+\s*[:,])|$)/im) || text.match(/\boggetto\s*[:.\-]\s*([^\n]{6,160})/i);
    if (!m) return null;
    return m[1].replace(/\s+/g, ' ').replace(/[.;,:\s]+$/, '').trim().slice(0, 160);
  }
  // errori tipici dell'OCR nelle forme societarie («S$.R.L.», «5.R.L.», «S.R.I.», «S.p.A»)
  const ocrFix = t => t.replace(/\b[S5$][\$]?\s?\.?\s?R\s?\.?\s?[LlI1]\b\.?/g, 'S.R.L.').replace(/\bS\$/g, 'S');
  function classify(text, { title = '' } = {}) {
    const t = ocrFix((title ? title + '\n' : '') + String(text || '').slice(0, 30000));
    if (t.replace(/\s/g, '').length < 40) return { type: null, label: null };
    let best = null;
    for (const [type, label, article, strong, weak] of TYPES) {
      let s = 0;
      for (const re of strong) if (re.test(t)) s += 3;
      for (const re of weak) if (re.test(t)) s += 1;
      // indizi nelle prime righe contano di più (è l'intestazione); il titolo del documento più di tutto
      const head = t.slice(0, 600);
      if (strong.some(re => re.test(head))) s += 2;
      if (title && (strong.some(re => re.test(title)) || weak.some(re => re.test(title)))) s += 6;
      if (!best || s > best.score) best = { type, label, article, score: s };
    }
    if (!best || best.score < 4) best = { type: null, label: null, article: '', score: best?.score || 0 };
    return { ...best, date: mainDate(t, best.type), number: best.type ? number(t, best.type) : number(t, ''), party: party(t, best.type), subject: subject(t) };
  }
  return { classify, dates, mainDate, number, party, subject, TYPES };
})();

/* =====================================================================
   Riconoscimento al caricamento: appena apri un documento, file360 guarda com'è fatto
   (scansione o testo, peso, pagine capovolte, campi da compilare, firme, fattura allegata,
   bilancio, tabelle, dati personali, protezioni, formati diversi) e propone cosa fare, con il perché.
   L'analisi è progressiva (i risultati compaiono man mano), non blocca la pagina e si ferma
   presto sui documenti grandi (si guardano al massimo 60 pagine, scelte su tutto il documento).
   I fatti raccolti servono anche all'assistente (ricette intelligenti).
   ===================================================================== */
const DocInsight = (() => {
  const cache = new WeakMap();   // bytes della versione → analisi (promessa)
  const SAMPLE = 60;
  const money = /(?:€\s?)?\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;
  // segni nel file grezzo (senza aprirlo): firme, cifratura, allegati, moduli
  function rawMarks(bytes) {
    const lim = 48e6;
    const head = bytes.length > lim ? bytes.subarray(0, lim / 2) : bytes;
    const tail = bytes.length > lim ? bytes.subarray(bytes.length - lim / 2) : null;
    const txt = new TextDecoder('latin1').decode(head) + (tail ? new TextDecoder('latin1').decode(tail) : '');
    return {
      sigs: (txt.match(/\/ByteRange\s*\[/g) || []).length,
      encrypt: /\/Encrypt\s/.test(txt),
      xfa: /\/XFA\s/.test(txt),
    };
  }
  // pagine da guardare: tutte fino a 60, altrimenti le prime, le ultime e alcune in mezzo
  function sample(n) {
    if (n <= SAMPLE) return Array.from({ length: n }, (_, i) => i + 1);
    const s = new Set();
    for (let p = 1; p <= 25; p++) s.add(p);
    for (let p = n - 9; p <= n; p++) s.add(p);
    const step = (n - 35) / 25;
    for (let k = 0; k < 25; k++) s.add(26 + Math.round(k * step));
    return [...s].filter(p => p >= 1 && p <= n).sort((a, b) => a - b);
  }
  const sizeKey = v => { const w = Math.round(Math.abs(v[2] - v[0]) * 25.4 / 72), hh = Math.round(Math.abs(v[3] - v[1]) * 25.4 / 72); return w < hh ? `${w}x${hh}` : `${hh}x${w}`; };

  async function analyze(bytes, onUpdate = () => {}) {
    const f = { size: bytes.length, pages: 0, sampled: 0, scanned: [], textPages: 0, upside: [], sideways: [], fields: 0, sigFields: 0, signed: false,
      encrypted: false, needsPassword: false, restricted: false, attachments: [], fatturaXml: false, pdfa: null, formats: {}, pii: {}, bilancio: false,
      moneyLines: 0, text: '', title: '', done: false };
    try {
      const m = rawMarks(bytes);
      f.signed = m.sigs > 0; f.encrypted = m.encrypt; f.xfa = m.xfa;
    } catch { }
    onUpdate(f);
    let doc;
    try { doc = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise; }
    catch (e) { if (e?.name === 'PasswordException') f.needsPassword = true; f.done = true; onUpdate(f); return f; }
    try {
      f.pages = doc.numPages;
      try { const md = await doc.getMetadata(); f.title = (md?.info?.Title || '').trim(); const part = md?.metadata?.get?.('pdfaid:part'); f.pdfa = part ? String(part) : null; } catch { }
      try { const perms = await doc.getPermissions(); f.restricted = Array.isArray(perms) && perms.length < 8; } catch { }
      try {
        const fo = await doc.getFieldObjects();
        if (fo) for (const arr of Object.values(fo)) for (const x of arr) { if (x.type === 'signature') f.sigFields++; else if (x.editable !== false && x.type) f.fields++; }
        if (f.sigFields) f.signed = true;
      } catch { }
      try {
        const att = await doc.getAttachments();
        if (att) for (const a of Object.values(att)) {
          const name = a.filename || '';
          f.attachments.push(name);
          if (/\.xml(\.p7m)?$/i.test(name) && a.content) {
            const head = new TextDecoder('latin1').decode(a.content.subarray(0, 4096));
            if (/FatturaElettronica|p:FatturaElettronica|<FatturaElettronicaHeader/i.test(head) || /\.p7m$/i.test(name)) f.fatturaXml = true;
          }
        }
      } catch { }
      onUpdate(f);
      const pages = sample(f.pages);
      let k = 0;
      for (const p of pages) {
        const page = await doc.getPage(p);
        const key = sizeKey(page.view); f.formats[key] = (f.formats[key] || 0) + 1;
        const tc = await page.getTextContent();
        const chars = tc.items.reduce((s, it) => s + (it.str ? it.str.replace(/\s/g, '').length : 0), 0);
        if (chars < 20) f.scanned.push(p);
        else {
          f.textPages++;
          try { const o = await PageOrient.fromText(page); if (o && o.rot === 180) f.upside.push(p); else if (o && o.rot) f.sideways.push(p); } catch { }
          if (f.text.length < 120000) {
            const t = tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('');
            f.text += '\n' + t;
            f.moneyLines += t.split('\n').filter(l => (l.match(money) || []).length >= 2).length;
          }
        }
        page.cleanup();
        f.sampled++;
        if (++k % 8 === 0) { onUpdate(f); await tick(); }
      }
      // proporzione sul documento intero (se si è guardato un campione)
      if (f.sampled < f.pages) f.scannedShare = f.scanned.length / f.sampled;
      const sample2 = f.text.slice(0, 60000);
      if (typeof BilancioKit !== 'undefined') f.bilancio = BilancioKit.looksLike(sample2);
      if (typeof PiiKit !== 'undefined' && sample2.trim()) {
        try { for (const x of PiiKit.detect(sample2, { cfs: PiiKit.cfsOf(sample2) })) if (x.sure) f.pii[x.cat] = (f.pii[x.cat] || 0) + 1; } catch (e) { console.warn(e); }
      }
      if (typeof DocKind !== 'undefined') { try { f.kind = DocKind.classify(f.text, { title: f.title }); } catch (e) { console.warn(e); } }
    } finally { try { doc.destroy(); } catch { } }
    f.done = true;
    onUpdate(f);
    return f;
  }
  // analisi della versione (una volta sola per gli stessi byte)
  function of(bytes, onUpdate) {
    let e = cache.get(bytes);
    if (!e) { e = { last: null, subs: new Set(), pr: null }; cache.set(bytes, e); e.pr = analyze(bytes, f => { e.last = f; e.subs.forEach(fn => { try { fn(f); } catch { } }); }); }
    if (onUpdate) { e.subs.add(onUpdate); if (e.last) onUpdate(e.last); }
    return { promise: e.pr, off: () => onUpdate && e.subs.delete(onUpdate) };
  }

  /* —— consigli: cosa fare, perché, in ordine di utilità —— */
  const n = (k, a, b) => plural(k, a, b);
  function advise(f) {
    const out = [];
    const add = (tool, prio, text, cta) => { if (TOOLS[tool] && !out.some(x => x.tool === tool)) out.push({ tool, prio, text, cta }); };
    if (f.needsPassword) add('proteggi', 100, 'È protetto da password: per lavorarci va prima sbloccato.', 'Sblocca');
    if (f.fatturaXml) add('fatture', 96, 'Contiene la fattura elettronica originale (XML allegato).', 'Apri la fattura');
    const scanAll = f.sampled && f.scanned.length === f.sampled;
    if (scanAll) add('ocr', 95, `È una scansione: ${f.pages === 1 ? 'la pagina non ha' : 'le pagine non hanno'} testo da cercare o copiare.`, 'Rendi ricercabile');
    else if (f.scanned.length) add('ocr', 80, `${f.scannedShare ? 'Circa ' + Math.round(f.scannedShare * f.pages) : f.scanned.length} ${f.scanned.length === 1 && !f.scannedShare ? 'pagina è una scansione' : 'pagine sono scansioni'} senza testo.`, 'Rendi ricercabile');
    const rot = f.upside.length + f.sideways.length;
    if (rot) add('ruota', 92, [f.upside.length ? n(f.upside.length, 'pagina capovolta', 'pagine capovolte') : '', f.sideways.length ? n(f.sideways.length, 'pagina di lato', 'pagine di lato') : ''].filter(Boolean).join(' e ') + ` (p. ${[...f.upside, ...f.sideways].sort((a, b) => a - b).slice(0, 6).join(', ')}).`, 'Raddrizza');
    if (f.fields) add('moduli', 90, `È un modulo con ${n(f.fields, 'campo', 'campi')} da compilare.`, 'Compila');
    const mb = f.size / 1048576;
    if (mb > 10) add('comprimi', 88, `Pesa ${fmtSize(f.size)}: per email, PEC e portali conviene alleggerirlo.`, 'Comprimi');
    else if (mb > 2.5 && f.pages && f.size / f.pages > 600e3) add('comprimi', 60, `Pesa ${fmtSize(f.size)} (${fmtSize(f.size / f.pages)} a pagina): si può alleggerire.`, 'Comprimi');
    if (f.signed) add('firme', 78, 'È firmato digitalmente: puoi verificare chi ha firmato e se il documento è integro.', 'Verifica la firma');
    if (f.pdfa) add('verificapdfa', 70, `Dichiara di essere PDF/A-${f.pdfa}: verifico se lo è davvero, regola per regola.`, 'Verifica');
    if (f.bilancio) add('analisi', 77, 'È un bilancio: indici, flussi di cassa, rischio e valutazione dell’azienda in un’analisi completa.', 'Analizza');
    if (f.bilancio) add('excel', 76, 'È un bilancio: in Excel con voci ed esercizi affiancati, pronti per i calcoli.', 'In Excel');
    else if (f.moneyLines >= 8) add('excel', 55, 'Ha tabelle con importi: in Excel diventano numeri da sommare e ordinare.', 'In Excel');
    const pii = Object.entries(f.pii).filter(([, c]) => c);
    if (pii.length) {
      const order = typeof PiiKit !== 'undefined' ? PiiKit.ORDER : [];
      const lbl = { cf: ['codice fiscale', 'codici fiscali'], iban: ['IBAN', 'IBAN'], email: ['email', 'email'], tel: ['telefono', 'telefoni'], piva: ['partita IVA', 'partite IVA'], doc: ['documento d’identità', 'documenti d’identità'], targa: ['targa', 'targhe'], nascita: ['data di nascita', 'date di nascita'], indirizzo: ['indirizzo', 'indirizzi'], nome: ['nome', 'nomi'] };
      const parts = pii.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).slice(0, 3).map(([c, k]) => `${k} ${k === 1 ? lbl[c]?.[0] : lbl[c]?.[1]}`);
      add('oscura', 62, `Contiene dati personali (${parts.join(', ')}${pii.length > 3 ? '…' : ''}): prima di pubblicarlo o inoltrarlo puoi oscurarli.`, 'Oscura');
    }
    if (f.restricted && !f.needsPassword) add('proteggi', 45, 'Ha limitazioni (stampa, copia o modifica bloccate).', 'Togli le limitazioni');
    const formats = Object.keys(f.formats);
    if (formats.length > 1) add('impagina', 40, `Ha pagine di ${formats.length} formati diversi: puoi portarle tutte in A4.`, 'Uniforma');
    if (f.xfa) add('moduli', 50, 'È un modulo XFA (Adobe): alcuni campi potrebbero non vedersi fuori da Acrobat.', 'Prova a compilarlo');
    { const K = f.kind?.id || f.kind?.type || f.kind?.key; const DED = { estratto: ['estrattoconto', 'I movimenti in Excel, con la verifica dei saldi', 'Movimenti in Excel'], f24: ['f24', 'Codici tributo, debiti e crediti in Excel, con la verifica del saldo', 'F24 in Excel'], cu: ['f24', 'I punti della CU in Excel', 'CU in Excel'],
      visuracat: ['visure', 'Immobili, rendite, intestati e valore IMU in Excel', 'Leggi la visura'], visura: ['visure', 'Denominazione, codici, PEC, ATECO e cariche in Excel', 'Leggi la visura'], referto: ['laboratorio', 'I valori in tabella, quelli fuori intervallo evidenziati', 'Esami in tabella'] };
      const d = K && DED[K]; if (d && TOOLS[d[0]]) add(d[0], 84, `Sembra ${f.kind.article} ${f.kind.label}. ${d[1]}.`, d[2]); }
    if (f.kind && f.kind.label && typeof TOOLS.estrai !== 'undefined') add('estrai', 58, `Sembra ${f.kind.article} ${f.kind.label}: posso estrarne i dati principali.`, 'Estrai i dati');
    return out.sort((a, b) => b.prio - a.prio);
  }
  // riassunto in una riga (tipo, pagine, testo/scansione)
  function summary(f) {
    const bits = [];
    if (f.kind?.label) bits.push(f.kind.label[0].toUpperCase() + f.kind.label.slice(1));
    if (f.sampled) bits.push(f.scanned.length === f.sampled ? 'scansione' : f.scanned.length ? 'testo e scansioni' : 'con testo');
    if (f.pdfa) bits.push('PDF/A-' + f.pdfa);
    return bits.join(' · ');
  }
  return { of, analyze, advise, summary };
})();

/* —— elenco dei file di uno ZIP senza aprirlo tutto (solo l'indice in fondo all'archivio) —— */
async function zipNames(file) {
  const tailLen = Math.min(file.size, 66000 + 22);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  const dv = new DataView(tail.buffer);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return null;
  let count = dv.getUint16(e + 10, true), size = dv.getUint32(e + 12, true), off = dv.getUint32(e + 16, true);
  if (off === 0xffffffff || size === 0xffffffff) return null;   // ZIP64: si legge tutto
  const cd = new Uint8Array(await file.slice(off, off + size).arrayBuffer());
  const cv = new DataView(cd.buffer), names = [];
  let q = 0;
  while (q + 46 <= cd.length && names.length < count) {
    if (cv.getUint32(q, true) !== 0x02014b50) break;
    const nl = cv.getUint16(q + 28, true), el = cv.getUint16(q + 30, true), cl = cv.getUint16(q + 32, true);
    names.push(new TextDecoder().decode(cd.subarray(q + 46, q + 46 + nl)));
    q += 46 + nl + el + cl;
  }
  return names;
}

/* =====================================================================
   Rapporti: lo stesso contenuto (titoli, testo, coppie voce/valore, tabelle) in PDF e in Word.
   Usati da «Estrai i dati», «Confronta PDF», analisi di bilancio. Stile di Officina (Manrope, accento rosso).
   blocchi: { h: 'Titolo' } · { h2: 'Sottotitolo' } · { p: 'testo', muted? } · { kv: [[voce, valore], …] }
            { table: { head: [...], rows: [[...]], widths?: [frazioni], align?: ['l'|'r'|'c'], marks?: [riga → 'add'|'del'|'mod'] } }
            { box: 'testo', tone: 'ok'|'warn'|'bad' } · { br: true } (nuova pagina)
   ===================================================================== */
const Report = (() => {
  const toneC = { ok: [0.09, 0.55, 0.35], warn: [0.72, 0.45, 0.05], bad: [0.78, 0.16, 0.16], add: [0.09, 0.55, 0.35], del: [0.78, 0.16, 0.16], mod: [0.72, 0.45, 0.05] };
  async function pdf({ title, subtitle = '', blocks = [], landscape = false, label = '' }) {
    const doc = await PDFDocument.create();
    const BF = await Brand.pdfFonts(doc);
    const F = BF.r, FB = BF.b, FX = BF.x || BF.b;
    const [W, H] = landscape ? [841.89, 595.28] : [595.28, 841.89], M = 44;
    const ink = Brand.rgbHex(Brand.C.ink), mute = Brand.rgbHex(Brand.C.muted), line = Brand.rgbHex(Brand.C.line2 || Brand.C.line), acc = Brand.rgbHex(Brand.C.accent);
    let page, y;
    const newPage = () => { page = doc.addPage([W, H]); y = H - M - 8; };
    const need = hh => { if (y - hh < M + 22) { newPage(); return true; } return false; };
    const safe = (f, t) => pdfSafe(f, String(t ?? ''));
    const wrap = (t, font, size, width) => {
      const out = [];
      for (const para of String(t ?? '').split('\n')) {
        let ln = '';
        for (const w of para.split(' ')) {
          const tryL = ln ? ln + ' ' + w : w;
          if (font.widthOfTextAtSize(safe(font, tryL), size) > width && ln) { out.push(ln); ln = w; }
          else ln = tryL;
          // parola più lunga della colonna: si spezza
          while (font.widthOfTextAtSize(safe(font, ln), size) > width && ln.length > 1) { let k = ln.length - 1; while (k > 1 && font.widthOfTextAtSize(safe(font, ln.slice(0, k)), size) > width) k--; out.push(ln.slice(0, k)); ln = ln.slice(k); }
        }
        out.push(ln);
      }
      return out;
    };
    const text = (t, { font = F, size = 10, color = ink, x = M, width = W - 2 * M, gap = 3.2 } = {}) => {
      for (const l of wrap(t, font, size, width)) { need(size + gap); page.drawText(safe(font, l), { x, y: y - size, size, font, color }); y -= size + gap; }
    };
    newPage();
    page.drawRectangle({ x: M, y: y - 3, width: 28, height: 3, color: acc }); y -= 14;
    for (const l of wrap(title, FX, 19, W - 2 * M)) { page.drawText(safe(FX, l), { x: M, y: y - 19, size: 19, font: FX, color: ink }); y -= 25; }
    if (subtitle) { text(subtitle, { size: 9.5, color: mute }); }
    y -= 8;
    for (const b of blocks) {
      if (b.br) { newPage(); continue; }
      if (b.h) { need(72); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: line }); y -= 8; text(b.h, { font: FB, size: 12.5, gap: 5 }); continue; }
      if (b.h2) { need(28); y -= 2; text(b.h2, { font: FB, size: 10.5, gap: 4 }); continue; }
      if (b.p != null) { text(b.p, { size: 9.6, color: b.muted ? mute : ink }); y -= 3; continue; }
      if (b.box) {
        const c = rgb(...(toneC[b.tone] || toneC.ok)), lines = wrap(b.box, FB, 10, W - 2 * M - 20);
        need(lines.length * 13 + 14);
        page.drawRectangle({ x: M, y: y - lines.length * 13 - 10, width: W - 2 * M, height: lines.length * 13 + 10, color: c, opacity: 0.1 });
        lines.forEach((l, i) => page.drawText(safe(FB, l), { x: M + 10, y: y - 15 - i * 13, size: 10, font: FB, color: c }));
        y -= lines.length * 13 + 18; continue;
      }
      if (b.kv) {
        const kw = Math.min(190, (W - 2 * M) * 0.36);
        for (const [k, v] of b.kv) {
          const lines = wrap(v, F, 9.5, W - 2 * M - kw - 8);
          need(lines.length * 12.5 + 3);
          page.drawText(safe(F, k), { x: M, y: y - 9.5, size: 8.8, font: F, color: mute });
          lines.forEach((l, i) => page.drawText(safe(F, l), { x: M + kw, y: y - 9.5 - i * 12.5, size: 9.5, font: F, color: ink }));
          y -= lines.length * 12.5 + 3;
        }
        y -= 4; continue;
      }
      if (b.table) {
        const { head = [], rows = [], align = [], marks = [] } = b.table;
        const nC = Math.max(head.length, ...rows.map(r => r.length));
        const fr = b.table.widths || Array(nC).fill(1 / nC), tot = fr.reduce((a, c) => a + c, 0);
        const ws = fr.map(f => (W - 2 * M) * f / tot), xs = ws.reduce((a, w, i) => (a.push(i ? a[i - 1] + ws[i - 1] : M), a), []);
        const size = b.table.size || 8.6, lh = size + 3;
        const drawRow = (cells, { bold = false, bg = null, color = ink } = {}) => {
          const font = bold ? FB : F;
          const wr = cells.map((c, i) => wrap(c, font, size, ws[i] - 8));
          const hh = Math.max(1, ...wr.map(l => l.length)) * lh + 6;
          if (need(hh) && head.length && !bold) drawRow(head, { bold: true, bg: Brand.rgbHex('#F2F1EE') });
          if (bg) page.drawRectangle({ x: M, y: y - hh, width: W - 2 * M, height: hh, color: bg, opacity: bg.__op || 1 });
          wr.forEach((lines, i) => lines.forEach((l, k) => {
            const tw = font.widthOfTextAtSize(safe(font, l), size);
            const x = align[i] === 'r' ? xs[i] + ws[i] - 4 - tw : align[i] === 'c' ? xs[i] + (ws[i] - tw) / 2 : xs[i] + 4;
            page.drawText(safe(font, l), { x, y: y - 3 - size - k * lh, size, font, color });
          }));
          y -= hh;
          page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: line });
        };
        if (head.length) { need(lh * 3); drawRow(head, { bold: true, bg: Brand.rgbHex('#F2F1EE') }); }
        rows.forEach((r, i) => {
          const mk = marks[i];
          drawRow(r.map(c => c ?? ''), mk ? { color: rgb(...toneC[mk]) } : {});
        });
        y -= 8; continue;
      }
    }
    Brand.decorate(doc, BF, { label: label || title, ml: M, mr: M, foot: 24 });
    doc.setTitle(title); doc.setProducer('file360'); doc.setCreationDate(new Date());
    return doc.save();
  }

  // Word (.docx): stessi blocchi, con stili veri (Titolo 1/2) e tabelle con intestazione ripetuta
  async function docx({ title, subtitle = '', blocks = [], landscape = false }) {
    const esc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const run = (t, { b = false, color = null, size = null } = {}) => String(t ?? '').split('\n').map((l, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${b ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('');
    const para = (t, { style = null, b = false, color = null, size = null, keep = false } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keep ? '<w:keepNext/>' : ''}</w:pPr>${run(t, { b, color, size })}</w:p>`;
    const tone = { ok: '178C59', warn: 'B87307', bad: 'C72929', add: '178C59', del: 'C72929', mod: 'B87307' };
    const pageW = landscape ? 16838 : 11906, pageH = landscape ? 11906 : 16838, mar = 1000, inner = pageW - 2 * mar;
    const table = (head, rows, widths, align = [], marks = []) => {
      const nC = Math.max(head.length, ...rows.map(r => r.length)); const fr = widths || Array(nC).fill(1 / nC), tot = fr.reduce((a, c) => a + c, 0);
      const tw = fr.map(f => Math.round(inner * f / tot));
      const cell = (t, i, { b = false, shade = null, color = null } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${tw[i]}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${align[i] === 'r' ? '<w:jc w:val="right"/>' : align[i] === 'c' ? '<w:jc w:val="center"/>' : ''}</w:pPr>${run(t, { b, color, size: 18 })}</w:p></w:tc>`;
      const border = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D9D7D2"/>`).join('')}</w:tblBorders>`;
      return `<w:tbl><w:tblPr><w:tblW w:w="${inner}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${tw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
        (head.length ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h2, i) => cell(h2, i, { b: true, shade: 'F2F1EE' })).join('')}</w:tr>` : '') +
        rows.map((r, k) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${Array.from({ length: nC }, (_, i) => cell(r[i] ?? '', i, { color: marks[k] ? tone[marks[k]] : null })).join('')}</w:tr>`).join('') + '</w:tbl><w:p/>';
    };
    let body = para(title, { style: 'Title' }) + (subtitle ? para(subtitle, { color: '6F727C', size: 19 }) : '');
    for (const b of blocks) {
      if (b.br) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      else if (b.h) body += para(b.h, { style: 'Heading1', keep: true });
      else if (b.h2) body += para(b.h2, { style: 'Heading2', keep: true });
      else if (b.p != null) body += para(b.p, { color: b.muted ? '6F727C' : null });
      else if (b.box) body += para(b.box, { b: true, color: tone[b.tone] || tone.ok });
      else if (b.kv) body += table([], b.kv.map(([k, v]) => [k, v]), [0.34, 0.66]);
      else if (b.table) body += table(b.table.head || [], b.table.rows || [], b.table.widths, b.table.align, b.table.marks);
    }
    const sect = `<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${mar}" w:right="${mar}" w:bottom="${mar}" w:left="${mar}" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>`;
    const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const styles = `${head}<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/><w:pBdr><w:top w:val="single" w:sz="24" w:space="6" w:color="E0453A"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="38"/><w:color w:val="17181C"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/><w:color w:val="17181C"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="3A3C42"/></w:rPr></w:style></w:styles>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file('_rels/.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('word/styles.xml', styles);
    zip.file('word/document.xml', `${head}<w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', `${head}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>file360</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  return { pdf, docx, DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
})();

/* =====================================================================
   DocFields — i campi principali di un documento letti dalla sua impaginazione, non dal testo «a fiume».
   Le parole tornano righe e celle con la loro posizione (dal PDF o dall'OCR); un dato si cerca accanto alla
   sua etichetta: nella stessa cella («Totale: 1.220,00»), nella cella a destra (tabelle e riepiloghi) o
   nella cella sotto (intestazioni di colonna con i valori nella riga dopo, come nelle fatture elettroniche).
   Gli importi si scelgono insieme: imponibile + IVA = totale è la prova che sono quelli giusti.
   ===================================================================== */
const DocFields = (() => {
  /* ---------- righe e celle ---------- */
  // le parole di pdf.js nello spazio della pagina come si vede (pagine ruotate comprese): x verso destra, y verso il basso
  function itemsFromPdf(tc, vp) {
    const M = vp.transform, out = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = it.transform;
      const a = M[0] * t[0] + M[2] * t[1], b = M[1] * t[0] + M[3] * t[1], c = M[0] * t[2] + M[2] * t[3], d = M[1] * t[2] + M[3] * t[3];
      const e = M[0] * t[4] + M[2] * t[5] + M[4], f = M[1] * t[4] + M[3] * t[5] + M[5];
      if (Math.abs(b) > Math.abs(a) * 0.3 || a <= 0) continue;   // testo verticale o al contrario: fuori dalle righe
      const size = Math.hypot(c, d) || it.height || 10;
      out.push({ str: it.str, x0: e, x1: e + (it.width || it.str.length * size * 0.5) * Math.hypot(M[0], M[1]), y0: f - size, y1: f });
    }
    return out;
  }
  // pagine → righe [{ y, size, cells: [{ x0, x1, text }], text }] (y cresce verso il basso)
  function layout(page) {
    const its = [];
    for (const it of page.items || []) {
      const s = (it.str ?? it.text ?? '').replace(/\s+/g, ' ');
      if (!s.trim()) continue;
      let x0, x1, y, size;
      if (it.transform) {
        const [a, b, c, d, e, f] = it.transform;
        if (Math.abs(b) > Math.abs(a) * 0.3) continue;   // testo ruotato: fuori dalle righe
        size = Math.hypot(c, d) || it.height || 10; x0 = e; x1 = e + (it.width || s.length * size * 0.5); y = (page.height || 842) - f;
      } else { x0 = it.x0; x1 = it.x1; y = it.y1; size = Math.max(4, it.y1 - it.y0); }
      // OCR: i bordi dei riquadri letti come «|» e i trattini sparsi non sono testo
      if (!it.transform && !it.str) { const c = s.replace(/[|¦]/g, '').trim(); if (!c || /^[\[\]_—–\-.,'’"]+$/.test(c)) continue; its.push({ s: c, x0, x1, y, size }); continue; }
      its.push({ s, x0, x1, y, size });
    }
    its.sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const lines = [];
    for (const it of its) {
      let L = lines.length ? lines[lines.length - 1] : null;
      if (!L || Math.abs(it.y - L.y) > Math.max(2, 0.45 * Math.min(it.size, L.size))) { L = { y: it.y, size: it.size, its: [] }; lines.push(L); }
      L.its.push(it); L.size = Math.max(L.size, it.size);
    }
    for (const L of lines) {
      L.its.sort((a, b) => a.x0 - b.x0);
      const cells = [];
      for (const it of L.its) {
        const c = cells[cells.length - 1], gap = c ? it.x0 - c.x1 : Infinity, sz = Math.max(it.size, c?.size || 0);
        if (c && gap < 1.05 * sz) { c.text += (gap > 0.12 * sz && !/\s$/.test(c.text) && !/^\s/.test(it.s) ? ' ' : '') + it.s; c.x1 = Math.max(c.x1, it.x1); c.size = sz; }
        else cells.push({ x0: it.x0, x1: it.x1, text: it.s, size: it.size });
      }
      cells.forEach(c => { c.text = c.text.replace(/\s+/g, ' ').trim(); });
      L.cells = cells.filter(c => c.text);
      L.text = L.cells.map(c => c.text).join('   ');
      delete L.its;
    }
    return lines.filter(L => L.cells.length);
  }

  /* ---------- valori ---------- */
  const AMT = /^(?:(?:€|eur(?:o)?)\s*)?([-−–]?\s*\d{1,3}(?:[.\s']\d{3})*,\d{2}|[-−–]?\d+,\d{2})(?:\s*(?:€|eur(?:o)?))?$/i;
  const AMT_EN = /^(?:(?:€|eur|usd|\$)\s*)?([-−]?\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*(?:€|eur))?$/i;
  const amountOf = (s) => {
    s = String(s).trim().replace(/\s*\(.*\)$/, '');
    let m = AMT.exec(s); if (m) return +m[1].replace(/[−–]/, '-').replace(/[.\s']/g, '').replace(',', '.');
    m = AMT_EN.exec(s); if (m) return +m[1].replace(/[−]/, '-').replace(/,/g, '');
    // letture dell'OCR: «1.220.00», «1,220,00», «1 220,00»
    m = /^(?:(?:€|eur(?:o)?)\s*)?([-−]?\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2})(?:\s*(?:€|eur(?:o)?))?$/i.exec(s);
    if (m) { const t = m[1].replace(/[−]/, '-').replace(/\s/g, ''); const k = Math.max(t.lastIndexOf('.'), t.lastIndexOf(',')); return +(t.slice(0, k).replace(/[.,]/g, '') + '.' + t.slice(k + 1)); }
    return null;
  };
  // un importo dentro un testo più lungo (il primo dopo una posizione)
  const AMT_IN = /(?:€\s*|eur(?:o)?\s+)?([-−]?\d{1,3}(?:\.\d{3})+,\d{2}|[-−]?\d{1,9},\d{2})(?![\d,])(?:\s*(?:€|eur(?:o)?))?/i;
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const pad = x => String(x).padStart(2, '0');
  const isoOf = (d, m, y) => { if (y < 100) y += y > 50 ? 1900 : 2000; return d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1950 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : null; };
  function dateIn(s) {
    let m = /\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})\b/.exec(s); if (m) { const v = isoOf(+m[1], +m[2], +m[3]); if (v) return { iso: v, at: m.index, len: m[0].length }; }
    m = new RegExp(`\\b(\\d{1,2})(?:°|º)?\\s+(${MESI.join('|')})\\s+(\\d{4})\\b`, 'i').exec(s); if (m) { const v = isoOf(+m[1], MESI.indexOf(m[2].toLowerCase()) + 1, +m[3]); if (v) return { iso: v, at: m.index, len: m[0].length }; }
    m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s); if (m) { const v = isoOf(+m[3], +m[2], +m[1]); if (v) return { iso: v, at: m.index, len: m[0].length }; }
    m = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i').exec(s); if (m) { const v = isoOf(+m[2], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[3]); if (v) return { iso: v, at: m.index, len: m[0].length }; }
    return null;
  }
  // date scritte in lettere negli atti: «L'anno duemilaventisei, il giorno quattordici del mese di luglio»
  const NUMW = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove', 'venti'];
  function wordNum(w) {
    w = w.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, ''); if (/^\d+$/.test(w)) return +w;
    if (w === 'primo') return 1;
    const i = NUMW.indexOf(w); if (i > 0) return i;
    let m = /^(venti|trenta)(.*)$/.exec(w); if (m) { const base = m[1] === 'venti' ? 20 : 30; const r = m[2].replace(/^(?=[aeiou])/, ''); if (!r) return base; const k = NUMW.indexOf(r) > 0 ? NUMW.indexOf(r) : NUMW.indexOf('u' + r) > 0 ? NUMW.indexOf('u' + r) : -1; return k > 0 && k < 10 ? base + k : null; }
    m = /^duemila(.*)$/.exec(w); if (m) { if (!m[1]) return 2000; const r = wordNum(m[1]); return r != null ? 2000 + r : null; }
    m = /^millenovecento(.*)$/.exec(w); if (m) { const r = m[1] ? wordNum(m[1]) : 0; return r != null ? 1900 + r : null; }
    return null;
  }
  function deedDate(text) {
    const m = /l['’]\s?anno\s+(\d{4}|[a-z]+)[\s,]+(?:addì\s+)?(?:il\s+giorno\s+)?(\d{1,2}|[a-zà-ÿ]+)\s+(?:\(\s*\d+\s*\)\s+)?(?:del\s+mese\s+di\s+)?([a-z]+)/i.exec(text);
    if (!m) return null;
    const y = wordNum(m[1]), d = wordNum(m[2]), mo = MESI.indexOf(m[3].toLowerCase()) + 1;
    return y && d && mo ? isoOf(d, mo, y) : null;
  }
  // numero di documento: cifre con prefissi, barre, trattini (FPA 12/26, 2026/145, A/0089, NC-4/2026, INV-20931)
  const NUM_RE = /^(?:[A-Z]{1,6}[ \-_\/.]?)?[A-Z]{0,3}\d[\w\/\-._]{0,24}(?: ?\/ ?\d{2,4})?$/i;
  function numberIn(s) {
    s = s.replace(/^[\s:.°º#-]+/, '').replace(/\s+(?:del|dd\.?|data|in\s+data|emess[ao]|date)\b[\s\S]*$/i, '').trim();
    const m = /^((?:[A-Z]{1,6}[ \-_\/.]?)?[A-Z]{0,3}\d[\w\/\-._]{0,24}(?: ?\/ ?\d{2,4})?)/i.exec(s);
    if (!m) return null;
    const v = m[1].replace(/[.\-\/_]+$/, '');
    if (!/\d/.test(v) || dateIn(v)?.at === 0 || /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(v)) return null;
    return v;
  }

  /* ---------- etichette e valori vicini ---------- */
  // tutte le coppie etichetta → valore del documento, cercando nella cella, a destra e sotto
  function pairs(lines, labelRe, accept, { below = 3, right = 3, sumRows = false } = {}) {
    const out = [];
    lines.forEach((L, li) => {
      L.cells.forEach((c, ci) => {
        labelRe.lastIndex = 0;
        const m = labelRe.exec(c.text); if (!m) return;
        const after = c.text.slice(m.index + m[0].length);
        // nella stessa cella, dopo l'etichetta
        const label = c.text.slice(Math.max(0, m.index - 16), m.index + m[0].length), lab = c.text;
        const v0 = accept(after.replace(/^\s*[:=\-–]?\s*/, ''), true);
        if (v0 != null) out.push({ v: v0, score: 3, li, ci, page: L.page, where: 'cella', label, lab });
        // l'etichetta deve finire la cella (o quasi) per prendere il valore altrove
        if (after.replace(/[\s:.€()%\d-]/g, '').length > 3) return;
        const headerRow = L.cells.length >= 3 && L.cells.every(d => !/\d/.test(d.text));
        for (let k = 1; !headerRow && k <= right && ci + k < L.cells.length; k++) {
          const v = accept(L.cells[ci + k].text, false);
          if (v != null) { out.push({ v, score: 2.6 - k * 0.2, li, ci: ci + k, page: L.page, where: 'destra', label, lab }); break; }
        }
        // sotto: una cella che si sovrappone in orizzontale all'etichetta, nelle righe che seguono
        const below2 = headerRow ? Math.max(below, 6) : below, found = [];
        for (let k = 1; k <= below2 && li + k < lines.length; k++) {
          const N = lines[li + k]; if (N.page !== L.page || N.y - L.y > (L.size + N.size) * 2.4 * k) break;
          // in una tabella: uno stacco molto più ampio dell'interlinea delle righe vuol dire che la tabella è finita
          if (headerRow && found.length) { const f0 = lines[found[0].li], fl = lines[found[found.length - 1].li], gap = Math.max(4, f0.y - L.y); if (N.y - fl.y > gap * 2.2) break; }
          // la colonna dell'etichetta: in una riga di intestazioni va fino all'inizio dell'intestazione successiva
          const nx = headerRow ? L.cells[ci + 1] : null;
          const span = headerRow ? [c.x0 - c.size, nx ? nx.x0 - c.size * 0.3 : Infinity] : [c.x0 - c.size, c.x1 + c.size];
          const cand = N.cells.filter(d => headerRow ? (d.x1 > span[0] && d.x1 <= span[1] + c.size * 0.3 && (d.x0 + d.x1) / 2 >= span[0]) : Math.min(d.x1, span[1]) - Math.max(d.x0, span[0]) > 0);
          for (const d of cand) { const v = accept(d.text, false); if (v != null) { found.push({ v, score: 2.2 - k * 0.3 + (/^tot(?:ale|ali)\b/i.test(N.cells[0].text) ? 1 : 0), li: li + k, ci: N.cells.indexOf(d), page: L.page, where: 'sotto', label, lab }); break; } }
          if (found.length && !headerRow) break;
          // la riga sotto è un'altra riga di etichette: ci si ferma
          if (N.cells.length >= 2 && N.cells.every(d => !/\d/.test(d.text))) break;
        }
        if (found.length) {
          const tot = found.find(f => /^tot(?:ale|ali)\b/i.test(lines[f.li].cells[0].text));
          if (sumRows && headerRow && !tot && found.length > 1 && found.every(f => typeof f.v === 'number')) out.push({ ...found[0], v: Math.round(found.reduce((a, f) => a + f.v, 0) * 100) / 100, score: found[0].score + 0.3, where: 'somma' });
          else out.push(found.sort((a, b) => b.score - a.score)[0]);
        }
      });
    });
    return out.sort((a, b) => b.score - a.score);
  }
  const acceptAmount = (s, inCell) => { const t = s.trim(); if (!inCell) return amountOf(t); const m = AMT_IN.exec(t); if (!m || m.index > 12) return null; return amountOf(m[0]); };
  const acceptDate = (s, inCell) => { const t = s.replace(/^[\s:.,\-–]+/, ''); const d = dateIn(t); return d && d.at <= (inCell ? 1 : 3) ? d.iso : null; };
  const acceptNumber = (s, inCell) => { const t = s.trim(); if (!inCell && !NUM_RE.test(t)) return null; return numberIn(t); };

  /* ---------- etichette ---------- */
  const LBL = {
    totale: /(?:^|\b)(?:totale\s+(?:documento|fattura|nota\s+di\s+credito|preventivo|ricevuta|da\s+pagare|a\s+pagare|complessivo|generale|dovuto|ivato|lordo|ordine|offerta|eur(?:o)?|€|importo)|importo\s+(?:totale|complessivo|da\s+pagare|dovuto)|total(?:e)?\s+(?:due|amount|invoice)|amount\s+due|saldo\s+finale(?:\s+(?:euro|contabile))?|saldo\s+(?:da\s+addebitare|a\s+debito|dovuto|da\s+pagare)|netto\s+in\s+busta|spesa\s+complessiva|importo\s+contrattuale|stanziamento\s+complessivo|totale\s+da\s+pagare\s+entro|total(?:e)?)(?![\wÀ-ÿ])\s*(?:eur(?:o)?|€)?\s*:?/i,
    imponibile: /(?:^|\b)(?:totale\s+imponibile|imponibile(?:\s+iva)?|base\s+imponibile|totale\s+(?:prestazion[ei]|merce|servizi|imponibile\/netto|netto\s+merce)|subtotal|sub\s*totale)(?![\wÀ-ÿ])\s*:?/i,
    iva: /(?:^|\b)(?:totale\s+(?:iva|imposta)|i\.?v\.?a\.?(?:\s*\d{1,2}(?:[.,]\d+)?\s*%)?|imposta(?:\s+\d{1,2}\s*%)?|vat(?:\s*\([^)]*\))?(?:\s*\d{1,2}\s*%)?)\s*:?/i,
    netto: /(?:^|\b)netto\s+(?:a|da)\s+pagare(?![\wÀ-ÿ])\s*:?/i,
    ritenuta: /(?:^|\b)ritenuta(?:\s+d['’]\s?acconto)?\b[^:\d]{0,12}(?:\d{1,2}\s*%)?\s*:?/i,
    bollo: /(?:^|\b)(?:importo\s+)?(?:marca\s+da\s+)?bollo(?![\wÀ-ÿ])\s*:?/i,
    scadenza: /(?:^|\b)(?:data\s+(?:di\s+)?scadenza|scadenze|scadenza(?:\s+(?:del\s+)?(?:pagamento|validit[àa]|rata|termine))?|scad\.|due\s+date|valid\w*(?:[^\d\n]{0,40}?\d+\s+giorni)?[^\d\n]{0,40}?(?:fino\s+al|entro\s+il)|valido\s+fino\s+al|scade\s+il|da\s+pagare\s+entro\s+il|entro\s+(?:e\s+non\s+oltre\s+)?il)(?![\wÀ-ÿ])\s*:?/i,
  };

  /* ---------- il documento ---------- */
  function analyze(pages) {
    const all = [];
    pages.forEach((pg, i) => { const ls = layout(pg); ls.forEach(L => { L.page = pg.p || i + 1; }); all.push(...ls); });
    const text = all.map(L => L.text).join('\n');
    const first = all.filter(L => L.page === all[0]?.page);
    const res = { lines: all, text };
    // il titolo: righe in alto con il tipo del documento
    const kind = typeof DocKind !== 'undefined' ? DocKind.classify(text, { title: titleOf(first) }) : {};
    res.kind = kind;
    const type = kind.type;
    // importi
    const A = {};
    for (const k of ['totale', 'imponibile', 'iva', 'netto', 'ritenuta', 'bollo']) A[k] = pairs(all, new RegExp(LBL[k].source, 'gi'), acceptAmount, { sumRows: k === 'imponibile' || k === 'iva' });
    // le colonne delle aliquote («%IVA», «IVA %», «Aliquota») danno percentuali, non importi
    const rateHdr = l => /aliq/i.test(l) || (/%/.test(l) && !/\d\s*%/.test(l));
    for (const k of ['iva', 'imponibile']) A[k] = A[k].filter(x => x.where === 'cella' || !rateHdr(x.lab || x.label || ''));
    // «Imponibile IVA», «IVA inclusa», «esente IVA» non sono l'imposta
    A.iva = A.iva.filter(x => !/imponibil\w*\s*$|imponibil\w*\s+i\.?v\.?a|esent|inclus|compres/i.test(x.label || ''));
    // un'etichetta di IVA dentro «totale imponibile/iva» non conta per l'IVA; e «Totale imposta» non è il totale
    A.totale = A.totale.filter(x => !/imponibile|imposta|\biva\b|\bvat\b|prestazion|merce|servizi/i.test((x.lab || '').replace(/i\.?v\.?a\.?\s+(?:inclusa|compresa)|(?:inclusa|compresa)\s+i\.?v\.?a/gi, '')) && !/prezzo\s+totale|totale\s+riga|importo\s+riga|valore\s+totale\s+riga/i.test(x.label || ''));
    // «Totale … IVA inclusa» è il totale; «Totale … (IVA esclusa)» è l'imponibile
    A.totale.push(...pairs(all, /(?:^|\b)(?:totale|importo|prezzo)?[^:\n\d]{0,30}?\(?(?:i\.?v\.?a\.?\s+(?:inclusa|compresa)|(?:inclusa|compresa)\s+i\.?v\.?a\.?|ivat[oa])\)?\s*:?/gi, acceptAmount).map(x => ({ ...x, score: x.score + 0.2 })));
    A.imponibile.push(...pairs(all, /(?:^|\b)(?:totale|importo|prezzo)[^:\n\d]{0,30}?\(?(?:i\.?v\.?a\.?\s+esclusa|esclus[ao]\s+i\.?v\.?a\.?|al\s+netto\s+(?:dell['’]\s?)?i\.?v\.?a\.?|oltre\s+i\.?v\.?a\.?)\)?\s*:?/gi, acceptAmount));
    A.totale.sort((a, b) => b.score - a.score); A.imponibile.sort((a, b) => b.score - a.score);
    // senza un totale con l'etichetta: l'«Importo», «la somma di», «pari a», «corrispettivo»
    if (!A.totale.length) A.totale = pairs(all, /(?:^|\b)(?:importo(?:\s+(?:del\s+mandato|da\s+pagare|lordo))?|la\s+somma\s+(?:complessiva\s+)?di|pari\s+a|corrispettivo(?:\s+(?:di|pari\s+a))?)(?![\wÀ-ÿ])\s*:?/gi, acceptAmount).map(x => ({ ...x, score: x.score - 1 }));
    res.amounts = reconcile(A, type, all);
    // data, numero, scadenza
    res.date = docDate(all, kind, text);
    res.number = docNumber(all, kind, text);
    const sc = pairs(all, new RegExp(LBL.scadenza.source, 'gi'), acceptDate);
    res.due = sc.length ? sc[0].v : null;
    // chi emette e a chi è diretto
    const pp = parties(all, kind, text);
    res.issuer = pp.issuer; res.recipient = pp.recipient;
    return res;
  }
  const cellText = (lines, li, ci, labelOf) => { const L = lines[li]; if (!L) return ''; if (!labelOf) return L.cells[ci]?.text || ''; return L.text; };
  function titleOf(lines) {
    // le prime righe con le parole del tipo (FATTURA, DETERMINAZIONE, PREVENTIVO…), preferendo il carattere più grande
    const top = lines.slice(0, 18);
    const KW = /\b(fattura|nota\s+di\s+credito|invoice|preventivo|offerta|ricevuta|quietanza|determin(?:a|azione)|deliberazione|delibera|ordinanza|decreto|mandato\s+di\s+pagamento|contratto|verbale|avviso\s+pubblico|bando|cartella\s+di\s+pagamento|estratto\s+(?:di\s+)?conto|cedolino|busta\s+paga|certificazione\s+unica|visura|durc|modello\s+(?:di\s+pagamento\s+unificato\s+)?f\s?24|f24)\b/i;
    const cand = top.filter(L => KW.test(L.text));
    if (!cand.length) return '';
    const starts = L => { const m = KW.exec(L.text); return m && m.index <= 6 ? 1 : 0; };
    cand.sort((a, b) => starts(b) - starts(a) || b.size - a.size || a.y - b.y);
    return cand[0].text;
  }

  // gli importi: le etichette danno i candidati, la somma imponibile + IVA (+ bollo) = totale decide
  function reconcile(A, type, lines) {
    const best = arr => arr.length ? arr[0].v : null;
    const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.011 + Math.abs(b) * 0.00002;
    const T = A.totale.map(x => x.v), I = A.imponibile.map(x => x.v), V = A.iva.map(x => x.v), B = A.bollo.map(x => x.v);
    let tot = null, imp = null, iva = null, conf = 'bassa';
    // terne coerenti, dal totale con l'etichetta più forte
    outer: for (const t of uniq(T)) for (const i of uniq(I)) {
      for (const v of uniq(V.length ? V : [0])) for (const b of [0, ...uniq(B)]) {
        if (near(i + v + b, t) && (v === 0 || v <= i * 0.25 + 0.02)) { tot = t; imp = i; iva = v || (V.length ? 0 : null); conf = 'alta'; break outer; }
      }
    }
    if (tot == null) {
      tot = best(A.totale);
      imp = best(A.imponibile); iva = best(A.iva);
      // totale mancante ma imponibile e IVA presenti
      if (tot == null && imp != null && iva != null) { tot = Math.round((imp + iva) * 100) / 100; conf = 'media'; }
      // imponibile + IVA trovati solo in parte: si ricava quello che manca
      if (tot != null && imp != null && iva == null && imp < tot) { const d = Math.round((tot - imp) * 100) / 100; if ([0.22, 0.1, 0.05, 0.04].some(r => Math.abs(imp * r - d) < 0.02)) iva = d; }
      if (tot != null && imp == null && iva != null && iva < tot) imp = Math.round((tot - iva) * 100) / 100;
      if (tot != null && (imp != null || iva != null)) conf = 'media';
      else if (tot != null) conf = A.totale[0]?.score >= 2.5 ? 'media' : 'bassa';
    }
    // IVA uguale a zero senza etichetta (forfettari): niente IVA
    if (iva === 0 && !V.length) iva = null;
    if (imp != null && tot != null && imp > tot + 0.01) imp = null;
    return { totale: tot, imponibile: imp, iva, netto: best(A.netto), ritenuta: A.ritenuta.length ? Math.abs(A.ritenuta[0].v) : null, bollo: best(A.bollo), conf };
  }
  const uniq = a => [...new Set(a)];

  function docDate(lines, kind, text) {
    const L = [/(?:^|\b)(?:data\s+(?:del\s+|della\s+|dell['’]\s?)?(?:documento|fattura|emissione|doc\.?|ricevuta|atto|richiesta|di\s+notifica|versamento|estratto(?:\s+conto)?|registrazione|protocollo|seduta|stampa)|invoice\s+date|date\s+of\s+issue|data(?!\s+(?:di\s+|del\s+|dell['’]\s?)?(?:scadenza|nascita|addebito|accredito|valuta|pagamento|consegna|inizio|fine|scad|decorrenza|validit|ultimo|termine|bonifico|operazione)))(?![\wÀ-ÿ])\s*:?/gi];
    const cands = [];
    for (const re of L) for (const x of pairs(lines, re, acceptDate)) cands.push(x);
    // «n. 145 del 12/03/2026», «… DEL 03/10/2026», «Carini, 18/09/2026», «al 30/09/2026»
    const top = lines.slice(0, 40);
    top.forEach((Ln, li) => {
      let m = /\b(?:nr\.?|numero|n°|n\.?(?![a-z]))\s*[\w\/\-.]+\s+(?:del|dd\.?|in\s+data)\s+(.{6,22})/i.exec(Ln.text);
      // «… della fattura n. 88 del …» in una lettera, «DDT n. 101 del …» in una fattura: è un altro documento citato
      const cited = m && (() => { const before = Ln.text.slice(0, m.index).toLowerCase(); const w = /(fattura|nota\s+di\s+credito|ddt|documento\s+di\s+trasporto|ordine|contratto|delibera(?:zione)?|determina(?:zione)?|preventivo|offerta|ricevuta|protocollo|prot\.?|verbale|ordinanza|decreto|mandato)\s*$/.exec(before.trim()); if (!w) return /\b(?:rif\.?|riferimento|storno|relativ[oa]|oggetto)\b/.test(before); const ty = { fattura: 'fattura', 'nota di credito': 'notacredito', delibera: 'delibera', deliberazione: 'delibera', determina: 'determina', determinazione: 'determina', preventivo: 'preventivo', offerta: 'preventivo', ricevuta: 'ricevuta', contratto: 'contratto', verbale: 'verbale', ordinanza: 'ordinanza', decreto: 'decreto', mandato: 'mandato' }[w[1].replace(/\s+/g, ' ')]; return !ty || (kind.type && ty !== kind.type) || /\b(?:rif\.?|riferimento|storno|relativ[oa]|oggetto|sollecito)\b/.test(before); })();
      if (m && !cited) { const d = dateIn(m[1]); if (d) cands.push({ v: d.iso, score: 2.9 - li * 0.01, li }); }
      m = /^(?:[A-Z][\wÀ-ÿ'’ ]{2,30}),\s+(?:l[iì]\s+)?(.{6,22})$/i.exec(Ln.text.trim());
      if (m) { const d = dateIn(m[1]); if (d && d.at === 0) cands.push({ v: d.iso, score: 2.0, li }); }
      m = /\b(?:al|del)\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s*$/i.exec(Ln.text);
      if (m && /estratto|conto|saldo|situazione/i.test(Ln.text)) { const d = dateIn(m[1]); if (d) cands.push({ v: d.iso, score: 2.4, li }); }
    });
    { const dd = deedDate(lines.slice(0, 30).map(x => x.text).join(' ')); if (dd) cands.push({ v: dd, score: 2.7, li: 0 }); }
    // cedolini e F24: la data del documento non è una data di pagamento o di accredito
    const bad = new Set();
    lines.forEach(Ln => { const m = /(?:accredito|valuta|nat[oa]\s+il|scadenza|scade|entro\s+il|fino\s+al|dal\s+\d|periodo)[^\n]{0,30}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(Ln.text); if (m) { const d = dateIn(m[1]); if (d) bad.add(d.iso); } });
    const ok = cands.filter(c => !bad.has(c.v) || c.score >= 2.9).sort((a, b) => b.score - a.score || a.li - b.li);
    if (ok.length) return ok[0].v;
    if (kind.type === 'cedolino') return null;
    const k = kind.date; return k && !bad.has(k) ? k : (k || null);
  }

  function docNumber(lines, kind, text) {
    const t = kind.type;
    const head = {
      fattura: /(?:^|\b)(?:(?:fattura|fatt\.|ft\.)(?:\s+(?:elettronica|immediata|differita|accompagnatoria))?\s*(?:nr\.?|n°|num(?:ero)?\.?|n\.?(?![a-z])|#)|n\.?\s*fattura|numero\s+(?:documento|fattura)|n\.?\s*documento|documento\s+n\.?|invoice\s+(?:no\.?|number|#|n\.?)|nr\.)\s*:?/gi,
      notacredito: /(?:^|\b)(?:nota\s+di\s+credito\s*(?:n\.?|nr\.?|n°|num(?:ero)?\.?)|numero\s+documento)\s*:?/gi,
      preventivo: /(?:^|\b)(?:preventivo|offerta)\s*(?:n\.?|nr\.?|n°|num(?:ero)?\.?)\s*:?/gi,
      ricevuta: /(?:^|\b)(?:ricevuta|quietanza)(?:\s+di\s+pagamento|\s+fiscale)?\s*(?:nr\.?|n°|n\.?(?![a-z]))\s*:?/gi,
      determina: /(?:^|\b)(?:determin(?:a|azione)(?:\s+(?:dirigenziale|sindacale|del\s+responsabile))?\s*(?:nr\.?|n°|numero|n\.?(?![a-z])))\s*:?/gi,
      delibera: /(?:^|\b)(?:deliberazione|delibera|verbale\s+di\s+deliberazione)[^\n]{0,60}?(?:nr\.?|n°|n\.?(?![a-z]))\s*:?|^n\.\s*(?=\d)/gi,
      mandato: /(?:^|\b)(?:mandato(?:\s+di\s+pagamento)?\s*(?:nr\.?|n°|n\.?(?![a-z]))|n\.?\s*mandato)\s*:?/gi,
      contratto: /(?:^|\b)(?:rep(?:ertorio)?\.?\s*(?:nr\.?|n°|n\.?(?![a-z]))|contratto\s*(?:n\.?|nr\.?))\s*:?/gi,
      durc: /(?:^|\b)numero\s+protocollo\s*:?/gi,
      cartella: /(?:^|\b)(?:cartella(?:\s+di\s+pagamento)?\s*(?:nr\.?|n°|n\.?(?![a-z]))|numero\s+cartella)\s*:?/gi,
      bando: /(?:^|\b)prot(?:ocollo)?\.?\s*(?:gen\.?\s*)?(?:nr\.?|n°|n\.?(?![a-z]))\s*:?/gi,
      lettera: /(?:^|\b)prot(?:ocollo)?\.?\s*(?:gen\.?\s*)?(?:nr\.?|n°|n\.?(?![a-z]))\s*:?/gi,
      ordinanza: /(?:^|\b)ordinanza[^\n]{0,20}?(?:nr\.?|n°|n\.?(?![a-z]))\s*:?/gi,
      decreto: /(?:^|\b)decreto[^\n]{0,20}?(?:nr\.?|n°|n\.?(?![a-z]))\s*:?/gi,
      verbale: /(?:^|\b)verbale[^\n]{0,20}?(?:nr\.?|n°|n\.?(?![a-z]))\s*:?/gi,
    }[t];
    const cands = [];
    if (head) for (const x of pairs(lines, head, acceptNumber)) cands.push(x);
    // la colonna «Numero» / «Numero documento» / «N.» in una testata a tabella
    if (!cands.length && ['fattura', 'notacredito', 'preventivo', 'ricevuta'].includes(t)) for (const x of pairs(lines, /^(?:numero|n\.|n°|nr\.?)(?:\s*:|$)/gi, acceptNumber)) cands.push({ ...x, score: x.score - 0.5 });
    if (cands.length) return cands[0].v;
    return kind.number || null;
  }

  // chi emette il documento e a chi è diretto
  const FORMS = /\b(?:s\.?\s?r\.?\s?l\.?(?:\s?s\.?)?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?c\.?\s?a\.?\s?r\.?\s?l\.?|soc\.?\s+coop\.?|societ[àa]\s+cooperativa|onlus|a\.?s\.?d\.?|a\.?p\.?s\.?|ltd|gmbh|inc\.?|s\.?a\.?|sagl|di\s+[A-Z][a-z]+\s+[A-Z][a-z]+)\b/i;
  const ENTE = /^(?:comune|citt[àa]|provincia|regione|libero\s+consorzio|azienda|asp|asl|universit[àa]|ministero|agenzia|camera\s+di\s+commercio|tribunale|corte|t\.?a\.?r\.?|inps|inail|istituto|banca|ente)\b/i;
  const NOT_NAME = /^(?:fattura|invoice|nota\s+di\s+credito|preventivo|documento|pagina|page|data|totale|spett|cliente|destinatario|oggetto|mod(?:ello)?|cedolino|ricevuta|determin|delibera|verbale|contratto|avviso|cartella|estratto|visura|durc|f24|settore|servizio|ufficio|registro|n\.|prot|rep\.|contribuente|delega|sezione|codice|intestatario|riepilog|modalit|descrizione|quantit|importo|prezzo)/i;
  const tidy = s => s.replace(/\s+/g, ' ').replace(/^(?:spett\.?\s?le|spettabile|egr\.?(?:egio)?|gent\.?(?:ile)?|sig\.?(?:ra|nor[ae]?)?\.?|ditta|alla\s+cortese\s+attenzione\s+(?:di|del(?:la)?)|c\.a\.)\s+/i, '').replace(/[\s,;:–-]+$/, '').replace(/\s+[-–]\s+.*$/, '').trim().slice(0, 80);
  const titleCase = s => s === s.toUpperCase() && ENTE.test(s) ? s.toLowerCase().replace(/(^|[\s'’(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Di|Del|Della|Degli|Delle|Dell'|Ed|E|Per|Il|La)\b/g, w => w.toLowerCase()) : s;
  const ADDR = /^(?:via|viale|v\.le|piazza|p\.zza|corso|c\.so|largo|contrada|c\.da|vicolo|strada|lungomare|località|loc\.)\s|\b(?:via|viale|piazza|corso|c\.so|p\.zza|largo|contrada|c\.da|lungomare)\s+[^\d,]{2,40}\s\d{1,4}\b/i;
  const looksName = s => s && s.length >= 3 && !NOT_NAME.test(s) && !ADDR.test(s) && !/:\s*$/.test(s) && !/\d{4,}|@|https?:|www\.|\d[.,]\d{2}\b|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\b(?:tel|fax|cap|euro|eur)\b/i.test(s) && /[A-Za-zÀ-ÿ]{3}/.test(s);
  function parties(lines, kind, text) {
    const t = kind.type, first = lines.filter(L => L.page === lines[0]?.page);
    let issuer = null, recipient = null;
    const valueAfter = (re, accept = looksName, opts) => { const p = pairs(lines, re, (s) => { const v = tidy(s.replace(/^\s*[:\-]?\s*/, '')); return v && accept(v) ? v : null; }, opts); return p.length ? p[0].v : null; };
    // riquadri della fattura elettronica: «Cedente/prestatore» e «Cessionario/committente», con «Denominazione» sotto
    const colOf = re => { for (const [li, L] of lines.entries()) for (const c of L.cells) if (re.test(c.text)) return { li, x0: c.x0, x1: c.x1, page: L.page }; return null; };
    const inColumn = (col, labelRe) => {
      if (!col) return null;
      for (let li = col.li + 1; li < Math.min(lines.length, col.li + 14); li++) {
        const L = lines[li]; if (L.page !== col.page) break;
        for (const c of L.cells) {
          if (c.x0 < col.x0 - 20 || c.x0 > col.x1 + 120) continue;
          const m = labelRe.exec(c.text); if (m) { const v = tidy(c.text.slice(m.index + m[0].length)); if (v) return v; }
        }
      }
      return null;
    };
    const ced = colOf(/^cedente\s*\/?\s*prestatore|^fornitore\b/i), ces = colOf(/^cessionario\s*\/?\s*committente|^cliente\s*\(|^committente\b/i);
    if (ced) issuer = inColumn(ced, /^(?:denominazione|ragione\s+sociale|cognome\s+nome|nome\s+e\s+cognome)\s*:?\s*/i);
    if (ces) recipient = inColumn(ces, /^(?:denominazione|ragione\s+sociale|cognome\s+nome|nome\s+e\s+cognome)\s*:?\s*/i);
    // l'ente o la ditta indicati come tali
    if (!issuer) issuer = valueAfter(/(?:^|\b)(?:ente\s+creditore|ente\s+emittente|emittente|mittente|fornitore|venditore|prestatore)(?![\wÀ-ÿ])\s*:?/gi, v => looksName(v) && !/^(?:\(|fornitore\b)/i.test(v), { below: 1, right: 2 });
    // DURC, visura: il soggetto è la «Denominazione / ragione sociale»
    if (!issuer && ['durc', 'visura'].includes(t)) issuer = valueAfter(/(?:^|\b)denominazione(?:\s*\/\s*ragione\s+sociale)?\b\s*:?/gi);
    // F24: il contribuente (cognome e nome o denominazione)
    if (!issuer && t === 'f24') { const m = /cognome,?\s+denominazione\s+o\s+ragione\s+sociale\s*:?\s*([A-ZÀ-Ý][A-ZÀ-Ý'’.&\- ]{1,60}?)(?:\s{2,}|\s+nome\s*:?\s*([A-ZÀ-Ý'’\- ]{2,40}))?\s*$/im.exec(text); if (m) issuer = (m[1].trim() + (m[2] ? ' ' + m[2].trim() : '')).trim(); }
    // atti della PA: l'ente dell'intestazione
    const PA = ['determina', 'delibera', 'ordinanza', 'decreto', 'bando', 'verbale', 'mandato', 'contratto', 'lettera'];
    if (!issuer && PA.includes(t)) {
      const hd = first.slice(0, 8).find(L => ENTE.test(L.text.trim()) && L.text.length < 60);
      if (hd) { const cs = hd.cells.map(c => c.text); let n = cs[0]; for (let k = 1; k < cs.length && (/^(?:di|del|della|dello|dei|degli|delle|d['’])\s/i.test(cs[k]) || /^[\wÀ-ÿ]+$/.test(n)); k++) n += ' ' + cs[k]; issuer = titleCase(tidy(n)); }
    }
    // altrimenti: il nome più in evidenza in alto (carattere più grande), che non sia il titolo del documento
    if (!issuer) {
      const top = first.slice(0, 14).filter(L => L.y < (first[0]?.y || 0) + 260);
      const cand = top.flatMap(L => L.cells.map(c => ({ c, L }))).filter(({ c }) => looksName(tidy(c.text)) && !/^(?:spett|egr|gent|al\s|alla\s|ai\s|cliente|destinatario|intestat|bill\s+to)/i.test(c.text))
        .map(({ c, L }) => ({ v: tidy(c.text), size: c.size, y: L.y, x: c.x0, form: FORMS.test(c.text) || ENTE.test(c.text) }));
      cand.sort((a, b) => b.size - a.size || (b.form - a.form) || a.y - b.y);
      if (cand.length && cand[0].size >= (cand[cand.length - 1].size || 0)) issuer = titleCase(cand[0].v.split(/\s+[-–]\s+/)[0]);
    }
    if (!issuer && kind.party) issuer = kind.party;
    // il destinatario: dopo «Spett.le», «Cliente», «Destinatario», «Intestata a», «Bill to», «Beneficiario», «Dipendente», «Intestatario», «Al …»
    if (!recipient) {
      const R = /(?:^|\b)(?:spett(?:\.?\s?le|abile)|cliente|destinatario(?:\s+(?:dell['’]\s?avviso|avviso|del\s+pagamento))?|intestat[ao]\s+a|intestatario(?:\s+(?:fattura|documento|del\s+documento|della\s+fattura))?|titolare|bill\s+to|(?:all['’]\s?|alla\s+)?(?:c\.\s?a\.|cortese\s+attenzione|att(?:\.ne|enzione))(?:\s+(?:di|del(?:la|l['’])?|dei))?|(?:ricevut[oa]|versat[oa]|pagat[oa])\s+da(?:l(?:la|l['’]|lo)?)?(?:\s+sig\.?(?:ra|nor[ae]?)?\.?)?|sold\s+to|beneficiario|dipendente|^al(?:la|l['’]|le|lo|i)?(?=\s+[A-ZÀ-Ý"«])|egr(?:\.|egio)?\s+(?:sig\.?(?:ra|nor[ae]?)?\.?|dott\.?(?:ssa)?|avv\.?)?|gent(?:\.|ile)?\s+(?:sig\.?(?:ra)?\.?|dott\.?(?:ssa)?)?|cessionario(?:\s*\/\s*committente)?)\b\.?\s*:?/gi;
      const acc = s => { if (/:\s*$/.test(s.trim()) || /^\s*\(/.test(s)) return null; let v = tidy(s.replace(/^\s*[:\-]?\s*/, '').replace(/\s*[,(-]\s*(?:c\.?\s?f\.?|p\.?\s?iva|cod\.?\s?fisc|vat|partita|matricola)[\s\S]*$/i, '').replace(/\s*,\s*(?:IT)?[A-Z0-9]{11,16}\s*$/i, '').replace(/\s+(?:matricola|c\.?f\.?)\b[\s\S]*$/i, '')); if (!looksName(v) || v.length > 70) return null; if (/^[A-ZÀ-Ý]{2,}\s+[A-ZÀ-Ý]{2,}$/.test(v) && t === 'cedolino') v = v.split(' ').reverse().join(' '); return v; };
      const p = pairs(lines, R, acc, { right: 2, below: 2 });
      // escluso chi emette
      const pick = p.find(x => !issuer || x.v.toLowerCase() !== issuer.toLowerCase());
      if (pick) recipient = pick.v;
    }
    // atti: la ditta/beneficiario nominata nel testo
    if (!recipient && ['contratto', 'mandato'].includes(t)) {
      const m = /\b(?:la\s+ditta|ditta|societ[àa]|impresa)\s+([A-Z][A-Z0-9À-Ý&'’.\- ]{2,60}?(?:S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?))/.exec(text);
      if (m) recipient = tidy(m[1]);
    }
    if (recipient && /^al\s+comune|^alla\s+regione/i.test(recipient)) recipient = recipient.replace(/^al(?:la)?\s+/i, '');
    return { issuer: issuer ? titleCase(issuer) : null, recipient: recipient ? titleCase(recipient) : null };
  }
  return { layout, analyze, pairs, amountOf, dateIn, numberIn, itemsFromPdf };
})();

/* =====================================================================
   «Estrai i dati»: i dati chiave di uno o più documenti (anche scansioni) in Excel, Word o PDF.
   Per ogni documento: tipo, data, numero, controparte, oggetto, importi (totale, imponibile, IVA),
   scadenze, codici fiscali e partite IVA verificati, IBAN verificati, CIG, CUP, protocollo, PEC,
   email, telefoni, riferimenti normativi, persone e indirizzi, con la pagina in cui compaiono.
   Con tanti file insieme diventa un elenco (es. i giustificativi di una rendicontazione).
   ===================================================================== */
const KeyData = (() => {
  const CATS = {
    tipo: 'Tipo di documento', data: 'Data', numero: 'Numero', controparte: 'Emesso da', destinatario: 'Destinatario', oggetto: 'Oggetto',
    importo: 'Importi', scadenza: 'Scadenze', cf: 'Codici fiscali', piva: 'Partite IVA', iban: 'IBAN', cig: 'CIG', cup: 'CUP',
    prot: 'Protocollo', pec: 'PEC', email: 'Email', tel: 'Telefoni', norma: 'Riferimenti normativi', nome: 'Persone',
    indirizzo: 'Indirizzi', nascita: 'Nascita', doc: 'Documenti d’identità', targa: 'Targhe', altro: 'Altri codici', date: 'Altre date',
  };
  // gruppi mostrati come scelte
  const GROUPS = [
    ['doc', 'Dati del documento', ['tipo', 'data', 'numero', 'controparte', 'destinatario', 'oggetto']],
    ['importi', 'Importi e scadenze', ['importo', 'scadenza']],
    ['fisco', 'Codici fiscali e partite IVA', ['cf', 'piva']],
    ['banca', 'IBAN', ['iban']],
    ['appalti', 'CIG, CUP, protocollo', ['cig', 'cup', 'prot']],
    ['contatti', 'PEC, email, telefoni', ['pec', 'email', 'tel']],
    ['norme', 'Riferimenti normativi', ['norma']],
    ['persone', 'Persone, indirizzi, documenti', ['nome', 'indirizzo', 'nascita', 'doc', 'targa']],
    ['altro', 'Altri codici e date', ['altro', 'date']],
  ];
  const AMOUNT = /(?<![\d.,])(?:€\s*|EUR\s*)?([+-]?\d{1,3}(?:\.\d{3})+,\d{2}|[+-]?\d{1,9},\d{2})(?![\d,])(?:\s*(?:€|EUR|euro))?/gi;
  const parseAmount = s => +s.replace(/\./g, '').replace(',', '.');
  const AMOUNT_LABELS = [
    ['Totale', /\btotale\s+(?:documento|fattura|da\s+pagare|complessivo|generale|dovuto|importo|a\s+pagare|ivato|lordo)\b|\bimporto\s+totale\b|\btotale\s*(?:€|eur)?\s*:?\s*$/i],
    ['Netto a pagare', /\bnetto\s+(?:a\s+pagare|da\s+pagare|in\s+busta)\b/i],
    ['Imponibile', /\bimponibile\b|\btotale\s+imponibile\b/i],
    ['IVA', /\b(?:totale\s+)?i\.?v\.?a\.?\b|\bimposta\b/i],
    ['Ritenuta', /\britenuta\b/i],
    ['Bollo', /\bbollo\b/i],
    ['Saldo', /\bsaldo\b/i],
    ['Importo', /\bimporto\b|\bsomma\s+di\b|\bpari\s+a\b|\bcorrispettivo\b|\bspesa\b/i],
  ];
  const fmtEuro = v => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
  function extract(pages) {
    const items = [], seen = new Map();
    const add = (cat, value, page, ctx = '', extra = {}) => {
      value = String(value).replace(/\s+/g, ' ').trim(); if (!value) return;
      const key = cat + '|' + (extra.norm || value).toUpperCase();
      if (seen.has(key)) { seen.get(key).count++; return; }
      const it = { cat, value, page, ctx: ctx.replace(/\s+/g, ' ').trim().slice(0, 140), count: 1, ...extra };
      seen.set(key, it); items.push(it);
    };
    const full = pages.map(x => x.text).join('\n');
    // il documento nel suo insieme
    const k = typeof DocKind !== 'undefined' ? DocKind.classify(full) : {};
    for (const { p, text } of pages) {
      const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } fn(m); } };
      const around = (i, n = 60) => text.slice(Math.max(0, i - n), i + n);
      const lineBefore = i => { const s = text.lastIndexOf('\n', i - 1); return text.slice(Math.max(s + 1, i - 70), i); };
      // dati personali e fiscali (verificati con le cifre di controllo)
      if (typeof PiiKit !== 'undefined') {
        const cfs = PiiKit.cfsOf(text);
        for (const f of PiiKit.detect(text, { cfs })) {
          if (f.cat === 'cf' && !PiiKit.cfValid(f.text.replace(/\s/g, ''))) continue;
          // partita IVA che non supera il controllo ma è dopo l'etichetta: si tiene, segnalata
          if (f.cat === 'piva' && !f.sure && !/(p\.?\s?iva|partita\s+iva|vat)/i.test(lineBefore(f.start))) continue;
          if (f.cat === 'piva' && !f.sure) { add('piva', f.text.replace(/^IT\s?/i, '') + ' (cifra di controllo errata)', p, around(f.start), { norm: f.text.replace(/\D/g, '') }); continue; }
          if (f.cat === 'nome' && !f.sure) continue;
          const v = f.cat === 'cf' ? f.text.replace(/\s/g, '').toUpperCase() : f.cat === 'iban' ? f.text.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim() : f.text;
          if (f.cat === 'email' && (/pec|legalmail|postacert|cert\.|arubapec|sicurezzapostale|pec\.it/i.test(f.text) || /\bpec\b/i.test(lineBefore(f.start)))) add('pec', f.text.toLowerCase(), p, around(f.start));
          else add(f.cat, v, p, around(f.start), { norm: v.replace(/\s/g, '') });
        }
      }
      // CIG (dopo l'etichetta) e CUP (anche senza: il formato è riconoscibile)
      each(/\bC\.?\s?I\.?\s?G\.?\s*(?:n\.?|nr\.?|:|°)?\s*([A-Z0-9]{10})\b/g, m => add('cig', m[1], p, around(m.index)));
      each(/\bC\.?\s?U\.?\s?P\.?\s*(?:n\.?|nr\.?|:|°)?\s*([A-Z]\d{2}[A-Z]\d{2}[A-Z0-9]{9})\b/g, m => add('cup', m[1], p, around(m.index)));
      each(/(?<![A-Z0-9])([A-Z]\d{2}[A-Z]\d{2}\d{9})(?![A-Z0-9])/g, m => add('cup', m[1], p, around(m.index)));
      // protocollo (con la data, se c'è)
      each(/\bprot(?:ocollo)?\.?\s*(?:gen(?:erale)?\.?\s*)?(?:n\.?|nr\.?|num\.?|°)?\s*[:.]?\s*(\d[\d\/\-.]{1,18}\d|\d)(?:\s+(?:del|dd\.?)\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}))?/gi, m => add('prot', m[1] + (m[2] ? ` del ${m[2]}` : ''), p, around(m.index), { norm: m[1] }));
      // importi con la loro etichetta
      each(AMOUNT, m => {
        const before = lineBefore(m.index), v = parseAmount(m[1]);
        if (!isFinite(v) || Math.abs(v) < 0.01) return;
        // non è un importo: percentuali, quantità con unità, codici
        if (/%\s*$/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 2))) return;
        const lab = AMOUNT_LABELS.find(([, re]) => re.test(before));
        const label = lab ? lab[0] : (/[€]|eur/i.test(m[0]) ? 'Importo' : null);
        if (!label) return;
        add('importo', `${label}: ${fmtEuro(v)}`, p, around(m.index), { label, amount: v, norm: label + v.toFixed(2) });
      });
      // date: scadenze a parte; le altre date tutte (la data del documento è nei dati del documento)
      if (typeof DocKind !== 'undefined') for (const d of DocKind.dates(text)) {
        const b = text.slice(Math.max(0, d.at - 50), d.at);
        if (/nat[oa]\s+(?:a\s+\S+\s+)?il\s*$|nascita\s*:?\s*$/i.test(b)) continue;
        if (/scadenz\w*\s*(?:il|:)?\s*$|scade\s+il\s*$|entro\s+(?:e\s+non\s+oltre\s+)?il\s*$|termine\s+(?:ultimo\s+)?(?:del|il|:)?\s*$|valid\w*\s+(?:fino\s+)?al\s*$/i.test(b)) add('scadenza', fmtDate(d.iso), p, around(d.at), { iso: d.iso, norm: d.iso });
        else add('date', fmtDate(d.iso), p, around(d.at), { iso: d.iso, norm: d.iso });
      }
      // riferimenti normativi
      each(/\b(?:art(?:icolo|t)?\.?\s*\d+[\w\-]*(?:,?\s*(?:comma|co\.)\s*\d+[\w\-]*)?(?:,?\s*(?:lett(?:era)?\.?)\s*[a-z]\)?)?\s*,?\s*(?:del(?:la|l')?\s+)?)?(?:D\.?\s?Lgs\.?|D\.?\s?L\.?|D\.?\s?P\.?\s?R\.?|D\.?\s?M\.?|D\.?\s?P\.?\s?C\.?\s?M\.?|L\.|Legge|L\.\s?R\.|Legge\s+regionale|Reg(?:olamento)?\.?\s*\(?(?:UE|CE)\)?|Direttiva)\s*(?:n\.?|nr\.?)?\s*\d+\s*(?:\/\s*\d{2,4}|\s+del\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\s+del\s+\d{1,2}\s+\w+\s+\d{4})/gi,
        m => add('norma', m[0].replace(/\s+/g, ' '), p, around(m.index), { norm: m[0].replace(/[\s.]/g, '').toUpperCase() }));
      // altri codici utili
      each(/\b(IT\d{3}E\d{8})\b/g, m => add('altro', 'POD ' + m[1], p, around(m.index)));
      each(/\bPDR\s*[:n.°]*\s*(\d{14})\b/gi, m => add('altro', 'PDR ' + m[1], p, around(m.index)));
      each(/\bREA\s*[:n.°]*\s*([A-Z]{2}\s?[-–]?\s?\d{4,7})\b/g, m => add('altro', 'REA ' + m[1].replace(/\s+/g, ''), p, around(m.index)));
      each(/\b(?:codice\s+)?ATECO\s*(?:20\d\d)?\s*[:n.°]*\s*(\d{2}(?:\.\d{1,2}){1,2})\b/gi, m => add('altro', 'ATECO ' + m[1], p, around(m.index)));
      each(/\bcodice\s+tributo\s*[:n.°]*\s*(\d{4}|[A-Z]{2}\d{2})\b/gi, m => add('altro', 'Codice tributo ' + m[1], p, around(m.index)));
      each(/\b(?:matricola|codice\s+cliente|n\.?\s*cliente|n\.?\s*pratica|pratica\s+n\.?)\s*[:n.°]*\s*([A-Z0-9][\w\/\-]{3,20})/gi, m => add('altro', m[0].replace(/\s+/g, ' ').trim(), p, around(m.index)));
    }
    const pick = cat => items.filter(i => i.cat === cat);
    const amounts = pick('importo');
    const best = lab => { const l = amounts.filter(a => a.label === lab); return l.length ? l.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a)).amount : null; };
    const summary = {
      tipo: k.label ? k.label[0].toUpperCase() + k.label.slice(1) : '', data: k.date ? fmtDate(k.date) : '', dataISO: k.date || null, numero: k.number || '',
      controparte: k.party || '', oggetto: k.subject || '',
      totale: best('Totale') ?? best('Netto a pagare') ?? (amounts.length === 1 ? amounts[0].amount : null), imponibile: best('Imponibile'), iva: best('IVA'),
      scadenza: pick('scadenza').map(x => x.value)[0] || '',
      cf: pick('cf').map(x => x.value), piva: pick('piva').map(x => x.value.replace(/^IT\s?/i, '')), iban: pick('iban').map(x => x.value),
      cig: pick('cig').map(x => x.value), cup: pick('cup').map(x => x.value), pec: pick('pec').map(x => x.value), prot: pick('prot').map(x => x.value),
    };
    // i dati del documento come voci (così compaiono anche nell'elenco completo)
    const head = [['tipo', summary.tipo], ['data', summary.data], ['numero', summary.numero], ['controparte', summary.controparte], ['oggetto', summary.oggetto]].filter(([, v]) => v)
      .map(([cat, value]) => ({ cat, value, page: null, ctx: '', count: 1 }));
    return { items: [...head, ...items], summary, kind: k };
  }
  // con l'impaginazione (posizioni delle parole): campi del documento letti accanto alle loro etichette
  function extractLayout(pages) {
    if (typeof DocFields === 'undefined' || !pages.some(p => p.items && p.items.length)) return extract(pages);
    const F = DocFields.analyze(pages);
    // le voci (codici, importi, date…) sul testo ricostruito riga per riga, pagina per pagina
    const byPage = pages.map(pg => ({ p: pg.p, text: F.lines.filter(L => L.page === pg.p).map(L => L.text).join('\n') || pg.text || '' }));
    const r = extract(byPage);
    const k = F.kind || {}, s = r.summary, A = F.amounts;
    s.tipoId = k.type || null;
    if (k.label) s.tipo = k.label[0].toUpperCase() + k.label.slice(1);
    if (F.date) { s.dataISO = F.date; s.data = fmtDate(F.date); } else if (k.type === 'cedolino') { s.dataISO = null; s.data = ''; }
    if (F.number) s.numero = F.number;
    if (F.issuer) s.controparte = F.issuer;
    s.destinatario = F.recipient || '';
    if (A.totale != null) s.totale = A.totale;
    s.imponibile = A.imponibile ?? null; s.iva = A.iva ?? null;
    if (A.netto != null) s.netto = A.netto; if (A.ritenuta != null) s.ritenuta = A.ritenuta;
    s.importiCerti = A.conf;
    if (F.due) { s.scadenzaISO = F.due; s.scadenza = fmtDate(F.due); }
    // le voci di testa rifatte con i valori nuovi
    const head = [['tipo', s.tipo], ['data', s.data], ['numero', s.numero], ['controparte', s.controparte], ['destinatario', s.destinatario], ['oggetto', s.oggetto]].filter(([, v]) => v)
      .map(([cat, value]) => ({ cat, value, page: null, ctx: '', count: 1 }));
    return { items: [...head, ...r.items.filter(it => it.page != null)], summary: s, kind: k };
  }
  return { extract, extractLayout, CATS, GROUPS, fmtEuro };
})();

/* ----------------------------- strumento ------------------------------ */
async function startEstrai(stage, files) {
  const docs = await batchOpenPdfs(files);
  const many = docs.length > 1;
  const st = { groups: new Set(KeyData.GROUPS.map(g => g[0]).filter(g => g !== 'persone' && g !== 'altro')), xlsx: true, docx: false, pdf: false };
  const results = new Array(docs.length).fill(null);
  const rows = docs.map(d => batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)));
  const detail = h('div', { class: 'kd-detail' });
  let open = 0;
  const catsOn = () => new Set(KeyData.GROUPS.filter(g => st.groups.has(g[0])).flatMap(g => g[2]));
  function drawDetail() {
    const r = results[open], d = docs[open];
    rows.forEach((x, i) => x.el.classList.toggle('sel', i === open && many));
    if (!r) { detail.replaceChildren(h('div', { class: 'muted small', style: { padding: '14px' } }, 'Lettura del documento…')); return; }
    const on = catsOn();
    const items = r.items.filter(i => on.has(i.cat));
    const byCat = new Map(); for (const it of items) { if (!byCat.has(it.cat)) byCat.set(it.cat, []); byCat.get(it.cat).push(it); }
    const order = Object.keys(KeyData.CATS);
    detail.replaceChildren(
      h('div', { class: 'kd-h' }, h('b', {}, d.name), h('span', { class: 'muted small' }, `${plural(items.length, 'dato', 'dati')}${r.ocr ? ' · ' + plural(r.ocr, 'pagina letta', 'pagine lette') + ' con l’OCR' : ''}`)),
      items.length ? h('div', { class: 'kd-grid' }, ...order.filter(c => byCat.has(c)).map(c => h('div', { class: 'kd-cat' },
        h('div', { class: 'kd-ct' }, KeyData.CATS[c]),
        ...byCat.get(c).slice(0, 40).map(it => h('div', { class: 'kd-it', title: it.ctx || '' },
          h('span', { class: 'kd-v' }, it.value), it.page ? h('span', { class: 'kd-p muted small' }, `p. ${it.page}${it.count > 1 ? ' · ' + it.count + ' volte' : ''}`) : null,
          h('button', { class: 'kd-cp', title: 'Copia', 'aria-label': 'Copia', onclick: e => { e.stopPropagation(); copyText(it.value); } }, ic('copy', 13)))))))
        : h('div', { class: 'muted small', style: { padding: '14px' } }, 'Nessun dato delle categorie scelte in questo documento.'));
  }
  rows.forEach((r, i) => r.el.addEventListener('click', () => { open = i; drawDetail(); }));
  const sideGroups = h('div', { class: 'stack' }, KeyData.GROUPS.map(([id, label]) => checkbox(label, st.groups.has(id), v => { v ? st.groups.add(id) : st.groups.delete(id); drawDetail(); })));
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), many ? `Crea il file con i dati di ${docs.length} documenti` : 'Crea il file con i dati');
  workspace(stage, h('div', { class: 'ws-main' },
    many ? h('div', { class: 'toolbar', style: { maxWidth: '980px', margin: '0 auto 12px' } }, h('div', { class: 'tb-title' }, `${plural(docs.length, 'documento', 'documenti')} · clicca per vedere i dati di ciascuno`)) : null,
    many ? h('div', { class: 'filelist kd-files' }, rows.map(r => r.el)) : null,
    h('div', { class: 'kd-wrap' }, detail)), [
    h('div', { class: 'hint ok' }, many ? 'Ogni documento diventa una riga dell’Excel «Riepilogo» (tipo, data, numero, chi lo emette e a chi è destinato, importi, codici); nel foglio «Tutti i dati» trovi ogni dato con la pagina.' : 'I dati principali del documento, verificati (codici fiscali, partite IVA e IBAN con le cifre di controllo), con la pagina in cui compaiono.'),
    sec('Dati da estrarre', sideGroups),
    sec('Formato', checkbox('Excel (.xlsx)', st.xlsx, v => st.xlsx = v), checkbox('Word (.docx)', st.docx, v => st.docx = v), checkbox('PDF', st.pdf, v => st.pdf = v)),
  ], [runBtn]);
  drawDetail();

  // lettura subito (testo del PDF; le pagine scansionate con l'OCR, più pagine insieme)
  const workers = [];
  onLeave(() => workers.forEach(w => w && w.then(x => x.terminate()).catch(() => {})));
  const getW = k => workers[k] ||= makeOcrWorker(new Set(['ita']), 300);
  let alive = true; onLeave(() => { alive = false; });
  const reading = (async () => {
    let next = 0;
    const slot = async k => {
      for (;;) {
        const i = next++; if (i >= docs.length || !alive) return;
        const d = docs[i], r = rows[i];
        r.start('Lettura…');
        try {
          const pages = []; let ocr = 0;
          for (let p = 1; p <= d.numPages && alive; p++) {
            const page = await d.pdfjs.getPage(p);
            const tc = await page.getTextContent();
            let text = tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''), items = DocFields.itemsFromPdf(tc, page.getViewport({ scale: 1 }));
            if (text.replace(/\s/g, '').length < 20 && typeof Tesseract !== 'undefined') {
              r.prog(null, `Pagina ${p}: lettura della scansione (OCR)…`);
              try { const rec = await ocrRecognizePage(getW(k), d.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) }); text = rec.data.text || '';
                items = (rec.data.lines || []).flatMap(l => (l.words || []).filter(w => (w.text || '').trim() && w.bbox && (w.confidence ?? 100) >= 30).map(w => ({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 })));
                rec.r.canvas.width = 0; rec.prep.release?.(); ocr++; } catch (e) { console.warn(e); }
            }
            pages.push({ p, text, items });
            r.prog(p / d.numPages);
          }
          results[i] = { ...KeyData.extractLayout(pages), ocr };
          const s = results[i].summary;
          r.subEl.textContent = [s.tipo, s.numero ? 'n. ' + s.numero : '', s.data, s.totale != null ? 'Totale ' + KeyData.fmtEuro(s.totale) : ''].filter(Boolean).join(' · ') || `${plural(results[i].items.length, 'dato', 'dati')}`;
          r.done(`${plural(results[i].items.length, 'dato', 'dati')}`);
        } catch (e) { console.error(e); r.fail('Non leggibile'); results[i] = { items: [], summary: {}, error: e.message }; }
        if (i === open) drawDetail();
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallelSlots(), docs.length) }, (_, k) => slot(k)));
  })();

  async function run() {
    if (!st.xlsx && !st.docx && !st.pdf) return toast('Scegli almeno un formato', 'error');
    await withBusy('Estrazione dei dati…', async () => {
      Busy.set(null, 'Lettura dei documenti…');
      await Busy.until(reading);
      const on = catsOn();
      const base = many ? `Dati estratti (${docs.length} documenti)` : `${docs[0].base} - dati`;
      const outs = [];
      if (st.xlsx) outs.push({ name: base + '.xlsx', bytes: await buildXlsx(on), type: XlsxOut.MIME, info: many ? 'Riepilogo (una riga per documento) e tutti i dati' : 'Riepilogo e tutti i dati, con la pagina' });
      const blocks = buildBlocks(on);
      if (st.docx) outs.push({ name: base + '.docx', bytes: await Report.docx({ title: many ? 'Dati estratti dai documenti' : `Dati estratti: ${docs[0].name}`, subtitle: subtitle(), blocks }), type: Report.DOCX, info: 'Scheda dei dati' });
      if (st.pdf) outs.push({ name: base + '.pdf', bytes: await Report.pdf({ title: many ? 'Dati estratti dai documenti' : `Dati estratti: ${docs[0].name}`, subtitle: subtitle(), blocks, label: 'Dati estratti' }), info: 'Scheda dei dati' });
      showResult(outs, { title: 'Dati estratti', primary: outs.length === 1 ? 0 : null, zipName: base + '.zip' });
    }, { job: true });
  }
  const subtitle = () => `Estratti con file360 il ${new Date().toLocaleDateString('it-IT')} da ${plural(docs.length, 'documento', 'documenti')}. Codici fiscali, partite IVA e IBAN verificati con le cifre di controllo.`;
  function buildBlocks(on) {
    const blocks = [];
    docs.forEach((d, i) => {
      const r = results[i]; if (!r) return;
      const s = r.summary;
      blocks.push({ h: d.name });
      const E = v => v != null ? KeyData.fmtEuro(v) : '';
      const kv = [['Tipo', s.tipo], ['Data', s.data], ['Numero', s.numero], ['Emesso da', s.controparte], ['Destinatario', s.destinatario], ['Oggetto', s.oggetto],
        ['Totale', E(s.totale)], ['Imponibile', E(s.imponibile)], ['IVA', E(s.iva)], ['Ritenuta', E(s.ritenuta)], ['Netto a pagare', s.netto != null && s.netto !== s.totale ? E(s.netto) : ''], ['Scadenza', s.scadenza]].filter(([, v]) => v);
      if (kv.length && (on.has('tipo') || on.has('importo'))) blocks.push({ kv });
      const items = r.items.filter(it => on.has(it.cat) && it.page);
      if (items.length) blocks.push({ table: { head: ['Dato', 'Valore', 'Pag.'], rows: items.map(it => [KeyData.CATS[it.cat], it.value, String(it.page)]), widths: [0.24, 0.66, 0.1], align: ['l', 'l', 'c'] } });
      else if (!kv.length) blocks.push({ p: 'Nessun dato delle categorie scelte.', muted: true });
    });
    return blocks;
  }
  async function buildXlsx(on) {
    const H = (v, w) => ({ t: 's', v, bold: true, fill: '#17181C', color: '#FFFFFF', valign: 'center', wrap: true });
    const S = v => v ? { t: 's', v: String(v), wrap: String(v).length > 40 } : null;
    const N = v => v == null ? null : { t: 'n', v, fmt: '#,##0.00' };
    const D = iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return { t: 'd', v: (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000, fmt: 'dd/mm/yyyy' }; };
    const cols = [['File', 30], ['Tipo', 18], ['Data', 12], ['Numero', 14], ['Emesso da', 30], ['Destinatario', 30], ['Oggetto', 44], ['Totale', 14], ['Imponibile', 14], ['IVA', 12], ['Ritenuta', 12], ['Netto a pagare', 14], ['Scadenza', 12], ['Codici fiscali', 22], ['Partite IVA', 16], ['IBAN', 34], ['CIG', 14], ['CUP', 18], ['PEC', 28], ['Protocollo', 18]];
    const sum = [cols.map(c => H(c[0]))];
    docs.forEach((d, i) => {
      const r = results[i]; const s = r?.summary || {};
      sum.push([S(d.name), S(s.tipo), D(s.dataISO), S(s.numero), S(s.controparte), S(s.destinatario), S(s.oggetto), N(s.totale), N(s.imponibile), N(s.iva), N(s.ritenuta), N(s.netto), s.scadenzaISO ? D(s.scadenzaISO) : S(s.scadenza),
        S((s.cf || []).join(', ')), S((s.piva || []).join(', ')), S((s.iban || []).join(', ')), S((s.cig || []).join(', ')), S((s.cup || []).join(', ')), S((s.pec || []).join(', ')), S((s.prot || []).join(', '))]);
    });
    if (many) { const tot = cols.map(() => null), ti = cols.findIndex(c => c[0] === 'Totale'), L = String.fromCharCode(65 + ti); tot[0] = { t: 's', v: 'Totale', bold: true }; tot[ti] = { t: 'n', v: docs.reduce((t, d, i) => t + (results[i]?.summary?.totale || 0), 0), fmt: '#,##0.00', bold: true, f: `SUM(${L}2:${L}${docs.length + 1})` }; sum.push(tot); }
    const all = [[H('File'), H('Dato'), H('Valore'), H('Pagina'), H('Volte'), H('Contesto')]];
    docs.forEach((d, i) => { for (const it of (results[i]?.items || []).filter(x => on.has(x.cat))) all.push([S(d.name), S(KeyData.CATS[it.cat]), S(it.value), it.page ? { t: 'n', v: it.page } : null, { t: 'n', v: it.count || 1 }, S(it.ctx)]); });
    return XlsxOut.build([
      { name: 'Riepilogo', rows: sum, widths: cols.map(c => c[1]), freeze: 1 },
      { name: 'Tutti i dati', rows: all, widths: [30, 22, 44, 8, 7, 70], freeze: 1 },
    ], { title: 'Dati estratti', font: 'Calibri' });
  }
}

/* =====================================================================
   «PDF in immagini» ed estrazione: le pagine come immagini (JPG, PNG, WebP, TIFF) alla risoluzione
   scelta, oppure ciò che il PDF contiene: le immagini originali (le JPEG senza ricompressione, le altre
   in PNG con la trasparenza), il testo, gli allegati. Più PDF insieme, ognuno separato.
   ===================================================================== */
const PdfExtract = (() => {
  const { PDFName, PDFDict, PDFRawStream, PDFArray, PDFRef, PDFNumber, decodePDFRawStream } = PDFLib;
  const nm = o => (o && o.asString ? o.asString() : String(o || '')).replace(/^\//, '');
  const look = (ctx, o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  // filtri dello stream (ultimo = formato finale)
  const filters = (ctx, d) => { const f = look(ctx, d.get(PDFName.of('Filter'))); return f instanceof PDFArray ? f.asArray().map(x => nm(x)) : f ? [nm(f)] : []; };
  // colori di un'immagine: componenti e tabella dei colori (Indexed)
  function colorInfo(ctx, cs) {
    cs = look(ctx, cs);
    if (!cs) return { n: 1 };
    if (cs instanceof PDFArray) {
      const a = cs.asArray(), kind = nm(look(ctx, a[0]));
      if (kind === 'ICCBased') { const s = look(ctx, a[1]); const N = s?.dict?.get(PDFName.of('N')); return { n: N ? N.asNumber() : 3 }; }
      if (kind === 'Indexed') {
        const base = colorInfo(ctx, a[1]); const hival = look(ctx, a[2]).asNumber(); let lut = look(ctx, a[3]);
        let bytes = lut instanceof PDFRawStream ? decodePDFRawStream(lut).decode() : lut?.asBytes ? lut.asBytes() : new TextEncoder().encode(lut?.asString?.() || '');
        return { n: 1, indexed: { base, hival, lut: bytes } };
      }
      if (kind === 'CalRGB' || kind === 'Lab') return { n: 3 };
      if (kind === 'CalGray') return { n: 1 };
      if (kind === 'DeviceN' || kind === 'Separation') return { n: kind === 'Separation' ? 1 : (look(ctx, a[1])?.asArray?.().length || 1), sep: true };
      return { n: 3 };
    }
    const k = nm(cs);
    return { n: k === 'DeviceRGB' ? 3 : k === 'DeviceCMYK' ? 4 : 1 };
  }
  // pixel grezzi → RGBA
  function toRGBA(raw, w, hh, bpc, ci, decodeArr) {
    const out = new Uint8ClampedArray(w * hh * 4);
    const n = ci.n, rowBytes = Math.ceil(w * n * bpc / 8);
    const sample = (row, i) => {
      if (bpc === 8) return raw[row * rowBytes + i];
      if (bpc === 16) return raw[row * rowBytes + i * 2];
      const bit = i * bpc, byte = raw[row * rowBytes + (bit >> 3)], shift = 8 - bpc - (bit & 7);
      return (byte >> shift) & ((1 << bpc) - 1);
    };
    const maxV = bpc === 16 ? 255 : (1 << bpc) - 1;
    const inv = decodeArr && decodeArr[0] === 1 && decodeArr[1] === 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ci.indexed) {
        const idx = sample(y, x), b = ci.indexed.base.n, l = ci.indexed.lut;
        const v = c => l[idx * b + c] ?? 0;
        if (b === 3) { out[o] = v(0); out[o + 1] = v(1); out[o + 2] = v(2); }
        else if (b === 4) { const k = v(3); out[o] = 255 - Math.min(255, v(0) + k); out[o + 1] = 255 - Math.min(255, v(1) + k); out[o + 2] = 255 - Math.min(255, v(2) + k); }
        else out[o] = out[o + 1] = out[o + 2] = v(0);
      } else if (n === 1) { let v = sample(y, x) * 255 / maxV; if (inv) v = 255 - v; out[o] = out[o + 1] = out[o + 2] = ci.sep ? 255 - v : v; }
      else if (n === 3) { out[o] = sample(y, x * 3) * 255 / maxV; out[o + 1] = sample(y, x * 3 + 1) * 255 / maxV; out[o + 2] = sample(y, x * 3 + 2) * 255 / maxV; }
      else if (n === 4) { const c = sample(y, x * 4) / maxV, m = sample(y, x * 4 + 1) / maxV, ye = sample(y, x * 4 + 2) / maxV, k = sample(y, x * 4 + 3) / maxV; out[o] = 255 * (1 - c) * (1 - k); out[o + 1] = 255 * (1 - m) * (1 - k); out[o + 2] = 255 * (1 - ye) * (1 - k); }
      else { out[o] = out[o + 1] = out[o + 2] = sample(y, x * n) * 255 / maxV; }
      out[o + 3] = 255;
    }
    return out;
  }
  // toglie solo i primi «k» filtri di uno stream (quelli sopra al formato immagine)
  function outerDecode(ctx, s, k) {
    const d = s.dict.clone(ctx), f = look(ctx, d.get(PDFName.of('Filter'))), dp = look(ctx, d.get(PDFName.of('DecodeParms')));
    d.set(PDFName.of('Filter'), ctx.obj(f.asArray().slice(0, k)));
    if (dp instanceof PDFArray) d.set(PDFName.of('DecodeParms'), ctx.obj(dp.asArray().slice(0, k)));
    return decodePDFRawStream(PDFRawStream.of(d, s.contents)).decode();
  }
  async function rgbaToPng(rgba, w, hh) {
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    c.getContext('2d').putImageData(new ImageData(rgba, w, hh), 0, 0);
    const b = await canvasToBytes(c, 'image/png'); c.width = c.height = 0; return b;
  }
  // tutte le immagini di un PDF (una volta sola anche se ripetute), con le pagine in cui compaiono
  async function images(bytes, { minSize = 24, onProgress = () => {}, countOnly = false } = {}) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const ctx = doc.context, found = new Map();
    const pages = doc.getPages();
    const walk = (res, pageNo, depth = 0) => {
      res = look(ctx, res); if (!(res instanceof PDFDict) || depth > 6) return;
      const xo = look(ctx, res.get(PDFName.of('XObject'))); if (!(xo instanceof PDFDict)) return;
      for (const [, ref] of xo.entries()) {
        const s = look(ctx, ref); if (!(s instanceof PDFRawStream)) continue;
        const st = nm(s.dict.get(PDFName.of('Subtype')));
        if (st === 'Form') { walk(s.dict.get(PDFName.of('Resources')), pageNo, depth + 1); continue; }
        if (st !== 'Image') continue;
        const key = ref instanceof PDFRef ? ref.toString() : Math.random().toString();
        if (found.has(key)) { const e = found.get(key); if (!e.pages.includes(pageNo)) e.pages.push(pageNo); continue; }
        found.set(key, { s, pages: [pageNo] });
      }
    };
    pages.forEach((pg, i) => walk(pg.node.Resources(), i + 1));
    if (countOnly) return [...found.values()].filter(({ s }) => { const d = s.dict, n = k => d.get(PDFName.of(k))?.asNumber?.() || 0; return n('Width') >= minSize && n('Height') >= minSize && !d.get(PDFName.of('ImageMask'))?.asBoolean?.(); }).length;
    const out = []; let k = 0;
    for (const [, e] of found) {
      onProgress(k++ / Math.max(1, found.size));
      const d = e.s.dict, w = d.get(PDFName.of('Width'))?.asNumber?.() || 0, hh = d.get(PDFName.of('Height'))?.asNumber?.() || 0;
      if (w < minSize || hh < minSize) continue;
      if (d.get(PDFName.of('ImageMask'))?.asBoolean?.() || nm(d.get(PDFName.of('ImageMask'))) === 'true') continue;
      const f = filters(ctx, d), last = f[f.length - 1];
      try {
        if (last === 'DCTDecode' || last === 'JPXDecode') {
          // il file JPEG così com'è; se avvolto in altri filtri (es. ASCII85) si tolgono solo quelli
          const bytes = f.length === 1 ? e.s.contents : outerDecode(ctx, e.s, f.length - 1);
          const jpg = last === 'DCTDecode';
          if (jpg && !(bytes[0] === 0xFF && bytes[1] === 0xD8)) throw new Error('JPEG non valido');
          // JPEG in CMYK: molti programmi lo mostrano con i colori invertiti → si ridisegna in RGB
          const cmyk = jpg && colorInfo(ctx, d.get(PDFName.of('ColorSpace'))).n === 4;
          if (!cmyk) { out.push({ ext: jpg ? 'jpg' : 'jp2', bytes, w, h: hh, pages: e.pages, type: jpg ? 'image/jpeg' : 'image/jp2', orig: true }); continue; }
          out.push({ unsupported: 'CMYK', w, h: hh, pages: e.pages }); continue;
        }
        if (/CCITTFax|JBIG2/.test(last)) { out.push({ unsupported: last, w, h: hh, pages: e.pages }); continue; }
        const raw = decodePDFRawStream(e.s).decode();
        const bpc = d.get(PDFName.of('BitsPerComponent'))?.asNumber?.() || 8;
        const ci = colorInfo(ctx, d.get(PDFName.of('ColorSpace')));
        const dec = look(ctx, d.get(PDFName.of('Decode')))?.asArray?.().map(x => x.asNumber());
        const rgba = toRGBA(raw, w, hh, bpc, ci, dec);
        // trasparenza (SMask)
        const sm = look(ctx, d.get(PDFName.of('SMask')));
        if (sm instanceof PDFRawStream) {
          try {
            const mw = sm.dict.get(PDFName.of('Width')).asNumber(), mh = sm.dict.get(PDFName.of('Height')).asNumber();
            const a = toRGBA(decodePDFRawStream(sm).decode(), mw, mh, sm.dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.() || 8, { n: 1 });
            if (mw === w && mh === hh) for (let i = 0; i < w * hh; i++) rgba[i * 4 + 3] = a[i * 4];
          } catch { }
        }
        out.push({ ext: 'png', bytes: await rgbaToPng(rgba, w, hh), w, h: hh, pages: e.pages, type: 'image/png' });
      } catch (err) { console.warn('immagine non estratta', err); out.push({ unsupported: last || 'sconosciuto', w, h: hh, pages: e.pages }); }
      await tick();
    }
    return out;
  }
  // le immagini che pdf-lib non sa leggere (fax, JBIG2): dalla pagina disegnata da pdf.js
  async function imagesViaRender(pdfjs, pageNo) {
    const page = await pdfjs.getPage(pageNo);
    const ops = await page.getOperatorList();
    const out = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjsLib.OPS.paintImageXObject) continue;
      const id = ops.argsArray[i][0];
      const store = id.startsWith('g_') ? page.commonObjs : page.objs;
      const obj = await Promise.race([new Promise(res => { try { store.has(id) ? res(store.get(id)) : store.get(id, res); } catch { res(null); } }), new Promise(res => setTimeout(() => res(null), 5000))]);
      if (!obj) continue;
      const c = document.createElement('canvas'); c.width = obj.width; c.height = obj.height;
      const cx = c.getContext('2d');
      if (obj.bitmap) cx.drawImage(obj.bitmap, 0, 0);
      else if (obj.data) {
        const id2 = cx.createImageData(obj.width, obj.height), d = obj.data, n = obj.width * obj.height;
        if (obj.kind === 3) id2.data.set(d.subarray(0, n * 4));
        else if (obj.kind === 2) for (let k = 0; k < n; k++) { id2.data[k * 4] = d[k * 3]; id2.data[k * 4 + 1] = d[k * 3 + 1]; id2.data[k * 4 + 2] = d[k * 3 + 2]; id2.data[k * 4 + 3] = 255; }
        else { const rb = Math.ceil(obj.width / 8); for (let y = 0; y < obj.height; y++) for (let x = 0; x < obj.width; x++) { const v = (d[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0, o = (y * obj.width + x) * 4; id2.data[o] = id2.data[o + 1] = id2.data[o + 2] = v; id2.data[o + 3] = 255; } }
        cx.putImageData(id2, 0, 0);
      } else continue;
      out.push({ ext: 'png', bytes: await canvasToBytes(c, 'image/png'), w: obj.width, h: obj.height, pages: [pageNo], type: 'image/png' });
      c.width = c.height = 0;
    }
    return out;
  }
  async function text(pdfjs, n) {
    let t = '';
    for (let p = 1; p <= n; p++) { const tc = await (await pdfjs.getPage(p)).getTextContent(); t += `===== Pagina ${p} =====\n` + tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').trim() + '\n\n'; }
    return t;
  }
  async function attachments(pdfjs) {
    const a = await pdfjs.getAttachments().catch(() => null);
    return a ? Object.values(a).filter(x => x.content).map(x => ({ name: x.filename || 'allegato', bytes: x.content })) : [];
  }
  return { images, imagesViaRender, text, attachments };
})();

async function startToImages(stage, files) {
  const docs = await batchOpenPdfs(files);
  const many = docs.length > 1;
  const st = { mode: 'pages', fmt: 'jpg', dpi: 150, q: 0.9, gray: false, range: 'all', rangeText: '', small: false };
  const FMT = { jpg: ['JPG', 'image/jpeg'], png: ['PNG', 'image/png'], webp: ['WebP', 'image/webp'], tif: ['TIFF', 'image/tiff'] };
  const counts = { img: null, att: null, txt: null };
  // cosa contiene (conta immagini e allegati senza estrarli)
  (async () => {
    let imgs = 0, att = 0, txt = 0;
    for (const d of docs) {
      if (d.size < 80e6) try { imgs += await PdfExtract.images(d.bytes, { countOnly: true }); } catch { }
      try { const a = await d.pdfjs.getAttachments(); att += a ? Object.keys(a).length : 0; } catch { }
      try { txt += (await pageHasText(d.pdfjs, 1)) ? 1 : 0; } catch { }
    }
    Object.assign(counts, { img: imgs, att, txt });
    drawModes();
  })();
  const modeBox = h('div');
  const opts = h('div', { class: 'opt-stack' });
  const pagesTotal = docs.reduce((t, d) => t + d.numPages, 0);
  function drawModes() {
    modeBox.replaceChildren(seg([['pages', 'Pagine'], ['images', `Immagini${counts.img != null ? ' (' + counts.img + ')' : ''}`], ['text', 'Testo'], ['attach', `Allegati${counts.att != null ? ' (' + counts.att + ')' : ''}`]], st.mode, v => { st.mode = v; drawOpts(); }));
  }
  function drawOpts() {
    const rangeIn = h('input', { class: 'input', value: st.rangeText, placeholder: 'es. 1-3, 5 (o clicca le pagine)', hidden: st.range !== 'some', oninput: () => { st.rangeText = rangeIn.value; markSel(); } });
    const qIn = h('input', { type: 'range', min: 50, max: 100, value: Math.round(st.q * 100), oninput: () => { st.q = qIn.value / 100; qv.textContent = qIn.value + '%'; } }), qv = h('b', {}, Math.round(st.q * 100) + '%');
    if (st.mode === 'pages') opts.replaceChildren(
      h('div', { class: 'hint' }, `Ogni pagina diventa un’immagine (${plural(pagesTotal, 'pagina', 'pagine')} in tutto).`),
      sec('Formato', seg(Object.entries(FMT).map(([k, v]) => [k, v[0]]), st.fmt, v => { st.fmt = v; drawOpts(); }),
        h('div', { class: 'muted small', style: { marginTop: '6px' } }, { jpg: 'Leggero, per foto e scansioni.', png: 'Senza perdita, ideale per testo e grafici.', webp: 'Molto leggero, per il web.', tif: 'Per archivi e programmi di stampa.' }[st.fmt])),
      sec('Risoluzione', seg([[72, 'Schermo'], [150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi'], [600, '600 dpi']], st.dpi, v => st.dpi = +v),
        h('div', { class: 'muted small', style: { marginTop: '6px' } }, '150 dpi per leggere a schermo, 300 dpi per stampare o per l’OCR.')),
      st.fmt === 'jpg' || st.fmt === 'webp' ? sec('Qualità', h('div', { class: 'row' }, qIn, qv)) : null,
      sec('', checkbox('In bianco e nero (scala di grigi)', st.gray, v => st.gray = v)),
      many ? null : sec('Pagine', seg([['all', 'Tutte'], ['some', 'Solo alcune']], st.range, v => { st.range = v; rangeIn.hidden = v !== 'some'; markSel(); }), rangeIn));
    else if (st.mode === 'images') opts.replaceChildren(
      h('div', { class: 'hint' }, 'Le immagini come sono dentro il PDF, alla loro risoluzione: le foto JPEG senza ricompressione (stessa qualità), le altre in PNG con la trasparenza. Ognuna una volta sola, anche se ripetuta (es. il logo in ogni pagina).'),
      checkbox('Includi anche le immagini piccole (icone, linee)', st.small, v => st.small = v));
    else if (st.mode === 'text') opts.replaceChildren(h('div', { class: 'hint' }, 'Tutto il testo del PDF in un file .txt, pagina per pagina. Per le scansioni senza testo usa prima l’OCR.'),
      counts.txt === 0 ? h('div', { class: 'hint warn' }, 'Questo PDF sembra una scansione: non ha testo da estrarre.') : null);
    else opts.replaceChildren(h('div', { class: 'hint' }, counts.att ? `Il PDF contiene ${plural(counts.att, 'file allegato', 'file allegati')}: si salvano così come sono (es. la fattura XML dentro il PDF).` : 'Il PDF non contiene file allegati.'));
    if (!many) markSel();
  }
  const grid = h('div', { class: many ? 'filelist' : 'cards' });
  if (many) docs.forEach(d => grid.append(batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)).el));
  else for (let p = 1; p <= docs[0].numPages; p++) {
    // clic sulle pagine = solo quelle
    const c = pageCard(docs[0], p); c.el.dataset.p = p; c.el.classList.add('selectable');
    c.el.onclick = () => { if (st.mode !== 'pages') return; const sel = new Set(selPages()); sel.has(p) ? sel.delete(p) : sel.add(p); setSel(sel); };
    grid.append(c.el);
  }
  function selPages() { try { return st.range === 'some' && st.rangeText.trim() ? parseRanges(st.rangeText, docs[0].numPages).flat() : []; } catch { return []; } }
  function setSel(sel) {
    const a = [...sel].sort((x, y) => x - y), parts = [];
    for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; parts.push(i === j ? `${a[i]}` : `${a[i]}-${a[j]}`); i = j; }
    st.range = a.length ? 'some' : 'all'; st.rangeText = parts.join(', '); drawOpts(); markSel();
  }
  function markSel() { const s2 = new Set(st.mode === 'pages' ? selPages() : []); grid.querySelectorAll('.card').forEach(c => c.classList.toggle('sel', s2.has(+c.dataset.p))); }
  drawModes(); drawOpts();
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, many ? `${plural(docs.length, 'file', 'file')} · ${plural(pagesTotal, 'pagina', 'pagine')}` : `${docs[0].name} · ${plural(docs[0].numPages, 'pagina', 'pagine')}`)), grid), [
    sec('Cosa vuoi ottenere', modeBox), opts,
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('image', 18), 'Estrai')]);

  async function run() {
    await withBusy(st.mode === 'pages' ? 'Pagine in immagini…' : 'Estrazione…', async () => {
      const outs = []; let skippedAll = 0;
      const pad = (n, N) => String(n).padStart(String(N).length, '0');
      for (const [di, d] of docs.entries()) {
        Busy.check();
        if (st.mode === 'pages') {
          let pages = Array.from({ length: d.numPages }, (_, i) => i + 1);
          if (!many && st.range === 'some') pages = [...new Set(parseRanges(st.rangeText, d.numPages).flat())].sort((a, b) => a - b);
          if (st.fmt === 'tif') await need('utif');
          if (!pages.length) throw new Error('Nessuna pagina scelta.');
          let done = 0;
          // quante pagine insieme: dipende da quanto sono grandi (a 600 dpi una pagina A4 occupa ~140 MB)
          const v1 = (await d.pdfjs.getPage(pages[0])).getViewport({ scale: 1 }), px = v1.width * v1.height * (st.dpi / 72) ** 2;
          const k = Math.max(1, Math.min(parallelSlots(pages.length), Math.floor(240e6 / px)));
          const res = await inParallel(pages, k, async p => {
            Busy.check();
            const r = await renderPageCanvas(d.pdfjs, p, st.dpi, { gray: st.gray, maxPixels: 80e6, big: true });
            let bytes;
            if (st.fmt === 'tif') {
              const cx = r.canvas.getContext('2d'), id = cx.getImageData(0, 0, r.canvas.width, r.canvas.height);
              bytes = new Uint8Array(UTIF.encodeImage(id.data, r.canvas.width, r.canvas.height, { t282: [st.dpi], t283: [st.dpi], t296: [2] }));
            } else {
              bytes = await canvasToBytes(r.canvas, FMT[st.fmt][1], st.q);
              if (st.fmt === 'webp' && !(bytes[8] === 0x57 && bytes[9] === 0x45)) throw new Error('Questo browser non sa creare immagini WebP: scegli JPG o PNG.');
            }
            const w = r.canvas.width, hh = r.canvas.height; r.canvas.width = r.canvas.height = 0;
            done++; Busy.set((di + done / pages.length) / docs.length, `${d.name}: ${done} di ${plural(pages.length, 'pagina', 'pagine')}`);
            return { name: `${d.base}-pagina-${pad(p, d.numPages)}.${st.fmt}`, bytes, type: FMT[st.fmt][1], info: `${w} × ${hh} px` };
          });
          outs.push(...res);
        } else if (st.mode === 'images') {
          Busy.set(di / docs.length, `${d.name}: ricerca delle immagini…`);
          let skipped = 0;
          let imgs = await PdfExtract.images(d.bytes, { minSize: st.small ? 1 : 24, onProgress: f => Busy.set((di + f) / docs.length, `${d.name}: estrazione delle immagini…`) });
          // fax e JBIG2: dalla pagina disegnata
          const unsup = imgs.filter(x => x.unsupported);
          imgs = imgs.filter(x => !x.unsupported);
          // ognuna dalla prima pagina in cui compare, riconosciuta dalle dimensioni
          const byPage = new Map();
          for (const u of unsup) { const p = u.pages[0]; if (!byPage.has(p)) byPage.set(p, []); byPage.get(p).push(u); }
          for (const [p, list] of byPage) {
            const got = await PdfExtract.imagesViaRender(d.pdfjs, p).catch(() => []);
            for (const u of list) { const k = got.findIndex(g => g.w === u.w && g.h === u.h); if (k >= 0) imgs.push({ ...got.splice(k, 1)[0], pages: u.pages }); else skipped++; }
          }
          skippedAll += skipped;
          imgs.sort((a, b) => a.pages[0] - b.pages[0]);
          imgs.forEach((x, i) => outs.push({ name: `${d.base}-immagine-${pad(i + 1, imgs.length)}.${x.ext}`, bytes: x.bytes, type: x.type, info: `${x.w} × ${x.h} px · pag. ${x.pages.slice(0, 5).join(', ')}${x.pages.length > 5 ? '…' : ''}${x.orig ? ' · originale' : ''}` }));
        } else if (st.mode === 'text') {
          Busy.set(di / docs.length, d.name);
          const t = await PdfExtract.text(d.pdfjs, d.numPages);
          outs.push({ name: `${d.base}.txt`, bytes: new TextEncoder().encode(t), type: 'text/plain;charset=utf-8', info: `${t.replace(/\s/g, '').length.toLocaleString('it-IT')} caratteri` });
        } else {
          for (const a of await PdfExtract.attachments(d.pdfjs)) outs.push({ name: a.name, bytes: a.bytes, type: 'application/octet-stream', info: many ? 'da ' + d.name : 'allegato' });
        }
      }
      if (!outs.length) throw new Error(st.mode === 'images' ? 'Nessuna immagine trovata nel PDF.' : st.mode === 'attach' ? 'Il PDF non contiene allegati.' : 'Niente da estrarre.');
      uniqueNames(outs.map(o => o.name)).forEach((n, i) => outs[i].name = n);
      const note = st.mode === 'images' ? [`Le foto JPEG sono i file originali, identici a quelli inseriti nel PDF; le altre immagini sono in PNG, senza perdita.`, skippedAll ? `${plural(skippedAll, 'immagine', 'immagini')} in un formato non leggibile non ${skippedAll === 1 ? 'è stata estratta' : 'sono state estratte'}: usa la modalità «Pagine».` : ''].filter(Boolean).join(' ') : undefined;
      showResult(outs, { note, title: st.mode === 'pages' ? (outs.length === 1 ? 'Immagine pronta' : `${outs.length} immagini pronte`) : 'Estrazione completata',
        zipName: (many ? 'estrazione' : docs[0].base + (st.mode === 'pages' ? '-immagini' : st.mode === 'images' ? '-immagini-contenute' : st.mode === 'text' ? '-testo' : '-allegati')) + '.zip' });
    }, { job: true });
  }
}
