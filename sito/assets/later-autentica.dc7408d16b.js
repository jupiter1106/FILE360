'use strict';
/* =====================================================================
   Verifica di autenticità di un PDF: i segni che un documento è stato modificato dopo la creazione.
   Legge la struttura del file (salvataggi successivi, firme e ciò che è cambiato dopo), i metadati (date e
   programmi), il testo pagina per pagina (caratteri estranei, righe fuori posto, testo invisibile) e le scansioni
   (rettangoli bianchi e testo scritto sopra). Recupera le versioni precedenti salvate nel file e le confronta con
   quella finale. Tutto sul dispositivo, nessuna intelligenza artificiale: regole sui dati del file.
   Un PDF non si può dimostrare autentico: si possono trovare, o non trovare, i segni di una modifica.
   ===================================================================== */
const Autentica = (() => {
  const latin = b => { let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; };
  const r1 = v => Math.round(v * 10) / 10;

  /* ---------- programmi: chi ha creato e chi ha salvato il file ---------- */
  const EDITORI = [[/ilovepdf/i, 'iLovePDF'], [/smallpdf/i, 'Smallpdf'], [/sejda/i, 'Sejda'], [/pdfescape/i, 'PDFescape'], [/pdf-?xchange/i, 'PDF-XChange Editor'], [/foxit/i, 'Foxit'],
    [/nitro/i, 'Nitro PDF'], [/pdfelement|wondershare/i, 'PDFelement'], [/pdf ?candy/i, 'PDF Candy'], [/soda ?pdf/i, 'Soda PDF'], [/pdffiller/i, 'pdfFiller'], [/docfly/i, 'DocFly'],
    [/pdf ?expert|readdle/i, 'PDF Expert'], [/inkscape/i, 'Inkscape'], [/master ?pdf/i, 'Master PDF Editor'], [/pdf24/i, 'PDF24'], [/canva/i, 'Canva'], [/libreoffice.*draw|openoffice.*draw/i, 'LibreOffice Draw'],
    [/acrobat (pro|standard)|adobe acrobat \d|acrobat dc/i, 'Adobe Acrobat'], [/pdfsam/i, 'PDFsam'], [/scribus/i, 'Scribus'], [/sumatra/i, 'Sumatra'], [/xodo/i, 'Xodo'], [/onlyoffice/i, 'ONLYOFFICE'], [/file360/i, 'file360']];
  const RISTAMPE = [[/print to pdf|stampa in pdf/i, 'Stampa in PDF di Windows'], [/quartz ?pdfcontext/i, 'Anteprima o stampa di macOS'], [/ghostscript/i, 'Ghostscript'], [/skia\/pdf/i, 'stampa in PDF di Chrome'], [/cups-pdf/i, 'stampa in PDF di Linux']];
  const LIBRERIE = [[/pdf-lib/i, 'pdf-lib'], [/itext/i, 'iText'], [/pypdf/i, 'pypdf'], [/reportlab/i, 'ReportLab'], [/tcpdf/i, 'TCPDF'], [/fpdf/i, 'FPDF'], [/pdfsharp/i, 'PDFsharp'], [/pdfbox/i, 'PDFBox'], [/qpdf/i, 'qpdf'], [/mupdf/i, 'MuPDF'], [/dompdf/i, 'Dompdf'], [/wkhtmltopdf/i, 'wkhtmltopdf']];
  const chi = s => { s = String(s || ''); for (const [re, n] of EDITORI) if (re.test(s)) return { n, k: 'editor' }; for (const [re, n] of RISTAMPE) if (re.test(s)) return { n, k: 'stampa' }; for (const [re, n] of LIBRERIE) if (re.test(s)) return { n, k: 'libreria' }; return s ? { n: s.replace(/\s+/g, ' ').trim().slice(0, 80), k: 'altro' } : null; };
  // date dei metadati: D:AAAAMMGGhhmmss+hh'mm' (PDF) oppure 2025-03-03T10:12:00+01:00 (XMP)
  function data(s) {
    s = String(s || '').trim(); if (!s) return null;
    let m = /^(?:D:)?(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?([Zz+-])?(\d\d)?'?(\d\d)?/.exec(s);
    if (m && !/^\d{4}-/.test(s)) { let t = Date.UTC(+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0, +m[6] || 0); if (m[7] === '+' || m[7] === '-') t -= (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) * 60000; return isFinite(t) ? t : null; }
    const t = Date.parse(s); return isFinite(t) ? t : null;
  }

  /* ---------- struttura: i salvataggi successivi (aggiornamenti incrementali) ---------- */
  function salvataggi(bytes, s = latin(bytes)) {
    const ends = []; const re = /%%EOF[ \t]*(?:\r\n|\r|\n)?/g; let m;
    while ((m = re.exec(s))) if (/startxref\s+\d+\s*$/.test(s.slice(Math.max(0, m.index - 48), m.index))) ends.push(m.index + m[0].length);
    // file «linearizzato» (per il web): il primo %%EOF chiude la sezione della prima pagina, non è un salvataggio
    if (/\/Linearized\s/.test(s.slice(0, 2048)) && ends.length > 1) ends.shift();
    if (!ends.length) return [bytes.length];
    // fine dell'ultimo salvataggio: tutto il file (eventuali byte in coda non fanno una versione)
    ends[ends.length - 1] = bytes.length;
    return ends;
  }
  // firme digitali dentro il PDF: fin dove arriva ciascuna (i byte coperti dalla firma)
  function firme(s, size) {
    const out = []; const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g; let m;
    while ((m = re.exec(s))) {
      const [a, b, c, d] = m.slice(1, 5).map(Number); if (a !== 0 || c < b || c + d > size) continue;
      const near = s.slice(Math.max(0, m.index - 3000), Math.min(s.length, m.index + 3000)).replace(/<[0-9A-Fa-f\s]{200,}>/g, '<…>');
      const str = k => { const x = new RegExp('/' + k + '\\s*\\(((?:\\\\.|[^\\\\)])*)\\)').exec(near); return x ? x[1].replace(/\\([()\\])/g, '$1').replace(/^\xfe\xff/, '') : ''; };
      out.push({ fine: c + d, nome: str('Name'), quando: data(str('M')), motivo: str('Reason'), ts: /RFC3161|ETSI\.RFC3161/i.test(near) });
    }
    return out.filter((x, i, A) => A.findIndex(y => y.fine === x.fine) === i).sort((a, b) => a.fine - b.fine);
  }

  /* ---------- una versione: metadati, testo, annotazioni, campi ---------- */
  async function apri(bytes) { return pdfDocument({ data: bytes.slice(), isEvalSupported: false, stopAtErrors: false }).promise; }
  async function descrivi(doc, { maxPag = 80, token = false } = {}) {
    const md = await doc.getMetadata().catch(() => ({})), info = md.info || {}, x = md.metadata;
    const xmp = k => { try { return x?.get(k) || ''; } catch { return ''; } };
    const pagine = [], toks = [];
    for (let p = 1; p <= Math.min(doc.numPages, maxPag); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent().catch(() => ({ items: [] }));
      const ann = await page.getAnnotations().catch(() => []);
      pagine.push({ testo: tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(), ann: ann.filter(a => a.subtype !== 'Link' && a.subtype !== 'Popup').map(a => [a.subtype, (a.rect || []).map(Math.round).join(','), a.fieldValue ?? a.contentsObj?.str ?? ''].join('|')) });
      if (token) toks.push(...await DocDiff.textTokens(page, p));
      page.cleanup();
    }
    return {
      pagine, toks, n: doc.numPages,
      creato: data(info.CreationDate) ?? data(xmp('xmp:createdate')), modificato: data(info.ModDate) ?? data(xmp('xmp:modifydate')),
      creatoXmp: data(xmp('xmp:createdate')), modificatoXmp: data(xmp('xmp:modifydate')), creatoInfo: data(info.CreationDate), modificatoInfo: data(info.ModDate),
      producer: info.Producer || xmp('pdf:producer') || '', creator: info.Creator || xmp('xmp:creatortool') || '', autore: info.Author || '', titolo: info.Title || '',
      producerXmp: xmp('pdf:producer'),
    };
  }
  // che cosa è cambiato tra due versioni consecutive
  function differenze(A, B) {
    const o = { pagine: B.n - A.n, testo: [], annAgg: 0, annTolte: 0, campi: 0, tipiAnn: new Set() };
    for (let p = 0; p < Math.min(A.pagine.length, B.pagine.length); p++) {
      const a = A.pagine[p], b = B.pagine[p];
      if (a.testo !== b.testo) o.testo.push(p + 1);
      const sa = new Set(a.ann), sb = new Set(b.ann);
      for (const k of sb) if (!sa.has(k)) { const [tipo] = k.split('|'); if (tipo === 'Widget') { if (A.pagine[p].ann.some(x => x.split('|').slice(0, 2).join('|') === k.split('|').slice(0, 2).join('|'))) o.campi++; else o.annAgg++; } else o.annAgg++; o.tipiAnn.add(tipo); }
      for (const k of sa) if (!sb.has(k) && !b.ann.some(x => x.split('|').slice(0, 2).join('|') === k.split('|').slice(0, 2).join('|'))) o.annTolte++;
    }
    return o;
  }

  /* ---------- la pagina vista dal disegno: testo con il suo carattere vero, immagini, rettangoli pieni ---------- */
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const pt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const box = (m, x0, y0, x1, y1) => { const P = [pt(m, x0, y0), pt(m, x1, y0), pt(m, x0, y1), pt(m, x1, y1)]; return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))]; };
  const area = r => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const inter = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  const colore = a => { if (ArrayBuffer.isView(a)) a = [...a]; if (typeof a === 'string' && /^#?[0-9a-f]{6}$/i.test(a)) { const v = a.replace('#', ''); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255); } if (Array.isArray(a)) { const v = a.map(Number); const k = v.some(x => x > 1) ? 255 : 1; return v.length === 1 ? [v[0] / k, v[0] / k, v[0] / k] : v.length >= 4 && k === 1 && a.length === 4 ? [1 - Math.min(1, v[0] + v[3]), 1 - Math.min(1, v[1] + v[3]), 1 - Math.min(1, v[2] + v[3])] : v.slice(0, 3).map(x => x / k); } return [0, 0, 0]; };
  async function disegno(page) {
    const O = pdfjsLib.OPS, ol = await page.getOperatorList({ annotationMode: pdfjsLib.AnnotationMode?.DISABLE ?? 0 });
    const fontName = id => { try { return page.commonObjs.get(id)?.name || id; } catch { try { return page.objs.get(id)?.name || id; } catch { return id; } } };
    let ctm = [1, 0, 0, 1, 0, 0]; const pila = [];
    let gs = { fill: [0, 0, 0], mode: 0, font: '', size: 0, cs: 0, ws: 0, hs: 1, lead: 0, rise: 0 };
    let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], path = null;
    const corse = [], immagini = [], pieni = [];
    const F = ol.fnArray, A = ol.argsArray;
    for (let i = 0; i < F.length; i++) {
      const f = F[i], a = A[i];
      switch (f) {
        case O.save: pila.push([ctm, { ...gs }]); break;
        case O.restore: if (pila.length) { const [c, g] = pila.pop(); ctm = c; gs = g; } break;
        case O.transform: ctm = mul(ctm, a); break;
        case O.paintFormXObjectBegin: pila.push([ctm, { ...gs }]); if (Array.isArray(a[0]) && a[0].length === 6) ctm = mul(ctm, a[0]); break;
        case O.paintFormXObjectEnd: if (pila.length) { const [c, g] = pila.pop(); ctm = c; gs = g; } break;
        case O.setFillRGBColor: case O.setFillGray: case O.setFillCMYKColor: case O.setFillColor: gs.fill = colore(f === O.setFillGray ? [a[0]] : a.length === 1 ? a[0] : a); break;
        case O.setGState: for (const [k, v] of a[0] || []) if (k === 'Font') { gs.font = v[0]; gs.size = v[1]; } break;
        case O.setTextRenderingMode: gs.mode = a[0]; break;
        case O.setFont: gs.font = a[0]; gs.size = a[1]; break;
        case O.setCharSpacing: gs.cs = a[0]; break;
        case O.setWordSpacing: gs.ws = a[0]; break;
        case O.setHScale: gs.hs = a[0] / 100; break;
        case O.setLeading: gs.lead = a[0]; break;
        case O.setTextRise: gs.rise = a[0]; break;
        case O.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
        case O.setTextMatrix: tm = a.slice(0, 6); tlm = tm.slice(); break;
        case O.moveText: tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm.slice(); break;
        case O.setLeadingMoveText: gs.lead = -a[1]; tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm.slice(); break;
        case O.nextLine: tlm = mul(tlm, [1, 0, 0, 1, 0, -gs.lead]); tm = tlm.slice(); break;
        case O.nextLineShowText: case O.nextLineSetSpacingShowText: case O.showText: case O.showSpacedText: {
          if (f !== O.showText && f !== O.showSpacedText) { tlm = mul(tlm, [1, 0, 0, 1, 0, -gs.lead]); tm = tlm.slice(); }
          const glifi = f === O.nextLineSetSpacingShowText ? a[2] : a[0]; if (!Array.isArray(glifi)) break;
          const fs = gs.size || 1, M0 = mul(ctm, tm); let w = 0, t = '';
          for (const g of glifi) {
            if (typeof g === 'number') { w -= g / 1000 * fs * gs.hs; continue; }
            if (!g) continue; const u = g.unicode || '';
            t += u; w += ((g.width || 0) / 1000 * fs + gs.cs + (u === ' ' ? gs.ws : 0)) * gs.hs;
          }
          tm = mul(tm, [1, 0, 0, 1, w, 0]);
          const r = box(M0, 0, gs.rise - fs * 0.22, w, gs.rise + fs * 0.9), size = fs * Math.hypot(M0[2], M0[3]);
          if (t.trim()) corse.push({ t, r, font: fontName(gs.font), size: r1(size), base: r1(pt(M0, 0, gs.rise)[1]), x: pt(M0, 0, 0)[0], dir: Math.atan2(M0[1], M0[0]), mode: gs.mode, fill: gs.fill.slice(), dopoImg: immagini.length, i });
          break;
        }
        case O.paintImageXObject: case O.paintInlineImageXObject: case O.paintImageMaskXObject: case O.paintJpegXObject: case O.paintImageXObjectRepeat:
          immagini.push({ r: box(ctm, 0, 0, 1, 1), i }); break;
        case O.constructPath: {
          const [ops, c] = a; let k = 0, R = null;
          for (const op of ops) {
            if (op === O.rectangle) { const [x, y, w, hh] = c.slice(k, k + 4); k += 4; const b = box(ctm, Math.min(x, x + w), Math.min(y, y + hh), Math.max(x, x + w), Math.max(y, y + hh)); R = R ? [Math.min(R[0], b[0]), Math.min(R[1], b[1]), Math.max(R[2], b[2]), Math.max(R[3], b[3])] : b; }
            else if (op === O.moveTo || op === O.lineTo) { const p = pt(ctm, c[k], c[k + 1]); k += 2; R = R ? [Math.min(R[0], p[0]), Math.min(R[1], p[1]), Math.max(R[2], p[0]), Math.max(R[3], p[1])] : [p[0], p[1], p[0], p[1]]; }
            else if (op === O.curveTo) k += 6; else if (op === O.curveTo2 || op === O.curveTo3) k += 4;
          }
          path = R; break;
        }
        case O.fill: case O.eoFill: case O.fillStroke: case O.eoFillStroke:
          if (path) pieni.push({ r: path, fill: gs.fill.slice(), i, dopoImg: immagini.length }); path = null; break;
        case O.endPath: case O.stroke: case O.closeStroke: path = null; break;
      }
    }
    return { corse, immagini, pieni, ops: F.length };
  }
  // nome di famiglia del carattere: senza il prefisso del sottoinsieme (ABCDEF+) e senza lo stile
  const famiglia = n => String(n || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,_ ]?(Bold|Italic|Oblique|Regular|Roman|Book|Medium|Light|Semi ?bold|Demi|Black|Heavy|Condensed|Narrow|It|Bd|BdIt)+$/i, '').replace(/(PSMT|MT|PS)$/, '').toLowerCase();
  const sottoinsieme = n => (/^([A-Z]{6})\+/.exec(String(n || '')) || [])[1] || '';

  // segni sulla pagina: caratteri estranei in una riga, righe fuori posto, testo invisibile o bianco, coperture sulle scansioni
  function segniPagina(D, view, p, uso) {
    const [vx0, vy0, vx1, vy1] = view, pagArea = (vx1 - vx0) * (vy1 - vy0), out = [];
    const scansioni = D.immagini.filter(m => area(m.r) >= pagArea * 0.5);
    const scansione = scansioni.length > 0;
    const testoVero = D.corse.filter(c => c.mode !== 3 && c.mode !== 7);
    // righe: stesso orientamento, linea di base vicina
    const righe = [];
    for (const c of testoVero.slice().sort((a, b) => b.base - a.base || a.x - b.x)) {
      const R = righe.find(r => Math.abs(r.dir - c.dir) < 0.02 && Math.abs(r.base - c.base) <= Math.max(1.2, c.size * 0.35) && Math.abs(r.size - c.size) <= Math.max(1.5, r.size * 0.3));
      if (R) { R.c.push(c); } else righe.push({ base: c.base, dir: c.dir, size: c.size, c: [c] });
    }
    for (const R of righe) {
      if (R.c.length < 2) continue;
      const peso = new Map(); for (const c of R.c) peso.set(c.font, (peso.get(c.font) || 0) + c.t.replace(/\s/g, '').length);
      const [princ, np] = [...peso].sort((a, b) => b[1] - a[1])[0]; const tot = [...peso.values()].reduce((a, b) => a + b, 0);
      if (np / tot < 0.6) continue;
      for (const c of R.c) {
        if (c.font === princ) continue;
        const len = c.t.replace(/\s/g, '').length; if (len > 30 || !/\d/.test(c.t)) continue;
        const stessaFam = famiglia(c.font) === famiglia(princ), sub = sottoinsieme(c.font) && sottoinsieme(princ) && sottoinsieme(c.font) !== sottoinsieme(princ);
        const raro = (uso.get(c.font) || 0) <= 2;
        // stesso carattere ma da un sottoinsieme diverso: l'ha scritto un altro programma
        if (stessaFam && sub) out.push({ sev: 'forte', tipo: 'carattere', p, r: c.r, titolo: 'Cifre scritte con un altro programma', testo: c.t.trim(), dettaglio: `«${c.t.trim()}» usa lo stesso carattere del resto della riga (${famiglia(princ)}), ma incorporato una seconda volta: succede quando un testo viene aggiunto o sostituito con un altro programma.` });
        else if (!stessaFam && raro) out.push({ sev: 'medio', tipo: 'carattere', p, r: c.r, titolo: 'Cifre in un carattere diverso dal resto della riga', testo: c.t.trim(), dettaglio: `«${c.t.trim()}» è scritto in ${c.font.replace(/^[A-Z]{6}\+/, '')}, usato solo qui; il resto della riga in ${princ.replace(/^[A-Z]{6}\+/, '')}.` });
      }
      // un pezzo della riga più alto o più basso di poco: allineato a mano
      const basi = R.c.map(c => c.base).sort((a, b) => a - b), med = basi[basi.length >> 1];
      for (const c of R.c) { const d = Math.abs(c.base - med); if (d >= 0.6 && d <= R.size * 0.3 && /\d/.test(c.t) && c.t.replace(/\s/g, '').length <= 30 && R.c.filter(x => Math.abs(x.base - med) < 0.2).length >= 2 && !out.some(o => o.r === c.r)) out.push({ sev: 'medio', tipo: 'allineamento', p, r: c.r, titolo: 'Cifre fuori riga', testo: c.t.trim(), dettaglio: `«${c.t.trim()}» è ${r1(d)} punti fuori dalla linea delle altre parole: il testo originale è allineato, quello aggiunto a mano spesso no.` }); }
    }
    // testo invisibile su una pagina che non è una scansione, o bianco su fondo bianco
    const invisibili = D.corse.filter(c => (c.mode === 3 || c.mode === 7) && !scansione && c.t.trim().length >= 3);
    if (invisibili.length) out.push({ sev: 'medio', tipo: 'nascosto', p, r: invisibili[0].r, titolo: 'Testo invisibile', testo: invisibili.map(c => c.t).join(' ').trim().slice(0, 160), dettaglio: 'Testo presente nel file ma non disegnato: chi legge non lo vede, i programmi (e chi copia il testo) sì.' });
    const bianchi = testoVero.filter(c => c.fill.every(v => v > 0.96) && !D.pieni.some(q => q.i < c.i && inter(q.r, c.r) > area(c.r) * 0.5 && !q.fill.every(v => v > 0.9)) && !D.immagini.some(m => m.i < c.i && inter(m.r, c.r) > area(c.r) * 0.5));
    if (bianchi.length && bianchi.reduce((a, c) => a + c.t.length, 0) >= 4) out.push({ sev: 'medio', tipo: 'nascosto', p, r: bianchi[0].r, titolo: 'Testo bianco su fondo bianco', testo: bianchi.map(c => c.t).join(' ').trim().slice(0, 160), dettaglio: 'Testo scritto in bianco: non si vede sulla pagina ma c’è.' });
    // scansioni: rettangoli pieni chiari sopra l'immagine, testo visibile scritto sopra
    if (scansione) {
      const img = scansioni[0];
      for (const q of D.pieni) {
        if (q.i < img.i || !q.fill.every(v => v > 0.85)) continue;
        const a = area(q.r); if (a < 30 || a > pagArea * 0.3 || inter(q.r, img.r) < a * 0.8) continue;
        out.push({ sev: 'forte', tipo: 'copertura', p, r: q.r, titolo: 'Riquadro chiaro sopra la scansione', testo: '', dettaglio: 'Sulla scansione è stato disegnato un rettangolo pieno chiaro: copre ciò che c’era sotto. È il modo più comune di cancellare un dato da un documento scansionato.' });
      }
      const sopra = testoVero.filter(c => c.i > img.i && inter(c.r, img.r) > area(c.r) * 0.5);
      if (sopra.length) {
        const gruppi = []; for (const c of sopra) { const g = gruppi.find(g => Math.abs(g.base - c.base) < 3 && c.x - g.r[2] < c.size * 3); if (g) { g.t += c.t; g.r = [Math.min(g.r[0], c.r[0]), Math.min(g.r[1], c.r[1]), Math.max(g.r[2], c.r[2]), Math.max(g.r[3], c.r[3])]; } else gruppi.push({ base: c.base, t: c.t, r: c.r.slice() }); }
        const t = gruppi.map(g => g.t.trim()).join(' · ');
        out.push({ sev: 'info', tipo: 'sopra', p, r: gruppi[0].r, rs: gruppi.map(g => g.r), titolo: `Testo scritto sopra la scansione (${plural(gruppi.length, 'punto', 'punti')})`, testo: t.slice(0, 160), dettaglio: `Testo vero disegnato sopra l’immagine della pagina, non il testo invisibile dell’OCR: «${t.slice(0, 100)}». È normale per un modulo compilato al computer o per un timbro digitale; diventa sospetto se sotto c’è un riquadro che copre la scansione.` });
      }
    }
    // pagine digitali: un rettangolo chiaro disegnato DOPO del testo e sopra di esso lo nasconde
    for (const q of D.pieni) {
      if (!q.fill.every(v => v > 0.9)) continue;
      const a = area(q.r); if (a < 20 || a > pagArea * 0.3) continue;
      // la parte di ogni scritta che il rettangolo copre (in larghezza) per almeno metà altezza
      const coperti = D.corse.filter(c => c.i < q.i && c.mode !== 3 && c.mode !== 7 && !c.fill.every(v => v > 0.9)).map(c => {
        const oy = Math.min(c.r[3], q.r[3]) - Math.max(c.r[1], q.r[1]), ox0 = Math.max(c.r[0], q.r[0]), ox1 = Math.min(c.r[2], q.r[2]), w = c.r[2] - c.r[0];
        if (oy < (c.r[3] - c.r[1]) * 0.5 || ox1 - ox0 < Math.min(w, c.size) * 0.6 || w <= 0) return null;
        const n = c.t.length, a = Math.max(0, Math.floor((ox0 - c.r[0]) / w * n)), b = Math.min(n, Math.ceil((ox1 - c.r[0]) / w * n));
        // parole intere: quelle coperte almeno per metà
        let pos = 0; const parole = [];
        for (const w of c.t.split(/(\s+)/)) { const w0 = pos, w1 = pos + w.length; pos = w1; if (!w.trim()) continue; const ov = Math.min(w1, b) - Math.max(w0, a); if (ov >= w.length / 2) parole.push(w); }
        return parole.join(' ');
      }).filter(t => t && t.trim());
      if (!coperti.length) continue;
      const t = coperti.join(' ').replace(/\s+/g, ' ').trim();
      out.push({ sev: 'forte', tipo: 'copertura', p, r: q.r, titolo: 'Testo coperto da un riquadro bianco', testo: t.slice(0, 120), dettaglio: `Sotto un rettangolo bianco disegnato dopo il testo c’è ancora la scritta «${t.slice(0, 80)}», che non si vede più: è il modo più semplice di «cancellare» un dato e scriverne un altro sopra.` });
    }
    return { segni: out, scansione };
  }

  /* ---------- analisi completa di un file ---------- */
  async function analizza(bytes, { onFase = () => { } } = {}) {
    const s = latin(bytes), ends = salvataggi(bytes, s), sig = firme(s, bytes.length), segni = [];
    const add = (sev, titolo, dettaglio, extra = {}) => segni.push({ sev, titolo, dettaglio, ...extra });
    onFase('Lettura delle versioni salvate nel file…');
    // versioni: dalla prima all'ultima (massimo 12, le più recenti)
    const tagli = ends.length > 12 ? [ends[0], ...ends.slice(-11)] : ends;
    const versioni = [];
    for (const [k, fine] of tagli.entries()) {
      const ultima = k === tagli.length - 1;
      try { const doc = await apri(ultima ? bytes : bytes.subarray(0, fine)); versioni.push({ fine, doc, d: await descrivi(doc, { token: (k === 0 || ultima) && tagli.length > 1 }) }); }
      catch (e) { if (ultima) throw e; versioni.push({ fine, doc: null, d: null, errore: e.message }); }
    }
    const fin = versioni[versioni.length - 1], D = fin.d, adesso = Date.now();
    // vita del documento: creazione, ogni salvataggio, ogni firma
    const vita = [];
    // ogni firma appartiene alla versione che chiude (i byte firmati finiscono lì)
    const versioneDi = g => versioni.findIndex(v => v.fine >= g.fine - 4), firmaDi = k => sig.filter(g => versioneDi(g) === k);
    versioni.forEach((v, k) => {
      if (!v.d) { vita.push({ k, titolo: `Versione ${k + 1}`, testo: 'non leggibile da sola', sev: 'info' }); return; }
      const prev = versioni[k - 1]?.d, diff = prev ? differenze(prev, v.d) : null, fs = firmaDi(k);
      const prog = chi(v.d.producer) || chi(v.d.creator);
      const cose = [];
      if (diff) {
        if (diff.pagine > 0) cose.push(`aggiunte ${plural(diff.pagine, 'pagina', 'pagine')}`); if (diff.pagine < 0) cose.push(`tolte ${plural(-diff.pagine, 'pagina', 'pagine')}`);
        if (diff.testo.length) cose.push(`cambiato il testo ${diff.testo.length === 1 ? 'della pagina ' + diff.testo[0] : 'delle pagine ' + diff.testo.slice(0, 6).join(', ')}`);
        if (diff.campi) cose.push(`compilati ${plural(diff.campi, 'campo', 'campi')} del modulo`);
        if (diff.annAgg) cose.push(`aggiunte ${plural(diff.annAgg, 'annotazione', 'annotazioni')} (${[...diff.tipiAnn].filter(t => t !== 'Widget').map(t => ({ FreeText: 'testo', Stamp: 'timbro', Ink: 'disegno a mano', Highlight: 'evidenziazione', Square: 'riquadro', Text: 'nota', Widget: 'campo' }[t] || t)).join(', ') || 'campi'})`);
        if (diff.annTolte) cose.push(`tolte ${plural(diff.annTolte, 'annotazione', 'annotazioni')}`);
      }
      if (fs.length) cose.push(fs.map(g => g.ts ? 'marca temporale' : `firma digitale${g.nome ? ' di ' + g.nome : ''}`).join(', '));
      if (diff && !cose.length) cose.push('nessuna differenza visibile (metadati o struttura)');
      vita.push({ k, quando: k === 0 ? v.d.creato : v.d.modificato, titolo: k === 0 ? 'Creato' : `Salvato di nuovo (${k + 1}ª versione)`, prog, testo: k === 0 ? `${plural(v.d.n, 'pagina', 'pagine')}${fs.length ? ' · ' + cose.join(', ') : ''}` : cose.join(' · '), diff, firme: fs, sev: diff && (diff.testo.length || diff.pagine) ? 'forte' : 'info' });
    });
    // firme e ciò che è successo dopo
    for (const g of sig) {
      const kv = versioneDi(g); if (kv < 0 || g.ts) continue;
      const dopo = versioni.slice(kv + 1).filter(v => v.d);
      if (!dopo.length) { add('ok', `Firma digitale${g.nome ? ' di ' + g.nome : ''}: copre tutto il file`, 'Dopo la firma il file non è stato cambiato. Per sapere se la firma è valida (certificato, revoca, data) apri il file con «Firme digitali e P7M».'); continue; }
      const prima = versioni[kv].d, last = dopo[dopo.length - 1].d, df = prima && last ? differenze(prima, last) : null;
      if (df && (df.testo.length || df.pagine)) add('forte', 'Il testo è stato cambiato dopo la firma digitale', `Dopo la firma${g.nome ? ' di ' + g.nome : ''}${g.quando ? ' del ' + new Date(g.quando).toLocaleDateString('it-IT') : ''} il file è stato salvato di nuovo e il testo ${df.testo.length === 1 ? 'della pagina ' + df.testo[0] : df.testo.length ? 'delle pagine ' + df.testo.join(', ') : ''}${df.pagine ? (df.testo.length ? ' e ' : '') + 'il numero di pagine' : ''} è cambiato. La firma vale solo per la versione firmata, che puoi recuperare qui sotto.`, { versione: kv });
      else add('info', 'Aggiunte dopo la firma digitale', `Dopo la firma${g.nome ? ' di ' + g.nome : ''} sono stati aggiunti ${df && (df.annAgg || df.campi) ? 'annotazioni o campi compilati' : 'altre firme, marche temporali o dati di verifica'}: il testo firmato non è cambiato.`, { versione: kv });
    }
    // salvataggi che cambiano il testo
    const cambi = vita.filter(x => x.diff && (x.diff.testo.length || x.diff.pagine));
    if (cambi.length && !segni.some(x => /dopo la firma/.test(x.titolo) && x.sev === 'forte')) add('forte', `Il testo è stato cambiato dopo la creazione (${plural(cambi.length, 'salvataggio', 'salvataggi')})`, 'Il file contiene ancora la versione precedente: le differenze sono qui sotto, e la versione di prima si può scaricare e confrontare.');
    // differenze parola per parola tra la prima versione e quella finale
    let confronto = null;
    if (versioni.length > 1 && versioni[0].d && D.toks.length) {
      try { confronto = await DocDiff.compare(versioni[0].d.toks, D.toks); confronto.list = confronto.list.filter(c => c.type !== 'visual'); } catch (e) { console.warn(e); }
    }
    // metadati: date e programmi
    const crea = chi(D.creator), prod = chi(D.producer), prima = versioni[0].d || D;
    if (D.creato && D.modificato && D.modificato < D.creato - 120000) add('medio', 'La data di modifica è precedente alla creazione', `Creato il ${quando(D.creato)}, modificato il ${quando(D.modificato)}: un programma normale non scrive date così. Succede quando le date vengono cambiate a mano.`);
    for (const [k, t] of [['creazione', D.creato], ['modifica', D.modificato]]) if (t && (t > adesso + 2 * 864e5 || t < Date.UTC(1993, 0, 1))) add('medio', `Data di ${k} impossibile`, `Il file dichiara il ${quando(t)}${t > adesso ? ', nel futuro' : ', prima che esistesse il formato PDF'}.`);
    if (D.modificatoInfo && D.modificatoXmp && Math.abs(D.modificatoInfo - D.modificatoXmp) > 5 * 60000) add('medio', 'Le due date di modifica del file non coincidono', `Il PDF scrive la data di modifica in due punti: ${quando(D.modificatoInfo)} e ${quando(D.modificatoXmp)}. Un programma che salva il file aggiorna entrambe; una sola cambiata indica un intervento parziale.`);
    if (D.creato && D.modificato && D.modificato - D.creato > 120000 && versioni.length === 1) add('info', 'Modificato dopo la creazione', `Creato il ${quando(D.creato)} e salvato l’ultima volta il ${quando(D.modificato)}, riscrivendo tutto il file: le versioni precedenti non sono più dentro.`);
    if (prod && prod.k === 'editor' && (!crea || crea.n !== prod.n)) add(cambi.length ? 'medio' : 'info', `Salvato con ${prod.n}`, `${crea ? `Creato con ${crea.n}, poi` : 'Il file è stato'} salvato con ${prod.n}, un programma che permette di cambiare il testo dei PDF. Non è una prova di modifica (lo si usa anche per unire, ruotare o comprimere), ma è il passaggio in cui una modifica può avvenire.`);
    if (prod && prod.k === 'stampa') add('info', `Ristampato in PDF (${prod.n})`, 'Il PDF è stato ottenuto «stampando» un altro documento: la struttura originale (versioni, firme, metadati) non c’è più, quindi molti controlli non sono possibili.');
    if (versioni.length > 1 && prima.producer && D.producer && chi(prima.producer)?.n !== chi(D.producer)?.n) add('info', 'Programmi diversi nelle versioni', `La prima versione è stata salvata con ${chi(prima.producer)?.n}, l’ultima con ${chi(D.producer)?.n}.`);
    // pagine: caratteri, righe, testo nascosto, scansioni
    onFase('Esame delle pagine…');
    const pagine = [], disegni = [], uso = new Map();
    for (let p = 1; p <= Math.min(fin.doc.numPages, 60); p++) {
      const page = await fin.doc.getPage(p);
      const dd = await disegno(page).catch(e => (console.warn(e), { corse: [], immagini: [], pieni: [] }));
      disegni.push({ page, dd });
      const righeFont = new Map(); for (const c of dd.corse) { const k = c.font + '|' + Math.round(c.base); righeFont.set(k, 1); }
      for (const k of righeFont.keys()) { const f = k.split('|')[0]; uso.set(f, (uso.get(f) || 0) + 1); }
    }
    for (const [k, { page, dd }] of disegni.entries()) {
      const p = k + 1, r = segniPagina(dd, page.view, p, uso);
      pagine.push({ p, w: page.view[2] - page.view[0], h: page.view[3] - page.view[1], view: page.view, scansione: r.scansione, segni: r.segni });
      segni.push(...r.segni);
    }
    const nScan = pagine.filter(x => x.scansione).length;
    if (nScan && nScan < pagine.length && pagine.length >= 2) add('info', `${plural(nScan, 'pagina è una scansione', 'pagine sono scansioni')}, le altre no`, `Pagine scansionate: ${pagine.filter(x => x.scansione).map(x => x.p).join(', ')}. È normale per un documento con allegati; in un documento unico può indicare una pagina sostituita.`);
    // esito
    const forti = segni.filter(x => x.sev === 'forte').length, medi = segni.filter(x => x.sev === 'medio').length;
    const esito = forti ? 'alterato' : medi ? 'dubbi' : 'pulito';
    for (const v of versioni.slice(0, -1)) try { v.doc?.destroy(); } catch { }   // le versioni precedenti si riaprono dai byte se servono
    return { esito, segni, vita, versioni: versioni.map(v => ({ fine: v.fine, d: v.d ? { n: v.d.n, creato: v.d.creato, modificato: v.d.modificato, producer: v.d.producer } : null })), firme: sig, pagine, confronto, meta: { creato: D.creato, modificato: D.modificato, producer: D.producer, creator: D.creator, autore: D.autore, titolo: D.titolo, pagine: D.n }, doc: fin.doc };
  }
  const quando = t => t ? new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  return { analizza, salvataggi, firme, chi, data, famiglia, quando, latin };
})();

/* ---------- lo strumento ---------- */
async function startAutentica(stage, files = []) {
  const elenco = [];   // { file, bytes, R, errore }
  let cur = 0, zoomSegno = null;
  const main = h('div', { class: 'ws-main au-main' }), side = h('div', { class: 'au-side' });
  const ESITO = { alterato: ['bad', 'Segni di alterazione', 'Il file mostra segni concreti di modifica dopo la creazione: verifica con chi te l’ha mandato o confronta con l’originale.'],
    dubbi: ['warn', 'Da verificare', 'Nessuna prova di modifica, ma alcuni dettagli meritano un’occhiata: sono spiegati qui sotto.'],
    pulito: ['ok', 'Nessun segno di modifica', 'Non sono stati trovati segni di alterazione. Un PDF non si può dimostrare autentico: si può solo non trovare traccia di modifiche.'] };
  const SEV = { forte: ['bad', 'forte'], medio: ['warn', 'da guardare'], info: ['', 'informazione'], ok: ['ok', 'a posto'] };
  const fileOf = (bytes, name) => new File([bytes], name, { type: 'application/pdf' });
  async function leggi(f) {
    const bytes = new Uint8Array(await f.arrayBuffer()), it = { file: f, bytes, R: null, errore: null };
    try {
      if (typeof PdfCrypt !== 'undefined' && PdfCrypt.looksEncrypted(bytes)) throw new Error('il PDF è protetto da password: sbloccalo prima con «Proteggi e sblocca» (la verifica si fa sulla copia in chiaro, che però perde le versioni precedenti)');
      it.R = await Autentica.analizza(bytes, { onFase: t => Busy.set?.(null, `${f.name}: ${t}`) });
    } catch (e) { it.errore = /password/i.test(e.message) ? 'il PDF è protetto da password' : /Invalid PDF|structure|header|xref/i.test(e.message || '') ? 'non è un PDF valido o è danneggiato' : (e.message || 'file non leggibile'); }
    elenco.push(it);
  }
  if (files.length) await withBusy('Verifica dei file…', async () => { for (const [i, f] of files.entries()) { Busy.set?.(i / files.length, f.name); await leggi(f); } });
  const chip = (cls, t) => h('span', { class: 'au-chip ' + cls }, t);
  // pagina disegnata con i segni sopra
  async function paginaVista(R, pg, segniPag) {
    const box = h('div', { class: 'au-pg' }), wrap = h('div', { class: 'au-pgw' });
    const page = await R.doc.getPage(pg.p), W = Math.min(760, main.clientWidth - 48 || 700), vp1 = page.getViewport({ scale: 1 }), sc = W / vp1.width, vp = page.getViewport({ scale: sc * (devicePixelRatio || 1) });
    const c = h('canvas', { width: Math.round(vp.width), height: Math.round(vp.height), style: { width: W + 'px', height: Math.round(vp1.height * sc) + 'px' } });
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    wrap.append(c);
    const vpc = page.getViewport({ scale: sc });
    for (const s of segniPag) for (const r of s.rs || (s.r ? [s.r] : [])) {
      const [x0, y0, x1, y1] = vpc.convertToViewportRectangle(r), L = Math.min(x0, x1), T = Math.min(y0, y1);
      const m = h('button', { type: 'button', class: 'au-mark ' + (SEV[s.sev]?.[0] || 'info'), title: s.titolo, 'aria-label': s.titolo, style: { left: (L - 3) + 'px', top: (T - 3) + 'px', width: (Math.abs(x1 - x0) + 6) + 'px', height: (Math.abs(y1 - y0) + 6) + 'px' }, onclick: () => { zoomSegno = s; disegnaSide(); } });
      if (s === zoomSegno) m.classList.add('on');
      wrap.append(m);
    }
    box.append(h('div', { class: 'au-pgh' }, h('b', {}, `Pagina ${pg.p}`), pg.scansione ? chip('', 'scansione') : null, segniPag.filter(s => s.sev !== 'info').length ? chip(segniPag.some(s => s.sev === 'forte') ? 'bad' : 'warn', plural(segniPag.filter(s => s.sev !== 'info').length, 'segno', 'segni')) : null), wrap);
    page.cleanup();
    return box;
  }
  async function disegna() {
    const it = elenco[cur];
    if (!it) { main.replaceChildren(h('div', { class: 'vd-empty' }, h('h3', {}, 'Carica un PDF'), h('p', {}, 'Trascina il PDF da verificare: una fattura, un contratto, un certificato, un estratto conto ricevuti da altri.'))); disegnaSide(); return; }
    if (it.errore) { main.replaceChildren(h('div', { class: 'vd-empty' }, h('h3', {}, it.file.name), h('p', {}, 'Non è stato possibile verificarlo: ' + it.errore))); disegnaSide(); return; }
    const R = it.R, [cls, tit, sub] = ESITO[R.esito];
    const forti = R.segni.filter(s => s.sev === 'forte'), medi = R.segni.filter(s => s.sev === 'medio');
    const testa = h('section', { class: 'au-esito ' + cls }, h('div', { class: 'au-ico' }, ic(R.esito === 'pulito' ? 'shield' : 'alert', 26)),
      h('div', {}, h('h2', {}, tit), h('p', {}, sub), h('div', { class: 'au-num' }, chip('bad', `${forti.length} forti`), chip('warn', `${medi.length} da guardare`), chip('', `${plural(R.versioni.length, 'versione', 'versioni')} nel file`), R.firme.length ? chip('', plural(R.firme.length, 'firma', 'firme')) : null)));
    // vita del documento
    const vita = h('section', { class: 'vd-sec' }, h('h3', {}, 'La vita del documento'), h('ol', { class: 'au-vita' }, R.vita.map(v => h('li', { class: v.sev === 'forte' ? 'bad' : '' },
      h('div', { class: 'au-vt' }, h('b', {}, v.titolo), v.quando ? h('span', {}, Autentica.quando(v.quando)) : null, v.prog ? h('span', { class: 'au-prog' }, v.prog.n) : null),
      h('div', { class: 'small' }, v.testo),
      v.k < R.versioni.length - 1 ? h('div', { class: 'au-vacts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => scaricaVersione(it, v.k) }, ic('download', 14), 'Scarica questa versione'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => confronta(it, v.k) }, ic('swap', 14), 'Confrontala con la finale')) : null))));
    // differenze parola per parola
    const C = R.confronto, diffSez = C && C.list.length ? h('section', { class: 'vd-sec' }, h('h3', {}, `Che cosa è cambiato rispetto alla prima versione (${C.list.length})`),
      h('ul', { class: 'au-diff' }, C.list.slice(0, 40).map(c => h('li', {}, h('span', { class: 'au-pp' }, `p. ${c.pageB}`), c.type === 'add' ? [h('span', { class: 'au-add' }, c.newT)] : c.type === 'del' ? [h('span', { class: 'au-del' }, c.oldT)] : [h('span', { class: 'au-del' }, c.oldT), ic('arrow', 14), h('span', { class: 'au-add' }, c.newT)]))),
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm primary', onclick: () => pdfEvidenziato(it) }, ic('download', 15), 'PDF con le modifiche evidenziate'))) : null;
    // segni
    const lista = R.segni.slice().sort((a, b) => ['forte', 'medio', 'ok', 'info'].indexOf(a.sev) - ['forte', 'medio', 'ok', 'info'].indexOf(b.sev));
    const segniSez = h('section', { class: 'vd-sec' }, h('h3', {}, 'Controlli'), lista.length ? h('ul', { class: 'au-segni' }, lista.slice(0, 60).map(s => h('li', { class: SEV[s.sev]?.[0] || '' },
      h('button', { type: 'button', class: 'au-sb', onclick: () => { zoomSegno = s; disegnaSide(); if (s.p) main.querySelector(`.au-pg[data-p="${s.p}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
        chip(SEV[s.sev]?.[0] || '', SEV[s.sev]?.[1] || s.sev), h('b', {}, s.titolo), s.p ? h('span', { class: 'muted small' }, ` · pagina ${s.p}`) : null),
      h('p', { class: 'small' }, s.dettaglio)))) : h('p', { class: 'muted' }, 'Nessun segno particolare.'));
    main.replaceChildren(h('div', { class: 'vd-body' }, testa, segniSez, diffSez, vita, h('section', { class: 'vd-sec' }, h('h3', {}, 'Le pagine'), h('p', { class: 'muted small' }, 'I riquadri colorati indicano dove sono i segni: toccali per la spiegazione.'), h('div', { class: 'au-pages' }))));
    const cont = main.querySelector('.au-pages');
    for (const pg of R.pagine.slice(0, 30)) { if (elenco[cur] !== it) return; const el = await paginaVista(R, pg, pg.segni); el.dataset.p = pg.p; cont.append(el); }
    disegnaSide();
  }
  function disegnaSide() {
    const it = elenco[cur], R = it?.R;
    const files = elenco.length > 1 ? [h('div', { class: 'vd-st' }, 'File'), h('ul', { class: 'au-files' }, elenco.map((x, i) => h('li', {}, h('button', { type: 'button', class: 'au-fb' + (i === cur ? ' on' : ''), onclick: () => { cur = i; zoomSegno = null; disegna(); } },
      h('b', {}, x.file.name), x.errore ? chip('', 'non letto') : chip(ESITO[x.R.esito][0], ESITO[x.R.esito][1])))))] : [];
    const z = zoomSegno ? [h('div', { class: 'vd-st' }, 'Segno selezionato'), h('div', { class: 'au-zoom ' + (SEV[zoomSegno.sev]?.[0] || '') }, h('b', {}, zoomSegno.titolo), zoomSegno.testo ? h('div', { class: 'au-zt' }, zoomSegno.testo) : null, h('p', { class: 'small' }, zoomSegno.dettaglio))] : [];
    const M = R?.meta;
    side.replaceChildren(...files, ...z, ...(R ? [h('div', { class: 'vd-st' }, 'Dati del file'), h('dl', { class: 'vd-dl' },
      h('dt', {}, 'Creato'), h('dd', {}, Autentica.quando(M.creato)), h('dt', {}, 'Ultimo salvataggio'), h('dd', {}, Autentica.quando(M.modificato)),
      h('dt', {}, 'Programma'), h('dd', {}, [Autentica.chi(M.creator)?.n, Autentica.chi(M.producer)?.n].filter((x, i, A) => x && A.indexOf(x) === i).join(' → ') || '—'),
      M.autore ? [h('dt', {}, 'Autore'), h('dd', {}, M.autore)] : null, h('dt', {}, 'Pagine'), h('dd', {}, String(M.pagine)),
      h('dt', {}, 'Versioni nel file'), h('dd', {}, String(R.versioni.length)), h('dt', {}, 'Firme digitali'), h('dd', {}, R.firme.length ? R.firme.map(g => (g.ts ? 'marca temporale' : g.nome || 'firma') + (g.quando ? ` (${new Date(g.quando).toLocaleDateString('it-IT')})` : '')).join(' · ') : 'nessuna')),
      ...(R.firme.length ? [h('button', { type: 'button', class: 'btn sm', onclick: () => handoff('firme', [it.file]) }, ic('seal', 15), 'Verifica le firme')] : [])] : []),
      h('div', { class: 'vd-st' }, 'Come funziona'),
      h('p', { class: 'small muted' }, 'Molti programmi, quando salvano un PDF modificato, aggiungono la nuova versione in coda al file lasciando dentro la precedente: qui le versioni vengono recuperate e confrontate. Si controllano anche date e programmi dei metadati, i caratteri di ogni riga, il testo nascosto e ciò che è stato disegnato sopra le scansioni.'),
      h('p', { class: 'small muted' }, 'Nessun controllo automatico può garantire che un PDF sia autentico: un file ristampato o ricreato da zero non porta tracce. Per i documenti importanti chiedi l’originale a chi l’ha emesso. Tutto avviene su questo dispositivo.'));
  }
  const nomeBase = n => n.replace(/\.pdf$/i, '');
  function scaricaVersione(it, k) { const b = it.bytes.subarray(0, it.R.versioni[k].fine); download(b.slice(), `${nomeBase(it.file.name)} - versione ${k + 1}.pdf`, 'application/pdf'); }
  function confronta(it, k) { handoff('confronta', [fileOf(it.bytes.subarray(0, it.R.versioni[k].fine).slice(), `${nomeBase(it.file.name)} - versione ${k + 1}.pdf`), fileOf(it.bytes.slice(), `${nomeBase(it.file.name)} - versione finale.pdf`)]); }
  async function pdfEvidenziato(it) {
    await withBusy('Preparazione del PDF…', async () => { const r = await annotateDiff(it.bytes.slice(), it.R.confronto, { label: 'prima versione' }); download(r.bytes, `${nomeBase(it.file.name)} - modifiche evidenziate.pdf`, 'application/pdf'); });
  }
  async function rapporto() {
    const it = elenco[cur]; if (!it?.R) return toast('Carica un PDF leggibile', 'error');
    await withBusy('Preparazione del rapporto…', async () => {
      const R = it.R, pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let page = pdf.addPage([595.28, 841.89]), y = 780; const M = 56, W = 595.28 - 2 * M, safe = s => pdfSafe(font, s);
      const riga = (t, { f = font, size = 10, gap = 4, colore = [0.1, 0.1, 0.15] } = {}) => {
        let r = ''; const out = []; for (const w of String(t).split(' ')) { const x = r ? r + ' ' + w : w; if (f.widthOfTextAtSize(safe(x), size) > W) { out.push(r); r = w; } else r = x; } if (r) out.push(r);
        for (const l of out) { if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 780; } page.drawText(safe(l), { x: M, y, size, font: f, color: PDFLib.rgb(...colore) }); y -= size + 3; } y -= gap; };
      riga('Verifica di autenticità', { f: bold, size: 16, gap: 2 }); riga(it.file.name, { size: 10, gap: 10, colore: [0.4, 0.4, 0.45] });
      riga(`Esito: ${ESITO[R.esito][1]}`, { f: bold, size: 13, colore: R.esito === 'alterato' ? [0.7, 0.1, 0.1] : R.esito === 'dubbi' ? [0.6, 0.4, 0] : [0.05, 0.45, 0.25] }); riga(ESITO[R.esito][2], { gap: 12 });
      riga('Controlli', { f: bold, size: 12 }); for (const s of R.segni) { riga(`[${SEV[s.sev]?.[1] || s.sev}] ${s.titolo}${s.p ? ' (pagina ' + s.p + ')' : ''}`, { f: bold, size: 10, gap: 1 }); riga(s.dettaglio, { size: 9.5, gap: 6 }); }
      if (R.confronto?.list.length) { riga('Differenze rispetto alla prima versione', { f: bold, size: 12 }); for (const c of R.confronto.list.slice(0, 80)) riga(`p. ${c.pageB}: ${c.type === 'add' ? 'aggiunto «' + c.newT + '»' : c.type === 'del' ? 'tolto «' + c.oldT + '»' : '«' + c.oldT + '» diventa «' + c.newT + '»'}`, { size: 9.5, gap: 2 }); y -= 8; }
      riga('La vita del documento', { f: bold, size: 12 }); for (const v of R.vita) riga(`${v.titolo}${v.quando ? ' · ' + Autentica.quando(v.quando) : ''}${v.prog ? ' · ' + v.prog.n : ''}: ${v.testo}`, { size: 9.5, gap: 2 });
      y -= 10; riga('Nessun controllo automatico può garantire che un PDF sia autentico. Verifica eseguita sul dispositivo con file360, senza inviare il file.', { size: 8.5, colore: [0.4, 0.4, 0.45] });
      pdf.setTitle('Verifica di autenticità - ' + it.file.name);
      showResult([{ name: `Verifica di autenticità - ${nomeBase(it.file.name)}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'), bytes: await pdf.save(), type: 'application/pdf', info: ESITO[R.esito][1] }], { title: 'Rapporto pronto', note: 'Il file resta sul tuo dispositivo.' });
    });
  }
  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: rapporto }, ic('download', 18), 'Scarica il rapporto')]);
  ws.classList.add('vd-ws', 'au-ws');
  onLeave(() => { for (const it of elenco) { try { it.R?.doc?.destroy(); } catch { } } });
  await disegna();
}
