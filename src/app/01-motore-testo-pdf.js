/* =====================================================================
   Motore testo PDF
   - lettura degli stream di contenuto (tokenizer + interprete testo)
   - font della pagina: larghezze, codifiche, ToUnicode, programma TrueType
   - riscrittura nativa di righe di testo con lo stesso font e stato grafico
   ===================================================================== */
const PT = (() => {
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFNumber, PDFRawStream, decodePDFRawStream, PDFString, PDFHexString } = PDFLib;
  const N = s => PDFName.of(s);

  /* ---------- small helpers ---------- */
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const inv = m => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
  const fmt = v => { if (!isFinite(v)) v = 0; const r = Math.round(v * 10000) / 10000; let s = String(r); if (/e/i.test(s)) s = r.toFixed(6).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
  const mat = m => m.map(fmt).join(' ');
  const latin1 = (b, s = 0, e = b.length) => { let out = ''; for (let i = s; i < e; i += 8192) out += String.fromCharCode.apply(null, b.subarray(i, Math.min(e, i + 8192))); return out; };
  const asciiBytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const hex2 = n => n.toString(16).padStart(2, '0').toUpperCase();
  const escName = s => s.replace(/[^!-~]|[()<>\[\]{}\/%#]/g, c => '#' + hex2(c.charCodeAt(0) & 255));
  const rgOp = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || [0, '000000']; const n = parseInt(m[1], 16); return `${fmt(((n >> 16) & 255) / 255)} ${fmt(((n >> 8) & 255) / 255)} ${fmt((n & 255) / 255)} rg`; };
  const nfkc = s => { try { return s.normalize('NFKC'); } catch { return s; } };

  function look(ctx, o) { return o instanceof PDFRef ? ctx.lookup(o) : o; }
  function num(o) { return o instanceof PDFNumber ? o.asNumber() : (o && typeof o.asNumber === 'function' ? o.asNumber() : undefined); }
  function nm(o) { return o instanceof PDFName ? o.decodeText() : undefined; }
  function arr(ctx, o) { o = look(ctx, o); return o instanceof PDFArray ? o.asArray().map(x => look(ctx, x)) : null; }
  function streamBytes(s) {
    if (!s) return new Uint8Array(0);
    if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
    if (typeof s.getUnencodedContents === 'function') return s.getUnencodedContents();
    return s.getContents();
  }

  /* ---------- content stream tokenizer ---------- */
  const WS = new Uint8Array(256); [0, 9, 10, 12, 13, 32].forEach(c => WS[c] = 1);
  const DL = new Uint8Array(256); '()<>[]{}/%'.split('').forEach(c => DL[c.charCodeAt(0)] = 1);
  const NUMRE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
  function findInlineImageEnd(b, i) {
    // after BI: find "ID" token, then data until whitespace + "EI" + whitespace/EOF
    const n = b.length;
    let j = i;
    while (j < n - 1) {
      if (b[j] === 73 && b[j + 1] === 68 && (j === 0 || WS[b[j - 1]]) && (j + 2 >= n || WS[b[j + 2]])) break;
      j++;
    }
    j += 3;
    while (j < n - 1) {
      if (b[j] === 69 && b[j + 1] === 73 && WS[b[j - 1]] && (j + 2 >= n || WS[b[j + 2]] || DL[b[j + 2]])) return j + 2;
      j++;
    }
    return n;
  }
  function parseContent(b) {
    const ops = []; const n = b.length;
    let stack = [], opStart = -1, i = 0;
    const nest = [];
    const push = (v, st) => {
      if (nest.length) nest[nest.length - 1].items.push(v);
      else { if (!stack.length) opStart = st; stack.push(v); }
    };
    while (i < n) {
      const c = b[i];
      if (WS[c]) { i++; continue; }
      const st = i;
      if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
      if (c === 40) {
        const out = []; let depth = 1; i++;
        while (i < n) {
          const ch = b[i++];
          if (ch === 92) {
            const e = b[i++];
            if (e === 110) out.push(10); else if (e === 114) out.push(13); else if (e === 116) out.push(9);
            else if (e === 98) out.push(8); else if (e === 102) out.push(12);
            else if (e === 13) { if (b[i] === 10) i++; }
            else if (e === 10) { }
            else if (e >= 48 && e <= 55) { let v = e - 48; for (let k = 0; k < 2 && b[i] >= 48 && b[i] <= 55; k++) v = v * 8 + (b[i++] - 48); out.push(v & 255); }
            else if (e !== undefined) out.push(e);
          } else if (ch === 40) { depth++; out.push(ch); }
          else if (ch === 41) { if (--depth === 0) break; out.push(ch); }
          else out.push(ch);
        }
        push({ t: 's', b: out }, st); continue;
      }
      if (c === 60) {
        if (b[i + 1] === 60) { i += 2; nest.push({ t: 'd', items: [], st }); continue; }
        i++; let hx = '';
        while (i < n && b[i] !== 62) { const ch = b[i++]; if (!WS[ch]) hx += String.fromCharCode(ch); }
        i++;
        if (hx.length % 2) hx += '0';
        const out = []; for (let k = 0; k < hx.length; k += 2) out.push(parseInt(hx.substr(k, 2), 16) || 0);
        push({ t: 's', b: out, hex: true }, st); continue;
      }
      if (c === 62) { i += b[i + 1] === 62 ? 2 : 1; const d = nest.pop(); if (d) push(d, d.st); continue; }
      if (c === 91) { i++; nest.push({ t: 'a', items: [], st }); continue; }
      if (c === 93) { i++; const a = nest.pop(); if (a) push(a, a.st); continue; }
      if (c === 123 || c === 125 || c === 41) { i++; continue; }
      if (c === 47) {
        i++; let s = '';
        while (i < n && !WS[b[i]] && !DL[b[i]]) s += String.fromCharCode(b[i++]);
        push({ t: 'n', v: s.replace(/#([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))) }, st); continue;
      }
      let s = '';
      while (i < n && !WS[b[i]] && !DL[b[i]]) s += String.fromCharCode(b[i++]);
      if (!s) { i++; continue; }
      if (NUMRE.test(s)) { push({ t: '#', v: parseFloat(s) }, st); continue; }
      if (s === 'true' || s === 'false') { push({ t: 'b', v: s === 'true' }, st); continue; }
      if (s === 'null') { push({ t: 'z' }, st); continue; }
      if (nest.length) { nest[nest.length - 1].items.push({ t: 'k', v: s }); continue; }
      if (s === 'BI') {
        const end = findInlineImageEnd(b, i);
        ops.push({ op: 'BI', args: [], start: st, end, inline: latin1(b, i, Math.min(end, i + 400)) });
        stack = []; i = end; continue;
      }
      ops.push({ op: s, args: stack, start: stack.length ? opStart : st, end: i });
      stack = [];
    }
    return ops;
  }

  /* ---------- encodings & glyph names ---------- */
  // (i codici senza carattere oltre lo spazio valgono il pallino «•», come dice la norma PDF per WinAnsiEncoding)
  const WIN = (() => { const d = new TextDecoder('windows-1252'); return Array.from({ length: 256 }, (_, c) => [127, 0x81, 0x8D, 0x8F, 0x90, 0x9D].includes(c) ? '•' : d.decode(Uint8Array.of(c))); })();
  const MAC = (() => { try { const d = new TextDecoder('macintosh'); return Array.from({ length: 256 }, (_, c) => d.decode(Uint8Array.of(c))); } catch { return WIN; } })();
  const STDENC = (() => { const a = WIN.slice(); a[0x27] = '’'; a[0x60] = '‘'; for (let c = 0x80; c < 256; c++) a[c] = ''; return a; })();
  let NAME2UNI = null;
  function glyphUni(name) {
    if (!NAME2UNI) {
      NAME2UNI = new Map();
      try {
        const m = PDFLib.StandardFontEmbedder.for(StandardFonts.Helvetica).encoding.unicodeMappings;
        for (const cp of Object.keys(m)) NAME2UNI.set(m[cp][1], String.fromCodePoint(+cp));
      } catch { }
      Object.entries({ fi: 'ﬁ', fl: 'ﬂ', ff: 'ﬀ', ffi: 'ﬃ', ffl: 'ﬄ', minus: '−', nbspace: ' ', nonbreakingspace: ' ', Delta: 'Δ', Omega: 'Ω', mu: 'µ', apostrophe: "'", sfthyphen: '­', afii61664: '‌', Euro: '€', dotlessi: 'ı', fraction: '⁄', lozenge: '◊' }).forEach(([k, v]) => NAME2UNI.set(k, v));
    }
    if (NAME2UNI.has(name)) return NAME2UNI.get(name);
    let m = /^uni([0-9A-Fa-f]{4})$/.exec(name); if (m) return String.fromCharCode(parseInt(m[1], 16));
    m = /^u([0-9A-Fa-f]{4,6})$/.exec(name); if (m) return String.fromCodePoint(parseInt(m[1], 16));
    m = /^([A-Za-z]+)\.\w+$/.exec(name); if (m && NAME2UNI.has(m[1])) return NAME2UNI.get(m[1]);
    return '';
  }

  /* ---------- ToUnicode CMap ---------- */
  function hexToStr(h) { let s = ''; for (let k = 0; k < h.length; k += 4) s += String.fromCharCode(parseInt(h.substr(k, 4).padEnd(4, '0'), 16)); return s; }
  function parseToUnicode(bytes) {
    const s = latin1(bytes); const map = new Map(); let codeLen = 0;
    const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(s);
    if (cs) { const m = /<([0-9a-fA-F]+)>/.exec(cs[1]); if (m) codeLen = m[1].length / 2; }
    for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { map.set(parseInt(m[1], 16), hexToStr(m[2])); codeLen = codeLen || m[1].length / 2; }
    for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g; let m;
      while ((m = re.exec(blk[1]))) {
        const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16); codeLen = codeLen || m[1].length / 2;
        if (hi < lo || hi - lo > 65535) continue;
        if (m[3][0] === '[') { const items = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)]; for (let k = 0; k < items.length && lo + k <= hi; k++) map.set(lo + k, hexToStr(items[k][1])); }
        else {
          const base = hexToStr(m[3].slice(1, -1)); if (!base) continue;
          const head = base.slice(0, -1), last = base.charCodeAt(base.length - 1);
          for (let c = lo; c <= hi; c++) map.set(c, head + String.fromCharCode(last + c - lo));
        }
      }
    }
    return { map, codeLen };
  }
  function buildToUnicode(map, twoByte) {
    const w = twoByte ? 4 : 2;
    const entries = [...map.entries()].filter(([, v]) => v).sort((a, b) => a[0] - b[0]);
    let body = '';
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      body += `${chunk.length} beginbfchar\n` + chunk.map(([c, v]) => `<${c.toString(16).padStart(w, '0').toUpperCase()}> <${[...v].map(ch => { const cp = ch.codePointAt(0); return cp > 0xFFFF ? String.fromCharCode(...[0xD800 + ((cp - 0x10000) >> 10), 0xDC00 + ((cp - 0x10000) & 1023)]).split('').map(x => x.charCodeAt(0).toString(16).padStart(4, '0')).join('') : cp.toString(16).padStart(4, '0'); }).join('').toUpperCase()}>`).join('\n') + '\nendbfchar\n';
    }
    return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<${'0'.repeat(w)}> <${'F'.repeat(w)}>\nendcodespacerange\n${body}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
  }

  /* ---------- TrueType font program ---------- */
  function readCmap(dv, o) {
    const fmt0 = dv.getUint16(o); const m = new Map();
    if (fmt0 === 0) { for (let c = 0; c < 256; c++) { const g = dv.getUint8(o + 6 + c); if (g) m.set(c, g); } }
    else if (fmt0 === 4) {
      const segX2 = dv.getUint16(o + 6), seg = segX2 / 2, ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < seg; s++) {
        const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xFFFF;
          else { const gi = ranges + s * 2 + ro + (c - start) * 2; if (gi + 1 >= dv.byteLength) continue; g = dv.getUint16(gi); if (g) g = (g + delta) & 0xFFFF; }
          if (g) m.set(c, g);
        }
      }
    } else if (fmt0 === 6) { const first = dv.getUint16(o + 6), cnt = dv.getUint16(o + 8); for (let k = 0; k < cnt; k++) { const g = dv.getUint16(o + 10 + k * 2); if (g) m.set(first + k, g); } }
    else if (fmt0 === 12) { const ng = dv.getUint32(o + 12); for (let k = 0; k < ng; k++) { const p = o + 16 + k * 12, sc = dv.getUint32(p), ec = dv.getUint32(p + 4), sg = dv.getUint32(p + 8); for (let c = sc; c <= ec && c - sc < 70000; c++) m.set(c, sg + c - sc); } }
    return m;
  }
  function parseTT(b) {
    try {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const ver = dv.getUint32(0);
      if (ver !== 0x00010000 && ver !== 0x74727565) return null;
      const numTables = dv.getUint16(4); const t = {};
      for (let k = 0; k < numTables; k++) { const o = 12 + k * 16; const tag = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); t[tag] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) }; }
      if (!t.head || !t.maxp) return null;
      const upem = dv.getUint16(t.head.off + 18) || 1000, locFmt = dv.getInt16(t.head.off + 50), numGlyphs = dv.getUint16(t.maxp.off + 4);
      let hasGlyph = gid => gid > 0 && gid < numGlyphs;
      if (t.loca && t.glyf) {
        const L = gid => locFmt ? dv.getUint32(t.loca.off + gid * 4) : dv.getUint16(t.loca.off + gid * 2) * 2;
        hasGlyph = gid => gid > 0 && gid < numGlyphs && L(gid + 1) > L(gid);
      }
      let adv = () => 0;
      if (t.hhea && t.hmtx) { const nhm = dv.getUint16(t.hhea.off + 34) || 1; adv = gid => dv.getUint16(t.hmtx.off + 4 * Math.min(gid, nhm - 1)) * 1000 / upem; }
      const cmaps = {};
      if (t.cmap) {
        const co = t.cmap.off, nt = dv.getUint16(co + 2);
        for (let k = 0; k < nt; k++) {
          const pid = dv.getUint16(co + 4 + k * 8), eid = dv.getUint16(co + 6 + k * 8), so = co + dv.getUint32(co + 8 + k * 8);
          const key = pid + ',' + eid; if (cmaps[key]) continue;
          try { cmaps[key] = readCmap(dv, so); } catch { }
        }
      }
      return { hasGlyph, adv, cmaps, numGlyphs, upem, tables: t };
    } catch (e) { console.warn('TrueType non leggibile', e); return null; }
  }

  /* ---------- fonts ---------- */
  const STD14 = /^(Helvetica|Times|Courier|Symbol|ZapfDingbats|Arial|TimesNewRoman|CourierNew)/i;
  function stdFor(fam, bold, italic) { return STD[fam || 'helv'][(bold ? 1 : 0) + (italic ? 2 : 0)]; }
  const _stdEmb = new Map();
  function stdEmbedder(name) { if (!_stdEmb.has(name)) _stdEmb.set(name, PDFLib.StandardFontEmbedder.for(name)); return _stdEmb.get(name); }
  function stdGlyph(name, ch) {
    const e = stdEmbedder(name), cp = ch.codePointAt(0);
    if (e.encoding.canEncodeUnicodeCodePoint(cp)) { const r = e.encoding.encodeUnicodeCodePoint(cp); return { code: r.code, w: e.font.getWidthOfGlyph(r.name) || 0 }; }
    const q = e.encoding.encodeUnicodeCodePoint(63); return { code: q.code, w: e.font.getWidthOfGlyph(q.name) || 0, missing: true };
  }

  function makeFont(ctx, key, ref, dict, usage, light) {
    const F = { key, ref, dict, ok: true, readable: true, twoByte: false, type3: false, subset: false, embedded: false, kind: '', baseName: '', name: '', fam: 'helv', bold: false, italic: false,
      toUni: new Map(), hasToUnicode: false, encUni: null, addW: new Map(), addUni: new Map(), used: null, tt: null };
    const sub = nm(dict.get(N('Subtype'))) || '';
    F.kind = sub;
    F.baseName = nm(dict.get(N('BaseFont'))) || '';
    F.subset = /^[A-Z]{6}\+/.test(F.baseName);
    F.name = F.baseName.replace(/^[A-Z]{6}\+/, '') || key;
    F.used = usage?.get(F.baseName) || null;
    let fd = look(ctx, dict.get(N('FontDescriptor')));
    let desc = null;
    if (sub === 'Type0') {
      F.twoByte = true;
      const enc = nm(dict.get(N('Encoding')));
      const df = arr(ctx, dict.get(N('DescendantFonts')));
      desc = df && df[0] instanceof PDFDict ? df[0] : null;
      if (!desc || (enc !== 'Identity-H')) { F.ok = false; if (enc !== 'Identity-H' && enc !== 'Identity-V') F.readable = false; }
      if (enc === 'Identity-V') F.ok = false;
      fd = desc ? look(ctx, desc.get(N('FontDescriptor'))) : null;
      F.cidKind = desc ? nm(desc.get(N('Subtype'))) : '';
      F.desc = desc;
      F.dw = (desc && num(look(ctx, desc.get(N('DW'))))) ?? 1000;
      F.W = new Map();
      const W = desc ? arr(ctx, desc.get(N('W'))) : null;
      if (W) for (let k = 0; k < W.length;) {
        const a = num(W[k]);
        if (W[k + 1] instanceof PDFArray) { const list = W[k + 1].asArray(); list.forEach((x, j) => F.W.set(a + j, num(look(ctx, x)) || 0)); k += 2; }
        else { const b = num(W[k + 1]), w = num(look(ctx, W[k + 2])) || 0; if (b - a < 70000) for (let c = a; c <= b; c++) F.W.set(c, w); k += 3; }
      }
      const c2g = desc ? look(ctx, desc.get(N('CIDToGIDMap'))) : null;
      if (c2g && c2g.dict) { const mb = streamBytes(c2g); F.cid2gid = cid => cid * 2 + 1 < mb.length ? (mb[cid * 2] << 8) | mb[cid * 2 + 1] : 0; F._c2gBytes = mb; }
      else F.cid2gid = cid => cid;
    } else if (sub === 'Type3') {
      F.type3 = true; F.ok = false;
      const fm = arr(ctx, dict.get(N('FontMatrix')))?.map(num) || [0.001, 0, 0, 0.001, 0, 0];
      F.t3scale = (fm[0] || 0.001) * 1000;
    }
    if (!F.twoByte) {
      F.first = num(look(ctx, dict.get(N('FirstChar')))) ?? 0;
      F.widths = (arr(ctx, dict.get(N('Widths'))) || []).map(x => num(x) || 0);
      F.missingW = fd instanceof PDFDict ? (num(look(ctx, fd.get(N('MissingWidth')))) || 0) : 0;
    }
    if (fd instanceof PDFDict) {
      F.fd = fd;
      const flags = num(look(ctx, fd.get(N('Flags')))) || 0;
      F.flags = flags;
      F.symbolic = !!(flags & 4);
      const ff2 = look(ctx, fd.get(N('FontFile2'))), ff = look(ctx, fd.get(N('FontFile'))), ff3 = look(ctx, fd.get(N('FontFile3')));
      F.embedded = !!(ff2 || ff || ff3);
      F.programKind = ff2 ? 'TrueType' : ff ? 'Type1' : ff3 ? (nm(ff3.dict?.get(N('Subtype'))) || 'Type1C') : '';
      if (ff2 && !light) { try { F.tt = parseTT(streamBytes(ff2)); } catch (e) { console.warn(e); } }
      const weight = num(look(ctx, fd.get(N('FontWeight')))) || 0;
      const ia = num(look(ctx, fd.get(N('ItalicAngle')))) || 0;
      F.bold = weight >= 600 || !!(flags & (1 << 18));
      F.italic = ia !== 0 || !!(flags & 64);
      F.fam = (flags & 1) ? 'cour' : (flags & 2) ? 'times' : 'helv';
    }
    if (/bold|black|heavy|semibold|demi/i.test(F.name)) F.bold = true;
    if (/italic|oblique/i.test(F.name)) F.italic = true;
    const g = guessFont(F.name, ''); if (g !== 'helv') F.fam = g;
    // ToUnicode
    const tu = look(ctx, dict.get(N('ToUnicode')));
    if (tu && tu.dict && !light) { try { F.toUni = parseToUnicode(streamBytes(tu)).map; F.hasToUnicode = true; } catch (e) { console.warn(e); } }
    // simple font encoding
    if (!F.twoByte) {
      const encObj = look(ctx, dict.get(N('Encoding')));
      let base = null, diffs = null;
      if (encObj instanceof PDFName) base = nm(encObj);
      else if (encObj instanceof PDFDict) { base = nm(encObj.get(N('BaseEncoding'))); diffs = arr(ctx, encObj.get(N('Differences'))); }
      let table = base === 'WinAnsiEncoding' ? WIN : base === 'MacRomanEncoding' ? MAC : base === 'StandardEncoding' ? STDENC : null;
      if (!table) table = (F.symbolic && F.embedded && !STD14.test(F.name)) ? new Array(256).fill('') : (STD14.test(F.name) && !F.embedded ? WIN : STDENC);
      if (/^(Symbol|ZapfDingbats)/.test(F.name)) table = new Array(256).fill('');
      F.encUni = table.slice();
      F.encNames = new Array(256).fill(null);
      if (diffs) { let code = 0; for (const d of diffs) { if (d instanceof PDFNumber) code = d.asNumber(); else if (d instanceof PDFName) { const name = d.decodeText(); F.encNames[code] = name; F.encUni[code] = glyphUni(name); code++; } } }
      F.hasDiffs = !!diffs;
    }
    if (!F.embedded && !F.twoByte && !F.type3) F.stdName = stdFor(F.fam, F.bold, F.italic);
    F.uniOf = code => F.toUni.get(code) ?? (F.encUni ? F.encUni[code] : '') ?? '';
    F.widthOf = code => {
      if (F.twoByte) return F.W.has(code) ? F.W.get(code) : F.dw;
      if (F.type3) { const w = F.widths[code - F.first]; return (w || 0) * F.t3scale; }
      const w = F.widths[code - F.first];
      if (w != null && (w > 0 || F.widths.length)) return w;
      if (F.missingW) return F.missingW;
      if (F.stdName) { const u = F.uniOf(code); return u ? stdGlyph(F.stdName, u).w : 0; }
      return 0;
    };
    return F;
  }
  /* glyph availability for writing new text with a font */
  function ttGidSimple(F, code) {
    const t = F.tt; if (!t) return 0;
    const c31 = t.cmaps['3,1'], c10 = t.cmaps['1,0'], c30 = t.cmaps['3,0'];
    const u = F.uniOf(code);
    if (!F.symbolic && c31 && u) { const g = c31.get(u.codePointAt(0)); if (g) return g; }
    if (c10) { const mc = u ? MAC.indexOf(u) : -1; const g = c10.get(mc >= 0 && !F.symbolic ? mc : code); if (g) return g; }
    if (c30) return c30.get(0xF000 + code) || c30.get(code) || c30.get(0xF100 + code) || c30.get(0xF200 + code) || 0;
    if (c31 && u) return c31.get(u.codePointAt(0)) || 0;
    return 0;
  }
  function available(F, code, ch) {
    if (F.used && F.used.has(code)) return true;
    if (F.twoByte) {
      if (F.tt) { const g = F.cid2gid(code); return F.tt.hasGlyph(g) || (/\s/.test(ch) && g > 0); }
      return F.toUni.has(code) && (!F.subset || !F.used);
    }
    if (!F.embedded) return !!F.uniOf(code);
    if (F.tt) { const g = ttGidSimple(F, code); return F.tt.hasGlyph(g) || (ch === ' ' && g > 0); }
    return !F.subset && !!F.uniOf(code);
  }
  function revMap(F) {
    if (F._rev) return F._rev;
    const r = new Map();
    for (const [code, s] of F.toUni) { const k = nfkc(s); if (s && !r.has(s)) r.set(s, code); if (k && !r.has(k)) r.set(k, code); }
    if (F.encUni) F.encUni.forEach((s, code) => { if (s && !r.has(s)) r.set(s, code); });
    return (F._rev = r);
  }
  function findCode(F, ch) {
    const r = revMap(F);
    let code = r.get(ch);
    if (code != null && available(F, code, ch)) return code;
    if (ch === ' ') { code = r.get(' '); if (code != null && available(F, code, ' ')) return code; }
    // other codes with the same unicode
    for (const [c, s] of F.toUni) if ((s === ch || nfkc(s) === ch) && available(F, c, ch)) return c;
    if (F.twoByte && F.tt) {
      const cm = F.tt.cmaps['3,1'] || F.tt.cmaps['3,10'] || F.tt.cmaps['0,3'] || F.tt.cmaps['0,4'];
      const gid = cm ? cm.get(ch.codePointAt(0)) : 0;
      if (gid && F.tt.hasGlyph(gid)) {
        let cid = gid;
        if (F._c2gBytes) { cid = -1; for (let c = 0; c * 2 + 1 < F._c2gBytes.length; c++) if (F.cid2gid(c) === gid) { cid = c; break; } }
        if (cid >= 0) { F.addUni.set(cid, ch); if (!F.W.has(cid)) F.addW.set(cid, Math.round(F.tt.adv(gid))); return cid; }
      }
    }
    if (!F.twoByte && F.encUni) {
      const c = F.encUni.indexOf(ch);
      if (c >= 0 && available(F, c, ch)) {
        if (F.hasToUnicode) F.addUni.set(c, ch);
        const w = F.widths[c - F.first];
        if (!(w > 0) && F.embedded && F.tt) F.addW.set(c, Math.round(F.tt.adv(ttGidSimple(F, c))));
        return c;
      }
    }
    return null;
  }
  function encodeText(F, text) {
    const parts = [];
    const chars = [...text];
    for (let i = 0; i < chars.length;) {
      let done = false;
      for (const len of [3, 2]) {
        if (i + len > chars.length) continue;
        const s = chars.slice(i, i + len).join('');
        const code = revMap(F).get(s);
        if (code != null && F.toUni.get(code)?.length > 1 && available(F, code, s)) { parts.push({ code, ch: s, w: wOf(F, code) }); i += len; done = true; break; }
      }
      if (done) continue;
      const ch = chars[i++];
      const code = F.ok ? findCode(F, ch) : null;
      parts.push(code != null ? { code, ch, w: wOf(F, code) } : { code: null, ch });
    }
    return parts;
  }
  const wOf = (F, code) => F.addW.has(code) ? F.addW.get(code) : F.widthOf(code);
  function patchFont(ctx, F) {
    if (F.addW.size) {
      if (F.twoByte && F.desc) {
        const W = arr(ctx, F.desc.get(N('W'))) || [];
        const items = W.slice();
        for (const [cid, w] of F.addW) { items.push(PDFNumber.of(cid)); items.push(ctx.obj([w])); F.W.set(cid, w); }
        F.desc.set(N('W'), ctx.obj(items));
      } else if (!F.twoByte) {
        const cur = new Map(); F.widths.forEach((w, k) => cur.set(F.first + k, w));
        for (const [c, w] of F.addW) cur.set(c, w);
        const codes = [...cur.keys()]; const lo = Math.min(...codes), hi = Math.max(...codes);
        const list = []; for (let c = lo; c <= hi; c++) list.push(cur.get(c) ?? 0);
        F.dict.set(N('FirstChar'), PDFNumber.of(lo)); F.dict.set(N('LastChar'), PDFNumber.of(hi)); F.dict.set(N('Widths'), ctx.obj(list));
        F.first = lo; F.widths = list;
      }
      F.addW.clear();
    }
    if (F.addUni.size && (F.hasToUnicode || F.twoByte)) {
      for (const [c, s] of F.addUni) F.toUni.set(c, s);
      const st = ctx.flateStream(asciiBytes(buildToUnicode(F.toUni, F.twoByte)));
      F.dict.set(N('ToUnicode'), ctx.register(st));
      F.hasToUnicode = true;
      F.addUni.clear();
    }
  }

  /* ---------- page content ---------- */
  function pageContent(page) {
    const ctx = page.doc.context;
    const c = page.node.get(N('Contents'));
    const parts = [];
    const add = r => { const s = look(ctx, r); if (s && s.dict) parts.push(streamBytes(s)); };
    const cc = look(ctx, c);
    if (cc instanceof PDFArray) cc.asArray().forEach(add); else if (c) add(c);
    let len = 0; parts.forEach(p => len += p.length + 1);
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; out[o++] = 10; }
    return out;
  }
  function pageFonts(page, usage, light) {
    const ctx = page.doc.context;
    const res = page.node.Resources();
    const fd = res ? look(ctx, res.get(N('Font'))) : null;
    const cache = new Map();
    const get = key => {
      if (cache.has(key)) return cache.get(key);
      let F = null;
      try { const ref = fd instanceof PDFDict ? fd.get(N(key)) : null; const dict = look(ctx, ref); if (dict instanceof PDFDict) F = makeFont(ctx, key, ref, dict, usage, light); }
      catch (e) { console.warn('font', key, e); }
      cache.set(key, F); return F;
    };
    const keys = fd instanceof PDFDict ? fd.keys().map(k => k.decodeText()) : [];
    return { get, keys, cache };
  }

  /* ---------- text interpreter ---------- */
  function interpret(page, bytes, ops, fonts) {
    let gs = { ctm: [1, 0, 0, 1, 0, 0], Tc: 0, Tw: 0, Th: 1, TL: 0, font: null, Tfs: 0, Trise: 0, Tr: 0, fill: '', fcs: '' };
    const stack = []; let Tm = [1, 0, 0, 1, 0, 0], Tlm = Tm;
    const shows = [];
    const raw = o => latin1(bytes, o.start, o.end);
    for (let idx = 0; idx < ops.length; idx++) {
      const o = ops[idx], a = o.args, v = a.map(x => x && x.t === '#' ? x.v : NaN);
      switch (o.op) {
        case 'q': stack.push({ ...gs }); break;
        case 'Q': if (stack.length) gs = stack.pop(); break;
        case 'cm': if (a.length === 6 && v.every(isFinite)) gs.ctm = mul(v, gs.ctm); break;
        case 'BT': Tm = Tlm = [1, 0, 0, 1, 0, 0]; break;
        case 'Tc': gs.Tc = v[0] || 0; break;
        case 'Tw': gs.Tw = v[0] || 0; break;
        case 'Tz': gs.Th = (isFinite(v[0]) ? v[0] : 100) / 100; break;
        case 'TL': gs.TL = v[0] || 0; break;
        case 'Ts': gs.Trise = v[0] || 0; break;
        case 'Tr': gs.Tr = v[0] || 0; break;
        case 'Tf': gs.font = a[0] && a[0].t === 'n' ? a[0].v : null; gs.Tfs = v[1] || 0; break;
        case 'Td': Tlm = mul([1, 0, 0, 1, v[0] || 0, v[1] || 0], Tlm); Tm = Tlm; break;
        case 'TD': gs.TL = -(v[1] || 0); Tlm = mul([1, 0, 0, 1, v[0] || 0, v[1] || 0], Tlm); Tm = Tlm; break;
        case 'Tm': if (a.length === 6 && v.every(isFinite)) { Tlm = v.slice(); Tm = Tlm; } break;
        case 'T*': Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; break;
        case 'g': case 'rg': case 'k': gs.fill = raw(o); gs.fcs = ''; break;
        case 'cs': gs.fcs = raw(o); gs.fill = raw(o); break;
        case 'sc': case 'scn': gs.fill = (gs.fcs ? gs.fcs + '\n' : '') + raw(o); break;
        case "'": case '"': case 'Tj': case 'TJ': {
          if (o.op === '"') { gs.Tw = v[0] || 0; gs.Tc = v[1] || 0; }
          if (o.op === "'" || o.op === '"') { Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; }
          const F = gs.font != null ? fonts.get(gs.font) : null;
          const list = o.op === 'TJ' ? (a[0] && a[0].items || []) : [a[a.length - 1]];
          const show = { idx, op: o.op, F, gs: { ...gs }, els: [] };
          const two = !!(F && F.twoByte);
          for (const el of list) {
            if (el && el.t === '#') { Tm = mul([1, 0, 0, 1, -el.v / 1000 * gs.Tfs * gs.Th, 0], Tm); show.els.push({ num: el.v }); continue; }
            if (!el || el.t !== 's') continue;
            const bb = el.b;
            for (let k = 0; k < bb.length; k += two ? 2 : 1) {
              const code = two ? ((bb[k] << 8) | (bb[k + 1] ?? 0)) : bb[k];
              const w = F ? F.widthOf(code) : 0;
              const sp = !two && code === 32 ? gs.Tw : 0;
              const tx = ((w / 1000) * gs.Tfs + gs.Tc + sp) * gs.Th;
              const S = [gs.Tfs * gs.Th, 0, 0, gs.Tfs, 0, gs.Trise];
              const p0 = apply(mul(mul(S, Tm), gs.ctm), 0, 0);
              const next = mul([1, 0, 0, 1, tx, 0], Tm);
              const p1 = apply(mul(mul(S, next), gs.ctm), 0, 0);
              show.els.push({ code, w, Tm, p0, p1, uni: F ? F.uniOf(code) : '', show });
              Tm = next;
            }
          }
          shows.push(show);
          break;
        }
      }
    }
    return shows;
  }

  /* ---------- usage of codes per font in the whole document ---------- */
  function collectUsage(pdfDoc) {
    const usage = new Map();
    for (const page of pdfDoc.getPages()) {
      try {
        const fonts = pageFonts(page, null, true);
        const bytes = pageContent(page);
        const shows = interpret(page, bytes, parseContent(bytes), fonts);
        for (const s of shows) if (s.F) {
          let set = usage.get(s.F.baseName); if (!set) usage.set(s.F.baseName, set = new Set());
          for (const g of s.els) if (g.code != null) set.add(g.code);
        }
      } catch (e) { console.warn('usage', e); }
    }
    return usage;
  }

  /* ---------- line matching ---------- */
  function similar(a, b) {
    a = nfkc(a).replace(/\s+/g, ''); b = nfkc(b).replace(/\s+/g, '');
    if (!a || !b) return false;
    if (a === b) return true;
    const m = new Map(); for (const c of a) m.set(c, (m.get(c) || 0) + 1);
    let common = 0; for (const c of b) { const k = m.get(c); if (k) { common++; m.set(c, k - 1); } }
    return common / Math.max(a.length, b.length) >= 0.85;
  }
  function matchLine(shows, vt, L) {
    const tol = Math.max(1.2, L.size * 0.3), pad = L.size * 0.3;
    const out = [];
    for (const s of shows) for (const g of s.els) {
      if (g.code == null) continue;
      const [x0, y0] = apply(vt, g.p0[0], g.p0[1]), [x1, y1] = apply(vt, g.p1[0], g.p1[1]);
      if (Math.abs(y1 - y0) > Math.max(0.3, Math.abs(x1 - x0) * 0.05)) continue;
      if (x1 < x0 - 0.01) continue;
      if (Math.abs(y0 - L.base) > tol) continue;
      const mid = (x0 + x1) / 2;
      if (mid < L.x - pad || mid > L.x + L.w + pad) continue;
      out.push(g);
    }
    return out;
  }

  /* ---------- emission ---------- */
  function hexCodes(items, two) { let s = ''; for (const it of items) s += two ? hex2(it.code >> 8) + hex2(it.code & 255) : hex2(it.code); return s; }
  function missingChars(text, F, forceStd) {
    if (forceStd || !F || !F.ok) return [...text].filter(c => c.trim());
    return encodeText(F, text).filter(p => p.code == null && p.ch.trim()).map(p => p.ch);
  }
  function buildRuns(text, F, std, forceStd, local) {
    const parts = (!forceStd && F && F.ok) ? encodeText(F, text) : [...text].map(ch => ({ code: null, ch }));
    const runs = [];
    for (const p of parts) {
      let kind = p.code != null ? 'doc' : 'std', item = p;
      if (kind === 'std' && local && !forceStd) {
        const cp = p.ch.codePointAt(0);
        try {
          if (local.embedder.font.hasGlyphForCodePoint(cp) || p.ch === ' ') {
            const hx = local.encodeText(p.ch).asString();
            item = { code: parseInt(hx.slice(0, 4), 16), w: local.widthOfTextAtSize(p.ch, 1000), ch: p.ch };
            kind = 'local';
          }
        } catch { }
      }
      let last = runs[runs.length - 1];
      if (!last || last.kind !== kind) runs.push(last = { kind, items: [] });
      if (kind === 'std') { const g = stdGlyph(std, p.ch); last.items.push({ code: g.code, w: g.w, ch: p.ch, missing: g.missing }); }
      else last.items.push(item);
    }
    return runs;
  }
  function emitRuns(runs, F, gs, size, keys, initial) {
    let out = '', cur = initial ? { key: gs.font, size: gs.Tfs } : { key: null, size: 0 }, D = 0;
    for (const r of runs) {
      const key = r.kind === 'doc' ? gs.font : r.kind === 'local' ? keys.local : keys.std;
      if (key !== cur.key || size !== cur.size) { out += `/${escName(key)} ${fmt(size)} Tf\n`; cur = { key, size }; }
      const two = r.kind === 'local' || (r.kind === 'doc' && F && F.twoByte);
      out += `[<${hexCodes(r.items, two)}>] TJ\n`;
      for (const it of r.items) D += ((it.w / 1000) * size + gs.Tc + (!two && it.code === 32 ? gs.Tw : 0)) * gs.Th;
    }
    return { out, D, cur };
  }

  /* ---------- apply line edits to a page ----------
     edits: [{ id, src:{x,w,base,size,text}, text, sizeK, color, std:{fam,bold,italic}|null, move:{dx,dy}|null }]
     adds:  [{ id, fontName, text, x, base, size, color, std:{fam,bold,italic} }]  (new text with a document font)
     vt: pdf.js viewport transform (user space -> display) for this page */
  async function applyEdits(pdfDoc, pageIndex, edits, adds, vt, usage, localFont) {
    const page = pdfDoc.getPage(pageIndex), ctx = pdfDoc.context;
    const result = new Map();
    if (!edits.length && !adds.length) return result;
    const bytes = pageContent(page);
    const ops = parseContent(bytes);
    const fonts = pageFonts(page, usage);
    const shows = interpret(page, bytes, ops, fonts);
    const claimed = new Set();
    const mods = new Map(); // show -> { remove:Set, insert:Map(glyph -> plan) }
    const appendPlans = [];
    const stdNeeded = new Set();
    const ivt = inv(vt);
    const plans = [];
    for (const e of edits) {
      try {
        const glyphs = matchLine(shows, vt, e.src).filter(g => !claimed.has(g));
        if (!glyphs.length) { result.set(e.id, 'fail:nessun glifo'); continue; }
        if (glyphs.some(g => !g.show.F || !g.show.F.readable || !g.show.gs.Tfs || !g.show.gs.Th)) { result.set(e.id, 'fail:font'); continue; }
        if (glyphs.every(g => (g.show.gs.Tr & 3) === 3)) { result.set(e.id, 'fail:invisibile'); continue; }
        const got = glyphs.map(g => g.uni).join('');
        if (!similar(got, e.src.text)) { result.set(e.id, 'fail:testo diverso (' + got.slice(0, 30) + ')'); continue; }
        glyphs.forEach(g => claimed.add(g));
        const first = glyphs[0], F = first.show.F;
        const fam = e.std ? e.std.fam : F.fam, bold = e.std ? e.std.bold : F.bold, italic = e.std ? e.std.italic : F.italic;
        plans.push({ e, glyphs, first, F, std: stdFor(fam, bold, italic) });
      } catch (err) { console.warn(err); result.set(e.id, 'fail:' + err.message); }
    }
    // fonts installed on the computer for characters missing from embedded subsets
    const locals = new Map();
    const localFor = async F => {
      if (!localFont || !F) return null;
      if (locals.has(F)) return locals.get(F);
      let f = null;
      try {
        const bytes = await localFont(F.name, F.fam, F.bold, F.italic);
        if (bytes) { await need('fontkit'); if (window.fontkit && !pdfDoc.__fk) { pdfDoc.registerFontkit(window.fontkit); pdfDoc.__fk = true; } f = await pdfDoc.embedFont(bytes, { subset: true }); }
      } catch (err) { console.warn('font locale non utilizzabile', F.name, err); f = null; }
      locals.set(F, f); return f;
    };
    for (const p of plans) {
      const local = p.e.text && !p.e.std && missingChars(p.e.text, p.F, false).length ? await localFor(p.F) : null;
      p.local = local;
      p.runs = p.e.text ? buildRuns(p.e.text, p.F, p.std, !!p.e.std, local) : [];
      if (p.runs.some(r => r.kind === 'std')) stdNeeded.add(p.std);
      const miss = p.runs.filter(r => r.kind === 'std').flatMap(r => r.items.map(i => i.ch)).filter(c => c.trim());
      if (miss.length) (result.missing || (result.missing = new Map())).set(p.e.id, miss);
      if (p.runs.some(r => r.kind === 'local')) (result.local || (result.local = new Set())).add(p.e.id);
    }
    const addPlans = [];
    for (const a of adds) {
      let F = null;
      const want = String(a.fontName || '').replace(/^[A-Z]{6}\+/, '');
      for (const key of fonts.keys) { const f = fonts.get(key); if (f && f.ok && (f.baseName === a.fontName || f.name === want)) { F = f; break; } }
      if (!F || !F.ok) { result.set(a.id, 'fail:font assente'); continue; }
      const std = stdFor(a.std?.fam || F.fam, a.std ? a.std.bold : F.bold, a.std ? a.std.italic : F.italic);
      const local = !a.std && missingChars(a.text.replace(/\n/g, ''), F, false).length ? await localFor(F) : null;
      const lines = a.text.split('\n').map(t => buildRuns(t, F, std, !!a.std, local));
      if (lines.some(rs => rs.some(r => r.kind === 'std'))) stdNeeded.add(std);
      addPlans.push({ a, F, std, lines, local });
    }
    // embed needed standard fonts
    const stdKeys = new Map();
    for (const name of stdNeeded) {
      const f = await pdfDoc.embedFont(name);
      stdKeys.set(name, page.node.newFontDictionary('OfStd', f.ref).decodeText());
    }
    const localKeys = new Map();
    for (const f of locals.values()) if (f) localKeys.set(f, page.node.newFontDictionary('OfLoc', f.ref).decodeText());
    // plan modifications
    for (const p of plans) {
      const { e, glyphs, first, runs } = p;
      for (const g of glyphs) { let m = mods.get(g.show); if (!m) mods.set(g.show, m = { remove: new Set(), insert: new Map() }); m.remove.add(g); }
      if (!runs.length) { result.set(e.id, 'native'); continue; }
      if (e.move && (Math.abs(e.move.dx) > 0.01 || Math.abs(e.move.dy) > 0.01)) appendPlans.push(p);
      else mods.get(first.show).insert.set(first, p);
      result.set(e.id, 'native');
    }
    // regenerate modified show operators
    const repl = new Map();
    for (const [s, m] of mods) {
      const gs = s.gs, two = s.F.twoByte;
      let out = '';
      if (s.op === "'") out += 'T*\n';
      else if (s.op === '"') out += `${fmt(gs.Tw)} Tw ${fmt(gs.Tc)} Tc T*\n`;
      let elems = [], bytesRun = [];
      const flushStr = () => { if (bytesRun.length) { elems.push('<' + bytesRun.map(hex2).join('') + '>'); bytesRun = []; } };
      const flushTJ = () => { flushStr(); if (elems.length) out += '[' + elems.join(' ') + '] TJ\n'; elems = []; };
      for (const el of s.els) {
        if (el.num != null) { flushStr(); elems.push(fmt(el.num)); continue; }
        const p = m.insert.get(el);
        if (p) {
          flushTJ();
          const size = gs.Tfs * (p.e.sizeK || 1);
          if (p.e.color) out += rgOp(p.e.color) + '\n';
          const r = emitRuns(p.runs, s.F, gs, size, { std: stdKeys.get(p.std), local: localKeys.get(p.local) }, true);
          out += r.out;
          if (r.cur.key !== gs.font || r.cur.size !== gs.Tfs) out += `/${escName(gs.font)} ${fmt(gs.Tfs)} Tf\n`;
          if (p.e.color) out += (gs.fill || '0 g') + '\n';
          if (r.D) out += `[${fmt(r.D * 1000 / (gs.Tfs * gs.Th))}] TJ\n`;
        }
        if (m.remove.has(el)) { flushStr(); elems.push(fmt(-(el.w + (gs.Tc + (!two && el.code === 32 ? gs.Tw : 0)) * 1000 / gs.Tfs))); }
        else if (two) bytesRun.push(el.code >> 8, el.code & 255); else bytesRun.push(el.code);
      }
      flushTJ();
      repl.set(s.idx, out);
    }
    // appended blocks (moved lines, new text in document fonts)
    let tail = '';
    for (const p of appendPlans) {
      const s = p.first.show, gs = s.gs;
      const d = p.e.move, lin = [ivt[0], ivt[1], ivt[2], ivt[3], 0, 0];
      const [du, dv] = apply(lin, d.dx, d.dy);
      const cm = mul(gs.ctm, [1, 0, 0, 1, du, dv]);
      const size = gs.Tfs * (p.e.sizeK || 1);
      tail += `q\n${mat(cm)} cm\nBT\n${p.e.color ? rgOp(p.e.color) : (gs.fill || '0 g')}\n${fmt(gs.Tc)} Tc ${fmt(gs.Tw)} Tw ${fmt(gs.Th * 100)} Tz ${fmt(gs.Trise)} Ts ${gs.Tr} Tr\n${mat(p.first.Tm)} Tm\n`;
      tail += emitRuns(p.runs, s.F, gs, size, { std: stdKeys.get(p.std), local: localKeys.get(p.local) }, false).out + 'ET\nQ\n';
    }
    for (const p of addPlans) {
      const { a, F } = p;
      const lin = [ivt[0], ivt[1], ivt[2], ivt[3], 0, 0];
      const norm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
      const u = norm(apply(lin, 1, 0)), up = norm(apply(lin, 0, -1));
      const gs = { font: F.key, Tfs: a.size, Tc: 0, Tw: 0, Th: 1 };
      tail += `q\nBT\n${rgOp(a.color)}\n`;
      p.lines.forEach((runs, li) => {
        if (!runs.length) return;
        const [px, py] = apply(ivt, a.x, a.base + li * a.size * 1.2);
        tail += `${mat([u[0], u[1], up[0], up[1], px, py])} Tm\n` + emitRuns(runs, F, gs, a.size, { std: stdKeys.get(p.std), local: localKeys.get(p.local) }, false).out;
      });
      tail += 'ET\nQ\n';
      result.set(a.id, 'native');
    }
    // splice content
    const pieces = [asciiBytes('q\n')]; let pos = 0;
    ops.forEach((o, idx) => { if (repl.has(idx)) { pieces.push(bytes.subarray(pos, o.start), asciiBytes(repl.get(idx))); pos = o.end; } });
    pieces.push(bytes.subarray(pos), asciiBytes('\nQ\n' + tail));
    let len = 0; pieces.forEach(p => len += p.length);
    const out = new Uint8Array(len); let o = 0; pieces.forEach(p => { out.set(p, o); o += p.length; });
    const stream = ctx.flateStream(out);
    page.node.set(N('Contents'), ctx.obj([ctx.register(stream)]));
    for (const F of fonts.cache.values()) if (F) patchFont(ctx, F);
    return result;
  }

  /* ---------- blocchi di testo «come in Word» ----------
     Ogni blocco toglie dal contenuto della pagina i glifi delle sue righe originali (srcs) e scrive il nuovo testo
     a pezzi già impaginati (pieces: una parola o un frammento con il suo stile e la sua posizione).
     Coordinate: punti della vista pdf.js a scala 1 (origine in alto a sinistra); vt = utente → vista.
     blocks: [{ id, srcs: [{ x, w, base, size, text, cover: { x, y, w, h, color } }],
                pieces: [{ x, base, w, t, size, fontName, bold, italic, fam, color, fill, u, s, hl }] }]
     Le righe che non si possono togliere dal contenuto (testo invisibile di una scansione, font illeggibile)
     vengono coperte con il loro colore di fondo, sotto al testo nuovo. */
  const famStem = n => String(n || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,_ ]?(Bold|Italic|Oblique|Black|Heavy|Semibold|SemiBold|Demi|Medium|Regular|Roman|Book|Light|It|MT|PS|PSMT)+$/gi, '').replace(/[-,_ ]+$/, '').toLowerCase();
  async function applyBlocks(pdfDoc, pageIndex, blocks, vt, usage, localFont) {
    const page = pdfDoc.getPage(pageIndex), ctx = pdfDoc.context;
    const result = new Map();
    if (!blocks.length) return result;
    const bytes = pageContent(page);
    const ops = parseContent(bytes);
    const fonts = pageFonts(page, usage);
    const shows = interpret(page, bytes, ops, fonts);
    const claimed = new Set(), mods = new Map(), firstFill = new Map();
    const ivt = inv(vt);
    /* ---------- modifica fedele: si tocca solo ciò che è cambiato ----------
       Se il blocco ha ancora le stesse righe e lo stesso stile, non si riscrive: le righe uguali restano com'erano e, in una
       riga cambiata, resta al suo posto tutto il testo prima e dopo il punto modificato. Il tratto nuovo entra nella stessa
       istruzione di testo dell'originale, quindi con lo stesso carattere, corpo, colore, spaziatura tra le lettere e tra le
       parole e proporzione orizzontale; ciò che segue sulla riga scorre della differenza di larghezza, il resto della pagina
       non si muove di un punto. Se le righe sono cambiate di numero o lo stile è stato cambiato, vale il metodo di sempre. */
    const fontList = fonts.keys.map(k => fonts.get(k)).filter(F => F && F.ok);
    const fontByName = name => { const want = String(name || '').replace(/^[A-Z]{6}\+/, ''); return fontList.find(F => F.baseName === name) || fontList.find(F => F.name === want) || null; };
    const pieceFont = pc => { let F = pc.fontName ? fontByName(pc.fontName) : null; if (F && (F.bold !== !!pc.bold || F.italic !== !!pc.italic)) { const stem = famStem(F.name); F = fontList.find(G => G.bold === !!pc.bold && G.italic === !!pc.italic && famStem(G.name) === stem) || null; } return F; };
    const viewSize = g => { const s2 = g.show.gs, M = mul(mul([s2.Tfs * s2.Th, 0, 0, s2.Tfs, 0, 0], g.Tm), mul(s2.ctm, vt)); return Math.hypot(M[2], M[3]); };
    const POS = new Set(['Td', 'TD', 'Tm', 'T*', 'BT', 'ET', "'", '"']);
    const showPos = new Map(shows.map((s2, i) => [s2, i]));
    const continuous = (a, b2) => { if (!a || !b2 || b2.op === "'" || b2.op === '"') return false; for (let i = a.idx + 1; i < b2.idx; i++) if (POS.has(ops[i].op)) return false; return true; };
    function faithful(b) {
      const srcs = b.srcs || []; if (!srcs.length || !(b.pieces || []).length) return null;
      // le righe nuove (dall'impaginazione): pezzi con la stessa linea di base, da sinistra a destra
      const ps = b.pieces.filter(q => String(q.t || '').replace(/­/g, '')).slice().sort((x, y) => x.base - y.base || x.x - y.x), lines = [];
      for (const q of ps) { const L = lines[lines.length - 1]; if (L && Math.abs(L.base - q.base) < Math.max(1.5, q.size * 0.45)) L.ps.push(q); else lines.push({ base: q.base, ps: [q] }); }
      if (lines.length !== srcs.length) return null;
      const order = srcs.map((s2, i) => i).sort((x, y) => srcs[x].base - srcs[y].base), out = [];
      for (let k = 0; k < lines.length; k++) {
        const si = order[k], src = srcs[si], L = lines[k]; L.ps.sort((x, y) => x.x - y.x);
        if (L.ps.some(q => q.color || q.u || q.s || q.hl)) return null;
        const glyphs = matchLine(shows, vt, src).filter(g => !claimed.has(g));
        if (!glyphs.length || glyphs.some(g => !g.show.F || !g.show.F.readable || !g.show.gs.Tfs || !g.show.gs.Th || (g.show.gs.Tr & 3) === 3)) return null;
        if (!similar(glyphs.map(g => g.uni).join(''), src.text)) return null;
        // ordine nel contenuto = ordine sulla riga
        let px = -1e9; for (const g of glyphs) { const x = apply(vt, g.p0[0], g.p0[1])[0]; if (x < px - src.size * 0.5) return null; px = Math.max(px, x); }
        // testo nuovo della riga, con il pezzo (stile) di ogni carattere
        let text = ''; const own = [];
        L.ps.forEach((q, i) => { const t = String(q.t).replace(/­/g, ''); if (i) { const pv = L.ps[i - 1]; if (q.x - (pv.x + pv.w) > Math.max(0.6, q.size * 0.1)) { text += ' '; own.push(pv); } } for (const ch of t) { text += ch; for (let z = 0; z < ch.length; z++) own.push(q); } });
        // tratto iniziale e finale in comune (gli spazi non contano: in molti PDF non sono caratteri ma distanze)
        const N2 = glyphs.length, isSp = c => c === ' ' || c === ' ';
        let gi = 0, j = 0; const keptAt = new Map();
        for (;;) { while (j < text.length && isSp(text[j]) && !(gi < N2 && isSp(glyphs[gi].uni))) j++; while (gi < N2 && glyphs[gi].uni === '' ) break; if (gi >= N2 || j > text.length) break; const u = nfkc(glyphs[gi].uni); if (!u) break; if (isSp(u) && !(j < text.length && isSp(text[j]))) { keptAt.set(glyphs[gi], Math.min(j, text.length - 1)); gi++; continue; } if (nfkc(text.substr(j, u.length)) !== u) break; keptAt.set(glyphs[gi], j); gi++; j += u.length; }
        const gp = gi, jp = j;
        let ge = N2, je = text.length;
        for (;;) { while (je > jp && isSp(text[je - 1]) && !(ge > gp && isSp(glyphs[ge - 1].uni))) je--; if (ge <= gp) break; const u = nfkc(glyphs[ge - 1].uni); if (!u) break; if (isSp(u) && !(je > jp && isSp(text[je - 1]))) { keptAt.set(glyphs[ge - 1], Math.max(0, je - 1)); ge--; continue; } if (je - u.length < jp || nfkc(text.substr(je - u.length, u.length)) !== u) break; je -= u.length; ge--; keptAt.set(glyphs[ge], je); }
        // stile invariato: ogni carattere rimasto ha ancora il suo carattere e il suo corpo
        for (const [g, at] of keptAt) { const q = own[Math.max(0, Math.min(own.length - 1, at))]; if (!q) continue; const vs = viewSize(g); if (pieceFont(q) !== g.show.F || Math.abs(q.size - vs) > vs * 0.05 + 0.2) return null; }
        const mid = text.slice(jp, je), removed = glyphs.slice(gp, ge), suffix = glyphs.slice(ge), prefix = glyphs.slice(0, gp);
        if (!removed.length && !mid.trim()) { out.push({ si, keep: true, glyphs }); continue; }
        // il tratto nuovo: un solo carattere/corpo, lo stesso del punto in cui entra
        const mq = [...new Set(own.slice(jp, Math.max(jp, je)))]; let Fm = null;
        if (mid.trim()) { const fs = [...new Set(mq.map(pieceFont))]; if (fs.length !== 1 || !fs[0]) return null; Fm = fs[0]; }
        let anchor = null, where = 'before';
        if (removed.length) { anchor = removed[0]; if (Fm && anchor.show.F !== Fm) return null; }
        else if (suffix.length && (!Fm || suffix[0].show.F === Fm)) anchor = suffix[0];
        else if (prefix.length && (!Fm || prefix[prefix.length - 1].show.F === Fm)) { anchor = prefix[prefix.length - 1]; where = 'after'; }
        if (!anchor) return null;
        if (Fm && mq.length) { const vs = viewSize(anchor); if (mq.some(q => Math.abs(q.size - vs) > vs * 0.05 + 0.2)) return null; }
        out.push({ si, glyphs, prefix, removed, suffix, mid: where === 'after' && mid && !isSp(mid[0]) && prefix.length && text[jp - 1] === ' ' ? mid : mid, anchor, where, F: anchor.show.F });
      }
      return out;
    }
    const natPlans = [];
    for (const b of blocks) {
      let fp = null; try { fp = faithful(b); } catch (e) { console.warn('modifica fedele', e); fp = null; }
      if (!fp) continue;
      const r = { removed: fp.map(x => x.si), failed: [], missing: [], local: false, native: true, faithful: true };
      result.set(b.id, r); b._faithful = true;
      for (const pl of fp) { pl.glyphs.forEach(g => claimed.add(g)); if (!pl.keep) { pl.b = b; natPlans.push(pl); } }
    }
    for (const b of blocks) {
      if (b._faithful) continue;
      const r = { removed: [], failed: [], missing: [], local: false };
      result.set(b.id, r);
      (b.srcs || []).forEach((src, si) => {
        try {
          const glyphs = matchLine(shows, vt, src).filter(g => !claimed.has(g));
          let why = '';
          if (!glyphs.length) why = 'nessun glifo';
          else if (glyphs.some(g => !g.show.F || !g.show.F.readable || !g.show.gs.Tfs || !g.show.gs.Th)) why = 'font';
          else if (!similar(glyphs.map(g => g.uni).join(''), src.text) && glyphs.some(g => (g.show.gs.Tr & 3) !== 3)) why = 'testo diverso';
          if (why) { r.failed.push(si); return; }
          glyphs.forEach(g => { claimed.add(g); let m = mods.get(g.show); if (!m) mods.set(g.show, m = { remove: new Set() }); m.remove.add(g); });
          const visible = glyphs.some(g => (g.show.gs.Tr & 3) !== 3);
          if (!visible) { r.failed.push(si); return; } // testo invisibile (OCR): si toglie, ma l'immagine sotto va coperta
          if (!firstFill.has(b.id)) firstFill.set(b.id, glyphs.find(g => (g.show.gs.Tr & 3) !== 3).show.gs.fill);
          r.removed.push(si);
        } catch (e) { console.warn(e); r.failed.push(si); }
      });
    }
    // font per ciascun pezzo: quello del documento (anche nella variante grassetto/corsivo, se la pagina la usa), altrimenti uno standard
    const list = fonts.keys.map(k => fonts.get(k)).filter(F => F && F.ok);
    const byName = name => { const want = String(name || '').replace(/^[A-Z]{6}\+/, ''); return list.find(F => F.baseName === name) || list.find(F => F.name === want) || null; };
    const locals = new Map();
    const localFor = async F => {
      if (!localFont || !F) return null;
      if (locals.has(F)) return locals.get(F);
      let f = null;
      try { const lb = await localFont(F.name, F.fam, F.bold, F.italic); if (lb) { await need('fontkit'); if (window.fontkit && !pdfDoc.__fk) { pdfDoc.registerFontkit(window.fontkit); pdfDoc.__fk = true; } f = await pdfDoc.embedFont(lb, { subset: true }); } }
      catch (err) { console.warn('font locale non utilizzabile', F.name, err); }
      locals.set(F, f); return f;
    };
    const stdNeeded = new Set();
    const plans = [];
    for (const pl of natPlans) {
      const F = pl.F, std = stdFor(F.fam, F.bold, F.italic), text = pl.mid;
      pl.std = std; pl.local = text && missingChars(text, F, false).length ? await localFor(F) : null;
      pl.runs = text ? buildRuns(text, F, std, false, pl.local) : [];
      if (pl.runs.some(r => r.kind === 'std')) stdNeeded.add(std);
      const miss = pl.runs.filter(r => r.kind === 'std').flatMap(r => r.items.map(i => i.ch)).filter(c => c.trim()), R = result.get(pl.b.id);
      if (miss.length) R.missing.push(...miss);
      if (pl.runs.some(r => r.kind === 'local')) R.local = true;
    }
    for (const b of blocks) for (const p of b.pieces || []) {
      if (b._faithful) continue;
      const text = String(p.t || '').replace(/­/g, '');
      if (!text) continue;
      let F = p.fontName ? byName(p.fontName) : null;
      const bold = !!p.bold, italic = !!p.italic;
      if (F && (F.bold !== bold || F.italic !== italic)) {
        const stem = famStem(F.name);
        F = list.find(G => G.bold === bold && G.italic === italic && famStem(G.name) === stem) || null;
      }
      const fam = (F && F.fam) || p.fam || (p.fontName ? guessFont(p.fontName, '') : 'helv');
      const std = stdFor(fam, bold, italic);
      const local = F && missingChars(text, F, false).length ? await localFor(F) : null;
      const runs = buildRuns(text, F, std, !F, local);
      if (runs.some(r => r.kind === 'std')) stdNeeded.add(std);
      const miss = runs.filter(r => r.kind === 'std' && F).flatMap(r => r.items.map(i => i.ch)).filter(c => c.trim());
      const R = result.get(b.id);
      if (miss.length) R.missing.push(...miss);
      if (runs.some(r => r.kind === 'local')) R.local = true;
      plans.push({ b, p, F, std, runs, local });
    }
    const stdKeys = new Map();
    for (const name of stdNeeded) { const f = await pdfDoc.embedFont(name); stdKeys.set(name, page.node.newFontDictionary('OfStd', f.ref).decodeText()); }
    const localKeys = new Map();
    for (const f of locals.values()) if (f) localKeys.set(f, page.node.newFontDictionary('OfLoc', f.ref).decodeText());
    // via i glifi delle righe originali (le posizioni dei glifi che restano nella stessa istruzione non cambiano)
    const repl = new Map();
    // ruoli dei glifi nelle righe modificate in modo fedele
    const role = new Map();   // glifo → { drop } | { shift } ; ancora: { before: piano } | { after: piano }
    for (const pl of natPlans) {
      const a0 = pl.removed.length ? pl.removed[0] : null, a1 = pl.removed.length ? pl.removed[pl.removed.length - 1] : null;
      const dir = (() => { const g = pl.glyphs.find(x => Math.hypot(x.p1[0] - x.p0[0], x.p1[1] - x.p0[1]) > 1e-6) || pl.anchor; const l = Math.hypot(g.p1[0] - g.p0[0], g.p1[1] - g.p0[1]) || 1; return [(g.p1[0] - g.p0[0]) / l, (g.p1[1] - g.p0[1]) / l]; })();
      pl.oldSpan = a0 ? (a1.p1[0] - a0.p0[0]) * dir[0] + (a1.p1[1] - a0.p0[1]) * dir[1] : 0;
      for (const g of pl.removed) role.set(g, { drop: true, pl });
      for (const g of pl.suffix) role.set(g, { shift: pl });
      const ar = role.get(pl.anchor) || {}; ar[pl.where] = pl; role.set(pl.anchor, ar);
      for (const g of pl.glyphs) { if (!mods.has(g.show)) mods.set(g.show, { remove: new Set() }); }
    }
    const unitOf = s2 => { const g = s2.els.find(e => e.code != null); if (!g) return 0; const M = mul(g.Tm, s2.gs.ctm); return Math.hypot(M[0], M[1]); };
    let carry = 0, prevShow = null;
    for (const s of shows) {
      const m = mods.get(s), cont = continuous(prevShow, s), startCur = cont ? carry : 0;
      prevShow = s;
      if (!m && Math.abs(startCur) < 1e-4) { carry = 0; continue; }
      const gs = s.gs, two = s.F ? s.F.twoByte : false, sc = unitOf(s) || 1, k1000 = 1000 / (gs.Tfs * gs.Th || 1);
      if (!s.F || !gs.Tfs) { carry = 0; continue; }
      let out = '', cur = startCur;
      if (s.op === "'") out += 'T*\n';
      else if (s.op === '"') out += `${fmt(gs.Tw)} Tw ${fmt(gs.Tc)} Tc T*\n`;
      let elems = [], bytesRun = [];
      const flushStr = () => { if (bytesRun.length) { elems.push('<' + bytesRun.map(hex2).join('') + '>'); bytesRun = []; } };
      const flushTJ = () => { flushStr(); if (elems.length) out += '[' + elems.join(' ') + '] TJ\n'; elems = []; };
      const insert = pl => {
        if (!pl.runs.length) return;
        flushTJ();
        const r = emitRuns(pl.runs, s.F, gs, gs.Tfs, { std: stdKeys.get(pl.std), local: localKeys.get(pl.local) }, true);
        out += r.out;
        if (r.cur.key !== gs.font || r.cur.size !== gs.Tfs) out += `/${escName(gs.font)} ${fmt(gs.Tfs)} Tf\n`;
        cur += r.D * sc; pl.newSpan = r.D * sc;
      };
      const els = s.els;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (el.num != null) {
          // aggiustamento tra due glifi tolti del tratto cambiato: se ne va con loro
          let a2 = i - 1, b2 = i + 1; while (a2 >= 0 && els[a2].num != null) a2--; while (b2 < els.length && els[b2].num != null) b2++;
          if (a2 >= 0 && b2 < els.length && role.get(els[a2])?.drop && role.get(els[b2])?.drop) { cur += el.num / 1000 * gs.Tfs * gs.Th * sc; continue; }
          flushStr(); elems.push(fmt(el.num)); continue;
        }
        const ro = role.get(el);
        if (ro && ro.before) insert(ro.before);
        if (ro && ro.drop) { cur -= Math.hypot(el.p1[0] - el.p0[0], el.p1[1] - el.p0[1]); continue; }
        if (m && m.remove.has(el)) { flushStr(); elems.push(fmt(-(el.w + (gs.Tc + (!two && el.code === 32 ? gs.Tw : 0)) * 1000 / gs.Tfs))); continue; }
        // glifo che resta: dopo il tratto cambiato scorre della differenza di larghezza, altrove non si muove
        const want = ro && ro.shift ? (ro.shift.newSpan || 0) - ro.shift.oldSpan : 0;
        if (Math.abs(want - cur) > 1e-4) { flushStr(); elems.push(fmt(-(want - cur) / sc * k1000)); cur = want; }
        if (two) bytesRun.push(el.code >> 8, el.code & 255); else bytesRun.push(el.code);
        if (ro && ro.after) insert(ro.after);
      }
      flushTJ();
      repl.set(s.idx, out);
      carry = cur;
    }
    // contenuto aggiunto: si lavora nelle coordinate della vista (y verso il basso)
    let tail = `q\n${mat(ivt)} cm\n`;
    const rect = (x, y, w, h) => `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re f\n`;
    // coperture delle righe che non si sono potute togliere
    for (const b of blocks) { const R = result.get(b.id); for (const si of R.failed) { const c = b.srcs[si].cover; if (!c) continue;
      // ritaglio della scansione con le lettere tolte (disegnato com'è, dall'alto) oppure rettangolo del colore di fondo
      if (c.img) { try { const im = await pdfDoc.embedPng(c.img), nm = page.node.newXObject('OfPatch', im.ref); tail += `q ${fmt(c.w)} 0 0 ${fmt(-c.h)} ${fmt(c.x)} ${fmt(c.y + c.h)} cm ${nm} Do Q\n`; continue; } catch (e) { console.warn('ritaglio', e); } }
      tail += `${rgOp(c.color || '#FFFFFF')}\n` + rect(c.x, c.y, c.w, c.h); } }
    // evidenziatore (moltiplica, così sotto si legge quello che c'è)
    const hls = plans.filter(q => q.p.hl);
    if (hls.length) {
      let gsName = null;
      try {
        const egs = ctx.obj({ Type: 'ExtGState', BM: 'Multiply', ca: 1, CA: 1 });
        const res = page.node.Resources();
        let eg = look(ctx, res.get(N('ExtGState')));
        if (!(eg instanceof PDFDict)) { eg = ctx.obj({}); res.set(N('ExtGState'), eg); }
        gsName = 'OfHl' + Math.random().toString(36).slice(2, 7);
        eg.set(N(gsName), ctx.register(egs));
      } catch (e) { console.warn(e); }
      tail += 'q\n' + (gsName ? `/${gsName} gs\n` : '');
      for (const q of hls) { const p = q.p; tail += `${rgOp(p.hl)}\n` + rect(p.x - 0.4, p.base - p.size * 0.86, (p.hlw ?? p.w) + 0.8, p.size * 1.12); }
      tail += 'Q\n';
    }
    tail += 'BT\n';
    // le parole di una stessa riga con lo stesso stile vanno in un'unica istruzione, con lo spazio vero tra l'una e l'altra
    // (così il testo si copia e si cerca normalmente) e la distanza esatta dell'impaginazione
    const colorOf = q => q.p.color ? rgOp(q.p.color) : (q.p.fill != null ? (q.p.fill || '0 g') : (firstFill.get(q.b.id) || '0 g'));
    let prev = null, x = 0, curColor = null, curTc = 0, curTr = 0;
    for (const q of plans) {
      const { b, p, F, std, runs, local } = q;
      const color = colorOf(q);
      const gs = { font: F ? F.key : null, Tfs: p.size, Tc: p.ls || 0, Tw: 0, Th: 1 };
      const keys = { std: stdKeys.get(std), local: localKeys.get(local) };
      const same = prev && prev.b === b && Math.abs(prev.p.base - p.base) < 0.01 && prev.F === F && prev.std === std && prev.local === local && Math.abs(prev.p.size - p.size) < 0.001 && colorOf(prev) === color && (prev.p.ls || 0) === (p.ls || 0) && !!prev.p.inv === !!p.inv && p.x > x - 0.5;
      if (!same && (p.ls || 0) !== curTc) { tail += `${fmt(p.ls || 0)} Tc\n`; curTc = p.ls || 0; }
      if (!same && (p.inv ? 3 : 0) !== curTr) { tail += `${p.inv ? 3 : 0} Tr\n`; curTr = p.inv ? 3 : 0; } // testo invisibile: sopra il ritaglio della scansione, per cercare e copiare
      if (same) {
        const sp = emitRuns(buildRuns(' ', F, std, !F, local), F, gs, p.size, keys, false);
        let o = sp.out;
        x += sp.D;
        const adj = p.x - x;
        if (Math.abs(adj) > 0.001) o += `[${fmt(-adj * 1000 / p.size)}] TJ\n`;
        tail += o;
        x = p.x;
      } else {
        // cambia lo stile a metà riga: lo spazio tra le due parole resta un carattere vero
        if (prev && prev.b === b && Math.abs(prev.p.base - p.base) < 0.01 && p.x - x > p.size * 0.12) {
          const pgs = { font: prev.F ? prev.F.key : null, Tfs: prev.p.size, Tc: curTc, Tw: 0, Th: 1 };
          tail += emitRuns(buildRuns(' ', prev.F, prev.std, !prev.F, prev.local), prev.F, pgs, prev.p.size, { std: stdKeys.get(prev.std), local: localKeys.get(prev.local) }, false).out;
        }
        if (color !== curColor) { tail += color + '\n'; curColor = color; }
        tail += `${mat([1, 0, 0, -1, p.x, p.base])} Tm\n`;
        x = p.x;
      }
      const r = emitRuns(runs, F, gs, p.size, keys, false);
      tail += r.out; x += r.D;
      result.get(b.id).native = true;
      prev = q;
    }
    tail += 'ET\n';
    // sottolineato e barrato
    for (const q of plans) {
      const p = q.p; if (!p.u && !p.s) continue;
      const color = p.color ? rgOp(p.color) : (p.fill != null ? (p.fill || '0 g') : (firstFill.get(q.b.id) || '0 g'));
      const th = Math.max(0.4, p.size * 0.055), w = p.uw ?? p.w;
      tail += color + '\n';
      if (p.u) tail += rect(p.x, p.base + p.size * 0.11, w, th);
      if (p.s) tail += rect(p.x, p.base - p.size * 0.28, w, th);
    }
    tail += 'Q\n';
    const pieces = [asciiBytes('q\n')]; let pos = 0;
    ops.forEach((o, idx) => { if (repl.has(idx)) { pieces.push(bytes.subarray(pos, o.start), asciiBytes(repl.get(idx))); pos = o.end; } });
    pieces.push(bytes.subarray(pos), asciiBytes('\nQ\n' + tail));
    let len = 0; pieces.forEach(x => len += x.length);
    const out = new Uint8Array(len); let o = 0; pieces.forEach(x => { out.set(x, o); o += x.length; });
    page.node.set(N('Contents'), ctx.obj([ctx.register(ctx.flateStream(out))]));
    for (const F of fonts.cache.values()) if (F) patchFont(ctx, F);
    return result;
  }

  return { glyphUni, ENCODINGS: { WinAnsiEncoding: WIN, MacRomanEncoding: MAC, StandardEncoding: STDENC }, parseContent, pageContent, pageFonts, interpret, makeFont, parseTT, streamBytes, collectUsage, applyEdits, applyBlocks, matchLine, latin1, asciiBytes, look, num, nm, arr, mul, apply, inv, fmt };
})();

/* =====================================================================
   Testi per i motori di ricerca: indirizzo, titolo e descrizione di ogni pagina,
   «come funziona» e domande frequenti (mostrati anche nella pagina, sotto il riquadro di caricamento)
   ===================================================================== */
const SEO = (() => {
  const NAME = 'file360';
  const HOME = {
    title: 'Strumenti PDF online gratis e senza limiti · file360',
    desc: 'Unisci, comprimi, modifica e converti PDF in Word ed Excel. OCR, PDF/A, P7M, fatture XML e bilanci XBRL. Gratis, senza limiti e senza registrazione.',
    why: [
      ['shield', 'I file non vengono caricati', 'Ogni operazione avviene nel browser che stai usando, su computer o telefono. Nessun server riceve i documenti: puoi lavorare anche su contratti, buste paga e dati sanitari.'],
      ['layers', 'Un documento, tanti strumenti', 'Apri un PDF una volta e passa da uno strumento all’altro: modifichi, riordini, comprimi e converti mantenendo ogni versione, con la possibilità di tornare indietro.'],
      ['seal', 'Anche i formati del Fisco', 'Fatture elettroniche XML e P7M, bilanci XBRL, PDF/A per PEC e processo telematico: i file di tutti i giorni di chi lavora con la pubblica amministrazione.'],
    ],
    faq: [
      ['file360 è davvero gratis?', 'Sì: tutti gli strumenti sono gratuiti e senza limiti di file o di utilizzo, senza registrazione.'],
      ['I miei documenti vengono caricati su un server?', 'No. file360 elabora i file direttamente nel browser, senza inviarli a un server. Per questo puoi usarlo anche con documenti riservati.'],
      ['Serve registrarsi o installare qualcosa?', 'No. Basta aprire la pagina dal browser, su computer, tablet o telefono. Non servono account né programmi da installare.'],
      ['Quali browser sono supportati?', 'Le versioni recenti di Chrome, Edge, Firefox e Safari, su Windows, macOS, Linux, Android e iPhone.'],
      ['Posso usare lo stesso documento con più strumenti?', 'Sì. Il PDF che apri diventa il documento attivo: puoi modificarlo, riordinarne le pagine, comprimerlo e convertirlo senza ricaricarlo, e scaricare la versione finale quando hai finito.'],
      ['Quali strumenti ci sono per commercialisti e studi?', 'Visualizzatore di fatture elettroniche XML e P7M con registro in Excel, apertura dei file firmati .p7m con verifica della firma, bilanci XBRL in PDF ed Excel e conversione in PDF/A.'],
      ['Che cosa conta il contatore dei documenti?', 'Solo quanti file vengono aperti: il sito invia un numero, senza nomi, contenuti o dati personali. I documenti restano nel tuo browser.', 'site'],
      ['Funziona con le scansioni?', 'Sì. Il riconoscimento del testo (OCR) rende ricercabili e copiabili le scansioni e le foto dei documenti, e permette di convertirle in Word o in Excel e di oscurarne i dati personali.'],
    ],
  };
  const P = {
    unisci: {
      slug: 'unire-pdf', title: 'Unire PDF online gratis, anche con immagini',
      desc: 'Unisci più PDF e immagini in un unico file, nell’ordine che vuoi. Gratis e senza limiti, senza registrazione né upload su server. Trascina i file e inizia.',
      h1: 'Unisci PDF', h2: 'Come unire due o più PDF in un unico file', rel: ["comprimi", "ordina", "numeri"],
      steps: ['Trascina i PDF (e, se vuoi, foto JPG o PNG) nel riquadro.', 'Riordinali trascinandoli o con le frecce.', 'Premi «Unisci» e scarica il PDF unico.'],
      faq: [
        ['Come unisco due PDF in uno solo?', 'Trascina i due file nel riquadro, mettili nell’ordine giusto trascinandoli o con le frecce e premi «Unisci»: scarichi subito un unico PDF. Funziona allo stesso modo con tre, dieci o cinquanta file.'],
        ['Posso unire i PDF dal telefono?', 'Sì: dal browser di Android o iPhone scegli i PDF (e, se vuoi, le foto) dalla memoria del telefono, riordinali e scarica il PDF unico. Non serve installare app.'],
        ['Posso unire PDF e immagini insieme?', 'Sì: JPG, PNG, HEIC e le altre immagini diventano pagine del PDF, nella posizione che scegli.'],
        ['C’è un limite al numero di file?', 'No, il limite è solo la memoria del dispositivo. Anche decine di documenti si uniscono in pochi secondi.'],
        ['I segnalibri e la qualità restano uguali?', 'Le pagine vengono copiate così come sono, senza ricompressione: testo, immagini e qualità non cambiano.'],
      ],
    },
    immagini: {
      slug: 'jpg-in-pdf', title: 'JPG in PDF: converti foto, PNG e HEIC gratis',
      desc: 'Trasforma foto JPG, PNG e HEIC dell’iPhone in un PDF ordinato, con formato pagina e margini a scelta. Gratis e senza limiti. Scegli le foto e crea il PDF.',
      h1: 'JPG in PDF', h2: 'Come trasformare foto e immagini in un PDF', rel: ["unisci", "comprimi", "ocr"],
      steps: ['Scegli o scatta le foto, anche più di una.', 'Ordina le pagine e scegli formato, orientamento e margini.', 'Crea il PDF e scaricalo.'],
      faq: [
        ['Posso mettere più foto in un unico PDF?', 'Sì: scegli tutte le foto insieme, ordinale trascinandole e ottieni un solo PDF con una foto per pagina, nel formato e con i margini che preferisci.'],
        ['Come converto in PDF una foto HEIC dell’iPhone?', 'Scegli la foto dalla galleria o trascinala nel riquadro: il formato HEIC viene letto direttamente, senza convertirlo prima in JPG, e l’orientamento viene rispettato.'],
        ['Le foto HEIC dell’iPhone sono supportate?', 'Sì, insieme a JPG, PNG, TIFF multipagina, WebP, GIF e BMP. L’orientamento della foto viene rispettato.'],
        ['Posso fare un PDF dalle foto del telefono?', 'Sì: dal telefono puoi scegliere le foto dalla galleria o scattarle al momento, e ottenere subito il PDF.'],
        ['Le immagini perdono qualità?', 'No: le foto vengono inserite alla risoluzione originale, a meno che tu non scelga di ridurne il peso.'],
      ],
    },
    dividi: {
      slug: 'dividere-pdf', title: 'Dividere PDF ed estrarre pagine gratis',
      desc: 'Dividi un PDF in più file: ogni pagina, ogni N pagine, per intervalli, o estrai solo le pagine che ti servono. Gratis e senza limiti. Prova ora.',
      h1: 'Dividi PDF', h2: 'Come dividere un PDF o estrarre solo alcune pagine', rel: ["ordina", "unisci"],
      steps: ['Apri il PDF da dividere.', 'Scegli come dividerlo: ogni pagina, ogni N pagine, per intervalli o selezionando le pagine.', 'Scarica i file ottenuti, anche tutti insieme in un archivio ZIP.'],
      faq: [
        ['Come salvo una sola pagina di un PDF?', 'Seleziona la pagina nelle anteprime (o scrivi il suo numero negli intervalli) e scarica: ottieni un nuovo PDF con quella sola pagina, mentre l’originale resta intatto.'],
        ['Posso dividere un PDF ogni 2 o ogni 10 pagine?', 'Sì: con «Ogni N» scegli il numero di pagine per file e ottieni tanti file quanti servono, scaricabili tutti insieme in un archivio ZIP.'],
        ['Posso estrarre solo alcune pagine?', 'Sì: selezionale nelle anteprime o scrivi gli intervalli (per esempio 1-3, 7, 10-12) per ottenere un nuovo PDF con quelle pagine.'],
        ['Come ricevo i file divisi?', 'Un solo file si scarica direttamente; più file arrivano in un archivio ZIP con i nomi in ordine.'],
        ['Il PDF originale viene modificato?', 'No: il documento di partenza resta intatto e ottieni nuovi file.'],
      ],
    },
    comprimi: {
      slug: 'comprimere-pdf', title: 'Comprimere PDF: riduci la dimensione gratis',
      desc: 'Riduci il peso dei PDF per email, PEC e portali con 4 livelli di compressione e confronta il peso prima e dopo. Gratis e senza limiti. Prova ora.',
      h1: 'Comprimi PDF', h2: 'Come ridurre la dimensione di un PDF per email e PEC', rel: ["pdfa", "dividi", "unisci"],
      steps: ['Trascina uno o più PDF.', 'Scegli il livello: senza perdita, consigliata, forte o massima.', 'Confronta il peso prima e dopo e scarica.'],
      faq: [
        ['Perché il mio PDF è così pesante?', 'Quasi sempre per le immagini: scansioni e foto ad alta risoluzione occupano molto spazio. Un PDF di solo testo è già leggero, mentre una scansione può ridursi molto con i livelli «Consigliata», «Forte» o «Massima».'],
        ['Il PDF è ancora troppo grande per il portale: cosa posso fare?', 'Prova il livello «Forte» o «Massima» e controlla il peso indicato prima e dopo. Se il limite è molto basso, puoi anche dividere il documento in più parti con «Dividi PDF».'],
        ['Quanto si riduce un PDF?', 'Dipende dal contenuto: le scansioni e i PDF con molte foto si riducono molto; quelli di solo testo sono già leggeri e cambiano poco.'],
        ['Il testo resta selezionabile?', 'Con il livello «Senza perdita» sì: testo e qualità restano identici. Negli altri livelli le pagine diventano immagini; se ti serve il testo, passa poi il file all’OCR.'],
        ['Posso comprimere un PDF per inviarlo via PEC?', 'Sì: il livello «Consigliata» (150 dpi) è pensato per email e PEC; per i portali con limiti stretti c’è «Massima».'],
      ],
    },
    modifica: {
      slug: 'modificare-pdf', title: 'Modificare PDF online gratis: testo e firma',
      desc: 'Correggi il testo di un PDF come in Word, aggiungi testo, immagini, firma ed evidenziazioni. Editor gratis e senza limiti, senza account. Apri il PDF.',
      h1: 'Modifica PDF', h2: 'Come modificare il testo di un PDF e aggiungere una firma', rel: ["moduli", "oscura", "word"],
      steps: ['Apri il PDF da modificare.', 'Fai clic sul testo per riscriverlo, oppure aggiungi testo, immagini, firma e forme.', 'Salva e scarica il PDF modificato.'],
      faq: [
        ['Come scrivo su un PDF?', 'Apri il PDF e aggiungi un testo nel punto dove vuoi scrivere; per correggere una frase già presente fai clic sulla riga e riscrivila. Poi salva e scarica.'],
        ['Posso modificare un PDF senza Adobe Acrobat?', 'Sì: l’editor funziona nel browser, su computer e telefono, senza installare programmi e senza account.'],
        ['Posso cambiare il testo già scritto nel PDF?', 'Sì: fai clic su una riga e riscrivila. Il carattere, la dimensione e il colore originali vengono mantenuti il più possibile.'],
        ['Posso firmare un PDF?', 'Sì: disegna la firma o ricavala dalla foto di una firma su carta, poi posizionala dove serve. Per una firma digitale con valore legale serve invece il dispositivo di firma.'],
        ['Funziona anche con i PDF scansionati?', 'Sulle scansioni puoi aggiungere testo, immagini e firme; per riscrivere il testo esistente, la pagina si riconosce prima con l’OCR, con un clic.'],
      ],
    },
    ruota: {
      slug: 'ruotare-pdf', title: 'Ruotare PDF: gira le pagine e salva gratis',
      desc: 'Ruota una pagina, quelle selezionate o tutto il PDF e salvalo nel verso giusto, senza perdere qualità. Gratis e senza limiti. Apri il PDF e ruotalo.',
      h1: 'Ruota PDF', h2: 'Come ruotare un PDF e salvarlo nel verso giusto', rel: ["ordina", "ocr"],
      steps: ['Apri il PDF.', 'Ruota le pagine una per una, quelle selezionate o tutte insieme.', 'Salva il PDF con le pagine nel verso giusto.'],
      faq: [
        ['Come giro un PDF e lo salvo così?', 'Ruota le pagine con le frecce e salva: il PDF scaricato si apre già nel verso giusto in qualsiasi programma, non solo qui.'],
        ['Posso ruotare una sola pagina?', 'Sì: ogni pagina ha i suoi pulsanti di rotazione, oppure selezionane alcune e ruotale insieme.'],
        ['La rotazione resta salvata?', 'Sì: il PDF scaricato si apre già con le pagine nel verso giusto in qualsiasi programma.'],
        ['La qualità cambia?', 'No: la rotazione non ricomprime le pagine.'],
        ['Posso ruotare solo le pagine pari o dispari?', 'Sì: seleziona in un clic le pagine pari, le dispari o tutte, poi ruotale a destra o a sinistra. È comodo per le scansioni fronte-retro.'],
      ],
    },
    ordina: {
      slug: 'eliminare-pagine-pdf', title: 'Eliminare pagine PDF e riordinarle gratis',
      desc: 'Elimina le pagine che non servono, riordinale trascinandole, duplicale o aggiungi pagine bianche. Gratis e senza limiti, senza registrazione. Apri il PDF.',
      h1: 'Elimina e riordina pagine PDF', h2: 'Come eliminare, spostare e aggiungere pagine in un PDF', rel: ["dividi", "unisci", "ruota"],
      steps: ['Apri il PDF.', 'Trascina le anteprime per riordinarle, elimina, duplica o inserisci pagine bianche.', 'Salva il nuovo PDF.'],
      faq: [
        ['Come sposto una pagina in un PDF?', 'Trascina l’anteprima della pagina nella nuova posizione: le altre si spostano da sole. Quando l’ordine è giusto, salva il nuovo PDF.'],
        ['Posso eliminare più pagine insieme?', 'Sì: selezionale nelle anteprime e premi elimina una volta sola.'],
        ['Come elimino una pagina da un PDF?', 'Selezionala nelle anteprime e premi elimina; puoi rimuoverne anche più di una alla volta.'],
        ['Posso aggiungere una pagina bianca?', 'Sì, nel punto che preferisci, con lo stesso formato delle pagine vicine.'],
        ['Posso tornare all’ordine di partenza?', 'Sì: «Ripristina ordine originale» annulla gli spostamenti; dopo il salvataggio le versioni precedenti del documento restano disponibili.'],
      ],
    },
    numeri: {
      slug: 'numerare-pagine-pdf', title: 'Numerare pagine PDF online gratis',
      desc: 'Aggiungi i numeri di pagina a un PDF («Pagina 1 di 12», «Pag. 1»), intestazione e piè di pagina, con anteprima dal vivo. Gratis e senza limiti. Prova ora.',
      h1: 'Numera pagine PDF', h2: 'Come inserire i numeri di pagina in un PDF', rel: ["unisci", "pdfa"],
      steps: ['Apri il PDF.', 'Scegli posizione, formato e prima pagina da numerare; aggiungi intestazione e calce.', 'Controlla l’anteprima e scarica.'],
      faq: [
        ['Posso iniziare la numerazione da un numero diverso da 1?', 'Sì: scegli il numero da cui iniziare a contare e le pagine da numerare, per esempio per continuare la numerazione di un altro documento o saltare la copertina.'],
        ['Posso escludere la copertina?', 'Sì: puoi escludere la prima pagina, scegliere l’intervallo di pagine e il numero da cui iniziare a contare.'],
        ['Quali formati di numerazione ci sono?', '«Pagina 1», «Pagina 1 di 12», «Pag. 1» o un formato personalizzato, in sei posizioni, con carattere, dimensione e colore a scelta.'],
        ['Posso aggiungere un’intestazione con il nome dello studio?', 'Sì: intestazione e piè di pagina accettano testo libero, a sinistra, al centro o a destra.'],
      ],
    },
    ocr: {
      slug: 'ocr-pdf', title: 'OCR PDF gratis: scansioni ricercabili',
      desc: 'Riconosci il testo di PDF scansionati e foto: il documento diventa ricercabile e copiabile, con correzione dell’italiano. Gratis e senza limiti. Prova ora.',
      h1: 'OCR PDF', h2: 'Come rendere ricercabile un PDF scansionato', rel: ["word", "excel", "oscura"],
      steps: ['Carica la scansione o la foto del documento.', 'Scegli la lingua e la qualità del riconoscimento.', 'Scarica il PDF ricercabile, identico all’originale ma con il testo selezionabile.'],
      faq: [
        ['Come copio il testo da un PDF scansionato?', 'Passa la scansione all’OCR: il PDF che scarichi ha lo stesso aspetto dell’originale ma il testo si può selezionare, copiare e cercare. Se ti serve un documento da modificare, usa «PDF in Word».'],
        ['Funziona con le foto dei documenti fatte col telefono?', 'Sì: puoi caricare anche immagini JPG, PNG o HEIC; pagine storte o capovolte vengono raddrizzate prima del riconoscimento.'],
        ['Quali lingue riconosce?', 'Italiano, inglese, francese, tedesco e spagnolo, anche insieme nello stesso documento.'],
        ['Le pagine storte o capovolte vengono corrette?', 'Sì: l’orientamento e l’inclinazione vengono rilevati e corretti prima del riconoscimento.'],
        ['La scansione viene inviata a un servizio esterno?', 'No: il riconoscimento avviene nel browser. La prima volta viene scaricato solo il modello della lingua.'],
      ],
    },
    word: {
      slug: 'pdf-in-word', title: 'PDF in Word gratis: convertire in DOCX',
      desc: 'Converti PDF e scansioni in un Word modificabile, con tabelle, stili e immagini al loro posto. Gratis e senza limiti, senza registrazione. Prova ora.',
      h1: 'PDF in Word', h2: 'Come convertire un PDF in Word modificabile', rel: ["ocr", "excel"],
      steps: ['Apri il PDF o la scansione.', 'Avvia la conversione: le scansioni vengono prima riconosciute con l’OCR.', 'Scarica il file .docx e modificalo in Word, LibreOffice o Google Documenti.'],
      faq: [
        ['Come trasformo un PDF in un Word modificabile gratis?', 'Apri il PDF, avvia la conversione e scarica il file .docx: lo modifichi in Word, LibreOffice o Google Documenti. Il servizio è gratuito e senza limiti di utilizzo.'],
        ['La formattazione resta uguale?', 'Paragrafi, tabelle, stili e immagini vengono ricostruiti al loro posto; nei layout molto elaborati (colonne, grafiche sovrapposte) può servire qualche ritocco nel documento Word.'],
        ['Le tabelle restano tabelle?', 'Sì: righe e colonne vengono ricostruite come tabelle di Word, modificabili come quelle scritte a mano.'],
        ['Posso convertire un PDF scansionato in Word?', 'Sì: il testo della scansione viene riconosciuto con l’OCR e diventa testo modificabile.'],
        ['Loghi e firme vengono mantenuti?', 'Sì: restano immagini che puoi spostare o eliminare nel documento Word.'],
      ],
    },
    pdfa: {
      slug: 'pdf-in-pdf-a', title: 'Convertire PDF in PDF/A gratis (1b e 2b)',
      desc: 'Crea PDF/A-1b o PDF/A-2b per Registro imprese, PEC, processo telematico e conservazione, con verifica di conformità. Gratis e senza limiti. Converti ora.',
      h1: 'Converti PDF in PDF/A', h2: 'Come trasformare un PDF in PDF/A-1b o PDF/A-2b', rel: ["verificapdfa", "comprimi", "firme"],
      steps: ['Trascina uno o più PDF.', 'Scegli la versione: PDF/A-1b o PDF/A-2b.', 'Controlla la verifica di conformità pagina per pagina e scarica i PDF/A.'],
      faq: [
        ['Che differenza c’è tra PDF e PDF/A?', 'Il PDF/A è un PDF «autosufficiente» pensato per durare nel tempo: incorpora caratteri e colori e non può dipendere da elementi esterni. Per questo lo chiedono la conservazione digitale e molti portali pubblici.'],
        ['Che cos’è il PDF/A?', 'È la versione del PDF pensata per la conservazione a lungo termine: incorpora i caratteri e i colori e non dipende da elementi esterni.'],
        ['Quale versione scegliere?', 'PDF/A-1b è la più accettata dai portali pubblici; PDF/A-2b consente trasparenze e una compressione migliore.'],
        ['Va bene per il deposito telematico?', 'Sì: il formato prodotto è quello richiesto per gli atti del processo telematico e per molti portali della pubblica amministrazione.'],
      ],
    },
    moduli: {
      slug: 'pdf-compilabile', title: 'PDF compilabile: crea e compila moduli gratis',
      desc: 'Compila un modulo PDF o rendilo compilabile: caselle e campi vengono riconosciuti da soli, anche nelle scansioni. Gratis e senza limiti. Apri il modulo.',
      h1: 'Compila un PDF o rendilo compilabile', h2: 'Come compilare un modulo PDF o renderlo compilabile', rel: ["modifica", "pdfa"],
      steps: ['Apri il modulo PDF: gli spazi da compilare vengono trovati da soli.', 'Controlla i campi trovati, poi compilali, anche con i tuoi dati salvati.', 'Scarica il modulo compilato, da inviare o ancora modificabile.'],
      faq: [
        ['Come compilo un PDF che non ha campi?', 'Aprilo qui: linee, caselle e riquadri vengono riconosciuti e trasformati in campi. Controlli quelli trovati, li compili e scarichi il modulo, da inviare o ancora modificabile.'],
        ['Posso salvare il modulo dopo averlo compilato?', 'Sì: scarichi il PDF con i dati inseriti, pronto da stampare o inviare. Se scegli «Ancora modificabile», chi lo riceve può correggere i campi.'],
        ['Come vengono trovati i campi?', 'Linee, caselle, riquadri e spazi dopo le etichette vengono riconosciuti in automatico e collegati al testo vicino, che diventa il nome del campo.'],
        ['Posso compilare un PDF che ha già i campi?', 'Sì: i moduli compilabili si aprono pronti da compilare, salvare e stampare.'],
        ['Funziona con un modulo scansionato?', 'Sì: anche sulle scansioni vengono riconosciuti linee e caselle da compilare.'],
      ],
    },
    firme: {
      slug: 'aprire-file-p7m', title: 'Aprire file P7M e verificare la firma gratis',
      desc: 'Apri i file .p7m (anche .tsd e .m7m), estrai il PDF e verifica chi ha firmato e quando. Senza programmi di firma, gratis e senza limiti. Trascina il file.',
      h1: 'Apri file P7M e verifica la firma', h2: 'Come aprire un file P7M e convertirlo in PDF', rel: ["fatture", "pdfa", "xbrl"],
      steps: ['Trascina il file .p7m, .tsd, .m7m o il PDF firmato.', 'Leggi i firmatari, la data della firma e il certificato.', 'Apri o scarica il documento contenuto.'],
      faq: [
        ['Come converto un file P7M in PDF?', 'Trascina il file .p7m nel riquadro: il documento firmato viene estratto e puoi aprirlo o scaricarlo. Con un file .pdf.p7m ottieni direttamente il PDF originale.'],
        ['Il PDF estratto ha ancora valore legale?', 'La firma digitale vale per il file .p7m: il PDF estratto è una copia da leggere e stampare. Conserva sempre anche il file .p7m originale, insieme al rapporto di verifica se ti serve.'],
        ['Che cos’è un file P7M?', 'È un documento firmato digitalmente in formato CAdES: contiene il file originale (spesso un PDF) insieme alla firma e al certificato di chi ha firmato.'],
        ['Posso aprire un .p7m senza programmi di firma?', 'Sì: il documento viene estratto nel browser e puoi leggerlo, stamparlo o salvarlo come PDF.'],
        ['Viene controllata anche la marca temporale?', 'Sì: vengono verificate più firme nello stesso file, le controfirme e le marche temporali, anche nei file .tsd e .m7m. Puoi scaricare il rapporto di verifica in PDF.'],
      ],
    },
    xbrl: {
      slug: 'bilancio-xbrl-in-pdf', title: 'Bilancio XBRL in PDF ed Excel: aprilo gratis',
      desc: 'Apri il bilancio XBRL (anche .xbrl.p7m) e ottieni un PDF leggibile con stato patrimoniale, conto economico e nota integrativa, più Excel e CSV. Gratis.',
      h1: 'Bilancio XBRL in PDF ed Excel', h2: 'Come aprire e leggere un bilancio XBRL', rel: ["firme", "fatture", "excel"],
      steps: ['Trascina il file .xbrl, anche firmato .xbrl.p7m.', 'Controlla i prospetti ricostruiti con le voci della tassonomia.', 'Scarica il PDF, il CSV o il file Excel.'],
      faq: [
        ['Come si apre un file XBRL?', 'Il file .xbrl è un XML pensato per i computer, non per la lettura. Trascinalo qui: viene ricostruito il bilancio con i prospetti e le voci della tassonomia, da leggere, stampare in PDF o esportare in Excel.'],
        ['Il mio bilancio finisce in .xbrl.p7m: posso aprirlo?', 'Sì: la busta di firma viene rimossa automaticamente e il bilancio si legge come un normale file .xbrl.'],
        ['Quali tassonomie sono supportate?', 'Le tassonomie del bilancio d’esercizio italiano usate per il deposito al Registro delle imprese, comprese le versioni precedenti.'],
        ['Posso analizzare il bilancio in Excel?', 'Sì: il foglio «Bilancio» riporta ogni voce con l’esercizio e l’esercizio precedente, pronti per i calcoli, più tutti i dati per sezione.'],
        ['Viene inclusa la nota integrativa?', 'Sì: le tabelle e i testi della nota integrativa sono riportati nel PDF.'],
      ],
    },
    excel: {
      slug: 'pdf-in-excel', title: 'PDF in Excel gratis: tabelle e importi',
      desc: 'Estrai le tabelle di un PDF in Excel: colonne riconosciute anche senza linee, importi e date come numeri, scansioni lette con l’OCR. Gratis e senza limiti.',
      h1: 'PDF in Excel', h2: 'Come convertire un PDF in Excel mantenendo le tabelle', rel: ["ocr", "word"],
      steps: ['Apri il PDF con le tabelle (estratti conto, listini, report).', 'Controlla righe e colonne riconosciute.', 'Scarica il file .xlsx, con importi e date pronti per i calcoli.'],
      faq: [
        ['Come converto un estratto conto PDF in Excel?', 'Apri l’estratto conto e scegli «Tutto in un foglio»: le pagine finiscono una sotto l’altra, le intestazioni ripetute compaiono una volta sola e importi e date diventano numeri e date di Excel.'],
        ['Gli importi diventano numeri?', 'Sì: «1.234,56 €» diventa il numero 1234,56 e le date diventano date di Excel, pronte per somme e filtri.'],
        ['Funziona con un PDF scansionato?', 'Sì: le scansioni vengono riconosciute con l’OCR prima di ricostruire le tabelle.'],
        ['Le tabelle su più pagine vengono unite?', 'Sì: con «Tutto in un foglio» le pagine vanno una sotto l’altra e le intestazioni ripetute compaiono una volta sola, ideale per estratti conto ed elenchi lunghi.'],
      ],
    },
    fatture: {
      slug: 'fattura-elettronica-pdf', title: 'Fattura elettronica XML e P7M in PDF gratis',
      desc: 'Visualizza e converti in PDF le fatture elettroniche XML e P7M, anche ZIP del cassetto fiscale o cartelle intere. Registro in Excel. Gratis e senza limiti.',
      h1: 'Visualizzatore fatture elettroniche', h2: 'Come aprire una fattura elettronica XML e convertirla in PDF', rel: ["firme", "pdfa", "unisci"],
      steps: ['Trascina le fatture XML o P7M, uno ZIP o un’intera cartella.', 'Cerca, filtra e ordina le fatture nel registro.', 'Scarica i PDF, gli allegati o il registro in Excel.'],
      faq: [
        ['Come apro una fattura elettronica XML?', 'Trascina il file .xml (o .xml.p7m) nel riquadro: la fattura si apre già impaginata, nel layout del foglio di stile dell’Agenzia delle Entrate o in quello esteso, e la scarichi in PDF.'],
        ['Posso convertire in PDF tutte le fatture del cassetto fiscale insieme?', 'Sì: trascina lo ZIP scaricato dal cassetto fiscale o un’intera cartella. Ottieni il registro con tutte le fatture, da cui scaricare i PDF, gli allegati e l’Excel.'],
        ['Posso aprire una fattura .xml.p7m?', 'Sì: la busta di firma viene rimossa automaticamente e la fattura si legge come le altre.'],
        ['Che layout ha il PDF?', 'Puoi scegliere il layout del foglio di stile ufficiale dell’Agenzia delle Entrate oppure un layout esteso, più leggibile, con tutti i dati della fattura.'],
        ['Posso esportare le fatture in Excel?', 'Sì: un foglio con il registro delle fatture e uno con le singole righe, con imponibili, IVA e totali.'],
      ],
    },
    assistente: {
      slug: 'preparare-pdf-pec-portali', title: 'Preparare un PDF per PEC, portali e stampa',
      desc: 'Dici cosa ti serve (PEC, portale con limite di peso, stampa, archivio) e file360 sceglie i passaggi: raddrizza, comprime, rende ricercabile, converte in PDF/A.',
      h1: 'Fai tutto tu', h2: 'Come preparare un PDF per PEC, portali e stampa in un passaggio', rel: ['comprimi', 'pdfa', 'ocr'],
      steps: ['Carica uno o più PDF.', 'Scegli l’obiettivo (PEC, portale, email, stampa, archivio) o scrivilo con parole tue.', 'Controlla i passaggi proposti e scarica il risultato.'],
      faq: [
        ['Che cosa fa «Fai tutto tu»?', 'Guarda il documento (scansioni, pagine storte, peso, firme) e, in base all’obiettivo, sceglie da solo i passaggi giusti: raddrizzare, rendere ricercabile, comprimere, convertire in PDF/A, togliere i metadati.'],
        ['Posso chiedere un PDF sotto 1 MB per un portale?', 'Sì: scrivi per esempio «portale, massimo 1 MB» e la compressione si regola per stare nel limite mantenendo il testo leggibile.'],
        ['Posso salvare i passaggi come ricetta?', 'Sì: una sequenza usata spesso si salva come ricetta e si riapplica con un clic.'],
      ],
    },
    immaginipdf: {
      slug: 'pdf-in-jpg', title: 'PDF in JPG e PNG: pagine e immagini contenute',
      desc: 'Converti le pagine di un PDF in JPG, PNG, WebP o TIFF alla risoluzione che vuoi, oppure estrai le foto, il testo e gli allegati contenuti nel PDF. Gratis.',
      h1: 'PDF in immagini', h2: 'Come trasformare un PDF in immagini JPG o PNG', rel: ['immagini', 'comprimi', 'dividi'],
      steps: ['Apri il PDF.', 'Scegli cosa ottenere: pagine come immagini, immagini contenute, testo o allegati.', 'Scegli formato e risoluzione e scarica.'],
      faq: [
        ['Come salvo una pagina di un PDF come JPG?', 'Seleziona la pagina, scegli JPG e la risoluzione (per esempio 150 o 300 dpi) e scarica l’immagine.'],
        ['Posso estrarre le foto originali da un PDF?', 'Sì: con «Immagini» le foto contenute vengono estratte nel loro formato originale, senza ricompressione.'],
        ['Quali formati sono disponibili?', 'JPG, PNG, WebP e TIFF, da 72 a 600 dpi.'],
      ],
    },
    impagina: {
      slug: 'impaginare-pdf', title: 'Impaginare PDF: A4, più pagine per foglio, libretto',
      desc: 'Porta tutte le pagine in A4, metti 2, 4 o 9 pagine per foglio, crea un libretto da piegare, aggiungi o togli margini, dividi le scansioni a doppia pagina. Gratis.',
      h1: 'Impagina PDF', h2: 'Come cambiare formato e impaginazione delle pagine di un PDF', rel: ['ordina', 'numeri', 'dividi'],
      steps: ['Apri il PDF.', 'Scegli: formato uniforme, più pagine per foglio, libretto, margini o divisione delle pagine doppie.', 'Controlla l’anteprima e scarica.'],
      faq: [
        ['Come stampo due pagine per foglio?', 'Scegli «Più pagine per foglio» e 2: ottieni un PDF con due pagine affiancate su ogni foglio, pronto da stampare.'],
        ['Posso creare un libretto da piegare?', 'Sì: le pagine vengono riordinate per la stampa fronte e retro, così piegando i fogli si legge in ordine.'],
        ['Come porto tutte le pagine in A4?', 'Con «Formato uniforme» ogni pagina viene adattata all’A4 (o al formato scelto) senza deformarla.'],
      ],
    },
    proteggi: {
      slug: 'proteggere-pdf-password', title: 'Proteggere un PDF con password o sbloccarlo',
      desc: 'Metti una password al PDF con cifratura AES a 256 bit, limita stampa e copia, oppure togli password e limiti da un PDF di cui conosci la password. Gratis.',
      h1: 'Proteggi e sblocca', h2: 'Come proteggere un PDF con password o togliere la protezione', rel: ['firme', 'oscura', 'comprimi'],
      steps: ['Apri uno o più PDF.', 'Scegli se proteggere (password e limiti) o sbloccare.', 'Scarica il PDF protetto o sbloccato.'],
      faq: [
        ['Che cifratura viene usata?', 'AES a 256 bit, lo standard più robusto previsto dal formato PDF, compatibile con tutti i lettori moderni.'],
        ['Posso togliere la password da un PDF?', 'Sì, se la conosci: il PDF viene aperto con la password e salvato senza protezione.'],
        ['Posso impedire stampa o copia del testo?', 'Sì: puoi lasciare il PDF apribile da tutti ma limitare stampa, copia e modifiche.'],
      ],
    },
    migliora: {
      slug: 'migliorare-scansioni-foto', title: 'Migliorare scansioni e foto di documenti',
      desc: 'Rendi nitide e leggibili le foto dei documenti: taglio automatico dei bordi, prospettiva raddrizzata, ombre tolte, bianco e nero o colore. Con confronto prima e dopo.',
      h1: 'Migliora scansioni e foto', h2: 'Come migliorare la foto o la scansione di un documento', rel: ['ocr', 'comprimi', 'immagini'],
      steps: ['Carica le foto o il PDF scansionato.', 'Controlla il ritaglio e scegli colore, grigi o bianco e nero.', 'Confronta prima e dopo e scarica il PDF.'],
      faq: [
        ['Funziona con le foto fatte col telefono?', 'Sì: trova i bordi del foglio, corregge la prospettiva e toglie ombre e sfondo grigio.'],
        ['Il file diventa più leggero?', 'Sì: soprattutto in bianco e nero il PDF pesa molto meno della foto originale.'],
        ['Posso correggere il ritaglio?', 'Sì: i quattro angoli si spostano trascinandoli.'],
      ],
    },
    estrai: {
      slug: 'estrarre-dati-documenti', title: 'Estrarre dati da PDF e scansioni in Excel',
      desc: 'Trova da soli i dati chiave di uno o più documenti, anche scansioni: tipo, data, numero, importi, codici fiscali, partite IVA, IBAN, CIG, CUP, PEC. In Excel, Word o PDF.',
      h1: 'Estrai i dati', h2: 'Come estrarre i dati principali da tanti documenti', rel: ['excel', 'ocr', 'confronta'],
      steps: ['Carica uno o più documenti, anche scansioni.', 'Controlla i dati trovati e correggili se serve.', 'Scarica l’elenco in Excel, Word o PDF.'],
      faq: [
        ['Quali dati vengono trovati?', 'Tipo di documento, data, numero, controparte, importi, codici fiscali, partite IVA, IBAN, CIG, CUP, PEC e altro.'],
        ['Funziona con documenti scansionati?', 'Sì: le scansioni vengono lette con l’OCR prima dell’estrazione.'],
        ['Posso elaborare molti documenti insieme?', 'Sì: ogni documento diventa una riga dell’elenco in Excel.'],
      ],
    },
    verificapdfa: {
      slug: 'verifica-pdf-a', title: 'Verificare se un PDF è PDF/A valido (validatore gratis)',
      desc: 'Controlla se un PDF è davvero PDF/A-1b, 2b, 2u, 3b o livello A secondo la norma ISO 19005: font, colori, metadati, trasparenze. Rapporto in PDF o Word, gratis.',
      h1: 'Verifica PDF/A', h2: 'Come controllare se un PDF/A è valido', rel: ['pdfa', 'firme', 'comprimi'],
      steps: ['Carica uno o più PDF.', 'Leggi l’esito: conforme o no, con l’elenco dei problemi per area e per pagina.', 'Scarica il rapporto in PDF o Word, oppure converti i file non conformi in PDF/A.'],
      faq: [
        ['Come faccio a sapere se un PDF è PDF/A?', 'Caricalo qui: leggo la dichiarazione nei metadati (per esempio PDF/A-1b) e verifico se il file rispetta davvero le regole di quella parte della norma ISO 19005.'],
        ['Un PDF che dichiara di essere PDF/A è sempre valido?', 'No: molti programmi scrivono la dichiarazione ma lasciano font non incorporati, colori senza profilo o metadati incoerenti. La verifica controlla le regole una per una.'],
        ['Quali versioni vengono verificate?', 'PDF/A-1 (livelli a e b), PDF/A-2 e PDF/A-3 (livelli a, b e u).'],
        ['Se il file non è conforme cosa faccio?', 'Con «Converti in PDF/A» lo sistemo: le pagine conformi restano come sono, le altre vengono ricostruite e il risultato viene verificato di nuovo.'],
      ],
    },
    analisi: {
      slug: 'analisi-di-bilancio', title: 'Analisi di bilancio gratis: indici, flussi e valore dell’azienda',
      desc: 'Dal bilancio XBRL o PDF un’analisi chiara: riclassificati, indici, rendiconto finanziario, valore stimato dell’azienda e che cosa pesa di più sul risultato. Relazione in PDF, Word ed Excel.',
      h1: 'Analisi di bilancio', h2: 'Come analizzare un bilancio e stimare il valore di un’azienda', rel: ['xbrl', 'excel', 'confronta'],
      steps: ['Carica uno o più bilanci (XBRL o PDF, anche scansionati): più anni danno trend e flussi di cassa.', 'Esplora sintesi, riclassificati, indici, flussi e diagnosi; correggi i dati se serve.', 'Scarica la relazione in PDF o Word e il foglio Excel.'],
      faq: [
        ['Quali bilanci posso analizzare?', 'Il bilancio depositato in XBRL (anche firmato .p7m) oppure il PDF, anche scansionato: ordinario, abbreviato e micro. Caricando più anni ottieni trend, rendiconto finanziario e che cosa è cambiato da un anno all’altro.'],
        ['Quali indici vengono calcolati?', 'Redditività (ROE, ROI, ROS, margine EBITDA), liquidità, solidità (leva, PFN/EBITDA, copertura degli interessi), giorni di incasso, pagamento e scorta, e i margini di struttura e di tesoreria.'],
        ['Come viene stimato il valore dell’azienda?', 'Combinando più metodi di valutazione ricavati dal bilancio in un unico valore indicativo: non è una perizia.'],
        ['Che cosa dice la diagnosi?', 'Che cosa ha migliorato o peggiorato il risultato rispetto all’anno prima, da dove arriva e dove va la cassa e su cosa si spendono i ricavi, ordinato per peso: senza soglie fisse, perché ogni attività ha le sue regole.'],
        ['Il bilancio abbreviato va bene?', 'Sì: dove non indica il dettaglio (per esempio i debiti verso banche) l’analisi usa una stima dichiarata, che puoi correggere inserendo il dato.'],
      ],
    },
    confronta: {
      slug: 'confrontare-pdf', title: 'Confrontare due PDF e trovare le differenze',
      desc: 'Confronta due o più versioni di un documento, anche scansioni: aggiunte, eliminazioni e modifiche evidenziate parola per parola, importi e date cambiati in primo piano.',
      h1: 'Confronta PDF', h2: 'Come confrontare due versioni di un PDF', rel: ['estrai', 'modifica', 'ocr'],
      steps: ['Carica due o più versioni dello stesso documento.', 'Scorri le differenze: aggiunte, eliminazioni e modifiche, con le pagine affiancate.', 'Scarica il PDF evidenziato, il rapporto in PDF o Word o l’elenco in Excel.'],
      faq: [
        ['Posso confrontare due contratti?', 'Sì: ogni parola aggiunta, tolta o cambiata viene evidenziata, con importi e date in primo piano.'],
        ['Funziona con documenti scansionati?', 'Sì: le scansioni vengono lette con l’OCR prima del confronto.'],
        ['Posso confrontare più di due versioni?', 'Sì: ciascuna con la precedente o tutte con la prima.'],
      ],
    },
    oscura: {
      slug: 'oscurare-pdf', title: 'Oscurare PDF: anonimizza i dati sensibili',
      desc: 'Oscura per sempre nomi, codici fiscali, IBAN e indirizzi in un PDF: vengono trovati da soli, anche nelle scansioni. Gratis e senza limiti. Apri il PDF.',
      h1: 'Oscura PDF', h2: 'Come oscurare parti di un PDF in modo definitivo', rel: ["ocr", "pdfa", "comprimi"],
      steps: ['Apri il PDF da anonimizzare.', 'Premi «Trova i dati sensibili» o cerca le parole da coprire, poi controlla i riquadri.', 'Applica l’oscuramento e scarica il PDF anonimizzato.'],
      faq: [
        ['Basta coprire il testo con un rettangolo nero?', 'No: un rettangolo disegnato sopra lascia il testo nel file, che si può ancora copiare o cercare. Qui il testo coperto viene eliminato dal PDF, non solo nascosto.'],
        ['Posso anonimizzare un atto prima di pubblicarlo?', 'Sì: «Trova i dati sensibili» individua nomi, codici fiscali, IBAN, indirizzi e altri dati; controlli i riquadri, aggiungi quelli mancanti e scarichi il PDF anonimizzato. Rileggi sempre il risultato prima di pubblicarlo.'],
        ['L’oscuramento è definitivo?', 'Sì: il testo coperto viene eliminato dal file, non solo nascosto da un rettangolo, e non si può più copiare né cercare.'],
        ['Quali dati vengono trovati automaticamente?', 'Nomi e cognomi, codici fiscali e partite IVA (con controllo del codice), IBAN, numeri di telefono, indirizzi, email, date e luoghi di nascita, documenti d’identità e targhe.'],
        ['Funziona su pagine con sfondo scuro?', 'Sì: il colore del riquadro si adatta allo sfondo di ogni dato, oppure puoi sceglierlo tu, riquadro per riquadro.'],
      ],
    },
    estrattoconto: {
      slug: 'estratto-conto-in-excel', title: 'Estratto conto PDF in Excel, con verifica dei saldi',
      desc: 'Trasforma gli estratti conto in PDF, anche scansioni, in un foglio Excel con data, valuta, descrizione, entrate, uscite e saldo. Gratis, senza upload su server.',
      h1: 'Estratto conto in Excel', h2: 'Come portare i movimenti del conto corrente in Excel', rel: ["excel", "f24", "ocr"],
      steps: ['Trascina uno o più estratti conto in PDF (anche scansioni o foto).', 'Controlla i movimenti letti e la verifica dei saldi.', 'Scarica il foglio Excel con tutti i movimenti.'],
      faq: [
        ['Come trasformo un estratto conto PDF in Excel?', 'Trascina il PDF nel riquadro: i movimenti vengono letti e messi in colonne (data, valuta, descrizione, entrate, uscite, saldo). Controlli la verifica dei saldi e scarichi il file Excel.'],
        ['Come faccio a sapere che non manca nessun movimento?', 'Viene fatto un controllo automatico: saldo iniziale più movimenti deve dare il saldo finale indicato nell’estratto. Se i conti non tornano, lo vedi subito.'],
        ['Posso unire gli estratti conto di più mesi?', 'Sì: trascinali insieme e ottieni un unico foglio con i movimenti di tutti i periodi, in ordine.'],
        ['Funziona con gli estratti conto scansionati?', 'Sì: le scansioni e le foto vengono lette con il riconoscimento del testo (OCR), direttamente nel browser.'],
        ['I miei dati bancari vengono inviati da qualche parte?', 'No: l’estratto conto viene letto nel tuo browser e non viene caricato su alcun server.'],
      ],
    },
    f24: {
      slug: 'f24-dichiarazioni-in-excel', title: 'F24, CU, 730 e Redditi in Excel: codici tributo e importi',
      desc: 'Estrai codici tributo, righi e importi da F24, CU, 730, Redditi, IRAP e IVA in PDF, anche scansioni, in un foglio Excel con il riepilogo. Gratis e senza upload.',
      h1: 'F24 e dichiarazioni in Excel', h2: 'Come portare F24 e dichiarazioni dei redditi in Excel', rel: ["estrattoconto", "excel", "fatture"],
      steps: ['Trascina i modelli F24 o le dichiarazioni in PDF, anche tanti insieme.', 'Controlla i dati letti e la verifica del saldo.', 'Scarica il foglio Excel con il riepilogo per codice tributo.'],
      faq: [
        ['Come metto in Excel i dati di un F24?', 'Trascina l’F24 nel riquadro: sezioni (erario, INPS, regioni, IMU), codici tributo, anni di riferimento e importi finiscono in colonne, con il controllo del saldo del modello.'],
        ['Quali modelli vengono letti?', 'F24 (sezioni erario, INPS, regioni e IMU), Certificazione Unica (CU), 730, Redditi, IRAP e dichiarazione IVA: righi, colonne e importi.'],
        ['Posso elaborare gli F24 di tutti i clienti insieme?', 'Sì: trascina tanti file insieme e ottieni un unico foglio con un riepilogo per codice tributo.'],
        ['Funziona con le quietanze scansionate?', 'Sì: le scansioni vengono lette con l’OCR nel browser. Controlla sempre gli importi segnalati come incerti.'],
        ['I dati fiscali escono dal mio computer?', 'No: i documenti vengono letti nel browser e non vengono caricati su alcun server.'],
      ],
    },
    visure: {
      slug: 'visure-camerali-catastali-dati', title: 'Visure camerali e catastali: dati in Excel',
      desc: 'Ricava dai PDF delle visure camerali denominazione, codice fiscale, REA, PEC, ATECO e amministratori; dalle catastali foglio, particella, rendita e valore IMU.',
      h1: 'Visure camerali e catastali in dati', h2: 'Come ricavare i dati da una visura camerale o catastale', rel: ["excel", "estrattoconto", "ocr"],
      steps: ['Trascina una o più visure in PDF (anche scansioni).', 'Controlla i dati riconosciuti.', 'Copia i dati o scaricali in Excel.'],
      faq: [
        ['Quali dati vengono letti da una visura camerale?', 'Denominazione, forma giuridica, codice fiscale e partita IVA, numero REA, PEC, sede, codice ATECO, capitale sociale e amministratori con le cariche.'],
        ['E da una visura catastale?', 'Comune, foglio, particella e subalterno, categoria, classe, consistenza, rendita, intestati con le quote e il valore ai fini IMU calcolato dalla rendita.'],
        ['Posso elaborare più visure insieme?', 'Sì: trascinale insieme e ottieni un foglio con una riga per ogni impresa o immobile.'],
        ['Il valore IMU è quello da versare?', 'È la base imponibile calcolata dalla rendita con i coefficienti di legge: per l’imposta servono l’aliquota del Comune e la quota di possesso.'],
        ['Le visure vengono caricate su un server?', 'No: vengono lette nel browser, sul tuo dispositivo.'],
      ],
    },
    laboratorio: {
      slug: 'esami-laboratorio-tabella', title: 'Esami del sangue in tabella: confronta i referti nel tempo',
      desc: 'Metti in tabella i valori dei referti di laboratorio, con unità e intervalli di riferimento, e confronta più esami nel tempo. Nessun dato sanitario esce dal dispositivo.',
      h1: 'Esami di laboratorio in tabella', h2: 'Come mettere in tabella e confrontare gli esami del sangue', rel: ["excel", "ocr", "oscura"],
      steps: ['Trascina uno o più referti in PDF o in foto.', 'Controlla la tabella: i valori fuori intervallo sono evidenziati.', 'Scarica la tabella in Excel, con il confronto tra le date.'],
      faq: [
        ['Come confronto gli esami del sangue di date diverse?', 'Trascina insieme i referti: ogni esame diventa una riga e ogni data una colonna, così vedi come cambiano i valori nel tempo.'],
        ['Quali valori vengono evidenziati?', 'Quelli fuori dall’intervallo di riferimento indicato nel referto stesso. Non è un parere medico: per l’interpretazione rivolgiti al tuo medico.'],
        ['Posso usare la foto del referto?', 'Sì: le foto e le scansioni vengono lette con l’OCR nel browser.'],
        ['I miei dati sanitari sono al sicuro?', 'Il referto non viene caricato su alcun server: viene letto nel browser, sul tuo dispositivo.'],
        ['Posso fare la tabella per un familiare?', 'Sì, con qualsiasi referto di laboratorio in formato PDF o immagine.'],
      ],
    },
    qrsepa: {
      slug: 'qr-pagamento-sepa', title: 'QR di pagamento SEPA per bonifico, anche dalla fattura',
      desc: 'Crea il codice QR per pagare con bonifico (standard EPC): con l’app della banca si compilano IBAN, beneficiario, importo e causale. Dalla fattura XML o a mano.',
      h1: 'QR di pagamento SEPA', h2: 'Come creare un QR code per ricevere un bonifico', rel: ["fatture", "conforme", "numeri"],
      steps: ['Trascina la fattura (XML, P7M, ZIP o PDF) oppure scrivi i dati a mano.', 'Controlla IBAN, beneficiario, importo e causale.', 'Scarica il QR in PNG o SVG, o stampalo sulla fattura.'],
      faq: [
        ['Che cos’è il QR di pagamento SEPA?', 'È un codice QR secondo lo standard europeo EPC per i bonifici: inquadrato con l’app di una banca che lo supporta, compila IBAN, beneficiario, importo e causale senza doverli scrivere.'],
        ['Posso metterlo sulla fattura?', 'Sì: dalla fattura in PDF ottieni lo stesso PDF con il QR stampato nella posizione che scegli; dalla fattura elettronica XML i dati si compilano da soli.'],
        ['Tutte le app bancarie lo leggono?', 'Molte app italiane ed europee lo leggono. Se la tua non lo fa, i dati del bonifico restano scritti accanto al codice.'],
        ['L’IBAN viene controllato?', 'Sì: viene verificato il codice di controllo dell’IBAN prima di creare il QR, per evitare bonifici a un conto sbagliato.'],
        ['Serve un account o un servizio a pagamento?', 'No: il QR si crea nel browser, gratis e senza registrazione.'],
      ],
    },
    conforme: {
      slug: 'copia-conforme-pdf', title: 'Copia conforme all’originale: dicitura sul PDF',
      desc: 'Aggiungi al PDF la dicitura di conformità all’originale, con luogo, data, nome e impronta del file, in calce, su ogni pagina o su un foglio a parte. Gratis.',
      h1: 'Copia conforme', h2: 'Come aggiungere l’attestazione di conformità a un PDF', rel: ["pdfa", "firme", "numeri"],
      steps: ['Apri il PDF da dichiarare conforme.', 'Scegli il testo dell’attestazione, dove metterla e i tuoi dati.', 'Scarica il PDF e firmalo con il tuo dispositivo di firma digitale.'],
      faq: [
        ['Chi può usare la dicitura di conformità?', 'Avvocati, notai, pubblici ufficiali e professionisti che possono attestare la conformità di una copia all’originale: lo strumento prepara il documento, la responsabilità dell’attestazione resta di chi firma.'],
        ['Dove viene messa l’attestazione?', 'In calce all’ultima pagina, su una pagina aggiunta in fondo, su ogni pagina (una riga breve su ciascuna e la dicitura completa sull’ultima) oppure in un documento separato che lascia il PDF intatto e ne cita nome e impronta.'],
        ['A cosa serve l’impronta del file?', 'L’impronta (hash SHA-256) identifica in modo univoco il documento: chi lo riceve può verificare che sia proprio quello attestato.'],
        ['La firma digitale si fa qui?', 'No: scarichi il PDF con l’attestazione e lo firmi con il tuo dispositivo o servizio di firma digitale.'],
        ['Il PDF viene caricato su un server?', 'No: tutto avviene nel browser.'],
      ],
    },
    misure: {
      slug: 'misurare-pdf-in-scala', title: 'Misurare distanze e superfici su un PDF in scala',
      desc: 'Misura distanze, percorsi, superfici e angoli su tavole e planimetrie in PDF: imposta la scala o tarala su una quota nota. Misure salvate nel PDF e in Excel.',
      h1: 'Misure in scala sul PDF', h2: 'Come misurare una planimetria in PDF', rel: ["tavola", "modifica", "impagina"],
      steps: ['Apri la tavola o la planimetria in PDF.', 'Imposta la scala (1:100, 1:50…) o tarala su una quota nota.', 'Misura distanze, superfici e angoli e salva le misure nel PDF o in Excel.'],
      faq: [
        ['Come misuro una superficie su una planimetria?', 'Imposta la scala, scegli la misura di superficie e fai clic sui vertici del perimetro: l’area viene calcolata in metri quadrati.'],
        ['E se non conosco la scala?', 'Tarala su una quota nota: tracci un segmento di cui conosci la lunghezza reale (una porta, una quota scritta) e la scala si calcola da sola.'],
        ['Le misure sono precise?', 'Sui PDF esportati dal CAD sì, perché le linee sono vettoriali. Sulle scansioni la precisione dipende dalla qualità e dalla deformazione della scansione.'],
        ['Posso consegnare le misure?', 'Sì: restano disegnate nel PDF e puoi scaricarne l’elenco in Excel.'],
        ['Serve un programma CAD?', 'No: basta il browser, anche su tablet.'],
      ],
    },
    conta: {
      slug: 'contare-parole-caratteri', title: 'Conta parole e caratteri di PDF e Word, con le cartelle',
      desc: 'Conta parole, caratteri con e senza spazi, cartelle editoriali da 1.800 battute, frasi e paragrafi di PDF, Word e testi incollati. Gratis e senza upload.',
      h1: 'Conta parole e caratteri', h2: 'Come contare le parole e i caratteri di un documento', rel: ["tesi", "word", "ocr"],
      steps: ['Trascina PDF, Word o testi, oppure incolla il testo.', 'Leggi parole, caratteri, cartelle, frasi e tempo di lettura.', 'Guarda il conteggio pagina per pagina e copia i numeri.'],
      faq: [
        ['Quante battute ha una cartella editoriale?', 'La cartella editoriale standard è di 1.800 battute, spazi inclusi: il numero di cartelle viene calcolato così.'],
        ['Gli spazi vengono contati?', 'Vengono mostrati entrambi i valori: caratteri spazi inclusi e caratteri senza spazi.'],
        ['Posso contare le parole di un PDF scansionato?', 'Sì: le pagine scansionate e le foto vengono lette con l’OCR prima del conteggio.'],
        ['Posso contare più file insieme?', 'Sì: ottieni il conteggio di ogni file e il totale.'],
        ['Posso fissare un limite di caratteri?', 'Sì: imposti il limite e vedi subito quanto manca o quanto lo superi.'],
      ],
    },
    tesi: {
      slug: 'tesi-modello-controllo', title: 'Tesi di laurea: modello Word e controllo del PDF finale',
      desc: 'Scarica il modello Word per la tesi (frontespizio, indice, margini, interlinea, numeri di pagina) e controlla il PDF finale: margini, carattere, pagine e PDF/A.',
      h1: 'Tesi: modello e controllo', h2: 'Come impaginare la tesi e controllare il PDF da consegnare', rel: ["pdfa", "conta", "word"],
      steps: ['Senza file: crea il modello Word con frontespizio, indice e capitoli già impostati.', 'Con il PDF finale: trascinalo per il controllo.', 'Correggi ciò che è segnalato e converti in PDF/A se richiesto.'],
      faq: [
        ['Cosa contiene il modello Word?', 'Frontespizio con i tuoi dati, indice automatico, capitoli con gli stili dei titoli, bibliografia (note a piè di pagina o autore-anno), margini, interlinea, carattere e numeri di pagina già impostati.'],
        ['Cosa viene controllato nel PDF della tesi?', 'Margini, carattere e dimensione, interlinea, numero di pagine e di parole, e se il file è un PDF/A valido.'],
        ['L’università chiede la tesi in PDF/A: come faccio?', 'Il controllo ti dice se il file è già PDF/A; se non lo è, con «PDF in PDF/A» lo converti e lo verifichi, nel browser.'],
        ['Il testo della tesi viene inviato a qualcuno?', 'No: il PDF viene analizzato nel browser, sul tuo dispositivo.'],
        ['Va bene per qualsiasi ateneo?', 'Scegli tra le impostazioni più diffuse per triennale, magistrale e dottorato; verifica sempre le indicazioni del tuo corso di laurea.'],
      ],
    },
    vettoriale: {
      slug: 'immagine-in-svg', title: 'Timbro o logo da foto a SVG vettoriale e PNG trasparente',
      desc: 'Trasforma la foto di un timbro, di un logo o di una firma in un disegno vettoriale pulito: SVG o PNG senza sfondo, con colore e spessore regolabili. Gratis.',
      h1: 'Immagine in SVG', h2: 'Come trasformare un timbro o un logo in SVG', rel: ["modifica", "immagini", "migliora"],
      steps: ['Trascina la foto o la scansione del timbro, del logo o della firma.', 'Regola colori, spessore e pulizia delle macchie.', 'Scarica in SVG o in PNG trasparente, o salvalo tra i tuoi timbri.'],
      faq: [
        ['Come ottengo un timbro senza sfondo?', 'Fotografa il timbro su carta bianca e trascina la foto: lo sfondo viene tolto e ottieni un PNG trasparente o un SVG da mettere sui documenti.'],
        ['Che differenza c’è tra SVG e PNG?', 'L’SVG è vettoriale: si ingrandisce senza perdere nitidezza ed è adatto a stampe e loghi. Il PNG è un’immagine a punti, comoda per incollarla ovunque.'],
        ['Posso usarlo poi nei PDF?', 'Sì: salvato tra i tuoi timbri, lo inserisci con un clic in «Modifica PDF».'],
        ['Funziona con i loghi a più colori?', 'Sì: scegli quanti colori tenere e vengono separati in zone pulite.'],
        ['L’immagine viene caricata su un server?', 'No: viene elaborata nel browser.'],
      ],
    },
    tavola: {
      slug: 'stampare-tavola-grande-a4', title: 'Stampare una tavola A0 o A1 su fogli A4 o A3, in scala',
      desc: 'Stampa una tavola A0, A1 o A2 in scala reale su fogli A4 o A3, con le parti sovrapposte per incollarli, i crocini e il numero di ogni foglio. Gratis e senza upload.',
      h1: 'Stampa una tavola grande', h2: 'Come stampare un PDF grande su più fogli A4', rel: ["misure", "impagina", "dividi"],
      steps: ['Apri la tavola in PDF.', 'Scegli il formato dei fogli (A4 o A3) e la sovrapposizione.', 'Scarica il PDF pronto da stampare al 100% e unisci i fogli seguendo i crocini.'],
      faq: [
        ['Come stampo una tavola A1 con una stampante A4?', 'Apri la tavola, scegli fogli A4: ottieni un PDF con tanti fogli quanti servono, ciascuno numerato, da stampare al 100% (senza «adatta alla pagina») e da unire.'],
        ['La scala resta quella reale?', 'Sì: le misure sulla carta restano quelle della tavola. Stampa sempre al 100% delle dimensioni.'],
        ['Come unisco i fogli?', 'Ogni foglio ha una parte che si sovrappone al vicino, con crocini e numero di riga e colonna: allinea i crocini e incolla.'],
        ['Posso invece ridurla su un solo foglio?', 'Sì: puoi stampare l’intera tavola ridotta su un unico A4 o A3.'],
        ['Serve un programma CAD?', 'No: basta il PDF della tavola e il browser.'],
      ],
    },
    officepdf: {
      slug: 'word-excel-in-pdf', title: 'Word, Excel e PowerPoint in PDF, gratis e senza upload',
      desc: 'Converti documenti Word (.docx), fogli Excel (.xlsx), presentazioni PowerPoint (.pptx), testi e pagine HTML in PDF nel browser: titoli, tabelle, immagini e numeri di pagina al loro posto.',
      h1: 'Word, Excel e PowerPoint in PDF', h2: 'Come trasformare un documento Word, un foglio Excel o una presentazione in PDF', rel: ["unisci", "pdfa", "comprimi"],
      steps: ['Trascina uno o più file Word, Excel, testo o HTML.', 'Scegli il formato della pagina e, per Excel, l’orientamento.', 'Converti e scarica il PDF (o un PDF per file).'],
      faq: [
        ['Come trasformo un documento Word in PDF senza Word?', 'Trascina il file .docx nel riquadro e premi «Converti in PDF»: la conversione avviene nel browser, con caratteri dalle stesse misure di Arial, Times New Roman e Courier, così il testo occupa lo stesso spazio che nell’originale.'],
        ['Un foglio Excel largo esce tagliato?', 'No: ogni foglio si adatta alla larghezza della pagina e, se serve, gira in orizzontale. Se le colonne sono davvero troppe, vengono divise in gruppi uno dopo l’altro, senza perdere dati.'],
        ['Cosa viene mantenuto del documento Word?', 'Titoli, paragrafi con allineamento e rientri, grassetti e colori, elenchi puntati e numerati, tabelle con celle unite e sfondi, immagini, salti di pagina, intestazioni e piè di pagina con il numero di pagina.'],
        ['Posso convertire una presentazione PowerPoint?', 'Sì: ogni diapositiva diventa una pagina, con caselle di testo, elenchi, colori del tema, immagini e tabelle al loro posto. Grafici e SmartArt non sono ancora inclusi: il PDF lo segnala.'],
        ['Posso convertire i vecchi .doc, .xls e .ppt?', 'Il browser non sa leggere quei formati: aprili con il programma che li ha creati e salvali come .docx, .xlsx o .pptx (oppure direttamente in PDF).'],
        ['I miei documenti vengono caricati su un server?', 'No: la conversione avviene sul tuo dispositivo e le pagine web convertite non scaricano nulla da internet.'],
      ],
    },
    filigrana: {
      slug: 'filigrana-pdf', title: 'Filigrana su PDF: scritta o logo su ogni pagina',
      desc: 'Aggiungi una filigrana a un PDF: «COPIA», «BOZZA» o il tuo logo, in diagonale, al centro, in basso o ripetuta, su tutte le pagine o solo su alcune. Gratis e senza upload.',
      h1: 'Filigrana PDF', h2: 'Come aggiungere una filigrana a un PDF', rel: ["numeri", "proteggi", "modifica"],
      steps: ['Apri il PDF.', 'Scrivi il testo o scegli un’immagine, la disposizione e l’intensità: l’anteprima si aggiorna subito.', 'Applica e scarica il PDF con la filigrana.'],
      faq: [
        ['Come metto la scritta «COPIA» su tutte le pagine?', 'Apri il PDF, scrivi «COPIA» (o «BOZZA», «RISERVATO»…), scegli la disposizione in diagonale e premi «Applica la filigrana»: la scritta compare su ogni pagina, semitrasparente.'],
        ['Posso usare il logo dello studio?', 'Sì: scegli «Immagine» e un file PNG (meglio con lo sfondo trasparente) o JPG; puoi metterlo al centro, in basso o ripeterlo su tutta la pagina.'],
        ['Posso mettere la filigrana solo su alcune pagine?', 'Sì: tutte, solo le dispari, solo le pari oppure un intervallo come 1-3, 5.'],
        ['Il testo del documento resta selezionabile?', 'Sì: la filigrana si aggiunge sopra la pagina senza trasformarla in immagine.'],
        ['Il PDF viene caricato su un server?', 'No: la filigrana si applica nel browser, sul tuo dispositivo.'],
      ],
    },
    pdftesto: {
      slug: 'pdf-in-testo', title: 'PDF in testo e HTML: estrai il testo, anche dalle scansioni',
      desc: 'Estrai il testo di un PDF nell’ordine di lettura, anche dalle scansioni con l’OCR: file .txt e pagina web .html con titoli e paragrafi. Gratis e senza upload.',
      h1: 'PDF in testo e HTML', h2: 'Come estrarre il testo da un PDF', rel: ["ocr", "word", "conta"],
      steps: ['Apri il PDF.', 'Controlla il testo nell’anteprima (le scansioni si leggono da sole).', 'Scarica il .txt, la pagina .html o entrambi.'],
      faq: [
        ['Come copio tutto il testo di un PDF?', 'Apri il PDF: il testo compare nell’anteprima nell’ordine di lettura, con i paragrafi. Scarica il file .txt e copialo dove ti serve.'],
        ['Funziona con un PDF scansionato?', 'Sì: le pagine senza testo vengono lette con l’OCR, nel browser. Controlla nomi e numeri, che la lettura può sbagliare.'],
        ['A cosa serve la versione HTML?', 'È una pagina web con titoli e paragrafi: si legge bene sul telefono, si ingrandisce senza scorrere di lato ed è comoda per i lettori di schermo.'],
        ['Le colonne restano nell’ordine giusto?', 'Il testo segue l’ordine di lettura della pagina, colonna per colonna.'],
        ['Il PDF viene caricato su un server?', 'No: tutto avviene sul tuo dispositivo.'],
      ],
    },
    pdfppt: {
      slug: 'pdf-in-powerpoint', title: 'PDF in PowerPoint modificabile, anche da scansione, gratis',
      desc: 'Trasforma un PDF in una presentazione PowerPoint (.pptx) con il testo modificabile: carattere, dimensione, colore e posizione dell’originale. Anche dalle scansioni. Senza upload.',
      h1: 'PDF in PowerPoint', h2: 'Come trasformare un PDF in una presentazione modificabile', rel: ["officepdf", "immaginipdf", "word"],
      steps: ['Apri il PDF.', 'Scegli «Testo modificabile» (oppure «Pagine identiche») e la qualità delle immagini.', 'Crea la presentazione e aprila con PowerPoint, Keynote o Google Presentazioni.'],
      faq: [
        ['Posso modificare il testo nelle diapositive?', 'Sì: il testo diventa caselle di testo vere, a paragrafi, con il carattere, la dimensione, il colore, l’interlinea e l’allineamento dell’originale. Immagini, linee e colori di fondo restano identici sotto il testo.'],
        ['Funziona con un PDF scansionato?', 'Sì: le pagine scansionate vengono lette con l’OCR, sul tuo dispositivo; la scritta originale si toglie dall’immagine e al suo posto c’è il testo modificabile, inclinato come nella scansione. Dove la carta intorno non è uniforme (timbri, cornici) la scritta resta nell’immagine e il suo testo va nelle note. Controlla nomi e numeri.'],
        ['Le diapositive sono uguali al PDF?', 'Sì, a meno di differenze minime dovute ai caratteri installati sul computer. Se ti serve la copia esatta, scegli «Pagine identiche»: ogni pagina diventa un’immagine fedele e il testo va nelle note del relatore.'],
        ['Con quali programmi si apre?', 'Con PowerPoint, Keynote, Google Presentazioni e LibreOffice Impress.'],
        ['C’è un limite di pagine?', 'No: il limite è la memoria del dispositivo. 300 pagine di testo si convertono in meno di un minuto.'],
        ['Il PDF viene caricato su un server?', 'No: la presentazione si crea nel browser.'],
      ],
    },
    annota: {
      slug: 'commentare-pdf', title: 'Commentare un PDF: evidenzia, note e commenti, gratis',
      desc: 'Evidenzia, sottolinea e barra il testo di un PDF, aggiungi note e commenti con il tuo nome: si leggono in Acrobat, Anteprima e nei browser. Senza upload.',
      h1: 'Commenti e note sul PDF', h2: 'Come evidenziare e commentare un PDF', rel: ["modifica", "confronta", "unisci"],
      steps: ['Apri il PDF.', 'Scegli Evidenzia, Sottolinea, Barra, Nota o Testo e lavora sulla pagina; scrivi i commenti nel pannello.', 'Salva il PDF con i commenti (e, se vuoi, il riepilogo).'],
      faq: [
        ['I commenti si vedono in Acrobat?', 'Sì: sono annotazioni PDF vere, con autore e data. Si vedono, si spostano e si rispondono in Acrobat Reader, Anteprima di macOS, Chrome, Edge e Firefox.'],
        ['Posso evidenziare un PDF scansionato?', 'Sì: sulle scansioni l’evidenziatura segue il riquadro che trascini; sui PDF con testo segue le righe del testo.'],
        ['Come raccolgo tutti i commenti?', 'Insieme al PDF puoi scaricare il riepilogo: per ogni commento la pagina, il tipo, il testo evidenziato e la nota.'],
        ['Il testo del documento cambia?', 'No: i commenti stanno sopra la pagina e si possono togliere; il documento resta com’è.'],
        ['Il PDF viene caricato su un server?', 'No: tutto avviene nel browser.'],
      ],
    },
    contratto: {
      slug: 'contratto-affitto-comodato', title: 'Contratto di affitto e comodato gratuito: compilazione guidata, PDF e Word',
      desc: 'Contratto di locazione 4+4, 3+2 a canone concordato, transitorio, per studenti, a uso negozio o ufficio e comodato d’uso gratuito: compilazione guidata, clausole a scelta, testo modificabile, PDF e Word. Senza upload.',
      h1: 'Contratto di affitto e comodato', h2: 'Come scrivere un contratto di affitto o di comodato', rel: ["visure", "firme", "modifica"],
      steps: ['Scegli il tipo di contratto (4+4, 3+2, transitorio, studenti, uso diverso o comodato).', 'Compila i dati nella colonna: quelli obbligatori sono segnati, i dati catastali si leggono anche dalla visura in PDF.', 'Scegli le clausole facoltative, modifica gli articoli che vuoi e scarica PDF, Word e il promemoria di registrazione.'],
      faq: [
        ['Quali contratti posso fare?', 'Locazione abitativa a canone libero (4+4), a canone concordato (3+2), transitoria (da 1 a 18 mesi), per studenti universitari (da 6 a 36 mesi), locazione a uso diverso (negozio, ufficio, laboratorio: 6+6) e comodato d’uso gratuito di immobile.'],
        ['Il contratto rispetta la legge?', 'Il testo segue la legge 431/1998, la legge 392/1978, il D.M. 16 gennaio 2017 e il codice civile, citati articolo per articolo. Durate minime, deposito massimo di tre mensilità, clausola sull’APE e pagamento tracciabile sono applicati da soli; le clausole nulle non vengono mai proposte. Per i casi particolari è sempre bene farlo vedere a un professionista.'],
        ['Posso modificare il testo?', 'Sì: ogni articolo si modifica direttamente nell’anteprima, si può togliere un articolo facoltativo e aggiungere clausole personalizzate. Il Word scaricato si modifica come qualsiasi documento.'],
        ['Mi dice come registrarlo?', 'Sì: insieme al contratto c’è il promemoria con la scadenza della registrazione, l’imposta di registro e i bolli calcolati, la cedolare secca (con la lettera per l’inquilino) e le comunicazioni da fare.'],
        ['Posso usare la visura catastale?', 'Sì: trascina la visura in PDF e foglio, particella, subalterno, categoria, rendita, indirizzo, pertinenze e proprietari si compilano da soli.'],
        ['I dati vengono inviati da qualche parte?', 'No: tutto avviene nel browser. La bozza resta solo su questo dispositivo, oppure la salvi tu in un file.'],
      ],
    },
    rilevaai: {
      slug: 'rilevatore-testo-ai', title: 'Rilevatore di testo AI e antiplagio: Claude, ChatGPT, Gemini, senza upload',
      desc: 'Verifica se un compito, una tesina o un documento è stato prodotto o copiato da un assistente AI: prove nei file Word, PowerPoint, Excel e PDF, residui di chat, testo nascosto, passaggi identici. Tutto sul tuo dispositivo.',
      h1: 'Testo scritto con l’AI?', h2: 'Come verificare se un testo è stato scritto con l’AI', rel: ["confronta", "conta", "oscura"],
      steps: ['Trascina uno o più file (Word, PowerPoint, Excel, PDF, OpenDocument) oppure incolla il testo.', 'Leggi le prove trovate: programma che ha creato il file, nomi di assistenti, caratteri delle chat, residui di conversazione, testo nascosto.', 'Confronta il testo con le risposte di Claude alla stessa consegna o con altri compiti, e scarica il rapporto.'],
      faq: [
        ['Dà una percentuale di testo scritto dall’AI?', 'No, e lo dichiariamo: abbiamo misurato che lo stile da solo non distingue in modo affidabile un testo di Claude da quello di una persona che scrive bene (su oltre 11.000 testi umani). Lo strumento mostra solo prove verificabili e passaggi identici.'],
        ['Quali prove trova?', 'Le impronte dei programmi con cui gli assistenti AI creano i file (per esempio python-docx, docx.js, PptxGenJS, openpyxl, ReportLab), nomi di assistenti nei metadati, i caratteri tipografici delle interfacce delle chat rimasti nel documento, frasi della conversazione («Spero che ti sia utile», «Fammi sapere se…»), formattazione Markdown e testo nascosto con caratteri invisibili.'],
        ['Funziona con un testo incollato?', 'Sì: scrivi o incolla il testo. Se lo incolli da Word o da una pagina web, si controllano anche i caratteri tipografici.'],
        ['Posso controllare i compiti di tutta la classe?', 'Sì: trascina tutti i file insieme. Per ognuno vedi l’esito e, tra i file, i passaggi identici di almeno 8 parole.'],
        ['I testi vengono inviati a un server?', 'No: tutto avviene nel browser, sul tuo dispositivo.'],
      ],
    },
  };
  const BY_SLUG = Object.fromEntries(Object.entries(P).map(([id, p]) => [p.slug, id]));
  const slug = id => (P[id] || {}).slug || id;
  const idFromSlug = s => BY_SLUG[s] || (P[s] || (typeof TOOLS !== 'undefined' && TOOLS[s]) ? s : '');
  const meta = id => P[id] ? { title: P[id].title + ' · ' + NAME, desc: P[id].desc } : { title: HOME.title, desc: HOME.desc };
  return { NAME, HOME, P, slug, idFromSlug, meta };
})();

/* =====================================================================
   App shell: tool registry, routing, home, dropzone
   ===================================================================== */
const TOOLS = {
  unisci:   { title: 'Unisci PDF', short: 'Unisci', icon: 'merge', hue: '#7C5CFC', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Combina più PDF (e immagini) in un unico documento, nell’ordine che preferisci.', start: (...a) => startMerge(...a) },
  immagini: { title: 'Immagini in PDF', short: 'Immagini', icon: 'photo', hue: '#DB2777', accept: IMG_ACCEPT, multiple: true, pdfIn: false,
              desc: 'Converti foto e scansioni (JPG, PNG, HEIC, TIFF, WebP…) in PDF, con formato e margini a scelta.', start: (...a) => startImages(...a) },
  dividi:   { title: 'Dividi PDF', short: 'Dividi', icon: 'split', hue: '#1E88E5', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Separa ogni pagina, dividi ogni N pagine, per intervalli o estrai solo quelle scelte.', start: (...a) => startSplit(...a) },
  assistente: { title: 'Fai tutto tu', short: 'Fai tutto', icon: 'spark', hue: '#5A2BFF', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Dimmi a cosa ti serve il file (PEC, portale con limite di peso, email, stampa, archivio, invio riservato) e faccio io i passaggi giusti: guardo il documento, ti mostro il piano con il perché di ogni passo e lo eseguo. Le combinazioni che usi spesso diventano ricette.', start: (...a) => startAssistente(...a) },
  immaginipdf: { title: 'PDF in immagini', short: 'In immagini', icon: 'image', hue: '#C026D3', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Ogni pagina come immagine JPG, PNG, WebP o TIFF fino a 600 dpi. Oppure estrai ciò che il PDF contiene: le foto originali senza perdita di qualità, il testo, i file allegati.', start: (...a) => startToImages(...a) },
  impagina: { title: 'Impagina PDF', short: 'Impagina', icon: 'layout', hue: '#7C3AED', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Tutte le pagine in A4 (anche scansioni e ricevute di misure diverse), 2 o 4 pagine per foglio, libretto da stampare fronte/retro, margini per rilegare o rifilati, pagine doppie divise in due.', start: (...a) => startImpagina(...a) },
  proteggi: { title: 'Proteggi e sblocca', short: 'Proteggi', icon: 'key', hue: '#B45309', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Metti una password al PDF (AES 256 bit) e scegli se si può stampare, copiare o modificare. Oppure togli password e limiti ai PDF che puoi aprire. Anche più file insieme.', start: (...a) => startProteggi(...a) },
  migliora: { title: 'Migliora scansioni e foto', short: 'Migliora', icon: 'wand', hue: '#0E9384', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Foto di documenti fatte col telefono e scansioni scure o storte: ritaglio e prospettiva corretti, ombre tolte, carta bianca, testo nitido in bianco e nero. Confronto prima/dopo e PDF leggero.', start: (...a) => startMigliora(...a) },
  comprimi: { title: 'Comprimi PDF', short: 'Comprimi', icon: 'compress', hue: '#0FA38F', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Riduci il peso dei PDF scegliendo il giusto equilibrio tra qualità e dimensione.', start: (...a) => startCompress(...a) },
  modifica: { title: 'Modifica PDF', short: 'Modifica', icon: 'edit', hue: '#F2711C', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Riscrivi il testo esistente come in Word, aggiungi testo, immagini, firma, forme ed evidenziazioni.', start: (...a) => startEdit(...a) },
  ruota:    { title: 'Ruota PDF', short: 'Ruota', icon: 'rotate', hue: '#3E63DD', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Ruota singole pagine, quelle selezionate o l’intero documento.', start: (...a) => startRotate(...a) },
  ordina:   { title: 'Organizza pagine', short: 'Organizza', icon: 'order', hue: '#E5484D', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Riordina le pagine trascinandole, aggiungi pagine bianche, duplicale o eliminale.', start: (...a) => startOrder(...a) },
  numeri:   { title: 'Numeri di pagina e intestazioni', short: 'Numeri', icon: 'hash', hue: '#A855F7', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Aggiungi numerazione, intestazione e calce con anteprima dal vivo.', start: (...a) => startNumbers(...a) },
  ocr:      { title: 'PDF OCR', short: 'OCR', icon: 'ocr', hue: '#22A06B', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Riconosci il testo di scansioni e foto: il PDF diventa ricercabile e copiabile. Anche tanti file insieme, ognuno separato.', start: (...a) => startOcr(...a) },
  word:     { title: 'PDF in Word', short: 'Word', icon: 'textedit', hue: '#2B579A', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Converti PDF e scansioni in un documento Word modificabile, con loghi e firme come immagini da riposizionare.', start: (stage, files) => startOcr(stage, files, { wordMode: true }) },
  pdfa:     { title: 'Converti in PDF/A', short: 'PDF/A', icon: 'pdfa', hue: '#0E7490', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Crea PDF/A-1b o PDF/A-2b validi per Agenzia delle Entrate, PEC, processo telematico e conservazione. Ogni file viene verificato con le regole della norma; quelli già conformi restano come sono.', start: (...a) => startPdfa(...a) },
  verificapdfa: { title: 'Verifica PDF/A', short: 'Verifica', icon: 'pdfacheck', hue: '#0F766E', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Controlla se un PDF è davvero un PDF/A valido (1a, 1b, 2a, 2b, 2u, 3a, 3b, 3u): struttura, font, colori, trasparenze, metadati e allegati secondo la norma ISO 19005. Ti dico cosa non va e in quale pagina, con il rapporto in PDF o Word.', start: (stage, files, t) => startPdfa(stage, files, t, { verify: true }) },
  moduli:   { title: 'Compila PDF', short: 'Compila', icon: 'form', hue: '#D97706', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Scrivi nei moduli PDF: gli spazi da compilare vengono trovati da soli, anche nelle scansioni. Puoi anche renderli compilabili per chi li riceve.', start: (...a) => startForms(...a) },
  firme:    { title: 'Firme digitali e P7M', short: 'Firme', icon: 'seal', hue: '#0F766E', accept: '', multiple: true, anyFile: true,
              desc: 'Apri i file firmati .p7m (anche .tsd e .m7m): estrai il PDF e verifica chi ha firmato, quando e con quale certificato. Controlla anche le firme dentro i PDF. Anche tanti file insieme.', start: (...a) => startFirme(...a) },
  xbrl:     { title: 'XBRL in PDF, CSV ed Excel', short: 'XBRL', icon: 'xbrl', hue: '#4F46E5', accept: '.xbrl,.xml,.p7m,.zip', multiple: true, anyFile: true, dzText: 'Bilanci XBRL (.xbrl, anche firmati .xbrl.p7m) — uno o più insieme',
              desc: 'Trasforma il bilancio depositato in formato XBRL in un PDF leggibile (dati anagrafici, stato patrimoniale, conto economico, rendiconto e nota integrativa) e in CSV ed Excel con tutti i valori.', start: (...a) => startXbrl(...a) },
  excel:    { title: 'PDF in Excel', short: 'Excel', icon: 'table', hue: '#1D6F42', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Trasforma le tabelle del PDF in un foglio Excel: colonne riconosciute anche senza linee, importi e date come numeri, scansioni lette con l’OCR. Più PDF insieme: un Excel per ciascuno.', start: (...a) => startExcel(...a) },
  fatture:  { title: 'Fatture elettroniche', short: 'Fatture', icon: 'invoice', hue: '#0B7285', accept: '.xml,.p7m,.zip,.pdf', multiple: true, anyFile: true, folder: true, chain: false,
              dzText: 'Fatture XML, .xml.p7m, ZIP del cassetto fiscale o PDF nel formato del foglio di stile — anche l’intera cartella',
              resume: () => typeof FT !== 'undefined' && FT.fatture.length > 0,
              desc: 'Trasforma le fatture elettroniche (XML, P7M, ZIP) in PDF leggibili, nel layout dell’Agenzia o esteso, ed esporta le prestazioni in Excel. Legge anche i PDF delle fatture.', start: (...a) => startFatture(...a) },
  estrai:   { title: 'Estrai i dati', short: 'Dati', icon: 'search', hue: '#0369A1', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Trova da solo i dati chiave di uno o più documenti (anche scansioni): tipo, data, numero, controparte, importi, codici fiscali, partite IVA, IBAN, CIG, CUP, PEC. In Excel, Word o PDF.', start: (...a) => startEstrai(...a) },
  analisi:  { title: 'Analisi di bilancio', short: 'Analisi', icon: 'chart', hue: '#0D7A5F', accept: '.xbrl,.xml,.p7m,.zip,.pdf,application/pdf,' + IMG_ACCEPT, multiple: true, anyFile: true, dzText: 'Uno o più bilanci (XBRL o PDF, anche scansionati): più anni insieme danno trend, flussi di cassa e che cosa è cambiato',
              desc: 'Dal bilancio (XBRL o PDF, anche scansionato) un’analisi chiara: stato patrimoniale e conto economico riclassificati, indici, rendiconto finanziario, valore stimato dell’azienda e una diagnosi di che cosa pesa di più, in positivo e in negativo. Relazione in PDF o Word e foglio Excel.', start: (...a) => startAnalisi(...a) },
  confronta: { title: 'Confronta PDF', short: 'Confronta', icon: 'swap', hue: '#9333EA', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              desc: 'Due o più versioni dello stesso documento, anche scansioni: aggiunte, eliminazioni e modifiche parola per parola, importi e date cambiati in primo piano. PDF con le modifiche evidenziate, rapporto in PDF o Word ed elenco in Excel.', start: (...a) => startConfronta(...a) },
  oscura:   { title: 'Oscura PDF', short: 'Oscura', icon: 'redact', hue: '#475467', accept: '.pdf,application/pdf', multiple: true,
              desc: 'Elimina in modo definitivo i dati personali: nomi, codici fiscali, IBAN, telefoni, indirizzi, email. Li trova da solo, anche nelle scansioni.', start: (...a) => startRedact(...a) },
  // servizi per professione (src/pro.js)
  estrattoconto: { title: 'Estratto conto in Excel', short: 'Estratto conto', icon: 'bank', hue: '#0F766E', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              dzText: 'Estratti conto in PDF (anche scansioni o foto) — uno o più insieme, anche di mesi diversi',
              desc: 'I movimenti del conto corrente in un foglio Excel: data, valuta, descrizione, entrate, uscite e saldo, con il tipo di operazione. Controllo automatico: saldo iniziale + movimenti = saldo finale. Più estratti insieme.', start: (...a) => startDati(...a) },
  f24:      { title: 'F24 e dichiarazioni in Excel', short: 'F24 e dichiarazioni', icon: 'receipt', hue: '#B45309', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              dzText: 'F24, CU, 730, Redditi, IRAP o IVA in PDF (anche scansioni) — tanti file insieme',
              desc: 'F24 (erario, INPS, regioni, IMU), CU, 730, Redditi, IRAP e IVA in Excel: codici tributo, righi, colonne e importi, con la verifica del saldo e il riepilogo per codice. Tanti file insieme.', start: (...a) => startDati(...a) },
  visure:   { title: 'Visure camerali e catastali in dati', short: 'Visure', icon: 'building', hue: '#4338CA', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              dzText: 'Visure camerali o catastali in PDF (anche scansioni) — una o più insieme',
              desc: 'Dalla visura camerale: denominazione, codice fiscale, REA, PEC, ATECO, capitale, amministratori. Dalla visura catastale: foglio, particella, categoria, rendita, intestati e valore ai fini IMU.', start: (...a) => startDati(...a) },
  laboratorio: { title: 'Esami di laboratorio in tabella', short: 'Esami', icon: 'flask', hue: '#BE123C', accept: '.pdf,application/pdf,' + IMG_ACCEPT, multiple: true,
              dzText: 'Referti in PDF o foto — più referti insieme per il confronto nel tempo',
              desc: 'I valori dei referti in una tabella: esame, risultato, unità e intervallo di riferimento, con i valori fuori intervallo evidenziati. Più referti insieme: confronto nel tempo.', start: (...a) => startDati(...a) },
  rilevaai: { title: 'Testo scritto con l’AI?', short: 'Rileva AI', icon: 'aidetect', hue: '#6941C6', accept: '.docx,.docm,.dotx,.pptx,.pptm,.xlsx,.xlsm,.odt,.odp,.ods,.pdf,.txt,.md,.html,.htm,.rtf,.csv', multiple: true, anyFile: true, noFile: 'Incolla o scrivi un testo', noFileIcon: 'type',
              dzText: 'Word, PowerPoint, Excel, PDF, OpenDocument o testo — anche tanti file insieme (per esempio i compiti di una classe)',
              desc: 'Cerca le prove che un testo è stato prodotto o copiato da un assistente AI come Claude: impronte dei programmi con cui l’AI crea i file, nomi degli assistenti nei metadati, caratteri delle chat, residui della conversazione, testo nascosto. Confronta i testi con le risposte dell’AI e tra loro: passaggi identici evidenziati.', start: (...a) => startRilevaAI(...a) },
  contratto: { title: 'Contratto di affitto e comodato', short: 'Contratto affitto', icon: 'lease', hue: '#B45309', accept: '.pdf,.json,application/pdf,application/json', multiple: false, anyFile: true, noFile: 'Compila un nuovo contratto', noFileIcon: 'lease',
              dzText: 'Facoltativo: la visura catastale in PDF (compila immobile e proprietari) o una bozza salvata (.json)',
              desc: 'Contratto di locazione 4+4, 3+2 concordato, transitorio, per studenti, a uso negozio o ufficio, e comodato gratuito: compili i dati nella colonna, il contratto si scrive da solo con le clausole che scegli e ogni articolo si può modificare. PDF e Word, più il promemoria di registrazione e imposte.', start: (...a) => startContratto(...a) },
  qrsepa:   { title: 'QR di pagamento SEPA', short: 'QR pagamento', icon: 'qr', hue: '#0E7490', accept: '.pdf,.xml,.p7m,.zip,application/pdf,text/xml', multiple: true, anyFile: true, noFile: 'Scrivi i dati a mano', noFileIcon: 'type', dzText: 'La fattura (XML, P7M, ZIP o PDF): IBAN, importo e causale si compilano da soli',
              desc: 'Il codice QR per pagare con bonifico: inquadrato con l’app della banca compila IBAN, beneficiario, importo e causale. Dalla fattura (XML o PDF) o scrivendo i dati; in PNG, SVG o stampato sulla fattura.', start: (...a) => startQrSepa(...a) },
  conforme: { title: 'Copia conforme', short: 'Copia conforme', icon: 'stamp', hue: '#7C3AED', accept: '.pdf,application/pdf', multiple: false,
              dzText: 'Il PDF da dichiarare conforme all’originale',
              desc: 'Aggiungi la dicitura di conformità all’originale (avvocati, notai, PA, professionisti): in calce, su ogni pagina o su un foglio a parte, con luogo, data, nome e impronta del file. Poi la firmi digitalmente.', start: (...a) => startConforme(...a) },
  misure:   { title: 'Misure in scala sul PDF', short: 'Misure', icon: 'ruler', hue: '#0369A1', accept: '.pdf,application/pdf', multiple: false,
              dzText: 'La tavola o la planimetria in PDF (meglio se esportata dal CAD)',
              desc: 'Misura distanze, percorsi, superfici e angoli sulle tavole: imposta la scala (1:100, 1:50…) o tarala su una quota nota. Le misure si salvano nel PDF e in Excel.', start: (...a) => startMisure(...a) },
  conta:    { title: 'Conta parole e caratteri', short: 'Conta parole', icon: 'count', hue: '#6D28D9', accept: '.pdf,.docx,.txt,.md,.odt,application/pdf,text/plain,' + IMG_ACCEPT, multiple: true, anyFile: true, noFile: 'Incolla o scrivi un testo', noFileIcon: 'type', dzText: 'PDF, Word (.docx), testo (.txt, .md) o foto di pagine — anche più file insieme',
              desc: 'Parole, caratteri con e senza spazi, cartelle editoriali, frasi, paragrafi e tempo di lettura di PDF, Word e testi; pagina per pagina e parole più usate. Anche incollando un testo.', start: (...a) => startConta(...a) },
  tesi:     { title: 'Tesi: modello e controllo', short: 'Tesi', icon: 'cap', hue: '#1D4ED8', accept: '.pdf,application/pdf', multiple: false, noFile: 'Crea il modello Word per scrivere la tesi', noFileIcon: 'cap', dzText: 'Il PDF della tesi da controllare — oppure, senza file, il modello Word per scriverla',
              desc: 'Il modello Word pronto per scrivere la tesi (frontespizio, indice, capitoli, margini, interlinea, numeri di pagina) e il controllo del PDF finale: margini, carattere, interlinea, pagine, parole e PDF/A.', start: (...a) => startTesi(...a) },
  vettoriale: { title: 'Immagine in SVG (timbri e loghi)', short: 'In SVG', icon: 'vector', hue: '#C2410C', accept: IMG_ACCEPT + ',.pdf,application/pdf', multiple: false,
              dzText: 'Foto o scansione del timbro, del logo o della firma (JPG, PNG, HEIC…) o una pagina PDF',
              desc: 'Una foto o una scansione di un timbro, di un logo o di una firma diventa un disegno vettoriale pulito: colori, spessore e macchie si correggono. Scarica in SVG o in PNG senza sfondo, o salvalo tra i tuoi timbri.', start: (...a) => startVettoriale(...a) },
  filigrana: { title: 'Filigrana', short: 'Filigrana', icon: 'type', hue: '#9F1239', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Aggiungi una scritta («COPIA», «BOZZA», «RISERVATO»…) o un logo su tutte le pagine o solo su alcune: in diagonale, al centro, in basso o ripetuta, con l’intensità che vuoi. Anteprima dal vivo.', start: (...a) => startFiligrana(...a) },
  annota:   { title: 'Commenti e note', short: 'Commenti', icon: 'comment', hue: '#B54708', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Evidenzia, sottolinea e barra il testo, aggiungi note e commenti sulla pagina: annotazioni vere, con autore e data, che si leggono e si rispondono in Acrobat, Anteprima e nei browser. Più il riepilogo dei commenti.', start: (...a) => startAnnota(...a) },
  pdftesto: { title: 'PDF in testo e HTML', short: 'Testo', icon: 'type', hue: '#475467', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Il testo del PDF nell’ordine di lettura, anche dalle scansioni (OCR): un file .txt da copiare ovunque e una pagina web .html con titoli e paragrafi, leggibile su ogni dispositivo.', start: (...a) => startPdfTesto(...a) },
  pdfppt:   { title: 'PDF in PowerPoint', short: 'PowerPoint', icon: 'layout', hue: '#C43E1C', accept: '.pdf,application/pdf', multiple: false,
              desc: 'Ogni pagina diventa una diapositiva con il testo modificabile: caselle di testo vere, con carattere, dimensione, colore e allineamento dell’originale, sopra immagini e grafica identiche. Anche dalle scansioni, con l’OCR. Si apre con PowerPoint, Keynote, Google Presentazioni e LibreOffice.', start: (...a) => startPdfPpt(...a) },
  officepdf: { title: 'Word, Excel, PowerPoint in PDF', short: 'Office in PDF', icon: 'pdf', hue: '#B42318', accept: '.docx,.xlsx,.xlsm,.pptx,.ppt,.txt,.md,.markdown,.csv,.html,.htm,.doc,.xls,.odt,.ods,.rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/markdown,text/csv,text/html', multiple: true, anyFile: true, pdfIn: false, chain: false,
              dzText: 'Word (.docx), Excel (.xlsx), PowerPoint (.pptx), testo, Markdown, CSV o pagine HTML — anche più file insieme',
              desc: 'Documenti Word, fogli Excel, presentazioni PowerPoint, testi e pagine web diventano PDF sul tuo dispositivo: titoli, elenchi, tabelle, immagini, intestazioni e numeri di pagina al loro posto. I fogli si adattano alla larghezza della pagina.', start: (...a) => startOffice(...a) },
  // scorciatoie per mestiere: aprono uno strumento già impostato
  tavola:   { title: 'Stampa una tavola grande', short: 'Stampa tavola', icon: 'poster', hue: '#0E9F6E', accept: '.pdf,application/pdf', multiple: false, alias: 'impagina',
              desc: 'Una tavola A0, A1 o A2 stampata in scala reale su fogli A4 o A3, con le parti che si sovrappongono per incollarle, i crocini e il numero di ogni foglio. Oppure ridotta su un solo foglio.', start: (s, f, t) => startImpagina(s, f, t, { mode: 'poster' }) },
};

// descrizioni brevi per le schede compatte
const SHORT_DESC = {
  estrattoconto: 'Movimenti del conto in Excel, con verifica dei saldi', f24: 'F24, CU, 730, Redditi, IRAP, IVA in Excel', visure: 'Visure camerali e catastali in dati', laboratorio: 'Referti in tabella, valori fuori intervallo evidenziati',
  contratto: 'Locazione e comodato guidati', rilevaai: 'Prove di testo AI e passaggi copiati', qrsepa: 'Il QR per pagare con bonifico', conforme: 'Dicitura di conformità, poi la firma', misure: 'Distanze e superfici in scala', conta: 'Parole, caratteri, cartelle', tesi: 'Modello Word e controllo del PDF', vettoriale: 'Timbri e loghi in SVG e PNG trasparente',
  tavola: 'A0/A1 su fogli A4 o A3', officepdf: 'Word, Excel, PowerPoint e testi in PDF', filigrana: 'Scritta o logo su tutte le pagine', pdftesto: 'Testo e pagina web dal PDF', annota: 'Evidenzia, note e commenti', pdfppt: 'Una diapositiva per pagina',
  unisci: 'Più PDF e immagini in un solo documento', immagini: 'Foto e scansioni in un PDF ordinato', dividi: 'Separa pagine o intervalli in più file',
  comprimi: 'Riduci il peso mantenendo la qualità', modifica: 'Riscrivi il testo, aggiungi immagini e firme', ruota: 'Raddrizza pagine singole o tutte',
  ordina: 'Riordina, aggiungi pagine bianche, elimina', numeri: 'Numerazione, intestazione e piè di pagina', ocr: 'Rendi ricercabili scansioni e foto',
  word: 'Documento Word modificabile', pdfa: 'PDF/A per PEC, Agenzia e conservazione', verificapdfa: 'Controlla se un PDF/A è davvero valido', moduli: 'Compila moduli, anche senza campi',
  firme: 'Apri i .p7m e verifica le firme', xbrl: 'Bilancio leggibile in PDF, CSV ed Excel', excel: 'Tabelle in Excel con numeri veri',
  fatture: 'XML e P7M in PDF, prestazioni in Excel', oscura: 'Elimina per sempre dati sensibili',
  estrai: 'Codici, importi, date e controparti in Excel',
  immaginipdf: 'Pagine in JPG o PNG, foto e allegati contenuti',
  impagina: 'Formato A4, più pagine per foglio, libretto',
  proteggi: 'Password AES 256, limiti di stampa e copia',
  migliora: 'Foto e scansioni nitide, dritte e leggere',
  confronta: 'Differenze tra versioni, evidenziate',
  assistente: 'PEC, portali, stampa: i passaggi li faccio io',
  analisi: 'Indici, flussi, valore e diagnosi dal bilancio',
};
const FISCAL_GROUP = 'Fisco e firme digitali';
const GROUPS = [
  ['Fai tutto tu', ['assistente']],
  ['Modifica e proteggi', ['modifica', 'annota', 'moduli', 'oscura', 'numeri', 'filigrana', 'proteggi']],
  ['Pagine', ['ordina', 'ruota', 'unisci', 'dividi', 'impagina']],
  ['Converti e ottimizza', ['word', 'excel', 'officepdf', 'ocr', 'migliora', 'pdfa', 'verificapdfa', 'comprimi', 'immagini', 'immaginipdf', 'vettoriale']],
  ['Analizza e confronta', ['analisi', 'estrai', 'confronta', 'rilevaai', 'misure', 'conta']],
  [FISCAL_GROUP, ['fatture', 'firme', 'xbrl', 'contratto'], 'Fatture elettroniche, file firmati .p7m, bilanci XBRL e contratti di affitto'],
];
/* ---------- famiglie: strumenti simili o complementari stanno in una scheda sola ----------
   In home compare solo il primo; gli altri sono a un clic sotto di lui e, dentro, nelle linguette in alto
   (il documento aperto passa da una all'altra). Indirizzi, ricerca, ricette e passaggi restano quelli di sempre. */
const FAMILIES = [
  ['ordina', 'Pagine', ['ordina', 'ruota', 'dividi', 'impagina']],
  ['word', 'Converti il PDF', ['word', 'excel', 'pdfppt', 'pdftesto', 'immaginipdf']],
  ['pdfa', 'PDF/A', ['pdfa', 'verificapdfa']],
  ['analisi', 'Bilancio', ['analisi', 'xbrl']],
  ['firme', 'File firmati', ['firme', 'conforme']],
  ['estrai', 'Dati dai documenti', ['estrai', 'estrattoconto', 'f24', 'visure', 'laboratorio']],
  ['fatture', 'Fatture', ['fatture', 'qrsepa']],
  ['conta', 'Testi', ['conta', 'tesi']],
];
const FAM_LABEL = { pdfppt: 'PowerPoint', pdftesto: 'Testo', ordina: 'Organizza', ruota: 'Ruota', dividi: 'Dividi', impagina: 'Impagina', word: 'Word', excel: 'Excel', immaginipdf: 'Immagini',
  pdfa: 'Converti', verificapdfa: 'Verifica', analisi: 'Analisi', xbrl: 'XBRL in PDF ed Excel', firma: 'Firma', firme: 'Verifica e apri .p7m', conforme: 'Copia conforme',
  estrai: 'Dati', estrattoconto: 'Estratto conto', f24: 'F24 e dichiarazioni', visure: 'Visure', laboratorio: 'Esami', fatture: 'Fatture elettroniche', qrsepa: 'QR di pagamento', conta: 'Conta parole', tesi: 'Tesi' };
const FAM_OF = {};
FAMILIES.forEach(([head, name, ids]) => ids.forEach(id => { FAM_OF[id] = { head, name, ids }; }));
const famHidden = id => FAM_OF[id] && FAM_OF[id].head !== id;
// un file va bene per lo strumento? (stessa regola dell'attributo accept)
function fitsAccept(f, accept) {
  if (!accept) return true;
  const n = (f.name || '').toLowerCase(), ty = (f.type || '').toLowerCase();
  return accept.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).some(a => a.startsWith('.') ? n.endsWith(a) : a.endsWith('/*') ? ty.startsWith(a.slice(0, -1)) : ty === a);
}
// passa a un'altra funzione della stessa famiglia portandosi dietro i file, se vanno bene anche lì
function famGo(to) {
  const t = TOOLS[to]; if (!t || to === CURRENT_TOOL) return;
  const f = CURRENT_INPUT || [];
  if (typeof Flow !== 'undefined' && Flow.active && Flow.active()) return nav(to);   // il documento aperto viene ripreso da solo
  if (f.length && f.every(x => fitsAccept(x, t.accept))) return handoff(to, t.multiple ? [...f] : [f[0]]);
  nav(to);
}
function famTabs(id) {
  const fam = FAM_OF[id]; if (!fam) return null;
  return h('nav', { class: 'fam-tabs', 'aria-label': `${fam.name}: le funzioni` },
    fam.ids.filter(x => TOOLS[x]).map(x => h('button', { type: 'button', class: 'fam-tab' + (x === id ? ' on' : ''), 'aria-current': x === id ? 'page' : null, dataset: { id: x }, title: TOOLS[x].desc, onclick: () => famGo(x) }, ic(TOOLS[x].icon, 15), FAM_LABEL[x] || TOOLS[x].short)));
}
let pendingHandoff = null;
let cleanups = [];
function onLeave(fn) { cleanups.push(fn); }
function runCleanups() {
  const c = cleanups; cleanups = [];
  // un lavoro di questo strumento è ancora in corso o in coda: le sue risorse restano finché non finisce
  if (typeof Jobs !== 'undefined' && Jobs.activeFor(GEN)) { Jobs.defer(GEN, c); return; }
  c.forEach(f => { try { f(); } catch (e) { console.warn(e); } });
}

function handoff(id, file) {
  pendingHandoff = file;
  if (routeId() === id) route(); else nav(id);
}

/* ---------- indirizzi ----------
   file unico e pagina pubblicata: #strumento · sito: una pagina vera per strumento (/unire-pdf/), indicizzabile */
const PATH_MODE = IS_SITE;
const pagePath = id => id && TOOLS[id] ? SEO.slug(id) + '/' : '';
function urlFor(id) { return PATH_MODE ? new URL(pagePath(id), SITE_BASE).pathname : '#' + (id || ''); }
const canonicalFor = id => (window.OFFICINA_SITE || location.origin + '/') + pagePath(id);
function routeId() {
  if (location.hash.length > 1) return decodeURIComponent(location.hash.slice(1));
  if (!PATH_MODE) return '';
  const rel = decodeURIComponent(location.pathname).slice(new URL(SITE_BASE).pathname.length).replace(/(index\.html)?$/, '').replace(/\/+$/, '');
  return SEO.idFromSlug(rel);
}
/* pagine dell'area di lavoro (non sono strumenti): progetti, ricette, attività; sempre con l'indirizzo #pagina */
const PAGES = {};
let navHandler = null;
function nav(id) {
  if (!PATH_MODE || PAGES[id]) { if (PATH_MODE && location.pathname !== new URL(SITE_BASE).pathname) { history.pushState(null, '', new URL(SITE_BASE).pathname + '#' + id); if (navHandler) navHandler(); return; } location.hash = id || ''; return; }
  const url = urlFor(id);
  if (url === location.pathname && !location.hash) return;
  history.pushState(null, '', url);
  if (navHandler) navHandler();
}
function setMeta(id) {
  const m = SEO.meta(id);
  document.title = m.title;
  const set = (sel, attr, val) => { const el = document.head.querySelector(sel); if (el) el.setAttribute(attr, val); };
  set('meta[name="description"]', 'content', m.desc);
  if (PATH_MODE) {
    const url = canonicalFor(id);
    set('link[rel="canonical"]', 'href', url); set('meta[property="og:url"]', 'content', url);
    set('meta[property="og:title"]', 'content', m.title); set('meta[property="og:description"]', 'content', m.desc);
  }
}
/* «come funziona», domande frequenti e altri strumenti: utili a chi arriva da un motore di ricerca */
function faqList(items) {
  return h('div', { class: 'faq' }, items.map(([q, a]) => h('details', {}, h('summary', {}, h('span', {}, q), ic('chevron', 16)), h('p', {}, a))));
}
function toolLink(id, cls = 'seo-link') {
  const t = TOOLS[id];
  return h('a', { class: cls, href: urlFor(id), style: { '--hue': t.hue }, onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); Flow.go(id); } }, ic(t.icon, 16), h('span', {}, t.title));
}
const leadOf = p => p.desc.replace(/\s+(Prova ora|Apri il (PDF|modulo)( e ruotalo)?|Trascina (il file|i file e inizia)|Converti ora|Scegli le foto e crea il PDF)\.$/, '');
function seoTool(id) {
  const p = SEO.P[id]; if (!p) return null;
  return h('section', { class: 'seo seo-tool', 'aria-label': 'Come funziona' },
    h('div', { class: 'seo-how' },
      h('h2', {}, p.h2 || p.title),
      h('p', { class: 'seo-lead' }, leadOf(p)),
      h('ol', { class: 'seo-steps' }, p.steps.map((st, i) => h('li', {}, h('b', {}, String(i + 1)), h('span', {}, st))))),
    h('div', { class: 'seo-faq' }, h('h2', {}, 'Domande frequenti'), faqList(p.faq)),
    p.rel && p.rel.length ? h('nav', { class: 'seo-rel', 'aria-label': 'Spesso usato insieme' }, h('h2', {}, 'Spesso usato insieme'),
      h('div', { class: 'seo-rel-l' }, p.rel.filter(k => TOOLS[k]).map(k => { const a = toolLink(k, 'seo-rel-a'); a.append(h('small', {}, SHORT_DESC[k] || '')); return a; }))) : null,
    typeof Ads !== 'undefined' ? Ads.slot('tool-info', id) : null,
    h('nav', { class: 'seo-more', 'aria-label': 'Altri strumenti' }, h('h2', {}, 'Altri strumenti'),
      h('div', { class: 'seo-groups' }, GROUPS.map(([label, ids]) => h('div', { class: 'seo-g' }, h('div', { class: 'seo-g-t' }, label),
        h('div', { class: 'seo-links' }, ids.filter(k => k !== id).map(k => toolLink(k))))))),
    siteFoot());
}
/* piè di pagina: nel sito con le pagine legali e i contatti */
function siteFoot() {
  const mark = h('div', { class: 'foot-mark' }, h('span', { class: 'foot-logo', html: Brand.logoSvg(40, { live: true }) }), h('span', { class: 'wordmark' }, 'file', h('b', {}, '360')));
  if (!IS_SITE) return h('footer', { class: 'site-foot' }, mark);
  const line = h('div', { class: 'foot' }, h('span', { class: 'foot-logo', html: Brand.logoSvg(18) }), IS_SITE ? 'file360 · i file vengono elaborati nel browser, senza caricarli su un server' : 'file360 · tutto avviene sul tuo dispositivo', IS_ARTIFACT ? null : ' · l’OCR scarica il modello della lingua una sola volta, al primo uso');
  const work = Object.keys(PAGES).length ? h('nav', { class: 'work-links', 'aria-label': 'Il tuo lavoro' }, Object.entries(PAGES).map(([id, P]) => h('a', { href: '#' + id, onclick: e => { e.preventDefault(); nav(id); } }, ic(P.icon, 14), P.title))) : null;
  if (!IS_SITE) return work ? h('footer', { class: 'site-foot' }, line, work) : line;
  const a = (href, t) => h('a', { href: new URL(href, SITE_BASE).pathname }, t);
  return h('footer', { class: 'site-foot' }, line, work,
    h('nav', { class: 'site-links', 'aria-label': 'Informazioni' }, a('informazioni/', 'Informazioni'), a('privacy/', 'Privacy'), a('termini/', 'Condizioni d’uso'), a('informazioni/#contatti', 'Contatti e segnalazioni'),
      window.OFFICINA_ADS && window.OFFICINA_ADS.mode !== 'off' ? a('informazioni/#pubblicita', 'Pubblicità e sponsor') : null,
      typeof Ads !== 'undefined' && Ads.consentLink ? Ads.consentLink() : null));
}
function seoHome() {
  return h('section', { class: 'seo seo-home' },
    h('h2', { class: 'seo-why-t' }, 'Perché usare file360'),
    h('div', { class: 'seo-why' }, SEO.HOME.why.map(([icon, t, d]) => h('div', { class: 'why' }, h('span', { class: 'why-ic' }, ic(icon, 20)), h('h3', {}, t), h('p', {}, d)))),
    h('div', { class: 'seo-faq' }, h('h2', {}, 'Domande frequenti'), faqList(SEO.HOME.faq.filter(q => q[2] !== 'site' || (IS_SITE && window.OFFICINA_COUNTER)))));
}

function buildRail() {
  const rail = $('#rail');
  const btn = (id, t) => {
    const fav = typeof Favs !== 'undefined' && Favs.has(id);
    const b = h('button', { class: 'rail-btn', dataset: { id }, title: t.title + (fav ? ' ★' : ''), style: { '--hue': t.hue }, onclick: () => Flow.go(id) }, ic(t.icon, 20), h('span', {}, t.short));
    if (fav) b.append(h('i', { class: 'fav-dot', 'aria-hidden': 'true' }));
    return b;
  };
  const homeBtn = h('button', { class: 'rail-btn', dataset: { id: '' }, title: 'Tutti gli strumenti · Ctrl+K per cercare', style: { '--hue': 'var(--accent)' }, onclick: () => nav('') }, ic('grid', 20), h('span', {}, 'Home'));
  const nodes = [homeBtn];
  // il tuo lavoro (progetti, ricette, attività): subito sotto Home, sempre a portata di mano
  if (Object.keys(PAGES).length) Object.entries(PAGES).forEach(([id, P]) => nodes.push(h('button', { class: 'rail-btn rail-page', dataset: { id }, title: P.title, style: { '--hue': P.hue }, onclick: () => nav(id) }, ic(P.icon, 20), h('span', {}, P.short))));
  // preferiti in cima agli strumenti, se ce ne sono
  const favIds = (typeof Favs !== 'undefined' ? Favs.list() : []).filter(id => TOOLS[id]);
  if (favIds.length) { nodes.push(h('div', { class: 'rail-sep fav', title: 'Preferiti' }, ic('star', 10))); favIds.forEach(id => nodes.push(btn(id, TOOLS[id]))); }
  GROUPS.forEach(([label, ids]) => {
    const rest = ids.filter(id => !favIds.includes(id));
    if (!rest.length) return;
    nodes.push(h('div', { class: 'rail-sep' + (label === FISCAL_GROUP ? ' fiscal' : ''), title: label }, label === FISCAL_GROUP ? h('span', {}, 'Fisco') : null));
    rest.forEach(id => nodes.push(btn(id, TOOLS[id])));
  });
  rail.replaceChildren(...nodes);
  railTab();
  if (typeof Drawer !== 'undefined') Drawer.refresh();
  if (!rail._keys) { rail._keys = true; rail.addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const bs = [...rail.querySelectorAll('.rail-btn')], i = bs.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    bs.forEach((b, k) => b.tabIndex = k === n ? 0 : -1); bs[n].focus();
  }); }
  buildTopWork();
}
/* in alto: Progetti, Ricette e Attività sempre visibili (anche sul telefono, dove la barra laterale non c'è) */
function buildTopWork() {
  const el = document.getElementById('top-work'); if (!el) return;
  el.replaceChildren(...Object.entries(PAGES).map(([id, P]) => h('button', { class: 'tw-btn', dataset: { id }, style: { '--hue': P.hue }, 'data-tip': P.title + ': ' + P.desc.split(/[.:]/)[0].toLowerCase(), 'aria-label': P.title, onclick: () => nav(id) }, ic(P.icon, 17), h('span', {}, P.title))));
  el.hidden = !el.children.length;
}
/* ---------- il menu a comparsa (pulsante ☰ in alto a sinistra) ----------
   Una colonna scura con il marchio grande e il motto, e quello che completa la home: dove andare, azioni rapide,
   i preferiti, un suggerimento alla volta (con il pulsante per provarlo) e cosa succede ai tuoi file.
   Si apre sopra la pagina, si chiude con Esc, con un clic fuori o scegliendo una voce. */
const Drawer = (() => {
  let el = null, scrim = null, back = null, tipI = Math.floor(Math.random() * 7);
  const btn = () => document.getElementById('menu-btn');
  const TIPS = [
    ['Trascina un file direttamente sopra uno strumento: si apre già caricato, senza passare dal riquadro.', null],
    ['Premi Ctrl+Invio per eseguire lo strumento aperto, senza cercare il pulsante.', ['Tutte le scorciatoie', () => typeof UX !== 'undefined' && UX.help()]],
    ['Hai sbagliato? Ctrl+Z torna alla versione precedente del documento, anche dopo aver applicato uno strumento.', null],
    ['Una ricetta ripete gli stessi passaggi su tanti file: trascina i file sopra la ricetta e fa tutto da sola.', ['Apri le ricette', () => nav('ricette')]],
    ['Fai una foto a un foglio: file360 lo trova, lo ritaglia, lo raddrizza e lo schiarisce.', ['Apri Migliora', () => Flow.go('migliora')]],
    ['Metti la stellina agli strumenti che usi di più: compaiono sopra il riquadro della home.', null],
    ['Non sai quale strumento ti serve? Descrivi cosa devi fare: «Fai tutto tu» guarda il file e sceglie i passaggi.', ['Prova «Fai tutto tu»', () => Flow.go('assistente')]],
  ];
  const fileIn = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { const f = [...fileIn.files]; fileIn.value = ''; if (f.length) openFiles(f); } });
  // i file scelti dal menu arrivano al riquadro della home come se li avessi trascinati lì
  function openFiles(files) {
    const deliver = () => { const box = document.querySelector('.home > .wb'); if (!box) return false; const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); box.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true; };
    if (routeId && routeId()) nav('');
    let n = 0; const tryIt = () => { if (!deliver() && ++n < 40) setTimeout(tryIt, 50); }; setTimeout(tryIt, 0);
  }
  const row = (icon, label, sub, fn, extra = {}) => h('button', { type: 'button', class: 'dr-row' + (extra.cls ? ' ' + extra.cls : ''), onclick: () => { close(); fn(); } },
    h('span', { class: 'dr-ic', 'aria-hidden': 'true' }, ic(icon, 18)), h('span', { class: 'dr-tx' }, h('b', {}, label), sub ? h('span', {}, sub) : null), extra.kbd ? h('kbd', {}, extra.kbd) : null);
  const MOD = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '') ? '⌘' : 'Ctrl';
  function tipBox() {
    const box = h('div', { class: 'dr-tip', 'aria-live': 'polite' });
    const draw = () => {
      const TIPS_ALL = [...(Prefs.profile()?.[4] || []).map(t => [t, null]), ...TIPS], TIPS_N = TIPS_ALL.length;
      const [text, act] = TIPS_ALL[tipI % TIPS_N];
      box.replaceChildren(...[h('div', { class: 'dr-tip-h' }, ic('bulb', 16), h('span', {}, 'Lo sapevi?'), h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'dr-mini', 'aria-label': 'Suggerimento precedente', onclick: () => { tipI = (tipI + TIPS_N - 1) % TIPS_N; draw(); } }, ic('left', 15)),
          h('span', { class: 'dr-tip-n' }, `${tipI % TIPS_N + 1}/${TIPS_N}`),
          h('button', { type: 'button', class: 'dr-mini', 'aria-label': 'Suggerimento successivo', onclick: () => { tipI = (tipI + 1) % TIPS_N; draw(); } }, ic('right', 15))),
        h('p', {}, text),
        act ? h('button', { type: 'button', class: 'dr-tip-go', onclick: () => { close(); act[1](); } }, act[0], ic('arrow', 15)) : null].filter(Boolean));
    };
    draw(); return box;
  }
  function build() {
    const pages = Object.entries(typeof PAGES !== 'undefined' ? PAGES : {});
    const favs = (typeof Favs !== 'undefined' ? Favs.list() : []).filter(id => TOOLS[id]);
    const counts = {};
    const work = h('div', { class: 'dr-work' }, pages.map(([id, P]) => {
      const n = h('span', { class: 'dr-count' });
      counts[id] = n;
      return h('a', { class: 'dr-page', href: '#' + id, dataset: { id }, style: { '--hue': P.hue }, onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); close(); nav(id); } },
        h('span', { class: 'dr-ic', 'aria-hidden': 'true' }, ic(P.icon, 18)), h('b', {}, P.title), n);
    }));
    (async () => { try {
      if (counts.progetti && typeof Projects !== 'undefined') { const a = await Projects.list(); counts.progetti.textContent = a.length || ''; }
      if (counts.ricette && typeof Ricette !== 'undefined') counts.ricette.textContent = Ricette.list().length || '';
      if (counts.attivita && typeof Activity !== 'undefined') { const a = await Activity.list(); const d = new Date().toDateString(); const k = a.filter(e => new Date(e.at).toDateString() === d).length; counts.attivita.textContent = k ? k + ' oggi' : ''; }
    } catch { } })();
    const space = h('span', {}, 'Spazio usato: …');
    (async () => { try { const e = await navigator.storage?.estimate?.(); space.textContent = e ? `Spazio usato da progetti e versioni: ${fmtSize(e.usage || 0)}` : 'Progetti e versioni restano in questo browser'; } catch { space.textContent = 'Progetti e versioni restano in questo browser'; } })();
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const themeBtn = document.getElementById('theme-btn');
    el.replaceChildren(...[
      h('div', { class: 'dr-top' },
        h('div', { class: 'dr-brand' }, h('span', { class: 'dr-logo', html: Brand.logoSvg(72, { live: true }) }),
          h('div', {}, h('div', { class: 'dr-wm' }, 'file', h('b', {}, '360')), h('p', { class: 'dr-motto' }, 'Ogni lavoro sui tuoi file, in un giro solo.'))),
        h('button', { type: 'button', class: 'dr-x', 'aria-label': 'Chiudi il menu', onclick: () => close() }, ic('x', 20))),
      h('nav', { class: 'dr-sec', 'aria-label': 'Inizia' }, h('h3', {}, 'Inizia'),
        row('upload', 'Apri un file', 'PDF, foto, .p7m, fatture XML, bilanci', () => fileIn.click(), { cls: 'main' }),
        row('search', 'Cerca uno strumento', 'Scrivi cosa devi fare, anche a parole tue', () => Cmd.show(), { kbd: MOD + ' K' }),
        TOOLS.assistente ? row('spark', 'Fai tutto tu', 'PEC, portali, stampa, archivio: i passaggi li scelgo io', () => Flow.go('assistente')) : null,
        typeof Ricette !== 'undefined' ? row('recipe', 'Nuova ricetta', 'Una sequenza di passaggi da rilanciare con un clic', () => { nav('ricette'); setTimeout(() => Ricette.editor(null, () => { }), 120); }) : null,
        fileIn),
      pages.length ? h('nav', { class: 'dr-sec', 'aria-label': 'Il tuo lavoro' }, h('h3', {}, 'Il tuo lavoro'), work) : null,
      favs.length ? h('nav', { class: 'dr-sec', 'aria-label': 'Preferiti' }, h('h3', {}, 'Preferiti'),
        h('div', { class: 'dr-favs' }, favs.map(id => { const t = TOOLS[id]; return h('a', { class: 'dr-fav', href: urlFor(id), style: { '--hue': t.hue }, onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); close(); Flow.go(id); } }, ic(t.icon, 15), t.short); }))) : null,
      tipBox(),
      h('section', { class: 'dr-sec dr-info', 'aria-label': 'I tuoi file' }, h('h3', {}, 'I tuoi file'),
        h('p', {}, ic('shield', 16), h('span', {}, IS_SITE ? 'Nessun file viene caricato: tutto avviene nel tuo browser.' : 'Nessun file lascia il dispositivo: tutto avviene qui, anche senza internet.')),
        h('p', {}, ic('disk', 16), space),
        h('p', {}, ic('keyboard', 16), h('span', {}, 'Premi ', h('kbd', {}, '?'), ' per tutte le scorciatoie da tastiera'))),
      h('section', { class: 'dr-sec dr-set', 'aria-label': 'Impostazioni' }, h('h3', {}, 'Impostazioni'),
        row(Prefs.profile()?.[2] || 'user', 'Il tuo lavoro', Prefs.profile() ? Prefs.profile()[1] + ' · cambia' : 'Scegli: metto in cima i tuoi strumenti', () => { close(); Onboard.show({ only: 'prof' }); }),
        h('div', { class: 'dr-theme dr-anim', role: 'radiogroup', 'aria-label': 'Animazioni' }, h('span', { class: 'dr-lab' }, 'Animazioni'), [['full', 'Complete'], ['light', 'Leggere'], ['off', 'Nessuna']].map(([v, l]) =>
          h('button', { type: 'button', role: 'radio', 'aria-checked': String(Prefs.anim === v), class: 'dr-chip' + (Prefs.anim === v ? ' on' : ''), onclick: () => { Prefs.set({ anim: v, asked: true }); build(); } }, l)))),
      h('div', { class: 'dr-foot' },
        themeBtn && !themeBtn.hidden && window.Theme ? h('div', { class: 'dr-theme', role: 'radiogroup', 'aria-label': 'Tema' }, [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([v, l]) =>
          h('button', { type: 'button', role: 'radio', 'aria-checked': String(Theme.choice() === v), class: 'dr-chip' + (Theme.choice() === v ? ' on' : ''), title: v === 'auto' ? 'Come il dispositivo; se non ne ha uno, scuro dalle 15 alle 7' : null, onclick: () => Theme.set(v) }, l))) : null,
        typeof UX !== 'undefined' ? h('button', { type: 'button', class: 'dr-chip', onclick: () => { close(); UX.help(); } }, ic('keyboard', 15), 'Scorciatoie') : null,
        h('span', { class: 'dr-ver' }, 'file360'))].filter(Boolean));
  }
  function trap(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button, a[href], input:not([hidden])')].filter(x => x.offsetParent);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
  function open() {
    if (!el) {
      el = h('aside', { class: 'drawer', id: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu di file360', tabindex: '-1' });
      scrim = h('div', { class: 'drawer-scrim', onclick: () => close() });
      document.body.append(scrim, el);
      el.addEventListener('keydown', trap);
    }
    if (el.classList.contains('open')) return;
    back = document.activeElement;
    build();
    el.hidden = scrim.hidden = false;
    requestAnimationFrame(() => { el.classList.add('open'); scrim.classList.add('open'); (el.querySelector('.dr-row.main') || el).focus(); });
    btn()?.setAttribute('aria-expanded', 'true');
    document.querySelector('.app')?.setAttribute('inert', '');
  }
  function close() {
    if (!el || !el.classList.contains('open')) return;
    el.classList.remove('open'); scrim.classList.remove('open');
    btn()?.setAttribute('aria-expanded', 'false');
    document.querySelector('.app')?.removeAttribute('inert');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { if (!el.classList.contains('open')) { el.hidden = scrim.hidden = true; } }, reduce ? 0 : 300);
    const b = back && back.isConnected && back !== document.body ? back : btn(); b?.focus?.({ preventScroll: true });
  }
  return { open, close, toggle: () => (el && el.classList.contains('open') ? close() : open()), isOpen: () => !!el && el.classList.contains('open'), refresh: () => { if (el && el.classList.contains('open')) build(); } };
})();
// con la tastiera la barra è un solo punto di sosta (la voce attiva); dentro ci si muove con le frecce
function railTab() { const bs = [...document.querySelectorAll('#rail .rail-btn')]; if (!bs.length) return; const on = bs.find(b => b.classList.contains('on')) || bs[0]; bs.forEach(b => b.tabIndex = b === on ? 0 : -1); }
let RAIL_ON = '';
function markRail(id) {
  RAIL_ON = id || '';
  document.querySelectorAll('.rail-btn, .tw-btn').forEach(b => { const on = b.dataset.id === (id || ''); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); if (on && id && b.classList.contains('rail-btn')) b.scrollIntoView({ block: 'nearest' }); });
  railTab();
}
/* stellina dei preferiti nell'angolo di ogni scheda: un clic e lo strumento va in cima (home, barra, ricerca) */
function favStar(id) {
  const t = TOOLS[id], on = Favs.has(id);
  const tip = on ? `Togli «${t.short}» dai preferiti` : `Metti «${t.short}» tra i preferiti: lo trovi sempre in cima`;
  return h('button', { type: 'button', class: 'fav-star' + (on ? ' on' : ''), 'aria-pressed': String(on), 'aria-label': tip, 'data-tip': on ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
    onclick: e => { e.preventDefault(); e.stopPropagation(); favToggle(id, { kb: e.detail === 0 }); } }, ic(on ? 'star' : 'star-o', 17));
}
function favToggle(id, { kb = false } = {}) {
  const t = TOOLS[id], on = Favs.toggle(id);
  toastActions(on ? `«${t.short}» aggiunto ai preferiti` : `«${t.short}» tolto dai preferiti`, [['Annulla', () => Favs.toggle(id)]], 5000);
  // la scheda si è spostata: un lampo nella nuova posizione; con la tastiera il fuoco la segue
  requestAnimationFrame(() => {
    const w = [...document.querySelectorAll(`.card-w[data-id="${CSS.escape(id)}"]`)].find(x => x.offsetParent);
    if (!w) return;
    w.classList.remove('moved'); void w.offsetWidth; w.classList.add('moved');
    if (kb) w.querySelector('.fav-star')?.focus();
  });
  return on;
}
/* suggerimento immediato per i pulsanti con la sola icona (data-tip): compare subito, anche con la tastiera */
const Tip = (() => {
  let el = null, timer = 0, cur = null;
  const hide = () => { clearTimeout(timer); cur = null; el?.classList.remove('on'); };
  function show(t) {
    const text = t.getAttribute('data-tip'); if (!text || !t.isConnected) return;
    el ||= document.body.appendChild(h('div', { class: 'tip', role: 'tooltip', 'aria-hidden': 'true' }));
    el.textContent = text; el.style.left = '0px'; el.style.top = '0px'; el.classList.add('on');
    const r = t.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight;
    let x = Math.round(r.left + r.width / 2 - w / 2), y = Math.round(r.bottom + 8);
    if (y + ht > innerHeight - 6) y = Math.round(r.top - ht - 8);
    x = Math.max(6, Math.min(innerWidth - w - 6, x));
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  document.addEventListener('pointerover', e => {
    const t = e.target.closest?.('[data-tip]');
    if (t === cur) return; hide();
    if (!t || e.pointerType === 'touch') return;
    cur = t; timer = setTimeout(() => show(t), 260);
  });
  document.addEventListener('focusin', e => { const t = e.target.closest?.('[data-tip]'); hide(); if (t && t.matches(':focus-visible')) { cur = t; show(t); } });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  addEventListener('scroll', hide, true);
  return { hide };
})();
function starWrap(card, id) { return h('div', { class: 'card-w', dataset: { id } }, card, favStar(id)); }

function toolCard(id) {
  const t = TOOLS[id];
  const card = h('a', { class: 'tool-card', href: urlFor(id), draggable: 'false', style: { '--hue': t.hue },
    onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); Flow.go(id); } },
    h('span', { class: 'led', 'aria-hidden': 'true' }),
    h('div', { class: 't-ic' }, ic(t.icon, 24)),
    h('div', { class: 't-text' }, h('h3', {}, t.title), h('p', { title: t.desc }, SHORT_DESC[id] || t.desc)), h('span', { class: 't-go' }, ic('arrow', 18)),
    h('span', { class: 't-drop', 'aria-hidden': 'true' }, ic('upload', 26), h('b', {}, 'Rilascia qui'), h('span', {}, 'per aprirlo con ' + t.title)));
  dropOpens(card, id);
  return card;
}
// un file trascinato sopra una scheda (o un compito): diventa il riquadro di caricamento di quello strumento
function dropOpens(card, id) {
  const t = TOOLS[id], hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  card.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); card.classList.add('dropping'); } });
  card.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (_) { /* niente */ } card.classList.add('dropping'); });
  card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('dropping'); });
  card.addEventListener('drop', async e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation(); card.classList.remove('dropping');
    const raw = t.folder && typeof filesFromDrop === 'function' ? await filesFromDrop(e.dataTransfer) : [...e.dataTransfer.files];
    const files = acceptFiles(t, raw);
    if (!files.length) return;
    if (Flow.active() && !(await Flow.closeDoc())) return;
    handoff(id, files);
  });
}
/* «Cosa devi fare?»: tutti gli strumenti, in blocchi per categoria (un colore della palette per categoria).
   In cima l'aiuto per chi non sa quale strumento serve (apre «Fai tutto tu», che guarda il file e propone i passaggi).
   La ricerca qui sopra filtra l'elenco mentre si scrive; Invio apre la ricerca completa. */
const INTENTS = [
  ['comprimi', 'Ridurre il peso per PEC e portali'], ['unisci', 'Unire più file in uno'], ['firme', 'Aprire o verificare un .p7m'],
  ['word', 'Trasformare in Word'], ['ocr', 'Rendere ricercabile una scansione'], ['migliora', 'Raddrizzare la foto di un foglio'],
  ['oscura', 'Oscurare dati personali'], ['moduli', 'Compilare un modulo'], ['fatture', 'Leggere una fattura XML'],
  ['dividi', 'Dividere o estrarre pagine'], ['ruota', 'Ruotare le pagine'],
];
const CAT_STYLE = { 'Modifica e proteggi': ['#5A2BFF', 'Modifica e proteggi'], 'Pagine': ['#E8246A', 'Pagine'], 'Converti e ottimizza': ['#D98A00', 'Converti e ottimizza'],
  'Analizza e confronta': ['#00A08A', 'Analizza e confronta'], [FISCAL_GROUP]: ['#1F6FE0', 'Fisco e firme'] };
const foldText = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function homeIntents() {
  const favs = typeof Favs !== 'undefined' ? Favs : null;
  const item = id => {
    const t = TOOLS[id]; if (!t) return null;
    const task = INTENTS.find(x => x[0] === id)?.[1];
    const a = h('a', { class: 'intent tl', href: urlFor(id), draggable: 'false', dataset: { id }, title: t.desc,
      onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); Flow.go(id); } },
      h('span', { class: 'led', 'aria-hidden': 'true' }), h('span', { class: 't-ic', 'aria-hidden': 'true' }, ic(t.icon, 17)), h('span', { class: 'tl-n' }, t.title));
    dropOpens(a, id);
    const qOf = x => [TOOLS[x].title, TOOLS[x].short, TOOLS[x].desc, INTENTS.find(y => y[0] === x)?.[1], (typeof CMD_SYNONYMS !== 'undefined' && CMD_SYNONYMS[x]) || ''].join(' ');
    const fam = FAM_OF[id], others = fam ? fam.ids.filter(x => x !== id && TOOLS[x]) : [];
    const w = h('div', { class: 'tl-w' + (favs?.has(id) ? ' fav' : '') + (others.length ? ' fam' : ''), dataset: { id, q: foldText([qOf(id), ...others.map(qOf)].join(' ')) } }, a);
    if (favs) w.append(favStar(id));
    // le altre funzioni della famiglia, a un clic (e ricevono anche i file trascinati)
    if (others.length) { const sw = 36 + others.reduce((n, x) => n + 16 + 7.2 * (FAM_LABEL[x] || TOOLS[x].short).length, 0); w.style.setProperty('--subw', sw + 'px'); if (sw > 380) w.classList.add('fam-long'); }
    if (others.length) w.append(h('div', { class: 'tl-sub' }, h('span', { class: 'tl-sub-l' }, 'anche'), others.map(x => { const l = h('a', { class: 'tl-s', href: urlFor(x), draggable: 'false', dataset: { id: x }, title: TOOLS[x].desc,
      onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); Flow.go(x); } }, FAM_LABEL[x] || TOOLS[x].short); dropOpens(l, x); return l; })));
    return w;
  };
  const guide = (() => { const t = TOOLS.assistente; if (!t) return null;
    const a = h('a', { class: 'intent guide', href: urlFor('assistente'), draggable: 'false', dataset: { id: 'assistente' },
      onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); Flow.go('assistente'); } },
      h('span', { class: 'led', 'aria-hidden': 'true' }), h('span', { class: 't-ic', 'aria-hidden': 'true' }, ic('spark', 20)),
      h('span', { class: 'g-t' }, h('b', {}, 'Non so cosa mi serve: guidami'), h('span', {}, 'Dimmi a cosa serve il file: guardo il documento e faccio io i passaggi giusti')),
      h('span', { class: 'g-go', 'aria-hidden': 'true' }, ic('arrow', 18)));
    dropOpens(a, 'assistente'); return a; })();
  const prof = typeof Prefs !== 'undefined' ? Prefs.profile() : null;
  const rank = ids => prof ? -ids.reduce((n, id) => n + prof[3].filter(x => x === id || FAM_OF[x]?.head === id || TOOLS[x]?.alias === id).length, 0) : 0;
  void rank;   // le categorie restano sempre nello stesso ordine: chi sceglie una professione deve ritrovare tutto dove l'ha lasciato
  const cats = GROUPS.filter(([, ids]) => !ids.every(id => id === 'assistente')).map(([label, ids]) => {
    const [color, name] = CAT_STYLE[label] || ['#5A2BFF', label];
    // prima le famiglie (una riga intera ciascuna), poi le schede singole, affiancate e tutte uguali
    const vis = ids.filter(id => !famHidden(id)), fam = id => FAM_OF[id] && FAM_OF[id].ids.some(x => x !== id && TOOLS[x]);
    const list = [...vis.filter(fam), ...vis.filter(id => !fam(id))].map(item).filter(Boolean);
    return h('section', { class: 'tcat', style: { '--cat': color }, 'aria-label': name },
      h('h3', { class: 'tcat-h' }, h('i', { class: 'tcat-dot', 'aria-hidden': 'true' }), name, h('span', { class: 'tcat-n' }, plural(list.length, 'strumento', 'strumenti'))),
      h('div', { class: 'tcat-l' }, list));
  });
  const none = h('p', { class: 'tcat-none', hidden: true });
  const box = h('section', { class: 'intents', 'aria-labelledby': 'intents-h' },
    h('div', { class: 'intents-h' }, h('h2', { id: 'intents-h' }, 'Cosa devi fare?'), homeSearch()),
    guide, h('div', { class: 'tcats' }, cats), none);
  /* trascinando un file sulla pagina, le schede vicine al puntatore si gonfiano un poco (più vicine, più grandi);
     quella sotto il puntatore cresce e trema, pronta a riceverlo */
  {
    let raf = 0, ev = null;
    const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
    const tiles = () => box.querySelectorAll('.intent.tl, .intent.guide');
    const near = e => {
      if (!hasFiles(e) || !box.isConnected) return; ev = e; if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; box.classList.add('drag-near');
        tiles().forEach(a => { const r = a.getBoundingClientRect(); const dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right), dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
          a.style.setProperty('--near', Math.max(0, 1 - Math.hypot(dx, dy) / 150).toFixed(2)); }); });
    };
    const reset = () => { cancelAnimationFrame(raf); raf = 0; box.classList.remove('drag-near'); tiles().forEach(a => { a.style.removeProperty('--near'); a.classList.remove('dropping'); }); };
    const leave = e => { if (!e.relatedTarget || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight) reset(); };
    document.addEventListener('dragover', near); document.addEventListener('dragleave', leave); document.addEventListener('drop', reset); document.addEventListener('dragend', reset);
    if (typeof onLeave === 'function') onLeave(() => { document.removeEventListener('dragover', near); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', reset); document.removeEventListener('dragend', reset); });
  }
  // filtro dal vivo: le parole scritte nella ricerca restringono l'elenco (senza accenti, ogni parola deve esserci)
  const input = box.querySelector('.home-search-input');
  input?.addEventListener('input', () => {
    const words = foldText(input.value).split(/\s+/).filter(w => w.length > 1);
    let shown = 0;
    box.querySelectorAll('.tl-w').forEach(w => { const ok = !words.length || words.every(x => w.dataset.q.includes(x)); w.hidden = !ok; if (ok) shown++; });
    box.querySelectorAll('.tcat').forEach(c => { c.hidden = !c.querySelector('.tl-w:not([hidden])'); });
    if (guide) guide.hidden = !!words.length;
    none.hidden = !!shown || !words.length;
    if (!shown && words.length) none.replaceChildren('Nessuno strumento con queste parole. ', h('button', { type: 'button', class: 'linklike', onclick: () => Cmd.show(input.value) }, 'Cerca anche nelle funzioni', ic('arrow', 14)));
  });
  return box;
}
function homeSearch() {
  const input = h('input', {
    class: 'home-search-input', type: 'search', name: 'q', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Es. riduci il peso, oscura un IBAN…',
    'aria-label': 'Cerca uno strumento o descrivi l’operazione che vuoi fare',
  });
  const form = h('form', { class: 'home-search', role: 'search', 'aria-label': 'Ricerca strumenti PDF',
    onsubmit: e => { e.preventDefault(); Cmd.show(input.value); } },
    ic('search', 20), input,
    h('kbd', { class: 'home-search-shortcut' }, navigator.platform?.includes('Mac') ? '⌘ K' : 'Ctrl K'),
    h('button', { class: 'home-search-submit', type: 'submit', 'aria-label': 'Cerca tra gli strumenti' }, h('span', {}, 'Cerca'), ic('arrow', 16)));
  const examples = ['Riduci il peso', 'Oscura dati personali', 'PDF in Excel'];
  return h('div', { class: 'home-search-wrap' },
    h('div', { class: 'home-search-label' }, 'Che cosa devi fare?'),
    form,
    h('div', { class: 'home-search-examples', 'aria-label': 'Esempi di ricerca' },
      h('span', {}, 'Prova:'), ...examples.map(q => h('button', { type: 'button', onclick: () => Cmd.show(q) }, q))));
}

/* ---------- professione e animazioni: chiesti solo al primo avvio, si cambiano dal menu ☰ ----------
   La professione mette in cima gli strumenti di quel lavoro e riordina le categorie; nessuno strumento sparisce. */
const UNIVERSAL = ['comprimi', 'unisci', 'dividi', 'modifica', 'immagini', 'word', 'ocr', 'conta'];
const PROFILES = [
  ['pa', 'Pubblica amministrazione', 'building', ['firme', 'conforme', 'oscura', 'pdfa', 'numeri', 'unisci'], ['Per l’albo: «Oscura» toglie i dati personali, poi «PDF/A» prepara il file per la pubblicazione e la conservazione.', '«Copia conforme» aggiunge la dicitura con l’impronta del file; poi lo firmi con «Firma».']],
  ['contabile', 'Contabilità', 'table', ['estrattoconto', 'fatture', 'qrsepa', 'excel', 'f24'], ['«Estratto conto» porta i movimenti in Excel e verifica che i saldi tornino.', 'Dalla fattura (XML o PDF) creo il codice QR per pagarla con bonifico dall’app della banca.']],
  ['commercialista', 'Commercialista', 'receipt', ['f24', 'fatture', 'estrattoconto', 'visure', 'analisi', 'firme', 'xbrl'], ['«F24 e dichiarazioni» legge tanti F24 insieme e fa il riepilogo per codice tributo.', 'Dalle visure catastali calcolo anche il valore ai fini IMU di ogni immobile.']],
  ['lavoro', 'Consulente del lavoro', 'user', ['f24', 'proteggi', 'oscura', 'firme', 'moduli'], ['«Oscura» toglie IBAN, codici fiscali e altri dati personali prima di inoltrare un documento.', '«Proteggi» mette una password diversa a ogni cedolino prima dell’invio.']],
  ['notaio', 'Notaio', 'seal', ['conforme', 'visure', 'firme', 'oscura', 'confronta', 'migliora'], ['«Copia conforme» con la formula notarile; «Firme» verifica i .p7m che ricevi ed estrae il PDF.', '«Confronta» trova ogni parola cambiata tra due bozze dell’atto.']],
  ['avvocato', 'Avvocato', 'sign', ['conforme', 'firme', 'unisci', 'numeri', 'confronta', 'oscura', 'pdfa'], ['Attestazione di conformità per il deposito: «Copia conforme»; «Firme» verifica le firme dei .p7m ricevuti.', 'Allegati numerati con «Numeri di pagina», atti uniti con «Unisci».']],
  ['architetto', 'Architetto', 'poster', ['misure', 'tavola', 'comprimi', 'confronta', 'firme', 'migliora'], ['«Misure in scala» si aggancia agli spigoli del disegno: misure esatte su piante e sezioni.', '«Stampa una tavola grande» divide un A1 su fogli A4 in scala reale.']],
  ['ingegnere', 'Ingegnere', 'ruler', ['misure', 'tavola', 'comprimi', 'confronta', 'firme', 'pdfa'], ['Tavole troppo pesanti per il portale? «Comprimi» le alleggerisce senza perdere le linee.', '«Confronta» mostra cosa è cambiato tra due revisioni.']],
  ['geometra', 'Geometra', 'home', ['visure', 'contratto', 'misure', 'tavola', 'migliora', 'comprimi', 'firme'], ['Dalle visure catastali: foglio, particella, rendita e valore IMU in Excel.', 'Le planimetrie vecchie scansionate: «Migliora» le raddrizza e le pulisce.']],
  ['sanitario', 'Medico o sanitario', 'flask', ['laboratorio', 'proteggi', 'oscura', 'moduli', 'unisci', 'migliora'], ['«Esami di laboratorio» mette i referti in tabella e confronta i valori nel tempo.', 'Prima di inviare un referto, «Proteggi» lo chiude con una password.']],
  ['insegnante', 'Insegnante', 'bulb', ['conta', 'immagini', 'migliora', 'impagina', 'word', 'oscura'], ['Le foto delle verifiche diventano un PDF pulito con «Immagini in PDF» e «Migliora».', '«Impagina» stampa 2 o 4 pagine per foglio, o un libretto.']],
  ['studente', 'Studente', 'cap', ['tesi', 'conta', 'migliora', 'comprimi', 'pdfa', 'impagina'], ['«Tesi» prepara il modello Word con frontespizio e indice, e controlla il PDF finale.', '«Conta parole» ti dice battute e cartelle, anche con un limite da rispettare.']],
  ['personale', 'Uso personale', 'user', ['migliora', 'moduli', 'comprimi', 'unisci', 'firme', 'vettoriale'], ['Moduli da compilare? «Compila» trova da solo gli spazi, anche nelle scansioni.', 'Una foto della carta d’identità diventa un PDF pulito con «Migliora».']],
  ['altro', 'Altro', 'spark', [], []],
];
const Prefs = (() => {
  const K = 'file360-prefs'; let p = {};
  try { p = JSON.parse(localStorage.getItem(K) || '{}'); } catch { }
  const apply = () => {
    const a = p.anim || 'full';   // «riduci movimento» del dispositivo vale comunque (logo e sfondo fermi)
    document.documentElement.dataset.anim = a;
    try { if (typeof BgFlow !== 'undefined') BgFlow.apply(); } catch (e) { console.warn(e); }
    document.querySelectorAll('svg.logo-live').forEach(s => { try { a === 'off' ? s.pauseAnimations() : s.unpauseAnimations(); } catch { } });
  };
  return {
    get prof() { return p.prof || null; }, get anim() { return p.anim || 'full'; }, get asked() { return !!p.asked; },
    profile() { return PROFILES.find(x => x[0] === p.prof) || null; },
    set(o) { Object.assign(p, o); try { localStorage.setItem(K, JSON.stringify(p)); } catch { } apply(); },
    apply,
  };
})();
const Onboard = (() => {
  // passo 1: che lavoro fai; passo 2: quanto movimento. Si può saltare; dal menu si torna qui
  function show({ only = null } = {}) {
    let prof = Prefs.prof, anim = Prefs.anim, m = null;
    const done = () => { Prefs.set({ prof, anim, asked: true }); m?.close(); if (!routeId()) showHome(); if (typeof Drawer !== 'undefined') Drawer.refresh?.(); };
    const stepProf = () => [h('div', { class: 'ob-head' }, h('span', { class: 'ob-step' }, only ? 'Il tuo lavoro' : 'Passo 1 di 2'), h('h2', {}, 'Che lavoro fai?'),
        h('p', { class: 'muted' }, 'Metto in cima gli strumenti che ti servono di più e riordino il resto. Tutti gli strumenti restano a portata di mano; puoi cambiare idea dal menu ☰.')),
      h('div', { class: 'ob-grid', role: 'radiogroup', 'aria-label': 'Professione' }, PROFILES.map(([id, label, icn]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(prof === id), class: 'ob-p' + (prof === id ? ' on' : ''), onclick: () => { prof = id; if (only) done(); else draw(stepAnim); } }, ic(icn, 22), h('span', {}, label)))),
      h('div', { class: 'ob-foot' }, h('button', { class: 'btn ghost', onclick: () => { if (only) { m.close(); return; } prof = null; draw(stepAnim); } }, only ? 'Annulla' : 'Salta'))];
    const stepAnim = () => [h('div', { class: 'ob-head' }, h('span', { class: 'ob-step' }, only ? 'Animazioni' : 'Passo 2 di 2'), h('h2', {}, 'Quanto movimento ti piace?'),
        h('p', { class: 'muted' }, 'Puoi cambiarlo quando vuoi dal menu ☰.')),
      h('div', { class: 'ob-anim', role: 'radiogroup', 'aria-label': 'Animazioni' }, [['full', 'Completo', 'Apertura animata, documenti che scorrono piano sullo sfondo, piccoli effetti.'], ['light', 'Leggero', 'Solo i piccoli effetti: niente apertura animata né sfondo in movimento.'], ['off', 'Nessuno', 'Tutto fermo: per chi il movimento disturba, o per risparmiare batteria.']]
        .map(([v, l, d]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(anim === v), class: 'ob-a' + (anim === v ? ' on' : ''), onclick: e => { anim = v; e.currentTarget.parentNode.querySelectorAll('.ob-a').forEach(b => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); document.documentElement.dataset.anim = v; } }, h('b', {}, l), h('span', {}, d)))),
      h('div', { class: 'ob-foot' }, only ? null : h('button', { class: 'btn ghost', onclick: () => draw(stepProf) }, ic('left', 16), 'Indietro'), h('button', { class: 'btn primary', onclick: done }, only ? 'Fatto' : 'Inizia'))];
    const box = h('div', { class: 'ob' });
    const draw = f => { box.replaceChildren(...f()); box.querySelector('.ob-p.on, .ob-a.on, .ob-p, .btn.primary')?.focus(); };
    draw(only === 'anim' ? stepAnim : stepProf);
    m = modal([box], { width: 760, cls: 'ob-modal', label: 'Benvenuto in file360', onClose: () => { if (!Prefs.asked) Prefs.set({ asked: true }); Prefs.apply(); } });
  }
  // al primo avvio, finita l'apertura animata, solo in home e non durante i test automatici
  function maybe() {
    if (Prefs.asked || (navigator.webdriver && !window.__forceOnboarding) || window.__oauthPopup) return;
    const go = () => { if (!routeId() && !document.querySelector('.scrim:not(.busy)')) show(); };
    setTimeout(go, document.getElementById('intro') ? 3100 : 700);
  }
  return { show, maybe };
})();
// in home, sotto il riquadro del file: gli strumenti utili a tutti, e quelli del tuo lavoro
function homeQuick() {
  const tile = id => { const t = TOOLS[id]; if (!t) return null; const a = h('a', { class: 'qk', href: urlFor(id), dataset: { id }, title: t.desc, style: { '--hue': t.hue },
    onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); Flow.go(id); } }, h('span', { class: 'qk-ic', 'aria-hidden': 'true' }, ic(t.icon, 16)), h('span', { class: 'qk-n' }, t.short)); dropOpens(a, id); return a; };
  const P = Prefs.profile();
  return h('div', { class: 'home-quick2' },
    P && P[3].length ? h('section', { class: 'pf-block pf-you', 'aria-label': 'Per il tuo lavoro' }, h('h3', {}, h('span', {}, 'Per il tuo lavoro'), h('b', {}, P[1]), h('button', { class: 'linkish pf-ch', onclick: () => Onboard.show({ only: 'prof' }) }, 'Cambia')), h('div', { class: 'qk-l' }, P[3].map(tile)),
      h('button', { class: 'linkish pf-allt', onclick: () => document.querySelector('.intents')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Tutti gli strumenti, per categoria →')) : null,
    h('section', { class: 'pf-block pf-all', 'aria-label': 'Per tutti, ogni giorno' }, h('h3', {}, h('span', {}, 'Per tutti, ogni giorno')), h('div', { class: 'qk-l' }, UNIVERSAL.map(tile))),
    !P ? h('button', { class: 'linkish pf-ask', onclick: () => Onboard.show({ only: 'prof' }) }, ic('user', 15), 'Dimmi che lavoro fai: metto in cima i tuoi strumenti') : null);
}

function showHome() {
  runCleanups(); GEN++; CURRENT_TOOL = null; CURRENT_SUBJECT = ''; CURRENT_INPUT = []; markRail('');
  Flow.onOpen(null);
  setMeta('');
  const main = $('#main');
  // chi torna (ha preferiti, strumenti usati o lavori salvati) vuole lavorare: la presentazione si fa piccola
  const back = (typeof Favs !== 'undefined' && Favs.list().length) || (typeof Recents !== 'undefined' && Recents.get().length);
  if (typeof Favs !== 'undefined') { const marks = () => document.querySelectorAll('.home .tl-w').forEach(w => { const on = Favs.has(w.dataset.id); w.classList.toggle('fav', on); w.querySelector('.fav-star')?.replaceWith(favStar(w.dataset.id)); }); Favs.on(marks); onLeave(() => Favs.off(marks)); }
  main.replaceChildren(h('div', { class: 'home' + (back ? ' back' : '') + (showHome.seen ? '' : ' enter') },
    h('section', { class: 'hero' },
      h('div', { class: 'hero-mark', html: Brand.logoSvg(64) }),
      h('h1', {}, 'Tutto quello che serve ai tuoi PDF, ', h('em', {}, 'in un solo posto.')),
      // nel sito il testo lungo serve a chi arriva da un motore di ricerca; nel programma basta dire cosa fare adesso
      h('p', {}, IS_SITE ? 'Modifica, unisci, comprimi, converti in Word ed Excel, rendi ricercabili le scansioni e oscura i dati sensibili. Fatture elettroniche, bilanci XBRL e file firmati inclusi. Tutto nel browser, senza registrazione e senza caricare i file online.'
        : 'Lascia qui sotto un file, oppure scegli cosa devi fare. I documenti restano su questo dispositivo.')),
    // a sinistra il riquadro del file (e, sul computer, il tuo lavoro sotto); a destra tutti gli strumenti
    h('div', { class: 'home-left' }, Flow.homePanel(), homeQuick()),
    homeIntents(),
    workRow(),
    typeof Ads !== 'undefined' ? Ads.slot('home') : null,
    seoHome(),
    siteFoot()));
  main.scrollTop = 0; showHome.seen = true;
  if (typeof Counter !== 'undefined') Counter.show();
}
/* le schede degli strumenti in home: prima i preferiti, poi gli altri gruppi (senza ripetere i preferiti) */
function homeTools() {
  const favs = typeof Favs !== 'undefined' ? Favs.list() : [];
  const grid = ids => h('div', { class: 'tools' + (ids.length === 6 ? ' c3' : '') + (ids.length === 1 ? ' solo' : '') }, ids.map(id => starWrap(toolCard(id), id)));
  const out = [h('div', { class: 'home-sub' }, h('span', {}, favs.length ? 'I tuoi strumenti' : 'Oppure parti da uno strumento'))];
  if (favs.length) out.push(h('section', { class: 'tool-group favs' },
    h('div', { class: 'group-t' }, h('h2', { class: 'group-h' }, ic('star', 15), 'Preferiti'), h('span', { class: 'group-sub' }, 'Tocca la stellina per toglierli')), grid(favs)));
  else out.push(h('p', { class: 'fav-hint' }, ic('star-o', 15), h('span', {}, 'Tocca la ', h('b', {}, 'stellina'), ' in alto su una scheda: quello strumento va tra i preferiti, sempre in cima qui, nella barra e nella ricerca.')));
  GROUPS.forEach(([label, ids, sub]) => {
    const rest = ids.filter(id => !favs.includes(id));
    if (!rest.length) return;
    out.push(h('section', { class: 'tool-group' + (label === FISCAL_GROUP ? ' fiscal' : '') },
      h('div', { class: 'group-t' }, h('h2', { class: 'group-h' }, label === FISCAL_GROUP ? ic('seal', 15) : null, label), sub ? h('span', { class: 'group-sub' }, sub) : null),
      grid(rest)));
  });
  return out;
}
/* «Il tuo lavoro» in home: progetti, ricette e attività con quello che contengono, a un clic */
function workRow() {
  if (!Object.keys(PAGES).length) return null;
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'poco fa' : m < 60 ? `${m} min fa` : m < 1440 ? `${Math.round(m / 60)} ore fa` : m < 2880 ? 'ieri' : new Date(t).toLocaleDateString('it-IT'); };
  const card = (id, empty) => {
    const P = PAGES[id]; if (!P) return null;
    const stat = h('span', { class: 'wk-n' }), sub = h('span', { class: 'wk-s muted small' }, empty);
    const el = h('a', { class: 'wk', href: '#' + id, dataset: { id }, style: { '--hue': P.hue }, onclick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); nav(id); } },
      h('span', { class: 'wk-ic' }, ic(P.icon, 20)), h('span', { class: 'wk-t' }, h('b', {}, P.title, stat), sub), h('span', { class: 'wk-go' }, ic('arrow', 16)));
    return { el, stat, sub };
  };
  const pj = card('progetti', 'Ogni file che apri diventa un progetto, con versioni e risultati.');
  const rc = card('ricette', 'Salva una sequenza di passaggi e rilanciala con un clic.');
  const at = card('attivita', 'Il registro di ogni operazione, esportabile.');
  (async () => {
    try {
      if (pj && typeof Projects !== 'undefined') { const a = await Projects.list(); if (a.length) { pj.stat.textContent = a.length; pj.sub.textContent = `Ultimo: «${a[0].name}» · ${ago(a[0].updated)}`; } }
      if (rc && typeof Ricette !== 'undefined') { const a = Ricette.list(); if (a.length) { rc.stat.textContent = a.length; rc.sub.textContent = a.slice(0, 2).map(r => r.name).join(' · ') + (a.length > 2 ? ` e altre ${a.length - 2}` : ''); } else rc.sub.textContent = 'Parti da un modello: «Pronto per PEC», «Archivio ricercabile»…'; }
      if (at && typeof Activity !== 'undefined') { const a = await Activity.list(); if (a.length) { const today = new Date().toDateString(), n = a.filter(e => new Date(e.at).toDateString() === today).length; at.stat.textContent = a.length; at.sub.textContent = `Ultima: ${a[0].toolName} · ${ago(a[0].at)}${n ? ` · ${n} oggi` : ''}`; } }
    } catch (e) { console.warn(e); }
  })();
  return h('section', { class: 'work-row', 'aria-label': 'Il tuo lavoro' }, h('div', { class: 'wr-h' }, h('h2', {}, 'Il tuo lavoro'), h('span', { class: 'muted small' }, 'Salvato solo in questo browser')),
    h('div', { class: 'wr-l' }, [pj, rc, at].filter(Boolean).map(c => c.el)));
}

/* sul telefono: invito (una volta, chiudibile) ad aggiungere file360 alla schermata Home, così si apre come un'app */
const InstallTip = {
  K: 'officina.installTip',
  standalone: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  el() {
    if (!IS_TOUCH || IS_ARTIFACT || this.standalone() || !/^https:$/.test(location.protocol)) return null;
    try { if (localStorage.getItem(this.K)) return null; } catch { return null; }
    const ios = IS_IOS, box = h('div', { class: 'inst-tip' }, h('span', { class: 'inst-ic' }, ic('phone', 20)),
      h('div', { class: 'inst-t' }, h('b', {}, 'Usala come un’app'), h('span', { class: 'muted small' }, ios ? 'Tocca Condividi (il quadrato con la freccia) e poi «Aggiungi alla schermata Home».' : 'Dal menu del browser scegli «Installa app» o «Aggiungi a schermata Home».')),
      h('button', { class: 'icon-btn', title: 'Chiudi', 'aria-label': 'Chiudi', onclick: () => { try { localStorage.setItem(this.K, '1'); } catch { } box.remove(); } }, ic('x', 16)));
    return box;
  },
};
function showPage(id) {
  Later.all();
  runCleanups(); GEN++; CURRENT_TOOL = null; CURRENT_SUBJECT = ''; CURRENT_INPUT = []; markRail(id);
  Flow.onOpen(null);
  const P = PAGES[id];
  document.title = P.title + ' · file360';
  const main = $('#main');
  const body = h('div', { class: 'page-body' });
  main.replaceChildren(h('div', { class: 'tool page', style: { '--hue': P.hue } },
    h('div', { class: 'toolhead' }, iconBtn('back', 'Home', () => nav('')), h('div', { class: 't-ic' }, ic(P.icon, 22)), h('div', { class: 'th-text' }, h('h1', {}, P.title), h('p', {}, P.desc))),
    body), siteFoot());
  main.scrollTop = 0;
  try { P.render(body); } catch (e) { Errors.show(e); }
}
function openTool(id, preload, { fresh = false } = {}) {
  { const fn = String(TOOLS[id]?.start || '').match(/\b(start[A-Z]\w*)/)?.[1]; Later.need(fn); } warmLibs(id);
  runCleanups(); GEN++;
  document.querySelectorAll('#toasts .toast.act').forEach(t => t.remove());
  const t = TOOLS[id]; CURRENT_TOOL = id; CURRENT_SUBJECT = ''; CURRENT_INPUT = []; markRail(id);
  if (typeof Recents !== 'undefined') Recents.push(id);
  Flow.onOpen(id);
  if (!preload && !fresh) preload = Flow.preloadFor(id);
  setMeta(id);
  const main = $('#main');
  const stage = h('div', { class: 'stage' });
  const changeBtn = h('button', { class: 'btn sm ghost', hidden: true, title: 'Lavora su un altro file', onclick: async () => { if (Flow.active() && !(await Flow.closeDoc())) return; openTool(id, null, { fresh: true }); } }, ic('upload', 16), h('span', { class: 'th-l' }, 'Altro file'));
  const barSlot = h('div', { class: 'docbar-slot' });
  const fillBar = () => barSlot.replaceChildren(...[Flow.bar(id)].filter(Boolean));
  const view = h('div', { class: 'tool', style: { '--hue': t.hue } },
    h('div', { class: 'toolhead' },
      iconBtn('back', 'Home', () => nav('')),
      h('div', { class: 't-ic' }, ic(t.icon, 22)),
      h('div', { class: 'th-text' }, h('h1', {}, (IS_SITE && SEO.P[id] && SEO.P[id].h1) || t.title), h('p', {}, t.desc)),
      famTabs(id),
      typeof Favs !== 'undefined' ? (() => { const b = h('button', { class: 'icon-btn th-fav' + (Favs.has(id) ? ' on' : ''), 'aria-pressed': String(Favs.has(id)), title: Favs.has(id) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti (in cima alla barra e nella ricerca)', onclick: () => { const on = Favs.toggle(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Togli dai preferiti' : 'Aggiungi ai preferiti (in cima alla barra e nella ricerca)'; b.replaceChildren(ic(on ? 'star' : 'star-o', 18)); toast(on ? `«${t.short}» tra i preferiti` : `«${t.short}» tolto dai preferiti`); } }, ic(Favs.has(id) ? 'star' : 'star-o', 18)); return b; })() : null,
      changeBtn),
    barSlot,
    stage);
  fillBar();
  main.replaceChildren(view); main.scrollTop = 0;
  // gli avvisi (in alto a destra sul computer) si mettono sotto intestazione e barra del documento
  if (typeof ResizeObserver !== 'undefined') {
    const th = view.firstChild, setH = () => document.documentElement.style.setProperty('--toolhead-h', (th.offsetHeight + barSlot.offsetHeight) + 'px');
    const ro = new ResizeObserver(setH); ro.observe(th); ro.observe(barSlot); onLeave(() => ro.disconnect());
  }
  const seoBox = seoTool(id);
  const withDz = () => [dropzone(t, begin), seoBox].filter(Boolean);
  const begin = async files => {
    const gen = GEN;
    CURRENT_SUBJECT = files.length === 1 ? (files[0]?.name || '') : files.length > 1 ? `${files.length} file` : '';
    CURRENT_INPUT = [...files];
    if (!files._fromSession && typeof Counter !== 'undefined') Counter.files(files);
    if (seoBox) seoBox.remove();
    try {
      const had = Flow.active();
      await Flow.loaded(id, files);
      if (!had || !files._fromSession) fillBar();
      // file del tipo sbagliato per questo strumento (un PDF in «Immagini in PDF», in «XBRL»…): lo si dice subito, con lo
      // strumento adatto, invece di un errore generico a metà lavoro
      if (files.length && t.accept && !files.some(f => matchAccept(t.accept, f) || (/pdf/.test(t.accept) && isPdf(f)) || (/image/.test(t.accept) && isImage(f)) || (t.anyFile && !/\.(pdf|jpe?g|png|heic|heif|tiff?|webp|gif|bmp|avif)$/i.test(f.name || '')))) {
        const f = files[0], kind = typeof Flow !== 'undefined' ? Flow.kindOf(f) : 'other', ext = (f.name.match(/\.([^.]+)$/)?.[1] || '').toUpperCase();
        const sugg = ({ pdf: { immagini: ['immaginipdf', 'unisci'], xbrl: ['analisi'], vettoriale: ['immaginipdf'] }, img: { xbrl: ['immagini'], fatture: ['immagini'] } }[kind] || {})[id] || [];
        const what = kind === 'pdf' ? 'un PDF' : kind === 'img' ? 'un’immagine' : ext ? `un file ${ext}` : 'un file di un altro tipo';
        const e = codedError(`«${f.name}» è ${what}: «${t.title}» lavora con ${acceptLabel(t.accept)}.${sugg.length ? ' Per questo file prova ' + sugg.filter(k => TOOLS[k]).map(k => '«' + TOOLS[k].title + '»').join(' o ') + '.' : ''}`, 'FORMAT');
        e.file = f;
        if (sugg.length && typeof toastActions === 'function') setTimeout(() => toastActions(`Apri «${f.name}» con:`, sugg.filter(k => TOOLS[k]).map(k => [TOOLS[k].short || TOOLS[k].title, () => handoff(k, f)]), 12000), 50);
        throw e;
      }
      await t.start(stage, files, t);
      if (gen === GEN && stage.querySelector('.ws') && !t.resume) changeBtn.hidden = false;   // chi riprende il lavoro (Fatture) ha già «Aggiungi» e «Svuota»
    } catch (e) {
      Busy.hide();
      if (gen !== GEN) return;
      const info = Errors.show(e, { tool: id, file: e?.file || (files.length === 1 ? files[0] : null), retry: files.length ? () => openTool(id, files) : null, inline: true });
      // un file che non si è potuto aprire (rotto, non un PDF, sparito) non resta come «documento aperto»
      if (!files._fromSession && info && ['invalid', 'format', 'missing'].includes(info.kind) && Flow.active() && Flow.state()?.n === 1) { Flow.close(); fillBar(); }
      stage.replaceChildren(...withDz());
      const dzEl = stage.querySelector('.dropzone');
      // gli avvisi d'errore usciti durante l'apertura (file per file) dicono la stessa cosa del riquadro: via
      if (dzEl && info && info.kind !== 'abort') document.querySelectorAll('#toasts .toast.error').forEach(x => x.remove());
      if (dzEl && info && info.kind !== 'abort') {
        // riquadro d'errore: cosa è successo (titolo), perché (testo, con il nome del file se non c'è già), cosa fare (pulsanti)
        const fname = files.length === 1 || e?.file ? (e?.file || files[0])?.name : '';
        const text = fname && !info.text.includes(fname) ? `«${fname}»: ${info.text}` : info.text;
        const acts = info.actions.slice(0, 2);
        dzEl.prepend(h('div', { class: 'dz-err', role: 'alert', onclick: ev => ev.stopPropagation() }, ic('alert', 18, 2.2),
          h('div', { class: 'dz-err-b' }, h('b', {}, files.length > 1 && !e?.file ? 'I file non si sono potuti aprire' : info.title), h('span', {}, text + (acts.length ? '' : ' Scegli un altro file.')),
            acts.length ? h('div', { class: 'dz-err-a' }, acts.map(([l, fn], i) => h('button', { class: 'btn sm' + (i ? '' : ' primary'), onclick: ev => { ev.stopPropagation(); fn(); } }, l))) : null)));
      }
    }
  };
  if (preload) {
    const list = Array.isArray(preload) ? acceptFiles(t, preload) : [preload];
    if (preload._fromSession) list._fromSession = true;
    if (list.length) begin(list); else stage.append(...withDz());
  } else if (!fresh && t.resume && t.resume()) begin([]);   // il lavoro lasciato a metà (es. il registro delle fatture)
  else {
    stage.append(...withDz());
    // pagina ricaricata dentro uno strumento: se c'è un lavoro lasciato a metà lo si propone qui, sopra il riquadro del file
    if (!fresh && typeof Resume !== 'undefined' && t.pdfIn !== false) { try { const rc = Resume.card(() => openTool(id)); if (rc) stage.prepend(h('div', { class: 'tool-resume' }, rc)); } catch (e) { console.warn(e); } }
  }
}

// il file corrisponde ai formati dichiarati dallo strumento (estensioni o tipi, come nell'attributo accept)
function matchAccept(accept, f) {
  const name = (f.name || '').toLowerCase(), type = (f.type || '').toLowerCase();
  return String(accept).split(',').map(x => x.trim().toLowerCase()).filter(Boolean).some(tk => tk.startsWith('.') ? name.endsWith(tk) : tk.endsWith('/*') ? type.startsWith(tk.slice(0, -1)) : type === tk);
}
function acceptLabel(accept) {
  const ex = [...new Set(String(accept).split(',').map(x => x.trim()).filter(x => x.startsWith('.')).map(x => x.slice(1).toUpperCase()))];
  const img = /image\//.test(accept);
  return (img ? 'immagini' + (ex.length ? ' (' + ex.filter(x => !/^(JPEG|JFIF|TIF|HEIF)$/.test(x)).slice(0, 8).join(', ') + ')' : '') : ex.length ? 'file ' + ex.join(', ') : 'altri tipi di file');
}
function acceptFiles(t, list) {
  const okImg = /image/.test(t.accept);
  const files = [...list].filter(f => t.anyFile || isPdf(f) || okImg && isImage(f));
  const skipped = list.length - files.length;
  if (skipped) {
    // file giusto, strumento sbagliato: si propone quello adatto (un .p7m in OCR → Firme, una fattura XML → Fatture…)
    const other = [...list].filter(f => !files.includes(f));
    const kinds = other.map(f => typeof Flow !== 'undefined' ? Flow.kindOf(f) : 'other');
    const dest = { fattura: 'fatture', xbrl: 'xbrl', p7m: 'firme', img: 'immagini', pdf: null, zip: 'fatture', office: 'officepdf' }[kinds[0]];
    const same = kinds.every(k => k === kinds[0]);
    if (dest && same && TOOLS[dest] && dest !== CURRENT_TOOL && typeof toastActions === 'function')
      toastActions(`${plural(skipped, 'file non adatto', 'file non adatti')} a ${t.short}: ${kinds[0] === 'img' ? 'sono immagini' : 'si apr' + (skipped > 1 ? 'ono' : 'e') + ' con ' + TOOLS[dest].short}.`, [[`Apri in ${TOOLS[dest].short}`, () => handoff(dest, other)]], 9000);
    else toast(`${plural(skipped, 'file ignorato', 'file ignorati')}: formato non supportato`, 'error');
  }
  return t.multiple ? files : files.slice(0, 1);
}
/* mentre si sceglie il file (finestra di sistema) o lo si trascina: si preparano il motore PDF e le librerie dello strumento */
function prewarm(t) {
  const id = Object.keys(TOOLS).find(k => TOOLS[k] === t) || '';
  setTimeout(() => { try { if (typeof PdfJs !== 'undefined' && (!t || t.pdfIn !== false)) PdfJs.load(); warmLibs(id, true); } catch (e) { console.warn(e); } }, 30);
}
addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { const t = TOOLS[CURRENT_TOOL]; prewarm(t || null); } }, { once: false, passive: true });
function dropzone(t, onFiles) {
  const input = h('input', { type: 'file', class: 'dz-input', accept: /\.pdf/.test(t.accept) ? t.accept + ',.p7m,.tsd,.m7m' : t.accept || undefined, multiple: t.multiple, hidden: true,
    onchange: () => { const f = acceptFiles(t, input.files); input.value = ''; if (f.length) onFiles(f); } });
  const dirInput = t.folder ? h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: '', directory: '', onchange: () => { const f = acceptFiles(t, dirInput.files); dirInput.value = ''; if (f.length) onFiles(f); } }) : null;
  const dz = h('div', { class: 'dropzone',
    onclick: () => { prewarm(t); input.click(); },
    onkeydown: e => { if (e.target !== dz) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    ondragover: e => { e.preventDefault(); dz.classList.add('over'); },
    ondragleave: () => dz.classList.remove('over'),
    ondrop: async e => { e.preventDefault(); dz.classList.remove('over'); const f = acceptFiles(t, t.folder && typeof filesFromDrop === 'function' ? await filesFromDrop(e.dataTransfer) : e.dataTransfer.files); if (f.length) onFiles(f); } },
    h('div', { class: 'dz-ic' }, ic('upload', 34)),
    h('h2', { class: 'dz-t' }, h('span', { class: 'dz-mouse' }, t.pdfIn === false ? 'Trascina qui le tue foto' : t.multiple ? 'Trascina qui i tuoi file' : 'Trascina qui il tuo file'),
      h('span', { class: 'dz-touch' }, t.pdfIn === false ? 'Scegli o scatta le foto' : t.multiple ? 'Scegli i file dal telefono' : 'Scegli il file dal telefono')),
    h('p', {}, t.dzText ? t.dzText : t.anyFile ? 'File firmato (.p7m, .tsd, .m7m) o PDF con firma digitale' : t.pdfIn === false ? 'JPG, PNG, HEIC, TIFF, WebP, GIF, BMP' : /image/.test(t.accept) ? 'PDF o immagini (JPG, PNG, HEIC…)' : 'Documento PDF'),
    t.folder && CAN_PICK_DIR ? h('div', { class: 'row dz-btns' }, h('button', { type: 'button', class: 'btn primary dz-pick' }, ic('file', 18), 'Scegli i file'),
      h('button', { class: 'btn', onclick: e => { e.stopPropagation(); dirInput.click(); } }, ic('layers', 18), 'Cartella'))
      : h('button', { type: 'button', class: 'btn primary dz-pick' }, ic('file', 18), t.multiple ? 'Scegli i file' : 'Scegli il file'),
    // al telefono: foto del documento direttamente dalla fotocamera (poi raddrizzata e pulita dallo strumento)
    t.pdfIn === false || /image/.test(t.accept || '') ? cameraButton(f => { const ok = acceptFiles(t, f); if (ok.length) onFiles(ok); }, { label: t.pdfIn === false ? 'Scatta una foto' : 'Fotografa il documento' }) : null,
    typeof Cloud !== 'undefined' ? h('button', { class: 'btn sm ghost dz-cloud cloud-btn', title: 'Apri dal cloud', onclick: async e => { e.stopPropagation(); const f = await Cloud.pick({ multiple: !!t.multiple }); if (f?.length) { const ok = acceptFiles(t, f); if (ok.length) onFiles(ok); } } }, ic('cloud', 15), 'Apri dal cloud') : null,
    t.noFile ? h('button', { type: 'button', class: 'btn dz-nofile', onclick: e => { e.stopPropagation(); onFiles([]); } }, ic(t.noFileIcon || 'type', 18), t.noFile) : null,
    h('div', { class: 'dz-note' }, ic('shield', 15), IS_SITE ? (t.multiple ? 'I file vengono elaborati nel browser, senza caricarli su un server' : 'Il file viene elaborato nel browser, senza caricarlo su un server') : 'Il file viene elaborato solo sul tuo dispositivo, senza caricamenti online'),
    input, dirInput);
  const wrap = h('div', { class: 'dz-wrap' }, dz);
  // accanto: la breve animazione che mostra come funziona (in loop, parte da sola)
  try {
    const id = Object.keys(TOOLS).find(k => TOOLS[k] === t); const pv = typeof Promo !== 'undefined' && Promo.card(id, t);
    // accanto: l'animazione e, sugli schermi larghi, lo spazio sponsor
    const ad = pv && typeof Ads !== 'undefined' ? Ads.slot('tool-side', id) : null;
    if (pv) { wrap.classList.add('with-pv'); wrap.append(ad ? h('div', { class: 'dz-col' }, pv, ad) : pv); }
  } catch (e) { console.warn(e); }
  return wrap;
}

function route() {
  closeAllModals(); Jobs.onNavigate();
  const id = routeId();
  const pre = pendingHandoff; pendingHandoff = null;
  const show = () => { if (TOOLS[id]) openTool(id, pre); else if (PAGES[id]) showPage(id); else showHome(); };
  // il primo disegno è immediato; poi il cambio di schermata è un passaggio (se il browser lo sa fare e il movimento non è ridotto)
  const kb = route.started && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected || document.activeElement.closest('.cmd-overlay, .rail, .top-work, .intents, .home-tools, .wb-tools'));
  if (typeof UX !== 'undefined' && route.started) UX.transition(show, id); else show();
  if (kb && !OPEN_MODALS.size) requestAnimationFrame(() => { const t = document.querySelector('#main h1'), ae = document.activeElement; if (t && (!ae || ae === document.body || !ae.isConnected || ae.closest('.cmd-overlay'))) { t.tabIndex = -1; try { t.focus({ preventScroll: true }); } catch { } } });
  route.started = true;
  // nel sito l'indirizzo è sempre quello della pagina dello strumento (anche arrivando da un vecchio link con #)
  if (PATH_MODE && !PAGES[id]) { const want = urlFor(TOOLS[id] ? id : ''); if (location.pathname !== want || location.hash) history.replaceState(null, '', want + location.search); }
}

/* =====================================================================
   Preferiti e Command Palette — accesso rapido agli strumenti
   ===================================================================== */
