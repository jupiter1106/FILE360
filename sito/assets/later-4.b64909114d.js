const PDFA = (() => {
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFNumber, PDFRawStream, PDFHexString, PDFString } = PDFLib;
  const N = s => PDFName.of(s);
  const ICC_B64 = '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';
  const OPS = new Set(`b B b* B* BDC BI BMC BT BX c cm CS cs d d0 d1 Do DP EI EMC ET EX f F f* G g gs h i ID j J K k l m M MP n q Q re RG rg ri s S SC sc SCN scn sh T* Tc Td TD Tf Tj TJ TL Tm Tr Ts Tw Tz v w W W* y ' "`.split(/\s+/));
  const R = {
    font: 'font non incorporati nel file', fontCharset: 'font senza elenco dei caratteri (CharSet/CIDSet)', fontType: 'tipo di font non ammesso',
    fontWidth: 'larghezze dei caratteri incoerenti', cmyk: 'colori CMYK', transp: 'trasparenze', jpx: 'immagini JPEG 2000', lzw: 'compressione LZW',
    bpc16: 'immagini a 16 bit', ops: 'comandi non standard', oc: 'livelli (contenuti opzionali)', annot: 'moduli, firme o annotazioni',
    tr: 'funzioni di trasferimento', ext: 'riferimenti esterni o PostScript', limits: 'valori oltre i limiti PDF/A', icc: 'profilo colore non compatibile',
    enc: 'documento protetto', notdef: 'caratteri senza glifo (.notdef)', broken: 'struttura non leggibile', encoding: 'codifica dei caratteri non standard', nested: 'annidamento grafico eccessivo',
  };
  const look = PT.look, num = PT.num, nm = PT.nm;
  const isStream = o => !!(o && o.dict instanceof PDFDict);
  const dictOf = o => o instanceof PDFDict ? o : isStream(o) ? o.dict : null;
  const getIn = (ctx, d, k) => { d = dictOf(look(ctx, d)); return d ? look(ctx, d.get(N(k))) : undefined; };

  /* ---------- colour spaces ---------- */
  function checkCS(ctx, cs, res, reasons, part) {
    cs = look(ctx, cs);
    if (cs instanceof PDFName) {
      const n = cs.decodeText();
      if (n === 'DeviceCMYK' || n === 'CMYK') reasons.add(R.cmyk);
      else if (!/^(DeviceRGB|DeviceGray|RGB|G|Pattern|I|Indexed)$/.test(n) && res) { const sub = getIn(ctx, res, 'ColorSpace'); if (sub instanceof PDFDict) { const v = sub.get(N(n)); if (v) checkCS(ctx, v, null, reasons, part); } }
      return;
    }
    if (!(cs instanceof PDFArray)) return;
    const a = cs.asArray(); const kind = nm(look(ctx, a[0]));
    if (kind === 'ICCBased') {
      const s = look(ctx, a[1]);
      try {
        const n = num(look(ctx, s.dict.get(N('N'))));
        const b = PT.streamBytes(s);
        if (part === 1 && b.length > 8 && b[8] > 2) reasons.add(R.icc);
        if (n === 4 && false) reasons.add(R.cmyk);
      } catch { reasons.add(R.icc); }
    } else if (kind === 'Indexed') checkCS(ctx, a[1], res, reasons, part);
    else if (kind === 'Separation') checkCS(ctx, a[2], res, reasons, part);
    else if (kind === 'DeviceN') checkCS(ctx, a[2], res, reasons, part);
    else if (kind === 'Pattern' && a[1]) checkCS(ctx, a[1], res, reasons, part);
    else if (kind === 'DeviceCMYK') reasons.add(R.cmyk);
  }
  function checkFilters(ctx, s, reasons, part) {
    const f = look(ctx, s.dict.get(N('Filter')));
    const list = f instanceof PDFArray ? f.asArray().map(x => nm(look(ctx, x))) : f ? [nm(f)] : [];
    if (list.some(x => x === 'LZWDecode' || x === 'LZW')) reasons.add(R.lzw);
    if (list.includes('JPXDecode')) reasons.add(R.jpx);
    if (s.dict.has(N('F'))) reasons.add(R.ext);
  }

  /* ---------- fonts ---------- */
  function checkFont(ctx, fontObj, reasons, part, st, usedCodes) {
    const fd0 = look(ctx, fontObj);
    if (!(fd0 instanceof PDFDict)) return;
    if (st.fontsSeen.has(fd0)) return; st.fontsSeen.add(fd0);
    const sub = nm(fd0.get(N('Subtype')));
    const base = nm(fd0.get(N('BaseFont'))) || '';
    const subset = /^[A-Z]{6}\+/.test(base);
    if (sub === 'Type3') {
      const procs = getIn(ctx, fd0, 'CharProcs');
      const res = getIn(ctx, fd0, 'Resources') || st.res;
      if (procs instanceof PDFDict) for (const [, v] of procs.entries()) { const s = look(ctx, v); if (isStream(s)) walk(ctx, PT.streamBytes(s), res, reasons, part, st, st.depth + 1); }
      return;
    }
    let desc = fd0, fd;
    if (sub === 'Type0') {
      const enc = look(ctx, fd0.get(N('Encoding')));
      if (enc instanceof PDFName && !/^Identity-[HV]$/.test(enc.decodeText())) reasons.add(R.encoding);
      const df = look(ctx, fd0.get(N('DescendantFonts')));
      desc = df instanceof PDFArray ? look(ctx, df.get(0)) : null;
      if (!(desc instanceof PDFDict)) { reasons.add(R.broken); return; }
    }
    fd = look(ctx, desc.get(N('FontDescriptor')));
    if (!(fd instanceof PDFDict)) { reasons.add(R.font); return; }
    const ff = look(ctx, fd.get(N('FontFile'))), ff2 = look(ctx, fd.get(N('FontFile2'))), ff3 = look(ctx, fd.get(N('FontFile3')));
    const prog = ff || ff2 || ff3;
    if (!prog) { reasons.add(R.font); return; }
    checkFilters(ctx, prog, reasons, part);
    const ff3sub = ff3 ? nm(ff3.dict.get(N('Subtype'))) : null;
    if (ff3sub === 'OpenType' && part === 1) reasons.add(R.fontType);
    if (sub === 'Type0') {
      const cidSub = nm(desc.get(N('Subtype')));
      if (part === 1 && subset && !fd.has(N('CIDSet'))) {
        if (cidSub === 'CIDFontType2' && ff2) st.fixes.push({ kind: 'cidset', fd, desc, prog: ff2 });
        else reasons.add(R.fontCharset);
      }
      if (cidSub === 'CIDFontType2' && ff2 && usedCodes) checkCidWidths(ctx, desc, ff2, usedCodes, reasons, st);
    } else {
      if ((ff || (ff3 && ff3sub === 'Type1C')) && subset && part === 1 && !fd.has(N('CharSet'))) reasons.add(R.fontCharset);
      if (ff2 && usedCodes) checkSimpleTTWidths(ctx, fd0, ff2, usedCodes, reasons, st);
      if (ff2 && sub === 'TrueType') { const flags = num(look(ctx, fd.get(N('Flags')))) || 0; if (flags & 4) { try { const tt = PT.parseTT(PT.streamBytes(ff2)); const keys = tt ? Object.keys(tt.cmaps) : []; if (!tt || (keys.length !== 1 && !keys.includes('3,0'))) reasons.add(R.encoding); } catch { reasons.add(R.encoding); } } }
      if (sub === 'TrueType') {
        const flags = num(look(ctx, fd.get(N('Flags')))) || 0;
        const enc = look(ctx, fd0.get(N('Encoding')));
        if (!(flags & 4)) {
          const encName = enc instanceof PDFName ? enc.decodeText() : enc instanceof PDFDict ? nm(enc.get(N('BaseEncoding'))) : null;
          if (encName !== 'WinAnsiEncoding' && encName !== 'MacRomanEncoding') reasons.add(R.encoding);
          if (enc instanceof PDFDict && enc.has(N('Differences'))) reasons.add(R.encoding);
        } else if (enc) reasons.add(R.encoding);
      }
    }
  }
  function checkSimpleTTWidths(ctx, fdict, ff2, codes, reasons, st) {
    try {
      const tt = PT.parseTT(PT.streamBytes(ff2)); if (!tt) return;
      const F = PT.makeFont(ctx, 'x', null, fdict, null, true); F.tt = tt;
      const c30 = tt.cmaps['3,0'], c10 = tt.cmaps['1,0'], c31 = tt.cmaps['3,1'];
      for (const code of codes) {
        const w = F.widths[code - F.first]; if (w == null || w === 0) continue;
        let g = 0;
        if (c30) g = c30.get(0xF000 + code) || c30.get(code) || 0;
        if (!g && c10) g = c10.get(code) || 0;
        if (!g && c31) { const u = F.uniOf(code); if (u) g = c31.get(u.codePointAt(0)) || 0; }
        if (!g) { if (st.part === 2) { reasons.add(R.notdef); return; } continue; }
        const adv = tt.adv(g);
        if (Math.abs(adv - w) > 1.5) { reasons.add(R.fontWidth); return; }
      }
    } catch { }
  }
  function checkCidWidths(ctx, desc, ff2, codes, reasons, st) {
    try {
      const tt = PT.parseTT(PT.streamBytes(ff2)); if (!tt) return;
      const dw = num(look(ctx, desc.get(N('DW')))) ?? 1000;
      const W = new Map(); const arr = look(ctx, desc.get(N('W')));
      if (arr instanceof PDFArray) { const a = arr.asArray().map(x => look(ctx, x)); for (let k = 0; k < a.length;) { const c0 = num(a[k]); if (a[k + 1] instanceof PDFArray) { a[k + 1].asArray().forEach((x, j) => W.set(c0 + j, num(look(ctx, x)))); k += 2; } else { const c1 = num(a[k + 1]), w = num(a[k + 2]); for (let c = c0; c <= c1 && c - c0 < 70000; c++) W.set(c, w); k += 3; } } }
      const c2g = look(ctx, desc.get(N('CIDToGIDMap')));
      const mb = isStream(c2g) ? PT.streamBytes(c2g) : null;
      for (const cid of codes) {
        const g = mb ? ((mb[cid * 2] << 8) | mb[cid * 2 + 1]) : cid;
        if (!g || g >= tt.numGlyphs) { if (st.part === 2) { reasons.add(R.notdef); return; } continue; }
        const w = W.has(cid) ? W.get(cid) : dw;
        if (Math.abs(tt.adv(g) - w) > 1.5) { reasons.add(R.fontWidth); return; }
      }
    } catch { }
  }

  /* ---------- content walk ---------- */
  const RI = new Set(['RelativeColorimetric', 'AbsoluteColorimetric', 'Perceptual', 'Saturation']);
  const CATS = ['Font', 'XObject', 'ExtGState', 'ColorSpace', 'Pattern', 'Shading', 'Properties'];
  // modalità di fusione della norma PDF (PDF/A-2 ammette queste; PDF/A-1 nessuna trasparenza)
  const BLEND = new Set(['Normal', 'Compatible', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'ColorDodge', 'ColorBurn', 'HardLight', 'SoftLight', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity']);
  function checkGS(ctx, g, reasons, part = 1, st = null, res = null, depth = 0) {
    g = dictOf(look(ctx, g)); if (!g) return;
    const sm = look(ctx, g.get(N('SMask')));
    if (sm && !(sm instanceof PDFName && sm.decodeText() === 'None')) {
      if (part === 1) reasons.add(R.transp);
      else { const smd = dictOf(sm); if (!smd) reasons.add(R.broken); else { if (smd.has(N('TR'))) reasons.add(R.tr); const G = smd.get(N('G')); if (G && st) checkXObject(ctx, G, res, reasons, part, st, depth + 1); else if (!G) reasons.add(R.broken); } }
    }
    for (const k of ['CA', 'ca']) { const v = num(look(ctx, g.get(N(k)))); if (v != null && v < 1 && part === 1) reasons.add(R.transp); }
    const bm = look(ctx, g.get(N('BM'))); const bms = bm instanceof PDFArray ? bm.asArray().map(x => nm(look(ctx, x))) : [nm(bm)];
    for (const bmn of bms) if (bmn && bmn !== 'Normal' && bmn !== 'Compatible' && (part === 1 || !BLEND.has(bmn))) reasons.add(R.transp);
    if (g.has(N('TR'))) reasons.add(R.tr);
    const tr2 = look(ctx, g.get(N('TR2'))); if (tr2 && !(tr2 instanceof PDFName && tr2.decodeText() === 'Default')) reasons.add(R.tr);
    if (g.has(N('Font'))) reasons.add(R.fontType);
    const ri = nm(look(ctx, g.get(N('RI')))); if (ri && !RI.has(ri)) reasons.add(R.limits);
  }
  function checkShading(ctx, sh, res, reasons, part) {
    const sd = dictOf(look(ctx, sh)); if (!sd) return;
    checkCS(ctx, sd.get(N('ColorSpace')), res, reasons, part);
    if (isStream(look(ctx, sh))) checkFilters(ctx, look(ctx, sh), reasons, part);
  }
  function checkPattern(ctx, pat, res, reasons, part, st, depth) {
    pat = look(ctx, pat); const pd = dictOf(pat); if (!pd || st.seen.has(pd)) return; st.seen.add(pd);
    const pt = num(look(ctx, pd.get(N('PatternType'))));
    if (pt === 1 && isStream(pat)) { checkFilters(ctx, pat, reasons, part); walk(ctx, PT.streamBytes(pat), pd.get(N('Resources')) || res, reasons, part, st, depth + 1); }
    if (pt === 2) { checkShading(ctx, pd.get(N('Shading')), res, reasons, part); const eg = pd.get(N('ExtGState')); if (eg) checkGS(ctx, eg, reasons, part, st, res, depth); }
  }
  function checkXObject(ctx, xo, res, reasons, part, st, depth) {
    xo = look(ctx, xo); if (!isStream(xo)) return;
    const d = xo.dict; if (st.seen.has(d)) return; st.seen.add(d);
    const subt = nm(d.get(N('Subtype')));
    checkFilters(ctx, xo, reasons, part);
    if (d.has(N('OC')) && part === 1) reasons.add(R.oc);
    if (subt === 'Image') {
      const intent = nm(look(ctx, d.get(N('Intent')))); if (intent && !RI.has(intent)) reasons.add(R.limits);
      if (part === 1 && (d.has(N('SMask')) || num(look(ctx, d.get(N('SMaskInData')))) > 0)) reasons.add(R.transp);
      if (part === 2) { const sm = look(ctx, d.get(N('SMask'))); if (isStream(sm)) { checkFilters(ctx, sm, reasons, part); if (num(look(ctx, sm.dict.get(N('BitsPerComponent')))) === 16) { /* ammesso */ } } }
      if (num(look(ctx, d.get(N('BitsPerComponent')))) === 16 && part === 1) reasons.add(R.bpc16);
      if (d.has(N('Alternates')) || d.has(N('OPI'))) reasons.add(R.ext);
      const im = look(ctx, d.get(N('ImageMask')));
      if (!(im && im.toString() === 'true')) checkCS(ctx, d.get(N('ColorSpace')), res, reasons, part);
      const mask = look(ctx, d.get(N('Mask'))); if (isStream(mask)) checkFilters(ctx, mask, reasons, part);
    } else if (subt === 'Form') {
      if (d.has(N('Ref')) || d.has(N('OPI'))) reasons.add(R.ext);
      const grp = dictOf(look(ctx, d.get(N('Group'))));
      if (grp && nm(grp.get(N('S'))) === 'Transparency' && part === 1) { /* removed during sanitation when nothing else is transparent */ }
      walk(ctx, PT.streamBytes(xo), d.get(N('Resources')) || res, reasons, part, st, depth + 1);
    } else if (subt === 'PS') reasons.add(R.ext);
    else reasons.add(R.ext);
  }
  function walk(ctx, bytes, res, reasons, part, st, depth) {
    if (depth > 12) { reasons.add(R.nested); return; }
    res = dictOf(look(ctx, res));
    let ops;
    try { ops = PT.parseContent(bytes); } catch { reasons.add(R.broken); return; }
    const cat = c => res ? dictOf(getIn(ctx, res, c)) : null;
    const used = {}; CATS.forEach(c => used[c] = new Set());
    let qDepth = 0, font = null;
    const fontsDict = cat('Font');
    const codesByFont = new Map();
    for (const o of ops) {
      const op = o.op;
      if (!OPS.has(op)) { reasons.add(R.ops); continue; }
      for (const a of o.args) if (a && a.t === '#' && (Math.abs(a.v) > 32767 && !Number.isInteger(a.v) || Math.abs(a.v) > 2147483647)) reasons.add(R.limits);
      const name0 = o.args[0] && o.args[0].t === 'n' ? o.args[0].v : null;
      switch (op) {
        case 'q': if (++qDepth > 28) reasons.add(R.nested); break;
        case 'Q': qDepth = Math.max(0, qDepth - 1); break;
        case 'k': case 'K': reasons.add(R.cmyk); break;
        case 'ri': if (name0 && !RI.has(name0)) reasons.add(R.limits); break;
        case 'cs': case 'CS':
          if (name0) { if (/^Device(RGB|Gray|CMYK)$|^Pattern$/.test(name0)) checkCS(ctx, N(name0), null, reasons, part); else { used.ColorSpace.add(name0); const v = cat('ColorSpace')?.get(N(name0)); if (v) checkCS(ctx, v, res, reasons, part); else reasons.add(R.broken); } }
          break;
        case 'gs': if (name0) { used.ExtGState.add(name0); const g = cat('ExtGState')?.get(N(name0)); if (g) checkGS(ctx, g, reasons, part, st, res, depth); else reasons.add(R.broken); } break;
        case 'sh': if (name0) { used.Shading.add(name0); const sh = cat('Shading')?.get(N(name0)); if (sh) checkShading(ctx, sh, res, reasons, part); } break;
        case 'scn': case 'SCN': {
          const last = o.args[o.args.length - 1];
          if (last && last.t === 'n') { used.Pattern.add(last.v); const pat = cat('Pattern')?.get(N(last.v)); if (pat) checkPattern(ctx, pat, res, reasons, part, st, depth); }
          break;
        }
        case 'BDC': case 'DP': {
          if (name0 === 'OC' && part === 1) reasons.add(R.oc);
          const pr = o.args[1]; if (pr && pr.t === 'n') used.Properties.add(pr.v);
          break;
        }
        case 'Tf': font = name0; if (font) used.Font.add(font); break;
        case 'Tj': case "'": case '"': case 'TJ': {
          if (!font || !fontsDict) break;
          let set = codesByFont.get(font); if (!set) codesByFont.set(font, set = new Set());
          const fd = dictOf(look(ctx, fontsDict.get(N(font))));
          const two = fd && nm(fd.get(N('Subtype'))) === 'Type0';
          const items = op === 'TJ' ? (o.args[0]?.items || []) : [o.args[o.args.length - 1]];
          for (const it of items) if (it && it.t === 's') for (let k = 0; k < it.b.length; k += two ? 2 : 1) set.add(two ? ((it.b[k] << 8) | (it.b[k + 1] ?? 0)) : it.b[k]);
          break;
        }
        case 'BI': {
          const t = o.inline || '';
          if (/\/(CS|ColorSpace)\s*\/(CMYK|DeviceCMYK)/.test(t)) reasons.add(R.cmyk);
          if (/\/(LZW|LZWDecode)\b/.test(t)) reasons.add(R.lzw);
          if (/\/(I|Interpolate)\s+true/.test(t)) reasons.add(R.limits);
          if (/\/(BPC|BitsPerComponent)\s+16/.test(t) && part === 1) reasons.add(R.bpc16);
          break;
        }
        case 'Do': if (name0) { used.XObject.add(name0); const xo = cat('XObject')?.get(N(name0)); if (xo) checkXObject(ctx, xo, res, reasons, part, st, depth); else reasons.add(R.broken); } break;
      }
    }
    const prev = st.res; st.res = res;
    if (fontsDict) for (const [key, codes] of codesByFont) { const f = fontsDict.get(N(key)); if (f) checkFont(ctx, f, reasons, part, st, codes); else reasons.add(R.broken); }
    if (depth === 0) st.pageUsed = used;
    else if (res) {
      // nested content (forms, patterns, Type3): every declared resource must conform
      if (fontsDict) for (const [k, f] of fontsDict.entries()) if (!codesByFont.has(k.decodeText())) checkFont(ctx, f, reasons, part, st, null);
      const g = cat('ExtGState'); if (g) for (const [, v] of g.entries()) checkGS(ctx, v, reasons, part, st, res, depth);
      const x = cat('XObject'); if (x) for (const [, v] of x.entries()) checkXObject(ctx, v, res, reasons, part, st, depth);
      const c = cat('ColorSpace'); if (c) for (const [, v] of c.entries()) checkCS(ctx, v, res, reasons, part);
      const pt = cat('Pattern'); if (pt) for (const [, v] of pt.entries()) checkPattern(ctx, v, res, reasons, part, st, depth);
      const sh = cat('Shading'); if (sh) for (const [, v] of sh.entries()) checkShading(ctx, v, res, reasons, part);
    }
    st.res = prev;
  }

  /* ---------- page analysis ---------- */
  function analyzePage(src, page, part) {
    const ctx = src.context, reasons = new Set();
    const st = { seen: new Set(), fontsSeen: new Set(), fixes: [], images: [], usedFonts: [], depth: 0, res: null, part };
    try {
      const bytes = PT.pageContent(page);
      const res = page.node.Resources();
      walk(ctx, bytes, res, reasons, part, st, 0);
      const annots = look(ctx, page.node.get(N('Annots')));
      if (annots instanceof PDFArray) for (const a of annots.asArray()) {
        const ad = look(ctx, a); if (!(ad instanceof PDFDict)) continue;
        const sub = nm(ad.get(N('Subtype')));
        if (sub !== 'Link' && sub !== 'Popup') { reasons.add(R.annot); break; }
      }
      const c = page.node.get(N('Contents'));
      const cc = look(ctx, c);
      const list = cc instanceof PDFArray ? cc.asArray().map(x => look(ctx, x)) : [cc];
      for (const s of list) if (isStream(s)) checkFilters(ctx, s, reasons, part);
    } catch (e) { console.warn('analisi pagina', e); reasons.add(R.broken); }
    return { reasons: [...reasons], st };
  }
  async function analyze(srcBytes, part) {
    let src;
    try { src = await PDFDocument.load(srcBytes, { ignoreEncryption: true, updateMetadata: false }); }
    catch (e) { return { src: null, pages: null, encrypted: true }; }
    const encrypted = src.isEncrypted;
    const pages = src.getPages().map(p => encrypted ? { reasons: [R.enc], st: null } : analyzePage(src, p, part));
    return { src, pages, encrypted };
  }

  /* ---------- fixes on copied pages ---------- */
  function buildCIDSet(ctx, fix) {
    const tt = PT.parseTT(PT.streamBytes(fix.prog)); if (!tt) return false;
    const c2g = look(ctx, fix.desc.get(N('CIDToGIDMap')));
    const mb = isStream(c2g) ? PT.streamBytes(c2g) : null;
    let maxCid = mb ? (mb.length / 2) - 1 : tt.numGlyphs - 1;
    const bits = new Uint8Array(Math.floor(maxCid / 8) + 1);
    for (let cid = 0; cid <= maxCid; cid++) {
      const g = mb ? ((mb[cid * 2] << 8) | mb[cid * 2 + 1]) : cid;
      if (g < tt.numGlyphs && (cid === 0 || g > 0)) bits[cid >> 3] |= 0x80 >> (cid & 7);
    }
    fix.fd.set(N('CIDSet'), ctx.register(ctx.flateStream(bits)));
    return true;
  }
  /* clean the source page BEFORE copying, so that nothing non-conforming is dragged into the new file */
  // segnalibri: solo azioni ammesse da PDF/A (andare a una pagina, a un indirizzo, pagina seguente/precedente)
  function cleanOutline(ctx, root) {
    const seen = new Set(); let item = root instanceof PDFDict ? look(ctx, root.get(N('First'))) : null;
    const visit = it => { while (it instanceof PDFDict && !seen.has(it)) {
      seen.add(it);
      const act = dictOf(look(ctx, it.get(N('A')))); if (act && !['GoTo', 'URI', 'Named', 'GoToR'].includes(nm(act.get(N('S'))))) it.delete(N('A'));
      const kid = look(ctx, it.get(N('First'))); if (kid) visit(kid);
      it = look(ctx, it.get(N('Next')));
    } };
    visit(item);
  }
  function sanitizeSourcePage(src, page, part, pageIndexOfRef, used, keepStruct = false) {
    const ctx = src.context, node = page.node;
    for (const k of ['AA', 'Thumb', 'Metadata', 'PieceInfo', 'B', 'PresSteps', 'SeparationInfo', 'Tabs', 'Dur', 'Trans', 'ID', 'PZ'].concat(keepStruct ? [] : ['StructParents'], part === 1 ? ['Group'] : [])) node.delete(N(k));
    const annots = look(ctx, node.get(N('Annots')));
    if (annots instanceof PDFArray) {
      const keep = [];
      for (const a of annots.asArray()) {
        const ad = look(ctx, a); if (!(ad instanceof PDFDict) || nm(ad.get(N('Subtype'))) !== 'Link') continue;
        const link = ctx.obj({ Type: 'Annot', Subtype: 'Link', F: 4, Border: [0, 0, 0] });
        const rect = look(ctx, ad.get(N('Rect'))); if (!(rect instanceof PDFArray)) continue;
        link.set(N('Rect'), ctx.obj(rect.asArray().map(x => num(look(ctx, x)) || 0)));
        const toLocal = d => { d = look(ctx, d); if (d instanceof PDFArray && d.size() && d.get(0) instanceof PDFRef && pageIndexOfRef.has(d.get(0).toString())) return ctx.obj([PDFNumber.of(pageIndexOfRef.get(d.get(0).toString())), ...d.asArray().slice(1).map(x => look(ctx, x))]); return null; };
        const act = dictOf(look(ctx, ad.get(N('A'))));
        const dest = ad.get(N('Dest'));
        if (act) {
          const sname = nm(act.get(N('S')));
          if (sname === 'URI') { const u = look(ctx, act.get(N('URI'))); if (u) link.set(N('A'), ctx.obj({ S: 'URI', URI: u })); }
          else if (sname === 'GoTo') { const d = toLocal(act.get(N('D'))); if (d) link.set(N('A'), ctx.obj({ S: 'GoTo', D: d, __local: true })); }
          else if (sname === 'Named') { const nn = nm(act.get(N('N'))); if (['NextPage', 'PrevPage', 'FirstPage', 'LastPage'].includes(nn)) link.set(N('A'), ctx.obj({ S: 'Named', N: nn })); }
        } else if (dest) { const d = toLocal(dest); if (d) link.set(N('Dest'), d); }
        if (!link.has(N('A')) && !link.has(N('Dest'))) continue;
        keep.push(ctx.register(link));
      }
      if (keep.length) node.set(N('Annots'), ctx.obj(keep)); else node.delete(N('Annots'));
    }
    if (used) {
      const res = node.Resources();
      if (res) {
        const nr = ctx.obj({});
        for (const [k, v] of res.entries()) {
          const key = k.decodeText();
          if (CATS.includes(key)) {
            const d = dictOf(look(ctx, v)); if (!d) continue;
            const f = ctx.obj({});
            for (const [kk, vv] of d.entries()) if (used[key].has(kk.decodeText())) f.set(kk, vv);
            if (f.keys().length) nr.set(k, f);
          } else if (key !== 'ProcSet') nr.set(k, v);
        }
        nr.set(N('ProcSet'), ctx.obj([N('PDF'), N('Text'), N('ImageB'), N('ImageC'), N('ImageI')]));
        node.set(N('Resources'), nr);
      }
    }
    const fixXObjects = (res, depth) => {
      res = dictOf(look(ctx, res)); if (!res || depth > 12) return;
      const xd = dictOf(look(ctx, res.get(N('XObject'))));
      if (xd) for (const [, v] of xd.entries()) {
        const xo = look(ctx, v); if (!isStream(xo)) continue;
        const d = xo.dict;
        if (d.__fixed) continue; d.__fixed = true;
        d.delete(N('Metadata')); d.delete(N('PieceInfo')); d.delete(N('StructParent')); d.delete(N('StructParents'));
        const sub = nm(d.get(N('Subtype')));
        if (sub === 'Image') { if (d.has(N('Interpolate'))) d.set(N('Interpolate'), ctx.obj(false)); }
        else if (sub === 'Form') { if (part === 1) d.delete(N('Group')); fixXObjects(d.get(N('Resources')), depth + 1); }
      }
    };
    fixXObjects(node.Resources(), 0);
  }
  function relinkDestinations(out) {
    const ctx = out.context, pages = out.getPages();
    for (const p of pages) {
      const annots = look(ctx, p.node.get(N('Annots')));
      if (!(annots instanceof PDFArray)) continue;
      for (const a of annots.asArray()) {
        const ad = look(ctx, a); if (!(ad instanceof PDFDict)) continue;
        const fix = d => { if (d instanceof PDFArray && d.get(0) instanceof PDFNumber) { const idx = d.get(0).asNumber(); if (pages[idx]) d.set(0, pages[idx].ref); else return false; } return true; };
        const act = dictOf(look(ctx, ad.get(N('A'))));
        if (act && nm(act.get(N('S'))) === 'GoTo') { act.delete(N('__local')); if (!fix(look(ctx, act.get(N('D'))))) ad.delete(N('A')); }
        const dest = look(ctx, ad.get(N('Dest'))); if (dest && !fix(dest)) ad.delete(N('Dest'));
      }
    }
  }

  /* ---------- caratteri standard non incorporati: si incorporano caratteri liberi con le stesse misure ----------
     Helvetica/Arial, Times e Courier non incorporati (comunissimi) impedivano il PDF/A e la pagina diventava un'immagine.
     Liberation Sans/Serif/Mono hanno la stessa larghezza di ogni lettera: il testo resta identico, vero e leggero
     (src/stdfonts.json, da tools/stdfonts.py). Solo con codifica WinAnsi (gli altri casi restano come prima). */
  let STDF = null;
  const stdFonts = () => STDF ||= inlineText('stdfonts').then(t => t ? JSON.parse(t) : null).catch(() => null);
  async function embedStdFonts(bytes) {
    const F = await stdFonts(); if (!F) return { bytes, n: 0 };
    let doc; try { doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); } catch { return { bytes, n: 0 }; }
    const ctx = doc.context, made = new Map(); let n = 0;
    // campi compilati e annotazioni stampabili: il loro aspetto diventa parte della pagina (PDF/A-1 non li ammette così
    // come sono, e prima la pagina intera diventava un'immagine); i commenti che non si stampano si tolgono
    for (const page of doc.getPages()) {
      const node = page.node, annots = look(ctx, node.get(N('Annots'))); if (!(annots instanceof PDFArray)) continue;
      const keep = []; let changed = false, ops = '';
      for (const a of annots.asArray()) {
        const ad = look(ctx, a); if (!(ad instanceof PDFDict)) continue;
        const sub = nm(ad.get(N('Subtype')));
        if (sub === 'Link' || sub === 'Popup') { keep.push(a); continue; }
        changed = true;
        const F = num(look(ctx, ad.get(N('F')))) || 0;
        if ((F & 2) || (F & 32) || (!(F & 4) && sub !== 'Widget')) continue;   // nascosta, o che non si stampa
        const ap = dictOf(look(ctx, ad.get(N('AP')))); let nRef = ap ? ap.get(N('N')) : null, nS = look(ctx, nRef);
        if (nS instanceof PDFDict && !isStream(nS)) { const as = ad.get(N('AS')); nRef = as ? nS.get(as) : null; nS = look(ctx, nRef); }
        if (!isStream(nS)) continue;
        const rect = look(ctx, ad.get(N('Rect'))); if (!(rect instanceof PDFArray)) continue;
        const [ra, rb, rc, rd] = rect.asArray().map(x => num(look(ctx, x)) || 0), rx0 = Math.min(ra, rc), rx1 = Math.max(ra, rc), ry0 = Math.min(rb, rd), ry1 = Math.max(rb, rd);
        const bb = look(ctx, nS.dict.get(N('BBox'))), B = bb instanceof PDFArray ? bb.asArray().map(x => num(look(ctx, x)) || 0) : [0, 0, rx1 - rx0, ry1 - ry0];
        const mm = look(ctx, nS.dict.get(N('Matrix'))), M = mm instanceof PDFArray ? mm.asArray().map(x => num(look(ctx, x)) || 0) : [1, 0, 0, 1, 0, 0];
        const pts = [[B[0], B[1]], [B[2], B[1]], [B[0], B[3]], [B[2], B[3]]].map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
        const x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
        if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
        const sx = (rx1 - rx0) / (x1 - x0), sy = (ry1 - ry0) / (y1 - y0), tx = rx0 - x0 * sx, ty = ry0 - y0 * sy;
        nS.dict.set(N('Type'), N('XObject')); nS.dict.set(N('Subtype'), N('Form')); if (!nS.dict.has(N('BBox'))) nS.dict.set(N('BBox'), ctx.obj(B));
        if (!(nRef instanceof PDFRef)) nRef = ctx.register(nS);
        node.normalize(); const key = node.newXObject('Flat', nRef);
        ops += `q ${PT.fmt(sx)} 0 0 ${PT.fmt(sy)} ${PT.fmt(tx)} ${PT.fmt(ty)} cm /${key.decodeText()} Do Q\n`;
      }
      if (changed) { if (keep.length) node.set(N('Annots'), ctx.obj(keep)); else node.delete(N('Annots')); n++; }
      if (ops) { node.normalize(); node.wrapContentStreams(ctx.register(ctx.flateStream(PT.asciiBytes('q\n'))), ctx.register(ctx.flateStream(PT.asciiBytes('Q\n' + ops)))); }
    }
    // i caratteri: oggetti a sé o scritti direttamente nelle risorse (pagine, disegni dei campi, moduli)
    const fontDicts = new Set();
    for (const [, o] of ctx.enumerateIndirectObjects()) {
      const d = o instanceof PDFDict ? o : isStream(o) ? o.dict : null; if (!d) continue;
      if (nm(d.get(N('Type'))) === 'Font') fontDicts.add(d);
      const res = dictOf(look(ctx, d.get(N('Resources')))) || (nm(d.get(N('Type'))) === 'Catalog' ? null : null), fd = res && dictOf(look(ctx, res.get(N('Font'))));
      if (fd) for (const [, v] of fd.entries()) { const f = look(ctx, v); if (f instanceof PDFDict) fontDicts.add(f); }
      const dr = dictOf(look(ctx, d.get(N('DR')))), drf = dr && dictOf(look(ctx, dr.get(N('Font'))));
      if (drf) for (const [, v] of drf.entries()) { const f = look(ctx, v); if (f instanceof PDFDict) fontDicts.add(f); }
    }
    for (const obj of fontDicts) {
      if (!(obj instanceof PDFDict)) continue;
      const sub = nm(obj.get(N('Subtype'))); if (sub !== 'Type1' && sub !== 'TrueType') continue;
      const fd = look(ctx, obj.get(N('FontDescriptor')));
      if (fd instanceof PDFDict && (fd.has(N('FontFile')) || fd.has(N('FontFile2')) || fd.has(N('FontFile3')))) continue;
      const base = (nm(obj.get(N('BaseFont'))) || '').replace(/^[A-Z]{6}\+/, '');
      const fam = /^Courier/i.test(base) ? 'mono' : /^Times/i.test(base) ? 'serif' : /^(Helvetica|Arial)(?!.*(Narrow|Black|Rounded|Unicode))/i.test(base) ? 'sans' : null;
      if (!fam) continue;
      const enc = look(ctx, obj.get(N('Encoding'))), encName = enc instanceof PDFName ? enc.decodeText() : enc == null ? null : 'altra';
      const plain = encName === 'WinAnsiEncoding' || (encName == null && sub === 'TrueType');
      // codifica propria (tipica dei campi dei moduli: /Helv con «Differences»), MacRoman o quella standard dei Type1:
      // carattere «simbolico» con la tabella dei codici di questo font e la tabella Unicode (il testo resta ricercabile)
      const names = plain ? null : codeNames(enc, sub);
      if (!plain && !names) continue;
      const fw = fd instanceof PDFDict ? num(look(ctx, fd.get(N('FontWeight')))) || 0 : 0, ff = fd instanceof PDFDict ? num(look(ctx, fd.get(N('Flags')))) || 0 : 0;
      const b = /bold|black|heavy|semibold|demi/i.test(base) || fw >= 600 || !!(ff & 0x40000), it = /italic|oblique/i.test(base) || !!(ff & 64);
      const key = fam + (b ? 'b' : '') + (it ? 'i' : ''), m = F[key]; if (!m) continue;
      if (names) { if (symbolicFont(ctx, obj, m, names)) n++; continue; }
      let file = made.get(key);
      if (!file) { const raw = Uint8Array.from(atob(m.ttf), c => c.charCodeAt(0)); file = ctx.register(ctx.flateStream(raw, { Length1: raw.length })); made.set(key, file); }
      const desc = ctx.obj({ Type: 'FontDescriptor', FontName: N(m.name), Flags: m.flags, FontBBox: m.bbox, ItalicAngle: m.italic, Ascent: m.ascent, Descent: m.descent, CapHeight: m.cap, StemV: m.stemv, FontFile2: file });
      obj.set(N('Subtype'), N('TrueType')); obj.set(N('BaseFont'), N(m.name)); obj.set(N('FontDescriptor'), ctx.register(desc));
      obj.set(N('Encoding'), N('WinAnsiEncoding')); obj.set(N('FirstChar'), PDFNumber.of(32)); obj.set(N('LastChar'), PDFNumber.of(255)); obj.set(N('Widths'), ctx.obj(m.widths));
      n++;
    }
    if (!n) return { bytes, n: 0 };
    return { bytes: await doc.save({ useObjectStreams: false, updateFieldAppearances: false }), n };
  }

  // codice → nome del glifo, dalla codifica di base (o quella standard dei Type1) più le «Differences»
  function codeNames(enc, sub) {
    const ctxless = x => x;
    let base = 'StandardEncoding', diffs = null;
    if (enc instanceof PDFName) base = enc.decodeText();
    else if (enc instanceof PDFDict) { const b = enc.get(N('BaseEncoding')); if (b instanceof PDFName) base = b.decodeText(); else if (sub === 'TrueType') base = 'WinAnsiEncoding'; const d = enc.get(N('Differences')); diffs = d instanceof PDFArray ? d.asArray().map(ctxless) : null; }
    const table = PT.ENCODINGS[base]; if (!table) return null;
    const uni = table.slice(), names = new Array(256).fill(null);
    if (diffs) { let c = 0; for (const d of diffs) { if (d instanceof PDFNumber) c = d.asNumber(); else if (d instanceof PDFName && c < 256) { names[c] = d.decodeText(); uni[c] = PT.glyphUni(names[c]) || ''; c++; } } }
    return uni.map((u, c) => (u && c >= 32 && u !== '\u007f') || names[c] ? u : '');
  }
  /* carattere TrueType «simbolico»: tabella (3,0) costruita per i codici di questo font (0xF000 + codice → glifo), larghezze
     prese dal carattere incorporato, ToUnicode per la ricerca e la copia. Ammesso da PDF/A-1 e PDF/A-2. */
  function symbolicFont(ctx, obj, m, uni) {
    const raw = Uint8Array.from(atob(m.ttf), c => c.charCodeAt(0)), tt = PT.parseTT(raw); if (!tt || !tt.cmaps['3,1']) return false;
    const gid = new Array(256).fill(0);
    for (let c = 0; c < 256; c++) { const u = uni[c]; if (u) gid[c] = tt.cmaps['3,1'].get(u.codePointAt(0)) || 0; }
    const codes = gid.map((g, c) => g ? c : -1).filter(c => c >= 0); if (!codes.length) return false;
    const first = codes[0], last = codes[codes.length - 1];
    const ttf = withCmap30(raw, gid); if (!ttf) return false;
    const file = ctx.register(ctx.flateStream(ttf, { Length1: ttf.length }));
    const desc = ctx.obj({ Type: 'FontDescriptor', FontName: N(m.name), Flags: (m.flags & ~32) | 4, FontBBox: m.bbox, ItalicAngle: m.italic, Ascent: m.ascent, Descent: m.descent, CapHeight: m.cap, StemV: m.stemv, FontFile2: file });
    const widths = []; for (let c = first; c <= last; c++) widths.push(gid[c] ? Math.round(tt.adv(gid[c])) : 0);
    const hex4 = s => [...s].map(ch => { const cp = ch.codePointAt(0); if (cp > 0xFFFF) { const v = cp - 0x10000; return ((0xD800 + (v >> 10)).toString(16) + (0xDC00 + (v & 1023)).toString(16)).toUpperCase(); } return cp.toString(16).padStart(4, '0').toUpperCase(); }).join('');
    const ent = codes.map(c => `<${c.toString(16).padStart(2, '0').toUpperCase()}> <${hex4(uni[c])}>`);
    let body = ''; for (let i = 0; i < ent.length; i += 100) { const ch = ent.slice(i, i + 100); body += `${ch.length} beginbfchar\n${ch.join('\n')}\nendbfchar\n`; }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${body}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
    obj.set(N('Subtype'), N('TrueType')); obj.set(N('BaseFont'), N(m.name)); obj.set(N('FontDescriptor'), ctx.register(desc)); obj.delete(N('Encoding'));
    obj.set(N('FirstChar'), PDFNumber.of(first)); obj.set(N('LastChar'), PDFNumber.of(last)); obj.set(N('Widths'), ctx.obj(widths));
    obj.set(N('ToUnicode'), ctx.register(ctx.flateStream(PT.asciiBytes(cmap))));
    return true;
  }
  // il programma TrueType con una sola tabella dei codici (3,0): formato 4, un segmento per codice
  function withCmap30(src, gid) {
    try {
      const dv = new DataView(src.buffer, src.byteOffset, src.byteLength), nt = dv.getUint16(4), tabs = [];
      for (let k = 0; k < nt; k++) { const o = 12 + k * 16; tabs.push({ tag: String.fromCharCode(src[o], src[o + 1], src[o + 2], src[o + 3]), off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) }); }
      const segs = []; gid.forEach((g, c) => { if (g) segs.push([0xF000 + c, g]); }); segs.push([0xFFFF, 0]);
      const sc = segs.length, sub = new DataView(new ArrayBuffer(16 + sc * 8)); let sr = 1, es = 0; while (sr * 2 <= sc) { sr *= 2; es++; } sr *= 2;
      sub.setUint16(0, 4); sub.setUint16(2, 16 + sc * 8); sub.setUint16(4, 0); sub.setUint16(6, sc * 2); sub.setUint16(8, sr); sub.setUint16(10, es); sub.setUint16(12, sc * 2 - sr);
      segs.forEach(([code, g], i) => { sub.setUint16(14 + i * 2, code); sub.setUint16(16 + sc * 2 + i * 2, code); sub.setUint16(16 + sc * 4 + i * 2, code === 0xFFFF ? 1 : (g - code) & 0xFFFF); sub.setUint16(16 + sc * 6 + i * 2, 0); });
      const cm = new Uint8Array(12 + sub.byteLength), cdv = new DataView(cm.buffer);
      cdv.setUint16(0, 0); cdv.setUint16(2, 1); cdv.setUint16(4, 3); cdv.setUint16(6, 0); cdv.setUint32(8, 12); cm.set(new Uint8Array(sub.buffer), 12);
      const data = tabs.map(t => ({ tag: t.tag, b: t.tag === 'cmap' ? cm : src.subarray(t.off, t.off + t.len) }));
      if (!data.some(t => t.tag === 'cmap')) { data.push({ tag: 'cmap', b: cm }); data.sort((a, b) => a.tag < b.tag ? -1 : 1); }
      const n = data.length, hdr = 12 + n * 16; let size = hdr; for (const t of data) size += (t.b.length + 3) & ~3;
      const out = new Uint8Array(size), odv = new DataView(out.buffer);
      out.set(src.subarray(0, 4)); odv.setUint16(4, n); let p2 = 1, e2 = 0; while (p2 * 2 <= n) { p2 *= 2; e2++; } odv.setUint16(6, p2 * 16); odv.setUint16(8, e2); odv.setUint16(10, n * 16 - p2 * 16);
      const sum = (b, o, l) => { let s = 0; for (let i = 0; i < l; i += 4) s = (s + ((b[o + i] << 24) | ((b[o + i + 1] || 0) << 16) | ((b[o + i + 2] || 0) << 8) | (b[o + i + 3] || 0))) >>> 0; return s; };
      let off = hdr, headOff = -1;
      data.forEach((t, k) => {
        out.set(t.b, off); if (t.tag === 'head') { headOff = off; odv.setUint32(off + 8, 0); }
        const r = 12 + k * 16; for (let i = 0; i < 4; i++) out[r + i] = t.tag.charCodeAt(i);
        odv.setUint32(r + 4, sum(out, off, (t.b.length + 3) & ~3)); odv.setUint32(r + 8, off); odv.setUint32(r + 12, t.b.length);
        off += (t.b.length + 3) & ~3;
      });
      if (headOff >= 0) odv.setUint32(headOff + 8, (0xB1B0AFBA - sum(out, 0, out.length)) >>> 0);
      return PT.parseTT(out) ? out : null;
    } catch (e) { console.warn('cmap', e); return null; }
  }

  /* ---------- livelli per PDF/A-1 (che non li ammette): resta quello che si vede ----------
     Il contenuto dei livelli visibili resta (senza il segno di livello); quello dei livelli nascosti si toglie dal file
     (non diventa visibile e non resta nascosto dentro). Così la pagina non diventa un'immagine. */
  async function flattenOC(bytes) {
    let doc; try { doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); } catch { return { bytes, n: 0 }; }
    const ctx = doc.context, ocp = look(ctx, doc.catalog.get(N('OCProperties')));
    if (!(ocp instanceof PDFDict)) return { bytes, n: 0 };
    const D = dictOf(look(ctx, ocp.get(N('D')))), refs = k => { const a = D && look(ctx, D.get(N(k))); return new Set(a instanceof PDFArray ? a.asArray().map(x => x.toString()) : []); };
    const base = D ? nm(D.get(N('BaseState'))) || 'ON' : 'ON', ON = refs('ON'), OFF = refs('OFF');
    const ocgOn = r => base === 'OFF' ? ON.has(r.toString()) : !OFF.has(r.toString());
    const visible = (v, depth = 0) => {
      if (!v || depth > 8) return true;
      const d = dictOf(look(ctx, v)); if (!d) return true;
      if (nm(d.get(N('Type'))) === 'OCMD') {
        const og = look(ctx, d.get(N('OCGs'))), list = og instanceof PDFArray ? og.asArray() : og ? [d.get(N('OCGs'))] : [];
        if (!list.length) return true;
        const st = list.map(r => r instanceof PDFRef ? ocgOn(r) : true), P = nm(d.get(N('P'))) || 'AnyOn';
        return P === 'AllOn' ? st.every(Boolean) : P === 'AnyOff' ? st.some(x => !x) : P === 'AllOff' ? st.every(x => !x) : st.some(Boolean);
      }
      return v instanceof PDFRef ? ocgOn(v) : true;
    };
    const enc = new TextEncoder(); let n = 0; const done = new Set();
    const xoVisible = xo => { const d = dictOf(look(ctx, xo)); return !d || !d.has(N('OC')) || visible(d.get(N('OC'))); };
    // un flusso: via i tratti dei livelli nascosti e i disegni nascosti, il segno di livello sostituito da un marcatore neutro
    const rewrite = (b, res) => {
      const ops = PT.parseContent(b), props = dictOf(look(ctx, res && dictOf(look(ctx, res))?.get(N('Properties')))), xos = dictOf(look(ctx, res && dictOf(look(ctx, res))?.get(N('XObject'))));
      const cuts = []; let depth = 0, hideFrom = -1, hideDepth = 0, qBal = 0, changed = false;
      for (const o of ops) {
        if (o.op === 'BDC' || o.op === 'BMC') {
          depth++;
          if (hideFrom < 0 && o.op === 'BDC' && o.args[0]?.v === 'OC') {
            const pn = o.args[1]?.t === 'n' ? o.args[1].v : null, pv = pn && props ? props.get(N(pn)) : null;
            if (pv && !visible(pv)) { hideFrom = o.start; hideDepth = depth; qBal = 0; }
            else cuts.push({ a: o.start, b: o.end, t: '/Span BMC' });
            changed = true;
          }
        } else if (o.op === 'EMC') {
          if (hideFrom >= 0 && depth === hideDepth) { if (qBal !== 0) return null; cuts.push({ a: hideFrom, b: o.end, t: '' }); hideFrom = -1; }
          depth--;
        } else if (hideFrom >= 0) { if (o.op === 'q') qBal++; else if (o.op === 'Q') qBal--; }
        else if (o.op === 'Do' && xos) { const nmx = o.args[0]?.v, x = nmx && xos.get(N(nmx)); if (x && !xoVisible(x)) { cuts.push({ a: o.start, b: o.end, t: '' }); changed = true; } }
      }
      if (hideFrom >= 0) return null;
      if (!changed) return b;
      const parts = []; let at = 0;
      for (const c of cuts.sort((x, y) => x.a - y.a)) { parts.push(b.subarray(at, c.a), enc.encode(' ' + c.t + ' ')); at = c.b; }
      parts.push(b.subarray(at));
      const out = new Uint8Array(parts.reduce((t, p2) => t + p2.length, 0)); let k = 0; for (const p2 of parts) { out.set(p2, k); k += p2.length; }
      return out;
    };
    const forms = (res, depth) => {
      res = dictOf(look(ctx, res)); if (!res || depth > 12) return true;
      const xd = dictOf(look(ctx, res.get(N('XObject')))); if (!xd) return true;
      for (const [, v] of xd.entries()) {
        const xo = look(ctx, v); if (!isStream(xo) || done.has(xo)) continue; done.add(xo);
        xo.dict.delete(N('OC'));
        if (nm(xo.dict.get(N('Subtype'))) !== 'Form') continue;
        const ob = PT.streamBytes(xo), nb = rewrite(ob, xo.dict.get(N('Resources')) || res); if (!nb) return false;
        if (nb !== ob && v instanceof PDFRef) { const d2 = xo.dict.clone(ctx); d2.delete(N('Filter')); d2.delete(N('DecodeParms')); d2.delete(N('Length')); const ns = ctx.flateStream(nb); for (const [k2, v2] of d2.entries()) ns.dict.set(k2, v2); ctx.assign(v, ns); }
        if (!forms(xo.dict.get(N('Resources')), depth + 1)) return false;
      }
      return true;
    };
    for (const page of doc.getPages()) {
      const node = page.node, res = node.Resources();
      const ob = PT.pageContent(page), nb = rewrite(ob, res); if (!nb) return { bytes, n: 0 };   // livelli intrecciati in modo strano: si lascia com'è (la pagina si rifà)
      if (nb !== ob) { node.set(N('Contents'), ctx.register(ctx.flateStream(nb))); n++; }
      if (!forms(res, 0)) return { bytes, n: 0 };
      const annots = look(ctx, node.get(N('Annots')));
      if (annots instanceof PDFArray) { const keep = annots.asArray().filter(a => { const d = dictOf(look(ctx, a)); if (!d || !d.has(N('OC'))) return true; const v = visible(d.get(N('OC'))); d.delete(N('OC')); return v; }); node.set(N('Annots'), ctx.obj(keep)); }
    }
    doc.catalog.delete(N('OCProperties')); n++;
    return { bytes: await doc.save({ useObjectStreams: false, updateFieldAppearances: false }), n };
  }
  /* ---------- immagini JPEG 2000 (non ammesse da PDF/A-1, a regole strette da PDF/A-2): pdf.js le decodifica, si
     ricodificano in JPEG alla stessa risoluzione. Solo l'immagine cambia formato: la pagina resta testo vero. */
  async function jpxToJpeg(bytes, pdfjs) {
    let doc; try { doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); } catch { return { bytes, n: 0 }; }
    const ctx = doc.context, isJpx = s => { const f = look(ctx, s.dict.get(N('Filter'))); return (f instanceof PDFArray ? f.asArray().map(x => nm(look(ctx, x))) : [nm(f)]).includes('JPXDecode'); };
    const jpx = []; for (const [ref, o] of ctx.enumerateIndirectObjects()) if (isStream(o) && nm(o.dict.get(N('Subtype'))) === 'Image' && isJpx(o)) jpx.push({ ref, o, w: num(look(ctx, o.dict.get(N('Width')))), h: num(look(ctx, o.dict.get(N('Height')))) });
    if (!jpx.length || !pdfjs) return { bytes, n: 0 };
    const pages = doc.getPages(), todo = new Set(jpx.map(j => j.ref.toString())); let n = 0;
    const usesJpx = (res, depth = 0) => { res = dictOf(look(ctx, res)); if (!res || depth > 8) return false; const xd = dictOf(look(ctx, res.get(N('XObject')))); if (!xd) return false; for (const [, v] of xd.entries()) { if (v instanceof PDFRef && todo.has(v.toString())) return true; const xo = look(ctx, v); if (isStream(xo) && usesJpx(xo.dict.get(N('Resources')), depth + 1)) return true; } return false; };
    for (let i = 0; i < pages.length && todo.size; i++) {
      if (!usesJpx(pages[i].node.Resources())) continue;
      let pg; try { pg = await pdfjs.getPage(i + 1); } catch { continue; }
      const ops = await pg.getOperatorList(), O = pdfjsLib.OPS;
      for (let k = 0; k < ops.fnArray.length; k++) {
        if (ops.fnArray[k] !== O.paintImageXObject) continue;
        const [id, w, h] = ops.argsArray[k], j = jpx.find(x => todo.has(x.ref.toString()) && x.w === w && x.h === h); if (!j) continue;
        let img = null; try { img = id.startsWith('g_') ? pg.commonObjs.get(id) : pg.objs.get(id); } catch { }
        if (!img) continue;
        const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        if (img.bitmap) cx.drawImage(img.bitmap, 0, 0);
        else if (img.data) {
          const id2 = cx.createImageData(w, h), d = id2.data, src = img.data;
          if (img.kind === 3) { for (let p2 = 0; p2 < w * h * 4; p2 += 4) { if (src[p2 + 3] < 255) { c.width = 0; img = null; break; } d[p2] = src[p2]; d[p2 + 1] = src[p2 + 1]; d[p2 + 2] = src[p2 + 2]; d[p2 + 3] = 255; } }
          else if (img.kind === 2) { for (let p2 = 0, q = 0; q < w * h * 3; p2 += 4, q += 3) { d[p2] = src[q]; d[p2 + 1] = src[q + 1]; d[p2 + 2] = src[q + 2]; d[p2 + 3] = 255; } }
          else { c.width = 0; continue; }
          if (!img) continue;
          cx.putImageData(id2, 0, 0);
        } else { c.width = 0; continue; }
        const jpg = await canvasToBytes(c, 'image/jpeg', 0.92); c.width = c.height = 0;
        const ns = ctx.stream(jpg, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
        const sm = j.o.dict.get(N('SMask')); if (sm) ns.dict.set(N('SMask'), sm);
        ctx.assign(j.ref, ns); todo.delete(j.ref.toString()); n++;
      }
      pg.cleanup();
    }
    if (!n) return { bytes, n: 0 };
    return { bytes: await doc.save({ useObjectStreams: false, updateFieldAppearances: false }), n };
  }
  // tutto ciò che si prepara prima della conversione (vale anche per l'analisi mostrata prima di convertire)
  async function prepare(bytes, pdfjs, part) {
    let n = 0;
    try { const e = await embedStdFonts(bytes); if (e.n) { bytes = e.bytes; n += e.n; } } catch (e) { console.warn('caratteri standard', e); }
    if (part === 1) try { const e = await flattenOC(bytes); if (e.n) { bytes = e.bytes; n += e.n; } } catch (e) { console.warn('livelli', e); }
    try { const pj = n ? await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise : pdfjs; const e = await jpxToJpeg(bytes, pj); if (e.n) { bytes = e.bytes; n += e.n; } if (pj !== pdfjs && pj) pj.destroy?.(); } catch (e) { console.warn('JPEG 2000', e); }
    return { bytes, n };
  }

  /* ---------- rebuilt page (image + invisible text) ---------- */
  function type3Font(ctx, chars) {
    const codes = new Map(); let n = 0;
    for (const ch of chars) if (!codes.has(ch) && n < 254) codes.set(ch, ++n);
    const proc = ctx.register(ctx.flateStream(PT.asciiBytes('500 0 d0\n')));
    const procs = {}, diffs = [1], toUni = new Map(), widths = [];
    for (const [ch, code] of codes) { procs['g' + code] = proc; diffs.push(N('g' + code)); toUni.set(code, ch); widths.push(500); }
    const cmapText = (() => {
      const e = [...toUni.entries()]; let body = '';
      for (let i = 0; i < e.length; i += 100) { const ch = e.slice(i, i + 100); body += `${ch.length} beginbfchar\n` + ch.map(([c, s]) => `<${c.toString(16).padStart(2, '0').toUpperCase()}> <${[...s].map(x => { const cp = x.codePointAt(0); if (cp > 0xFFFF) { const v = cp - 0x10000; return ((0xD800 + (v >> 10)).toString(16) + (0xDC00 + (v & 1023)).toString(16)).toUpperCase(); } return cp.toString(16).padStart(4, '0').toUpperCase(); }).join('')}>`).join('\n') + '\nendbfchar\n'; }
      return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${body}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
    })();
    const charProcs = ctx.obj({}); for (const [k, v] of Object.entries(procs)) charProcs.set(N(k), v);
    const font = ctx.obj({
      Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 500, 750], FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      CharProcs: charProcs, Encoding: ctx.obj({ Type: 'Encoding', Differences: diffs }),
      FirstChar: 1, LastChar: Math.max(1, n), Widths: widths.length ? widths : [500], Resources: ctx.obj({}),
      ToUnicode: ctx.register(ctx.flateStream(PT.asciiBytes(cmapText))),
    });
    return { ref: ctx.register(font), codes };
  }
  // la parte lenta (immagine della pagina, testo, annotazioni): si può preparare in anticipo, più pagine insieme
  async function rebuildData(pdfjsDoc, pageNo, dpi, quality) {
    const pg = await pdfjsDoc.getPage(pageNo);
    const r = await renderPageCanvas(pdfjsDoc, pageNo, dpi, { maxPixels: 30e6 });
    const jpg = await canvasToBytes(r.canvas, 'image/jpeg', quality);
    r.canvas.width = r.canvas.height = 0;
    let tc = null; try { tc = await pg.getTextContent(); } catch { }
    let anns = []; try { anns = await pg.getAnnotations(); } catch { }
    return { pg, jpg, tc, anns };
  }
  async function rebuildPage(out, pdfjsDoc, pageNo, dpi, quality, part, pre = null) {
    const ctx = out.context;
    const { pg, jpg, tc, anns } = pre ? await pre : await rebuildData(pdfjsDoc, pageNo, dpi, quality);
    const vp = pg.getViewport({ scale: 1 });
    const W = vp.width, H = vp.height;
    const img = await out.embedJpg(jpg);
    const page = out.addPage([W, H]);
    let content = `q\n${PT.fmt(W)} 0 0 ${PT.fmt(H)} 0 0 cm\n/Im0 Do\nQ\n`;
    const xobjs = ctx.obj({ Im0: img.ref });
    const resources = ctx.obj({ XObject: xobjs, ProcSet: [N('PDF'), N('Text'), N('ImageC')] });
    // invisible text layer
    const items = (tc ? tc.items : []).filter(it => it.str && it.str.trim() && it.width > 0);
    // values typed in form fields and text annotations become searchable too
    for (const a of anns) {
      const val = typeof a.fieldValue === 'string' ? a.fieldValue : (a.subtype === 'FreeText' && a.contentsObj?.str) || '';
      if (!val || !val.trim() || !a.rect || a.hidden) continue;
      const [x0, y0, x1, y1] = a.rect; const hgt = Math.max(4, Math.min(y1 - y0, 14)) * 0.8;
      const line = val.replace(/\s+/g, ' ').trim();
      items.push({ str: line, width: Math.max(1, x1 - x0 - 4), transform: [hgt, 0, 0, hgt, x0 + 2, y0 + (y1 - y0 - hgt) / 2 + hgt * 0.2] });
    }
    if (items.length) {
      const chars = new Set(); items.forEach(it => [...it.str].forEach(c => chars.add(c)));
      const f = type3Font(ctx, chars);
      resources.set(N('Font'), ctx.obj({ T3: f.ref }));
      const flip = [1, 0, 0, -1, 0, H];
      content += 'BT\n3 Tr\n';
      for (const it of items) {
        const codes = [...it.str].map(c => f.codes.get(c)).filter(Boolean);
        if (!codes.length) continue;
        const M = PT.mul(PT.mul(it.transform, vp.transform), flip);
        const fs = Math.hypot(M[0], M[1]) || 1, fsy = Math.hypot(M[2], M[3]) || 1;
        const m = [M[0] / fs, M[1] / fs, M[2] / fsy, M[3] / fsy, M[4], M[5]];
        const w = it.width * (Math.hypot(vp.transform[0], vp.transform[1]) || 1);
        const tz = Math.max(1, Math.min(1000, w / (codes.length * 0.5 * fsy) * 100));
        if (!isFinite(tz) || !m.every(isFinite)) continue;
        content += `/T3 ${PT.fmt(fsy)} Tf ${PT.fmt(tz)} Tz ${m.map(PT.fmt).join(' ')} Tm <${codes.map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('')}> Tj\n`;
      }
      content += 'ET\n';
    }
    page.node.set(N('Resources'), resources);
    page.node.set(N('Contents'), ctx.obj([ctx.register(ctx.flateStream(PT.asciiBytes(content)))]));
    // links
    try {
      const links = [];
      for (const a of anns) {
        if (a.subtype !== 'Link' || !a.url || !a.rect) continue;
        const flip = [1, 0, 0, -1, 0, H];
        const p1 = PT.apply(PT.mul(vp.transform, flip), a.rect[0], a.rect[1]), p2 = PT.apply(PT.mul(vp.transform, flip), a.rect[2], a.rect[3]);
        links.push(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', F: 4, Border: [0, 0, 0],
          Rect: [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])],
          A: ctx.obj({ S: 'URI', URI: PDFString.of(a.url) }) })));
      }
      if (links.length) page.node.set(N('Annots'), ctx.obj(links));
    } catch { }
    pg.cleanup();
    return page;
  }

  /* ---------- document level ---------- */
  const xmlEsc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  function isoDate(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function xmp({ part, title, author, created, modified }) {
    return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>${part}</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>${title ? `
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title>` : ''}${author ? `
   <dc:creator><rdf:Seq><rdf:li>${xmlEsc(author)}</rdf:li></rdf:Seq></dc:creator>` : ''}
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreateDate>${isoDate(created)}</xmp:CreateDate>
   <xmp:ModifyDate>${isoDate(modified)}</xmp:ModifyDate>
   <xmp:MetadataDate>${isoDate(modified)}</xmp:MetadataDate>
   <xmp:CreatorTool>file360</xmp:CreatorTool>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>file360</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
${' '.repeat(2000)}
<?xpacket end="w"?>`;
  }
  function iccBytes() { const s = atob(ICC_B64); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

  /* options: { part:1|2, mode:'auto'|'rebuild', dpi, quality, onProgress(frac,msg), check() } */
  async function convert(srcBytes, pdfjsDoc, analysis, opts) {
    const part = opts.part || 1;
    const out = await PDFDocument.create({ updateMetadata: false });
    const ctx = out.context;
    const src = analysis.src;
    const n = pdfjsDoc.numPages;
    const report = { native: [], rebuilt: [] };
    let title = '', author = '';
    try { if (src && !analysis.encrypted) { title = src.getTitle() || ''; author = src.getAuthor() || ''; } } catch { }
    const pageIndexOfRef = new Map();
    if (src && !analysis.encrypted) src.getPages().forEach((p, k) => pageIndexOfRef.set(p.ref.toString(), k));
    // le pagine da ricostruire si preparano in anticipo, più d'una alla volta
    const toRebuild = [];
    const forced = opts.force || new Set();
    for (let i = 0; i < n; i++) { const a = analysis.pages ? analysis.pages[i] : { reasons: [R.broken] }; if (opts.mode === 'rebuild' || !src || a.reasons.length > 0 || forced.has(i)) toRebuild.push(i); }
    const pre = prefetcher(toRebuild, parallelSlots(), i => rebuildData(pdfjsDoc, i + 1, opts.dpi || 200, opts.quality || 0.85));
    const copier = src && !analysis.encrypted ? PDFLib.PDFObjectCopier.for(src.context, ctx) : null;
    // la struttura per l'accessibilità (tag) si conserva se nessuna pagina va ricostruita come immagine
    const keepStruct = !!(copier && !toRebuild.length && src.catalog.get(N('StructTreeRoot')));
    for (let i = 0; i < n; i++) {
      opts.check?.();
      const a = analysis.pages ? analysis.pages[i] : { reasons: [R.broken] };
      const rebuild = opts.mode === 'rebuild' || !src || a.reasons.length > 0 || forced.has(i);
      opts.onProgress?.(i / n, `Pagina ${i + 1} di ${n}${rebuild ? ' (ricostruzione)' : ''}`);
      if (!rebuild) {
        try {
          sanitizeSourcePage(src, src.getPage(i), part, pageIndexOfRef, a.st && a.st.pageUsed, keepStruct);
          // un solo copiatore per tutto il documento: le risorse comuni (caratteri, immagini) si copiano una volta sola
          const node = copier.copy(src.getPage(i).node), ref = ctx.register(node);
          out.addPage(PDFLib.PDFPage.of(node, ref, out));
          report.native.push(i + 1);
          continue;
        } catch (e) { console.warn('copia pagina', e); a.reasons.push(R.broken); }
      }
      await rebuildPage(out, pdfjsDoc, i + 1, opts.dpi || 200, opts.quality || 0.85, part, pre.get(i));
      report.rebuilt.push({ page: i + 1, reasons: opts.mode === 'rebuild' ? ['ricostruzione richiesta'] : forced.has(i) && !a.reasons.length ? ['segnalata dalla verifica'] : a.reasons });
      await tick();
    }
    relinkDestinations(out);
    if (copier) {
      // segnalibri, destinazioni con nome e struttura (tag): dal documento d'origine, con le pagine nuove al posto delle vecchie
      const srcPages = src.getPages(), outPages = out.getPages();
      srcPages.forEach((p, k) => { if (outPages[k] && !copier.traversedObjects.has(p.ref)) copier.traversedObjects.set(p.ref, outPages[k].ref); });
      try {
        const ol = src.catalog.get(N('Outlines'));
        if (ol) { const c2 = copier.copy(ol); out.catalog.set(N('Outlines'), c2); cleanOutline(ctx, look(ctx, c2)); }
        const dests = src.catalog.get(N('Dests')); if (dests) out.catalog.set(N('Dests'), copier.copy(dests));
        const names = dictOf(look(src.context, src.catalog.get(N('Names')))), nd = names && names.get(N('Dests'));
        if (nd) out.catalog.set(N('Names'), ctx.obj({ Dests: copier.copy(nd) }));
      } catch (e) { console.warn('segnalibri', e); }
      // livelli (contenuti opzionali): ammessi da PDF/A-2, con ogni configurazione che ha un nome, senza «AS» e con
      // tutti i livelli nell'ordine, se c'è un ordine
      if (part === 2 && src.catalog.get(N('OCProperties'))) try {
        const ocp = look(ctx, copier.copy(src.catalog.get(N('OCProperties'))));
        if (ocp instanceof PDFDict) {
          const ocgs = look(ctx, ocp.get(N('OCGs'))), all = ocgs instanceof PDFArray ? ocgs.asArray() : [];
          const cfgs = [look(ctx, ocp.get(N('D'))), ...((look(ctx, ocp.get(N('Configs'))) || { asArray: () => [] }).asArray?.() || []).map(x => look(ctx, x))].filter(x => x instanceof PDFDict);
          if (!cfgs.length) { const d = ctx.obj({}); ocp.set(N('D'), d); cfgs.push(d); }
          cfgs.forEach((c, k) => {
            if (!c.has(N('Name'))) c.set(N('Name'), PDFString.of(k ? `Configurazione ${k + 1}` : 'Predefinita'));
            c.delete(N('AS'));
            const ord = look(ctx, c.get(N('Order')));
            if (ord instanceof PDFArray) { const flat = new Set(); const walk = a => a.asArray().forEach(x => { const v = look(ctx, x); if (v instanceof PDFArray) walk(v); else if (x instanceof PDFRef) flat.add(x.toString()); }); walk(ord); for (const r of all) if (r instanceof PDFRef && !flat.has(r.toString())) ord.push(r); }
          });
          out.catalog.set(N('OCProperties'), ocp);
        }
      } catch (e) { console.warn('livelli', e); out.catalog.delete(N('OCProperties')); }
      if (keepStruct) try {
        out.catalog.set(N('StructTreeRoot'), copier.copy(src.catalog.get(N('StructTreeRoot'))));
        out.catalog.set(N('MarkInfo'), ctx.obj({ Marked: true }));
        const lang = src.catalog.get(N('Lang')); if (lang) out.catalog.set(N('Lang'), copier.copy(lang));
      } catch (e) { console.warn('struttura', e); out.catalog.delete(N('StructTreeRoot')); out.catalog.delete(N('MarkInfo')); }
    }
    fixFontDicts(out, part);
    // CIDSet for CIDFontType2 subsets (PDF/A-1): find descriptors in the output document
    if (part === 1) addMissingCIDSets(out);
    else removeCIDSets(out);
    // metadata
    const now = new Date();
    const created = (() => { try { return (src && src.getCreationDate()) || now; } catch { return now; } })();
    out.setProducer('file360'); out.setCreator('file360');
    out.setCreationDate(created); out.setModificationDate(now);
    const info = ctx.lookup(ctx.trailerInfo.Info);
    if (title) out.setTitle(title); else if (info) info.delete(N('Title'));
    if (author) out.setAuthor(author);
    const meta = ctx.stream(new TextEncoder().encode(xmp({ part, title, author, created, modified: now })), { Type: 'Metadata', Subtype: 'XML' });
    out.catalog.set(N('Metadata'), ctx.register(meta));
    const icc = ctx.flateStream(iccBytes(), { N: 3 });
    out.catalog.set(N('OutputIntents'), ctx.obj([ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), RegistryName: PDFString.of('http://www.color.org'), Info: PDFString.of('sRGB IEC61966-2.1'), DestOutputProfile: ctx.register(icc) })]));
    if (title) out.catalog.set(N('ViewerPreferences'), ctx.obj({ DisplayDocTitle: true }));
    const idb = crypto.getRandomValues(new Uint8Array(16)); const id = [...idb].map(b => b.toString(16).padStart(2, '0')).join('');
    ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
    opts.onProgress?.(1, 'Salvataggio…');
    const bytes = await out.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
    return { bytes, report };
  }
  function eachFontDescriptor(out, fn) {
    const ctx = out.context;
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict)) continue;
      if (nm(obj.get(N('Type'))) !== 'Font') continue;
      const sub = nm(obj.get(N('Subtype')));
      if (sub !== 'CIDFontType2' && sub !== 'CIDFontType0') continue;
      const fd = look(ctx, obj.get(N('FontDescriptor')));
      if (fd instanceof PDFDict) fn(obj, fd, sub);
    }
  }
  function fixFontDicts(out, part) {
    const ctx = out.context;
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict) || nm(obj.get(N('Type'))) !== 'Font') continue;
      const sub = nm(obj.get(N('Subtype')));
      if (sub === 'CIDFontType2' && !obj.has(N('CIDToGIDMap'))) obj.set(N('CIDToGIDMap'), N('Identity'));
      if (part === 2) { const fd = look(ctx, obj.get(N('FontDescriptor'))); if (fd instanceof PDFDict) fd.delete(N('CharSet')); }
    }
  }
  function addMissingCIDSets(out) {
    const ctx = out.context;
    eachFontDescriptor(out, (desc, fd, sub) => {
      if (fd.has(N('CIDSet'))) return;
      const ff2 = look(ctx, fd.get(N('FontFile2')));
      if (sub === 'CIDFontType2' && ff2) { try { buildCIDSet(ctx, { fd, desc, prog: ff2 }); } catch (e) { console.warn('CIDSet', e); } }
    });
  }
  function removeCIDSets(out) { eachFontDescriptor(out, (desc, fd) => fd.delete(N('CIDSet'))); }

  return { analyze, convert, R, embedStdFonts, flattenOC, jpxToJpeg, prepare };
})();

/* ----------------------------- STRUMENTO PDF/A ----------------------------- */