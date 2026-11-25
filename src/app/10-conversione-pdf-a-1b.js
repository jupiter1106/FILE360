/* =====================================================================
   Conversione PDF/A-1b / PDF/A-2b
   - pagine conformi: copiate e sanate (vettoriali, testo originale)
   - pagine non conformi: ricostruite (immagine + testo invisibile ricercabile)
   ===================================================================== */
const PDFA = (() => {
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFNumber, PDFRawStream, PDFHexString, PDFString } = PDFLib;
  const N = s => PDFName.of(s);
  const ICC_B64 = 'AAAL0AAAAAACAAAAbW50clJHQiBYWVogB98AAgAPAAAAAAAAYWNzcAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAPbWAAEAAAAA0y0AAAAAPQ6y3q6Tl76bZybOjApDzgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQZGVzYwAAAUQAAABjYlhZWgAAAagAAAAUYlRSQwAAAbwAAAgMZ1RSQwAAAbwAAAgMclRSQwAAAbwAAAgMZG1kZAAACcgAAACIZ1hZWgAAClAAAAAUbHVtaQAACmQAAAAUbWVhcwAACngAAAAkYmtwdAAACpwAAAAUclhZWgAACrAAAAAUdGVjaAAACsQAAAAMdnVlZAAACtAAAACHd3RwdAAAC1gAAAAUY3BydAAAC2wAAAA3Y2hhZAAAC6QAAAAsZGVzYwAAAAAAAAAJc1JHQjIwMTQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAAAkoAAAD4QAALbPY3VydgAAAAAAAAQAAAAABQAKAA8AFAAZAB4AIwAoAC0AMgA3ADsAQABFAEoATwBUAFkAXgBjAGgAbQByAHcAfACBAIYAiwCQAJUAmgCfAKQAqQCuALIAtwC8AMEAxgDLANAA1QDbAOAA5QDrAPAA9gD7AQEBBwENARMBGQEfASUBKwEyATgBPgFFAUwBUgFZAWABZwFuAXUBfAGDAYsBkgGaAaEBqQGxAbkBwQHJAdEB2QHhAekB8gH6AgMCDAIUAh0CJgIvAjgCQQJLAlQCXQJnAnECegKEAo4CmAKiAqwCtgLBAssC1QLgAusC9QMAAwsDFgMhAy0DOANDA08DWgNmA3IDfgOKA5YDogOuA7oDxwPTA+AD7AP5BAYEEwQgBC0EOwRIBFUEYwRxBH4EjASaBKgEtgTEBNME4QTwBP4FDQUcBSsFOgVJBVgFZwV3BYYFlgWmBbUFxQXVBeUF9gYGBhYGJwY3BkgGWQZqBnsGjAadBq8GwAbRBuMG9QcHBxkHKwc9B08HYQd0B4YHmQesB78H0gflB/gICwgfCDIIRghaCG4IggiWCKoIvgjSCOcI+wkQCSUJOglPCWQJeQmPCaQJugnPCeUJ+woRCicKPQpUCmoKgQqYCq4KxQrcCvMLCwsiCzkLUQtpC4ALmAuwC8gL4Qv5DBIMKgxDDFwMdQyODKcMwAzZDPMNDQ0mDUANWg10DY4NqQ3DDd4N+A4TDi4OSQ5kDn8Omw62DtIO7g8JDyUPQQ9eD3oPlg+zD88P7BAJECYQQxBhEH4QmxC5ENcQ9RETETERTxFtEYwRqhHJEegSBxImEkUSZBKEEqMSwxLjEwMTIxNDE2MTgxOkE8UT5RQGFCcUSRRqFIsUrRTOFPAVEhU0FVYVeBWbFb0V4BYDFiYWSRZsFo8WshbWFvoXHRdBF2UXiReuF9IX9xgbGEAYZRiKGK8Y1Rj6GSAZRRlrGZEZtxndGgQaKhpRGncanhrFGuwbFBs7G2MbihuyG9ocAhwqHFIcexyjHMwc9R0eHUcdcB2ZHcMd7B4WHkAeah6UHr4e6R8THz4faR+UH78f6iAVIEEgbCCYIMQg8CEcIUghdSGhIc4h+yInIlUigiKvIt0jCiM4I2YjlCPCI/AkHyRNJHwkqyTaJQklOCVoJZclxyX3JicmVyaHJrcm6CcYJ0kneierJ9woDSg/KHEooijUKQYpOClrKZ0p0CoCKjUqaCqbKs8rAis2K2krnSvRLAUsOSxuLKIs1y0MLUEtdi2rLeEuFi5MLoIuty7uLyQvWi+RL8cv/jA1MGwwpDDbMRIxSjGCMbox8jIqMmMymzLUMw0zRjN/M7gz8TQrNGU0njTYNRM1TTWHNcI1/TY3NnI2rjbpNyQ3YDecN9c4FDhQOIw4yDkFOUI5fzm8Ofk6Njp0OrI67zstO2s7qjvoPCc8ZTykPOM9Ij1hPaE94D4gPmA+oD7gPyE/YT+iP+JAI0BkQKZA50EpQWpBrEHuQjBCckK1QvdDOkN9Q8BEA0RHRIpEzkUSRVVFmkXeRiJGZ0arRvBHNUd7R8BIBUhLSJFI10kdSWNJqUnwSjdKfUrESwxLU0uaS+JMKkxyTLpNAk1KTZNN3E4lTm5Ot08AT0lPk0/dUCdQcVC7UQZRUFGbUeZSMVJ8UsdTE1NfU6pT9lRCVI9U21UoVXVVwlYPVlxWqVb3V0RXklfgWC9YfVjLWRpZaVm4WgdaVlqmWvVbRVuVW+VcNVyGXNZdJ114XcleGl5sXr1fD19hX7NgBWBXYKpg/GFPYaJh9WJJYpxi8GNDY5dj62RAZJRk6WU9ZZJl52Y9ZpJm6Gc9Z5Nn6Wg/aJZo7GlDaZpp8WpIap9q92tPa6dr/2xXbK9tCG1gbbluEm5rbsRvHm94b9FwK3CGcOBxOnGVcfByS3KmcwFzXXO4dBR0cHTMdSh1hXXhdj52m3b4d1Z3s3gReG54zHkqeYl553pGeqV7BHtje8J8IXyBfOF9QX2hfgF+Yn7CfyN/hH/lgEeAqIEKgWuBzYIwgpKC9INXg7qEHYSAhOOFR4Wrhg6GcobXhzuHn4gEiGmIzokziZmJ/opkisqLMIuWi/yMY4zKjTGNmI3/jmaOzo82j56QBpBukNaRP5GokhGSepLjk02TtpQglIqU9JVflcmWNJaflwqXdZfgmEyYuJkkmZCZ/JpomtWbQpuvnByciZz3nWSd0p5Anq6fHZ+Ln/qgaaDYoUehtqImopajBqN2o+akVqTHpTilqaYapoum/adup+CoUqjEqTepqaocqo+rAqt1q+msXKzQrUStuK4trqGvFq+LsACwdbDqsWCx1rJLssKzOLOutCW0nLUTtYq2AbZ5tvC3aLfguFm40blKucK6O7q1uy67p7whvJu9Fb2Pvgq+hL7/v3q/9cBwwOzBZ8Hjwl/C28NYw9TEUcTOxUvFyMZGxsPHQce/yD3IvMk6ybnKOMq3yzbLtsw1zLXNNc21zjbOts83z7jQOdC60TzRvtI/0sHTRNPG1EnUy9VO1dHWVdbY11zX4Nhk2OjZbNnx2nba+9uA3AXcit0Q3ZbeHN6i3ynfr+A24L3hROHM4lPi2+Nj4+vkc+T85YTmDeaW5x/nqegy6LzpRunQ6lvq5etw6/vshu0R7ZzuKO6070DvzPBY8OXxcvH/8ozzGfOn9DT0wvVQ9d72bfb794r4Gfio+Tj5x/pX+uf7d/wH/Jj9Kf26/kv+3P9t//9kZXNjAAAAAAAAAC5JRUMgNjE5NjYtMi0xIERlZmF1bHQgUkdCIENvbG91ciBTcGFjZSAtIHNSR0IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAAAAAUAAAAAAAAG1lYXMAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlhZWiAAAAAAAAAAngAAAKQAAACHWFlaIAAAAAAAAG+iAAA49QAAA5BzaWcgAAAAAENSVCBkZXNjAAAAAAAAAC1SZWZlcmVuY2UgVmlld2luZyBDb25kaXRpb24gaW4gSUVDIDYxOTY2LTItMQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWFlaIAAAAAAAAPbWAAEAAAAA0y10ZXh0AAAAAENvcHlyaWdodCBJbnRlcm5hdGlvbmFsIENvbG9yIENvbnNvcnRpdW0sIDIwMTUAAHNmMzIAAAAAAAEMRAAABd////MmAAAHlAAA/Y////uh///9ogAAA9sAAMB1';
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
const pdfaYield = () => new Promise(r => setTimeout(r, 0));
const PDFA_PROFILES = [['1b', 'PDF/A-1b'], ['1a', 'PDF/A-1a'], ['2b', 'PDF/A-2b'], ['2u', 'PDF/A-2u'], ['2a', 'PDF/A-2a'], ['3b', 'PDF/A-3b'], ['3u', 'PDF/A-3u'], ['3a', 'PDF/A-3a']];
const pdfaProfileLabel = r => `${r.profile} (ISO 19005-${r.part}, livello ${r.level})`;

/* conversione verificata: un file già conforme non si tocca; dopo la conversione il risultato si verifica con le regole
   della norma e le pagine ancora segnalate si ricostruiscono (poi, se serve, tutto il documento) */
async function pdfaMake(bytes, pdfjs, opts = {}) {
  const part = opts.part || 1;
  if (opts.keepValid !== false && opts.mode !== 'rebuild') {
    const pre = opts.pre || await PDFACheck.check(bytes, { part, level: 'B', yield: pdfaYield });
    if (pre.valid) return { bytes, already: true, check: pre, report: { native: [], rebuilt: [] }, rounds: 0 };
  }
  // caratteri standard non incorporati: si incorporano quelli con le stesse misure (la pagina resta testo, non immagine)
  // (livelli in PDF/A-1 e immagini JPEG 2000: sistemati prima, la pagina resta testo vero)
  if (opts.mode !== 'rebuild') { try { const e = await PDFA.prepare(bytes, pdfjs, part); if (e.n) { bytes = e.bytes; pdfjs = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise; } } catch (e) { console.warn('preparazione PDF/A', e); } }
  const force = new Set();
  let mode = opts.mode || 'auto', out = null, chk = null, rounds = 0;
  for (; rounds < 4; rounds++) {
    opts.onRound?.(rounds);
    const an = await PDFA.analyze(bytes, part);
    out = await PDFA.convert(bytes, pdfjs, an, { ...opts, part, mode, force });
    chk = await PDFACheck.check(out.bytes, { part, level: 'B', yield: pdfaYield });
    if (chk.valid || mode === 'rebuild') break;
    const done = new Set(out.report.rebuilt.map(r => r.page - 1));
    const more = [...new Set(chk.issues.flatMap(i => i.pages || []))].map(p => p - 1).filter(p => p >= 0 && !done.has(p));
    if (more.length) more.forEach(p => force.add(p));
    else mode = 'rebuild';   // problemi del documento nel suo insieme: ogni pagina diventa immagine con testo ricercabile
  }
  return { bytes: out.bytes, report: out.report, check: chk, rounds: rounds + 1, fullRebuild: mode === 'rebuild' };
}

// l'esito della verifica di un file, con i problemi raggruppati per area
function pdfaVerdict(r, { open = false, compact = false } = {}) {
  if (!r) return h('div', { class: 'muted small' }, 'verifica…');
  if (r.fatal) return h('div', { class: 'pa-v bad' }, h('div', { class: 'pa-v-h' }, ic('x', 16), h('b', {}, 'Non verificabile: '), r.fatal));
  const n = r.issues.length;
  const head = h('div', { class: 'pa-v-h' }, ic(r.valid ? 'check' : 'x', 16),
    h('b', {}, r.valid ? `Conforme a ${r.profile}` : `Non conforme a ${r.profile}`),
    r.valid ? null : h('span', {}, ` · ${plural(n, 'problema', 'problemi')}`));
  const decl = h('div', { class: 'muted small' }, r.declared ? `Il file dichiara di essere ${r.declared}` + (r.declared === r.profile ? '' : `; verificato come ${r.profile}`) : 'Il file non dichiara di essere un PDF/A');
  if (r.valid || compact && !n) return h('div', { class: 'pa-v ' + (r.valid ? 'ok' : 'bad') }, head, decl);
  const groups = new Map(); r.issues.forEach(i => { if (!groups.has(i.catLabel)) groups.set(i.catLabel, []); groups.get(i.catLabel).push(i); });
  const pagesTxt = ps => !ps.length ? '' : ps.length > 8 ? `p. ${ps.slice(0, 8).join(', ')} e altre ${ps.length - 8}` : `p. ${ps.join(', ')}`;
  const list = h('div', { class: 'pa-issues' }, [...groups].map(([cat, items]) => h('div', { class: 'pa-grp' },
    h('div', { class: 'pa-grp-t' }, cat),
    h('ul', {}, items.map(i => h('li', {}, h('span', {}, i.text), h('span', { class: 'muted small' }, [pagesTxt(i.pages), i.details.length ? i.details.slice(0, 2).join(' · ') : '', `ISO 19005-${r.part} § ${i.clause}`].filter(Boolean).join(' — '))))))));
  const det = h('details', { class: 'pa-det', open: open || undefined }, h('summary', {}, 'Cosa non va'), list);
  return h('div', { class: 'pa-v bad' }, head, decl, det);
}

function pdfaReportBlocks(items) {
  const blocks = [];
  for (const { name, pages, r } of items) {
    blocks.push({ h: name });
    if (r.fatal) { blocks.push({ box: r.fatal, tone: 'bad' }); continue; }
    blocks.push({ kv: [['Profilo verificato', pdfaProfileLabel(r)], ['Dichiarato nel file', r.declared || 'nessuna dichiarazione PDF/A'], ['Pagine', String(pages ?? r.pages)], ['Esito', r.valid ? 'Conforme' : `Non conforme: ${plural(r.issues.length, 'problema', 'problemi')}`]] });
    if (r.valid) blocks.push({ box: `Il file rispetta le regole di ${r.profile}.`, tone: 'ok' });
    else blocks.push({ table: { head: ['Area', 'Problema', 'Dove', 'Clausola'], widths: [0.17, 0.5, 0.18, 0.15], rows: r.issues.map(i => [i.catLabel, i.text + (i.details.length ? ` (${i.details.slice(0, 2).join('; ')})` : ''), i.pages.length ? 'p. ' + (i.pages.length > 12 ? i.pages.slice(0, 12).join(', ') + '…' : i.pages.join(', ')) : 'documento', i.clause]), marks: r.issues.map(() => 'del') } });
  }
  blocks.push({ p: 'Controlli secondo la norma ISO 19005 (PDF/A), con le regole dei profili di validazione di veraPDF, verificati sulla sua suite di prova.', muted: true });
  return blocks;
}

async function startPdfa(stage, files, tool, { verify = false } = {}) {
  const docs = [];
  await withBusy('Apertura dei file…', async () => {
    for (const [i, f] of files.entries()) { Busy.set(i / files.length, f.name); try { docs.push(await openPdf(f)); } catch (e) { Errors.show(e, { file: f, skipped: files.length > 1 }); } }
  });
  if (!docs.length) throw new Error('Nessun PDF valido');
  const st = { part: 1, mode: 'auto', dpi: 200, keepValid: true, as: 'auto', out: { pdf: true, docx: false } };
  const analyses = new Map(), checks = new Map();
  const list = h('div', { class: 'filelist' });
  const keyOf = (part, level) => part + level;
  let gen = 0;
  // verifica (asincrona, un file alla volta, senza bloccare la pagina)
  async function verifyDoc(d, part, level) {
    const k = keyOf(part || 'auto', level || ''), m = checks.get(d) || new Map(); checks.set(d, m);
    if (m.has(k)) return m.get(k);
    const r = await PDFACheck.check(d.bytes, { part, level, yield: pdfaYield });
    m.set(k, r); return r;
  }
  const asOpts = () => { if (st.as === 'auto') return {}; return { part: +st.as[0], level: st.as[1].toUpperCase() }; };
  async function analyzeAll() {
    const g = ++gen;
    draw();
    for (const d of docs) {
      if (g !== gen) return;
      try {
        if (verify) { const o = asOpts(); await verifyDoc(d, o.part, o.level); }
        else {
          // l'analisi si fa sul file come lo prepara la conversione (caratteri standard incorporati, campi nella pagina)
          d._prep ||= {};
          const prepOf = part => d._prep[part] ||= PDFA.prepare(d.bytes, d.pdfjs, part).then(e => e.bytes).catch(() => d.bytes);
          analyses.set(d, await PDFA.analyze(await prepOf(st.part), st.part));
          // con PDF/A-1b: quante pagine resterebbero testo vero con PDF/A-2b (trasparenze ammesse)
          if (st.part === 1) { const a2 = await PDFA.analyze(await prepOf(2), 2); d._bad2 = a2.pages ? a2.pages.filter(p => p.reasons.length).length : null; }
          await verifyDoc(d, st.part, 'B');
          const c = d._claim === undefined ? (d._claim = PDFACheck.claim(d.bytes)) : d._claim;
          if (c && !(c.part === st.part)) await verifyDoc(d, null, null);
        }
      } catch (e) { console.warn(e); }
      if (g === gen) draw();
      await pdfaYield();
    }
  }
  const resOf = (d, part, level) => checks.get(d)?.get(keyOf(part || 'auto', level || ''));
  function draw() {
    const pending = docs.some(d => verify ? !resOf(d, asOpts().part, asOpts().level) : !analyses.get(d));
    list.replaceChildren(...(pending && !docs.some(d => checks.get(d)?.size) ? [h('div', { class: 'hint' }, verify ? 'Verifica della conformità in corso…' : 'Analisi della conformità in corso…')] : []), ...docs.map(d => verify ? rowVerify(d) : rowConvert(d)));
  }
  const thumb = d => h('div', { class: 'fr-thumb' }, lazyThumb(d.pdfjs, 1, h('canvas'), 40, 52));
  function rowVerify(d) {
    const o = asOpts(), r = resOf(d, o.part, o.level);
    const conv = r && !r.valid ? h('button', { class: 'btn sm', onclick: () => handoff('pdfa', [d.file]) }, ic('pdfa', 16), 'Converti in PDF/A') : null;
    return h('div', { class: 'filerow pa-row' }, thumb(d),
      h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, d.name), h('div', { class: 'muted small' }, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`), pdfaVerdict(r, { open: docs.length === 1 })), conv);
  }
  function rowConvert(d) {
    const a = analyses.get(d), target = resOf(d, st.part, 'B'), c = d._claim === undefined ? (d._claim = PDFACheck.claim(d.bytes)) : d._claim, own = c && c.part !== st.part ? resOf(d, null, null) : null;
    const bad = a && a.pages ? a.pages.map((p, i) => ({ i: i + 1, r: p.reasons })).filter(x => x.r.length) : null;
    const reasons = bad ? [...new Set(bad.flatMap(x => x.r))] : [];
    const W = (txt, tone) => h('span', { class: 'small', style: { color: `var(--${tone})`, fontWeight: 650 } }, txt);
    let status;
    if (!a) status = h('span', { class: 'muted small' }, 'analisi…');
    else if (target?.valid && st.keepValid && st.mode !== 'rebuild') status = h('div', { class: 'pa-v ok' }, h('div', { class: 'pa-v-h' }, ic('check', 16), h('b', {}, `Già PDF/A-${st.part}b valido`), h('span', {}, ': resta com’è')));
    else {
      const parts = [];
      if (c) { const v = own || target; parts.push(h('div', { class: 'small pa-claim' }, v && !v.valid ? W(`Dichiara di essere PDF/A-${c.part}${c.level.toLowerCase()} ma non è conforme (${plural(v.issues.length, 'problema', 'problemi')}): lo sistemo`, 'warn') : W(`Già PDF/A-${c.part}${c.level.toLowerCase()} valido: lo converto in PDF/A-${st.part}b`, 'ok'))); }
      if (st.mode === 'rebuild') parts.push(W(`Tutte le ${d.numPages} pagine verranno ricostruite`, 'warn'));
      else if (!a.pages) parts.push(W('Documento protetto o danneggiato: tutte le pagine verranno ricostruite', 'warn'));
      else if (!bad.length) parts.push(W('Tutte le pagine sono convertibili mantenendo testo e grafica originali', 'ok'));
      else {
        parts.push(h('div', { class: 'small' }, W(`${plural(bad.length, 'pagina', 'pagine')} su ${d.numPages} da ricostruire come immagine`, 'warn'), h('span', { class: 'muted' }, ` (${bad.length <= 12 ? 'p. ' + bad.map(x => x.i).join(', ') + ' — ' : ''}${reasons.join('; ')})`)));
        // PDF/A-2b eviterebbe di trasformarle in immagini: lo si propone (non si cambia da soli: certi portali vogliono l'1b)
        const saved = st.part === 1 && d._bad2 != null ? bad.length - d._bad2 : 0;
        if (saved > 0) parts.push(h('div', { class: 'small pa-alt' }, h('span', {}, `Con PDF/A-2b ${saved === bad.length ? (bad.length === 1 ? 'questa pagina resta' : 'queste pagine restano') : `${plural(saved, 'pagina resta', 'pagine restano')}`} testo vero, non immagine. `),
          h('button', { class: 'linkbtn', onclick: () => partSeg.querySelectorAll('button')[1]?.click() }, 'Usa PDF/A-2b')));
      }
      if (c && own && !own.valid) parts.push(pdfaVerdict(own));
      status = h('div', {}, ...parts);
    }
    return h('div', { class: 'pa-doc' }, h('div', { class: 'filerow' }, thumb(d),
      h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, d.name), h('div', { class: 'muted small' }, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`), status)),
      pageGrid(d, a));
  }
  // pagina per pagina: cosa succede a ciascuna (resta con testo e grafica originali o diventa un'immagine con testo ricercabile) e perché
  function pageGrid(d, a) {
    if (!a || docs.length > 3) return null;
    const keep = !(target => target?.valid && st.keepValid && st.mode !== 'rebuild')(resOf(d, st.part, 'B'));
    if (!keep) return null;
    const MAX = 60, n = Math.min(d.numPages, MAX);
    const cells = [];
    for (let i = 1; i <= n; i++) {
      const r = st.mode === 'rebuild' || !a.pages ? ['ricostruzione richiesta'] : a.pages[i - 1]?.reasons || [];
      const ok = !r.length;
      cells.push(h('figure', { class: 'pa-pg ' + (ok ? 'ok' : 'warn'), title: ok ? `Pagina ${i}: testo e grafica originali` : `Pagina ${i}: ricostruita come immagine con testo ricercabile — ${r.join('; ')}` },
        h('div', { class: 'pa-pg-im' }, lazyThumb(d.pdfjs, i, h('canvas'), 96, 124)),
        h('figcaption', {}, h('b', {}, String(i)), h('span', {}, ok ? 'originale' : 'ricostruita'))));
    }
    return h('div', { class: 'pa-pages', role: 'list', 'aria-label': `Pagine di ${d.name}` }, ...cells.map(c => (c.setAttribute('role', 'listitem'), c)),
      d.numPages > MAX ? h('div', { class: 'pa-more muted small' }, `e altre ${d.numPages - MAX} pagine`) : null);
  }

  if (verify) {
    const sel = h('select', { class: 'input', onchange: () => { st.as = sel.value; analyzeAll(); } }, h('option', { value: 'auto' }, 'Quello dichiarato nel file'), ...PDFA_PROFILES.map(([v, l]) => h('option', { value: v }, l)));
    workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, docs.length > 1 ? `Verifica di ${docs.length} file` : 'Verifica PDF/A')), list), [
      sec('Verifica come', sel, h('div', { class: 'muted small' }, 'Di solito si verifica il profilo che il file dichiara nei suoi metadati. Se il file non dichiara nulla si verifica PDF/A-1b, il più richiesto da PEC, Agenzia delle Entrate e processo telematico.')),
      sec('Cosa ottenere', checkbox('Rapporto in PDF', st.out.pdf, v => st.out.pdf = v), checkbox('Rapporto in Word', st.out.docx, v => st.out.docx = v)),
      h('div', { class: 'hint' }, 'Si controllano struttura del file, font incorporati, colori, trasparenze, metadati, annotazioni, azioni e allegati con le regole della norma ISO 19005, parte per parte.'),
    ], [h('button', { class: 'btn primary big btn-run', onclick: report }, ic('check', 18), 'Scarica il rapporto')]);
    analyzeAll();
    async function report() {
      if (!st.out.pdf && !st.out.docx) return toast('Scegli almeno un formato del rapporto', 'error');
      await withBusy('Verifica…', async () => {
        const items = [];
        for (const [k, d] of docs.entries()) { Busy.set(k / docs.length, d.name); const o = asOpts(); items.push({ name: d.name, pages: d.numPages, r: await verifyDoc(d, o.part, o.level) }); }
        const ok = items.filter(x => x.r.valid).length;
        const title = docs.length === 1 ? `Verifica PDF/A: ${docs[0].name}` : `Verifica PDF/A di ${docs.length} file`;
        const sub = `${new Date().toLocaleDateString('it-IT')} · ${docs.length === 1 ? (ok ? 'conforme' : 'non conforme') : `${ok} conformi su ${docs.length}`}`;
        const blocks = pdfaReportBlocks(items), base = docs.length === 1 ? `${docs[0].base} - verifica PDF-A` : 'Verifica PDF-A';
        const outs = [];
        if (st.out.pdf) outs.push({ name: base + '.pdf', bytes: await Report.pdf({ title, subtitle: sub, blocks, label: 'Verifica PDF/A' }), info: 'Rapporto' });
        if (st.out.docx) outs.push({ name: base + '.docx', bytes: await Report.docx({ title, subtitle: sub, blocks }), type: Report.DOCX, info: 'Rapporto' });
        showResult(outs, { title: 'Rapporto di verifica pronto', zipName: base + '.zip', note: docs.length === 1 ? (ok ? `Il file è conforme a ${items[0].r.profile}.` : `Il file non è conforme a ${items[0].r.profile}: ${plural(items[0].r.issues.length, 'problema', 'problemi')}.`) : `${ok} conformi su ${docs.length}.` });
      });
    }
    return;
  }

  const partSeg = seg([[1, 'PDF/A-1b'], [2, 'PDF/A-2b']], st.part, v => { st.part = v; analyzeAll(); });
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, 'Verifica di conformità per pagina')), list), [
    sec('Standard', partSeg,
      h('div', { class: 'muted small' }, 'PDF/A-1b è il formato più accettato dai portali della PA (Agenzia delle Entrate, ComUnica, PCT). PDF/A-2b è più recente e ammesso per la conservazione.')),
    sec('Modalità', seg([['auto', 'Automatica'], ['rebuild', 'Ricostruisci tutto']], st.mode, v => { st.mode = v; draw(); }),
      h('div', { class: 'muted small' }, 'Automatica conserva testo e grafica originali delle pagine conformi e ricostruisce solo le altre. «Ricostruisci tutto» trasforma ogni pagina in immagine con testo ricercabile: massima compatibilità, file più pesanti.')),
    sec('Qualità delle pagine ricostruite', seg([[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']], st.dpi, v => st.dpi = v)),
    sec('File già PDF/A', checkbox('Lascia com’è chi è già conforme', st.keepValid, v => { st.keepValid = v; draw(); }, 'Un file che rispetta già lo standard scelto non viene toccato: resta identico all’originale.')),
    h('div', { class: 'hint' }, 'Ogni file prodotto viene verificato con le regole della norma ISO 19005: se qualcosa non torna, le pagine coinvolte vengono ricostruite e il file si verifica di nuovo.'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('pdfa', 18), 'Converti in PDF/A')]);
  analyzeAll();

  async function run() {
    await withBusy('Conversione in PDF/A…', async () => {
      const outs = []; const notes = []; let kept = 0;
      for (const [k, d] of docs.entries()) {
        const pre = st.keepValid && st.mode !== 'rebuild' ? (resOf(d, st.part, 'B') || await verifyDoc(d, st.part, 'B')) : null;
        const r = await pdfaMake(d.bytes, d.pdfjs, { part: st.part, mode: st.mode, dpi: st.dpi, quality: st.dpi >= 300 ? 0.88 : 0.85, keepValid: st.keepValid, pre,
          check: () => Busy.check(), onProgress: (f, m) => Busy.set((k + f) / docs.length, `${d.name} — ${m}`), onRound: n => { if (n) Busy.set(null, `${d.name} — verifica e correzione`); } });
        if (r.already) { kept++; outs.push({ name: d.name, bytes: d.bytes, info: `già PDF/A-${st.part}b valido: non modificato` }); continue; }
        const rb = r.report.rebuilt.length;
        const ver = r.check.valid ? `verificato: conforme a PDF/A-${st.part}b` : `verifica: ${plural(r.check.issues.length, 'problema residuo', 'problemi residui')}`;
        outs.push({ name: `${d.base}-PDFA-${st.part}b.pdf`, bytes: r.bytes, info: `${rb ? `${plural(rb, 'pagina ricostruita', 'pagine ricostruite')} su ${d.numPages}` : 'testo e grafica originali conservati'} · ${ver}` });
        if (rb && st.mode === 'auto') notes.push(`${d.name}: ricostruite p. ${r.report.rebuilt.map(x => x.page).join(', ')}`);
        if (!r.check.valid) notes.push(`${d.name}: ${r.check.issues.map(i => i.text.toLowerCase()).join('; ')}`);
      }
      const allOk = outs.every(o => !/residu/.test(o.info));
      showResult(outs, { title: outs.length > 1 ? 'PDF/A pronti' : 'PDF/A pronto', zipName: 'pdfa.zip',
        note: (allOk ? `Conforme a PDF/A-${st.part}b (ISO 19005-${st.part}): ogni file è stato verificato.` : `Alcuni file non superano la verifica di PDF/A-${st.part}b.`) + (kept ? ` ${plural(kept, 'file era', 'file erano')} già conform${kept > 1 ? 'i' : 'e'} e ${kept > 1 ? 'sono rimasti' : 'è rimasto'} com’era.` : '') + (notes.length ? ' ' + notes.join(' · ') : '') });
    }, { cancellable: true });
  }
}

/* ============================================================
   FillKit — tutto ciò che serve per compilare un modulo come si deve:
   metriche identiche a quelle usate nel file salvato (anteprima = risultato),
   formati e calcoli dei moduli Acrobat (AFNumber, AFDate, AFSimple_Calculate…),
   controlli italiani (codice fiscale, partita IVA, IBAN, CAP, e-mail/PEC, date),
   «I miei dati» per compilare in un clic, firme salvate sul dispositivo.
   ============================================================ */
const FillKit = (() => {
  /* ---------- metriche dei font standard (le stesse di pdf-lib) ---------- */
  const FAM_OF = name => {
    const s = String(name || '').toLowerCase();
    const fam = /cour|mono/.test(s) ? 'cour' : /times|tiro|tibo|tiit|tibi|serif|roman|garamond|georgia|book/.test(s) && !/sans/.test(s) ? 'times' : 'helv';
    const bold = /bold|black|heavy|semibold|\bbo\b|hebo|tibo|tibi|cobo|cobi|hebi|,b\b|-b\b/.test(s);
    const italic = /italic|oblique|tiit|tibi|heob|hebi|coob|cobi|,i\b/.test(s);
    return { fam, bold, italic };
  };
  const stdName = ({ fam, bold, italic }) => STD[fam][(bold ? 1 : 0) + (italic ? 2 : 0)];
  let _m = null;
  async function ready() {
    if (_m) return _m;
    const d = await PDFLib.PDFDocument.create(); const fonts = new Map();
    for (const fam of Object.keys(STD)) for (const n of STD[fam]) fonts.set(n, await d.embedFont(n));
    return (_m = fonts);
  }
  const fontFor = F => _m.get(stdName(F.font || { fam: 'helv' }));
  const safe = (font, s) => pdfSafe(font, s);
  const ASC = font => font.heightAtSize(1, { descender: false });
  const FULL = font => font.heightAtSize(1);
  function wrap(font, text, size, width) {
    // stesso algoritmo di pdf-lib (splitOutLines): a capo sulle parole, poi sui caratteri
    const out = [];
    for (let line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
      let rest = line;
      do {
        let cut = rest.length, lastWs;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === ' ') lastWs = i;
          if (font.widthOfTextAtSize(rest.slice(0, i + 1), size) > width) { cut = lastWs != null && lastWs > 0 ? lastWs : Math.max(1, i); break; }
        }
        out.push(rest.slice(0, cut)); rest = cut < rest.length ? rest.slice(cut).trim() : '';
      } while (rest);
    }
    return out;
  }
  /* dimensione del testo: la stessa per anteprima e file */
  function layout(F, text) {
    const font = fontFor(F), t = safe(font, text || '');
    const bw = F.bw || 0, pad = F.type === 'comb' ? 0 : 1, b = bw + pad;
    const bwid = Math.max(1, F.w - 2 * b), bh = Math.max(1, F.h - 2 * b);
    const da = F.daSize > 0 ? F.daSize : F.size > 0 ? F.size : 0;
    if (F.type === 'comb') {
      const n = Math.max(1, F.maxLen || 1), cell = bwid / n;
      let s = da || Math.min(bh * 0.72, 14);
      for (const ch of t) { const w = font.widthOfTextAtSize(ch, 1); if (w * s > cell * 0.92) s = cell * 0.92 / w; }
      s = Math.max(4, Math.floor(s * 4) / 4);
      return { size: s, b, bwid, bh, cell, font, t };
    }
    if (F.type === 'multi') {
      let s = da || Math.max(6, Math.min(10, bh / 1.12));
      const lh = sz => FULL(font) * sz * 1.2;
      let lines = wrap(font, t, s, bwid);
      while (s > 4 && lines.length * lh(s) > bh + 0.01) { s -= 0.25; lines = wrap(font, t, s, bwid); }
      return { size: s, b, bwid, bh, lines, lh: lh(s), font, t };
    }
    const one = t.replace(/\s*\n\s*/g, ' ');
    let s = da || Math.max(5, Math.min(12, bh * 0.72));
    const w = font.widthOfTextAtSize(one, s);
    if (w > bwid) s = Math.max(4, Math.floor(s * bwid / w * 4) / 4);
    return { size: s, b, bwid, bh, font, t: one, shrunk: s < (da || Math.max(5, Math.min(12, bh * 0.72))) };
  }

  /* ---------- JavaScript dei moduli Acrobat (solo le funzioni standard AF*) ---------- */
  const DATE_IDX = ['m/d', 'm/d/yy', 'mm/dd/yy', 'mm/yy', 'd-mmm', 'd-mmm-yy', 'dd-mmm-yy', 'yy-mm-dd', 'mmm-yy', 'mmmm-yy', 'mmm d, yyyy', 'mmmm d, yyyy', 'm/d/yy h:MM tt', 'm/d/yy HH:MM'];
  function parseAA(js) {
    const o = {};
    const F = js.F || '', K = js.K || '', C = js.C || '', V = js.V || '';
    let m;
    if ((m = F.match(/AFNumber_Format\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*(true|false)/))) o.fmt = { kind: 'num', dec: +m[1], sep: +m[2], neg: +m[3], cur: m[5], pre: m[6] === 'true' };
    else if ((m = F.match(/AFPercent_Format\(\s*(\d+)\s*,\s*(\d+)/))) o.fmt = { kind: 'pct', dec: +m[1], sep: +m[2] };
    else if ((m = F.match(/AFDate_FormatEx\(\s*"([^"]+)"/))) o.fmt = { kind: 'date', f: m[1] };
    else if ((m = F.match(/AFDate_Format\(\s*(\d+)/))) o.fmt = { kind: 'date', f: DATE_IDX[+m[1]] || 'dd/mm/yyyy' };
    else if ((m = F.match(/AFSpecial_Format\(\s*(\d+)/))) o.fmt = { kind: 'special', n: +m[1] };
    else if (/AFNumber_Keystroke/.test(K)) { m = K.match(/AFNumber_Keystroke\(\s*(\d+)\s*,\s*(\d+)/); o.fmt = { kind: 'num', dec: m ? +m[1] : 2, sep: m ? +m[2] : 2, neg: 0, cur: '', pre: true }; }
    else if ((m = K.match(/AFDate_KeystrokeEx\(\s*"([^"]+)"/))) o.fmt = { kind: 'date', f: m[1] };
    if ((m = C.match(/AFSimple_Calculate\(\s*"(\w+)"\s*,\s*(?:new\s+Array\s*\(([^)]*)\)|"([^"]*)"|\[([^\]]*)\])/))) {
      const list = m[2] ?? m[4];
      const names = list != null ? [...list.matchAll(/"([^"]*)"|'([^']*)'/g)].map(x => x[1] ?? x[2]) : m[3].split(',').map(s => s.trim());
      o.calc = { op: m[1].toUpperCase(), names: names.filter(Boolean) };
    } else if (C.trim()) o.calcCustom = true;
    if ((m = V.match(/AFRange_Validate\(\s*(true|false)\s*,\s*(-?[\d.]+)\s*,\s*(true|false)\s*,\s*(-?[\d.]+)/))) o.range = { gt: m[1] === 'true' ? +m[2] : null, lt: m[3] === 'true' ? +m[4] : null };
    return o;
  }
  const SEPS = [[',', '.'], ['', '.'], ['.', ','], ['', ','], ["'", '.']];
  function parseNum(s, sep = 2) {
    s = String(s ?? '').trim(); if (!s) return NaN;
    const neg = /^\(.*\)$/.test(s) || /-/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    const hasC = s.includes(','), hasD = s.includes('.');
    if (hasC && hasD) { const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'; s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.'); }
    else if (hasC) s = (sep === 0 || sep === 4) && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
    else if (hasD && (sep === 2 || sep === 3) && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if (hasD && (s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }
  function fmtNum(n, dec = 2, sep = 2) {
    const [th, dp] = SEPS[sep] || SEPS[2];
    const [i, d] = Math.abs(n).toFixed(dec).split('.');
    const ii = th ? i.replace(/\B(?=(\d{3})+(?!\d))/g, th) : i;
    return ii + (d ? dp + d : '');
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function fmtDate(dt, f) {
    const p2 = n => String(n).padStart(2, '0');
    return f.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|HH|H|hh|h|MM|M|ss|tt/g, t => {
      const D = dt.getDate(), Mo = dt.getMonth(), Y = dt.getFullYear(), Hh = dt.getHours(), Mi = dt.getMinutes();
      switch (t) {
        case 'yyyy': return Y; case 'yy': return p2(Y % 100);
        case 'mmmm': return MONTHS[Mo]; case 'mmm': return MONTHS[Mo].slice(0, 3); case 'mm': return p2(Mo + 1); case 'm': return Mo + 1;
        case 'dd': return p2(D); case 'd': return D; case 'dddd': case 'ddd': return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
        case 'HH': return p2(Hh); case 'H': return Hh; case 'hh': return p2(Hh % 12 || 12); case 'h': return Hh % 12 || 12;
        case 'MM': return p2(Mi); case 'M': return Mi; case 'ss': return p2(dt.getSeconds()); case 'tt': return Hh < 12 ? 'am' : 'pm';
      }
      return t;
    });
  }
  /* «1/2/80», «01021980», «1-2-1980», «1980-02-01» → Date (giorno prima del mese, salvo formato americano) */
  function parseDate(s, monthFirst = false) {
    s = String(s || '').trim(); if (!s) return null;
    let d, m, y, mm;
    if ((mm = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [y, m, d] = [+mm[1], +mm[2], +mm[3]];
    else if ((mm = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) { [d, m, y] = [+mm[1], +mm[2], +mm[3]]; if (monthFirst) [d, m] = [m, d]; }
    else if ((mm = s.match(/^(\d{2})(\d{2})(\d{4}|\d{2})$/))) { [d, m, y] = [+mm[1], +mm[2], +mm[3]]; if (monthFirst) [d, m] = [m, d]; }
    else if ((mm = s.match(/^(\d{1,2})[-/. ](\d{1,2})$/))) { [d, m] = [+mm[1], +mm[2]]; if (monthFirst) [d, m] = [m, d]; y = new Date().getFullYear(); }
    else return null;
    if (y < 100) { const cy = new Date().getFullYear() % 100; y += y <= cy + 10 ? 2000 : 1900; }
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }
  const today = () => fmtDate(new Date(), 'dd/mm/yyyy');

  /* ---------- significato del campo (dall'etichetta) e controlli ---------- */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_/.:;,()[\]*'’"-]+/g, ' ').replace(/\s+/g, ' ').trim();
  function semOf(label, F) {
    const l = norm(label);
    if (F?.fmt?.kind === 'date') return 'date';
    if (F?.fmt?.kind === 'num' || F?.fmt?.kind === 'pct') return 'num';
    if (/codice fiscale|\bcod fisc|^c ?f$|\bc f\b|\bcf\b/.test(l)) return 'cf';
    if (/partita iva|\bp ?iva\b/.test(l)) return 'piva';
    if (/\biban\b/.test(l)) return 'iban';
    if (/\bpec\b/.test(l)) return 'email';
    if (/e ?mail|posta elettronica|indirizzo email/.test(l)) return 'email';
    if (/\bcap\b|codice postale|c a p/.test(l)) return 'cap';
    if (/^(prov|provincia)\b|\bprov\b/.test(l)) return 'prov';
    if (/\btel\b|telefono|cellulare|\bcell\b|recapito tel/.test(l)) return 'tel';
    if (/\bdata\b|\bnat[oa]? (a )?il\b|^il$|\bil giorno\b|scadenza|rilasciat[oa] il/.test(l) && !/luogo e data|data e luogo|luogo data/.test(l)) return 'date';
    return null;
  }
  const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
  function cfOk(cf) {
    cf = String(cf).toUpperCase().replace(/\s/g, '');
    if (/^\d{11}$/.test(cf)) return pivaOk(cf);
    if (!/^[A-Z]{6}[\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    let s = 0;
    for (let i = 0; i < 15; i++) { const c = cf[i]; s += i % 2 === 0 ? ODD[c] : /\d/.test(c) ? +c : c.charCodeAt(0) - 65; }
    return String.fromCharCode(65 + (s % 26)) === cf[15];
  }
  function pivaOk(p) {
    p = String(p).replace(/\s/g, '').replace(/^IT/i, '');
    if (!/^\d{11}$/.test(p)) return false;
    let s = 0;
    for (let i = 0; i < 10; i++) { let d = +p[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
    return (10 - (s % 10)) % 10 === +p[10];
  }
  const IBAN_LEN = { IT: 27, SM: 27, VA: 22, DE: 22, FR: 27, ES: 24, AT: 20, BE: 16, CH: 21, GB: 22, IE: 22, LU: 20, NL: 18, PT: 25, MT: 31, SI: 19, HR: 21, GR: 27, PL: 28, RO: 24 };
  function ibanOk(v) {
    const s = String(v).toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (IBAN_LEN[s.slice(0, 2)] && IBAN_LEN[s.slice(0, 2)] !== s.length) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let m = 0;
    for (const ch of r) { const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of n) m = (m * 10 + +d) % 97; }
    return m === 1;
  }
  /* normalizza mentre si scrive / all'uscita dal campo */
  function normalize(sem, v, F) {
    if (v == null) return v;
    switch (sem) {
      case 'cf': return v.toUpperCase().replace(/\s+/g, '');
      case 'iban': return v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, F?.type === 'comb' ? '$1' : '$1 ').trim();
      case 'piva': return v.replace(/\s+/g, '');
      case 'prov': return v.length <= 3 ? v.toUpperCase() : v;
      case 'email': return v.trim().replace(/\s+/g, '');
      case 'cap': return v.replace(/\s+/g, '');
    }
    return v;
  }
  function check(sem, v, F) {
    v = String(v ?? '').trim(); if (!v) return null;
    switch (sem) {
      case 'cf': return cfOk(v) ? null : /^\d{11}$/.test(v.replace(/\s/g, '')) ? 'Codice fiscale numerico non valido (cifra di controllo)' : /^[A-Z0-9]{16}$/i.test(v.replace(/\s/g, '')) ? 'Codice fiscale non valido: il carattere di controllo non torna' : 'Il codice fiscale ha 16 caratteri (o 11 cifre per le società)';
      case 'piva': return pivaOk(v) ? null : 'Partita IVA non valida (11 cifre con cifra di controllo)';
      case 'iban': return ibanOk(v) ? null : 'IBAN non valido: controlla le cifre';
      case 'email': return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? null : 'Indirizzo e-mail non valido';
      case 'cap': return /^\d{5}$/.test(v) ? null : 'Il CAP ha 5 cifre';
      case 'tel': return /^\+?[\d\s./()-]{6,}$/.test(v) ? null : 'Numero di telefono non valido';
      case 'date': return !/^[\d\s/.-]+$/.test(v) || parseDate(v, F?.fmt?.kind === 'date' && /^m/.test(F.fmt.f)) ? null : 'Data non valida (es. 31/12/2025)';
      case 'num': return isFinite(parseNum(v, F?.fmt?.sep)) ? null : 'Inserisci un numero';
    }
    return null;
  }

  /* ---------- I miei dati ---------- */
  const PROFILE = [
    ['nome', 'Nome'], ['cognome', 'Cognome'], ['cf', 'Codice fiscale'], ['dataNascita', 'Data di nascita'], ['luogoNascita', 'Luogo di nascita'], ['provNascita', 'Provincia di nascita'],
    ['indirizzo', 'Indirizzo (via e numero)'], ['cap', 'CAP'], ['comune', 'Comune di residenza'], ['prov', 'Provincia di residenza'],
    ['telefono', 'Telefono'], ['email', 'E-mail'], ['pec', 'PEC'], ['iban', 'IBAN'], ['piva', 'Partita IVA'],
  ];
  const PKEY = 'officina-profilo', SKEY = 'officina-firme';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const profile = () => load(PKEY, {});
  const saveProfile = p => store(PKEY, p);
  /* chiave del profilo per un'etichetta; ctx.zone tiene conto di «nato a… prov.» vs «residente in… prov.» */
  function profileKey(label, ctx = {}) {
    const l = norm(label);
    if (!l || /\bfirma\b|sottoscrizione|timbro/.test(l)) return null;
    const birth = /nasc|\bnat[oa]\b|nato|nata/.test(l), res = /resid|domicil|indirizz|\bvia\b/.test(l);
    let k = null;
    if (/^(il la |il |la )?sottoscritt|nome e cognome|cognome e nome|nominativo|dichiarante|richiedente|generalita|^nome cognome$|^cognome nome$/.test(l)) k = /^cognome/.test(l) || /cognome e nome/.test(l) ? 'cognomeNome' : 'nomeCompleto';
    else if (/\bcognome\b/.test(l)) k = 'cognome';
    else if (/\bnome\b/.test(l) && !/nome (della |dell )?(ditta|societa|impresa|ente)/.test(l)) k = 'nome';
    else if (/codice fiscale|\bcod fisc|^c ?f$|\bcf\b|\bc f\b/.test(l)) k = 'cf';
    else if (/partita iva|\bp ?iva\b/.test(l)) k = 'piva';
    else if (/\biban\b/.test(l)) k = 'iban';
    else if (/\bpec\b/.test(l)) k = 'pec';
    else if (/e ?mail|posta elettronica/.test(l)) k = 'email';
    else if (/\btel\b|telefono|cellulare|\bcell\b/.test(l)) k = 'telefono';
    else if (/^(luogo e data|luogo data|data e luogo|li)$/.test(l)) k = 'luogoData';
    else if (/data (di )?nascita|nascita data|\bnat[oa]? (a )?il\b|\bnato a il\b/.test(l) || (/^il$/.test(l) && ctx.last === 'luogoNascita')) k = 'dataNascita';
    else if (/luogo (di )?nascita|comune di nascita|\bnat[oa]\b( a)?( a)?$|\bnato a\b|\bnata a\b/.test(l)) k = 'luogoNascita';
    else if (/\bprov\b|provincia/.test(l)) k = birth || (!res && ctx.zone === 'nascita') ? 'provNascita' : 'prov';
    else if (/\bcap\b|codice postale/.test(l)) k = 'cap';
    else if (/indirizzo|residente in|\bvia\b|domicilio|sede in/.test(l)) k = 'indirizzo';
    else if (/comune|citta|residente a|localita/.test(l)) k = birth || (!res && ctx.zone === 'nascita' && ctx.last !== 'provNascita') ? 'luogoNascita' : 'comune';
    else if (/^data$|^data odierna$/.test(l)) k = 'oggi';
    if (k) { ctx.last = k; if (/Nascita/.test(k)) ctx.zone = 'nascita'; else if (['indirizzo', 'cap', 'comune', 'prov'].includes(k)) ctx.zone = 'res'; }
    return k;
  }
  function profileValue(k, p) {
    switch (k) {
      case 'nomeCompleto': return [p.nome, p.cognome].filter(Boolean).join(' ');
      case 'cognomeNome': return [p.cognome, p.nome].filter(Boolean).join(' ');
      case 'luogoData': return p.comune ? `${p.comune}, ${today()}` : today();
      case 'oggi': return today();
    }
    return p[k] || '';
  }

  /* ---------- firme salvate ---------- */
  const sigs = () => load(SKEY, []);
  const saveSigs = a => store(SKEY, a.slice(0, 4));
  function trimCanvas(c, pad = 6) {
    const ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const out = h('canvas', { width: x1 - x0 + 1 + 2 * pad, height: y1 - y0 + 1 + 2 * pad });
    out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  /* foto o scansione di una firma su carta → solo l'inchiostro, sfondo trasparente */
  async function inkFromImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImage(url);
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = h('canvas', { width: Math.round(im.naturalWidth * k), height: Math.round(im.naturalHeight * k) });
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, c.width, c.height);
      const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
      // soglia di Otsu sulla luminanza
      const hist = new Array(256).fill(0); const L = new Uint8Array(c.width * c.height);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { const a = d[i + 3] / 255; const l = Math.round((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a)); L[j] = l; hist[l]++; }
      let sum = 0, sumB = 0, wB = 0, best = 0, th = 160; const tot = L.length;
      for (let i = 0; i < 256; i++) sum += i * hist[i];
      for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } }
      th = Math.min(th, 200);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const l = L[j];
        const a = l >= th + 25 ? 0 : l <= th - 25 ? 255 : Math.round(255 * (th + 25 - l) / 50);
        d[i + 3] = a;
      }
      ctx.putImageData(id, 0, 0);
      return trimCanvas(c, 4);
    } finally { URL.revokeObjectURL(url); }
  }
  /* finestra della firma: disegna, carica una foto, oppure scegli una firma salvata. Restituisce un dataURL PNG. */
  function signatureDialog() {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
      const saved = sigs();
      let tab = saved.length ? 'saved' : IS_TOUCH ? 'draw' : 'draw';
      const body = h('div', { class: 'sig-body' });
      const remember = h('input', { type: 'checkbox', checked: true });
      const tabs = h('div', { class: 'seg' });
      const drawTabs = () => tabs.replaceChildren(...[['draw', 'Disegna'], ['upload', 'Da foto'], ...(sigs().length ? [['saved', 'Salvate']] : [])].map(([v, l]) => h('button', { class: tab === v ? 'on' : '', onclick: () => { tab = v; drawTabs(); show(); } }, l)));
      const keep = url => { if (remember.checked) { const a = sigs().filter(s => s !== url); a.unshift(url); saveSigs(a); } finish(url); };
      function show() {
        if (tab === 'saved') {
          const list = sigs();
          body.replaceChildren(h('div', { class: 'sig-saved' }, ...list.map((u, i) => h('div', { class: 'sig-item' },
            h('button', { class: 'sig-pick', onclick: () => finish(u), title: 'Usa questa firma' }, h('img', { src: u, alt: 'Firma salvata' })),
            h('button', { class: 'icon-btn sm', title: 'Elimina', 'aria-label': 'Elimina firma salvata', onclick: () => { const a = sigs(); a.splice(i, 1); saveSigs(a); if (!a.length) tab = 'draw'; drawTabs(); show(); } }, ic('trash', 16))))),
            h('p', { class: 'muted small' }, 'Le firme sono salvate solo in questo browser, su questo dispositivo.'));
          return;
        }
        if (tab === 'upload') {
          const prev = h('div', { class: 'sig-prev muted small' }, 'Fotografa la firma su un foglio bianco (anche con il telefono): lo sfondo viene tolto e resta solo l’inchiostro.');
          let url = null;
          const inp = h('input', { type: 'file', accept: IMG_ACCEPT, hidden: true, onchange: async () => {
            const f = inp.files[0]; if (!f) return;
            let file = f;
            try { if (/heic|heif/i.test(f.type + f.name)) { const fr = (await decodeImageFile(f))[0]; file = fr.blob; } } catch { }
            const c = await inkFromImage(file);
            if (!c) { prev.textContent = 'Nessuna firma riconosciuta nell’immagine.'; return; }
            url = c.toDataURL('image/png');
            prev.replaceChildren(h('img', { src: url, alt: 'Anteprima della firma', class: 'sig-img' }));
            useBtn.disabled = false;
          } });
          const useBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => url && keep(url) }, 'Usa questa firma');
          body.replaceChildren(prev, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => inp.click() }, ic('upload', 16), 'Scegli immagine'), inp, h('span', { class: 'grow' }), useBtn));
          return;
        }
        const pad = h('canvas', { class: 'sig-pad' });
        let color = '#0B1F66', drawn = false;
        const useBtn = h('button', { class: 'btn primary', onclick: () => {
          if (!drawn) return toast('Disegna prima la firma', 'error');
          const c = trimCanvas(pad); if (!c) return;
          keep(c.toDataURL('image/png'));
        } }, 'Usa questa firma');
        body.replaceChildren(pad, h('div', { class: 'row', style: { marginTop: '10px' } },
          h('div', { class: 'swatches grow' }, ...['#0B1F66', '#111111', '#1D4ED8'].map((c, i) => h('button', { class: 'sw' + (i ? '' : ' on'), style: { background: c }, title: ['Blu scuro', 'Nero', 'Blu'][i], onclick: e => { color = c; e.target.parentNode.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s === e.target)); } }))),
          h('button', { class: 'btn sm', onclick: () => { pad.getContext('2d').clearRect(0, 0, pad.width, pad.height); drawn = false; } }, 'Cancella'), useBtn));
        requestAnimationFrame(() => {
          const r = pad.getBoundingClientRect(), dpr = Math.max(2, DPR());
          pad.width = r.width * dpr; pad.height = r.height * dpr;
          const ctx = pad.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineCap = ctx.lineJoin = 'round';
          let pts = [];
          pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); pts = [[e.offsetX, e.offsetY, e.pressure || 0.5]]; e.preventDefault(); });
          pad.addEventListener('pointermove', e => {
            if (!pts.length) return;
            const p = [e.offsetX, e.offsetY, e.pressure || 0.5], q = pts[pts.length - 1];
            const v = Math.hypot(p[0] - q[0], p[1] - q[1]);
            ctx.strokeStyle = color; ctx.lineWidth = clamp(3.2 - v * 0.06, 1.4, 3.2) * (e.pointerType === 'pen' ? 0.6 + p[2] : 1);
            ctx.beginPath();
            if (pts.length > 1) { const o = pts[pts.length - 2]; ctx.moveTo((o[0] + q[0]) / 2, (o[1] + q[1]) / 2); ctx.quadraticCurveTo(q[0], q[1], (q[0] + p[0]) / 2, (q[1] + p[1]) / 2); }
            else { ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); }
            ctx.stroke(); pts.push(p); drawn = true;
          });
          const up = () => { if (pts.length === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 1.6, 0, 7); ctx.fill(); drawn = true; } pts = []; };
          pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
        });
      }
      const m = modal([
        h('h3', {}, 'La tua firma'),
        tabs, body,
        h('label', { class: 'check', style: { marginTop: '10px' } }, remember, h('span', {}, 'Ricorda questa firma su questo dispositivo')),
      ], { width: 600, onClose: () => { if (!done) { done = true; resolve(null); } } });
      drawTabs(); show();
    });
  }

  return { ready, FAM_OF, stdName, fontFor, layout, wrap, ASC, FULL, parseAA, parseNum, fmtNum, fmtDate, parseDate, today, semOf, check, normalize, cfOk, pivaOk, ibanOk,
    PROFILE, profile, saveProfile, profileKey, profileValue, sigs, signatureDialog, norm };
})();

/* =====================================================================
   Compila con memoria. Ogni modulo compilato si riconosce la volta dopo (anche una copia scaricata di nuovo
   o un'edizione appena ritoccata): si ritrovano i campi come li avevi sistemati e, se vuoi, i valori
   dell'ultima volta. In più i dati ricorrenti (matricola, qualifica, ente, targa…) si propongono in ogni
   modulo che ha la stessa voce. Tutto resta in questo browser; si può spegnere e cancellare.
   (In futuro, con il sito online: imparare anche dai moduli compilati da altri — vedi memoria del progetto.)
   ===================================================================== */
const FormMemory = (() => {
  const KF = 'officina.moduli', KV = 'officina.moduli.valori', KON = 'officina.moduli.attiva';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const enabled = () => load(KON, true) !== false;
  const setEnabled = v => store(KON, !!v);
  const hash = s => { let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); } return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)); };
  const words = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length > 1);
  /* impronta del modulo: pagine, formati e testo (o, per le scansioni, una miniatura) */
  async function fingerprint(doc) {
    const sizes = [], txt = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.pdfjs.getPage(p), v = page.getViewport({ scale: 1 });
      sizes.push([Math.round(v.width), Math.round(v.height)]);
      if (p <= 4) { const tc = await page.getTextContent(); txt.push(tc.items.map(i => i.str).join(' ')); }
    }
    const w = words(txt.join(' '));
    let img = null;
    if (w.length < 15) {
      // scansione: impronta della prima pagina (9×8 differenze di luminosità)
      const r = await renderPageCanvas(doc.pdfjs, 1, 12, { gray: true });
      const c = h('canvas', { width: 9, height: 8 }), cx = c.getContext('2d'); cx.drawImage(r.canvas, 0, 0, 9, 8); r.canvas.width = 0;
      const d = cx.getImageData(0, 0, 9, 8).data; let bits = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += d[(y * 9 + x) * 4] > d[(y * 9 + x + 1) * 4] ? '1' : '0';
      img = bits;
    }
    const tri = new Set(); for (let i = 0; i + 2 < w.length && tri.size < 400; i++) tri.add(hash(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]));
    return { id: hash(JSON.stringify(sizes) + '|' + (img || w.join(' '))), pages: doc.numPages, sizes, tri: [...tri], img };
  }
  const jacc = (a, b) => { if (!a.length || !b.length) return 0; const B = new Set(b); let n = 0; for (const x of a) if (B.has(x)) n++; return n / (a.length + b.length - n); };
  const ham = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  /* il modulo già compilato più somigliante: «same» = proprio lo stesso (stessa impaginazione) */
  function match(fp) {
    if (!enabled()) return null;
    let best = null, bs = 0;
    for (const e of load(KF, [])) {
      let s = 0;
      if (e.id === fp.id) s = 1;
      else if (fp.img && e.img && e.pages === fp.pages) s = ham(fp.img, e.img) <= 6 ? 0.95 : 0;
      else if (!fp.img && !e.img) s = jacc(fp.tri, e.tri);
      if (s > bs) { bs = s; best = e; }
    }
    if (!best || bs < 0.8) return null;
    const sameLayout = best.id === fp.id || (bs >= 0.95 && JSON.stringify(best.sizes) === JSON.stringify(fp.sizes));
    return { entry: best, score: bs, sameLayout };
  }
  // posizione di un campo indipendente dallo zoom (millesimi della pagina)
  const posKey = (f, sizes) => { const [W, H] = sizes[f.page] || [600, 800]; return `${f.page}:${Math.round(f.x / W * 500)}:${Math.round(f.y / H * 500)}`; };
  const keyOf = (f, sizes) => f.ex ? 'e:' + f.ex.name : 'p:' + posKey(f, sizes);
  const labelKey = l => words(String(l || '')).join(' ');
  /* dopo il salvataggio: il modulo (campi e valori) e i dati ricorrenti per voce */
  function remember(fp, { name, fields, removed, labelOf, isText, profileKeyOf }) {
    if (!enabled()) return;
    const values = {}, layout = [];
    for (const f of fields) {
      if (f.ex && removed.includes(f.ex.name)) continue;
      if (!f.ex) layout.push({ page: f.page, x: +f.x.toFixed(1), y: +f.y.toFixed(1), w: +f.w.toFixed(1), h: +f.h.toFixed(1), type: f.type, kind: f.kind, name: f.name, maxLen: f.maxLen || 0, req: !!f.req, align: f.align || 0 });
      const v = f.value;
      if (f.ro || f.calc || v === '' || v == null || v === false) continue;
      values[keyOf(f, fp.sizes)] = typeof v === 'string' ? v.slice(0, 600) : v;
    }
    const list = load(KF, []).filter(e => e.id !== fp.id);
    const prev = load(KF, []).find(e => e.id === fp.id);
    list.unshift({ id: fp.id, pages: fp.pages, sizes: fp.sizes, tri: fp.tri, img: fp.img, name: String(name || '').slice(0, 120), at: Date.now(), uses: (prev?.uses || 0) + 1, layout, removed: removed.slice(0, 200), values });
    // il limite del browser: si tengono gli ultimi 30 moduli
    while (list.length > 30 || (JSON.stringify(list).length > 1.8e6 && list.length > 1)) list.pop();
    store(KF, list);
    // dati ricorrenti: voci non già coperte da «I miei dati», valori brevi
    const rec = load(KV, {});
    for (const f of fields) {
      if (!isText(f) || f.ro || f.calc) continue;
      const v = String(f.value ?? '').trim(), lab = labelKey(labelOf(f));
      if (!v || v.length > 120 || !lab || lab.length < 3 || /^(campo|casella|testo|field|text)( \d+)?$/.test(lab) || profileKeyOf(f) || /\b(data|firma|luogo)\b/.test(lab)) continue;
      const e = rec[lab] || { v, n: 0 };
      rec[lab] = { v, n: e.v === v ? e.n + 1 : 1, at: Date.now(), l: String(labelOf(f)).slice(0, 80) };
    }
    const keys = Object.keys(rec).sort((a, b) => rec[b].at - rec[a].at);
    for (const k of keys.slice(300)) delete rec[k];
    store(KV, rec);
  }
  // i valori dell'ultima volta per i campi di questo modulo
  function valuesFor(m, fields, sizes) {
    const out = [];
    for (const f of fields) {
      const v = m.entry.values[keyOf(f, sizes)];
      if (v !== undefined) out.push([f, v]);
    }
    return out;
  }
  // i dati ricorrenti che corrispondono alle voci di questo modulo
  function recurringFor(fields, labelOf, isText) {
    if (!enabled()) return [];
    const rec = load(KV, {}), out = [];
    for (const f of fields) { if (!isText(f) || f.ro || f.calc) continue; const r = rec[labelKey(labelOf(f))]; if (r) out.push([f, r.v, r.l]); }
    return out;
  }
  const list = () => load(KF, []);
  function forget(id) { store(KF, load(KF, []).filter(e => e.id !== id)); }
  function forgetAll() { try { localStorage.removeItem(KF); localStorage.removeItem(KV); } catch { } }
  const recurring = () => load(KV, {});
  function forgetRecurring(k) { const r = load(KV, {}); delete r[k]; store(KV, r); }
  return { fingerprint, match, remember, valuesFor, recurringFor, list, forget, forgetAll, recurring, forgetRecurring, enabled, setEnabled, keyOf };
})();

/* finestra «Memoria dei moduli»: cosa è ricordato, con la possibilità di cancellare */
function formMemoryDialog(onChange) {
  const body = h('div', { class: 'fm-body' });
  const draw = () => {
    const L = FormMemory.list(), R = Object.entries(FormMemory.recurring());
    body.replaceChildren(
      checkbox('Ricorda i moduli che compilo', FormMemory.enabled(), v => { FormMemory.setEnabled(v); onChange?.(); }, 'Restano solo in questo browser, su questo dispositivo.'),
      h('h4', {}, `Moduli ricordati (${L.length})`),
      L.length ? h('div', { class: 'fm-list' }, L.map(e => h('div', { class: 'fm-row' }, h('div', { class: 'grow' }, h('b', {}, e.name || 'Modulo'), h('div', { class: 'muted small' }, `${new Date(e.at).toLocaleDateString('it-IT')} · ${plural(Object.keys(e.values).length, 'valore', 'valori')} · ${plural(e.uses || 1, 'volta', 'volte')}`)),
        iconBtn('trash', 'Dimentica questo modulo', () => { FormMemory.forget(e.id); draw(); onChange?.(); })))) : h('div', { class: 'muted small' }, 'Nessun modulo ricordato.'),
      h('h4', {}, `Dati ricorrenti (${R.length})`),
      R.length ? h('div', { class: 'fm-list' }, R.sort((a, b) => b[1].at - a[1].at).slice(0, 60).map(([k, r]) => h('div', { class: 'fm-row' }, h('div', { class: 'grow' }, h('span', { class: 'muted small' }, r.l || k), h('div', {}, r.v)),
        iconBtn('trash', 'Dimentica', () => { FormMemory.forgetRecurring(k); draw(); onChange?.(); })))) : h('div', { class: 'muted small' }, 'Le voci che scrivi spesso (matricola, qualifica, ente…) compariranno qui.'),
      L.length || R.length ? h('button', { class: 'btn sm ghost', style: { marginTop: '10px' }, onclick: () => { FormMemory.forgetAll(); draw(); onChange?.(); } }, ic('trash', 16), 'Dimentica tutto') : null);
  };
  draw();
  modal([h('h3', {}, 'Memoria dei moduli'), body], { width: 560 });
}

/* =====================================================================
   Moduli compilabili: rilevamento automatico dei campi (AcroForm),
   revisione, compilazione e salvataggio.
   Coordinate dei campi: "display" = pagina come mostrata, in punti, origine in alto a sinistra.
   ===================================================================== */
const FormDetect = (() => {
  // caselle scritte come carattere: Unicode e le caselle di Wingdings di Word (codici privati)
  const BOX_CH = /[☐□▢❏❑❒◻☑☒⬜\uF06F\uF071\uF072\uF0A8\uF0FD\uF0FE]/, BOX_PUA = /[\uF06F\uF071\uF072\uF0A8\uF0FD\uF0FE]/;
  const DEFAULTS = { boxes: true, lines: true, checks: true, combs: true, dots: true, colon: true, tint: true };

  function integral(src, W, H) {
    const I = new Uint32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0; const o = y * W, a = (y + 1) * (W + 1), b = y * (W + 1);
      for (let x = 0; x < W; x++) { row += src[o + x]; I[a + x + 1] = I[b + x + 1] + row; }
    }
    return I;
  }
  function sumOf(I, W, H, x0, y0, x1, y1) { // [x0,x1) x [y0,y1)
    x0 = clamp(Math.round(x0), 0, W); x1 = clamp(Math.round(x1), 0, W); y0 = clamp(Math.round(y0), 0, H); y1 = clamp(Math.round(y1), 0, H);
    if (x1 <= x0 || y1 <= y0) return 0;
    const S = W + 1;
    return I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
  }

  const segments = (...x) => ImgKit.segments(...x); // in imgkit.js

  /* connected components of a mask (4 or 8 connectivity) */
  function components(mask, W, H, eight, keep) {
    const lab = new Int32Array(W * H); const comps = []; const stack = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || lab[i]) continue;
      const c = { x0: W, y0: H, x1: 0, y1: 0, area: 0, border: false, id: comps.length + 1 };
      let sp = 0; stack[sp++] = i; lab[i] = c.id;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p - x) / W;
        c.area++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.border = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; if (!eight && dx && dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (mask[q] && !lab[q]) { lab[q] = c.id; stack[sp++] = q; }
        }
      }
      if (!keep || keep(c)) comps.push(c);
    }
    return comps;
  }

  /* text items of the page with their display boxes (for labels) */
  async function textItems(pg, vp) {
    const tc = await pg.getTextContent();
    const out = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      it._fam = guessFont('', tc.styles[it.fontName]?.fontFamily || '');
      const b = itemCharBox(it, 0, it.str.length, vp);
      out.push({ it, str: it.str, b: { x: b.x + 1.5, y: b.y + 1.5, w: b.w - 3, h: b.h - 3 } });
    }
    return out;
  }

  function cleanLabel(s, tail) {
    s = String(s || '').replace(/\s+/g, ' ');
    const parts = s.split(/[_.…·]{3,}|\s{3,}/).map(x => x.trim()).filter(x => /[\p{L}\p{N}]/u.test(x));
    s = (tail ? parts[parts.length - 1] : parts[0]) || '';
    s = s.replace(/^[\s:;,*•\-–—()[\]|/☐□▢❏❑❒◻☑☒⬜\uF06F\uF071\uF072\uF0A8\uF0FD\uF0FE]+/, '').replace(/[\s:;,*•\-–—(|[]+$/, '').replace(/\(\s*\*?\s*\)$/, '').trim();
    s = s.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    if (!s.includes('(')) s = s.replace(/\)+$/, '').trim();
    if (s.length > 42) {
      if (tail) { s = s.slice(-42); s = s.slice(s.indexOf(' ') + 1 || 0); }
      else { s = s.slice(0, 42); s = s.slice(0, s.lastIndexOf(' ') > 15 ? s.lastIndexOf(' ') : 42); }
    }
    return s;
  }
  function textLeftOf(t, x) {
    if (t.b.x + t.b.w <= x + 1) return t.str;
    const rel = (x - t.b.x) / (t.b.w || 1);
    if (!t.it) return t.str.slice(0, Math.max(0, Math.floor(rel * t.str.length)));   // parola letta con l'OCR
    const offs = charOffsets(t.it, t.it._fam);
    let k = 0; while (k < t.str.length && offs[k + 1] <= rel + 0.01) k++;
    return t.str.slice(0, k);
  }
  function textRightOf(t, x) {
    if (t.b.x >= x - 1) return t.str;
    const rel = (x - t.b.x) / (t.b.w || 1);
    if (!t.it) return t.str.slice(Math.min(t.str.length, Math.ceil(rel * t.str.length)));
    const offs = charOffsets(t.it, t.it._fam);
    let k = 0; while (k < t.str.length && offs[k] < rel - 0.01) k++;
    return t.str.slice(k);
  }
  function labelFor(f, items) {
    const vOver = t => Math.min(t.b.y + t.b.h, f.y + f.h + 1) - Math.max(t.b.y, f.y - (f.kind === 'under' ? 3 : 1)) > Math.min(t.b.h, f.h) * 0.35;
    // testo della stessa riga a sinistra del campo, ricomposto da tutti i pezzi (le parole giustificate arrivano separate)
    // la riga del campo: la fascia in basso (un campo «sopra la linea» è alto e toccherebbe la riga di sopra)
    const bandTop = f.y + f.h - Math.min(f.h, 12), bandBot = f.y + f.h + 2;
    const onLine = t => f.kind === 'under' || f.kind === 'comb' ? Math.min(t.b.y + t.b.h, bandBot) - Math.max(t.b.y, bandTop) > Math.min(t.b.h, bandBot - bandTop) * 0.5 : vOver(t);
    const lineLeft = () => {
      const row = items.filter(t => onLine(t) && t.b.x < f.x - 1).sort((a, b) => a.b.x - b.b.x);
      // nelle tabelle «etichetta | valore» l'etichetta può stare lontana, nella sua cella a sinistra
      if (!row.length || f.x - Math.min(row[row.length - 1].b.x + row[row.length - 1].b.w, f.x) > (f.kind === 'cell' ? 330 : 170)) return '';
      // solo il testo attaccato al campo: ci si ferma al primo spazio grande (un altro campo, un'altra colonna)
      const keep = [row[row.length - 1]];
      for (let i = row.length - 2; i >= 0; i--) {
        const t = row[i], nx = keep[0], gap = nx.b.x - (t.b.x + t.b.w);
        if (gap > Math.max(12, nx.b.h * 1.6)) break;
        keep.unshift(t);
      }
      return keep.map(t => textLeftOf(t, f.x)).join(' ');
    };
    const lineRight = () => items.filter(t => onLine(t) && t.b.x + t.b.w > f.x + f.w + 1).sort((a, b) => a.b.x - b.b.x).map(t => textRightOf(t, f.x + f.w)).join(' ').trim();
    const left = () => {
      const raw = lineLeft(); if (!raw) return '';
      f.star = /\*\s*[:.)]?\s*[_.…]*\s*$/.test(raw);
      const s = cleanLabel(raw, true);
      // quello che c'è dopo l'ultima parola (solo righe da compilare, parentesi, barre)
      const m = raw.match(/[\p{L}\p{N}][^\p{L}\p{N}]*$/u), tail = m ? m[0].slice(1) : raw;
      const right = lineRight();
      if (/\(\s*$/.test(tail) && /^\s*\)/.test(right) && f.w < 60) return 'Provincia';                // «(____)» dopo il comune
      if (f.w < 60 && s && /^[\s_.…/]*$/.test(tail)) {                                             // «il ___/___/____»: giorno, mese, anno
        const k = (tail.match(/\//g) || []).length;
        if (k || /^\s*\//.test(right)) return `${s} (${['giorno', 'mese', 'anno'][Math.min(2, k)]})`;
      }
      return s;
    };
    const right = () => {
      let best = '', bd = 1e9;
      for (const t of items) {
        if (!vOver(t) || t.b.x + t.b.w <= f.x + f.w + 1) continue;
        const s = cleanLabel(textRightOf(t, f.x + f.w), false); if (!s) continue;
        const d = Math.max(t.b.x, f.x + f.w) - (f.x + f.w);
        if (d < 60 && d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const above = (far) => {
      let best = '', bd = 1e9;
      for (const t of items) {
        const hx = Math.min(t.b.x + t.b.w, f.x + f.w) - Math.max(t.b.x, f.x);
        if (hx < Math.min(10, t.b.w * 0.5)) continue;
        if (far && (t.b.x + t.b.w / 2 < f.x - 6 || t.b.x + t.b.w / 2 > f.x + f.w + 6)) continue;
        const d = f.y - (t.b.y + t.b.h);
        if (d < -2 || d > (far ? (f.kind === 'cell' ? 60 : 140) : 24)) continue;
        const s = cleanLabel(t.str, false); if (s && d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const below = () => {
      let best = '', bd = 1e9;
      for (const t of items) {
        const hx = Math.min(t.b.x + t.b.w, f.x + f.w) - Math.max(t.b.x, f.x);
        if (hx < Math.min(10, t.b.w * 0.5)) continue;
        const d = t.b.y - (f.y + f.h);
        if (d < -1 || d > 14) continue;
        const s = cleanLabel(t.str, false); if (s && d < bd) { bd = d; best = s; }
      }
      return best;
    };
    // riga che comincia con lo spazio da compilare: l'etichetta è la fine della riga di sopra («… nato/a a» ↵ «______»)
    const prevTail = () => {
      const near = items.filter(t => { const d = f.y + f.h - (t.b.y + t.b.h); return d > 4 && d < 34 && t.b.x + t.b.w > f.x + 40; });
      if (!near.length) return '';
      // la riga subito sopra (la più vicina): il testo dopo l'ultimo spazio da compilare, ricomposto («nato/a» + «a»)
      const yl = Math.max(...near.map(t => t.b.y + t.b.h));
      const line = items.filter(t => Math.abs(yl - (t.b.y + t.b.h)) < 4).sort((a, b) => a.b.x - b.b.x);
      return cleanLabel(line.map(t => t.str).join(' '), true);
    };
    if (f.inLabel) return f.inLabel;
    if (f.type === 'check') return right() || left() || above();
    // quadretti senza etichetta leggibile: dal numero di caselle (16 = codice fiscale, 11 = partita IVA, 5 = CAP, 27 = IBAN)
    if (f.type === 'comb') return left() || { 16: 'Codice fiscale', 11: 'Partita IVA', 5: 'CAP', 27: 'IBAN' }[f.maxLen] || prevTail() || above();
    if (f.kind === 'cell') return left() || (f.w < 70 ? right() : '') || above() || above(true);
    return left() || (f.kind === 'under' ? prevTail() || above() || below() : above());
  }

  /* pagina composta da una sola immagine grande (scansione)? */
  async function pageIsImage(pg) {
    try {
      const ops = await pg.getOperatorList(), O = pdfjsLib.OPS;
      let img = 0, text = 0, path = 0, invisible = false;
      ops.fnArray.forEach((fn, i) => {
        if (fn === O.paintImageXObject || fn === O.paintJpegXObject || fn === O.paintInlineImageXObject) img++;
        else if (fn === O.showText || fn === O.showSpacedText) text++;
        else if (fn === O.constructPath) path++;
        else if (fn === O.setTextRenderingMode && (ops.argsArray[i]?.[0] & 3) === 3) invisible = true; // testo invisibile = strato OCR
      });
      return img > 0 && img <= 3 && path < 20 && (text < 400 || invisible);
    } catch { return false; }
  }
  async function detectPage(pdfjs, pageNo, opt = DEFAULTS) {
    const pg = await pdfjs.getPage(pageNo);
    const vp = pg.getViewport({ scale: 1 });
    const items = await textItems(pg, vp);
    let s = 2; const maxPx = 9e6;
    if (vp.width * vp.height * s * s > maxPx) s = Math.sqrt(maxPx / (vp.width * vp.height));
    const v = pg.getViewport({ scale: s });
    const W = Math.round(v.width), H = Math.round(v.height);
    const c = h('canvas', { width: W, height: H });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    await pg.render({ canvasContext: ctx, viewport: v, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    const px = ctx.getImageData(0, 0, W, H).data;
    c.width = c.height = 0;
    const N = W * H;
    let gray = new Uint8Array(N);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < N; i++, j += 4) { const g = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8; gray[i] = g; hist[g]++; }
    // scansione? (carta non bianca, rumore): uniforma lo sfondo e raddrizza
    let acc = 0, p50 = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= N * 0.5) { p50 = v; break; } }
    let M = null;
    const scan = p50 < 252 || (await pageIsImage(pg));
    if (scan) {
      let img = { w: W, h: H, g: gray };
      img = OCRPrep.stretch(OCRPrep.flattenBackground(img));
      if (OCRPrep.noiseLevel(img) > 5) img = OCRPrep.stretch(OCRPrep.median3(img));
      const ang = OCRPrep.estimateSkew(img);
      if (Math.abs(ang) >= 0.12) { const r = OCRPrep.rotateCanvas(OCRPrep.toCanvas(img), -ang); M = r.M; img = OCRPrep.toGray(r.canvas); }
      gray = img.g;
    }
    const ink = new Uint8Array(N);
    let tintN = 0;
    for (let i = 0; i < N; i++) { const g = gray[i]; if (g < 195) ink[i] = 1; else if (g < 246) tintN++; }
    const P = v => v * s; // pt -> px
    /* 1. linee e bordi */
    const hseg = segments(ink, W, H, Math.round(P(4.5)), Math.max(3, Math.round(P(3))), false);
    const vseg = segments(ink, W, H, Math.round(P(4.5)), Math.max(3, Math.round(P(3))), true);
    const rule = new Uint8Array(N);
    for (const g of [...hseg, ...vseg]) for (let y = g.y0; y < g.y1; y++) rule.fill(1, y * W + g.x0, y * W + g.x1);
    const ruleD = new Uint8Array(N); // dilated 3x3
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!rule[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const o = yy * W; ruleD[o + x] = 1; if (x) ruleD[o + x - 1] = 1; if (x < W - 1) ruleD[o + x + 1] = 1; }
    }
    const txt = new Uint8Array(N); for (let i = 0; i < N; i++) txt[i] = ink[i] && !rule[i] ? 1 : 0;
    const IT = integral(txt, W, H);   // ink without lines (text, marks)
    const IA = integral(ink, W, H);   // all ink
    const inkT = (x0, y0, x1, y1) => sumOf(IT, W, H, x0, y0, x1, y1);
    const inkA = (x0, y0, x1, y1) => sumOf(IA, W, H, x0, y0, x1, y1);
    const pageArea = vp.width * vp.height;
    const cands = [];
    const add = (f, prio) => { f.prio = prio; if (opt.debug) f._at = (new Error().stack.split('\n')[2] || '').replace(/.*:(\d+):\d+\)?$/, '$1'); cands.push(f); };
    const toPt = (x0, y0, x1, y1) => ({ x: x0 / s, y: y0 / s, w: (x1 - x0) / s, h: (y1 - y0) / s });

    // inchiostro dentro una cella, lontano dai bordi: conta anche i tratti dritti delle maiuscole in grassetto (che «segments» prende per linee)
    const inkIn = (x0, y0, x1, y1) => { const m = Math.max(2, Math.round(P(1.6))); return x1 - x0 > 2 * m && y1 - y0 > 2 * m ? Math.max(inkT(x0, y0, x1, y1), scan ? inkA(x0 + m, y0 + m, x1 - m, y1 - m) : 0) : inkT(x0, y0, x1, y1); };
    /* free area inside a region that contains some ink (label in the cell) */
    let cellList = [];
    function cellField(x0, y0, x1, y1, kind) {
      const ix0 = x0 + 2, iy0 = y0 + 2, ix1 = x1 - 2, iy1 = y1 - 2;
      if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return null;
      const area = (ix1 - ix0) * (iy1 - iy0);
      const n = inkIn(ix0, iy0, ix1, iy1);
      const pad = P(1.2);
      if (n <= 4 + area * (scan ? 0.006 : 0.003)) return { ...toPt(x0 + pad, y0 + pad, x1 - pad, y1 - pad), kind };
      // ink bounding box (righe e colonne con un po' d'inchiostro: i puntini isolati delle scansioni non contano)
      const thrR = scan ? Math.max(2, Math.round((ix1 - ix0) * 0.006)) : 0, thrC = scan ? Math.max(2, Math.round((iy1 - iy0) * 0.04)) : 0;
      let t = iy0, b = iy1 - 1, l = ix0, r = ix1 - 1;
      while (t < iy1 && inkT(ix0, t, ix1, t + 1) <= thrR) t++;
      while (b > t && inkT(ix0, b, ix1, b + 1) <= thrR) b--;
      while (l < ix1 && inkT(l, t, l + 1, b + 1) <= thrC) l++;
      while (r > l && inkT(r, t, r + 1, b + 1) <= thrC) r--;
      if (t >= b || l >= r) return { ...toPt(x0 + pad, y0 + pad, x1 - pad, y1 - pad), kind };
      // testo stampato su più righe e largo (un oggetto, un'avvertenza, un titolo in un riquadro): è contenuto, non un'etichetta
      if (b - t > P(16) && r - l > (ix1 - ix0) * 0.4) return null;
      const opts = [];
      const rx0 = r + P(4);
      const header = cellList.some(o => Math.abs(o.x0 - x0) <= P(2) && Math.abs(o.x1 - x1) <= P(2) && Math.abs(o.y0 - y1) <= P(2.5));
      const hasRight = cellList.some(o => Math.abs(o.x0 - x1) <= P(3) && Math.min(o.y1, y1) - Math.max(o.y0, y0) > (y1 - y0) * 0.6);
      if (!header && !hasRight && x1 - pad - rx0 >= P(40) && (r - l) <= (ix1 - ix0) * 0.5) opts.push({ ...toPt(rx0, y0 + pad, x1 - pad, y1 - pad), kind, inCell: [l, t, r, b] });
      const by0 = b + P(1.5);
      if (y1 - pad - by0 >= P(9) && ix1 - ix0 >= P(25)) opts.push({ ...toPt(x0 + pad, by0, x1 - pad, y1 - pad), kind, inCell: [l, t, r, b] });
      if (!opts.length) return null;
      // preferisci lo spazio sotto l'etichetta, a meno che quello a destra sia molto più grande
      opts.sort((a, b) => b.w * b.h - a.w * a.h);
      const below = opts.find(o => o.x <= (x0 + pad) / s + 0.01);
      return below && below.w * below.h * 1.6 >= opts[0].w * opts[0].h ? below : opts[0];
    }

    /* 2. riquadri chiusi: celle, caselle, quadretti */
    const bg = new Uint8Array(N); for (let i = 0; i < N; i++) bg[i] = ruleD[i] ? 0 : 1;
    const minC = P(4.2);
    const cells = components(bg, W, H, false, c => !c.border && c.x1 - c.x0 + 1 >= minC && c.y1 - c.y0 + 1 >= minC && c.area >= 0.8 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1))
      .map(c => ({ x0: c.x0 - 1, y0: c.y0 - 1, x1: c.x1 + 2, y1: c.y1 + 2, fill: c.area / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) }))
      .filter(c => (c.x1 - c.x0) * (c.y1 - c.y0) / (s * s) < pageArea * 0.4);
    const cover = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const framed = c => {
      const iw = c.x1 - c.x0 - 4, ih = c.y1 - c.y0 - 4, t = 4;
      const hs = y => hseg.some(g => g.y1 >= y - t && g.y0 <= y + t && cover(g.x0, g.x1, c.x0 + 2, c.x1 - 2) >= 0.85 * iw);
      const vs = x => vseg.some(g => g.x1 >= x - t && g.x0 <= x + t && cover(g.y0, g.y1, c.y0 + 2, c.y1 - 2) >= 0.85 * ih);
      return hs(c.y0) && hs(c.y1) && vs(c.x0) && vs(c.x1);
    };
    cellList = cells;
    const thinFrame = c => {
      const side = (x, y, dx, dy) => { let n = 0; while (n < P(4) && ink[(y + dy * n) * W + (x + dx * n)]) n++; return n; };
      const mx = (c.x0 + c.x1) >> 1, my = (c.y0 + c.y1) >> 1;
      const th = [side(mx, c.y0 + 1, 0, -1), side(mx, c.y1 - 2, 0, 1), side(c.x0 + 1, my, -1, 0), side(c.x1 - 2, my, 1, 0)].sort((a, b) => a - b);
      return th[2] <= Math.max(P(1.5), 3);
    };
    // «buchi» delle lettere (O, D, A, P…): stanno dentro una parola del testo, che non è un carattere di casella
    const inLetters = c => { const cx = (c.x0 + c.x1) / 2 / s, cy = (c.y0 + c.y1) / 2 / s; return items.some(t => cx > t.b.x && cx < t.b.x + t.b.w && cy > t.b.y && cy < t.b.y + t.b.h && !BOX_CH.test(t.str)); };
    const small = [], rest = [];
    if (opt.debug) opt.debug.cells = cells.filter(c => (c.x1 - c.x0) / s < 30 && (c.y1 - c.y0) / s < 30).map(c => ({ x: +(c.x0 / s).toFixed(1), y: +(c.y0 / s).toFixed(1), w: +((c.x1 - c.x0) / s).toFixed(1), h: +((c.y1 - c.y0) / s).toFixed(1), fill: +c.fill.toFixed(2), framed: framed(c), thin: thinFrame(c) }));
    for (const c of cells) {
      const w = (c.x1 - c.x0) / s, hh = (c.y1 - c.y0) / s;
      if (hh >= 4.6 && hh <= 30 && w >= 4.2 && w <= 24 && w / hh <= 1.6) { if (c.fill >= 0.93 && framed(c) && thinFrame(c) && !inLetters(c)) small.push(c); else if (hh >= 6.5) rest.push(c); } else rest.push(c);
    }
    // quadretti: celle piccole contigue della stessa altezza
    small.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const used = new Set();
    if (opt.combs) {
      const rows = [];
      for (const c of small) {
        let row = rows.find(r => Math.abs(r[0].y0 - c.y0) <= P(1.5) && Math.abs(r[0].y1 - c.y1) <= P(1.5));
        if (!row) rows.push(row = []); row.push(c);
      }
      for (const row of rows) {
        row.sort((a, b) => a.x0 - b.x0);
        let run = [row[0]];
        const flush = () => {
          if (run.length >= 2) {
            const ws = run.map(c => c.x1 - c.x0), mw = ws.reduce((a, b) => a + b) / ws.length;
            if (ws.every(w => Math.abs(w - mw) <= Math.max(P(2), mw * 0.25))) {
              run.forEach(c => used.add(c));
              const x0 = run[0].x0, x1 = run[run.length - 1].x1, y0 = Math.min(...run.map(c => c.y0)), y1 = Math.max(...run.map(c => c.y1));
              add({ ...toPt(x0 + P(.6), y0 + P(.6), x1 - P(.6), y1 - P(.6)), type: 'comb', maxLen: run.length, kind: 'comb' }, 1);
            }
          }
        };
        for (let i = 1; i < row.length; i++) {
          if (row[i].x0 - run[run.length - 1].x1 <= P(2.5)) run.push(row[i]); else { flush(); run = [row[i]]; }
        }
        flush();
      }
    }
    for (const c of small) {
      if (used.has(c)) continue;
      const w = (c.x1 - c.x0) / s, hh = (c.y1 - c.y0) / s;
      const interior = inkT(c.x0 + 2, c.y0 + 2, c.x1 - 2, c.y1 - 2);
      // scansione: il «buco» di una lettera (O, D, P) è circondato da altre lettere a destra e a sinistra
      const wordy = scan && (() => { const gp = Math.round(P(1)), wd = Math.round(P(3)), y0 = c.y0 + 2, y1 = c.y1 - 2; return inkT(c.x0 - gp - wd, y0, c.x0 - gp, y1) > 2 && inkT(c.x1 + gp, y0, c.x1 + gp + wd, y1) > 2; })();
      if (opt.checks && !wordy && w >= (scan ? 5.5 : 4.5) && hh >= (scan ? 5.5 : 4.5) && w <= 20 && hh <= 20 && w / hh >= 0.7 && w / hh <= 1.4 && interior <= 3 + (c.x1 - c.x0) * (c.y1 - c.y0) * (scan ? 0.05 : 0.02))
        add({ ...toPt(c.x0 + P(.7), c.y0 + P(.7), c.x1 - P(.7), c.y1 - P(.7)), type: 'check', kind: 'check' }, 0);
      else if (hh >= 6.5) rest.push(c);
    }
    // caselle scritte come carattere nel testo (☐ □ ▢ ❏ ❑ ◻ ☑ ☒)
    if (opt.checks) for (const t of items) {
      for (let k = 0; k < t.str.length; k++) {
        if (!BOX_CH.test(t.str[k])) continue;
        const b = itemCharBox(t.it, k, k + 1, vp), fh = b.h - 3;
        // il quadratino occupa la parte centrale della riga: si usa un quadrato centrato sul carattere
        const side = clamp(Math.min(b.w - 3, fh * 0.75), 5, 16), cx = b.x + b.w / 2, cy = b.y + b.h * 0.55;
        if (BOX_PUA.test(t.str[k])) {   // carattere di un font di simboli: deve esserci davvero il bordo di un quadratino
          const x0 = Math.round(P(cx - side / 2)), y0 = Math.round(P(cy - side / 2)), x1 = Math.round(P(cx + side / 2)), y1 = Math.round(P(cy + side / 2)), m = Math.round(P(side * 0.22));
          const ring = inkA(x0, y0, x1, y1) - inkA(x0 + m, y0 + m, x1 - m, y1 - m);
          if (ring < (x1 - x0) * 1.6) continue;
        }
        add({ x: cx - side / 2, y: cy - side / 2, w: side, h: side, type: 'check', kind: 'check', native: true }, 0);
      }
    }
    /* scansioni: quadratini stampati (☐) riconosciuti dalla forma: anello quadrato con quattro angoli e interno vuoto */
    if (opt.checks && scan) {
      const lo = P(5.5), hi = P(16);
      // le caselle stampate spesso sono grigie: per loro si usa una soglia più chiara di quella del testo
      const seenB = [];
      for (const thr of [195, 222, 238]) {
      const inkL = new Uint8Array(N); for (let i = 0; i < N; i++) inkL[i] = gray[i] < thr ? 1 : 0;
      const IL = integral(inkL, W, H), inkLA = (x0, y0, x1, y1) => sumOf(IL, W, H, x0, y0, x1, y1);
      const rings = components(inkL, W, H, true, c => { const w = c.x1 - c.x0 + 1, hh = c.y1 - c.y0 + 1; return !c.border && w >= lo && hh >= lo && w <= hi && hh <= hi && w / hh >= 0.75 && w / hh <= 1.33 && c.area <= 0.65 * w * hh && c.area >= 0.15 * w * hh; });
      for (const c of rings) {
        const w = c.x1 - c.x0 + 1, hh = c.y1 - c.y0 + 1, m = Math.max(2, Math.round(w * 0.25));
        if (inkLA(c.x0 + m, c.y0 + m, c.x1 + 1 - m, c.y1 + 1 - m) > (w - 2 * m) * (hh - 2 * m) * 0.08) continue;
        const k = Math.max(2, Math.round(w * 0.18)), t = Math.max(2, Math.round(P(1.2)));
        const corner = (x0, y0) => inkLA(x0, y0, x0 + k, y0 + k) >= k * 0.8;
        if (!(corner(c.x0, c.y0) && corner(c.x1 + 1 - k, c.y0) && corner(c.x0, c.y1 + 1 - k) && corner(c.x1 + 1 - k, c.y1 + 1 - k))) continue;
        const side = (x0, y0, x1, y1, len) => inkLA(x0, y0, x1, y1) >= len * 0.75;
        if (!(side(c.x0, c.y0, c.x1 + 1, c.y0 + t, w) && side(c.x0, c.y1 + 1 - t, c.x1 + 1, c.y1 + 1, w) && side(c.x0, c.y0, c.x0 + t, c.y1 + 1, hh) && side(c.x1 + 1 - t, c.y0, c.x1 + 1, c.y1 + 1, hh))) continue;
        // dentro una parola (lettere attaccate a sinistra e a destra) non è una casella: è una «o», una «D»…
        const gp = Math.round(P(0.6)), wd = Math.round(P(2.6)), my0 = c.y0 + Math.round(hh * 0.2), my1 = c.y1 + 1 - Math.round(hh * 0.2);
        if (inkA(c.x0 - gp - wd, my0, c.x0 - gp, my1) > 2 && inkA(c.x1 + 1 + gp, my0, c.x1 + 1 + gp + wd, my1) > 2) continue;
        if (seenB.some(o => Math.abs(o[0] - c.x0) < P(3) && Math.abs(o[1] - c.y0) < P(3))) continue;
        seenB.push([c.x0, c.y0]);
        add({ ...toPt(c.x0, c.y0, c.x1 + 1, c.y1 + 1), type: 'check', kind: 'check' }, 0);
      }
    }
    }
    /* righe da compilare scritte nel testo (PDF nativi): ____  ……  ......  — posizione esatta, anche se brevi («(___)», «__/__/____») */
    if (opt.lines || opt.dots) for (const t of items) {
      const re = /(?:_[ \u00A0]?){3,}|(?:[.…·][ \u00A0]?){4,}|-{8,}/g; let m;
      while ((m = re.exec(t.str))) {
        const run = m[0].replace(/[ \u00A0]+$/, ''), k0 = m.index, k1 = k0 + run.length;
        const isDots = !/[_-]/.test(run);
        if (isDots && run.replace(/[^.…·]/g, '').length + 2 * (run.match(/…/g) || []).length < 5) continue;
        if (isDots && !opt.dots) continue;
        const b = itemCharBox(t.it, k0, k1, vp);
        const fh = (b.h - 3) / 1.23, base = b.y + b.h - 1.5 - 0.28 * fh;
        if (b.w < 7 || fh < 4 || fh > 40) continue;
        // spazio libero sopra la riga: fino al testo della riga di sopra (al massimo 16 pt)
        const x0 = Math.round(P(b.x + 1.5)), x1 = Math.round(P(b.x + b.w - 1.5)), yb = Math.round(P(base - fh * 0.62));
        let top = yb; const lim = Math.round(P(base - Math.max(16, fh * 1.25))), tol = Math.max(1, (x1 - x0) * 0.004);
        while (top > lim && top > 0 && inkT(x0, top - 1, x1, top) <= tol) top--;
        const y0 = Math.min(top / s, base - fh * 0.95);
        add({ x: b.x + 1.5, y: y0, w: b.w - 3, h: base + fh * 0.12 - y0, type: 'text', kind: 'under', native: true }, 1);
      }
    }
    // quadretti più larghi (tabelle di Word per il codice fiscale): almeno 6 celle vuote uguali, attaccate, sulla stessa riga
    if (opt.combs) {
      const isBlank = c => inkT(c.x0 + 3, c.y0 + 3, c.x1 - 3, c.y1 - 3) <= 4 + (c.x1 - c.x0) * (c.y1 - c.y0) * (scan ? 0.004 : 0.0004);
      const cand = rest.filter(c => (c.x1 - c.x0) / s <= 34 && (c.y1 - c.y0) / s >= 8 && (c.y1 - c.y0) / s <= 34 && isBlank(c)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const taken = new Set();
      for (const c of cand) {
        if (taken.has(c)) continue;
        const run = [c];
        for (;;) {
          const l = run[run.length - 1];
          const n = cand.find(o => !taken.has(o) && !run.includes(o) && Math.abs(o.x0 - l.x1) <= P(3) && Math.abs(o.y0 - l.y0) <= P(1.5) && Math.abs(o.y1 - l.y1) <= P(1.5));
          if (!n) break; run.push(n);
        }
        const ws = run.map(o => o.x1 - o.x0), mw = ws.reduce((a, b) => a + b, 0) / ws.length;
        if (run.length < 6 || !ws.every(w => Math.abs(w - mw) <= mw * 0.25)) continue;
        run.forEach(o => taken.add(o));
        const x0 = run[0].x0, x1 = run[run.length - 1].x1, y0 = Math.min(...run.map(o => o.y0)), y1 = Math.max(...run.map(o => o.y1));
        add({ ...toPt(x0 + P(.6), y0 + P(.6), x1 - P(.6), y1 - P(.6)), type: 'comb', maxLen: run.length, kind: 'comb' }, 1);
      }
      for (let i = rest.length - 1; i >= 0; i--) if (taken.has(rest[i])) rest.splice(i, 1);
    }
    // celle che contengono solo l'etichetta, con la cella da compilare subito a destra (tabelle «etichetta | valore»)
    const hasInk = c => inkIn(c.x0 + 3, c.y0 + 3, c.x1 - 3, c.y1 - 3) > 6 + (c.x1 - c.x0) * (c.y1 - c.y0) * (scan ? 0.006 : 0.003);
    const labelOnly = new Set();
    for (const c of rest) {
      if (!hasInk(c)) continue;
      const tol = P(scan ? 5 : 3), right = rest.find(o => o !== c && Math.abs(o.x0 - c.x1) <= tol && Math.abs(o.y0 - c.y0) <= tol && Math.abs(o.y1 - c.y1) <= tol);
      const blank = o => inkIn(o.x0 + 3, o.y0 + 3, o.x1 - 3, o.y1 - 3) <= 4 + (o.x1 - o.x0) * (o.y1 - o.y0) * (scan ? 0.002 : 0.0004);
      if (right && blank(right) && (right.x1 - right.x0) >= (c.x1 - c.x0) * 0.4) labelOnly.add(c);
    }
    // colonna di etichette: se quasi tutte le celle della colonna sono solo etichette, lo sono tutte (anche quella accanto ai quadretti del codice fiscale)
    for (const c of [...labelOnly]) {
      const col = rest.filter(o => Math.abs(o.x0 - c.x0) <= P(3) && Math.abs(o.x1 - c.x1) <= P(3) && hasInk(o));
      if (col.length >= 3 && col.filter(o => labelOnly.has(o)).length >= col.length * 0.6) col.forEach(o => labelOnly.add(o));
    }
    // intestazione di colonna: cella con il titolo e, subito sotto, una cella vuota della stessa larghezza
    const blankCell = o => inkIn(o.x0 + 3, o.y0 + 3, o.x1 - 3, o.y1 - 3) <= 4 + (o.x1 - o.x0) * (o.y1 - o.y0) * (scan ? 0.002 : 0.0004);
    const isHeader = c => hasInk(c) && rest.some(o => o !== c && Math.abs(o.x0 - c.x0) <= P(3) && Math.abs(o.x1 - c.x1) <= P(3) && Math.abs(o.y0 - c.y1) <= P(3) && blankCell(o));
    // fascia vuota e bassa tra due bordi (cornice doppia) sopra o sotto un riquadro con testo, o una cella con solo l'etichetta accanto a un riquadro di testo
    const textBox = o => inkT(o.x0 + 3, o.y0 + 3, o.x1 - 3, o.y1 - 3) > (o.x1 - o.x0) * (o.y1 - o.y0) * 0.04;
    const hugging = c => (c.y1 - c.y0) / s < 18 && !hasInk(c) && rest.some(o => o !== c && textBox(o) && cover(o.x0, o.x1, c.x0, c.x1) >= 0.85 * Math.min(o.x1 - o.x0, c.x1 - c.x0) && (Math.abs(o.y0 - c.y1) <= P(6) || Math.abs(c.y0 - o.y1) <= P(6)));
    const besideText = c => hasInk(c) && rest.some(o => o !== c && Math.abs(o.x0 - c.x1) <= P(7) && Math.abs(o.y0 - c.y0) <= P(4) && Math.abs(o.y1 - c.y1) <= P(4) && textBox(o));
    if (opt.boxes) for (const c of rest) {
      const w = (c.x1 - c.x0) / s, hh = (c.y1 - c.y0) / s;
      // cella con la sola etichetta («OGGETTO:») e accanto un blocco di testo stampato: è la didascalia di quel testo
      const richRight = hasInk(c) && inkT(c.x1 + P(3), c.y0 + 3, Math.min(W, c.x1 + P(200)), c.y1 - 3) > P(197) * (c.y1 - c.y0 - 6) * 0.05;
      if (hh < 7 || w < 14 || labelOnly.has(c) || isHeader(c) || hugging(c) || besideText(c) || richRight) continue;
      const f = cellField(c.x0, c.y0, c.x1, c.y1, 'cell');
      if (f && f.w >= 14 && f.h >= 6) add({ ...f, type: 'text' }, 2);
    }
    /* 3. riquadri colorati (moduli con campi a sfondo tinto) */
    if (opt.tint && tintN < N * 0.45) {
      const tint = new Uint8Array(N); for (let i = 0; i < N; i++) tint[i] = !ink[i] && gray[i] < 246 ? 1 : 0;
      const comps = components(tint, W, H, false, c => {
        const w = (c.x1 - c.x0 + 1) / s, hh = (c.y1 - c.y0 + 1) / s;
        return !c.border && hh >= 7 && hh <= 60 && w >= 12 && w * hh <= pageArea * 0.06;
      });
      for (const c of comps) {
        const box = (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1), inside = inkA(c.x0, c.y0, c.x1 + 1, c.y1 + 1);
        if (c.area < box * 0.6 || inside > box * 0.3 || (c.area + inside) / box < 0.85) continue;
        const f = cellField(c.x0, c.y0, c.x1 + 1, c.y1 + 1, 'tint');
        if (f && f.w >= 12 && f.h >= 6) add({ ...f, type: (c.x1 - c.x0) / s <= 16 && Math.abs((c.x1 - c.x0) - (c.y1 - c.y0)) < P(3) ? 'check' : 'text' }, 2);
      }
    }
    // la linea intera a cui appartiene un pezzo (le scansioni spezzano i bordi in più tratti)
    const hsorted = [...hseg].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const fullLine = g => { let x0 = g.x0, x1 = g.x1, grow = true;
      while (grow) { grow = false; for (const o of hsorted) { if (Math.abs(o.y0 - g.y0) > P(1.8)) continue; if (o.x1 >= x0 - P(10) && o.x0 < x0) { x0 = o.x0; grow = true; } if (o.x0 <= x1 + P(10) && o.x1 > x1) { x1 = o.x1; grow = true; } } }
      return { x0, x1, y0: g.y0, y1: g.y1 }; };
    /* 4. righe da compilare (linee e trattini bassi) */
    const lineFields = [];
    if (opt.lines) {
      const lines = hseg.filter(g => g.x1 - g.x0 >= P(22) && g.y1 - g.y0 <= P(2.6)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const ruled = g => lines.some(o => o !== g && Math.abs(o.x0 - g.x0) <= P(6) && Math.abs(o.x1 - g.x1) <= P(6) && Math.abs(o.y0 - g.y0) >= P(10) && Math.abs(o.y0 - g.y0) <= P(50)
        && !cells.some(c => Math.abs(c.y0 - Math.min(o.y1, g.y1)) <= P(3) && cover(c.x0, c.x1, g.x0, g.x1) >= 0.5 * (g.x1 - g.x0)));
      // tratti verticali che partono o arrivano agli estremi della linea: è il bordo di un riquadro, non una riga da compilare
      // bordo di un riquadro o di una tabella: almeno due tratti verticali appesi sotto la linea o che finiscono sopra di essa
      const boxEdge = g0 => { const g = fullLine(g0), at = v => v.y1 - v.y0 >= P(11) && v.x0 >= g.x0 - P(6) && v.x1 <= g.x1 + P(6);   // più alti di una lettera
        const touch = v => Math.abs(v.y0 - g.y0) <= P(4) || Math.abs(v.y1 - g.y1) <= P(4), end = v => Math.abs(v.x0 - g.x0) <= P(5) || Math.abs(v.x1 - g.x1) <= P(5);
        return vseg.filter(v => at(v) && Math.abs(v.y0 - g.y0) <= P(4)).length >= 2 || vseg.filter(v => at(v) && Math.abs(v.y1 - g.y1) <= P(4)).length >= 2 || (scan && vseg.some(v => at(v) && touch(v) && end(v))); };
      // linea fatta di trattini regolari («__ __ __ …», il codice fiscale): tante caselle quanti i trattini
      const dashes = (a, b, g) => {
        const y = Math.round((g.y0 + g.y1) / 2), runs = []; let r0 = -1;
        for (let x = a; x <= b; x++) { const on = x < b && (ink[y * W + x] || ink[(y - 1) * W + x] || ink[(y + 1) * W + x]); if (on && r0 < 0) r0 = x; else if (!on && r0 >= 0) { runs.push([r0, x]); r0 = -1; } }
        const big = runs.filter(r => r[1] - r[0] >= P(2.5)); if (big.length < 6) return 0;
        const gaps = big.slice(1).map((r, i) => r[0] - big[i][1]); if (gaps.some(v => v < P(1))) return 0;
        const lens = big.map(r => r[1] - r[0]), ml = [...lens].sort((x, z) => x - z)[lens.length >> 1], mg = [...gaps].sort((x, z) => x - z)[gaps.length >> 1];
        return lens.every(v => Math.abs(v - ml) <= Math.max(P(2), ml * 0.5)) && gaps.every(v => Math.abs(v - mg) <= Math.max(P(1.5), mg * 0.9)) ? big.length : 0;
      };
      if (opt.debug) opt.debug.lines = lines.map(g => [Math.round(g.x0 / s), Math.round(g.x1 / s), Math.round(g.y0 / s), boxEdge(g) ? 'bordo' : '']);
      for (const g of lines) {
        const yTop = g.y0, band = P(8);
        if (boxEdge(g)) continue;
        // testo sottolineato (scritte appoggiate sulla linea): non è un campo
        let onTop = 0, under = 0;
        for (let x = g.x0; x < g.x1; x += 2) {
          if (inkA(x, yTop - P(1.6), x + 2, yTop - 1)) onTop += 2;
          if (inkA(x, g.y1 + 1, x + 2, g.y1 + 1 + Math.max(3, Math.round(P(2))))) under += 2;
        }
        if (onTop > (g.x1 - g.x0) * 0.4) continue;
        // "linee" che sono in realtà il bordo superiore di parole (scansioni sfocate, maiuscole in grassetto)
        if (under > (g.x1 - g.x0) * 0.25) continue;
        // colonne libere sopra la linea
        const runs = []; let r0 = -1, gap = 0;
        for (let x = g.x0; x <= g.x1; x++) {
          const free = x < g.x1 && !inkA(x, yTop - band, x + 1, yTop - 1);
          if (free) { if (r0 < 0) r0 = x; gap = 0; }
          else if (r0 >= 0) { if (++gap > 2 || x === g.x1) { runs.push([r0, x - gap + 1]); r0 = -1; gap = 0; } }
        }
        for (const [a, b] of runs) {
          if (b - a < P(25)) continue;
          // sotto una vera linea non c'è testo attaccato (esclude le "linee" formate da righe di testo)
          if (inkA(a, g.y1 + 1, b, g.y1 + 1 + Math.max(2, Math.round(P(1.5)))) > (b - a) * Math.max(2, Math.round(P(1.5))) * 0.15) continue;
          if (cells.reduce((t, c) => t + (Math.abs(c.y0 - g.y1) <= P(scan ? 4 : 2) ? cover(c.x0, c.x1, a, b) : 0), 0) >= 0.5 * (b - a)) continue;
          // bordo inferiore di una cella (o di una tabella): non è una riga da compilare
          if (cells.reduce((t, c) => t + (Math.abs(c.y1 - g.y0) <= P(2.5) ? cover(c.x0, c.x1, a, b) : 0), 0) >= 0.5 * (b - a)) continue;
          // altezza libera sopra
          let top = yTop - band; const lim = yTop - P(16), ttol = scan ? Math.max(1, (b - a) * 0.01) : 0;
          while (top > lim && top > 0 && inkA(a, top - 1, b, top) <= ttol) top--;
          const hgt = yTop - 1 - top;
          if (hgt < P(7)) continue;
          const labelLeft = inkT(a - P(45), yTop - P(10), a - 1, yTop + 2) >= P(1) * P(4);
          const labelBelow = (b - a) <= W * 0.7 && inkT(a, g.y1 + 2, b, g.y1 + P(12)) >= P(1) * P(4);
          const cont = lineFields.some(o => o.yb < yTop && yTop - o.yb <= P(30) && Math.min(o.b, b) - Math.max(o.a, a) >= 0.6 * Math.min(o.b - o.a, b - a));
          // testo subito a destra («______ il ______») o sulla stessa riga (righe di un paragrafo che cominciano con lo spazio da compilare)
          const labelRight = inkT(b + 1, yTop - P(10), b + P(30), yTop + 2) >= P(1) * P(4);
          const sameRow = !labelLeft && !labelRight && inkT(0, yTop - P(10), W, yTop + 2) - inkT(a, yTop - P(10), b, yTop + 2) >= P(1) * P(12);
          if (!(labelLeft || labelBelow || cont || labelRight || sameRow || ruled(g))) continue;
          lineFields.push({ a, b, yb: yTop });
          const nd = opt.combs ? dashes(a, b, g) : 0;
          if (nd) add({ ...toPt(a, top + 1, b, yTop - P(0.6)), type: 'comb', maxLen: nd, kind: 'comb' }, 1);
          else add({ ...toPt(a + P(1), top + 1, b - P(1), yTop - P(0.6)), type: 'text', kind: 'under' }, 3);
        }
      }
    }
    /* 4a. quadretti fatti di trattini bassi separati e regolari, con l'etichetta a sinistra («codice fiscale __ __ __ …») */
    if (opt.combs) {
      const dash = hseg.filter(g => g.x1 - g.x0 >= P(7) && g.x1 - g.x0 <= P(20) && g.y1 - g.y0 <= P(2.4)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const rowsD = [];
      for (const g of dash) { const r = rowsD.find(k => Math.abs(k[0].y0 - g.y0) <= P(1.6)); if (r) r.push(g); else rowsD.push([g]); }
      for (const row of rowsD) {
        row.sort((a, b) => a.x0 - b.x0);
        let run = [row[0]];
        const flush = () => {
          if (run.length < 8) return;
          const len = run.map(g => g.x1 - g.x0), ml = [...len].sort((a, b) => a - b)[len.length >> 1];
          const gaps = run.slice(1).map((g, i) => g.x0 - run[i].x1), mg = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
          if (!len.every(v => Math.abs(v - ml) <= Math.max(P(2), ml * 0.4)) || !gaps.every(v => Math.abs(v - mg) <= Math.max(P(2), mg * 0.7))) return;
          const x0 = run[0].x0, x1 = run[run.length - 1].x1, yTop = Math.min(...run.map(g => g.y0));
          if (inkT(x0, yTop - P(9), x1, yTop - 1) > (x1 - x0) * P(9) * 0.03) return;                       // testo sottolineato
          if (inkT(Math.max(0, x0 - P(70)), yTop - P(10), x0 - P(2), yTop + 2) < P(1) * P(6)) return;       // nessuna etichetta a sinistra
          add({ ...toPt(x0, yTop - P(12), x1, yTop - P(0.6)), type: 'comb', maxLen: run.length, kind: 'comb' }, 1);
        };
        for (let i = 1; i < row.length; i++) { if (row[i].x0 - run[run.length - 1].x1 <= P(8)) run.push(row[i]); else { flush(); run = [row[i]]; } }
        flush();
      }
      if (opt.debug) opt.debug.dash = rowsD.filter(r => r.length >= 5).map(r => [Math.round(r[0].y0 / s), r.length, r.map(g => [Math.round(g.x0 / s), Math.round((g.x1 - g.x0) / s * 10) / 10]).slice(0, 20)]);
    }
    /* 4b. righe brevi tra due pezzi di testo: «(____)», «___/___/_____», «n. ____» (scansioni; nei PDF nativi le trova il testo) */
    if (opt.lines) {
      const shorts = hseg.filter(g => g.x1 - g.x0 >= P(10) && g.x1 - g.x0 < P(34) && g.y1 - g.y0 <= P(2.2));
      const vAt = g0 => { const g = fullLine(g0), at = v => v.y1 - v.y0 >= P(11) && v.x0 >= g.x0 - P(6) && v.x1 <= g.x1 + P(6); return vseg.filter(v => at(v) && (Math.abs(v.y0 - g.y0) <= P(4) || Math.abs(v.y1 - g.y1) <= P(4))).length >= 2; };
      for (const g of shorts) {
        const yTop = g.y0;
        if (vAt(g)) continue;
        // tratto libero sopra la linea (le parentesi o le barre agli estremi non contano)
        let a = g.x0, b = g.x1;
        const colFree = x => inkA(x, yTop - P(7), x + 1, yTop - 1) <= (scan ? 1 : 0);
        while (a < b && !colFree(a)) a++;
        while (b > a && !colFree(b - 1)) b--;
        if (b - a < P(10) || b - a >= P(25)) continue;
        if (cands.some(o => o.kind === 'under' && Math.abs((o.y + o.h) * s - yTop) < P(4) && o.x * s <= a + P(3) && (o.x + o.w) * s >= b - P(3))) continue;
        if (inkA(a + 1, yTop - P(7), b - 1, yTop - 1) > (b - a) * P(7) * 0.04) continue;      // lettere sopra: è testo sottolineato
        if (inkA(a, g.y1 + 1, b, g.y1 + 1 + Math.round(P(2))) > (b - a) * 0.4) continue;
        const win = Math.round(P(8)), b0 = Math.round(yTop - P(11)), b1 = Math.round(g.y1 + P(4));
        if (inkT(a - win, b0, a, b1) < P(1) * P(2) || inkT(b, b0, b + win, b1) < P(1) * P(2)) continue;
        // il testo vicino poggia sulla stessa riga: un trattino a metà altezza ha le lettere che scendono più in basso
        const lowest = (x0, x1) => { for (let y = b1; y > yTop; y--) if (inkT(x0, y - 1, x1, y) > 0) return y; return yTop; };
        if (Math.min(lowest(a - win, a), lowest(b, b + win)) > g.y1 + P(1.8)) continue;
        let top = yTop - 1; const lim = yTop - P(14), ttol = scan ? 1 : 0;
        while (top > lim && top > 0 && inkA(a, top - 1, b, top) <= ttol) top--;
        if (yTop - top < P(6)) continue;
        add({ ...toPt(a + P(0.5), top + 1, b - P(0.5), yTop - P(0.6)), type: 'text', kind: 'under' }, 3);
      }
    }
    /* 5. puntini di riempimento ........ */
    if (opt.dots) {
      const maxD = P(2.6);
      const dots = components(txt, W, H, true, c => c.x1 - c.x0 < maxD && c.y1 - c.y0 < maxD && !c.border)
        .map(c => ({ cx: (c.x0 + c.x1) / 2, cy: (c.y0 + c.y1) / 2, x0: c.x0, x1: c.x1 + 1, y1: c.y1 + 1 }))
        .sort((a, b) => a.cx - b.cx);
      const chains = [];
      for (const d of dots) {
        let ch = chains.find(k => { const l = k[k.length - 1]; return Math.abs(l.cy - d.cy) <= P(1.2) && d.cx > l.cx + 0.5 && d.cx - l.cx <= P(7); });
        if (!ch) chains.push(ch = []);
        ch.push(d);
      }
      if (opt.debug) opt.debug.dots = { n: dots.length, chains: chains.filter(c => c.length >= 4).map(c => [c.length, Math.round(c[0].cx / s), Math.round(c[0].cy / s)]) };
      // sequenze regolari: passo costante; nelle scansioni si scartano i granelli di rumore e si tollera qualche puntino mancante
      const regular = [];
      for (const ch of chains) {
        if (ch.length < 6) continue;
        const gaps = ch.slice(1).map((d, i) => d.cx - ch[i].cx), mg = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
        if (mg < 1) continue;
        const near = k => { const r = k / mg, n = Math.round(r); return n >= 1 && n <= (scan ? 3 : 1) && Math.abs(r - n) <= 0.35 / n + 1 / mg; };
        let run = [ch[0]];
        for (let i = 1; i < ch.length; i++) {
          const g = ch[i].cx - run[run.length - 1].cx;
          if (near(g)) run.push(ch[i]);
          else if (scan && g < mg * 0.6) continue;           // granello tra due puntini
          else { if (run.length >= 6) regular.push(run); run = [ch[i]]; }
        }
        if (run.length >= 6) regular.push(run);
      }
      for (const ch of regular) {
        // i puntini di riempimento stanno sulla riga di base: sotto non c'è nulla (a differenza dei puntini delle «i»)
        const free = ch.filter(d => !inkA(d.x0 - 1, d.y1 + 1, d.x1 + 1, d.y1 + Math.round(P(3)))).length;
        if (free < ch.length * (scan ? 0.6 : 0.8)) continue;
        const x0 = ch[0].x0, x1 = ch[ch.length - 1].x1, yb = Math.max(...ch.map(d => d.y1));
        if (x1 - x0 < P(25)) continue;
        let top = yb - P(3); const lim = yb - P(16), tol = scan ? Math.max(2, (x1 - x0) * 0.01) : 0;
        while (top > lim && top > 0 && inkT(x0, top - 1, x1, top) <= tol) top--;
        if (yb - top < P(8)) continue;
        add({ ...toPt(x0, top + 1, x1, yb + P(0.5)), type: 'text', kind: 'under' }, 3);
      }
    }
    /* 6. spazio vuoto dopo "Etichetta:" */
    if (opt.colon) {
      let contentR = 0; // bordo destro del contenuto
      for (let x = W - 1; x > 0; x -= 2) if (inkA(x - 2, 0, x, H)) { contentR = x; break; }
      for (const t of items) {
        const str = t.str.trim();
        if (!/:$/.test(str) || str.length > 38 || t.b.h < 4 || t.b.h > 30) continue;
        if (items.some(o => o !== t && Math.abs(o.b.y - t.b.y) < t.b.h * 0.5 && o.b.x + o.b.w < t.b.x && t.b.x - (o.b.x + o.b.w) < 12)) continue;
        const x0 = P(t.b.x + t.b.w + 4), y0 = P(t.b.y - 1), y1 = P(t.b.y + t.b.h + 2);
        let x = x0; while (x < contentR && !inkA(x, y0, x + 1, y1)) x++;
        const x1 = x - P(4);
        if (x1 - x0 < P(60)) continue;
        add({ ...toPt(x0, y0, x1, y1), type: 'text', kind: 'colon', inLabel: cleanLabel(str, true) }, 4);
      }
    }
    for (let i = cands.length - 1; i >= 0; i--) {
      const f = cands[i]; if (f.kind !== 'colon') continue;
      if (cands.some(o => o !== f && o.kind !== 'colon' && o.y >= f.y + f.h - 2 && o.y - (f.y + f.h) <= 22 && o.w >= 60 && o.x <= f.x + f.w && o.x + o.w >= f.x - 20)) cands.splice(i, 1);
      // «… così composto:» seguito da una tabella: introduce la tabella, non è un campo
      else if (cells.some(c => c.y0 / s >= f.y + f.h - 2 && c.y0 / s - (f.y + f.h) <= 22 && c.x0 / s <= f.x + f.w && c.x1 / s >= f.x - 20)) cands.splice(i, 1);
    }
    /* scelta finale: priorità e sovrapposizioni */
    cands.sort((a, b) => a.prio - b.prio || a.y - b.y || a.x - b.x);
    const out = [];
    for (const f of cands) {
      if (f.w < 4 || f.h < 4) continue;
      const clash = out.some(o => {
        const iw = Math.min(o.x + o.w, f.x + f.w) - Math.max(o.x, f.x), ih = Math.min(o.y + o.h, f.y + f.h) - Math.max(o.y, f.y);
        return iw > 0 && ih > 0 && iw * ih > 0.3 * Math.min(o.w * o.h, f.w * f.h);
      });
      if (!clash) out.push(f);
    }
    if (M) { // dallo spazio raddrizzato a quello della pagina
      const Mi = OCRPrep.inv(M);
      const back = (x, y) => { const q = OCRPrep.apply(Mi, x * s, y * s); return [q[0] / s, q[1] / s]; };
      for (const f of out) {
        if (f.native) continue;
        const [cx, cy] = back(f.x + f.w / 2, f.y + f.h / 2);
        const dx = cx - (f.x + f.w / 2), dy = cy - (f.y + f.h / 2);
        f.x += dx; f.y += dy;
        if (f.inCell) f.inCell = [f.inCell[0] + dx * s, f.inCell[1] + dy * s, f.inCell[2] + dx * s, f.inCell[3] + dy * s];
      }
    }
    // scansione senza testo: le etichette si leggono con l'OCR (solo per dare i nomi ai campi)
    // (anche la scansione sotto del testo aggiunto dopo: si tiene solo quello che il PDF non ha già)
    if (opt.ocr && (!items.length || (typeof PageText !== 'undefined' && (await PageText.kind(pdfjs, pageNo)).kind === 'mixed'))) {
      try { const o = await opt.ocr(pageNo), had = items.map(o => ({ x0: o.b.x, y0: o.b.y, x1: o.b.x + o.b.w, y1: o.b.y + o.b.h })); if (o?.length) items.push(...o.filter(q => !had.length || !PageText.covered(had, q.b.x, q.b.y, q.b.x + q.b.w, q.b.y + q.b.h))); } catch (e) { console.warn(e); }
    }
    for (const f of out) {
      if (f.inCell) { // etichetta dentro la cella
        const [l, t, r, b] = f.inCell.map(v => v / s);
        const parts = items.filter(o => o.b.x + o.b.w > l - 1 && o.b.x < r + 1 && o.b.y + o.b.h > t - 1 && o.b.y < b + 1).sort((a, c) => a.b.y - c.b.y || a.b.x - c.b.x);
        f.inLabel = cleanLabel(parts.map(o => o.str).join(' '), false);
        delete f.inCell;
      }
      f.label = labelFor(f, items);
      if (f.type === 'text' && f.h >= 30) f.type = 'multi';
      f.x = +f.x.toFixed(2); f.y = +f.y.toFixed(2); f.w = +f.w.toFixed(2); f.h = +f.h.toFixed(2);
      if (f.star) f.req = true;
      delete f.prio; delete f.inLabel; delete f.native; delete f.star; if (!opt.debug) delete f._at;
    }
    pg.cleanup();
    return { fields: out, hasText: items.length > 0 && !items[0].ocr };
  }
  return { DEFAULTS, detectPage, labelFor, cleanLabel, pageIsImage, segments };
})();
