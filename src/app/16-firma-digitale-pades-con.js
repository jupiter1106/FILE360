/* ---------- firma digitale PAdES con certificato .p12 / .pfx (tutto nel browser) ---------- */
const PadesSign = (() => {
  const toBin = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return s; };
  const SIG_LEN = 24576;   // spazio per la firma (byte): certificato, catena e attributi
  async function loadP12(bytes, password) {
    await need('forge');
    let p12 = null, err = null;
    const asn1 = forge.asn1.fromDer(toBin(bytes), { strict: false });
    for (const pw of [password, password === '' ? null : undefined].filter(x => x !== undefined)) { try { p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, pw); break; } catch (e) { err = e; } }
    if (!p12) throw codedError(/mac|password|invalid/i.test(err?.message || '') ? 'Password del certificato non corretta.' : 'Il file del certificato non è leggibile (serve un .p12 o .pfx).', 'CERT');
    const keys = [], certs = [];
    for (const sc of p12.safeContents) for (const bag of sc.safeBags) { if (bag.key) keys.push(bag.key); if (bag.cert) certs.push(bag.cert); }
    if (!keys.length) throw new Error('Nel certificato non c’è la chiave privata: serve il file .p12/.pfx completo.');
    const key = keys[0], cert = certs.find(c => c.publicKey?.n && c.publicKey.n.equals(key.n)) || certs[0];
    if (!cert) throw new Error('Nel file non c’è il certificato del firmatario.');
    const cn = cert.subject.getField('CN')?.value || cert.subject.attributes.map(a => a.value).join(', ');
    const now = new Date();
    return { key, cert, chain: certs.filter(c => c !== cert), name: cn, expired: cert.validity.notAfter < now, notAfter: cert.validity.notAfter };
  }
  async function sign(bytes, cred, { reason = 'Firma del documento', location = '', visible = false } = {}) {
    await need('forge');
    const { PDFName, PDFString, PDFHexString, PDFNumber, PDFArray } = PDFLib;
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = pdf.context, pages = pdf.getPages(), page = pages[pages.length - 1];
    if (visible) {
      const font = await pdf.embedFont(StandardFonts.Helvetica), { width } = page.getSize();
      const lines = [`Firmato digitalmente da ${cred.name}`, `il ${new Date().toLocaleString('it-IT')}`];
      const w = Math.max(...lines.map(l => font.widthOfTextAtSize(pdfSafe(font, l), 7.5))) + 12;
      page.drawRectangle({ x: width - w - 24, y: 20, width: w, height: 26, borderColor: rgb(0.2, 0.3, 0.55), borderWidth: 0.6, color: rgb(1, 1, 1), opacity: 0.92 });
      lines.forEach((l, i) => page.drawText(pdfSafe(font, l), { x: width - w - 18, y: 37 - i * 10, size: 7.5, font, color: rgb(0.15, 0.22, 0.45) }));
    }
    const br = PDFArray.withContext(ctx); br.push(PDFNumber.of(0)); for (let i = 0; i < 3; i++) br.push(PDFName.of('**********'));
    const sig = ctx.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached', ByteRange: br, Contents: PDFHexString.of('0'.repeat(SIG_LEN * 2)),
      Reason: PDFString.of(reason), M: PDFString.fromDate(new Date()), Name: PDFString.of(cred.name), ...(location ? { Location: PDFString.of(location) } : {}) });
    const sigRef = ctx.register(sig);
    const form = pdf.getForm(); const n = form.getFields().filter(f => f.constructor.name === 'PDFSignature').length + 1;
    const widget = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], V: sigRef, T: PDFString.of(`Firma${n}`), F: 132, P: page.ref });
    const wRef = ctx.register(widget);
    const annots = page.node.lookup(PDFName.of('Annots')); if (annots instanceof PDFArray) annots.push(wRef); else page.node.set(PDFName.of('Annots'), ctx.obj([wRef]));
    const af = form.acroForm.dict; let fields = af.lookup(PDFName.of('Fields')); if (!(fields instanceof PDFArray)) { fields = ctx.obj([]); af.set(PDFName.of('Fields'), fields); } fields.push(wRef);
    af.set(PDFName.of('SigFlags'), PDFNumber.of(3));
    const out = await pdf.save({ useObjectStreams: false, updateFieldAppearances: false });
    // posizione dello spazio per la firma e intervalli firmati (ByteRange)
    const s = new TextDecoder('latin1').decode(out);
    const ph = '<' + '0'.repeat(SIG_LEN * 2) + '>', c0 = s.indexOf(ph);
    const brm = /\/ByteRange\s*\[\s*0\s+\/\*{10}\s+\/\*{10}\s+\/\*{10}\s*\]/.exec(s);
    if (c0 < 0 || !brm) throw new Error('Firma: struttura del PDF inattesa.');
    const c1 = c0 + ph.length, range = [0, c0, c1, out.length - c1];
    let brs = `/ByteRange [${range.join(' ')}]`; if (brs.length > brm[0].length) throw new Error('Firma: documento troppo grande.'); brs = brs.padEnd(brm[0].length, ' ');
    out.set(new TextEncoder().encode(brs), brm.index);
    const data = new Uint8Array(range[1] + range[3]); data.set(out.subarray(0, c0), 0); data.set(out.subarray(c1), c0);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(toBin(data));
    p7.addCertificate(cred.cert); cred.chain.forEach(c => p7.addCertificate(c));
    p7.addSigner({ key: cred.key, certificate: cred.cert, digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
    p7.sign({ detached: true });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    let hex = ''; for (let i = 0; i < der.length; i++) hex += der.charCodeAt(i).toString(16).padStart(2, '0');
    if (hex.length > SIG_LEN * 2) throw new Error('Firma: certificato troppo grande.');
    out.set(new TextEncoder().encode(hex), c0 + 1);
    return out;
  }
  return { loadP12, sign };
})();

const Ricette = (() => {
  const K = 'officina.ricette2', KOLD = 'officina.ricette';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch { return null; } };
  const store = a => { try { localStorage.setItem(K, JSON.stringify(a)); } catch (e) { Errors.show(e); } changed(); };
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch { } });
  const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  /* —— i passaggi possibili —— */
  const BOLLO = 'Imposta di bollo assolta in modo virtuale ai sensi del D.M. 17 giugno 2014 - euro 2,00';
  const S = {
    compress: { label: 'Comprimi', icon: 'compress', group: 'Peso e formato', def: { mode: 'media', mb: 5 }, desc: p => p.mode === 'target' ? `sotto ${p.mb} MB` : { leggera: 'leggera, qualità alta', media: 'media', forte: 'forte, file piccolissimi' }[p.mode] },
    merge: { label: 'Unisci in un solo PDF', icon: 'merge', group: 'Pagine', many: true, def: { order: 'nome', name: '{ricetta} {data}' }, desc: p => `in ordine ${p.order === 'nome' ? 'di nome' : 'di caricamento'} · «${p.name}»` },
    stamp: { label: 'Timbro o dicitura (marca da bollo)', icon: 'seal', group: 'Aggiungi', def: { text: BOLLO, pos: 'tr', pages: 'first', size: 8, box: true }, desc: p => `«${p.text.slice(0, 40)}${p.text.length > 40 ? '…' : ''}» · ${POS[p.pos]} · ${PG[p.pages]}` },
    numbers: { label: 'Numeri di pagina', icon: 'hash', group: 'Aggiungi', def: { format: 'Pagina {n} di {N}', pos: 'bc', size: 9 }, desc: p => `«${p.format}» · ${POS[p.pos]}` },
    watermark: { label: 'Filigrana', icon: 'type', group: 'Aggiungi', def: { text: 'COPIA', opacity: 15 }, desc: p => `«${p.text}» al ${p.opacity}%` },
    orient: { label: 'Raddrizza le pagine', icon: 'rotate', group: 'Pagine', def: {}, desc: () => 'capovolte o di lato' },
    a4: { label: 'Tutte le pagine in A4', icon: 'layout', group: 'Pagine', def: {}, desc: () => 'formati diversi portati in A4' },
    ocr: { label: 'Rendi ricercabile (OCR)', icon: 'ocr', group: 'Peso e formato', def: {}, desc: () => 'solo le pagine senza testo' },
    pdfa: { label: 'Converti in PDF/A', icon: 'pdfa', group: 'Peso e formato', def: { part: 1 }, desc: p => `PDF/A-${p.part}b` },
    flatten: { label: 'Blocca i campi compilati', icon: 'form', group: 'Sicurezza', def: {}, desc: () => 'i valori diventano parte della pagina' },
    clean: { label: 'Togli i metadati', icon: 'eraser', group: 'Sicurezza', def: {}, desc: () => 'autore, programmi, dati nascosti' },
    protect: { label: 'Proteggi con password', icon: 'key', group: 'Sicurezza', def: {}, desc: () => 'la password si chiede a ogni esecuzione' },
    name: { label: 'Rinomina', icon: 'type', group: 'Nome', def: { pattern: '{nome}' }, desc: p => `«${p.pattern}»` },
  };
  const POS = { tl: 'in alto a sinistra', tc: 'in alto al centro', tr: 'in alto a destra', bl: 'in basso a sinistra', bc: 'in basso al centro', br: 'in basso a destra' };
  const PG = { first: 'prima pagina', last: 'ultima pagina', all: 'tutte le pagine' };
  const TEMPLATES = [
    { name: 'Chiusura mensile fatture', steps: [{ id: 'compress', p: { mode: 'media' } }, { id: 'merge', p: { order: 'nome', name: 'Fatture {mese}' } }, { id: 'stamp', p: { text: BOLLO, pos: 'tr', pages: 'first', size: 8, box: true } }] },
    { name: 'Pronto per PEC', steps: [{ id: 'orient', p: {} }, { id: 'ocr', p: {} }, { id: 'pdfa', p: { part: 1 } }] },
    { name: 'Archivio ricercabile', steps: [{ id: 'orient', p: {} }, { id: 'ocr', p: {} }, { id: 'pdfa', p: { part: 2 } }, { id: 'name', p: { pattern: '{contenuto}' } }] },
    { name: 'Invio riservato', steps: [{ id: 'flatten', p: {} }, { id: 'clean', p: {} }, { id: 'protect', p: {} }] },
  ];
  // la prima volta: le ricette create con «Fai tutto tu» passano qui
  function list() {
    let a = load();
    if (!a) {
      a = [];
      try { for (const r of JSON.parse(localStorage.getItem(KOLD)) || []) a.push({ id: r.id || newId(), name: r.name, at: r.at || Date.now(), steps: (r.steps || []).filter(id => S[id]).map(id => ({ id, p: id === 'compress' ? { mode: 'target', mb: r.mb || 5 } : { ...S[id].def } })) }); } catch { }
      try { localStorage.setItem(K, JSON.stringify(a)); } catch { }
    }
    // (passaggi non più disponibili, es. la firma digitale: si tralasciano)
    return a.map(r => ({ ...r, steps: (r.steps || []).filter(x => S[x.id]) }));
  }
  const get = id => list().find(r => r.id === id);
  function save(r) { const a = list().filter(x => x.id !== r.id); const rec = { ...r, id: r.id || newId(), at: r.at || Date.now(), upd: Date.now() }; a.unshift(rec); store(a.slice(0, 60)); return rec; }
  function remove(id) { store(list().filter(r => r.id !== id)); Store.del('ripresa', 'dir:' + id).catch(() => {}); }
  const stepsText = r => r.steps.map(s => S[s.id]?.label || s.id).join(' → ');

  /* —— esecuzione —— */
  const pad = n => String(n).padStart(2, '0');
  function fill(pattern, { nome = '', ricetta = '', n = 1, contenuto = '' } = {}) {
    const d = new Date(), mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return String(pattern || '{nome}').replace(/\{nome\}/g, nome).replace(/\{ricetta\}/g, ricetta).replace(/\{data\}/g, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
      .replace(/\{mese\}/g, `${mesi[pm.getMonth()]} ${pm.getFullYear()}`).replace(/\{anno\}/g, String(d.getFullYear())).replace(/\{n\}/g, String(n)).replace(/\{contenuto\}/g, contenuto || nome)
      .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'documento';
  }
  async function toPdf(f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (isPdf(f) && !isImage(f)) {
      if (typeof FirmaKit !== 'undefined' && !FirmaKit.isPdf(bytes)) { const r = await FirmaKit.open(bytes, f.name); if (r.signed && r.type.ext === 'pdf') return { name: stripExt(r.name), bytes: r.content }; }
      return { name: stripExt(f.name), bytes };
    }
    const pdf = await PDFDocument.create(), img = await embedImageFile(pdf, f);
    const pg = pdf.addPage([img.width * 0.75, img.height * 0.75]); pg.drawImage(img, { x: 0, y: 0, width: pg.getWidth(), height: pg.getHeight() });
    return { name: stripExt(f.name), bytes: await pdf.save() };
  }
  async function drawOnPages(bytes, which, fn) {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = pdf.getPages(), N = pages.length, font = await pdf.embedFont(StandardFonts.Helvetica);
    const idx = which === 'first' ? [0] : which === 'last' ? [N - 1] : pages.map((_, i) => i);
    for (const i of idx) {
      const pg = pages[i], rot = ((pg.getRotation().angle % 360) + 360) % 360, { width, height } = pg.getSize();
      // in coordinate della pagina come si vede (anche se è ruotata)
      const W = rot % 180 ? height : width, H = rot % 180 ? width : height;
      const at = (x, y) => rot === 90 ? [y, width - x] : rot === 180 ? [width - x, height - y] : rot === 270 ? [height - y, x] : [x, y];
      fn({ pg, font, W, H, at, rot, n: i + 1, N });
    }
    return pdf.save({ useObjectStreams: true });
  }
  function place(pos, W, H, w, h, m = 24) {
    const x = pos[1] === 'l' ? m : pos[1] === 'c' ? (W - w) / 2 : W - w - m;
    const y = pos[0] === 't' ? H - m - h : m;
    return [x, y];
  }
  const textAt = (ctx, s, x, y, size, opts = {}) => { const [px, py] = ctx.at(x, y); ctx.pg.drawText(s, { x: px, y: py, size, font: ctx.font, rotate: degrees(ctx.rot), color: opts.color || rgb(0.12, 0.13, 0.16), opacity: opts.opacity ?? 1 }); };
  async function stamp(bytes, p) {
    return drawOnPages(bytes, p.pages, ctx => {
      const size = +p.size || 8, lines = String(p.text || '').split('\n').map(l => pdfSafe(ctx.font, l.trim())).filter(Boolean);
      const lh = size * 1.25, w = Math.min(ctx.W - 48, Math.max(...lines.map(l => ctx.font.widthOfTextAtSize(l, size)))) + (p.box ? 14 : 0), hh = lines.length * lh + (p.box ? 10 : 0);
      const [x, y] = place(p.pos, ctx.W, ctx.H, w, hh);
      if (p.box) { const [rx, ry] = ctx.at(x, y); ctx.pg.drawRectangle({ x: rx, y: ry, width: w, height: hh, rotate: degrees(ctx.rot), borderColor: rgb(0.25, 0.27, 0.32), borderWidth: 0.7, color: rgb(1, 1, 1), opacity: 0.9 }); }
      lines.forEach((l, i) => textAt(ctx, l, x + (p.box ? 7 : 0), y + hh - (p.box ? 5 : 0) - (i + 1) * lh + size * 0.25, size));
    });
  }
  async function numbers(bytes, p) {
    return drawOnPages(bytes, 'all', ctx => {
      const s = pdfSafe(ctx.font, String(p.format || '{n}').replace(/\{n\}/g, ctx.n).replace(/\{N\}/g, ctx.N)), size = +p.size || 9, w = ctx.font.widthOfTextAtSize(s, size);
      const [x, y] = place(p.pos, ctx.W, ctx.H, w, size, 18); textAt(ctx, s, x, y, size, { color: rgb(0.25, 0.25, 0.28) });
    });
  }
  async function watermark(bytes, p) {
    return drawOnPages(bytes, 'all', ctx => {
      const s = pdfSafe(ctx.font, p.text || 'COPIA'), size = Math.min(ctx.W, ctx.H) / Math.max(4, s.length * 0.62), w = ctx.font.widthOfTextAtSize(s, size);
      const a = Math.atan2(ctx.H, ctx.W), cx = ctx.W / 2 - Math.cos(a) * w / 2 + Math.sin(a) * size / 3, cy = ctx.H / 2 - Math.sin(a) * w / 2 - Math.cos(a) * size / 3;
      const [px, py] = ctx.at(cx, cy);
      ctx.pg.drawText(s, { x: px, y: py, size, font: ctx.font, rotate: degrees(ctx.rot + a * 180 / Math.PI), color: rgb(0.55, 0.1, 0.1), opacity: (+p.opacity || 15) / 100 });
    });
  }
  async function merge(docs, p, r) {
    const list = p.order === 'nome' ? [...docs].sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true })) : docs;
    const out = await PDFDocument.create();
    for (const d of list) { Busy.check(); const src = await PDFDocument.load(d.bytes, { ignoreEncryption: true, updateMetadata: false }); (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg)); }
    return [{ name: fill(p.name || '{ricetta} {data}', { ricetta: r.name, nome: list[0]?.name }), bytes: await out.save({ useObjectStreams: true }), did: [`${plural(list.length, 'file unito', 'file uniti')}`] }];
  }
  // esegue la ricetta sui file: ogni passaggio su ogni documento (l'unione li riduce a uno)
  async function run(r, files, ctx = {}) {
    let docs = [];
    for (const [i, f] of files.entries()) { Busy.set(0, `Lettura di ${f.name}`); try { docs.push({ ...(await toPdf(f)), did: [] }); } catch (e) { ctx.notes?.push(`${f.name}: ${Errors.explain(e).text}`); } }
    if (!docs.length) throw codedError('Nessun file utilizzabile: servono PDF o immagini.', 'FORMAT');
    let worker = null; const getWorker = async () => worker ||= await makeOcrWorker(new Set(['ita']), 300);
    try {
      const steps = r.steps.filter(s => S[s.id]);
      for (const [k, s] of steps.entries()) {
        const p = { ...S[s.id].def, ...(s.p || {}) };
        if (s.id === 'merge') { Busy.set(k / steps.length, S.merge.label); const prev = docs.flatMap(x => x.did).filter((v, i, a) => a.indexOf(v) === i); docs = (await merge(docs, p, r)).map(d => ({ ...d, did: [...prev, ...d.did] })); continue; }
        for (const [i, d] of docs.entries()) {
          Busy.check();
          const frac = x => Busy.set((k + (i + (x || 0)) / docs.length) / steps.length, `${d.name} · ${S[s.id].label}`); frac(0);
          let b = d.bytes;
          if (s.id === 'compress') { const before = b.length; if (p.mode === 'target') b = (await Pipeline.compressTo(b, (+p.mb || 5) * 1048576, frac)).bytes; else { const lv = Pipeline.LEVELS[{ leggera: 0, media: 2, forte: 4 }[p.mode] ?? 2]; const res = await Pipeline.shrinkImages(b, lv, frac); if (res.bytes.length < b.length) b = res.bytes; } d.did.push(b.length < before ? `da ${fmtSize(before)} a ${fmtSize(b.length)}` : 'peso già minimo'); }
          else if (s.id === 'stamp') { b = await stamp(b, p); d.did.push('dicitura aggiunta'); }
          else if (s.id === 'numbers') { b = await numbers(b, p); d.did.push('pagine numerate'); }
          else if (s.id === 'watermark') { b = await watermark(b, p); d.did.push('filigrana'); }
          else if (s.id === 'orient') { const res = await Pipeline.orient(b, getWorker, frac); b = res.bytes; if (res.n) d.did.push(`${plural(res.n, 'pagina raddrizzata', 'pagine raddrizzate')}`); }
          else if (s.id === 'a4') { const res = await Pipeline.a4(b); b = res.bytes; if (res.n) d.did.push('pagine in A4'); }
          else if (s.id === 'ocr') { const res = await Pipeline.ocr(b, d.name + '.pdf', getWorker, frac); b = res.bytes; if (res.n) d.did.push(`OCR su ${plural(res.n, 'pagina', 'pagine')}`); }
          else if (s.id === 'pdfa') { const res = await Pipeline.pdfa(b, d.name + '.pdf', +p.part || 1, frac); b = res.bytes; d.did.push(`PDF/A-${p.part || 1}b`); }
          else if (s.id === 'flatten') { b = await Pipeline.flatten(b); d.did.push('campi bloccati'); }
          else if (s.id === 'clean') { b = await Pipeline.clean(b); d.did.push('metadati tolti'); }
          else if (s.id === 'protect') { if (!ctx.pw) throw new Error('Manca la password per proteggere i file.'); b = await PdfCrypt.encrypt(b, { userPw: ctx.pw, ownerPw: ctx.pw }); d.did.push('protetto con password'); }
          else if (s.id === 'sign') { if (!ctx.cred) throw new Error('Manca il certificato per la firma.'); b = await PadesSign.sign(b, ctx.cred, { reason: p.reason, visible: !!p.visible }); d.did.push(`firmato da ${ctx.cred.name}`); }
          else if (s.id === 'name') { const cont = /\{contenuto\}/.test(p.pattern) && typeof AutoName !== 'undefined' ? await AutoName.propose(b).catch(() => null) : null; d.name = fill(p.pattern, { nome: d.name, ricetta: r.name, n: i + 1, contenuto: cont }); d.did.push('rinominato'); }
          d.bytes = b;
        }
      }
    } finally { try { (await worker)?.terminate?.(); } catch { } }
    // la firma va per ultima: un passaggio dopo la firma la renderebbe non valida
    const iSign = r.steps.findIndex(s => s.id === 'sign');
    if (iSign >= 0 && r.steps.slice(iSign + 1).some(s => !['name'].includes(s.id))) ctx.notes?.push('Attenzione: ci sono passaggi dopo la firma, che la rendono non valida. Sposta la firma in fondo.');
    const used = new Set();
    return docs.map(d => { let n = AutoName.clean ? AutoName.clean(d.name) : d.name, k = 2; while (used.has(n.toLowerCase())) n = `${d.name} (${k++})`; used.add(n.toLowerCase()); return { name: n + '.pdf', bytes: d.bytes, info: d.did.join(' · ') || 'nessuna modifica necessaria' }; });
  }

  /* —— cartelle (File System Access, dove il browser lo permette) —— */
  const canDir = () => typeof window.showDirectoryPicker === 'function' && !IS_ARTIFACT && !IS_IOS;
  const ACCEPT = /\.(pdf|p7m|jpe?g|png|heic|heif|tiff?|webp)$/i;
  async function readDir(dir, depth = 0, base = '') {
    const out = [];
    for await (const [name, hd] of dir.entries()) {
      if (hd.kind === 'file' && ACCEPT.test(name)) out.push(await hd.getFile());
      else if (hd.kind === 'directory' && depth < 1 && !/^(Officina|file360) - /.test(name)) out.push(...await readDir(hd, depth + 1, base + name + '/'));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
  }
  async function permit(dir) { try { if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true; return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; } }
  async function writeOut(dir, sub, outs) {
    const d = await dir.getDirectoryHandle(sub, { create: true });
    for (const o of outs) { const fh = await d.getFileHandle(o.name, { create: true }); const w = await fh.createWritable(); await w.write(o.bytes); await w.close(); }
    return d.name;
  }
  const savedDir = id => Store.get('ripresa', 'dir:' + id).catch(() => null);
  const keepDir = (id, dir) => Store.put('ripresa', dir, 'dir:' + id).catch(() => {});

  /* —— prima di eseguire: password e certificato (mai salvati) —— */
  function askSecrets(r) {
    const needPw = r.steps.some(s => s.id === 'protect'), needCert = r.steps.some(s => s.id === 'sign');
    if (!needPw && !needCert) return Promise.resolve({});
    return new Promise(res => {
      let done = false, certFile = null;
      const fin = v => { if (done) return; done = true; m.close(); res(v); };
      const pw = h('input', { class: 'input rc-pw', type: 'text', placeholder: 'La password che servirà per aprirli' });
      const certInp = h('input', { type: 'file', accept: '.p12,.pfx', hidden: true, onchange: () => { certFile = certInp.files[0] || null; certName.textContent = certFile ? certFile.name : 'Nessun certificato scelto'; } });
      const certName = h('span', { class: 'muted small' }, 'Nessun certificato scelto');
      const certPw = h('input', { class: 'input rc-certpw', type: 'password', placeholder: 'Password (PIN) del certificato', autocomplete: 'off' });
      const err = h('div', { class: 'err-text' });
      const go = async () => {
        const out = {};
        if (needPw) { if (!pw.value) { err.textContent = 'Scegli la password per proteggere i file.'; return; } out.pw = pw.value; }
        if (needCert) {
          if (!certFile) { err.textContent = 'Scegli il file del certificato (.p12 o .pfx).'; return; }
          try { out.cred = await PadesSign.loadP12(new Uint8Array(await certFile.arrayBuffer()), certPw.value); }
          catch (e) { err.textContent = e.message || Errors.explain(e).text; return; }
          if (out.cred.expired) { err.textContent = `Il certificato di ${out.cred.name} è scaduto il ${out.cred.notAfter.toLocaleDateString('it-IT')}.`; return; }
        }
        fin(out);
      };
      const m = modal([h('h3', {}, 'Prima di iniziare'),
        needPw ? h('label', { class: 'field' }, 'Password da mettere ai file prodotti', pw) : null,
        needCert ? h('div', { class: 'field' }, h('span', {}, 'Certificato di firma digitale'), h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('button', { class: 'btn sm rc-cert', onclick: () => certInp.click() }, ic('upload', 15), 'Scegli .p12 / .pfx'), certName, certInp), certPw,
          h('p', { class: 'muted small' }, 'Il certificato e la password restano sul dispositivo e non vengono salvati: servono solo per questa esecuzione.')) : null,
        err, h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => fin(null) }, 'Annulla'), h('button', { class: 'btn primary rc-go', onclick: go }, 'Continua'))], { width: 460, onClose: () => fin(null) });
    });
  }
  // esecuzione completa: chiede i segreti, lavora in coda (con barra e tempo rimanente), consegna
  async function execute(r, files, { dir = null, toDir = false } = {}) {
    if (!files.length) return toast('Nessun file da elaborare', 'error');
    const sec = await askSecrets(r); if (!sec) return;
    const notes = [];
    CURRENT_INPUT = [...files];
    const outs = await withBusy(`Ricetta «${r.name}»…`, () => run(r, files, { ...sec, notes }), { job: true, cancellable: true, subject: `${r.name} · ${plural(files.length, 'file', 'file')}`, bytes: files.reduce((a, f) => a + f.size, 0) });
    if (!outs) return;
    const all = list(); const rec = all.find(x => x.id === r.id); if (rec) { rec.runs = (rec.runs || 0) + 1; rec.last = Date.now(); store(all); }
    let note = notes.join(' ');
    if (toDir && dir) {
      try { const sub = `file360 - ${fill(r.name)} - ${fill('{data}')} ${pad(new Date().getHours())}${pad(new Date().getMinutes())}`; await writeOut(dir, sub, outs); note = `Salvati anche nella cartella «${dir.name}/${sub}». ` + note; }
      catch (e) { note = `Non è stato possibile scrivere nella cartella (${Errors.explain(e).text}): scaricali da qui. ` + note; }
    }
    showResult(outs, { title: outs.length > 1 ? `Ricetta «${r.name}»: file pronti` : `Ricetta «${r.name}»: file pronto`, zipName: fill(r.name) + '.zip', note: note || undefined, noNext: outs.length > 1 });
  }

  /* —— editor —— */
  function editor(r0, onSaved) {
    const r = r0 ? JSON.parse(JSON.stringify(r0)) : { name: '', steps: [] };
    r.steps = r.steps.filter(s => S[s.id]).map(s => ({ id: s.id, p: { ...S[s.id].def, ...(s.p || {}) } }));
    const nameIn = h('input', { class: 'input rc-name', value: r.name, placeholder: 'Es. Chiusura mensile', oninput: () => { r.name = nameIn.value; } });
    const stepsEl = h('div', { class: 'rc-steps' });
    const field = (label, el) => h('label', { class: 'rc-f' }, h('span', {}, label), el);
    const sel = (opts, v, on) => h('select', { class: 'input', onchange: e => on(e.target.value) }, Object.entries(opts).map(([k, l]) => h('option', { value: k, selected: k === v }, l)));
    const num = (v, on, min = 1, max = 100, step = 1) => h('input', { class: 'input', type: 'number', min, max, step, value: v, onchange: e => on(+e.target.value) });
    const txt = (v, on, ph = '') => h('input', { class: 'input', value: v, placeholder: ph, oninput: e => on(e.target.value) });
    function params(s) {
      const p = s.p, set = k => v => { p[k] = v; draw(false); };
      switch (s.id) {
        case 'compress': return [field('Quanto', sel({ leggera: 'Leggera (qualità alta)', media: 'Media', forte: 'Forte', target: 'Sotto un peso massimo' }, p.mode, v => { p.mode = v; draw(); })), p.mode === 'target' ? field('MB', num(p.mb, set('mb'), 0.2, 500, 0.5)) : null];
        case 'merge': return [field('Ordine', sel({ nome: 'Per nome del file', arrivo: 'Come caricati' }, p.order, set('order'))), field('Nome del file unito', txt(p.name, set('name'), '{ricetta} {data}'))];
        case 'stamp': return [h('label', { class: 'rc-f wide' }, h('span', {}, 'Testo (anche su più righe)'), h('textarea', { class: 'input', rows: 2, oninput: e => { p.text = e.target.value; } }, p.text)),
          h('div', { class: 'rc-presets' }, h('span', { class: 'muted small' }, 'Pronti:'), ...[['Marca da bollo virtuale', BOLLO], ['Copia conforme', 'Copia conforme all’originale'], ['Pagato', 'PAGATO il {data}'], ['Ricevuto', 'Ricevuto il {data}']].map(([l, t]) => h('button', { class: 'chip', onclick: () => { p.text = t; draw(); } }, l))),
          field('Posizione', sel(POS, p.pos, set('pos'))), field('Pagine', sel(PG, p.pages, set('pages'))), field('Corpo', num(p.size, set('size'), 5, 30)), h('label', { class: 'rc-f chk' }, h('input', { type: 'checkbox', checked: p.box, onchange: e => { p.box = e.target.checked; } }), h('span', {}, 'Con riquadro'))];
        case 'numbers': return [field('Formato', txt(p.format, set('format'), 'Pagina {n} di {N}')), field('Posizione', sel(POS, p.pos, set('pos'))), field('Corpo', num(p.size, set('size'), 5, 24))];
        case 'watermark': return [field('Testo', txt(p.text, set('text'), 'COPIA')), field('Intensità %', num(p.opacity, set('opacity'), 5, 60))];
        case 'pdfa': return [field('Livello', sel({ 1: 'PDF/A-1b (PEC, PA)', 2: 'PDF/A-2b' }, String(p.part), v => { p.part = +v; }))];
        case 'sign': return [field('Motivo', txt(p.reason, set('reason'))), h('label', { class: 'rc-f chk' }, h('input', { type: 'checkbox', checked: p.visible, onchange: e => { p.visible = e.target.checked; } }), h('span', {}, 'Riquadro «Firmato digitalmente da…» sull’ultima pagina'))];
        case 'name': return [field('Nome', txt(p.pattern, set('pattern'), '{nome}')), h('span', { class: 'muted small rc-help' }, 'Puoi usare {nome}, {data}, {mese}, {anno}, {n}, {contenuto} (letto dal documento).')];
        default: return [];
      }
    }
    function draw(full = true) {
      if (!full) return;
      stepsEl.replaceChildren(...(r.steps.length ? r.steps.map((s, i) => h('div', { class: 'rc-step' },
        h('div', { class: 'rc-sh' }, h('span', { class: 'as-n' }, i + 1), h('span', { class: 'as-si' }, ic(S[s.id].icon, 16)), h('b', {}, S[s.id].label),
          h('span', { class: 'rc-sa' }, iconBtn('chevron', 'Sposta su', () => { if (i) { [r.steps[i - 1], r.steps[i]] = [r.steps[i], r.steps[i - 1]]; draw(); } }, 'icon-btn rc-up'), iconBtn('chevron', 'Sposta giù', () => { if (i < r.steps.length - 1) { [r.steps[i + 1], r.steps[i]] = [r.steps[i], r.steps[i + 1]]; draw(); } }, 'icon-btn rc-down'), iconBtn('x', 'Togli il passaggio', () => { r.steps.splice(i, 1); draw(); }))),
        h('div', { class: 'rc-params' }, params(s)))) : [h('div', { class: 'muted small rc-empty' }, 'Aggiungi i passaggi nell’ordine in cui vanno fatti.')]));
      warn.textContent = r.steps.findIndex(s => s.id === 'sign') >= 0 && r.steps.slice(r.steps.findIndex(s => s.id === 'sign') + 1).some(s => s.id !== 'name') ? 'La firma deve essere l’ultimo passaggio: quelli dopo la renderebbero non valida.' : '';
    }
    const warn = h('div', { class: 'hint warn rc-warn' });
    const groups = [...new Set(Object.values(S).map(s => s.group))];
    const add = h('div', { class: 'rc-add' }, groups.map(g => h('div', { class: 'rc-ag' }, h('span', { class: 'muted small' }, g), h('div', { class: 'chips' }, Object.entries(S).filter(([, s]) => s.group === g).map(([id, s]) => h('button', { class: 'chip', dataset: { step: id }, onclick: () => { r.steps.push({ id, p: { ...s.def } }); draw(); } }, ic(s.icon, 14), s.label))))));
    const m = modal([h('h3', {}, r0?.id ? 'Modifica la ricetta' : 'Nuova ricetta'), field('Nome', nameIn), h('div', { class: 'sec-t' }, 'Passaggi'), stepsEl, warn, h('div', { class: 'sec-t' }, 'Aggiungi un passaggio'), add,
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', marginTop: '14px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Annulla'),
        h('button', { class: 'btn primary rc-save', onclick: () => { if (!r.name.trim()) { nameIn.focus(); return toast('Dai un nome alla ricetta', 'error'); } if (!r.steps.length) return toast('Aggiungi almeno un passaggio', 'error'); const saved = save({ ...r, name: r.name.trim() }); m.close(); toast(`Ricetta «${saved.name}» salvata`); onSaved?.(saved); } }, 'Salva la ricetta'))], { width: 680 });
    draw();
  }

  /* —— la pagina —— */
  function render(body) {
    const filesIn = h('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.p7m,' + IMG_ACCEPT });
    const dirIn = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: '', directory: '' });
    async function chooseFiles(r) { filesIn.onchange = () => { const f = [...filesIn.files].filter(x => ACCEPT.test(x.name)); filesIn.value = ''; if (f.length) execute(r, f); }; filesIn.click(); }
    async function chooseDir(r, again = false) {
      if (canDir()) {
        let dir = again ? await savedDir(r.id) : null;
        try { if (!dir) dir = await window.showDirectoryPicker({ id: 'officina-ricette', mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') Errors.show(e); return; }
        if (!(await permit(dir))) return toast('Senza il permesso sulla cartella non posso leggere i file', 'error');
        keepDir(r.id, dir);
        const files = await withBusy('Lettura della cartella…', () => readDir(dir));
        if (!files) return;
        if (!files.length) return toast(`Nella cartella «${dir.name}» non ci sono PDF o immagini`, 'error');
        return execute(r, files, { dir, toDir: true });
      }
      dirIn.onchange = () => { const f = [...dirIn.files].filter(x => ACCEPT.test(x.name) && !/(^|\/)(Officina|file360) - /.test(x.webkitRelativePath || '')); dirIn.value = ''; if (f.length) execute(r, f); else toast('Nella cartella non ci sono PDF o immagini', 'error'); };
      dirIn.click();
    }
    const listEl = h('div', { class: 'rc-list' });
    const tpl = h('div', { class: 'rc-tpl' });
    /* file (o cartelle) trascinati sopra una ricetta: si esegue su quelli, come con «Esegui su file» */
    const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
    const dropFiles = async e => (typeof filesFromDrop === 'function' ? await filesFromDrop(e.dataTransfer) : [...e.dataTransfer.files]).filter(x => ACCEPT.test(x.name) && !/(^|\/)(Officina|file360) - /.test(x.webkitRelativePath || x._path || ''));
    function dropRun(r, card) {
      card.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); card.classList.add('dropping'); } });
      card.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch { /* niente */ } card.classList.add('dropping'); });
      card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('dropping'); });
      card.addEventListener('drop', async e => {
        if (!hasFiles(e)) return;
        e.preventDefault(); card.classList.remove('dropping');   // la pagina vede defaultPrevented e non fa altro
        const f = await dropFiles(e);
        if (!f.length) return toast('Fra i file trascinati non ci sono PDF o immagini', 'error');
        execute(r, f);
      });
      return card;
    }
    async function draw() {
      const all = list();
      const dirs = await Promise.all(all.map(r => canDir() ? savedDir(r.id) : null));
      listEl.replaceChildren(...(all.length ? all.map((r, i) => dropRun(r, h('div', { class: 'rc-card', dataset: { id: r.id } },
        h('div', { class: 'rc-drop', 'aria-hidden': 'true' }, ic('upload', 22), h('b', {}, `Rilascia per eseguire «${r.name}»`)),
        h('div', { class: 'rc-ch' }, h('span', { class: 'rc-ic' }, ic('recipe', 20)), h('div', { class: 'rc-ct' }, h('b', {}, r.name), h('span', { class: 'muted small' }, r.runs ? `Eseguita ${plural(r.runs, 'volta', 'volte')}${r.last ? ' · l’ultima il ' + new Date(r.last).toLocaleDateString('it-IT') : ''}` : 'Mai eseguita'))),
        h('div', { class: 'rc-chips' }, r.steps.map((s, k) => h('span', { class: 'rc-chip' }, h('i', {}, k + 1), ic(S[s.id]?.icon || 'file', 13), S[s.id]?.label || s.id))),
        h('div', { class: 'rc-acts' },
          dirs[i] ? h('button', { class: 'btn primary sm rc-again', title: 'Rilegge la cartella e salva i risultati in una sottocartella', onclick: () => chooseDir(r, true) }, ic('folder', 15), `Esegui su «${dirs[i].name}»`) : null,
          h('button', { class: (dirs[i] ? 'btn' : 'btn primary') + ' sm rc-files', onclick: () => chooseFiles(r) }, ic('file', 15), 'Esegui su file'),
          IS_TOUCH ? null : h('span', { class: 'muted small rc-drop-hint' }, 'o trascina qui file e cartelle'),
          canDir() || CAN_PICK_DIR ? h('button', { class: 'btn sm rc-dir', onclick: () => chooseDir(r) }, ic('folder', 15), dirs[i] ? 'Altra cartella' : 'Esegui su una cartella') : null,
          typeof Cloud !== 'undefined' ? h('button', { class: 'btn sm rc-cloud cloud-btn', onclick: async () => { const f = await Cloud.pick({ multiple: true }); if (f?.length) execute(r, f); } }, ic('cloud', 15), 'Dal cloud') : null,
          h('span', { style: { flex: 1 } }),
          iconBtn('edit', 'Modifica', () => editor(r, draw)), iconBtn('copy', 'Duplica', () => { save({ ...r, id: null, name: r.name + ' (copia)', runs: 0, last: null }); }), iconBtn('trash', 'Elimina', () => { remove(r.id); toast(`Ricetta «${r.name}» eliminata`); }))))) :
        [h('div', { class: 'act-empty' }, ic('recipe', 26), h('b', {}, 'Ancora nessuna ricetta'), h('span', { class: 'muted small' }, 'Una ricetta è una sequenza di passaggi che fai spesso: la salvi una volta e poi la rilanci su file o su un’intera cartella con un clic.'))]));
      tpl.replaceChildren(h('div', { class: 'sec-t' }, 'Parti da un modello'), h('div', { class: 'chips' }, TEMPLATES.map(t => h('button', { class: 'chip rc-t', onclick: () => editor({ ...JSON.parse(JSON.stringify(t)), id: null }, draw) }, h('span', { class: 'rc-t-h' }, ic('recipe', 15), h('b', {}, t.name), h('span', { class: 'rc-t-use' }, 'Usa', ic('arrow', 13))), h('span', { class: 'muted small rc-t-s' }, t.steps.map(s => S[s.id].label.split(' (')[0]).join(' → '))))));
    }
    // mentre si trascinano file sulla pagina, le ricette si evidenziano; con una sola ricetta va bene rilasciarli ovunque
    let dragDepth = 0;
    const page = h('div', { class: 'rc',
      ondragenter: e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; page.classList.add('rc-dragging'); },
      ondragover: e => { if (hasFiles(e)) e.preventDefault(); },
      ondragleave: () => { if (--dragDepth <= 0) { dragDepth = 0; page.classList.remove('rc-dragging'); } },
      ondrop: async e => {
        if (!hasFiles(e)) return; dragDepth = 0; page.classList.remove('rc-dragging'); if (e.defaultPrevented) return; e.preventDefault();
        const all = list();
        if (all.length === 1) { const f = await dropFiles(e); if (f.length) execute(all[0], f); else toast('Fra i file trascinati non ci sono PDF o immagini', 'error'); }
        else toast(all.length ? 'Rilascia i file sopra la ricetta da eseguire' : 'Crea prima una ricetta, poi trascina i file sopra di essa', 'error');
      } },
      h('div', { class: 'act-bar' }, h('button', { class: 'btn primary rc-new', onclick: () => editor(null, draw) }, ic('plus', 16), 'Nuova ricetta'),
        h('span', { class: 'muted small' }, canDir() ? 'Puoi lanciarla su una cartella: la ricorda e la volta dopo basta un clic; i risultati vanno in una sottocartella.' : CAN_PICK_DIR ? 'Puoi lanciarla su file o su una cartella intera; i risultati si scaricano in un archivio ZIP.' : 'Puoi lanciarla sui file scelti dal telefono (anche da iCloud Drive o dal cloud); i risultati si salvano o si condividono.')),
      listEl, tpl, filesIn, dirIn);
    body.replaceChildren(page);
    draw();
    listeners.add(draw); onLeave(() => listeners.delete(draw));
  }
  PAGES.ricette = { title: 'Ricette', short: 'Ricette', icon: 'recipe', hue: '#7C3AED', desc: 'Le tue sequenze di passaggi (comprimi, unisci, marca da bollo, firma…): salvale una volta, rilanciale su file o cartelle con un clic.', render };
  return { list, get, save, remove, run, execute, editor, stepsText, STEPS: S, TEMPLATES, fill };
})();

/* =====================================================================
   Cloud: apri da Google Drive, Dropbox e OneDrive e salva lì i risultati, senza passare dal disco.
   Il collegamento avviene direttamente tra il browser e il servizio (OAuth): file360 non ha un server,
   non vede le credenziali e non conserva l'accesso oltre la scheda aperta.
   Servono le chiavi dell'applicazione registrate presso ogni servizio e un indirizzo https (o localhost): da un file
   aperto dal disco non si può. Le chiavi arrivano dal sito: dal file cloud.json accanto alla pagina (si legge all'avvio)
   o scritte nella pagina da build.py (variabili FILE360_*, es. su Netlify). I pulsanti del cloud compaiono solo se
   almeno un servizio è pronto: altrimenti non si vedono da nessuna parte.
   ===================================================================== */

// ritorno dalla finestra di accesso (Dropbox, OneDrive): si passa il codice alla scheda che l'ha aperta e ci si chiude
(() => {
  try {
    const q = new URLSearchParams(location.search);
    if (window.opener && window.opener !== window && q.get('state') && (q.get('code') || q.get('error')) && /^ofc_/.test(q.get('state'))) {
      window.opener.postMessage({ officinaOAuth: { code: q.get('code'), state: q.get('state'), error: q.get('error_description') || q.get('error') } }, location.origin);
      document.documentElement.innerHTML = '<body style="font:15px system-ui;padding:40px;text-align:center">Accesso completato: puoi chiudere questa finestra.</body>';
      setTimeout(() => window.close(), 50);
      window.__oauthPopup = true;
    }
  } catch { }
})();

const Cloud = (() => {
  const P = {
    gdrive: { name: 'Google Drive', color: '#1A73E8', keys: [['clientId', 'ID client OAuth (Google Cloud)'], ['apiKey', 'Chiave API (Picker)'], ['appId', 'Numero del progetto (App ID)']],
      help: 'Google Cloud Console › API e servizi: abilita Google Drive API e Google Picker API, crea un «ID client OAuth» di tipo applicazione web con l’origine JavaScript qui sotto e una chiave API. Il numero del progetto serve perché file360 possa leggere i file che scegli.' },
    dropbox: { name: 'Dropbox', color: '#0061FE', keys: [['appKey', 'App key']], help: 'Dropbox App Console: crea un’app «Scoped access» con i permessi files.content.read e files.content.write e aggiungi l’indirizzo di ritorno qui sotto (Redirect URI).' },
    onedrive: { name: 'OneDrive', color: '#0078D4', keys: [['clientId', 'ID applicazione (client)']], help: 'Portale Azure › Registrazioni app: account personali e aziendali, piattaforma «Applicazione a pagina singola» con l’indirizzo di ritorno qui sotto, permesso Files.ReadWrite.' },
  };
  const CFG = 'officina.cloud.config', LAST = 'officina.cloud.last';
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const config = () => { const base = window.OFFICINA_CLOUD || {}, own = lsGet(CFG, {}); const out = {}; for (const id of Object.keys(P)) out[id] = { ...(base[id] || {}), ...(own[id] || {}) }; return out; };
  const secure = () => location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const configured = id => P[id].keys.every(([k]) => String(config()[id][k] || '').trim());
  const usable = id => secure() && configured(id) && !IS_ARTIFACT;
  const ready = () => Object.keys(P).filter(usable);
  // i pulsanti del cloud si vedono solo se c'è un servizio pronto (html[data-cloud=on])
  const refresh = () => { document.documentElement.dataset.cloud = ready().length ? 'on' : 'off'; };
  async function init() {
    refresh();
    if (!secure() || IS_ARTIFACT) return;
    try {
      const r = await fetch(new URL('cloud.json', IS_SITE ? SITE_BASE : location.href), { cache: 'no-store', credentials: 'omit' });
      if (r.ok && /json/.test(r.headers.get('content-type') || '')) { const j = await r.json(); const base = window.OFFICINA_CLOUD ||= {}; for (const id of Object.keys(P)) if (j?.[id]) base[id] = { ...(base[id] || {}), ...j[id] }; }
    } catch { }
    refresh();
    if (new URLSearchParams(location.search).has('cloud-setup')) settings(); // configurazione a mano (prove): indirizzo?cloud-setup
    // i componenti di Google si preparano appena ci si avvicina a un pulsante del cloud: la finestra di accesso
    // deve aprirsi subito dopo il clic, altrimenti il browser la blocca
    if (usable('gdrive')) for (const ev of ['pointerenter', 'focusin']) document.addEventListener(ev, e => { if (e.target?.closest?.('.cloud-btn')) googleReady().catch(() => {}); }, true);
  }
  const redirectUri = () => location.origin + (IS_SITE ? new URL(SITE_BASE).pathname : location.pathname);

  /* —— accesso —— */
  const TK = id => 'officina.cloud.tok.' + id;
  const token = id => { try { const t = JSON.parse(sessionStorage.getItem(TK(id))); return t && t.exp > Date.now() + 60e3 ? t.access : null; } catch { return null; } };
  const keepToken = (id, access, sec) => { try { sessionStorage.setItem(TK(id), JSON.stringify({ access, exp: Date.now() + (sec || 3600) * 1000 })); } catch { } };
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
  // finestra di accesso con PKCE (nessun segreto nel browser): restituisce il codice
  function popup(url, state) {
    return new Promise((res, rej) => {
      const w = window.open(url, 'officina-oauth', 'width=520,height=680');
      if (!w) return rej(codedError('Il browser ha bloccato la finestra di accesso: consenti le finestre popup per questo sito e riprova.', 'POPUP'));
      let done = false;
      const fin = (f, v) => { if (done) return; done = true; removeEventListener('message', on); clearInterval(t); f(v); };
      const on = e => { const m = e.data?.officinaOAuth; if (!m || e.origin !== location.origin || m.state !== state) return; if (m.error) fin(rej, new Error('Accesso non riuscito: ' + m.error)); else fin(res, m.code); };
      addEventListener('message', on);
      const t = setInterval(() => { if (w.closed) fin(rej, Object.assign(new Error('Accesso annullato'), { cancel: true })); }, 600);
    });
  }
  async function pkceLogin(id) {
    const c = config()[id], verifier = rand(48), challenge = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))), state = 'ofc_' + rand(12);
    const ru = redirectUri();
    if (id === 'dropbox') {
      const code = await popup(`https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({ client_id: c.appKey, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: ru, state, token_access_type: 'online' })}`, state);
      const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: c.appKey, redirect_uri: ru, code_verifier: verifier }) });
      const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('Dropbox: accesso non riuscito (' + (j.error_description || r.status) + ')');
      keepToken(id, j.access_token, j.expires_in); return j.access_token;
    }
    const scope = 'Files.ReadWrite offline_access';
    const code = await popup(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: c.clientId, response_type: 'code', redirect_uri: ru, response_mode: 'query', scope, code_challenge: challenge, code_challenge_method: 'S256', state })}`, state);
    const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', body: new URLSearchParams({ client_id: c.clientId, scope, code, redirect_uri: ru, grant_type: 'authorization_code', code_verifier: verifier }) });
    const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('OneDrive: accesso non riuscito (' + (j.error_description || r.status) + ')');
    keepToken(id, j.access_token, j.expires_in); return j.access_token;
  }
  // Google: libreria di accesso e selettore di file ufficiali
  // una sola attesa per script (il precaricamento e il clic possono chiederlo insieme); se non si carica si potrà riprovare
  const scripts = new Map();
  const script = src => { if (!scripts.has(src)) scripts.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => { scripts.delete(src); s.remove(); rej(codedError('Impossibile caricare i componenti di Google: controlla la connessione (o un blocco degli annunci) e riprova.', 'CLOUD')); }; document.head.append(s); })); return scripts.get(src); };
  let gReady = null;
  function googleReady() {
    return gReady ||= (async () => {
      if (!window.google?.accounts?.oauth2) await script('https://accounts.google.com/gsi/client');
      if (!window.google?.picker) { if (!window.gapi) await script('https://apis.google.com/js/api.js'); await new Promise((res, rej) => gapi.load('picker', { callback: res, onerror: () => rej(codedError('Il selettore di file di Google non è disponibile: riprova tra poco.', 'CLOUD')) })); }
    })().catch(e => { gReady = null; throw e; });
  }
  async function googleToken() {
    await googleReady();
    return new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({ client_id: config().gdrive.clientId, scope: 'https://www.googleapis.com/auth/drive.file',
        callback: r => { if (r.error) rej(new Error(r.error === 'access_denied' ? 'Google: accesso negato. Per aprire e salvare i file serve il permesso su Google Drive.' : 'Google: accesso non riuscito (' + r.error + ')')); else { keepToken('gdrive', r.access_token, r.expires_in); res(r.access_token); } },
        error_callback: e => rej(Object.assign(new Error(e?.type === 'popup_closed' ? 'Accesso annullato' : e?.type === 'popup_failed_to_open' ? 'Il browser ha bloccato la finestra di accesso di Google: consenti le finestre popup per questo sito e riprova.' : 'Google: accesso non riuscito'), { cancel: e?.type === 'popup_closed' })) });
      tc.requestAccessToken({ prompt: '' });
    });
  }
  async function auth(id) { return token(id) || (id === 'gdrive' ? googleToken() : pkceLogin(id)); }
  // chiamata autenticata; se l'accesso è scaduto si rifà una volta
  async function call(id, url, opts = {}, retry = true) {
    const t = await auth(id);
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && retry) { try { sessionStorage.removeItem(TK(id)); } catch { } return call(id, url, opts, false); }
    if (!r.ok) { let m = ''; try { m = (await r.clone().json()).error_summary || (await r.json()).error?.message || ''; } catch { } throw new Error(`${P[id].name}: richiesta non riuscita (${r.status}${m ? ' · ' + m : ''})`); }
    return r;
  }
  const asciiJson = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

  /* —— cartelle e file (Dropbox, OneDrive) —— */
  async function listFolder(id, folder) {
    if (id === 'dropbox') {
      let r = await (await call(id, 'https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: folder?.path || '', limit: 500 }) })).json();
      const all = [...r.entries];
      while (r.has_more && all.length < 3000) { r = await (await call(id, 'https://api.dropboxapi.com/2/files/list_folder/continue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: r.cursor }) })).json(); all.push(...r.entries); }
      return all.map(e => ({ id: e.id, name: e.name, path: e.path_lower, folder: e['.tag'] === 'folder', size: e.size || 0 }));
    }
    let url = `https://graph.microsoft.com/v1.0/me/drive/${folder?.id ? 'items/' + folder.id : 'root'}/children?$select=id,name,size,folder,file&$top=200`;
    const all = [];
    while (url && all.length < 3000) { const j = await (await call(id, url)).json(); all.push(...j.value); url = j['@odata.nextLink']; }
    return all.map(e => ({ id: e.id, name: e.name, folder: !!e.folder, size: e.size || 0 }));
  }
  async function download(id, item, token2) {
    let r;
    if (id === 'dropbox') r = await call(id, 'https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': asciiJson({ path: item.id }) } });
    else if (id === 'onedrive') r = await call(id, `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`);
    else r = await call(id, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`);
    const b = await r.blob();
    return new File([b], item.name, { type: b.type || (/\.pdf$/i.test(item.name) ? 'application/pdf' : '') });
  }
  async function upload(id, folder, name, bytes, type = 'application/octet-stream') {
    if (id === 'dropbox') return (await call(id, 'https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': asciiJson({ path: `${folder?.path || ''}/${name}`, mode: 'add', autorename: true }) }, body: bytes })).json();
    if (id === 'onedrive') return (await call(id, `https://graph.microsoft.com/v1.0/me/drive/${folder?.id ? 'items/' + folder.id : 'root'}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes })).json();
    const bd = 'ofc' + rand(9), meta = { name, ...(folder?.id ? { parents: [folder.id] } : {}) };
    const body = new Blob([`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: ${type}\r\n\r\n`, bytes, `\r\n--${bd}--`]);
    return (await call(id, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${bd}` }, body })).json();
  }
  // Google Picker: file da aprire o cartella in cui salvare
  async function googlePick({ folders = false, multiple = true } = {}) {
    const tok = await auth('gdrive'), c = config().gdrive;
    return new Promise(res => {
      const view = folders ? new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder')
        : new google.picker.DocsView().setIncludeFolders(true).setMimeTypes('application/pdf,image/jpeg,image/png,image/heic,image/tiff,image/webp,application/xml,text/xml,application/pkcs7-mime,application/zip');
      let b = new google.picker.PickerBuilder().addView(view).setOAuthToken(tok).setDeveloperKey(c.apiKey).setLocale('it').setTitle(folders ? 'Scegli la cartella in cui salvare' : 'Apri da Google Drive')
        .setCallback(d => { if (d.action === google.picker.Action.PICKED) res(d.docs.map(x => ({ id: x.id, name: x.name, folder: folders }))); else if (d.action === google.picker.Action.CANCEL) res(null); });
      b = b.setAppId(String(c.appId).trim()).setOrigin(location.protocol + '//' + location.host);
      if (multiple && !folders) b = b.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      b.build().setVisible(true);
    });
  }

  /* —— navigatore di cartelle (Dropbox, OneDrive) —— */
  function browse(id, { mode = 'open', multiple = true, accept = null } = {}) {
    return new Promise(res => {
      let done = false, path = [{ id: null, path: '', name: P[id].name }], items = [], sel = new Set();
      const fin = v => { if (done) return; done = true; m.close(); res(v); };
      const crumbs = h('div', { class: 'cl-crumbs' }), listEl = h('div', { class: 'cl-list' }), foot = h('div', { class: 'cl-foot' });
      const okType = n => !accept || accept.test(n);
      async function load() {
        listEl.replaceChildren(h('div', { class: 'cl-wait' }, h('span', { class: 'jp-spin' }), 'Lettura della cartella…'));
        try { items = (await listFolder(id, path[path.length - 1])).sort((a, b) => (b.folder - a.folder) || a.name.localeCompare(b.name, 'it', { numeric: true })); }
        catch (e) { listEl.replaceChildren(h('div', { class: 'err-text' }, Errors.explain(e).text)); return; }
        sel.clear(); draw();
      }
      function draw() {
        crumbs.replaceChildren(...path.flatMap((f, i) => [i ? h('span', { class: 'muted' }, '›') : null, h('button', { class: 'linkish', onclick: () => { path = path.slice(0, i + 1); load(); } }, f.name)]).filter(Boolean));
        const shown = items.filter(x => x.folder || (mode === 'open' && okType(x.name)));
        listEl.replaceChildren(...(shown.length ? shown.map(x => h('div', { class: 'cl-item' + (sel.has(x.id) ? ' on' : '') + (x.folder ? ' dir' : ''), role: 'button', tabindex: 0,
          onclick: () => { if (x.folder) { path.push(x); load(); return; } if (!multiple) sel.clear(); sel.has(x.id) ? sel.delete(x.id) : sel.add(x.id); draw(); } },
          ic(x.folder ? 'folder' : 'file', 18), h('span', { class: 'cl-n' }, x.name), x.folder ? ic('chevron', 14) : h('span', { class: 'muted small' }, fmtSize(x.size)))) : [h('div', { class: 'muted small cl-wait' }, mode === 'open' ? 'Nessun file utilizzabile in questa cartella.' : 'Cartella vuota.')]));
        const here = path[path.length - 1];
        foot.replaceChildren(h('button', { class: 'btn', onclick: () => fin(null) }, 'Annulla'),
          mode === 'open' ? h('button', { class: 'btn primary cl-ok', disabled: !sel.size, onclick: () => fin(items.filter(x => sel.has(x.id))) }, sel.size ? `Apri ${plural(sel.size, 'file', 'file')}` : 'Scegli i file')
            : h('button', { class: 'btn primary cl-ok', onclick: () => fin(here) }, ic('upload', 15), `Salva in «${here.name}»`));
      }
      const m = modal([h('h3', {}, mode === 'open' ? `Apri da ${P[id].name}` : `Salva su ${P[id].name}`), crumbs, listEl, foot], { width: 560, onClose: () => fin(null) });
      load();
    });
  }

  /* —— impostazioni (chiavi delle app) —— */
  function settings() {
    const cfg = lsGet(CFG, {}), base = window.OFFICINA_CLOUD || {};
    const inputs = {};
    const m = modal([h('h3', {}, 'Servizi cloud: chiavi delle applicazioni'),
      h('p', { class: 'muted small' }, 'Per collegare un servizio serve un’applicazione registrata presso di esso (gratuita). Le chiavi restano in questo browser. Indirizzo da registrare come origine e ritorno: ', h('code', { class: 'cl-uri' }, redirectUri())),
      !secure() ? h('div', { class: 'hint warn' }, 'Questa pagina è aperta da un file sul disco: i servizi cloud accettano solo indirizzi https (o localhost). Pubblica file360 su un sito o aprila da un server locale.') : null,
      ...Object.entries(P).map(([id, p]) => h('div', { class: 'cl-set' }, h('b', { style: { color: p.color } }, p.name), h('p', { class: 'muted small' }, p.help),
        ...p.keys.map(([k, l]) => h('label', { class: 'field' }, l, inputs[id + '.' + k] = h('input', { class: 'input', value: cfg[id]?.[k] || '', placeholder: base[id]?.[k] ? 'impostata dal sito' : '' }))))),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Annulla'),
        h('button', { class: 'btn primary', onclick: () => { const out = {}; for (const [key, el] of Object.entries(inputs)) { const [id, k] = key.split('.'); if (el.value.trim()) (out[id] ||= {})[k] = el.value.trim(); } lsSet(CFG, out); m.close(); refresh(); toast('Impostazioni salvate'); } }, 'Salva'))], { width: 600 });
  }

  /* —— scelta del servizio —— */
  function chooser(title, sub) {
    const ok = ready();
    if (!ok.length) { toast('Nessun servizio cloud disponibile', 'error'); return Promise.resolve(null); }
    if (ok.length === 1) return Promise.resolve(ok[0]);
    return new Promise(res => {
      let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); };
      const m = modal([h('h3', {}, title), sub ? h('p', { class: 'muted small' }, sub) : null,
        h('div', { class: 'cl-prov' }, Object.entries(P).filter(([id]) => ok.includes(id)).map(([id, p]) => {
          const ok = usable(id), why = !secure() ? 'Serve la versione online (https)' : !configured(id) ? 'Da configurare' : token(id) ? 'Collegato' : 'Accedi al primo uso';
          return h('button', { class: 'cl-p' + (ok ? '' : ' off'), dataset: { prov: id }, style: { '--c': p.color }, onclick: () => ok ? fin(id) : (secure() ? settings() : toast('I servizi cloud funzionano quando file360 è aperta da un indirizzo https', 'error')) },
            h('span', { class: 'cl-pi' }, ic('cloud', 20)), h('b', {}, p.name), h('span', { class: 'muted small' }, why));
        })),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => fin(null) }, 'Annulla'))], { width: 520, onClose: () => fin(null) });
    });
  }
  // apri: restituisce i file scelti (File), pronti per lo strumento
  async function pick({ multiple = true, accept = /\.(pdf|p7m|tsd|m7m|jpe?g|png|heic|heif|tiff?|webp|gif|bmp|avif|xml|xbrl|zip|rcc|rel)$/i } = {}) {
    const id = await chooser('Apri dal cloud', 'Scegli il servizio: i file vengono scaricati direttamente in questo browser.'); if (!id) return null;
    try {
      const items = id === 'gdrive' ? await googlePick({ multiple }) : await browse(id, { mode: 'open', multiple, accept });
      if (!items?.length) return null;
      return await withBusy(`Download da ${P[id].name}…`, async () => { const out = []; for (const [i, it] of items.entries()) { Busy.set(i / items.length, it.name); out.push(await download(id, it)); } return out; });
    } catch (e) { if (!e?.cancel) Errors.show(e); return null; }
  }
  // salva: carica i file nella cartella scelta (si ricorda l'ultima)
  async function saveOutputs(outputs) {
    const id = await chooser('Salva sul cloud', `${plural(outputs.length, 'file', 'file')} da salvare.`); if (!id) return false;
    try {
      const last = lsGet(LAST, {})[id];
      let folder;
      if (last) {
        folder = await new Promise(res => { let d = false; const fin = v => { if (d) return; d = true; m.close(); res(v); };
          const m = modal([h('h3', {}, `Salva su ${P[id].name}`), h('p', {}, 'Dove vuoi salvare?'), h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
            h('button', { class: 'btn', onclick: () => fin('choose') }, 'Scegli un’altra cartella'), h('button', { class: 'btn primary cl-last', onclick: () => fin(last) }, ic('folder', 15), `In «${last.name}»`))], { width: 460, onClose: () => fin(null) }); });
        if (!folder) return false;
      }
      if (!folder || folder === 'choose') folder = id === 'gdrive' ? (await googlePick({ folders: true }))?.[0] : await browse(id, { mode: 'save' });
      if (!folder) return false;
      const all = lsGet(LAST, {}); all[id] = { id: folder.id || null, path: folder.path || '', name: folder.name }; lsSet(LAST, all);
      const ok = await withBusy(`Salvataggio su ${P[id].name}…`, async () => { for (const [i, o] of outputs.entries()) { Busy.set(i / outputs.length, o.name); await upload(id, folder, o.name, o.bytes, o.type || (/\.pdf$/i.test(o.name) ? 'application/pdf' : 'application/octet-stream')); } return true; });
      if (ok) toast(`${plural(outputs.length, 'file salvato', 'file salvati')} su ${P[id].name} in «${folder.name}»`);
      return !!ok;
    } catch (e) { if (!e?.cancel) Errors.show(e); return false; }
  }
  return { pick, saveOutputs, settings, usable, configured, secure, ready, refresh, init, providers: P, _api: { listFolder, download, upload, auth } };
})();
Cloud.init();

/* =====================================================================
   Attività: il registro delle operazioni fatte (anche nei giorni precedenti), in questo browser.
   Per ognuna: quando, con quale strumento, su quali file (nome e peso), cosa è uscito (nome, peso e
   impronta SHA-256 che identifica il file prodotto), com'è andata e quanto è durata. Esportabile in CSV/JSON.
   ===================================================================== */
const Activity = (() => {
  const MAX = 2000, ST = 'attivita';
  const open = new Map();   // lavoro → voce in corso
  const files = list => (list || []).filter(Boolean).map(f => ({ name: f.name || 'file', size: f.size ?? f.bytes?.length ?? 0 }));
  const toolOf = (tool, title) => tool && TOOLS[tool] ? TOOLS[tool].title : title ? title.replace(/…$/, '') : 'file360';
  let lastMark = { gen: -1, at: Date.now() };
  // inizio di un'attesa (anche breve): la durata di un risultato senza lavoro si conta da qui
  const mark = () => { lastMark = { gen: GEN, at: Date.now() }; };
  let seq = 0, writing = Promise.resolve();
  async function save(e) {
    writing = writing.then(async () => {
      try {
        const id = await Store.put(ST, e); e.id = id;
        if (++seq % 50 === 0) { const ks = await Store.keys(ST); if (ks.length > MAX) await Store.batch(ST, o => ks.slice(0, ks.length - MAX).forEach(k => o.delete(k))); }
      } catch (er) { console.warn('registro: voce non salvata', er); }
    });
    await writing;
    changed();
  }
  async function hashOutputs(e, outs) {
    for (const [i, o] of outs.entries()) {
      try { const b = o.bytes; if (!b) continue; e.outputs[i].sha256 = b.length > 120e6 && !(crypto?.subtle) ? '' : await Sha256.of(b instanceof Uint8Array ? b : new Uint8Array(b)); } catch { }
    }
    if (e.id != null) { try { await Store.put(ST, e); } catch { } changed(); }
  }
  async function record({ tool, title, inputs, outputs = [], outcome, ms, error = null, tech = null, at = Date.now() }) {
    const e = { at, tool: tool || null, toolName: toolOf(tool, title), op: title && !/in corso|^(lettura|apertura|preparazione|al lavoro)/i.test(title) ? title.replace(/…$/, '') : '', inputs: files(inputs), outputs: outputs.map(o => ({ name: o.name, size: o.bytes?.length ?? o.size ?? 0, sha256: null })), outcome, ms: Math.max(0, Math.round(ms || 0)), error, tech };
    await save(e);
    if (outputs.length) hashOutputs(e, outputs);
    return e;
  }
  // lavori (con la coda): inizio e fine
  function begin(J) { open.set(J, { at: Date.now(), tool: J.tool, title: J.title, inputs: CURRENT_INPUT.slice() }); }
  function finish(J, state) {
    const o = open.get(J); open.delete(J); if (!o) return;
    const outs = J.result?.outputs || J._outs || [];
    if (state === 'error') return record({ ...o, outcome: 'errore', ms: Date.now() - o.at, error: J.errInfo?.text || J.error, tech: J.errInfo?.tech || null });
    if (state === 'cancelled') return record({ ...o, outcome: 'annullato', ms: Date.now() - o.at });
    if (outs.length) return record({ ...o, outputs: outs, outcome: 'completato', ms: Date.now() - o.at });
  }
  // un risultato mostrato: dentro un lavoro si aggancia a quello, altrimenti è una voce a sé
  function result(outputs, opts = {}) {
    const J = Jobs.running;
    if (J && open.has(J) && !Jobs.light) { J._outs = outputs; return; }
    record({ tool: CURRENT_TOOL, title: opts.title || '', inputs: CURRENT_INPUT, outputs, outcome: 'completato', ms: lastMark.gen === GEN ? Date.now() - lastMark.at : 0 });
  }
  function error(info, ctx = {}) {
    if (ctx.job && open.has(ctx.job)) return;   // lo registra la fine del lavoro
    record({ tool: ctx.tool || CURRENT_TOOL, title: '', inputs: ctx.file ? [ctx.file] : CURRENT_INPUT, outcome: 'errore', ms: lastMark.gen === GEN ? Date.now() - lastMark.at : 0, error: info.text, tech: info.tech });
  }
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch { } });
  const list = async () => (await Store.all(ST).catch(() => [])).sort((a, b) => b.at - a.at);

  /* —— esportazione —— */
  const when = t => new Date(t).toLocaleString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const iso = t => { const d = new Date(t), z = -d.getTimezoneOffset(), p = n => String(Math.abs(n)).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${z >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(z) / 60))}:${p(Math.abs(z) % 60)}`; };
  function csv(rows) {
    const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['data_ora', 'strumento', 'operazione', 'file_input', 'byte_input', 'file_output', 'byte_output', 'sha256_output', 'esito', 'durata_secondi', 'errore'];
    const lines = rows.map(e => [iso(e.at), e.toolName, e.op, e.inputs.map(f => f.name).join(' | '), e.inputs.map(f => f.size).join(' | '), e.outputs.map(f => f.name).join(' | '), e.outputs.map(f => f.size).join(' | '), e.outputs.map(f => f.sha256 || '').join(' | '), e.outcome, (e.ms / 1000).toFixed(1).replace('.', ','), e.error || ''].map(q).join(';'));
    return '﻿' + [head.join(';'), ...lines].join('\r\n');
  }
  const json = rows => JSON.stringify({ generato: iso(Date.now()), applicazione: 'file360', voci: rows.map(e => ({ data_ora: iso(e.at), strumento: e.toolName, operazione: e.op || null, input: e.inputs, output: e.outputs, esito: e.outcome, durata_ms: e.ms, errore: e.error || null })) }, null, 2);

  /* —— la pagina —— */
  const OUT = { completato: ['Completato', 'ok'], errore: ['Errore', 'err'], annullato: ['Annullato', 'mute'] };
  function render(body) {
    const st = { q: '', out: 'tutti', rows: [] };
    const search = h('input', { class: 'input act-q', type: 'search', placeholder: 'Cerca per file o strumento', oninput: () => { st.q = search.value.trim().toLowerCase(); draw(); } });
    const outSel = h('select', { class: 'input act-f', 'aria-label': 'Mostra le attività per esito', onchange: () => { st.out = outSel.value; draw(); } }, [['tutti', 'Tutti gli esiti'], ['completato', 'Completati'], ['errore', 'Con errore'], ['annullato', 'Annullati']].map(([v, l]) => h('option', { value: v }, l)));
    const shown = () => st.rows.filter(e => (st.out === 'tutti' || e.outcome === st.out) && (!st.q || [e.toolName, e.op, ...e.inputs.map(f => f.name), ...e.outputs.map(f => f.name), e.outputs.map(f => f.sha256 || '').join(' ')].join(' ').toLowerCase().includes(st.q)));
    const stamp = () => new Date().toISOString().slice(0, 10);
    const bar = h('div', { class: 'act-bar' }, search, outSel,
      h('button', { class: 'btn sm act-csv', onclick: () => download(new TextEncoder().encode(csv(shown())), `attivita-officina-${stamp()}.csv`, 'text/csv') }, ic('download', 15), 'CSV'),
      h('button', { class: 'btn sm act-json', onclick: () => download(new TextEncoder().encode(json(shown())), `attivita-officina-${stamp()}.json`, 'application/json') }, ic('download', 15), 'JSON'),
      h('button', { class: 'btn sm ghost act-clear', onclick: () => {
        const m = modal([h('h3', {}, 'Svuotare il registro?'), h('p', {}, 'Le voci delle attività vengono cancellate da questo browser. I progetti e i file non vengono toccati.'),
          h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Annulla'),
            h('button', { class: 'btn danger', onclick: async () => { m.close(); await Store.clear(ST).catch(() => {}); load(); } }, 'Svuota'))], { width: 420 });
      } }, ic('trash', 15), 'Svuota'));
    const listEl = h('div', { class: 'act-list' });
    const sum = h('div', { class: 'act-sum muted small' });
    const fl = (arr, sha) => arr.length ? h('div', { class: 'act-files' }, arr.map(f => h('div', { class: 'act-file' }, h('span', { class: 'act-fn', title: f.name }, f.name), h('span', { class: 'muted' }, fmtSize(f.size)),
      sha && f.sha256 ? h('button', { class: 'act-sha', title: 'SHA-256: ' + f.sha256 + ' — clicca per copiarlo', onclick: () => copyText(f.sha256) }, 'SHA-256 ' + f.sha256.slice(0, 12) + '…') : null))) : h('span', { class: 'muted' }, '—');
    function draw() {
      const rows = shown();
      sum.textContent = st.rows.length ? `${plural(rows.length, 'attività', 'attività')}${rows.length !== st.rows.length ? ` su ${st.rows.length}` : ''} · il registro resta solo in questo browser` : '';
      if (!st.rows.length) { listEl.replaceChildren(h('div', { class: 'act-empty' }, ic('activity', 26), h('b', {}, 'Ancora nessuna attività'), h('span', { class: 'muted small' }, 'Qui trovi ogni operazione fatta: file di partenza, risultato, esito, durata e impronta SHA-256 del file prodotto.'))); return; }
      listEl.replaceChildren(h('div', { class: 'act-row act-head' }, h('span', {}, 'Quando'), h('span', {}, 'Strumento'), h('span', {}, 'File di partenza'), h('span', {}, 'Risultato'), h('span', {}, 'Esito'), h('span', {}, 'Durata')),
        ...rows.slice(0, 500).map(e => {
          const [ol, oc] = OUT[e.outcome] || [e.outcome, 'mute'], t = e.tool && TOOLS[e.tool];
          return h('div', { class: 'act-row', style: t ? { '--hue': t.hue } : null },
            h('span', { class: 'act-when' }, when(e.at)),
            h('span', { class: 'act-tool' }, t ? ic(t.icon, 15) : null, h('span', {}, e.toolName, e.op && e.op !== e.toolName ? h('small', { class: 'muted' }, e.op) : null)),
            fl(e.inputs), fl(e.outputs, true),
            h('span', { class: 'act-out ' + oc }, ol, e.error ? h('details', {}, h('summary', {}, 'perché'), h('p', {}, e.error), e.tech ? h('pre', {}, e.tech) : null) : null),
            h('span', { class: 'act-ms' }, e.ms ? fmtDur(e.ms) : '—'));
        }), ...(rows.length > 500 ? [h('div', { class: 'muted small', style: { padding: '10px' } }, `Mostrate le 500 più recenti: l’esportazione le comprende tutte (${rows.length}).`)] : []));
    }
    async function load() { st.rows = await list(); draw(); bar.querySelectorAll('.act-csv, .act-json, .act-clear').forEach(b => { b.disabled = !st.rows.length; }); }
    body.replaceChildren(h('div', { class: 'act' }, bar, sum, listEl));
    load();
    listeners.add(load); onLeave(() => listeners.delete(load));
  }
  PAGES.attivita = { title: 'Attività', short: 'Attività', icon: 'activity', hue: '#475467', desc: 'Il registro delle operazioni: file di partenza, risultato, esito, durata e impronta SHA-256. Esportabile in CSV e JSON.', render };
  return { begin, finish, result, error, mark, list, csv, json, record };
})();
