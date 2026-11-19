'use strict';
/* =====================================================================
   file360 — core
   ===================================================================== */
const { PDFDocument, StandardFonts, rgb, degrees, BlendMode, LineCapStyle,
  pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize, showText,
  setTextRenderingMode, TextRenderingMode, rotateAndSkewTextDegreesAndTranslate, setCharacterSqueeze } = PDFLib;

/* ---------- librerie compresse dentro la pagina (file unico): si aprono al primo uso ----------
   Nel file sono blocchi gzip in base64 che il browser non esegue all'apertura: la pagina parte molto prima. */
const LAZY_INLINE = {};
function inlineLib(name) { return document.getElementById('lazy-' + name); }
function inlineText(name) {
  return LAZY_INLINE[name] ||= (async () => {
    const el = inlineLib(name);
    // sito: i dati pesanti sono file a parte, scaricati la prima volta che servono (poi restano nella memoria del browser)
    if (!el) { const u = window.OFFICINA_DATA && window.OFFICINA_DATA[name]; if (!u) return null; const r = await fetch(u); if (!r.ok) throw new Error('Impossibile scaricare un componente necessario: controlla la connessione e riprova.'); return r.text(); }
    const bin = atob(el.textContent.trim()), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream !== 'undefined') return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return new TextDecoder().decode(pako.ungzip(bytes));
  })();
}

/* ---------- moduli eseguiti dopo il primo disegno ----------
   I moduli dei singoli strumenti (Word, Modifica, PDF/A, Moduli, Firme, XBRL, Excel, Analisi, Fatture) non servono
   per mostrare la home: build.py li mette in blocchi di testo che qui si eseguono uno alla volta nei momenti liberi,
   così l'avvio non ha blocchi lunghi. Chi apre uno strumento prima li fa eseguire subito (Later.all). */
const Later = {
  i: 0, list: null,
  _blocks() { return this.list ||= [...document.querySelectorAll('script[type="text/x-officina-later"]:not([data-lib])')]; },
  _src(el) {
    // sito: il codice del blocco è un file a parte, già scaricato in anticipo (prefetch); se non è ancora arrivato si legge ora
    if (el.dataset.src && !el.textContent) { const x = new XMLHttpRequest(); x.open('GET', el.dataset.src, false); x.send(); if (x.status !== 200) throw new Error('Impossibile scaricare un componente necessario: controlla la connessione e riprova.'); el.textContent = x.responseText; }
    if (!el.dataset.gz) return el.textContent; const bin = atob(el.textContent.trim()), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(pako.ungzip(u)); },
  _run(el, strict = true) { const s = document.createElement('script'); s.textContent = (strict ? '"use strict";\n' : '') + this._src(el); document.head.append(s); s.remove(); el.remove(); },
  next() { const b = this._blocks(); if (this.i >= b.length) return false; this._run(b[this.i++]); return true; },
  all() { while (this.next()); },
  // i blocchi fino a quello che definisce «name» (l'ordine conta: i blocchi dopo possono usare quelli prima); il resto a breve
  need(name) { const b = this._blocks(); const k = name ? b.findIndex(el => (' ' + (el.dataset.defs || '') + ' ').includes(' ' + name + ' ')) : -1; if (k < 0) { if (name && !(name in globalThis)) this.all(); else { const go = () => { if (this.next()) setTimeout(go, 0); }; setTimeout(go, 0); } return; } /* non trovata nei blocchi né già definita: si esegue tutto; già definita: il resto subito dopo */ while (this.i <= k && this.next()); const go = () => { if (this.next()) setTimeout(go, 0); }; setTimeout(go, 0); },
  // sito: scarica in sottofondo il codice dei blocchi (si esegue sempre e solo quando serve)
  prefetch() { this._pre = Promise.all([...document.querySelectorAll('script[type="text/x-officina-later"][data-src]')].filter(el => !el.textContent).map(el => fetch(el.dataset.src).then(r => r.ok ? r.text() : null).then(t => { if (t && !el.textContent) el.textContent = t; }).catch(() => { }))); return this._pre; },
  idle() { const step = () => { if (!this.next()) return; (window.requestIdleCallback || (f => setTimeout(f, 16)))(step, { timeout: 400 }); }; (this._pre || Promise.resolve()).then(() => setTimeout(step, 50)); },
};

/* ---------- pdf.js su richiesta ----------
   Il motore che legge e disegna i PDF (370 KB) non serve per mostrare la home: build.py lo mette in un blocco compresso
   che si esegue la prima volta che il programma chiede «pdfjsLib» (aprire un PDF, una miniatura). Sui computer si
   prepara da solo in un momento libero dopo l'avvio; sui telefoni solo quando serve. */
const PdfJs = {
  ready: false,
  load() { if (this.ready) return; this.ready = true; const el = document.querySelector('script[data-lib="pdfjs"]'); if (el) Later._run(el, false); setupPdfJs(); },
};
if (document.querySelector('script[data-lib="pdfjs"]')) Object.defineProperty(window, 'pdfjsLib', { configurable: true,
  get() { delete window.pdfjsLib; PdfJs.load(); return window.pdfjsLib; },
  set(v) { Object.defineProperty(window, 'pdfjsLib', { value: v, writable: true, configurable: true }); } });

/* The pdf.js engine runs in a background worker (fast); if the browser blocks workers it runs in this page instead. */
let PDFJS_MAIN = (() => { const w = window.pdfjsWorker; try { delete window.pdfjsWorker; } catch { window.pdfjsWorker = undefined; } return w; })();
let PDF_MAIN_THREAD = false, PDF_PORT_READY = null, PDF_SHARED_WORKER = null;
// apertura di un PDF con pdf.js, dopo che il suo motore in background è pronto (stessa forma di getDocument: { promise })
// il motore si prepara prima di leggere PDF_PORT_READY: alla prima apertura l'attesa del worker è compresa
const pdfDocument = src => { PdfJs.load(); return { promise: (PDF_PORT_READY || Promise.resolve()).then(() => pdfjsLib.getDocument(PDF_SHARED_WORKER && !src.worker ? { ...src, worker: PDF_SHARED_WORKER } : src).promise) }; };
function setupPdfJs() {
  // il motore, già pronto nel worker: un solo motore condiviso, passato a ogni documento (chiudere un documento non lo spegne per gli altri)
  const startPort = w => {
    let settled = false;
    return new Promise(res => {
      const done = ok => {
        if (settled) return; settled = true;
        if (ok) { try { PDF_SHARED_WORKER = pdfjsLib.PDFWorker.fromPort({ port: w }); } catch (e) { console.warn(e); try { w.terminate(); } catch { } } }
        else { try { w.terminate(); } catch { } }
        res(ok);
      };
      w.addEventListener('message', e => { if (e.data && e.data.action === 'ready') done(true); });
      w.addEventListener('error', () => done(false));
      setTimeout(() => done(false), 10000);
    });
  };
  try {
    // sito pubblicato: il motore è un file a parte (in cache)
    if (window.OFFICINA_PDFWORKER) pdfjsLib.GlobalWorkerOptions.workerSrc = window.OFFICINA_PDFWORKER;
    else if (inlineLib('pdfworker')) {
      // file unico: il motore è compresso nella pagina; si apre subito, in parallelo al resto
      PDF_PORT_READY = (async () => {
        try {
          const code = await inlineText('pdfworker');
          pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
          await startPort(new Worker(pdfjsLib.GlobalWorkerOptions.workerSrc));
        } catch (e) { console.warn('Worker PDF non disponibile', e); }
        PDF_PORT_READY = null;
      })();
    } else {
      const code = document.getElementById('pdfjs-worker').textContent;
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      // aperta dal disco (file://) pdf.js considererebbe il motore di un'altra origine e lavorerebbe nella pagina
      if (location.protocol === 'file:' || location.origin === 'null') {
        PDF_PORT_READY = startPort(new Worker(pdfjsLib.GlobalWorkerOptions.workerSrc)).then(() => { PDF_PORT_READY = null; });
      }
    }
  } catch (e) { console.warn('Worker PDF non disponibile', e); }
  // ripiego: il motore nella pagina (preso dal blocco compresso solo se serve davvero)
  try {
    Object.defineProperty(pdfjsLib.PDFWorker, '_setupFakeWorkerGlobal', {
      configurable: true,
      get() {
        if (!PDF_MAIN_THREAD) { PDF_MAIN_THREAD = true; console.info('file360: worker bloccato, elaborazione nella pagina'); }
        return (async () => {
          if (!PDFJS_MAIN && inlineLib('pdfworker')) {
            const s = document.createElement('script'); s.textContent = await inlineText('pdfworker'); document.head.append(s); s.remove();
            PDFJS_MAIN = window.pdfjsWorker;
          }
          if (!PDFJS_MAIN?.WorkerMessageHandler) throw new Error('Motore PDF non disponibile');
          return PDFJS_MAIN.WorkerMessageHandler;
        })();
      },
    });
  } catch (e) { console.warn(e); }
}

/* ---------- environment ---------- */
const IS_ARTIFACT = window.OFFICINA_ENV === 'artifact';
const IS_SITE = window.OFFICINA_ENV === 'site';      // sito pubblicato: una pagina per strumento, librerie pesanti caricate al primo uso
const SITE_BASE = IS_SITE && window.OFFICINA_BASE ? window.OFFICINA_BASE : new URL('./', location.href).href;
/* librerie usate solo da alcune funzioni (HEIC, TIFF, firme delle ricevute, dizionario dell'OCR): nel sito arrivano quando servono */
const LAZY_LIBS = {};
function need(name) {
  if (inlineLib(name)) return LAZY_LIBS[name] ||= loadInline(name);
  const src = window.OFFICINA_LIBS && window.OFFICINA_LIBS[name];
  if (!src) return Promise.resolve();
  return LAZY_LIBS[name] || (LAZY_LIBS[name] = new Promise((res, rej) => {
    // heic2any crea il suo worker durante il caricamento: si conserva il codice per poterlo eseguire nella pagina se i worker sono bloccati
    let restore = null;
    if (name === 'heic') {
      const C = URL.createObjectURL, W = window.Worker;
      URL.createObjectURL = function (b) { if (b instanceof Blob && /javascript/.test(b.type)) window.__heicWorkerBlob = b; return C.apply(URL, arguments); };
      window.Worker = function (u, o) { try { return new W(u, o); } catch (e) { return { __broken: true, postMessage() { }, addEventListener() { }, terminate() { } }; } };
      restore = () => { URL.createObjectURL = C; window.Worker = W; };
    }
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => { if (restore) restore(); res(); };
    s.onerror = () => { if (restore) restore(); delete LAZY_LIBS[name]; s.remove(); rej(new Error('Impossibile scaricare un componente necessario: controlla la connessione e riprova.')); };
    document.head.append(s);
  }));
}
// libreria compressa nella pagina: si decomprime e si esegue una volta sola
async function loadInline(name) {
  const code = await inlineText(name);
  let restore = null;
  if (name === 'heic') {
    // heic2any crea il suo worker durante il caricamento: si conserva il codice per poterlo eseguire nella pagina se i worker sono bloccati
    const C = URL.createObjectURL, W = window.Worker;
    URL.createObjectURL = function (b) { if (b instanceof Blob && /javascript/.test(b.type)) window.__heicWorkerBlob = b; return C.apply(URL, arguments); };
    window.Worker = function (u, o) { try { return new W(u, o); } catch (e) { return { __broken: true, postMessage() { }, addEventListener() { }, terminate() { } }; } };
    restore = () => { URL.createObjectURL = C; window.Worker = W; };
  }
  try { const s = document.createElement('script'); s.textContent = code; document.head.append(s); s.remove(); }
  finally { restore && restore(); }
}
// quando il browser è libero si preparano le librerie più usate, così al primo uso sono già pronte
function warmLibs(id, now = false) {
  // all'avvio (senza strumento) sul computer si prepara solo il motore PDF; il resto quando si apre lo strumento che lo usa
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
  if (!id) { if (!IS_TOUCH && typeof PdfJs !== 'undefined') idle(() => PdfJs.load(), { timeout: 3000 }); return; }
  const want = { ocr: ['lexicon'], word: ['lexicon'], excel: ['lexicon'], estrai: ['lexicon'], confronta: ['lexicon'], modifica: ['fontkit'], moduli: ['fontkit'] }[id] || [];
  const list = want.filter(n => inlineLib(n) && !(LAZY_LIBS && LAZY_LIBS[n]));
  const next = () => { const n = list.shift(); if (!n) return; idle(() => need(n).catch(() => {}).finally(next), { timeout: 4000 }); };
  if (now) next(); else setTimeout(next, 600);
}
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// telefono: si può scegliere una cartella? (iPhone e iPad no)
const CAN_PICK_DIR = !IS_IOS && 'webkitdirectory' in document.createElement('input');
// fotocamera: un pulsante che apre direttamente la fotocamera posteriore (telefoni e tablet)
function cameraButton(onFiles, { label = 'Scatta una foto', cls = '' } = {}) {
  if (!IS_TOUCH) return null;
  const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { const f = [...inp.files]; inp.value = ''; if (f.length) onFiles(f); } });
  return h('button', { class: 'btn dz-cam ' + cls, onclick: e => { e.stopPropagation(); inp.click(); } }, ic('camera', 18), label, inp);
}
const MAX_CANVAS_PX = 16e6; // under the iOS canvas limit (16.7 MP)

/* ---------- icons ---------- */
const ICONS = {
  alert:'<path d="M12 3.5 2.6 19.5h18.8z"/><path d="M12 10v4.5"/><path d="M12 17.2v.3"/>',
  keyboard:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cloud:'<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1 0 7.5z"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  recipe:'<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h3"/><path d="m8.5 6.5 1 1 2-2"/>',
  project:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  extract:'<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M13 3v5h5v3"/><path d="M14 18h7"/><path d="m18 15 3 3-3 3"/>',
  form:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><rect x="8" y="11" width="3.2" height="3.2" rx=".6"/><path d="M13.5 12.6H16"/><path d="M8 17.5h8"/>',
  field:'<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M7 10v4"/>',
  checkbox:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  comb:'<rect x="2.5" y="7" width="19" height="10" rx="1.5"/><path d="M7.25 7v10M12 7v10M16.75 7v10"/>',
  wand:'<path d="m15.5 3.5 1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4L12 7l2.4-1.1z"/><path d="M4 20l9-9"/><path d="M19 14.5v3M17.5 16h3"/>',
  pdfa:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 14.5 2 2 4-4.5"/>',
  pdfacheck:'<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M13 3v5h5v2"/><circle cx="16" cy="16" r="3.5"/><path d="m18.6 18.6 2.9 2.9"/>',
  merge:'<rect x="3" y="3" width="7.5" height="10" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="10" rx="1.5"/><path d="M6.75 13v2.5a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2V13"/><path d="M12 17.5V21"/>',
  split:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  compress:'<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  rotate:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  rotl:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  order:'<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
  hash:'<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  ocr:'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h10"/><path d="M7 16h6"/>',
  redact:'<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6.5" y="8" width="8" height="3.2" rx=".6" fill="currentColor"/><path d="M6.5 15.5h11"/>',
  upload:'<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  minus:'<path d="M5 12h14"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  share:'<path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  trash:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  spark:'<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  chart:'<path d="M4 20V10M9.5 20V5M15 20v-7M20.5 20V8"/><path d="M3 20.5h18"/>',
  layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M5.5 7h4M5.5 10h4M14.5 7h4M14.5 10h4M14.5 13h4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  back:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  arrow:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  star:'<path d="m12 2.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 15.9 6.8 18.8l1-5.9L3.5 8.7l5.9-.9z" fill="currentColor" stroke="none"/>',
  'star-o':'<path d="m12 2.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 15.9 6.8 18.8l1-5.9L3.5 8.7l5.9-.9z"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h10"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  bulb:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  orbit:'<ellipse cx="12" cy="12.5" rx="10" ry="4" transform="rotate(-24 12 12.5)"/><path d="M9 6h4l3 3v7a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 16V7.5A1.5 1.5 0 0 1 9 6z"/>',
  disk:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  wifi0:'<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><path d="M3 3l18 18"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  seal:'<path d="M12 2.6l2.3 1.5 2.8-.1.9 2.6 2.2 1.7-.9 2.7.9 2.7-2.2 1.7-.9 2.6-2.8-.1L12 21.4l-2.3-1.5-2.8.1-.9-2.6-2.2-1.7.9-2.7-.9-2.7 2.2-1.7.9-2.6 2.8.1z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2"/>',
  underline:'<path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M5 20h14"/>',
  strike:'<path d="M5 12h14"/><path d="M16.5 7.5C16 5.6 14.2 4.5 12 4.5c-2.6 0-4.5 1.4-4.5 3.4 0 1.5 1 2.6 3 3.1"/><path d="M8 16.5c.5 1.9 2.3 3 4.5 3 2.6 0 4.5-1.4 4.5-3.4 0-.5-.1-.9-.3-1.3"/>',
  sup:'<path d="m4 8 8 10M12 8 4 18"/><path d="M15.5 6.5a2 2 0 1 1 3.4 1.4L15.5 11h4"/>',
  sub:'<path d="m4 6 8 10M12 6 4 16"/><path d="M15.5 15.5a2 2 0 1 1 3.4 1.4L15.5 20h4"/>',
  aleft:'<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  acenter:'<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  aright:'<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  ajust:'<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  bullets:'<circle cx="5" cy="7" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="17" r="1.2"/><path d="M9.5 7H20M9.5 12H20M9.5 17H20"/>',
  numbers:'<path d="M4 5.5 5.5 4.5V10M4 10h3"/><path d="M4 14.5a1.5 1.5 0 1 1 2.6 1L4 19.5h3"/><path d="M10.5 7H20M10.5 12H20M10.5 17H20"/>',
  indentin:'<path d="M4 6h16M11 10h9M11 14h9M4 18h16"/><path d="m4 9.5 3 2.5-3 2.5"/>',
  indentout:'<path d="M4 6h16M11 10h9M11 14h9M4 18h16"/><path d="m7 9.5-3 2.5 3 2.5"/>',
  fcolor:'<path d="m6 17 6-13 6 13M8.3 12h7.4"/><path d="M4 20.5h16" stroke-width="3"/>',
  aacase:'<path d="m3 18 4.5-12L12 18M4.6 14h5.8"/><path d="M14 11.5a3 3 0 0 1 6 0V18M20 14.5h-3.5a2 2 0 1 0 0 3.5c2 0 3.5-1.3 3.5-3"/>',
  clearfmt:'<path d="M6 5h12M12 5l-3.5 14"/><path d="m15 14 5 5M20 14l-5 5"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  line:'<path d="M5 19 19 5"/>',
  arrowline:'<path d="M5 19 19 5M10 5h9v9"/>',
  replace:'<circle cx="10" cy="10" r="5.5"/><path d="m14 14 5 5"/><path d="M7.5 10h5M10 7.5v5"/>',
  symbol:'<path d="M8 19H5v-1.5C3.2 16 2.5 13.8 2.5 12a9.5 9.5 0 0 1 19 0c0 1.8-.7 4-2.5 5.5V19h-3"/><path d="M8 19c-1.6-1.8-2.5-4-2.5-6.5"/>',
  spacing:'<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 7.5 2-2.5 2 2.5M3.5 16.5l2 2.5 2-2.5M5.5 5v14"/>',
  growfont:'<path d="m3 19 5-14 5 14M5 14h6"/><path d="M17 9V3M14 6h6"/>',
  shrinkfont:'<path d="m3 19 5-14 5 14M5 14h6"/><path d="M14 6h6"/>',
  table:'<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.3h17M3.5 14.6h17M9.2 4v16M14.8 4v16"/>',
  invoice:'<path d="M6 3h8.5L18 6.5V21H6z"/><path d="M14.5 3v3.5H18"/><path d="M14.6 11.3a3.2 3.2 0 1 0 0 4.4M9 12.6h4.4M9 14.4h4.4"/>',
  receipt:'<path d="M6 3h12v18l-2.2-1.4L13.6 21l-1.6-1.4-1.6 1.4-2.2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  xbrl:'<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M9 9v11"/><path d="M12 13h5M12 16.5h3"/>',
  dot:'<circle cx="12" cy="12" r="5" fill="currentColor"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8 14h2M12 14h2M8 17h2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  cursor:'<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>',
  type:'<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  textedit:'<path d="M4 6V4h12v2"/><path d="M10 4v14"/><path d="M7 18h6"/><path d="M17 11v10"/><path d="M15 11h4M15 21h4"/>',
  square:'<rect x="3" y="3" width="18" height="18" rx="2"/>',
  aidetect:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/><path d="M8.5 12.5 10 9.5l1.5 3M8.9 11.7h2.2M13.3 9.5v3"/>',
  lease:'<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 14h5M9.5 17h5"/>',
  comment:'<path d="M4 5.5h16v10H9.5L5 19.5v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  textbox:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M8 9h8M12 9v7"/>',
  highlight:'<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  eraser:'<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  pen:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  photo:'<rect x="3" y="5" width="14" height="14" rx="2"/><circle cx="8" cy="10" r="1.6"/><path d="m17 15-3.5-3.5L6 19"/><path d="M20 8v11a2 2 0 0 1-2 2H8"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  sign:'<path d="M3 17c3-1 4-9 6-9s-1 9 2 9 3-5 5-5 1 4 3 4h2"/><path d="M3 21h18"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h1"/>',
  zoomin:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  zoomout:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  fit:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  swap:'<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
  reset:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  az:'<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M20 8h-5"/><path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10"/><path d="M15 14h5l-5 6h5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  zip:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M10 6h1M10 9h1M10 12h1M10 15h1v3h-1z"/>',
  bold:'<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic:'<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  move:'<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  info:'<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2M12 7.6v.2"/>',
  bank:'<path d="M3.5 9.5 12 4l8.5 5.5z"/><path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 20h17"/>',
  flask:'<path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 18a1.8 1.8 0 0 0 1.6 2.6h10a1.8 1.8 0 0 0 1.6-2.6l-5.1-9.3V3.5"/><path d="M7.4 14.5h9.2"/>',
  qr:'<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18.5 14h2"/>',
  ruler:'<path d="m3.5 16.5 13-13 4 4-13 13z"/><path d="m7 13 1.8 1.8M9.6 10.4l1.2 1.2M12.2 7.8l1.8 1.8M14.8 5.2l1.2 1.2"/>',
  cap:'<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.3c1.4 1.4 3.4 2.2 5.5 2.2s4.1-.8 5.5-2.2v-4.3M21.5 9.5v5"/>',
  vector:'<path d="M5 19c2-9 5-13 14-14"/><rect x="2.8" y="17" width="4.4" height="4.4" rx=".6"/><rect x="16.8" y="2.6" width="4.4" height="4.4" rx=".6"/><circle cx="12" cy="9" r="1.6"/>',
  poster:'<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M12 3v18M3 12h18"/><path d="M6.5 6.5l2 2M15.5 15.5l2 2" opacity=".6"/>',
  count:'<path d="M4 6h11M4 11h16M4 16h8"/><path d="M16.5 15.5h4l-4 4h4"/>',
  building:'<rect x="4.5" y="3.5" width="10" height="17" rx="1"/><path d="M14.5 9.5h5v11h-5M8 7.5h3M8 11h3M8 14.5h3M10 20.5v-2.5"/>',
  stamp:'<path d="M9.5 3.5h5l-.8 6.5h3.3a2 2 0 0 1 2 2v2.5H5V12a2 2 0 0 1 2-2h3.3z"/><path d="M5 18h14M7 20.5h10"/>',
  blank:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>',
};
function ic(name, size = 20, sw = 1.9) {
  const s = document.createElement('span');
  s.className = 'ic';
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return s;
}

/* ---------- DOM helper ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v === 'boolean' || typeof v === 'number' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : String(c)); }
  if (value !== undefined) el.value = value;
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
// pausa minima per lasciare respirare la pagina. Non usa setTimeout: nelle schede in secondo piano il browser lo rallenta
// (fino a una volta al minuto) e le elaborazioni sembravano ferme finché non si tornava su Officina.
const tick = (() => {
  if (typeof MessageChannel === 'undefined') return () => new Promise(r => setTimeout(r, 0));
  const ch = new MessageChannel(), q = [];
  ch.port1.onmessage = () => { const r = q.shift(); r && r(); };
  return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); });
})();
/* lavoro in corso con la scheda in secondo piano: avanzamento nel titolo della scheda, avviso a fine lavoro,
   niente chiusura accidentale e la scheda resta attiva (un «lock» impedisce al browser di sospenderla) */
const BgWork = {
  on: false, base: null, t0: 0, release: null,
  start() {
    if (this.on) return;
    this.on = true; this.t0 = Date.now();
    if (this.base == null || !/^(\d+% · |✓ )/.test(document.title)) this.base = document.title;
    addEventListener('beforeunload', this.guard);
    try { navigator.locks?.request('officina-elaborazione', () => new Promise(r => { this.release = r; })).catch(() => {}); } catch { }
  },
  progress(frac) { if (this.on && frac != null) document.title = `${Math.round(clamp(frac, 0, 1) * 100)}% · ${this.base}`; },
  stop() {
    if (!this.on) return;
    this.on = false;
    removeEventListener('beforeunload', this.guard);
    try { this.release?.(); } catch { } this.release = null;
    // finito mentre si lavorava su altro: lo dice il titolo della scheda finché non si torna qui
    if (document.hidden) {
      document.title = `✓ Pronto · ${this.base}`;
      const back = () => { if (!document.hidden) { if (!this.on) document.title = this.base; document.removeEventListener('visibilitychange', back); } };
      document.addEventListener('visibilitychange', back);
    } else document.title = this.base;
  },
  guard(e) { e.preventDefault(); e.returnValue = ''; return ''; },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stripExt = n => n.replace(/\.[^.]+$/, '');
const ensurePdf = n => { n = (n || 'documento').trim().replace(/[\\/:*?"<>|]+/g, '-'); return /\.pdf$/i.test(n) ? n : n + '.pdf'; };
const IMG_ACCEPT = 'image/*,.jpg,.jpeg,.jfif,.png,.heic,.heif,.tif,.tiff,.webp,.gif,.bmp,.avif';
const IMG_EXT_RE = /\.(jpe?g|jfif|png|heic|heif|tiff?|webp|gif|bmp|avif)$/i;
const isImage = f => IMG_EXT_RE.test(f.name) || (/^image\//.test(f.type) && !/svg/.test(f.type));
const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || /\.pdf(\.p7m)+$|\.(p7m|tsd|m7m)$/i.test(f.name);
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toLocaleString('it-IT', { maximumFractionDigits: 0 }) + ' KB';
  return (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || [0, '000000'];
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const toHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = src; });
}
function canvasToBytes(canvas, type = 'image/jpeg', q = 0.85) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('Conversione immagine non riuscita')), type, q));
}

/* gli stili aggiunti a pagina aperta (animazioni degli strumenti) stanno nello stesso livello del CSS storico:
   così tra loro valgono le regole di sempre e il design system, fuori dai livelli, ha l'ultima parola */
const inLegacy = css => document.documentElement.dataset.ds ? '@layer legacy{' + css + '}' : css;

/* ---------- page ranges ---------- */
function parseRanges(str, max) {
  const groups = [];
  for (const tok of String(str).split(/[,;]+/)) {
    const t = tok.trim();
    if (!t) continue;
    let a, b;
    const m = t.match(/^(\d*)\s*[-–]\s*(\d*)$/);
    if (m && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; }
    else if (/^\d+$/.test(t)) a = b = +t;
    else throw new Error(`"${t}" non è un intervallo valido (es. 1-3, 5, 8-)`);
    if (a < 1 || b > max || a > b) throw new Error(`"${t}" è fuori dalle pagine 1–${max}`);
    const g = []; for (let i = a; i <= b; i++) g.push(i);
    groups.push(g);
  }
  if (!groups.length) throw new Error('Indica almeno una pagina');
  return groups;
}

// [2,3,4,7] → «2-4, 7»
function rangesText(list) {
  const a = [...new Set(list)].sort((x, y) => x - y), out = [];
  for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? `${a[i]}-${a[j]}` : `${a[i]}`); i = j; }
  return out.join(', ');
}
/* ---------- estrai pagine (Organizza, Modifica) ----------
   Le pagine estratte diventano un PDF in più; il documento di partenza resta com'è, oppure (se si sceglie di toglierle)
   la sua nuova versione senza quelle pagine diventa il documento su cui si continua a lavorare. */
async function pdfWithPages(bytes, idx) {
  const src = await loadLib(bytes), out = await PDFDocument.create();
  const cp = await out.copyPages(src, idx); cp.forEach(p => out.addPage(p));
  DocStruct.carry(out, [{ src, map: k => { const j = idx.indexOf(k); return j >= 0 ? j : undefined; } }]);
  return saveDoc(out);
}
// posizione nel file nuovo di ogni pagina d'origine (la prima volta che compare: le copie non hanno segnalibri)
function posMap(entries) {
  const m = new Map(), all = new Map(); entries.forEach((e, j) => { if (e.src === 'blank') return; if (!m.has(e.src)) m.set(e.src, j); if (!all.has(e.src)) all.set(e.src, []); all.get(e.src).push(j); });
  const f = k => m.get(k); f.all = k => all.get(k) || []; return f;   // (all: tutte le posizioni di una pagina usata più volte)
}
function showExtracted({ base, positions, extracted, rest = null }) {
  const n = positions.length, lab = n === 1 ? `pagina-${positions[0]}` : `pagine ${rangesText(positions)}`;
  const ex = { name: `${base}-${lab}.pdf`, bytes: extracted, info: n === 1 ? 'pagina estratta' : `${n} pagine estratte` };
  const title = n === 1 ? 'Pagina estratta' : 'Pagine estratte';
  if (typeof Activity !== 'undefined') try { Activity.result(rest ? [ex, { name: `${base}-senza.pdf`, bytes: rest }] : [ex], { title }); } catch { }
  if (!rest) return showResultNow([ex], { title, note: 'Il documento di partenza resta com’è: le pagine sono anche nel nuovo PDF.', noNext: true, _fromJob: true });
  const r = { name: `${base}-senza ${lab.replace(/^pagina-/, 'pagina ')}.pdf`, bytes: rest, info: 'il documento senza le pagine estratte' };
  return showResultNow([ex, r], { title, note: n === 1 ? 'La pagina è stata tolta dal documento: continui a lavorare sulla versione senza di essa.' : 'Le pagine sono state tolte dal documento: continui a lavorare sulla versione senza di esse.', primary: 0, version: 1, noNext: true, reloadAfter: true });
}

/* ---------- toast ---------- */
function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' }, ic(kind === 'error' ? 'x' : 'check', 16, 2.4), msg);
  $('#toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, kind === 'error' ? 5200 : 3200);
}
/* annuncio per chi usa un lettore di schermo (una sola regione, discreta) */
function say(msg) {
  let r = document.getElementById('sr-say');
  if (!r) { r = h('div', { id: 'sr-say', class: 'sr-only', role: 'status' }); document.body.append(r); }
  r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 60);
}
/* spostare una scheda con i pulsanti: il fuoco resta sullo stesso pulsante (o sull'altro, se si è arrivati in fondo) e lo si annuncia */
function keepMoveFocus(el, label, other, msg) {
  requestAnimationFrame(() => {
    const b = el.querySelector(`[aria-label="${label}"]`), o = el.querySelector(`[aria-label="${other}"]`);
    (b && !b.disabled ? b : o || b)?.focus();
    say(msg);
  });
}
/* avviso con azioni (es. «Scarica», «Annulla»): resta qualche secondo in più e si può cliccare */
function toastActions(msg, actions, ms = 7000) {
  const t = h('div', { class: 'toast act', role: 'status' }, ic('check', 16, 2.4), h('span', { class: 'toast-m' }, msg),
    ...actions.map(([label, fn]) => h('button', { class: 'toast-b', onclick: () => { t.remove(); fn(); } }, label)));
  $('#toasts').replaceChildren(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, ms);
}

/* ---------- busy overlay ---------- */
/* ---------- attese e coda dei lavori ----------
   Un lavoro (OCR, conversione, compressione…) parte con la finestra di attesa; con «Continua in secondo piano»
   (o cambiando strumento) passa nel pannello «Lavori» in basso e si può usare altro. Un lavoro chiesto mentre un
   altro è in corso va in coda: ogni lavoro usa già tutti i processori, quindi in fila si finisce prima che insieme.
   Le operazioni brevi (aprire un file) non entrano in coda. */
class CancelError extends Error { constructor() { super('Operazione annullata'); this.cancel = true; } }
// errore con un codice (per spiegarlo meglio a chi lo vede)
// letture delle scansioni fatte in questa sessione (Modifica): solo in memoria, si perdono chiudendo la scheda
const READ_CACHE = new Map();
const cloneRead = v => { try { return structuredClone(v); } catch { return null; } };
/* =====================================================================
   Centro privacy. I documenti non escono mai dal dispositivo; qui si vede (e si cancella) tutto ciò che il
   prodotto tiene in questo browser: progetti e versioni, registro, dati personali per compilare i moduli,
   preferenze, letture in memoria. In più:
   · scadenza: progetti, lavori da riprendere e registro più vecchi di N giorni si cancellano da soli all'apertura;
   · nessuna traccia: tutto ciò che si salva si cancella alla chiusura della scheda (e comunque alla riapertura);
   · frase segreta: i dati personali salvati (profilo, valori dei moduli, firme e timbri, correzioni imparate, bozza del contratto) si
     cifrano con AES-GCM 256 (chiave da PBKDF2-SHA-256, 310 000 passaggi): senza la frase restano illeggibili.
     La frase non si salva da nessuna parte; dimenticarla significa perdere quei dati (non il resto).
   ===================================================================== */
const Privacy = (() => {
  const CFG = 'file360.privacy';
  const KEEP = k => k === CFG || k === 'officina-theme' || k === 'file360-theme';
  const OURS = k => /^(officina|file360)/.test(k);
  const PERSONAL = k => k === 'officina-profilo' || k === 'officina-firme' || k === 'officina.moduli' || k === 'officina.moduli.valori' || k === 'file360.stamps' || k === 'officina.ocr.impara' || k === 'officina-contratto';
  const S = typeof Storage !== 'undefined' ? Storage.prototype : null;
  const gi = S && S.getItem, si = S && S.setItem, ri = S && S.removeItem;
  const raw = { get: k => { try { return gi.call(localStorage, k); } catch { return null; } }, set: (k, v) => { try { si.call(localStorage, k, v); } catch { } }, del: k => { try { ri.call(localStorage, k); } catch { } } };
  const cfg = () => { try { return JSON.parse(raw.get(CFG)) || {}; } catch { return {}; } };
  const setCfg = c => raw.set(CFG, JSON.stringify(c));
  let key = null; const plain = new Map(); let warned = false;
  const vaultOn = () => !!cfg().vault;
  const b64 = u => btoa(String.fromCharCode(...u)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const te = new TextEncoder(), td = new TextDecoder();
  async function derive(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function enc(k, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(text))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return 'enc1:' + b64(o); }
  async function dec(k, s) { const u = unb64(s.slice(5)); return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, k, u.slice(12))); }
  const personalKeys = () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && PERSONAL(k)) out.push(k); } } catch { } return out; };
  // la memoria del browser passa di qui: i dati personali, se protetti, si leggono e scrivono solo sbloccati (e cifrati)
  if (S) {
    S.getItem = function (k) { if (this === window.localStorage && PERSONAL(k) && vaultOn()) return key && plain.has(k) ? plain.get(k) : null; return gi.call(this, k); };
    S.setItem = function (k, v) {
      if (this === window.localStorage && PERSONAL(k) && vaultOn()) {
        if (!key) { if (!warned) { warned = true; setTimeout(() => typeof toastActions === 'function' && toastActions('Dati personali protetti: sbloccali per salvarli', [['Sblocca', () => open()]]), 0); } return; }
        plain.set(k, String(v)); enc(key, String(v)).then(c => raw.set(k, c)).catch(e => console.warn('cifratura', e)); return;
      }
      return si.call(this, k, v);
    };
    S.removeItem = function (k) { if (this === window.localStorage) plain.delete(k); return ri.call(this, k); };
  }
  async function protect(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 310000, k = await derive(pass, salt, iter);
    const vals = personalKeys().map(n => [n, raw.get(n)]);
    for (const [n, v] of vals) if (v != null && !v.startsWith('enc1:')) { raw.set(n, await enc(k, v)); plain.set(n, v); }
    setCfg({ ...cfg(), vault: { salt: b64(salt), iter, check: await enc(k, 'file360') } }); key = k;
  }
  async function unlock(pass) {
    const v = cfg().vault; if (!v) return true;
    const k = await derive(pass, unb64(v.salt), v.iter);
    try { if (await dec(k, v.check) !== 'file360') return false; } catch { return false; }
    plain.clear(); for (const n of personalKeys()) { const c = raw.get(n); if (c && c.startsWith('enc1:')) { try { plain.set(n, await dec(k, c)); } catch { } } else if (c != null) plain.set(n, c); }
    key = k; return true;
  }
  function lock() { key = null; plain.clear(); }
  async function unprotect(pass) { if (!key && !(await unlock(pass))) return false; for (const [n, v] of plain) raw.set(n, v); const c = cfg(); delete c.vault; setCfg(c); lock(); return true; }
  // cancellazioni
  const memClear = () => { try { SharedRead.clear(); } catch { } try { READ_CACHE.clear(); } catch { } try { OcrPool.clear(); } catch { } };
  async function clearProjects() { try { await Store.clear('progetti'); await Store.clear('blobs'); await Store.clear('ripresa'); } catch (e) { console.warn(e); } }
  async function clearLog() { try { await Store.clear('attivita'); } catch (e) { console.warn(e); } }
  function clearPersonal() { for (const n of personalKeys()) raw.del(n); plain.clear(); }
  function clearPrefs() { const ks = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && OURS(k) && !KEEP(k) && !PERSONAL(k)) ks.push(k); } } catch { } ks.forEach(raw.del); try { for (const k of Object.keys(sessionStorage)) if (OURS(k)) sessionStorage.removeItem(k); } catch { } }
  async function clearAll() { memClear(); clearPersonal(); clearPrefs(); await clearProjects(); await clearLog(); const c = cfg(); delete c.vault; setCfg(c); lock(); }
  // scadenza e «nessuna traccia», all'avvio
  async function startup() {
    const c = cfg();
    if (c.temp) { clearPersonal(); clearPrefs(); await clearProjects(); await clearLog(); return; }
    const days = c.days ?? 90; if (!days) return;
    const cut = Date.now() - days * 86400e3;
    try {
      const ps = await Store.all('progetti'), old = ps.filter(p => (p.updated || p.created || 0) < cut && !p.open);
      if (old.length) { await Store.batch('progetti', o => old.forEach(p => o.delete(p.id))); const used = new Set((await Store.all('progetti')).flatMap(p => [...(p.versions || []), ...(p.files || []), ...(p.results || [])].map(x => x.key))); const dead = (await Store.keys('blobs')).filter(k => !used.has(k)); if (dead.length) await Store.batch('blobs', o => dead.forEach(k => o.delete(k))); }
      const log = await Store.all('attivita'), oldL = log.filter(e => (e.at || 0) < cut); if (oldL.length) await Store.batch('attivita', o => oldL.forEach(e => o.delete(e.id)));
    } catch (e) { console.warn('scadenza dei dati', e); }
  }
  if (typeof window !== 'undefined') {
    setTimeout(() => { startup(); if (vaultOn() && personalKeys().length && typeof toastActions === 'function') toastActions('I tuoi dati personali salvati sono protetti dalla frase segreta', [['Sblocca', () => open()]], 9000); }, 1500);
    window.addEventListener('pagehide', () => { if (cfg().temp) { clearPersonal(); clearPrefs(); clearProjects(); clearLog(); } });
  }
  // la finestra
  async function sizes() {
    const n = async s => { try { return (await Store.keys(s)).length; } catch { return 0; } };
    let blobBytes = 0; try { for (const b of await Store.all('blobs')) blobBytes += b?.size || 0; } catch { }
    let personal = 0, prefs = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || !OURS(k) || KEEP(k)) continue; const len = (raw.get(k) || '').length * 2; if (PERSONAL(k)) personal += len; else prefs += len; } } catch { }
    return { projects: await n('progetti'), blobBytes, log: await n('attivita'), personal, prefs, mem: (() => { try { return SharedRead.size(); } catch { return 0; } })() };
  }
  async function askPass(title, { confirm = false } = {}) {
    return new Promise(res => {
      let done = false;
      const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Frase segreta' }), p2 = confirm ? h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Ripeti la frase', style: { marginTop: '8px' } }) : null;
      const msg = h('div', { class: 'small', style: { color: 'var(--danger, #c00)', minHeight: '18px', marginTop: '6px' } });
      const fin = v => { if (done) return; if (v != null && confirm) { if (v.length < 8) { msg.textContent = 'Almeno 8 caratteri.'; return; } if (v !== p2.value) { msg.textContent = 'Le due frasi non coincidono.'; return; } } done = true; m.close(); res(v); };
      [p1, p2].filter(Boolean).forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') fin(p1.value); }));
      const m = modal([h('h3', {}, title), p1, p2, msg, h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', marginTop: '8px' } }, h('button', { class: 'btn', onclick: () => fin(null) }, 'Annulla'), h('button', { class: 'btn primary', onclick: () => fin(p1.value) }, 'Conferma'))], { width: 420, onClose: () => { if (!done) { done = true; res(null); } } });
      setTimeout(() => p1.focus(), 30);
    });
  }
  async function open() {
    const body = h('div', { class: 'pv-body' });
    const m = modal([h('h3', {}, 'Privacy e dati sul dispositivo'), body], { width: 620, cls: 'pv-modal' });
    const kb = b => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    async function draw() {
      const z = await sizes(), c = cfg(), locked = vaultOn() && !key;
      const row = (title, desc, info, act) => h('div', { class: 'pv-row' }, h('div', { class: 'grow' }, h('div', { class: 'pv-t' }, title), h('div', { class: 'muted small' }, desc)), h('span', { class: 'pv-n small' }, info), act);
      const del = (label, fn, ok) => h('button', { class: 'btn sm', onclick: async () => { await fn(); toast(ok); draw(); } }, ic('trash', 14), label);
      body.replaceChildren(
        h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'I documenti si elaborano solo in questo browser: non vengono mai caricati su internet. Sul dispositivo restano soltanto le cose elencate qui sotto, e puoi cancellarle quando vuoi.'),
        row('Progetti e versioni', 'I file aperti, le versioni e i risultati, per riprendere il lavoro.', z.projects ? `${z.projects} · ${kb(z.blobBytes)}` : 'vuoto', del('Cancella', clearProjects, 'Progetti cancellati')),
        row('Registro delle attività', 'Le operazioni fatte, con l’impronta dei file (non il loro contenuto).', z.log ? `${z.log} voci` : 'vuoto', del('Cancella', clearLog, 'Registro cancellato')),
        row('Dati personali per i moduli', 'Profilo (nome, codice fiscale, IBAN…), valori ricordati, firme e timbri salvati, correzioni imparate, bozza del contratto di affitto.' + (vaultOn() ? (locked ? ' Protetti e bloccati.' : ' Protetti e sbloccati.') : ''), z.personal ? kb(z.personal) : 'vuoto', del('Cancella', async () => clearPersonal(), 'Dati personali cancellati')),
        row('Preferenze', 'Preferiti, ricette, scelte degli strumenti, ultimo file aperto nel cloud.', z.prefs ? kb(z.prefs) : 'vuoto', del('Cancella', async () => clearPrefs(), 'Preferenze cancellate')),
        row('Letture in memoria', 'Il testo letto dalle scansioni in questa scheda, per non rileggerlo in ogni strumento. Sparisce chiudendo la scheda.', z.mem ? `${z.mem} pagine` : 'vuoto', del('Svuota', async () => memClear(), 'Memoria svuotata')),
        h('div', { class: 'pv-sec' }, h('b', {}, 'Cancellazione automatica'),
          h('div', { class: 'muted small', style: { margin: '2px 0 8px' } }, 'Progetti, lavori da riprendere e registro più vecchi di così si cancellano da soli all’apertura.'),
          seg([[7, '7 giorni'], [30, '30 giorni'], [90, '90 giorni'], [0, 'Mai']], c.days ?? 90, v => { setCfg({ ...cfg(), days: +v }); toast(+v ? `Cancellazione dopo ${v} giorni` : 'Cancellazione automatica spenta'); })),
        h('div', { class: 'pv-sec' }, checkbox('Nessuna traccia', !!c.temp, v => { setCfg({ ...cfg(), temp: !!v }); toast(v ? 'Nessuna traccia: tutto si cancella alla chiusura della scheda' : 'I progetti si conservano di nuovo'); }, 'Per i computer condivisi: tutto ciò che salvi (progetti, registro, dati personali, preferenze) si cancella quando chiudi la scheda.')),
        typeof crypto !== 'undefined' && crypto.subtle ? h('div', { class: 'pv-sec' }, h('b', {}, 'Frase segreta per i dati personali'),
          h('div', { class: 'muted small', style: { margin: '2px 0 8px' } }, vaultOn() ? 'I dati personali salvati sono cifrati (AES-GCM 256). Senza la frase non si leggono: se la dimentichi, quei dati vanno persi (il resto no).' : 'Cifra i dati personali salvati (AES-GCM 256): senza la frase restano illeggibili, anche per chi usa questo computer.'),
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, ...(vaultOn() ? [
            locked ? h('button', { class: 'btn sm primary', onclick: async () => { const p = await askPass('Sblocca i dati personali'); if (p == null) return; if (await unlock(p)) { toast('Dati personali sbloccati'); draw(); } else toast('Frase non corretta', 'error'); } }, ic('key', 14), 'Sblocca') : h('button', { class: 'btn sm', onclick: () => { lock(); toast('Dati personali bloccati'); draw(); } }, ic('key', 14), 'Blocca'),
            h('button', { class: 'btn sm ghost', onclick: async () => { const p = locked ? await askPass('Frase segreta attuale') : ''; if (p == null) return; if (await unprotect(p)) { toast('Protezione tolta'); draw(); } else toast('Frase non corretta', 'error'); } }, 'Togli la protezione')] : [
            h('button', { class: 'btn sm primary', onclick: async () => { const p = await askPass('Scegli una frase segreta', { confirm: true }); if (p == null) return; await protect(p); toast('Dati personali protetti'); draw(); } }, ic('key', 14), 'Proteggi con una frase segreta')]))) : null,
        h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '16px', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn danger', onclick: async () => { if (!confirm('Cancellare tutto ciò che file360 tiene in questo browser? Progetti, registro, dati personali e preferenze non si potranno recuperare.')) return; await clearAll(); toast('Tutto cancellato'); draw(); } }, ic('trash', 16), 'Cancella tutto'),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Chiudi')));
    }
    draw();
  }
  return { open, protect, unlock, lock, unprotect, clearAll, clearProjects, clearLog, clearPersonal, clearPrefs, memClear, cfg, setCfg, startup, vaultOn, isLocked: () => vaultOn() && !key };
})();
function codedError(msg, code) { const e = new Error(msg); e.code = code; return e; }

/* ---------- errori spiegati, con un'azione accanto ----------
   ogni errore diventa: che cosa è successo (in italiano), cosa si può fare (pulsanti) e il dettaglio tecnico (a richiesta) */
const Errors = (() => {
  const FORMATS = [['PDF', '.pdf, anche firmati .p7m, .tsd, .m7m'], ['Immagini', 'JPG, PNG, HEIC, TIFF, WebP, GIF, BMP, AVIF'], ['Fatture elettroniche', 'XML FatturaPA, P7M, ZIP del cassetto fiscale'],
    ['Bilanci', 'XBRL (.xbrl, .xml) anche firmati'], ['Archivi', 'ZIP (per fatture)']];
  function showFormats() {
    modal([h('h3', {}, 'Formati supportati'), h('div', { class: 'err-formats' }, FORMATS.map(([k, v]) => h('div', {}, h('b', {}, k), h('span', { class: 'muted small' }, v)))),
      h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'Documenti Word, Excel o pagine web vanno prima salvati in PDF dal programma che li apre (File › Salva come › PDF).')], { width: 460 });
  }
  const curFile = ctx => ctx.file || (typeof CURRENT_INPUT !== 'undefined' && CURRENT_INPUT.length === 1 ? CURRENT_INPUT[0] : null);
  const userText = m => /[àèéìòù]|\b(il|la|non|del|della|file|pagina|prova)\b/i.test(m) && m.length < 400;
  function explain(e, ctx = {}) {
    const name = e?.name || '', msg = String(e?.message || e || ''), code = e?.code;
    const file = curFile(ctx), tool = ctx.tool || (typeof CURRENT_TOOL !== 'undefined' ? CURRENT_TOOL : null);
    const retry = ctx.retry ? ['Riprova', ctx.retry] : null;
    const go = (id, f) => () => { if (f && TOOLS[id]) handoff(id, f); else if (TOOLS[id]) nav(id); };
    const tech = [name && name !== 'Error' ? name : null, code ? 'codice ' + code : null, msg].filter(Boolean).join(' · ') + (e?.stack ? '\n\n' + String(e.stack).split('\n').slice(0, 8).join('\n') : '');
    const r = (kind, title, text, actions) => ({ kind, title, text, actions: actions.filter(Boolean), tech });
    if (e?.cancel || name === 'AbortError' || name === 'AbortException') return r('abort', 'Operazione annullata', 'Operazione annullata.', []);
    if (name === 'PasswordException' || code === 'PASSWORD' || code === 'WRONG' || /protett[oa] da password|password (errata|sbagliata|non corretta)/i.test(msg))
      return r('password', 'PDF protetto da password', 'Il PDF è protetto da password: inseriscila per aprirlo (la protezione non resta nel file che salvi).',
        [file && typeof unlockForOpen === 'function' ? ['Inserisci la password', async () => { try { const b = new Uint8Array(await file.arrayBuffer()); const u = await unlockForOpen(b, file.name); handoff(tool || 'proteggi', new File([u.bytes], file.name, { type: 'application/pdf' })); } catch (er) { show(er); } }] : ['Apri «Proteggi e sblocca»', go('proteggi', file)]]);
    if (name === 'InvalidPDFException' || code === 'INVALID' || /non sembra un PDF valido|danneggiat|corrott|Invalid PDF|No PDF header|Failed to parse|Invalid object ref|Expected instance of PDF/i.test(msg))
      return r('invalid', 'File non valido', userText(msg) && !/^Invalid|Failed|Expected/i.test(msg) ? msg.replace(/^Error:\s*/, '') : 'Il file non è un PDF valido o è danneggiato.', [file ? ['Prova a ripararlo', () => Repair.run(file, tool)] : null, ['Formati supportati', showFormats]]);
    if (name === 'MissingPDFException' || name === 'NotFoundError' || name === 'NotReadableError' || code === 'MISSING')
      return r('missing', 'File non trovato', 'Il file non è più disponibile: forse è stato spostato, rinominato o cancellato dopo averlo scelto.', [tool ? ['Ricarica il file', () => openTool(tool, null, { fresh: true })] : ['Ricarica il file', () => nav('')]]);
    if (name === 'FormatError' || name === 'UnknownErrorException' || code === 'FORMAT' || /formato non supportato|non è supportat|unsupported (format|image)/i.test(msg))
      return r('format', 'Formato non adatto', userText(msg) ? msg.replace(/^Error:\s*/, '') : 'Formato non supportato.', [['Formati supportati', showFormats]]);
    // il file si apre ma non contiene ciò che lo strumento cerca (un bilancio, un estratto conto…): non è un guasto
    if (code === 'CONTENT') return r('content', 'Contenuto non riconosciuto', msg.replace(/^Error:\s*/, ''), [retry]);
    if (name === 'QuotaExceededError' || /quota/i.test(msg))
      return r('space', 'Spazio esaurito', 'Lo spazio che il browser concede a file360 è pieno: elimina qualche progetto vecchio o una versione che non ti serve.', [['Apri i progetti', () => nav('progetti')]]);
    if (name === 'RangeError' || /out of memory|memoria insufficiente|allocation failed|Array buffer allocation|Invalid array length|Invalid typed array length/i.test(msg))
      return r('memory', 'Memoria insufficiente', 'Memoria insufficiente per questo file. Prova con un file più piccolo: puoi comprimerlo o dividerlo in parti, poi riprovare. Chiudere altre schede aiuta.',
        [file && tool !== 'comprimi' ? ['Comprimi', go('comprimi', file)] : null, file && tool !== 'dividi' ? ['Dividi in parti', go('dividi', file)] : null, retry]);
    if (name === 'TimeoutError' || code === 'TIMEOUT' || /timeout|tempo scaduto|troppo tempo/i.test(msg))
      return r('timeout', 'Operazione troppo lunga', 'Operazione troppo lunga: il dispositivo non ha risposto in tempo. Riprova, oppure dividi il file in parti più piccole.', [retry, file && tool !== 'dividi' ? ['Dividi in parti', go('dividi', file)] : null]);
    if (name === 'TypeError' && /Failed to fetch|NetworkError|Load failed|network/i.test(msg))
      return r('network', 'Connessione non riuscita', 'Connessione non riuscita: controlla di essere online e riprova.', [retry]);
    return r('other', 'Qualcosa non ha funzionato', userText(msg) ? msg : 'Si è verificato un errore imprevisto. Riprova; se succede ancora, il dettaglio tecnico aiuta a capire.', [retry]);
  }
  function details(info) {
    modal([h('h3', {}, info.title), h('p', {}, info.text),
      info.actions.length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px', margin: '10px 0' } }, info.actions.map(([l, f]) => h('button', { class: 'btn sm', onclick: () => { closeAllModals(); f(); } }, l))) : null,
      h('details', { class: 'err-tech' }, h('summary', {}, 'Dettaglio tecnico'), h('pre', {}, info.tech)),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn', onclick: async () => { await copyText(info.tech); } }, 'Copia il dettaglio'))], { width: 520 });
  }
  // mostra l'errore: avviso con le azioni + «Dettagli»; lo registra nelle attività
  let last = null;
  function show(e, ctx = {}) {
    const info = explain(e, ctx);
    if (info.kind === 'abort') { toast('Operazione annullata'); return info; }
    // «Nessun PDF valido» subito dopo l'errore vero del file: resta quello, più utile
    if (/^Nessun (PDF|file) (valid|leggibil|utilizzabil)/i.test(String(e?.message || '')) && last && Date.now() - last.at < 6000) return last.info;
    last = { at: Date.now(), info };
    if (!ctx.quiet) console.error(e);
    if (ctx.inline) { if (!ctx.noLog && typeof Activity !== 'undefined') Activity.error(info, ctx); return info; }   // lo mostra chi chiama, nel suo riquadro
    const acts = [...info.actions, ['Dettagli', () => details(info)]];
    // un errore con le sue azioni resta finché non lo si chiude o non si sceglie cosa fare: niente conto alla rovescia
    const text = ctx.skipped && ctx.file ? `«${ctx.file.name}» non è stato aggiunto. ${info.text}` : info.text;
    const t = h('div', { class: 'toast error act err-toast', role: 'alert' }, ic('alert', 16, 2.4), h('span', { class: 'toast-m', title: text }, text),
      ...acts.map(([label, fn]) => h('button', { class: 'toast-b', onclick: () => { t.remove(); fn(); } }, label)),
      h('button', { class: 'toast-x', 'aria-label': 'Chiudi l’avviso', title: 'Chiudi', onclick: () => t.remove() }, ic('x', 15, 2.2)));
    $('#toasts').replaceChildren(t);
    if (!ctx.noLog && typeof Activity !== 'undefined') Activity.error(info, ctx);
    return info;
  }
  return { explain, show, details, showFormats };
})();
/* paracadute: un errore sfuggito alla gestione dello strumento (un clic che «non fa niente») si spiega comunque, con il
   dettaglio tecnico a richiesta; resta anche nella console, così i test lo vedono. Uno ogni 8 secondi al massimo. */
(() => {
  let last = 0;
  const show = err => {
    if (!err || err.cancel || /Abort/.test(err.name || '') || typeof err !== 'object') return;
    if (/ResizeObserver|Script error|Load failed.*(favicon|cloud\.json)/i.test(String(err.message || ''))) return;
    if (!document.querySelector('.tool') || Date.now() - last < 8000) return;
    last = Date.now(); try { Errors.show(err); } catch { }
  };
  window.addEventListener('unhandledrejection', e => show(e.reason));
  window.addEventListener('error', e => { if (e.error) show(e.error); });
})();

/* ---------- riparazione di un PDF danneggiato ----------
   1) intestazione spostata o dati in coda: si taglia; 2) tabella degli oggetti rifatta (pdf-lib);
   3) ultima strada: le pagine che pdf.js riesce ancora a leggere diventano immagini in un PDF nuovo */
const Repair = {
  async fix(bytes) {
    let b = bytes;
    const head = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 1 << 16)));
    const at = head.indexOf('%PDF-'); if (at > 0) b = b.subarray(at);
    if (at < 0) throw codedError('Nel file non c’è un PDF da recuperare.', 'FORMAT');
    const tail = new TextDecoder('latin1').decode(b.subarray(Math.max(0, b.length - 4096)));
    const eof = tail.lastIndexOf('%%EOF'); if (eof >= 0) b = b.subarray(0, b.length - tail.length + eof + 5);
    try {
      const d = await PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
      if (d.getPageCount() > 0) { const out = await d.save({ useObjectStreams: true }); await (await pdfDocument({ data: out.slice() }).promise).destroy(); return { bytes: out, how: 'struttura' }; }
    } catch (e) { console.warn('riparazione con pdf-lib non riuscita', e); }
    const src = await pdfDocument({ data: b.slice(), stopAtErrors: false }).promise;
    try {
      const out = await PDFDocument.create(); let ok = 0;
      for (let p = 1; p <= src.numPages; p++) {
        Busy.set((p - 1) / src.numPages, `Recupero della pagina ${p} di ${src.numPages}`);
        try {
          const page = await src.getPage(p), vp0 = page.getViewport({ scale: 1 });
          const c = await renderPageCanvas(src, p, 150), jpg = await canvasToBytes(c, 'image/jpeg', 0.88); c.width = c.height = 0;
          const img = await out.embedJpg(jpg); out.addPage([vp0.width, vp0.height]).drawImage(img, { x: 0, y: 0, width: vp0.width, height: vp0.height }); ok++;
        } catch (e) { console.warn('pagina non recuperata', p, e); }
      }
      if (!ok) throw codedError('Nessuna pagina recuperabile.', 'INVALID');
      return { bytes: await out.save(), how: 'immagini', pages: ok, of: src.numPages };
    } finally { src.destroy(); }
  },
  async run(file, tool) {
    const r = await withBusy('Riparazione del PDF…', async () => this.fix(new Uint8Array(await file.arrayBuffer())), { noErrorUi: true });
    if (!r) return;
    const name = stripExt(file.name) + ' - riparato.pdf';
    toast(r.how === 'struttura' ? 'PDF riparato: la struttura del file è stata ricostruita' : `PDF recuperato come immagini: ${r.pages} pagine su ${r.of} (il testo non si può più selezionare)`);
    handoff(tool && TOOLS[tool] ? tool : 'comprimi', new File([r.bytes], name, { type: 'application/pdf' }));
  },
};

/* ---------- tempo rimanente ----------
   dalla velocità con cui avanza la barra (ultimi secondi, smussata); se un lavoro non dice a che punto è,
   dalla durata delle volte precedenti con lo stesso strumento (a parità di peso del file) */
const Durations = {
  K: 'officina.durate',
  _all() { try { return JSON.parse(localStorage.getItem(this.K)) || {}; } catch { return {}; } },
  add(key, ms, bytes) { if (!key || !(ms > 800)) return; const a = this._all(); const l = (a[key] ||= []); l.push([Math.round(ms), Math.round((bytes || 0) / 1024)]); if (l.length > 10) l.shift(); try { localStorage.setItem(this.K, JSON.stringify(a)); } catch { } },
  // durata attesa (ms) per un file di questo peso: mediana delle volte precedenti, in proporzione al peso
  expect(key, bytes) {
    const l = this._all()[key]; if (!l || l.length < 2) return null;
    const mb = (bytes || 0) / 1048576, est = l.map(([ms, kb]) => ms * (0.6 + mb) / (0.6 + kb / 1024)).sort((a, b) => a - b);
    return est[est.length >> 1];
  },
};
const fmtDur = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtLeft = ms => { const s = Math.round(ms / 1000); if (s <= 3) return 'pochi secondi'; if (s < 60) return `circa ${s < 15 ? s : Math.round(s / 5) * 5} s`; const m = Math.round(s / 60); return m < 60 ? `circa ${m} min` : `circa ${Math.floor(m / 60)} h ${m % 60} min`; };
const Eta = {
  // nuova misura dell'avanzamento: aggiorna la stima del tempo che manca
  sample(J, f) {
    const t = performance.now(); J.t0p ||= t;
    if (f == null || !isFinite(f)) return;
    const S = (J.samp ||= []);
    if (S.length && f < S[S.length - 1][1] - 0.05) S.length = 0;   // la barra è ripartita (fase nuova)
    S.push([t, f]); while (S.length > 2 && t - S[0][0] > 15000) S.shift();
    if (f < 0.03 || t - J.t0p < 1500 || S.length < 2) return;
    const [t0, f0] = S[0], wr = (f - f0) / (t - t0), ar = f / (t - J.t0p), rate = wr > 0 ? 0.6 * wr + 0.4 * ar : ar;
    if (!(rate > 0)) return;
    const rem = (1 - f) / rate, now = J.eta == null ? null : Math.max(0, J.eta - (t - J.etaAt));
    J.eta = now == null ? rem : now * 0.65 + rem * 0.35; J.etaAt = t;
  },
  // tempo che manca adesso (ms), oppure null se non si sa
  left(J) { if (J.eta == null) return null; return Math.max(0, J.eta - (performance.now() - J.etaAt)); },
  // avanzamento stimato per i lavori che non lo dicono (dalla durata delle volte precedenti)
  guess(J) {
    if (!J.expect) return null;
    const t = Date.now() - J.t0, e = J.expect;
    return t < e ? 0.9 * t / e : 0.9 + 0.08 * (1 - Math.exp(-(t - e) / e));
  },
  // «trascorsi 0:12 · circa 20 s rimanenti»
  line(J) {
    if (!J || !J.t0) return '';
    const el = Date.now() - J.t0, left = this.left(J), g = J.f == null && J.expect ? Math.max(0, J.expect - el) : null;
    return [el > 1500 ? `${fmtDur(el)} trascorsi` : null, left != null ? `${fmtLeft(left)} rimanenti` : g != null ? (g > 0 ? `${fmtLeft(g)} rimanenti (stima)` : 'quasi finito') : null].filter(Boolean).join(' · ');
  },
};
/* ---------- titolo della scheda e notifiche: il lavoro si vede anche da un'altra scheda ---------- */
const TabStatus = {
  // il titolo della scheda (percentuale, «✓ Pronto») lo gestisce BgWork; qui le notifiche di sistema
  tick() { },
  can: () => typeof Notification !== 'undefined' && !IS_ARTIFACT && (location.protocol === 'https:' || location.hostname === 'localhost' || location.protocol === 'file:'),
  notify(title, body) {
    if (!this.can() || Notification.permission !== 'granted' || !document.hidden) return;
    try { const n = new Notification(title, { body, icon: document.querySelector('link[rel=icon]')?.href, tag: 'officina-job' }); n.onclick = () => { window.focus(); n.close(); }; } catch { }
  },
  async ask() { try { const p = await Notification.requestPermission(); Jobs.render(); if (p === 'granted') toast('Ti avviso con una notifica quando un lavoro è pronto'); } catch { } },
};
setInterval(() => { try { TabStatus.tick(); if (Jobs.running) Jobs.render(); if (Busy.el) Busy.tickEta(); } catch { } }, 1000);
document.addEventListener('visibilitychange', () => { try { TabStatus.tick(); } catch { } });
const Jobs = {
  list: [], running: null, light: 0, seq: 0, perGen: new Map(), deferred: new Map(), tray: null,
  active() { return this.list.filter(j => j.state === 'queued' || j.state === 'running'); },
  activeFor(gen) { return (this.perGen.get(gen) || 0) > 0; },
  // le pulizie di uno strumento lasciato mentre un suo lavoro è in corso aspettano la fine del lavoro
  defer(gen, fns) { this.deferred.set(gen, [...(this.deferred.get(gen) || []), ...fns]); },
  _gen(gen, d) {
    const n = (this.perGen.get(gen) || 0) + d;
    if (n > 0) { this.perGen.set(gen, n); return; }
    this.perGen.delete(gen);
    const fns = this.deferred.get(gen); this.deferred.delete(gen);
    if (fns) { if (gen === GEN) cleanups.push(...fns); else fns.forEach(f => { try { f(); } catch (e) { console.warn(e); } }); }
  },
  async run(title, fn, opts = {}) {
    // un lavoro leggero (unire, ruotare, salvare…) chiesto mentre uno pesante è in secondo piano: parte subito, non in coda
    if (!opts.cancellable && this.running && this.running.bg) {
      this.light++;
      Busy.show(title);
      try { return await fn(); }
      catch (e) { Errors.show(e, { retry: () => this.run(title, fn, opts) }); return null; }
      finally { this.light--; if (!Busy.job) Busy._dom(); }
    }
    const J = { id: ++this.seq, title, msg: '', f: null, opts, gen: GEN, tool: typeof CURRENT_TOOL !== 'undefined' ? CURRENT_TOOL : null, subject: opts.subject || (typeof CURRENT_SUBJECT !== 'undefined' ? CURRENT_SUBJECT : ''),
      state: 'queued', cancelled: false, bg: false, result: null, error: null, t0: 0,
      inBytes: opts.bytes ?? (typeof CURRENT_INPUT !== 'undefined' ? CURRENT_INPUT.reduce((a, f) => a + (f?.size || 0), 0) : 0) };
    J.durKey = (J.tool || '') + '|' + title.replace(/…$/, '');
    // annullare deve funzionare anche se un motore (OCR) fermato non risponde più: le attese lunghe corrono contro questa
    J.cancelP = new Promise((_, rej) => { J.rejectCancel = rej; }); J.cancelP.catch(() => {});
    this.list.push(J); this._gen(J.gen, +1);
    BgWork.start();
    if (this.running || this.list.some(x => x !== J && x.state === 'queued')) {
      // un altro lavoro è in corso: questo aspetta il suo turno nel pannello, intanto si lavora
      J.bg = true;
      J.turn = new Promise(r => { J.go = r; });
      toast(`In coda: «${title.replace(/…$/, '')}» parte appena finisce il lavoro in corso`);
      this.render();
      await J.turn;
      if (J.cancelled) { this._end(J, 'cancelled'); return null; }
    }
    this.running = J; J.state = 'running'; J.t0 = Date.now(); J.expect = Durations.expect(J.durKey, J.inBytes);
    if (typeof Activity !== 'undefined') Activity.begin(J);
    if (!J.bg) Busy._open(J); else this.render();
    try { return await fn(); }
    catch (e) {
      if (e?.cancel || J.cancelled) { J.cancelled = true; toast('Operazione annullata'); }
      else { J.errInfo = Errors.show(e, { retry: () => this.run(title, fn, opts), job: J, noLog: true }); J.error = J.errInfo.text; }
      return null;
    } finally {
      if (Busy.job === J) Busy._close();
      this._end(J, J.cancelled ? 'cancelled' : J.error ? 'error' : J.result ? 'ready' : 'done');
    }
  },
  _end(J, state) {
    J.state = state; J.t1 = Date.now();
    if ((state === 'ready' || state === 'done') && J.t0) Durations.add(J.durKey, J.t1 - J.t0, J.inBytes);
    if (typeof Activity !== 'undefined') Activity.finish(J, state);
    if (J.bg && state === 'error') TabStatus.notify('file360: errore', `${J.subject || J.title.replace(/…$/, '')}: ${J.error}`);
    if (this.running === J) this.running = null;
    this._gen(J.gen, -1);
    if (state === 'done' || state === 'cancelled') this.list = this.list.filter(x => x !== J);
    // il prossimo in coda
    const next = this.list.find(x => x.state === 'queued' && !x.cancelled);
    this.list.filter(x => x.state === 'queued' && x.cancelled).forEach(x => x.go?.());
    if (next) next.go(); else if (!this.running) BgWork.stop();
    if (state === 'ready' && J.bg) this._ready(J);
    this.render();
  },
  // risultato di un lavoro finito in secondo piano: si apre subito se si è ancora lì, altrimenti dal pannello
  _ready(J) {
    TabStatus.notify('file360: pronto', `${J.subject || J.title.replace(/…$/, '')} · ${fmtDur(J.t1 - J.t0)}`);
    if (J.gen === GEN && !OPEN_MODALS.size && !Busy.el && !document.hidden) return this.open(J, true);
    toastActions(`Pronto: ${J.subject ? (TOOLS[J.tool]?.short || J.title.replace(/…$/, '')) + ' · ' + J.subject : J.title.replace(/…$/, '')}`, [['Apri', () => this.open(J)]], 9000);
  },
  // nello stesso strumento il risultato segue le regole di sempre (documento attivo); altrove si mostra e basta
  open(J, here = false) { const r = J.result; this.list = this.list.filter(x => x !== J); this.render(); if (r) showResultNow(r.outputs, { ...r.opts, _fromJob: !here || J.gen !== GEN }); },
  cancel(J) {
    J.cancelled = true;
    try { J.rejectCancel?.(new CancelError()); } catch { }
    if (J.state === 'running') { J.msg = 'Annullamento…'; try { J.opts.onCancel?.(); } catch { } }
    else if (J.state === 'queued') J.go?.();
    this.render();
  },
  toBackground(J = this.running) {
    if (!J || J.bg || !(J.opts.cancellable || J.opts.job)) return false;
    J.bg = true; Busy._close(); this.peek();
    return true;
  },
  // cambio di pagina: un lavoro visibile continua nel pannello; le attese brevi si chiudono
  onNavigate() { if (this.running && !this.running.bg && this.toBackground()) return; Busy.hide(); },
  render() { if (!this._rq) this._rq = setTimeout(() => { this._rq = null; this._render(); }, 60); },
  // nella barra in alto: «Lavori» con l'avanzamento; il pannello si apre sotto (non copre mai i pulsanti degli strumenti)
  _render() {
    const items = this.list.filter(j => j.bg || j.state !== 'running');
    const top = document.querySelector('.topbar');
    if (!items.length) { this.pill?.remove(); this.pill = null; this.tray?.remove(); this.tray = null; this.open_ = false; return; }
    const act = items.filter(j => j.state === 'running' || j.state === 'queued'), ready = items.filter(j => j.state === 'ready');
    const run = items.find(j => j.state === 'running');
    if (!this.pill) {
      this.pill = h('button', { class: 'jobs-pill', 'aria-haspopup': 'true', onclick: () => this.toggle() });
      const anchor = top && top.querySelector('.privacy');
      if (anchor) anchor.before(this.pill); else document.body.append(this.pill);
    }
    const rf = run ? run.f ?? Eta.guess(run) : null, pct = rf != null ? Math.round(clamp(rf, 0, 1) * 100) : null, left = run ? Eta.left(run) : null;
    this.pill.className = 'jobs-pill' + (ready.length ? ' has-ready' : '') + (act.length ? ' busy' : '');
    this.pill.replaceChildren(act.length ? h('span', { class: 'jp-spin' }) : ic('check', 15, 2.6),
      h('span', {}, act.length ? `${act.length === 1 ? 'Lavoro' : act.length + ' lavori'}${pct != null ? ' · ' + pct + '%' : ''}${left != null && left > 3000 ? ' · ' + fmtDur(left) : ''}` : 'Lavori'),
      ...(ready.length ? [h('span', { class: 'jp-n' }, String(ready.length))] : []));
    this.pill.title = act.length ? 'Lavori in corso: clicca per vederli' : `${plural(ready.length, 'risultato pronto', 'risultati pronti')}: clicca per aprirli`;
    if (!this.tray) { this.tray = h('div', { class: 'jobs', role: 'dialog', 'aria-label': 'Lavori', hidden: true }); document.body.append(this.tray); }
    const queued = items.filter(j => j.state === 'queued');
    const rows = items.map(j => {
      const tool = j.tool && TOOLS[j.tool];
      const qn = queued.indexOf(j) + 1;
      const st = { running: j.msg || 'In corso…', queued: qn > 1 ? `In coda (${qn}° dopo quello in corso)` : 'In coda: parte appena finisce quello in corso', ready: `Pronto${j.t1 && j.t0 ? ' · in ' + fmtDur(j.t1 - j.t0) : ''}`, error: j.error || 'Errore', cancelled: 'Annullato', done: 'Fatto' }[j.state];
      const jf = j.state === 'running' ? j.f ?? Eta.guess(j) : null;
      return h('div', { class: 'job s-' + j.state, style: tool ? { '--hue': tool.hue } : null },
        h('div', { class: 'job-ic' }, ic(tool ? tool.icon : 'file', 18)),
        h('div', { class: 'job-t' }, h('b', { title: j.title }, j.subject || j.title.replace(/…$/, '')), h('span', { class: 'muted small', title: st }, (tool ? tool.short + ' · ' : '') + (j.subject && j.state === 'running' && !j.msg ? j.title.replace(/…$/, '') : st)),
          j.state === 'running' ? h('div', { class: 'job-bar' + (jf == null ? ' indet' : '') }, h('i', { style: { width: (jf == null ? 30 : Math.max(2, Math.round(clamp(jf, 0, 1) * 100))) + '%' } })) : null,
          j.state === 'running' ? h('span', { class: 'job-eta small muted' }, [jf != null ? Math.round(clamp(jf, 0, 1) * 100) + '%' + (j.f == null ? ' (stima)' : '') : null, Eta.line(j)].filter(Boolean).join(' · ')) : null,
          j.state === 'error' && j.errInfo ? h('div', { class: 'job-err' }, j.errInfo.actions.map(([l, f]) => h('button', { class: 'linkish', onclick: () => { this.toggle(false); f(); } }, l)),
            h('details', {}, h('summary', {}, 'Dettaglio tecnico'), h('pre', {}, j.errInfo.tech))) : null),
        j.state === 'ready' ? h('button', { class: 'btn sm primary', onclick: () => this.open(j) }, 'Apri') : null,
        (j.state === 'running' && j.opts.cancellable) || j.state === 'queued' ? h('button', { class: 'btn sm ghost', title: 'Annulla', onclick: () => this.cancel(j) }, ic('x', 15))
          : j.state !== 'running' ? h('button', { class: 'btn sm ghost', title: 'Togli dall’elenco', onclick: () => { this.list = this.list.filter(x => x !== j); this.render(); } }, ic('x', 15)) : null);
    });
    const keepOpen = this.tray.querySelector('details[open]');   // un dettaglio aperto non si richiude a ogni aggiornamento
    if (keepOpen && run) return;
    const notif = TabStatus.can() && Notification.permission === 'default' ? h('button', { class: 'linkish small jobs-notif', onclick: () => TabStatus.ask() }, ic('bell', 13), 'Avvisami con una notifica quando è pronto') : null;
    this.tray.replaceChildren(h('div', { class: 'jobs-h' }, h('b', {}, 'Lavori'), h('span', { class: 'muted small' }, 'continuano anche mentre usi altri strumenti: puoi aprire un altro file o un altro strumento'), notif),
      h('div', { class: 'jobs-list' }, rows),
      typeof Activity !== 'undefined' ? h('button', { class: 'jobs-all linkish small', onclick: () => { this.toggle(false); nav('attivita'); } }, 'Tutte le attività', ic('arrow', 13)) : null);
    this.tray.hidden = !this.open_;
  },
  toggle(v = !this.open_) {
    this.open_ = v; if (this.tray) this.tray.hidden = !v;
    clearTimeout(this._auto);
    if (v && !this._outside) { this._outside = e => { if (this.tray && !this.tray.contains(e.target) && !this.pill?.contains(e.target)) this.toggle(false); }; setTimeout(() => document.addEventListener('pointerdown', this._outside), 0); }
    if (!v && this._outside) { document.removeEventListener('pointerdown', this._outside); this._outside = null; }
  },
  // mostrato per qualche secondo quando un lavoro passa in secondo piano, così si vede dove è finito
  peek() { this._render(); this.toggle(true); this._auto = setTimeout(() => this.toggle(false), 3500); },
};
const Busy = {
  el: null, job: null, quick: false, onCancel: null, _cancelled: false,
  // annullamento: quello del lavoro in corso (anche in secondo piano), altrimenti dell'attesa visibile
  get cancelled() { return Jobs.running ? Jobs.running.cancelled : this._cancelled; },
  set cancelled(v) { if (Jobs.running) Jobs.running.cancelled = v; else this._cancelled = v; },
  get gen() { return this.job ? this.job.gen : this._gen; },
  set gen(v) { this._gen = v; },
  // attesa breve (aprire un file…): finestra semplice; se un lavoro è in secondo piano non ne prende il posto
  show(title, { cancellable = false, onCancel = null } = {}) {
    if (this.job) return this._retitle(title);
    this.hide();
    this._gen = GEN; this._cancelled = false; this.onCancel = onCancel;
    this._build(title, cancellable ? () => { this._cancelled = true; this.set(null, 'Annullamento…'); this.onCancel?.(); } : null, null);
    this.quick = !!(Jobs.running && Jobs.running.bg);
    // attesa breve: la barra non resta ferma e vuota (dopo un attimo si vede che si sta lavorando)
    setTimeout(() => { if (this.el && this._f == null) this.barEl?.parentNode?.classList.add('indet'); }, 700);
  },
  _retitle(t) { if (this.titleEl) this.titleEl.textContent = t; },
  _build(title, onCancel, onBg) {
    this._f = this._m = null; this._t = 0;
    this.barEl = h('i');
    this.msgEl = h('div', { class: 'busy-msg' }, ' ');
    this.etaEl = h('div', { class: 'busy-eta', 'aria-live': 'off' });
    this.titleEl = h('h3', {}, title);
    this.bgBtn = onBg ? h('button', { class: 'btn sm busy-bg', title: 'Puoi usare gli altri strumenti: il lavoro continua e ti avviso quando è pronto', onclick: onBg }, ic('layers', 15), 'Continua in secondo piano') : null;
    this._t0 = Date.now();
    const acts = [this.bgBtn,
      onCancel ? h('button', { class: 'btn ghost sm', onclick: onCancel }, 'Annulla') : null].filter(Boolean);
    // l'animazione dello strumento al lavoro (o, se non c'è, il logo che gira)
    const ldId = (this.job && this.job.tool) || (typeof CURRENT_TOOL !== 'undefined' && CURRENT_TOOL) || (typeof routeId === 'function' ? routeId() : '');
    let anim = null; try { anim = typeof Loader !== 'undefined' && ldId ? Loader.el(ldId) : null; } catch (e) { console.warn('animazione', e); }
    this.pctEl = h('span', { class: 'busy-pct' });
    this.barBox = h('div', { class: 'bar', role: 'progressbar', 'aria-label': title, 'aria-valuemin': '0', 'aria-valuemax': '100' }, this.barEl);
    const card = h('div', { class: 'modal busy-card' + (anim ? ' with-ld' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, anim || (typeof Brand !== 'undefined' ? h('div', { class: 'spinner-brand', html: Brand.spinnerSvg(58) }) : h('div', { class: 'spinner' })), this.titleEl, this.msgEl,
      this.barBox, h('div', { class: 'busy-row' }, this.pctEl, this.etaEl), acts.length ? h('div', { class: 'busy-acts' }, acts) : null,
      onBg ? h('div', { class: 'busy-hint muted small', hidden: true }, 'Intanto puoi usare altri strumenti o aprire un altro file: il lavoro continua e ti avviso quando è pronto.') : null);
    this.el = h('div', { class: 'scrim busy' }, card);
    document.body.append(this.el);
    document.body.classList.add('is-busy');
  },
  // finestra di un lavoro (con «Annulla» e «Continua in secondo piano»)
  _open(J) {
    this.hide();
    this.job = J;
    const canBg = !(typeof Flow !== 'undefined' && Flow.isCapturing && Flow.isCapturing());
    this._build(J.title, J.opts.cancellable ? () => { Jobs.cancel(J); this.set(null, 'Annullamento…'); } : null, canBg ? () => { Jobs.toBackground(J); } : null);
  },
  _close() { const j = this.job; this.job = null; this._dom(); if (j) j.modalClosed = true; },
  _dom() { if (this._q) { clearTimeout(this._q); this._q = null; } this.el?.remove(); this.el = null; this.quick = false; document.body.classList.remove('is-busy'); },
  // gli aggiornamenti arrivano anche decine di volte al secondo: si mostrano al massimo ~8 volte al secondo
  // ogni secondo: tempo trascorso e rimanente; dopo qualche secondo si propone di continuare in secondo piano
  tickEta() {
    if (!this.el || this.quick) return;
    const J = this.job || (Jobs.running && !Jobs.running.bg ? Jobs.running : null);
    const el = Date.now() - (this._t0 || Date.now());
    let line = J ? Eta.line(J) : el > 2500 ? `${fmtDur(el)} trascorsi` : '';
    if (J && J.f == null) { const g = Eta.guess(J); if (g != null) { this.barEl.style.width = (g * 100).toFixed(1) + '%'; this.barEl.parentNode.classList.add('guess'); } else this.barEl.parentNode.classList.add('indet'); }
    else this.barEl?.parentNode?.classList.remove('indet', 'guess');
    if (this.etaEl && this.etaEl.textContent !== line) this.etaEl.textContent = line;
    if (this.bgBtn && el > 3000 && !this.bgBtn.classList.contains('primary')) { this.bgBtn.classList.add('primary', 'pulse'); const hint = this.el.querySelector('.busy-hint'); if (hint) hint.hidden = false; }
  },
  set(frac, msg) {
    const J = Jobs.running;
    if (J) { if (frac != null) { J.f = frac; Eta.sample(J, frac); } if (msg != null) J.msg = msg; if (frac != null) BgWork.progress(frac); if (J.bg) { Jobs.render(); if (!this.el || this.quick) return; } }
    if (!this.el || this.quick) return;
    if (frac != null) this._f = frac;
    if (msg != null) this._m = msg;
    const now = performance.now();
    if (now - (this._t || 0) >= 120) { this._t = now; this.flush(); return; }
    if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = performance.now(); this.flush(); }, 130);
  },
  flush() {
    if (!this.el || this.quick) return;
    if (this._f != null) this.barEl.parentNode.classList.remove('indet', 'guess');
    if (this._f != null) { const w = (clamp(this._f, 0, 1) * 100).toFixed(1) + '%'; if (this.barEl.style.width !== w) this.barEl.style.width = w; const pc = Math.round(clamp(this._f, 0, 1) * 100); if (this.pctEl && this.pctEl.textContent !== pc + '%') { this.pctEl.textContent = pc + '%'; this.barBox?.setAttribute('aria-valuenow', String(pc)); } if (!Jobs.running) BgWork.progress(this._f); }
    if (this._m != null && this.msgEl.textContent !== this._m) this.msgEl.textContent = this._m;
  },
  title(t) { if (Jobs.running) { Jobs.running.title = t; Jobs.render(); } this._retitle(t); },
  // chiude l'attesa visibile (quella breve, o la finestra di un lavoro, che allora continua in silenzio)
  hide() { if (this.job) { this.job.bg = true; this.job = null; Jobs.render(); } this._dom(); this._gen = null; if (!Jobs.running) BgWork.stop(); },
  check() { if (this.cancelled) throw new CancelError(); },
  // attesa che si interrompe subito se il lavoro viene annullato
  until(p) { const J = Jobs.running; return J && J.cancelP ? Promise.race([p, J.cancelP]) : p; },
};
async function withBusy(title, fn, opts = {}) {
  opts = opts || {};
  // ogni operazione parte con tutto il codice pronto: i moduli eseguiti nei momenti liberi (Later) non devono mancare a metà lavoro
  try { Later.all(); } catch (e) { console.warn('moduli', e); }
  if (opts.cancellable || opts.job) return Jobs.run(title, fn, opts);
  // attesa breve: niente coda
  if (typeof Activity !== 'undefined' && !Busy.el) Activity.mark();
  const outer = !Busy.el;
  Busy.show(title, opts);
  if (outer && !Jobs.running) BgWork.start();
  withBusy.last = null;
  try { return await fn(); }
  // l'errore resta disponibile: chi riceve null può rilanciarlo (così il riquadro dice il motivo vero, non «impossibile aprire»)
  catch (e) { withBusy.last = e; Errors.show(e, { retry: opts.retry || null }); return null; }
  finally { if (!Busy.job) { Busy._dom(); if (!Jobs.running) BgWork.stop(); } }
}

/* ---------- più pagine (o file) insieme ----------
   quante elaborazioni pesanti in parallelo: una per processore, entro la memoria del dispositivo */
function parallelSlots(n = Infinity) {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory;
  const memCap = !mem ? 4 : mem >= 8 ? 6 : mem >= 4 ? 4 : 1;
  const k = IS_TOUCH ? (mem >= 6 ? 2 : 1) : Math.min(cores, memCap);
  return Math.max(1, Math.min(n, k));
}
// esegue fn su ogni voce, k alla volta; i risultati restano nell'ordine originale
async function inParallel(items, k, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(k, items.length)) }, async (_, slot) => {
    for (;;) { Busy.check(); const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i, slot); }
  }));
  return out;
}
// avvia in anticipo (k alla volta, nell'ordine) i calcoli delle voci; get(i) restituisce il risultato quando serve
function prefetcher(items, k, fn) {
  const started = new Map(); let next = 0, running = 0;
  const pump = () => { while (running < k && next < items.length) { const i = next++; running++; const pr = Promise.resolve().then(() => fn(items[i], i)); pr.catch(() => {}).finally(() => { running--; pump(); }); started.set(items[i], pr); } };
  pump();
  return { get: it => started.get(it) || null };
}

/* ---------- modal ---------- */
const OPEN_MODALS = new Set();
const closeAllModals = () => [...OPEN_MODALS].forEach(c => c());
let MODAL_SEQ = 0;
function modal(content, { onClose, width, cls = '', label = '' } = {}) {
  document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
  const back = document.activeElement;
  const box = h('div', { class: 'modal' + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true', tabindex: '-1', style: width ? { width: `min(${width}px, calc(100vw - 32px))` } : null }, content);
  // il titolo della finestra (il primo h3) la presenta a chi usa un lettore di schermo
  const title = box.querySelector('h3');
  if (title) { if (!title.id) title.id = 'dlg-t' + (++MODAL_SEQ); box.setAttribute('aria-labelledby', title.id); } else if (label) box.setAttribute('aria-label', label);
  const scrim = h('div', { class: 'scrim', onmousedown: e => { if (e.target === scrim) close(); } }, box);
  const isTop = () => [...document.querySelectorAll('.scrim:not(.busy)')].pop() === scrim;
  const focusables = () => [...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  // Esc chiude solo la finestra in primo piano (l'anteprima sopra la finestra del risultato); Tab resta dentro
  const key = e => {
    if (!isTop()) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); if (!f.length) { e.preventDefault(); box.focus(); return; }
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (!box.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && (cur === first || cur === box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  };
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    OPEN_MODALS.delete(close); scrim.remove(); document.removeEventListener('keydown', key); behind.forEach(x => { x.inert = false; x.removeAttribute('aria-hidden'); }); onClose?.();
    // il fuoco torna dov'era (se quel punto esiste ancora e nessun'altra finestra l'ha preso)
    const free = () => !document.activeElement || document.activeElement === document.body;
    if (back && back.isConnected && typeof back.focus === 'function' && free()) { try { back.focus({ preventScroll: true }); } catch { } }
    // lo strumento si riapre dopo la chiusura (nuova versione): si aspetta che ci sia e si torna sul suo pulsante principale
    // (per un secondo e mezzo: lo strumento può ridisegnarsi più volte mentre carica la versione nuova)
    { let n = 0; const tick = () => { if (OPEN_MODALS.size || ++n > 15) return; const ae = document.activeElement; if (!ae || ae === document.body || !ae.isConnected) { const t = [...document.querySelectorAll('.tool .btn-run')].filter(x => x.offsetParent).pop() || document.querySelector('#main h1'); if (t) { if (t.tagName === 'H1') t.tabIndex = -1; try { t.focus({ preventScroll: true }); } catch { } } } setTimeout(tick, 100); }; setTimeout(tick, 60); }
  }
  OPEN_MODALS.add(close);
  document.addEventListener('keydown', key);
  const behind = [...document.querySelectorAll('.scrim.busy')]; behind.forEach(x => { x.inert = true; x.setAttribute('aria-hidden', 'true'); });
  document.body.append(scrim);
  // il fuoco entra nella finestra: sul campo o sul pulsante principale, altrimenti sulla finestra stessa
  requestAnimationFrame(() => { if (closed || box.contains(document.activeElement)) return; const t = box.querySelector('[data-autofocus]') || box.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]),textarea:not([readonly])') || box.querySelector('.btn.primary:not([disabled])') || box; try { t.focus({ preventScroll: true }); } catch { } });
  return { close, box };
}

/* ---------- download & results ---------- */
let _dl = null;
async function download(data, name, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  if (IS_ARTIFACT) {
    try {
      if (!_dl) _dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (!_dl) return toast('Il salvataggio dei file non è disponibile in questa visualizzazione', 'error');
      await _dl.save({ filename: name, data: blob });
      toast('File salvato');
    } catch (e) {
      const c = e && e.code;
      if (c === 'declined') return;
      if (c === 'rate_limited') return toast('C’è già una richiesta di salvataggio aperta', 'error');
      toast('Salvataggio non riuscito' + (e && e.message ? ': ' + e.message : ''), 'error');
    }
    return;
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
/* native share sheet (phones): WhatsApp, Mail, PEC apps… */
function canShareFiles() {
  if (IS_ARTIFACT || !navigator.canShare) return false;
  try { return navigator.canShare({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] }); } catch { return false; }
}
async function shareFile(data, name, type = 'application/pdf') {
  try { await navigator.share({ files: [new File([data], name, { type })], title: name }); }
  catch (e) { if (e && e.name !== 'AbortError') toast('Condivisione non riuscita', 'error'); }
}
async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('Testo copiato negli appunti'); }
  catch { if (fallbackEl) { fallbackEl.focus(); fallbackEl.select?.(); } toast('Seleziona il testo e copialo dal menu', 'error'); }
}
async function zipOutputs(outputs) {
  const zip = new JSZip();
  const used = new Set();
  for (const o of outputs) {
    let n = o.name, k = 2;
    while (used.has(n)) n = stripExt(o.name) + ` (${k++})` + (o.name.match(/\.[^.]+$/)?.[0] || '');
    used.add(n); zip.file(n, o.bytes);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}
let CURRENT_TOOL = null, CURRENT_SUBJECT = '', CURRENT_INPUT = [];   // CURRENT_INPUT: i file su cui lavora lo strumento (registro, errori, stime)
let _ignoreLet = 0;   // strumento aperto e file su cui lavora (per il pannello «Lavori»)
function showResult(outputs, opts = {}) {
  if (!opts._fromJob && typeof Activity !== 'undefined') try { Activity.result(outputs, opts); } catch (e) { console.warn(e); }
  // lavoro finito in secondo piano: il risultato aspetta nel pannello «Lavori» (salvo l'applicazione automatica del documento attivo)
  const J = Jobs.running;
  if (J && J.bg && !Jobs.light && !opts._fromJob && !(J.gen === GEN && typeof Flow !== 'undefined' && Flow.isCapturing && Flow.isCapturing())) { J.result = { outputs, opts }; return; }
  return showResultNow(outputs, opts);
}
function showResultNow(outputs, { note, title, zipName, extra, primary = null, version = null, noNext = false, reloadAfter = false, _fromJob = false } = {}) {
  // documento attivo: un PDF prodotto diventa la nuova versione; durante il cambio di strumento niente finestra
  const fr = typeof Flow !== 'undefined' && !_fromJob ? Flow.onResult(outputs, { primary: version ?? primary }) : { captured: false, pushed: false };
  if (fr.captured) return;
  // nel progetto: i risultati (il PDF che è diventato una nuova versione del documento c'è già, tra le versioni)
  if (typeof Projects !== 'undefined') try { const vb = fr.pushed && Flow.exportSession()?.versions; const curLen = vb ? vb[vb.length - 1].bytes.length : -1; Projects.addResults(outputs.filter(o => !(fr.pushed && /\.pdf$/i.test(o.name) && o.bytes?.length === curLen)), CURRENT_TOOL); } catch (e) { console.warn(e); }
  // prima/dopo: il PDF prodotto confrontato con quello di partenza (strumenti che cambiano l'aspetto delle pagine)
  const COMPARE = new Set(['comprimi', 'pdfa', 'oscura', 'numeri', 'ocr', 'modifica', 'moduli', 'ruota']);
  if (fr.pushed && COMPARE.has(CURRENT_TOOL) && outputs.length === 1 && !outputs[0].from && typeof Flow.prevBytes === 'function') { const pb = Flow.prevBytes(); if (pb) outputs[0].from = pb; }
  const cmpBtn = (o, big) => o.from && /\.pdf$/i.test(o.name) && typeof compareModal === 'function'
    ? h('button', { class: big ? 'btn big res-cmp' : 'btn sm res-cmp', title: 'Confronta con l’originale', 'aria-label': 'Confronta con l’originale', onclick: () => compareModal(o.from, o.bytes) }, ic('swap', big ? 18 : 16), big ? 'Confronta' : null) : null;
  // ritocco del documento aperto: niente finestra, solo un avviso con «Scarica» e «Annulla»
  // ritocco del documento aperto: si vede sempre il risultato (anteprima e download); chiusa la finestra si continua sulla nuova versione
  const reload = fr.quick || (reloadAfter && fr.pushed) ? Flow.reloader(reloadAfter) : null;
  if (fr.unchanged && !title) title = 'Il file era già a posto';
  const multi = outputs.length > 1 && primary == null;
  // nomi: quelli di sempre, oppure letti dal contenuto; ognuno si può correggere con un clic
  const nameEls = [];
  const refreshNames = () => nameEls.forEach(([o, el, sub]) => { el.textContent = o.name; el.title = o.name + ' — clicca per rinominare'; if (sub) sub.textContent = o.name !== o._orig ? `era «${o._orig}»` : ''; });
  const namesBar = resultNames(outputs, refreshNames);
  const list = h('div', { class: 'res-list' }, outputs.map(o => h('div', { class: 'res-row' },
    h('span', { class: 'muted' }, ic(/\.txt$/.test(o.name) ? 'type' : /\.docx$/.test(o.name) ? 'textedit' : 'file', 22)),
    h('div', { class: 'rn' }, (() => { const b = h('b', { title: o.name }, o.name), was = h('span', { class: 'rn-was muted small' }); nameEls.push([o, b, was]); editableName(o, b, refreshNames); return h('div', { class: 'rn-name' }, b, was); })(), h('span', { class: 'muted small' }, fmtSize(o.bytes.length) + (o.info ? ' · ' + o.info : ''))),
    canShareFiles() ? h('button', { class: 'btn sm', title: 'Condividi', 'aria-label': 'Condividi', onclick: () => shareFile(o.bytes, o.name, o.type || 'application/pdf') }, ic('share', 16)) : null,
    multi ? cmpBtn(o, false) : null,
    typeof Preview !== 'undefined' && Preview.can(o) ? h('button', { class: 'btn sm res-pv', title: 'Anteprima', 'aria-label': 'Anteprima di ' + o.name, onclick: () => Preview.open(o) }, ic('eye', 16), h('span', { class: 'res-pv-l' }, 'Anteprima')) : null,
    h('button', { class: 'btn sm res-dl', onclick: () => download(o.bytes, o.name, o.type || 'application/pdf') }, ic('download', 16), 'Scarica'))));
  const pdfOut = outputs.find(o => /\.pdf$/i.test(o.name));
  let navigating = false;
  const next = noNext ? null : fr.pushed ? Flow.nextChips(() => { navigating = true; mref?.close(); }) : (!multi || outputs.filter(o => /\.pdf$/i.test(o.name)).length === 1) && pdfOut ? resNext(pdfOut, () => { navigating = true; m.close(); }) : null;
  const o0 = outputs[primary ?? 0];
  const main = multi
    ? h('button', { class: 'btn primary big', 'data-autofocus': '', onclick: async () => download(await zipOutputs(outputs), zipName || 'file.zip', 'application/zip') }, ic('zip', 18), `Scarica tutto (ZIP, ${outputs.length} file)`)
    : h('button', { class: 'btn primary big res-main', 'data-autofocus': '', onclick: () => download(o0.bytes, o0.name, o0.type || 'application/pdf') }, ic('download', 18), primary != null ? (/\.docx$/i.test(o0.name) ? 'Scarica il documento Word' : /\.pdf$/i.test(o0.name) ? 'Scarica il PDF' : 'Scarica il file') : 'Scarica il file');
  const wordOut = primary != null && !/\.docx$/i.test(o0.name) ? outputs.find(o => /\.docx$/i.test(o.name)) : null;
  const share = !multi && canShareFiles() ? h('button', { class: 'btn big res-share', onclick: () => shareFile(o0.bytes, o0.name, o0.type || 'application/pdf') }, ic('share', 18), 'Condividi') : null;
  // azioni secondarie, tutte sulla stessa riga: guardare, confrontare, altri formati, cloud
  const more = [
    !multi && typeof Preview !== 'undefined' && Preview.can(o0) ? h('button', { class: 'btn res-preview', onclick: () => Preview.open(o0) }, ic('eye', 16), 'Anteprima') : null,
    !multi ? cmpBtn(o0, true) : null,
    wordOut ? h('button', { class: 'btn res-word', onclick: () => download(wordOut.bytes, wordOut.name, wordOut.type) }, ic('textedit', 16), 'Scarica in Word') : null,
    typeof Cloud !== 'undefined' ? h('button', { class: 'btn res-cloud cloud-btn', title: 'Salva sul cloud', onclick: () => Cloud.saveOutputs(multi ? outputs : [o0]) }, ic('cloud', 16), multi ? 'Salva tutti sul cloud' : 'Salva sul cloud') : null,
  ].filter(Boolean);
  more.forEach(bn => bn.classList.remove('big'));
  let mref = null;
  const flowEl = fr.pushed ? Flow.resultNote(true) : null;
  const where = IS_SITE ? 'Elaborato nel browser, senza caricare il file su un server' : IS_TOUCH ? 'Elaborato sul tuo dispositivo, nessun caricamento online' : 'Elaborato sul tuo computer, nessun caricamento online';
  const stat = resStat(outputs, { multi, primary });
  const head = h('div', { class: 'res-head' },
    h('div', { class: 'res-art' }, resThumb(o0, multi ? outputs.length : 0), h('div', { class: 'res-ok', 'aria-hidden': 'true' }, ic('check', 18, 3))),
    h('div', {}, h('h3', {}, title || (multi ? 'I tuoi file sono pronti' : 'Il tuo file è pronto')), stat ? stat.el : null,
      h('div', { class: 'res-sub' }, ic('shield', 13, 2.2), where)));
  const body = h('div', { class: 'res-scroll' },
    head,
    // il risparmio di peso è già il numero in alto: la nota si mostra solo se dice altro
    note && !(stat && stat.saving && /^Peso ridotto/.test(String(note))) ? h('div', { class: 'hint ok res-note' }, note) : null,
    // prima l'azione, poi i dettagli (testo letto, correzioni, elenchi): il pulsante principale resta nel primo sguardo
    h('div', { class: 'res-cta' + (share ? ' two' : '') }, main, share),
    more.length ? h('div', { class: 'res-more' }, more) : null,
    extra || null,
    namesBar,
    outputs.length > 1 || outputs[0].info ? list : (() => { const o = outputs[0], bN = h('b', {}, o.name), was = h('span', { class: 'rn-was muted small' }); nameEls.push([o, bN, was]); editableName(o, bN, refreshNames); return h('div', { class: 'res-single-name' }, ic('file', 16), bN, was); })(),
    next,
    typeof Ads !== 'undefined' ? Ads.slot('result', CURRENT_TOOL) : null);
  const m = mref = modal([body,
    h('div', { class: 'res-foot' }, (() => {
      const st = fr.pushed && Flow.state ? Flow.state() : null;
      if (!st || st.n < 2) return h('span', { class: 'muted' }, fr.pushed ? 'Chiudendo resti sul documento aggiornato.' : 'Puoi chiudere: il file resta nel progetto.');
      return h('span', { class: 'res-ver' }, h('span', { class: 'muted' }, `Documento aggiornato · versione ${st.n}`), h('button', { class: 'btn sm ghost flow-undo', onclick: () => { closeAllModals(); Flow.resumeVersion(st.n - 2); toast(`Tornato alla versione ${st.n - 1}`); } }, ic('undo', 15), `Torna alla v${st.n - 1}`));
    })(),
      h('button', { class: 'btn res-done', onclick: () => m.close() }, 'Continua a lavorare'))],
    { width: 560, cls: 'res', onClose: () => reload && !navigating && reload() });
  if (stat && stat.celebrate) resConfetti(m.box);
  resFly(m.box);
}
/* la miniatura del risultato parte da dove si vedeva il documento (l'anteprima dello strumento) e si posa nella finestra */
function resFly(box) {
  const art = box.querySelector('.res-art'); if (!art || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const src = [...document.querySelectorAll('.tool .v-page, .tool .thumb canvas, .tool .ws canvas, .tool .ws img')].find(e => { const r = e.getBoundingClientRect(); return r.width > 60 && r.height > 60 && r.bottom > 0 && r.top < innerHeight; });
  if (!src) return;
  requestAnimationFrame(() => {
    const a = src.getBoundingClientRect(), b = art.getBoundingClientRect(); if (!b.width) return;
    const sc = Math.min(3, Math.max(a.width / b.width, 0.3)), dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    try { art.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: getComputedStyle(document.documentElement).getPropertyValue('--e-spring').trim() || 'cubic-bezier(.3,1.5,.5,1)' }); } catch { }
  });
}
/* «cosa fare dopo» quando il risultato non è il documento aperto: i passi più probabili, gli altri a richiesta */
function resNext(pdfOut, onGo) {
  const all = Object.entries(TOOLS).filter(([id, t]) => id !== CURRENT_TOOL && t.pdfIn !== false && t.chain !== false).map(([id]) => id);
  const rel = ((typeof SEO !== 'undefined' && SEO.P[CURRENT_TOOL]?.rel) || []).filter(t => all.includes(t));
  const first = [...new Set([...rel, ...['comprimi', 'unisci', 'modifica', 'pdfa', 'oscura', 'proteggi'].filter(t => all.includes(t))])].slice(0, 5), rest = all.filter(t => !first.includes(t));
  const chip = id => h('button', { class: 'chip', style: { '--hue': TOOLS[id].hue }, onclick: () => { onGo(); handoff(id, new File([pdfOut.bytes], pdfOut.name, { type: 'application/pdf' })); } }, ic(TOOLS[id].icon, 14), TOOLS[id].short);
  const box = h('div', { class: 'chips' }, first.map(chip));
  if (rest.length) box.append(h('button', { class: 'chip more', onclick: e => { e.currentTarget.replaceWith(...rest.map(chip)); } }, `Altri ${rest.length}…`));
  return h('div', { class: 'res-next' }, h('div', { class: 'sec-t' }, 'Cosa fare dopo'), box);
}
/* la miniatura del risultato: la prima pagina del PDF (o l'immagine), altrimenti la sigla del formato */
function resThumb(o, many) {
  const ext = (o.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'file').toUpperCase();
  const box = h('div', { class: 'res-thumb sk' }, h('span', { class: 'ext' }, many ? `${many} file` : ext));
  (async () => {
    try {
      if (/\.pdf$/i.test(o.name) && o.bytes?.length && o.bytes.length < 60e6) {
        const d = await pdfDocument({ data: o.bytes.slice() }).promise;
        try { const pg = await d.getPage(1), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: 168 / v0.width }); const cv = h('canvas', { width: Math.round(v.width), height: Math.round(v.height) }); await pg.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise; if (box.isConnected) { box.replaceChildren(cv); box.classList.remove('sk'); } } finally { d.destroy(); }
      } else if (/\.(jpe?g|png|webp|gif)$/i.test(o.name) && o.bytes?.length < 30e6) {
        const url = URL.createObjectURL(new Blob([o.bytes])); const im = h('img', { alt: '', onload: () => { URL.revokeObjectURL(url); box.classList.remove('sk'); } }); im.src = url; box.replaceChildren(im);
      }
    } catch (e) { /* resta la sigla */ }
    if (!box.querySelector('img')) box.classList.remove('sk');
  })();
  return box;
}
/* il numero che conta: quanto peso in meno (quando c'è), altrimenti cosa è stato prodotto */
function resStat(outputs, { multi, primary }) {
  const o = outputs[primary ?? 0], inB = typeof CURRENT_INPUT !== 'undefined' ? CURRENT_INPUT.reduce((a, f) => a + (f?.size || 0), 0) : 0, outB = multi ? outputs.reduce((a, x) => a + (x.bytes?.length || 0), 0) : (o.bytes?.length || 0);
  const samePdf = !multi && /\.pdf$/i.test(o.name) && CURRENT_INPUT.length === 1 && /\.pdf$/i.test(CURRENT_INPUT[0]?.name || '');
  if (samePdf && inB > 0 && outB < inB * 0.95) {
    const pct = Math.round((1 - outB / inB) * 100), big = h('b', { class: 'tnum' }, `−${pct}%`);
    // il numero sale da zero (in un attimo): si vede il risparmio «accadere»
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { const t0 = performance.now(), step = t => { const k = Math.min(1, (t - t0) / 700), e = 1 - (1 - k) ** 3; big.textContent = `−${Math.round(pct * e)}%`; if (k < 1 && big.isConnected) requestAnimationFrame(step); }; big.textContent = '−0%'; requestAnimationFrame(step); }
    const el = h('div', {}, h('div', { class: 'res-stat', role: 'img', 'aria-label': `Peso ridotto del ${pct} per cento: da ${fmtSize(inB)} a ${fmtSize(outB)}` }, big, h('span', {}, `da ${fmtSize(inB)} a ${fmtSize(outB)}`)),
      h('div', { class: 'res-meter', 'aria-hidden': 'true' }, h('i', { style: { '--to': String(Math.max(0.03, outB / inB)) } })));
    return { el, celebrate: pct >= 60, saving: true };
  }
  // OCR e conversioni: il numero che conta è quanto testo è stato letto
  const allInfo = outputs.map(x => x.info || '').join(' '), words = allInfo.match(/([\d.]+)\s+parole/), pages = allInfo.match(/(\d+)\s+pagin[ae]\s+riconosciut/);
  if (words) {
    const n = parseInt(words[1].replace(/\./g, ''), 10);
    if (n > 0) return { el: h('div', {}, h('div', { class: 'res-stat', role: 'img', 'aria-label': `${n} parole lette${pages ? ' in ' + pages[1] + ' pagine' : ''}` }, h('b', { class: 'tnum' }, n.toLocaleString('it-IT')), h('span', {}, `parole lette${pages ? ` in ${plural(+pages[1], 'pagina', 'pagine')}` : ''}: ora il testo si cerca e si copia`))), celebrate: false };
  }
  const txt = multi ? `${outputs.length} file · ${fmtSize(outB)} in tutto` : [fmtSize(outB), o.info].filter(Boolean).join(' · ');
  return { el: h('div', { class: 'res-stat' }, h('span', {}, txt)), celebrate: false };
}
/* coriandoli di carta: pochi, una volta, solo quando il risultato lo merita (peso più che dimezzato) */
function resConfetti(box) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const art = box.querySelector('.res-art'); if (!art) return;
  const cols = ['var(--accent)', 'var(--gold)', 'var(--ok)', 'var(--sel)', 'var(--line-3)'], wrap = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  // a ventaglio verso l'alto e a sinistra del timbro: il testo, a destra, resta pulito
  for (let i = 0; i < 14; i++) { const a = Math.PI * (0.55 + 0.75 * i / 13), d = 34 + (i * 23) % 36; wrap.append(h('i', { style: { '--c': cols[i % cols.length], '--dx': Math.round(Math.cos(a) * d) + 'px', '--dy': Math.round(-Math.abs(Math.sin(a)) * d - 30) + 'px', '--rot': (i % 2 ? 1 : -1) * (160 + i * 37) + 'deg', '--dl': (i * 22) + 'ms' } })); }
  art.append(wrap); setTimeout(() => wrap.remove(), 1700);
}

/* ---------- nomi dei file presi dal contenuto ----------
   «scan0001.pdf» diventa «2026-03-12 Fattura n. 145-2026 - ALFA SERVIZI SRL.pdf»: tipo, data, numero, controparte e
   oggetto letti dal documento prodotto (anche da una scansione appena resa ricercabile). Non si rinomina mai di
   nascosto: nella finestra del risultato si sceglie «Come prima» o «Dal contenuto» (proposto da solo quando i nomi
   sono generici) e ogni nome si può correggere a mano. La scelta si ricorda. */
const AutoName = (() => {
  const GENERIC = /^(?:scan|scansion[ei]|scanned|img|image|immagine|foto|photo|dsc|dcim|pxl|cam|doc|documento|document|file|senza[\s_-]*titolo|untitled|nuovo[\s_-]*documento|stampa|print|whatsapp|wa|download|allegato|attachment|pdf|output|copia|copy|nuovo|new|cattura|screenshot)(?=[\s_\-().\d]|$)[\w\s\-().]*$/i;
  const TECH = /[-_ ](?:ocr|compresso|ruotato|unito|diviso|pdfa|testo|raddrizzato|pagine?[\s_-]*\d+(?:[-–]\d+)?|parte[\s_-]*\d+|\d+)$/i;
  const core = name => { let b = stripExt(name); for (let i = 0; i < 3 && TECH.test(b); i++) b = b.replace(TECH, ''); return b.trim(); };
  const isGeneric = name => { const b = core(name); return !b || GENERIC.test(b) || /^[\d\s_\-.()]+$/.test(b) || /^[a-f0-9\-]{12,}$/i.test(b) || /^\d{6,}[_-]/.test(b) && b.replace(/^\d+[_-]/, '').length < 4; };
  const clean = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/^[.\s-]+|[.\s-]+$/g, '').trim();
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function fromKind(k) {
    if (!k || (!k.type && !k.subject)) return null;
    const label = k.type ? cap(k.label) : 'Documento';
    const parts = [k.date || null, label + (k.number ? ` n. ${String(k.number).replace(/[\/\\]+/g, '-')}` : '')].filter(Boolean).join(' ');
    let name = parts;
    // forme societarie scritte in breve nei nomi dei file («S.R.L.» → «Srl»)
    const party = k.party && k.party.replace(/\bS\.?\s?R\.?\s?L\.?(\s?S\.?)?$/i, (m, s2) => s2 ? 'Srls' : 'Srl').replace(/\bS\.?\s?P\.?\s?A\.?$/i, 'Spa').replace(/\bS\.?\s?N\.?\s?C\.?$/i, 'Snc').replace(/\bS\.?\s?A\.?\s?S\.?$/i, 'Sas').trim();
    if (party && !new RegExp(party.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(name)) name += ' - ' + party;
    if (k.subject && name.length < 70) name += ' - ' + k.subject.split(/\s+/).slice(0, 9).join(' ');
    name = clean(name);
    if (name.length > 110) name = name.slice(0, 110).replace(/\s+\S*$/, '');
    // solo tipo senza altro: troppo vago per un nome utile
    if (!k.date && !k.number && !k.party && !k.subject) return null;
    return name || null;
  }
  async function textOf(bytes) {
    const d = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    try {
      let t = '';
      for (let p = 1; p <= Math.min(2, d.numPages); p++) { const tc = await (await d.getPage(p)).getTextContent(); t += tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n'; }
      const md = await d.getMetadata().catch(() => null);
      return { text: t, title: (md?.info?.Title || '').trim() };
    } finally { d.destroy(); }
  }
  // nome proposto per un PDF (senza estensione), o null se il contenuto non basta
  async function propose(bytes) {
    if (typeof DocKind === 'undefined' || !bytes || bytes.length > 150e6) return null;
    const { text, title } = await textOf(bytes);
    if (text.replace(/\s/g, '').length < 40) return null;
    return fromKind(DocKind.classify(text, { title: /^(untitled|senza titolo|microsoft word|documento\d*)/i.test(title) ? '' : title }));
  }
  const PREF = 'officina.nomi';
  const pref = () => { try { return localStorage.getItem(PREF); } catch { return null; } };
  const setPref = v => { try { localStorage.setItem(PREF, v); } catch { } };
  return { propose, isGeneric, core, clean, fromKind, pref, setPref };
})();
// rende univoci i nomi di un elenco (« (2)», « (3)»…)
function dedupeNames(outputs) {
  const seen = new Map();
  for (const o of outputs) { const k = o.name.toLowerCase(); const c = seen.get(k) || 0; seen.set(k, c + 1); if (c) o.name = o.name.replace(/(\.[^.]+)?$/, m => ` (${c + 1})${m}`); }
}
// la barra dei nomi nella finestra del risultato (proposte dal contenuto, scelta, modifica a mano)
function resultNames(outputs, onChange) {
  const bar = h('div', { class: 'res-names', hidden: true });
  outputs.forEach(o => { o._orig ||= o.name; });
  (async () => {
    const pdfs = outputs.filter(o => /\.pdf$/i.test(o.name) && o.bytes?.length).slice(0, 40);
    if (!pdfs.length || typeof AutoName === 'undefined') return;
    const byBase = new Map();
    for (const o of pdfs) { try { const n = await AutoName.propose(o.bytes); if (n) byBase.set(AutoName.core(o._orig).toLowerCase(), n); o._auto = n; } catch (e) { console.warn('nome dal contenuto', e); } }
    // gli altri file (Word, testo, Excel) dello stesso documento prendono lo stesso nome
    for (const o of outputs) if (!o._auto) { const n = byBase.get(AutoName.core(o._orig).toLowerCase()); if (n) o._auto = n; }
    const withAuto = outputs.filter(o => o._auto && o._auto + o._orig.match(/\.[^.]+$/)?.[0] !== o._orig);
    if (!withAuto.length || !bar.isConnected && !document.body.contains(bar)) return;
    const generic = withAuto.filter(o => AutoName.isGeneric(o._orig)).length;
    const p = AutoName.pref();
    let mode = p === 'contenuto' || p === 'originali' ? p : generic >= withAuto.length / 2 ? 'contenuto' : 'originali';
    const apply = () => {
      for (const o of outputs) { const ext = o._orig.match(/\.[^.]+$/)?.[0] || ''; o.name = o._manual || (mode === 'contenuto' && o._auto ? o._auto + ext : o._orig); }
      dedupeNames(outputs); onChange();
    };
    const segEl = seg([['originali', 'Come prima'], ['contenuto', 'Dal contenuto']], mode, v => { mode = v; AutoName.setPref(v); apply(); });
    bar.replaceChildren(h('span', { class: 'res-names-l' }, ic('textedit', 15), 'Nomi dei file'), segEl,
      h('span', { class: 'muted small' }, withAuto.length === 1 ? `es. «${withAuto[0]._auto}»` : `${withAuto.length} nomi letti dal contenuto`));
    bar.hidden = false;
    apply();
  })().catch(e => console.warn(e));
  return bar;
}
// nome modificabile con un clic
function editableName(o, el, onChange) {
  el.title = o.name + ' — clicca per rinominare';
  el.classList.add('rn-edit');
  el.onclick = () => {
    const ext = o.name.match(/\.[^.]+$/)?.[0] || '';
    const inp = h('input', { class: 'input rn-in', value: stripExt(o.name) });
    let closed = false;
    const done = ok => { if (closed) return; closed = true; if (ok) { const v = AutoName.clean(inp.value); if (v) { o._manual = v + ext; o.name = o._manual; } } if (inp.isConnected) inp.replaceWith(el); onChange(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
    inp.onblur = () => done(true);
    el.replaceWith(inp); inp.focus(); inp.select();
  };
}

/* ---------- file loading ---------- */
let DOC_SEQ = 0;
async function openPdf(file) {
  let bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw codedError(`«${file.name}» è vuoto (0 byte): prova a salvarlo di nuovo sul computer.`, 'INVALID');
  // file firmato digitalmente (.p7m, .tsd, .m7m): si usa il PDF contenuto
  if (typeof FirmaKit !== 'undefined' && !FirmaKit.isPdf(bytes)) {
    try {
      const r = await FirmaKit.open(bytes, file.name || '');
      if (r.signed && r.type.ext === 'pdf') { bytes = r.content; file = new File([bytes], r.name, { type: 'application/pdf' }); toast('PDF estratto dal file firmato digitalmente: la firma non resta nel file modificato'); }
      else if (r.signed) throw new Error(`«${file.name}» è un file firmato che contiene un ${r.type.label}, non un PDF: aprilo con «Firme digitali e P7M».`);
    } catch (e) { if (/contiene un/.test(e.message)) throw e; }
  }
  // PDF protetto: si apre chiedendo la password (o senza, se ha solo dei limiti) e si lavora sulla copia in chiaro
  if (typeof PdfCrypt !== 'undefined' && PdfCrypt.looksEncrypted(bytes)) {
    let r = null;
    try { r = await unlockForOpen(bytes, file.name || 'documento'); }
    catch (e) { if (e.code === 'CERT' || /password/i.test(e.message)) throw e; console.warn('decifratura non riuscita', e); }
    if (r && r.info) {
      bytes = r.bytes; file = new File([bytes], file.name, { type: 'application/pdf' });
      toast(r.asked ? 'PDF aperto con la password: ciò che salvi da qui non avrà la password (per rimetterla usa «Proteggi e sblocca»).' : 'Il PDF aveva dei limiti (stampa, copia o modifica): ciò che salvi da qui non li avrà.');
    }
  }
  let pdfjs;
  try {
    pdfjs = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (e) {
    const n = e && e.name;
    if (n === 'PasswordException') throw codedError(`«${file.name}» è protetto da password: rimuovi prima la protezione.`, 'PASSWORD');
    if (n === 'InvalidPDFException' || n === 'MissingPDFException') {
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
      if (/\.p7m$/i.test(file.name) || /^0\x80|^\x30/.test(head)) throw new Error(`«${file.name}» sembra un file con firma digitale ma non è stato possibile leggerlo: prova con lo strumento «Firme digitali e P7M».`);
      if (/<html|<!doctype/i.test(head)) throw codedError(`«${file.name}» in realtà è una pagina web salvata con estensione .pdf, non un PDF.`, 'FORMAT');
      throw codedError(`«${file.name}» non sembra un PDF valido (file danneggiato o di un altro formato).`, n === 'MissingPDFException' && !bytes.length ? 'MISSING' : 'INVALID');
    }
    console.error(e);
    throw new Error(`Impossibile leggere «${file.name}»: ${(e && e.message) || e}. Prova ad aprire file360 direttamente in Chrome, Edge o Firefox.`);
  }
  return { id: ++DOC_SEQ, file, name: file.name, base: stripExt(file.name), size: bytes.length, bytes, pdfjs, numPages: pdfjs.numPages };
}
async function loadLib(bytes) {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return d;
}
async function saveDoc(doc) {
  doc.setProducer('file360'); doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}
async function embedImageFile(pdf, file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const n = file.name.toLowerCase(), t = (file.type || '').toLowerCase();
  if (t === 'image/jpeg' || /\.jpe?g$/.test(n)) { try { return await pdf.embedJpg(buf); } catch { } }
  if (t === 'image/png' || /\.png$/.test(n)) { try { return await pdf.embedPng(buf); } catch { } }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const c = h('canvas', { width: img.naturalWidth, height: img.naturalHeight });
    c.getContext('2d').drawImage(img, 0, 0);
    return pdf.embedPng(await canvasToBytes(c, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
/* ---------- display <-> PDF coordinates ----------
   "Display" space = page as shown (rotation applied), in points, origin top-left. */
function pageTransform(page) {
  const cb = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const { x: x0, y: y0, width: W, height: H } = cb;
  const f = (dx, dy) => {
    switch (r) {
      case 90: return { x: x0 + dy, y: y0 + dx };
      case 180: return { x: x0 + W - dx, y: y0 + dy };
      case 270: return { x: x0 + W - dy, y: y0 + H - dx };
      default: return { x: x0 + dx, y: y0 + H - dy };
    }
  };
  f.rot = r; f.dw = r % 180 ? H : W; f.dh = r % 180 ? W : H;
  return f;
}

/* ---------- fonts ---------- */
const FONT_CSS = {
  helv: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif',
  times: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
  cour: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace',
};
const FONT_LABEL = { helv: 'Helvetica / Arial', times: 'Times New Roman', cour: 'Courier' };
const STD = {
  helv: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  cour: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};
function fontCache(pdf) {
  const m = new Map();
  return async (fam = 'helv', bold = false, italic = false) => {
    const name = STD[fam][(bold ? 1 : 0) + (italic ? 2 : 0)];
    if (!m.has(name)) m.set(name, await pdf.embedFont(name));
    return m.get(name);
  };
}
/* CSS baseline position (fraction of font-size) for line-height 1.2 and 1, measured on the real browser font */
const BASELINE = {};
function measureBaselines() {
  for (const fam of Object.keys(FONT_CSS)) for (const lh of [1.2, 1]) {
    const box = h('div', { style: { position: 'absolute', left: '-9999px', top: '0', fontFamily: FONT_CSS[fam], fontSize: '100px', lineHeight: String(lh), whiteSpace: 'pre' } });
    const mark = h('span', { style: { display: 'inline-block', width: '1px', height: '0px', verticalAlign: 'baseline' } });
    box.append('Hg', mark); document.body.append(box);
    BASELINE[fam + lh] = (mark.getBoundingClientRect().top - box.getBoundingClientRect().top) / 100;
    box.remove();
  }
}
const _blCache = new Map();
function baselineFor(css, lh = 1.2) {
  const key = css + '|' + lh;
  if (_blCache.has(key)) return _blCache.get(key);
  const box = h('div', { style: { position: 'absolute', left: '-9999px', top: '0', fontFamily: css, fontSize: '100px', lineHeight: String(lh), whiteSpace: 'pre' } });
  const mark = h('span', { style: { display: 'inline-block', width: '1px', height: '0px', verticalAlign: 'baseline' } });
  box.append('Hg', mark); document.body.append(box);
  const v = (mark.getBoundingClientRect().top - box.getBoundingClientRect().top) / 100;
  box.remove();
  const first = (css.match(/^"([^"]+)"/) || [])[1];
  let loaded = true; try { if (first) loaded = document.fonts.check(`10px "${first}"`); } catch { }
  if (loaded) _blCache.set(key, v);
  return v;
}
const WINANSI_EXTRA = { '−': '-', '‐': '-', '‑': '-', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '′': "'", '″': '"', 'ﬁ': 'fi', 'ﬂ': 'fl' };
const _fontChars = new WeakMap();
function pdfSafe(font, s) {
  let cache = _fontChars.get(font); if (!cache) { cache = { ok: new Set(), bad: new Set() }; _fontChars.set(font, cache); }
  const fk = font?.embedder?.font;
  const has = c => { if (fk && typeof fk.hasGlyphForCodePoint === 'function') { for (const ch of c) if (!fk.hasGlyphForCodePoint(ch.codePointAt(0))) return false; return true; } font.encodeText(c); return true; };
  let out = '';
  for (const ch of String(s).replace(/\t/g, '    ')) {
    let c = WINANSI_EXTRA[ch] ?? ch;
    if (c === ' ' || c === '\n') { out += c; continue; }
    if (cache.ok.has(c)) { out += c; continue; }
    if (cache.bad.has(c)) { out += '?'; continue; }
    let good = false; try { good = has(c); } catch { good = false; }
    if (good) { cache.ok.add(c); out += c; continue; }
    const n = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let g2 = false; try { g2 = n && has(n); } catch { }
    if (g2) out += n; else { cache.bad.add(c); out += '?'; }
  }
  return out;
}

/* ---------- rendering ---------- */
let GEN = 0;
const thumbQueue = []; let thumbBusy = false;
async function pumpThumbs() {
  if (thumbBusy) return; thumbBusy = true;
  while (thumbQueue.length) { const job = thumbQueue.shift(); try { await job(); } catch (e) { console.warn(e); } }
  thumbBusy = false;
}
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
async function drawThumb(pdfjs, pageNo, canvas, maxW = 150, maxH = 180, extraRot = 0) {
  const page = await pdfjs.getPage(pageNo);
  const rot = (page.rotate + extraRot + 360) % 360;
  const v1 = page.getViewport({ scale: 1, rotation: rot });
  const s = Math.min(maxW / v1.width, maxH / v1.height);
  const vp = page.getViewport({ scale: s * DPR(), rotation: rot });
  const c = h('canvas', { width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  canvas.width = c.width; canvas.height = c.height;
  canvas.style.width = (vp.width / DPR()) + 'px'; canvas.style.height = (vp.height / DPR()) + 'px';
  canvas.getContext('2d').drawImage(c, 0, 0);
}
const thumbObs = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { thumbObs.unobserve(e.target); e.target._job?.(); }
}, { rootMargin: '400px' });
function lazyThumb(pdfjs, pageNo, canvas, maxW, maxH, extraRot = 0) {
  const gen = GEN;
  canvas._job = () => { thumbQueue.push(async () => { if (gen !== GEN) return; await drawThumb(pdfjs, pageNo, canvas, maxW, maxH, extraRot); }); pumpThumbs(); };
  requestAnimationFrame(() => thumbObs.observe(canvas));
  return canvas;
}
/* Render a page to a canvas at a given DPI (rotation applied), capped in pixels */
async function renderPageCanvas(pdfjs, pageNo, dpi, { maxPixels = MAX_CANVAS_PX, gray = false, big = false } = {}) {
  // «big»: esportazione ad alta risoluzione sul computer (il limite stretto resta per i telefoni)
  maxPixels = Math.min(maxPixels, big && !IS_TOUCH ? 80e6 : MAX_CANVAS_PX);
  const page = await pdfjs.getPage(pageNo);
  const v1 = page.getViewport({ scale: 1 });
  let scale = dpi / 72;
  const px = v1.width * v1.height * scale * scale;
  if (px > maxPixels) scale *= Math.sqrt(maxPixels / px);
  const vp = page.getViewport({ scale });
  const c = h('canvas', { width: Math.max(1, Math.round(vp.width)), height: Math.max(1, Math.round(vp.height)) });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (gray) {
    const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const y = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114; a[i] = a[i + 1] = a[i + 2] = y; }
    ctx.putImageData(d, 0, 0);
  }
  page.cleanup();
  return { canvas: c, scale: c.width / v1.width, w: v1.width, h: v1.height };
}

/* ---------- sortable grid (drag & drop) ---------- */
function makeSortable(container, onChange) {
  let dragEl = null;
  container.addEventListener('dragstart', e => {
    const c = e.target.closest?.('[data-sort]'); if (!c) return;
    dragEl = c; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.sort);
    requestAnimationFrame(() => c.classList.add('dragging'));
  });
  container.addEventListener('dragover', e => {
    if (!dragEl) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const over = e.target.closest?.('[data-sort]');
    if (!over || over === dragEl) return;
    const r = over.getBoundingClientRect();
    const after = (e.clientX - r.left) > r.width / 2;
    const ref = after ? over.nextSibling : over;
    if (ref !== dragEl && ref !== dragEl.nextSibling || !after && over.previousSibling !== dragEl) container.insertBefore(dragEl, ref);
  });
  container.addEventListener('drop', e => { if (dragEl) e.preventDefault(); });
  container.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging'); dragEl = null;
    onChange([...container.querySelectorAll('[data-sort]')].map(el => el.dataset.sort));
  });
  // touch: press and hold a card, then move it (normal swipes keep scrolling the page)
  let touch = null;
  const endTouch = commit => {
    if (!touch) return;
    clearTimeout(touch.timer);
    if (touch.active) {
      touch.card.classList.remove('dragging'); touch.ghost.remove();
      if (commit) onChange([...container.querySelectorAll('[data-sort]')].map(el => el.dataset.sort));
    }
    touch = null;
  };
  container.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const card = e.target.closest('[data-sort]');
    if (!card || e.target.closest('button,input,select')) return;
    endTouch(false);
    touch = { card, x: e.clientX, y: e.clientY, active: false };
    touch.timer = setTimeout(() => {
      if (!touch) return;
      const r = card.getBoundingClientRect();
      touch.active = true; touch.dx = touch.x - r.left; touch.dy = touch.y - r.top;
      touch.ghost = card.cloneNode(true);
      Object.assign(touch.ghost.style, { position: 'fixed', left: '0', top: '0', width: r.width + 'px', zIndex: 70, pointerEvents: 'none', boxShadow: 'var(--shadow-lg)', transform: `translate(${r.left}px,${r.top}px) scale(1.04)` });
      document.body.append(touch.ghost);
      card.classList.add('dragging');
      try { navigator.vibrate?.(12); } catch { }
    }, 380);
  });
  container.addEventListener('touchmove', e => {
    if (!touch) return;
    const t = e.touches[0];
    if (!touch.active) { if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) endTouch(false); return; }
    e.preventDefault();
    touch.ghost.style.transform = `translate(${t.clientX - touch.dx}px,${t.clientY - touch.dy}px) scale(1.04)`;
    const over = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-sort]');
    if (over && over !== touch.card && over.parentNode === container) {
      const r = over.getBoundingClientRect();
      container.insertBefore(touch.card, t.clientX > r.left + r.width / 2 ? over.nextSibling : over);
    }
  }, { passive: false });
  container.addEventListener('touchend', () => endTouch(true));
  container.addEventListener('touchcancel', () => endTouch(false));
  container.addEventListener('contextmenu', e => { if (touch) e.preventDefault(); });
}

/* ---------- viewer (single page with thumbnails, zoom, overlay) ---------- */
class Viewer {
  constructor(doc, { tools = null, onOverlay = null, beforeChange = null, onChange = null, fit = 'page', pageSource = null, noForms = false } = {}) {
    this.fitMode = fit; this.pageSource = pageSource; this.noForms = noForms;
    this.doc = doc; this.page = 1; this.zoom = null; this.cur = 1; this.k = 1; this.rgen = 0;
    Viewer.current = this;
    { const wp = typeof Flow !== 'undefined' ? Flow.takeWantPage() : null; if (wp) this.page = clamp(wp, 1, doc.numPages); }
    this.onOverlay = onOverlay; this.beforeChange = beforeChange; this.onChange = onChange;
    this.canvas = h('canvas', { class: 'v-canvas' });
    this.overlay = h('div', { class: 'v-overlay' });
    this.pageEl = h('div', { class: 'v-page' }, this.canvas, this.overlay);
    this.scroll = h('div', { class: 'v-scroll', tabindex: '0', role: 'region', 'aria-label': 'Pagina del documento' }, this.pageEl);
    this.pageLabel = h('span', { class: 'v-pageno' });
    this.zoomLabel = h('span', { class: 'v-zoom' });
    this.prevBtn = iconBtn('left', 'Pagina precedente (PagSu)', () => this.go(this.page - 1));
    this.nextBtn = iconBtn('right', 'Pagina successiva (PagGiù)', () => this.go(this.page + 1));
    const nav = h('div', { class: 'v-nav' }, this.prevBtn, this.pageLabel, this.nextBtn);
    const zoom = h('div', { class: 'v-zoomctl' },
      iconBtn('zoomout', 'Riduci', () => this.setZoom(this.cur / 1.25)), this.zoomLabel,
      iconBtn('zoomin', 'Ingrandisci', () => this.setZoom(this.cur * 1.25)),
      iconBtn('fit', 'Adatta alla finestra', () => this.setZoom(null)));
    this.bar = tools ? h('div', { class: 'v-bar' }, h('div', { class: 'v-tools' }, tools)) : null;
    this.float = h('div', { class: 'v-float' }, nav, h('span', { class: 'vsep' }), zoom);
    this.thumbs = h('div', { class: 'v-thumbs' });
    this.thumbBtns = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = h('canvas');
      const b = h('button', { class: 'v-th', onclick: () => this.go(i) }, c, String(i));
      lazyThumb(doc.pdfjs, i, c, 96, 128);
      this.thumbBtns.push(b); this.thumbs.append(b);
    }
    this.el = h('div', { class: 'viewer' }, this.thumbs, h('div', { class: 'v-main' }, this.bar, this.scroll, this.float));
    let rt = 0;
    this.ro = new ResizeObserver(() => { if (this.zoom == null) { clearTimeout(rt); rt = setTimeout(() => this.render(), 120); } });
    this.ro.observe(this.scroll);
  }
  toPt(e) {
    const r = this.overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.cur, y: (e.clientY - r.top) / this.cur };
  }
  go(n) {
    n = clamp(n, 1, this.doc.numPages);
    if (n === this.page) return;
    this.beforeChange?.();
    this.page = n; this.render(); this.scroll.scrollTop = 0;
    this.thumbBtns[n - 1]?.scrollIntoView({ block: 'nearest' });
  }
  setZoom(z) { this.beforeChange?.(); this.zoom = z == null ? null : clamp(z, 0.2, 6); this.render(); }
  refresh() { this.onOverlay?.(this.page - 1, this.overlay, this.cur); }
  async render() {
    const gen = ++this.rgen;
    const src = this.pageSource ? this.pageSource(this.page) : null;
    let page;
    try { page = src ? await src.doc.getPage(1) : await this.doc.pdfjs.getPage(this.page); }
    catch (e) { page = await this.doc.pdfjs.getPage(this.page); }
    const srcKey = src ? src.key : 'orig';
    if (gen !== this.rgen) return;
    const v1 = page.getViewport({ scale: 1 });
    this.vw = v1.width; this.vh = v1.height;
    const sw = this.scroll.clientWidth - 48, sh = this.scroll.clientHeight - 110;
    const fit = this.fitMode === 'width' ? Math.max(0.15, Math.min(sw / v1.width, 1.6)) : Math.max(0.15, Math.min(sw / v1.width, (sh > 120 ? sh : 900) / v1.height));
    this.cur = this.zoom ?? fit;
    const k = this.cur * DPR();
    const vp = page.getViewport({ scale: k });
    const c = h('canvas', { width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    try { this.task?.cancel(); } catch { }
    // set geometry immediately so the overlay is usable while rendering
    this.pageEl.style.width = v1.width * this.cur + 'px'; this.pageEl.style.height = v1.height * this.cur + 'px';
    this.pageLabel.textContent = `${this.page} / ${this.doc.numPages}`;
    this.zoomLabel.textContent = Math.round(this.cur * 100) + '%';
    this.prevBtn.disabled = this.page <= 1; this.nextBtn.disabled = this.page >= this.doc.numPages;
    this.thumbBtns.forEach((b, i) => b.classList.toggle('on', i === this.page - 1));
    this.refresh();
    this.task = page.render({ canvasContext: ctx, viewport: vp, ...(this.noForms ? { annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS } : {}) });
    try { await this.task.promise; } catch (e) { if (e?.name === 'RenderingCancelledException') return; throw e; }
    if (gen !== this.rgen) return;
    this.canvas.width = c.width; this.canvas.height = c.height; this.k = c.width / v1.width;
    this.canvas.getContext('2d').drawImage(c, 0, 0);
    this.rendered = this.page; this.renderedKey = srcKey;
    this.onChange?.(this.page);
  }
  destroy() { this.ro.disconnect(); }
}
function iconBtn(icon, title, onclick, cls = 'icon-btn') {
  return h('button', { class: cls, title, 'aria-label': title, onclick }, ic(icon, 18));
}
function toolBtn(icon, label, title, onclick) {
  // al telefono si legge la prima parola sotto l'icona («Anteprima», «Svuota»): mai icone mute
  const short = label ? label.split(' ')[0] : '';
  return h('button', { class: 'tbtn' + (label ? '' : ' only'), title, 'aria-label': label ? null : title, onclick }, ic(icon, 18),
    label ? h('span', { class: 'lbl' }, label) : null, label ? h('span', { class: 'lbl-s' }, short) : null);
}
function guessFont(name = '', family = '') {
  const s = (name + ' ' + family).toLowerCase();
  if (/courier|mono|consol/.test(s)) return 'cour';
  if (/times|serif|roman|garamond|georgia|cambria|book|minion|palatino/.test(s) && !/sans/.test(s)) return 'times';
  return 'helv';
}
const _mctx = document.createElement('canvas').getContext('2d');
/* relative x offset (0..1) of each character boundary inside a pdf.js text item */
function charOffsets(it, fam) {
  if (it._offs) return it._offs;
  _mctx.font = `100px ${FONT_CSS[fam] || FONT_CSS.helv}`;
  const total = _mctx.measureText(it.str).width || 1;
  const offs = [0];
  for (let k = 1; k <= it.str.length; k++) offs.push(Math.min(1, _mctx.measureText(it.str.slice(0, k)).width / total));
  return (it._offs = offs);
}

/* ---------- side panel helpers ---------- */
/* opzioni che servono di rado: chiuse sotto «Altre opzioni» con il riassunto di come sono impostate; si ricorda se l'utente le ha aperte (per strumento) */
function advanced(key, summaryOf, ...kids) {
  const K = 'officina.adv.' + key; let open = false; try { open = localStorage.getItem(K) === '1'; } catch { }
  const sum = h('span', { class: 'adv-sum' });
  const d = h('details', { class: 'adv', open, ontoggle: () => { try { localStorage.setItem(K, d.open ? '1' : '0'); } catch { } } }, h('summary', {}, 'Altre opzioni', sum), ...kids.filter(Boolean));
  const upd = () => { try { sum.textContent = summaryOf ? summaryOf() : ''; } catch { } }; upd(); d.addEventListener('change', () => setTimeout(upd, 0)); d.addEventListener('click', () => setTimeout(upd, 0));
  return d;
}
function sec(title, ...kids) {
  // il titolo della sezione fa da etichetta ai campi che contiene e che non ne hanno una loro
  if (title && typeof title === 'string') for (const k of kids.flat(3)) if (k && k.nodeType === 1) { const f = k.matches?.('input,select,textarea') ? [k] : [...(k.querySelectorAll?.('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea') || [])]; f.forEach(el => { if (!el.getAttribute('aria-label') && !el.id && !el.closest('label')) el.setAttribute('aria-label', title); }); }
  return h('div', { class: 'sec' }, title ? h('div', { class: 'sec-t' }, title) : null, kids);
}
function seg(options, value, onChange) {
  const el = h('div', { class: 'seg' });
  const draw = () => el.replaceChildren(...options.map(([v, l]) => h('button', { class: v === value ? 'on' : '', onclick: () => { value = v; draw(); onChange(v); } }, l)));
  draw(); return el;
}
function checkbox(label, checked, onChange, sub) {
  const inp = h('input', { type: 'checkbox', checked: !!checked, onchange: () => onChange(inp.checked) });
  return h('label', { class: 'check' }, inp, h('span', {}, label, sub ? h('div', { class: 'muted small' }, sub) : null));
}
/* aiuti a richiesta: le spiegazioni sotto le opzioni (testo grigio) restano nella pagina ma si aprono con «?» accanto al
   titolo della sezione; i messaggi di stato (.hint: cosa è stato trovato, cosa manca) restano sempre visibili.
   Chi preferisce vederle sempre le lascia aperte: la scelta si ricorda su questo dispositivo. */
const HelpOnDemand = (() => {
  const KEY = 'file360.help.open';
  let always = false; try { always = localStorage.getItem(KEY) === '1'; } catch { }
  const nWords = e => (e.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  let seq = 0;
  function enhance(root) {
    for (const sec of root.querySelectorAll('.sec:not([data-help])')) {
      const t = [...sec.querySelectorAll('.muted.small, .muted')].filter(e => !e.closest('button, .seg, .hint, .help-t') && !e.querySelector('input, select, button, textarea') && nWords(e) >= 6);
      sec.dataset.help = t.length ? '1' : '0';
      if (!t.length) continue;
      t.forEach(e => { e.classList.add('help-t'); if (!e.id) e.id = 'help-' + (++seq); });
      const title = sec.querySelector(':scope > .sec-t')?.textContent.trim();
      const btn = h('button', { type: 'button', class: 'help-btn', 'aria-expanded': String(always), 'aria-controls': t.map(e => e.id).join(' '),
        title: 'Spiegazione', 'aria-label': title ? `Spiegazione: ${title}` : 'Mostra la spiegazione' }, '?');
      btn.onclick = () => { const on = !sec.classList.contains('help-on'); sec.classList.toggle('help-on', on); btn.setAttribute('aria-expanded', String(on));
        // aperte tre volte di seguito: si vede che servono, restano aperte da qui in avanti (si richiudono con un clic)
        if (on && ++opened >= 3 && !always) { always = true; try { localStorage.setItem(KEY, '1'); } catch { } } };
      if (always) sec.classList.add('help-on');
      const head = sec.querySelector(':scope > .sec-t');
      if (head) head.append(btn); else sec.prepend(h('div', { class: 'sec-t sec-t-help' }, btn));
    }
  }
  let opened = 0;
  function watch(root) {
    enhance(root); let raf = 0;
    new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (root.isConnected) enhance(root); }); }).observe(root, { childList: true, subtree: true });
  }
  return { enhance, watch };
})();
function workspace(stage, mainEl, sideKids, footKids) {
  const side = h('aside', { class: 'side' }, h('div', { class: 'side-scroll' }, sideKids), h('div', { class: 'side-foot' }, footKids));
  HelpOnDemand.watch(side.firstChild);
  const ws = h('div', { class: 'ws' }, mainEl, side);
  stage.replaceChildren(ws);
  return ws;
}

/* =====================================================================
   Archivio locale (IndexedDB) condiviso: progetti, versioni, risultati, registro delle attività.
   Tutto resta in questo browser; niente viene inviato altrove.
   ===================================================================== */
const Store = (() => {
  const NAME = 'officina', VER = 2;
  const STORES = { ripresa: null, attivita: { keyPath: 'id', autoIncrement: true }, progetti: { keyPath: 'id' }, blobs: null };
  let dbp = null;
  const db = () => dbp ||= new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB non disponibile'));
    let r;
    try { r = indexedDB.open(NAME, VER); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { for (const [n, o] of Object.entries(STORES)) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, o || undefined); };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Archivio locale bloccato da un’altra scheda di file360'));
  });
  db().catch(() => { dbp = null; });
  // una richiesta in una transazione; si risolve a transazione conclusa (dati davvero scritti)
  async function op(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = t.onabort = () => rej(t.error || new Error('Archivio locale: operazione non riuscita'));
    });
  }
  const get = (s, k) => op(s, 'readonly', o => o.get(k));
  const put = (s, v, k) => op(s, 'readwrite', o => k === undefined ? o.put(v) : o.put(v, k));
  const del = (s, k) => op(s, 'readwrite', o => o.delete(k));
  const all = s => op(s, 'readonly', o => o.getAll());
  const keys = s => op(s, 'readonly', o => o.getAllKeys());
  const clear = s => op(s, 'readwrite', o => o.clear());
  // più scritture in una sola transazione (tutte o nessuna)
  async function batch(store, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); fn(t.objectStore(store)); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); }); }
  // spazio: chiede al browser di non cancellare l'archivio quando il disco è pieno, e stima quanto ne resta
  let asked = false;
  async function persist() { if (asked) return; asked = true; try { if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.(); } catch { } }
  async function estimate() { try { return await navigator.storage.estimate(); } catch { return null; } }
  const isQuota = e => e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
  return { db, get, put, del, all, keys, clear, batch, persist, estimate, isQuota };
})();

/* ---------- impronta SHA-256 (per il registro: dimostra quale file è stato prodotto) ----------
   crypto.subtle dove c'è (pagine sicure); altrimenti un'implementazione in JS */
const Sha256 = (() => {
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function js(bytes) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const n = bytes.length, total = ((n + 9 + 63) >> 6) << 6, W = new Uint32Array(64);
    const tail = new Uint8Array(total - (n & ~63)); tail.set(bytes.subarray(n & ~63)); tail[n & 63] = 0x80;
    const bits = n * 8, tv = new DataView(tail.buffer); tv.setUint32(tail.length - 4, bits >>> 0); tv.setUint32(tail.length - 8, Math.floor(bits / 4294967296));
    const block = (src, off) => {
      for (let i = 0; i < 16; i++) W[i] = (src[off + i * 4] << 24) | (src[off + i * 4 + 1] << 16) | (src[off + i * 4 + 2] << 8) | src[off + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = ((((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) + W[i - 16]) | 0; }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h2 = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h2 + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h2 = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h2;
    };
    for (let off = 0; off + 64 <= n; off += 64) block(bytes, off);
    for (let off = 0; off < tail.length; off += 64) block(tail, off);
    return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
  }
  async function of(data) {
    const bytes = data instanceof Uint8Array ? data : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
    try { if (crypto?.subtle?.digest) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { }
    return js(bytes);
  }
  return { of, js };
})();

/* =====================================================================
   Brand — logo, colori e carattere di file360, gli stessi nel sito
   e nei file prodotti (PDF del bilancio XBRL, ricevute, rapporti, Excel).
   Logo «Orbita»: il foglio al centro, un'orbita che gli gira intorno (tutto quello che puoi fare al file,
   senza che il file se ne vada) e un satellite giallo, il risultato che arriva.
   ===================================================================== */
const Brand = (() => {
  const C = { accent: '#5A2BFF', accent2: '#4518E6', soft: '#ECE6FF', ink: '#15122E', ink2: '#38345A', muted: '#615D7E', bg: '#F4F2FF', surface2: '#F0EDFB', surface3: '#E4E0F5', line: '#E1DCF5', line2: '#CFC8EC', fold: '#B8A6FF', orbit: '#FF3D7F', sun: '#FFC234', ok: '#00875F' };
  /* esagono con gli angoli arrotondati (vertici in alto e in basso), come percorso SVG */
  function hexPath(cx, cy, r, round, ccw = false) {
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i + 30); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    if (ccw) pts.reverse();
    const f = n => n.toFixed(2);
    let d = '';
    pts.forEach((p, i) => {
      const prev = pts[(i + 5) % 6], next = pts[(i + 1) % 6];
      const k = round / r;
      const a = [p[0] + (prev[0] - p[0]) * k, p[1] + (prev[1] - p[1]) * k], b = [p[0] + (next[0] - p[0]) * k, p[1] + (next[1] - p[1]) * k];
      d += (i ? 'L' : 'M') + f(a[0]) + ' ' + f(a[1]) + 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(b[0]) + ' ' + f(b[1]);
    });
    return d + 'Z';
  }
  // disegno su 64×64: il foglio con l'orecchia; l'orbita (ellisse inclinata di 24°) passa dietro in alto e davanti in basso
  const PAGE = 'M21 9H36L47 20V51A4 4 0 0 1 43 55H21A4 4 0 0 1 17 51V13A4 4 0 0 1 21 9Z';
  const MARK = PAGE;
  const FOLD = 'M36 9V18A2 2 0 0 0 38 20H47Z';
  const ORBIT_BACK = 'M6.42 46.39A28 10.5 -24 0 1 57.58 23.61';
  const ORBIT_FRONT = 'M57.58 23.61A28 10.5 -24 0 1 6.42 46.39';
  const ORBIT = ORBIT_BACK + 'A28 10.5 -24 0 1 6.42 46.39';
  const SUN = [57.58, 23.61, 4.6];
  let LIVE_N = 0;
  function logoSvg(size = 32, { title = 'file360', mono = null, live = false } = {}) {
    if (live && !mono && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.anim !== 'off') return liveSvg(size, title);
    const o = mono || C.orbit, sw = size < 24 ? 5 : 4;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${title}">` +
      `<path d="${ORBIT_BACK}" fill="none" stroke="${o}" stroke-width="${sw}" stroke-linecap="round"/>` +
      `<path d="${PAGE}" fill="${mono || C.accent}"/><path d="${FOLD}" fill="${mono ? mono : C.fold}" ${mono ? 'opacity=".55"' : ''}/>` +
      `<path d="${ORBIT_FRONT}" fill="none" stroke="${o}" stroke-width="${sw}" stroke-linecap="round"/>` +
      `<circle cx="${SUN[0]}" cy="${SUN[1]}" r="${SUN[2] + (size < 24 ? 0.8 : 0)}" fill="${mono || C.sun}"/></svg>`;
  }
  // attesa: il dado che gira nel foglio
  // il dado ruota come livello a sé (solo trasformazione): il browser non ridisegna nulla a ogni fotogramma,
  // così l'attesa non ruba processore all'elaborazione
  /* il logo vivo: il satellite gira sempre sull'orbita; passa dietro il foglio in alto e davanti in basso.
     Due copie del punto con lo stesso moto: una sotto il foglio, una sopra ma ritagliata alla metà anteriore dell'orbita. */
  function liveSvg(size, title) {
    const k = ++LIVE_N, dur = '5.2s', R = SUN[2];
    const motion = `<animateMotion dur="${dur}" repeatCount="indefinite" path="${ORBIT}" rotate="0"/>`;
    const sun = `<g><circle r="${R}" fill="${C.sun}"/><circle r="${R + 3}" fill="${C.sun}" opacity=".28"/>${motion}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${title}" class="logo-live">` +
      `<defs><clipPath id="lgf${k}"><rect x="-10" y="35" width="84" height="40" transform="rotate(-24 32 35)"/></clipPath>` +
      `<linearGradient id="lgp${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7A52FF"/><stop offset="1" stop-color="${C.accent2}"/></linearGradient>` +
      `<linearGradient id="lgo${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.orbit}"/><stop offset=".55" stop-color="#FF7A59"/><stop offset="1" stop-color="${C.orbit}"/></linearGradient></defs>` +
      `<path d="${ORBIT_BACK}" fill="none" stroke="url(#lgo${k})" stroke-width="4" stroke-linecap="round" opacity=".9"/>` + sun +
      `<path d="${PAGE}" fill="url(#lgp${k})"/><path d="${FOLD}" fill="${C.fold}"/>` +
      `<path d="M22 31h18M22 37h18M22 43h11" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".42"/>` +
      `<path d="${ORBIT_FRONT}" fill="none" stroke="url(#lgo${k})" stroke-width="4" stroke-linecap="round"/>` +
      `<g clip-path="url(#lgf${k})">${sun}</g></svg>`;
  }
  // attesa: il satellite gira sull'orbita intorno al foglio (si muove solo lui, un punto: costa pochissimo)
  const spinnerSvg = (size = 56) => `<span class="brand-spin" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path d="${ORBIT_BACK}" fill="none" stroke="${C.orbit}" stroke-width="4" stroke-linecap="round" opacity=".55"/><path d="${PAGE}" fill="${C.accent}"/><path d="${FOLD}" fill="${C.fold}"/><path d="${ORBIT_FRONT}" fill="none" stroke="${C.orbit}" stroke-width="4" stroke-linecap="round"/></svg><span class="orbit" style="transform:scale(${size / 64})"><i class="sat"></i></span></span>`;
  const favicon = () => 'data:image/svg+xml,' + encodeURIComponent(logoSvg(64));
  /* —— nei PDF (pdf-lib): logo e caratteri —— */
  const rgbHex = hx => { const n = parseInt(hx.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  function drawLogo(page, x, yTop, size) {
    const s = size / 64;
    page.drawSvgPath(ORBIT_BACK, { x, y: yTop, scale: s, borderColor: rgbHex(C.orbit), borderWidth: 4, borderLineCap: 1 });
    page.drawSvgPath(MARK, { x, y: yTop, scale: s, color: rgbHex(C.accent) });
    page.drawSvgPath(FOLD, { x, y: yTop, scale: s, color: rgbHex(C.fold) });
    page.drawSvgPath(ORBIT_FRONT, { x, y: yTop, scale: s, borderColor: rgbHex(C.orbit), borderWidth: 4, borderLineCap: 1 });
    page.drawCircle({ x: x + SUN[0] * s, y: yTop - SUN[1] * s, size: SUN[2] * s, color: rgbHex(C.sun) });
  }
  let ttf = null;
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ITAL = new WeakSet();
  /* Instrument Sans nel PDF (r 500, m 600, b 700, x 700; corsivo = inclinato); se manca, Helvetica */
  async function pdfFonts(pdf) {
    try { await need('fontkit'); } catch { }
    const T = window.BRAND_TTF;
    if (!T || typeof fontkit === 'undefined') {
      const r = await pdf.embedFont(StandardFonts.Helvetica), b = await pdf.embedFont(StandardFonts.HelveticaBold);
      return { r, m: b, b, x: b, i: await pdf.embedFont(StandardFonts.HelveticaOblique), bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique), brand: false };
    }
    if (!ttf) ttf = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, b64(v)]));
    pdf.registerFontkit(fontkit);
    const E = w => pdf.embedFont(ttf[w], { subset: true });
    const F = { r: await E(500), m: await E(600), b: await E(700), x: await E(800), i: await E(500), bi: await E(700), brand: true };
    ITAL.add(F.i); ITAL.add(F.bi);
    return F;
  }
  const italic = f => ITAL.has(f);
  /* intestazione e piè di pagina dei PDF prodotti da Officina: barretta rossa, logo, titolo, numero di pagina */
  function decorate(pdf, F, { label = '', ml = 42, mr = 42, foot = 30 } = {}) {
    const pages = pdf.getPages(), N = pages.length;
    const ink = rgbHex(C.ink), mute = rgbHex(C.muted), line = rgbHex(C.line), acc = rgbHex(C.accent);
    const fit = (t, f, s, w) => { t = pdfSafe(f, t); while (t.length > 4 && f.widthOfTextAtSize(t, s) > w) t = t.slice(0, -2).replace(/\s*$/, '') + '…'; return t; };
    pages.forEach((p, i) => {
      const { width: W, height: H } = p.getSize();
      p.drawRectangle({ x: 0, y: H - 3.5, width: W, height: 3.5, color: acc });
      drawLogo(p, ml, H - 13, 13);
      p.drawText('file', { x: ml + 18, y: H - 23.2, size: 8, font: F.x, color: ink });
      p.drawText('360', { x: ml + 18 + F.x.widthOfTextAtSize('file', 8), y: H - 23.2, size: 8, font: F.x, color: acc });
      if (label) { const t = fit(label, F.r, 7.5, W - ml - mr - 120); p.drawText(t, { x: W - mr - F.r.widthOfTextAtSize(t, 7.5), y: H - 23, size: 7.5, font: F.r, color: mute }); }
      p.drawLine({ start: { x: ml, y: foot + 10 }, end: { x: W - mr, y: foot + 10 }, thickness: 0.5, color: line });
      const pn = `Pagina ${i + 1} di ${N}`;
      p.drawText(pn, { x: W - mr - F.m.widthOfTextAtSize(pn, 7.5), y: foot, size: 7.5, font: F.m, color: ink });
      p.drawText(fit(IS_SITE ? 'Creato con file360' : 'Creato con file360, sul tuo dispositivo', F.r, 7, W / 2), { x: ml, y: foot, size: 7, font: F.r, color: mute });
    });
    pdf.setProducer('file360'); pdf.setCreator('file360'); pdf.setLanguage('it-IT');
  }
  /* —— in Excel —— */
  const XL = { font: 'Instrument Sans', head: C.ink, headInk: '#FFFFFF', accent: C.accent, band: C.surface2, soft: C.soft, muted: C.muted, line: C.line2 };
  return { C, logoSvg, spinnerSvg, favicon, drawLogo, pdfFonts, italic, rgbHex, XL, hexPath, decorate, ORBIT };
})();
