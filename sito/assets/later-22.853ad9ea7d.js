const DocxIn = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (n, tag) => n ? [...n.childNodes].filter(c => c.nodeType === 1 && (!tag || c.localName === tag)) : [];
  const kid = (n, tag) => kids(n, tag)[0] || null;
  const at = (n, a) => n ? (n.getAttributeNS(W, a) ?? n.getAttribute('w:' + a)) : null;
  const on = n => !!n && !/^(0|false|off|none)$/i.test(at(n, 'val') || '');
  const tw = v => v == null || v === '' ? null : (+v) / 20;      // ventesimi di punto → punti
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const desc = (n, tag) => n ? [...n.getElementsByTagNameNS('*', tag)] : [];

  async function read(bytes, notes) {
    const z = await JSZip.loadAsync(bytes);
    const txt = async p => (await z.file(p)?.async('string')) || null;
    const docXml = await txt('word/document.xml'); if (!docXml) throw codedError('Il file non contiene un documento Word leggibile.', 'FORMAT');
    const doc = parse(docXml), rels = {};
    const relXml = await txt('word/_rels/document.xml.rels');
    if (relXml) for (const r of desc(parse(relXml), 'Relationship')) rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', ext: r.getAttribute('TargetMode') === 'External' };

    /* caratteri del tema (Calibri, Cambria, Aptos…): quelli indicati come «carattere del tema» nei documenti */
    const theme = { minor: 'sans', major: 'sans' };
    const thx = Object.keys(z.files).find(n => /^word\/theme\/theme\d*\.xml$/.test(n));
    if (thx) { const td = parse(await txt(thx)); const lat = tag => desc(desc(td, tag)[0], 'latin')[0]?.getAttribute('typeface'); theme.minor = FlowPdf.famOf(lat('minorFont')); theme.major = FlowPdf.famOf(lat('majorFont')); }
    /* stili: valori predefiniti, poi la catena «basato su» */
    const styles = {}; let defR = {}, defP = {}, docLang = '';
    const st = await txt('word/styles.xml');
    if (st) {
      const sd = parse(st);
      const dd = desc(sd, 'docDefaults')[0];
      if (dd) { defR = rPr(kid(kid(dd, 'rPrDefault'), 'rPr')); defP = pPr(kid(kid(dd, 'pPrDefault'), 'pPr')); }
      const lg = dd && desc(dd, 'lang')[0]; if (lg) docLang = at(lg, 'val') || '';
      for (const s of desc(sd, 'style')) styles[at(s, 'styleId')] = { type: at(s, 'type'), name: at(kid(s, 'name'), 'val') || '', based: at(kid(s, 'basedOn'), 'val'), r: rPr(kid(s, 'rPr')), p: pPr(kid(s, 'pPr')), def: at(s, 'default') === '1', tbl: s };
    }
    const chain = (id, k, seen = new Set()) => { const s = styles[id]; if (!s || seen.has(id)) return {}; seen.add(id); return { ...chain(s.based, k, seen), ...s[k] }; };
    const defParaStyle = Object.keys(styles).find(k => styles[k].type === 'paragraph' && styles[k].def);

    /* elenchi */
    const nums = {}, abs = {};
    const nx = await txt('word/numbering.xml');
    if (nx) {
      const nd = parse(nx);
      for (const a of desc(nd, 'abstractNum')) { const lv = {}; for (const l of kids(a, 'lvl')) lv[at(l, 'ilvl')] = { fmt: at(kid(l, 'numFmt'), 'val') || 'decimal', text: at(kid(l, 'lvlText'), 'val') ?? '%1.', start: +(at(kid(l, 'start'), 'val') || 1), ind: pPr(kid(l, 'pPr')), r: rPr(kid(l, 'rPr')) }; abs[at(a, 'abstractNumId')] = lv; }
      for (const n of desc(nd, 'num')) { const o = {}; for (const ov of kids(n, 'lvlOverride')) { const s = kid(ov, 'startOverride'); if (s) o[at(ov, 'ilvl')] = +at(s, 'val'); } nums[at(n, 'numId')] = { abs: at(kid(n, 'abstractNumId'), 'val'), over: o }; }
    }
    const counters = {};
    const roman = n => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let o = ''; for (const [v, s] of m) while (n >= v) { o += s; n -= v; } return o; };
    const fmtNum = (n, f) => f === 'lowerLetter' ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : f === 'upperLetter' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : f === 'lowerRoman' ? roman(n) : f === 'upperRoman' ? roman(n).toUpperCase() : f === 'bullet' ? '' : String(n);
    function marker(numId, ilvl) {
      const nm = nums[numId]; if (!nm || numId === '0') return null; const lv = (abs[nm.abs] || {})[ilvl]; if (!lv) return null;
      const key = numId + ':', c = counters[key] ||= {};
      // un livello che avanza azzera i livelli sotto
      c[ilvl] = (c[ilvl] == null ? (nm.over[ilvl] ?? lv.start) : c[ilvl] + 1);
      for (const k of Object.keys(c)) if (+k > +ilvl) delete c[k];
      if (lv.fmt === 'bullet') return { text: /[]/.test(lv.text) || !lv.text ? (+ilvl % 2 ? '◦' : '•') : lv.text, lv };
      if (lv.fmt === 'none') return { text: '', lv };
      const all = abs[nm.abs];
      const text = lv.text.replace(/%(\d)/g, (_, d) => { const L = String(+d - 1); const v = c[L] ?? (all[L]?.start || 1); return fmtNum(v, all[L]?.fmt || 'decimal'); });
      return { text, lv };
    }

    function rPr(n) {
      if (!n) return {};
      const o = {};
      const b = kid(n, 'b'), i = kid(n, 'i'), u = kid(n, 'u'), s = kid(n, 'strike'), ds = kid(n, 'dstrike'), sz = kid(n, 'sz'), c = kid(n, 'color'), f = kid(n, 'rFonts'), hl = kid(n, 'highlight'), va = kid(n, 'vertAlign'), caps = kid(n, 'caps'), sh = kid(n, 'shd'), vanish = kid(n, 'vanish');
      if (b) o.b = on(b); if (i) o.i = on(i); if (u) o.u = at(u, 'val') !== 'none'; if (s || ds) o.s = on(s || ds);
      if (sz) o.size = +at(sz, 'val') / 2;
      if (c && /^[0-9a-f]{6}$/i.test(at(c, 'val') || '')) o.color = '#' + at(c, 'val');
      if (f) { const nm = at(f, 'ascii') || at(f, 'hAnsi'); const th = at(f, 'asciiTheme'); if (nm) o.fam = FlowPdf.famOf(nm); else if (th) o.fam = /major/i.test(th) ? theme.major : theme.minor; }
      const HL = { yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#C0C0C0', black: '#000000' };
      if (hl && HL[at(hl, 'val')]) o.hl = HL[at(hl, 'val')];
      else if (sh && /^[0-9a-f]{6}$/i.test(at(sh, 'fill') || '') && !/^(ffffff|auto)$/i.test(at(sh, 'fill'))) o.hl = '#' + at(sh, 'fill');
      if (va) { const v = at(va, 'val'); if (v === 'superscript') o.va = 'sup'; else if (v === 'subscript') o.va = 'sub'; }
      if (caps) o.caps = on(caps);
      if (vanish && on(vanish)) o.hidden = true;
      return o;
    }
    function pPr(n) {
      if (!n) return {};
      const o = {};
      const jc = kid(n, 'jc'), ind = kid(n, 'ind'), sp = kid(n, 'spacing'), num = kid(n, 'numPr'), ps = kid(n, 'pStyle'), kn = kid(n, 'keepNext'), pb = kid(n, 'pageBreakBefore'), shd = kid(n, 'shd'), bdr = kid(n, 'pBdr');
      if (ps) o.style = at(ps, 'val');
      if (jc) { const v = at(jc, 'val'); o.align = v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'both' || v === 'distribute' ? 'justify' : 'left'; }
      if (ind) { const L = at(ind, 'left') ?? at(ind, 'start'), R = at(ind, 'right') ?? at(ind, 'end'); if (L != null) o.left = tw(L); if (R != null) o.right = tw(R); if (at(ind, 'firstLine') != null) o.first = tw(at(ind, 'firstLine')); if (at(ind, 'hanging') != null) { o.hang = tw(at(ind, 'hanging')); o.first = -o.hang; } }
      if (sp) { if (at(sp, 'before') != null) o.before = tw(at(sp, 'before')); if (at(sp, 'after') != null) o.after = tw(at(sp, 'after')); const line = at(sp, 'line'), rule = at(sp, 'lineRule'); if (line) { if (!rule || rule === 'auto') o.lh = (+line / 240) * 1.17; else o.exact = tw(line); } }
      if (num) { o.numId = at(kid(num, 'numId'), 'val'); o.ilvl = at(kid(num, 'ilvl'), 'val') || '0'; }
      if (kn && on(kn)) o.keepNext = true;
      const ol = kid(n, 'outlineLvl'); if (ol && +at(ol, 'val') < 6) o.outline = +at(ol, 'val') + 1;
      const cs = kid(n, 'contextualSpacing'); if (cs && on(cs)) o.ctx = true;
      if (pb && on(pb)) o.pageBefore = true;
      if (shd && /^[0-9a-f]{6}$/i.test(at(shd, 'fill') || '') && !/^ffffff$/i.test(at(shd, 'fill'))) o.shade = '#' + at(shd, 'fill');
      if (bdr && kid(bdr, 'bottom') && at(kid(bdr, 'bottom'), 'val') !== 'none') o.border = '#' + (/^[0-9a-f]{6}$/i.test(at(kid(bdr, 'bottom'), 'color') || '') ? at(kid(bdr, 'bottom'), 'color') : '000000');
      return o;
    }

    /* immagini */
    const imgCache = {}; let skippedImg = 0;
    async function image(rid, wPt, hPt) {
      const rel = rels[rid]; if (!rel || rel.ext) { skippedImg++; return null; }
      const path = ('word/' + rel.target).replace(/word\/\.\.\//, '').replace(/^word\/\//, 'word/').replace(/^word\/word\//, 'word/');
      const p = rel.target.startsWith('/') ? rel.target.slice(1) : path;
      if (!(p in imgCache)) {
        const f = z.file(p); let out = null;
        if (f) {
          const b = await f.async('uint8array');
          const png = b[0] === 0x89 && b[1] === 0x50, jpg = b[0] === 0xFF && b[1] === 0xD8;
          if (png || jpg) out = { kind: png ? 'png' : 'jpg', bytes: b };
          else { try { const bmp = await createImageBitmap(new Blob([b])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png')); out = { kind: 'png', bytes: new Uint8Array(await blob.arrayBuffer()) }; } catch { out = null; } }
        }
        imgCache[p] = out; if (!out) skippedImg++;
      }
      const im = imgCache[p]; return im && { ...im, w: wPt, h: hPt };
    }

    /* paragrafo */
    async function para(p, tbl = null) {
      const pp = pPr(kid(p, 'pPr'));
      const sid = pp.style || defParaStyle;
      const sP = chain(sid, 'p'), sR = chain(sid, 'r');
      const sname = (styles[sid]?.name || '').toLowerCase();
      // ordine di Word: predefiniti < stile della tabella < stile del paragrafo < formattazione diretta
      const P = { ...defP, ...(tbl?.p || {}), ...sP, ...pp };
      const R0 = { ...defR, ...(tbl?.r || {}), ...sR };
      if (pp.numId == null && sP.numId != null) { P.numId = sP.numId; P.ilvl = sP.ilvl || '0'; }
      const runs = [];
      let pageAfter = false;
      const walk = async (n, linkR) => {
        for (const c of kids(n)) {
          const t = c.localName;
          if (t === 'r') {
            const rp = rPr(kid(c, 'rPr')), rs = at(kid(kid(c, 'rPr'), 'rStyle'), 'val'); const R = { ...R0, ...(rs ? chain(rs, 'r') : {}), ...linkR, ...rp };
            if (R.hidden) continue;
            for (const x of kids(c)) {
              const k = x.localName;
              if (k === 't') runs.push({ ...R, t: x.textContent });
              else if (k === 'tab' || k === 'ptab') runs.push({ ...R, t: '\t' });
              else if (k === 'br' || k === 'cr') { if (at(x, 'type') === 'page') pageAfter = true; else runs.push({ ...R, t: '\n' }); }
              else if (k === 'noBreakHyphen' || k === 'softHyphen') runs.push({ ...R, t: k === 'noBreakHyphen' ? '-' : '' });
              else if (k === 'sym') { const ch = parseInt(at(x, 'char') || '0', 16); runs.push({ ...R, t: ch >= 0xF000 ? '•' : String.fromCharCode(ch) }); }
              else if (k === 'drawing' || k === 'pict' || k === 'object') {
                const blip = desc(x, 'blip')[0], ext = desc(x, 'extent')[0];
                const rid = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
                const imd = desc(x, 'imagedata')[0], rid2 = imd && (imd.getAttribute('r:id') || imd.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
                const wPt = ext ? +ext.getAttribute('cx') / 12700 : 120, hPt = ext ? +ext.getAttribute('cy') / 12700 : 90;
                const im = await image(rid || rid2, wPt, hPt);
                const dp = desc(x, 'docPr')[0]; if (im) im.alt = (dp?.getAttribute('descr') || dp?.getAttribute('title') || '').trim();
                if (im) runs.push({ ...R, t: '', img: im });
                // caselle di testo: il loro testo, dopo
                for (const tb of desc(x, 'txbxContent')) for (const q of kids(tb, 'p')) { const sub = await para(q); if (sub) runs.push({ ...R, t: '\n' }, ...sub.block.runs); }
              }
            }
          } else if (t === 'hyperlink' || t === 'smartTag' || t === 'ins' || t === 'customXml' || t === 'fldSimple' || t === 'dir' || t === 'bdo') {
            if (t === 'fldSimple' && /\bPAGE\b/.test(at(c, 'instr') || '')) { runs.push({ ...R0, t: '{PAGE}' }); continue; }
            if (t === 'fldSimple' && /\bNUMPAGES\b/.test(at(c, 'instr') || '')) { runs.push({ ...R0, t: '{PAGES}' }); continue; }
            await walk(c, t === 'hyperlink' ? { ...linkR } : linkR);
          } else if (t === 'sdt') await walk(kid(c, 'sdtContent'), linkR);
        }
      };
      // campi complessi (PAGE, NUMPAGES) nei piè di pagina: si sostituisce il risultato memorizzato
      await walk(p, {});
      for (const instr of desc(p, 'instrText')) { const v = instr.textContent; if (/\bPAGE\b/.test(v)) P._field = '{PAGE}'; else if (/\bNUMPAGES\b/.test(v)) P._field2 = '{PAGES}'; }
      const hm = /^(?:heading|titolo|intestazione)\s*(\d)/i.exec(sname);
      const role = hm ? 'H' + Math.min(6, +hm[1]) : /^(title|titolo)$/i.test(sname) ? 'H1' : P.outline ? 'H' + P.outline : /caption|didascalia/i.test(sname) ? 'Caption' : 'P';
      const block = { type: 'p', role, sid, ctx: !!P.ctx, runs, align: P.align, left: P.left || 0, right: P.right || 0, first: P.first || 0, hang: P.hang, before: P.before ?? 0, after: P.after ?? 8, lh: P.lh, exact: P.exact, size: R0.size || 11, fam: R0.fam || 'sans', keepNext: P.keepNext || /heading|titolo|title/.test(sname), pageBefore: P.pageBefore, shade: P.shade, border: P.border };
      if (P.numId && P.numId !== '0') {
        const mk = marker(P.numId, P.ilvl);
        if (mk) { const ind = mk.lv.ind || {}; block.marker = mk.text; if (pp.left == null && ind.left != null) block.left = ind.left; if (pp.hang == null && ind.hang != null) { block.hang = ind.hang; } block.first = 0; block.hang = block.hang || 18; if (!block.left) block.left = 36 + 18 * +P.ilvl; block.markerFam = mk.lv.r?.fam; }
      }
      // paragrafo vuoto: tiene comunque la sua altezza (riga vuota)
      if (!runs.length) runs.push({ ...R0, t: '' });
      return { block, pageAfter };
    }

    /* tabella */
    async function table(t) {
      const tp = kid(t, 'tblPr');
      const sid = at(kid(tp, 'tblStyle'), 'val') || '';
      const grid = kids(kid(t, 'tblGrid'), 'gridCol').map(g => tw(at(g, 'w')) || 0);
      const bordersEl = kid(tp, 'tblBorders') || desc(styles[sid]?.tbl, 'tblBorders')[0];
      const hasB = bordersEl ? kids(bordersEl).some(b => at(b, 'val') && at(b, 'val') !== 'none' && at(b, 'val') !== 'nil') : /grid|griglia|table/i.test(styles[sid]?.name || sid);
      const jc = at(kid(tp, 'jc'), 'val');
      const tstyle = { p: chain(sid, 'p'), r: chain(sid, 'r') };
      const mar = kid(tp, 'tblCellMar'); const mw = side => { const e = kid(mar, side); return e && at(e, 'type') !== 'pct' ? tw(at(e, 'w')) : null; };
      const rows = [];
      for (const tr of kids(t, 'tr')) {
        const trp = kid(tr, 'trPr'); const header = !!kid(trp, 'tblHeader'); const hr = kid(trp, 'trHeight');
        const cells = [];
        for (const tc of kids(tr, 'tc')) {
          const tcp = kid(tc, 'tcPr'); const span = +(at(kid(tcp, 'gridSpan'), 'val') || 1); const vm = kid(tcp, 'vMerge');
          const shd = kid(tcp, 'shd'); const fill = shd && /^[0-9a-f]{6}$/i.test(at(shd, 'fill') || '') && !/^ffffff$/i.test(at(shd, 'fill')) ? '#' + at(shd, 'fill') : null;
          const cont = vm && at(vm, 'val') !== 'restart';   // cella unita a quella sopra: resta vuota
          const blocks = cont ? [] : await body(tc, true, tstyle);
          let b = undefined;
          const cb = kid(tcp, 'tcBorders'); if (cb) { b = {}; for (const s of ['top', 'bottom', 'left', 'right', 'start', 'end']) { const e = kid(cb, s); if (e) b[{ top: 't', bottom: 'b', left: 'l', right: 'r', start: 'l', end: 'r' }[s]] = !/^(none|nil)$/.test(at(e, 'val') || ''); } if (hasB) { for (const s of ['t', 'b', 'l', 'r']) if (b[s] === undefined) b[s] = true; } if (cont) b.t = false; }
          else if (cont && hasB) b = { t: false, b: true, l: true, r: true };
          cells.push({ span, blocks, fill, borders: b });
        }
        rows.push({ cells, header, h: hr ? tw(at(hr, 'val')) : 0 });
      }
      const ncol = Math.max(grid.length, ...rows.map(r => r.cells.reduce((a, c) => a + c.span, 0)));
      const cols = grid.length >= ncol ? grid : Array.from({ length: ncol }, (_, i) => grid[i] || 72);
      return { type: 'table', cols, rows, borders: hasB, align: jc === 'center' ? 'center' : 'left', padX: mw('left') ?? 5.4, padY: mw('top') ?? 0 };
    }

    async function body(n, inCell = false, tstyle = null) {
      const out = [];
      for (const c of kids(n)) {
        const t = c.localName;
        if (t === 'p') { const { block, pageAfter } = await para(c, tstyle);
          // paragrafo con sole immagini: diventano figure (con la loro descrizione, se il documento la dà)
          const imgs = block.runs.filter(r => r.img);
          if (imgs.length && block.runs.every(r => r.img || !String(r.t ?? '').trim())) { imgs.forEach((r, k) => out.push({ type: 'img', ...r.img, alt: r.img.alt || 'Immagine', align: block.align, after: k === imgs.length - 1 ? block.after : 2 })); }
          else out.push(block); if (pageAfter && !inCell) out.push({ type: 'break' }); if (!inCell && kid(kid(c, 'pPr'), 'sectPr')) out.push({ type: 'break' }); }
        else if (t === 'tbl') { out.push(await table(c)); if (!inCell) out.push({ type: 'space', h: 6 }); }
        else if (t === 'sdt') out.push(...await body(kid(c, 'sdtContent'), inCell, tstyle));
        else if (t === 'customXml') out.push(...await body(c, inCell, tstyle));
      }
      // spaziatura contestuale (elenchi e simili): niente spazio fra paragrafi consecutivi dello stesso stile
      for (let k = 1; k < out.length; k++) { const a = out[k - 1], b = out[k]; if (a.type === 'p' && b.type === 'p' && a.sid === b.sid) { if (a.ctx) a.after = 0; if (b.ctx) b.before = 0; } }
      // l'ultimo paragrafo di una cella non aggiunge spazio sotto (come in Word)
      if (inCell && out.length && out[out.length - 1].type === 'p') out[out.length - 1].after = Math.min(out[out.length - 1].after, 0);
      return out;
    }

    const bodyEl = desc(doc, 'body')[0];
    const blocks = await body(bodyEl);
    while (blocks.length && blocks[blocks.length - 1].type === 'break') blocks.pop();
    // pagina: formato e margini dall'ultima sezione
    const sect = kid(bodyEl, 'sectPr') || desc(bodyEl, 'sectPr').pop();
    const pg = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
    const size = pg ? [tw(at(pg, 'w')) || 595.28, tw(at(pg, 'h')) || 841.89] : FlowPdf.SIZES.a4;
    const margins = mar ? { t: Math.abs(tw(at(mar, 'top')) ?? 72), r: tw(at(mar, 'right')) ?? 72, b: Math.abs(tw(at(mar, 'bottom')) ?? 72), l: tw(at(mar, 'left')) ?? 72 } : { t: 72, r: 72, b: 72, l: 72 };
    // intestazione e piè di pagina predefiniti
    const part = async (tag) => {
      const ref = kids(sect, tag).find(r => at(r, 'type') === 'default') || kids(sect, tag)[0]; if (!ref) return null;
      const rid = ref.getAttribute('r:id') || ref.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rel = rels[rid]; if (!rel) return null;
      const x = await txt('word/' + rel.target.replace(/^\/?word\//, '')); if (!x) return null;
      const root = parse(x).documentElement;
      const bl = await body(root, true);
      // campi PAGE / NUMPAGES scritti come campi complessi: il numero memorizzato si sostituisce con quello vero
      for (const b of bl) if (b.type === 'p' && (b._f = 1)) for (const r of b.runs) r.t = String(r.t ?? '');
      const pnodes = desc(root, 'p');
      bl.filter(b => b.type === 'p').forEach((b, k) => { const p = pnodes[k]; if (!p) return; const instr = desc(p, 'instrText').map(i => i.textContent).join(' '); if (/\bPAGE\b/.test(instr) || /\bNUMPAGES\b/.test(instr)) { const rs = []; let mode = 0; for (const r of desc(p, 'r')) { const fc = kid(r, 'fldChar'), it = kid(r, 'instrText'); if (fc) { const ty = at(fc, 'fldCharType'); if (ty === 'begin') mode = 1; else if (ty === 'separate') mode = 2; else if (ty === 'end') mode = 0; continue; } if (it) { const v = it.textContent; rs.push({ ...b.runs[0], t: /NUMPAGES/.test(v) ? '{PAGES}' : /PAGE/.test(v) ? '{PAGE}' : '' }); continue; } if (mode === 2) continue; const t = desc(r, 't').map(q => q.textContent).join(''); if (t) rs.push({ ...b.runs[0], ...rPr(kid(r, 'rPr')), t }); } if (rs.length) b.runs = rs; } });
      return bl.filter(b => b.type === 'p').map(b => ({ ...b, before: 0, after: 0 }));
    };
    const header = await part('headerReference'), footer = await part('footerReference');
    const hd = mar ? tw(at(mar, 'header')) : null, fd = mar ? tw(at(mar, 'footer')) : null;
    if (skippedImg) notes.push(`${plural(skippedImg, 'immagine', 'immagini')} in un formato non leggibile dal browser (per esempio EMF) non ${skippedImg === 1 ? 'è inclusa' : 'sono incluse'}`);
    if (desc(doc, 'del').length || desc(doc, 'ins').length) notes.push('revisioni: il PDF mostra il testo con le modifiche accettate');
    if (desc(doc, 'commentReference').length) notes.push('i commenti non si stampano');
    const title = desc(parse((await txt('docProps/core.xml')) || '<x/>'), 'title')[0]?.textContent || '';
    return { size, margins, blocks, header, footer, headerY: hd, footerY: fd, title, lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(docLang) ? docLang : 'it-IT' };
  }
  return { read };
})();


/* ---------- Excel (.xlsx) → blocchi (un foglio dopo l'altro) ---------- */
const XlsxIn = (() => {
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const desc = (n, tag) => n ? [...n.getElementsByTagNameNS('*', tag)] : [];
  const kid = (n, tag) => n ? [...n.childNodes].find(c => c.nodeType === 1 && c.localName === tag) || null : null;
  const colN = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const ref = r => { const m = /^([A-Z]+)(\d+)$/.exec(r || ''); return m ? [colN(m[1]), +m[2] - 1] : null; };
  const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'hh:mm', 21: 'hh:mm:ss', 22: 'dd/mm/yyyy hh:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 44: '_-* #,##0.00 €_-', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const fmtNum = (v, fmt, d1904) => {
    const f = String(fmt || 'General').split(';')[v < 0 && String(fmt).includes(';') ? 1 : 0].replace(/\[(?!h\]|m\]|s\])[^\]]*\]/g, '').replace(/_.|\\|"/g, '');
    const isDate = /(^|[^0#?.,])(d|y|m{3,}|yy)/i.test(f) || /\b(dd|yyyy|mm\/|\/mm)\b/i.test(f);
    const isTime = /h|ss/i.test(f) && !/#/.test(f);
    if ((isDate || isTime) && !/#|0\.0/.test(f.replace(/ss\.0+/, ''))) {
      const ms = Math.round(((d1904 ? v + 1462 : v) - 25569) * 86400000), d = new Date(ms);
      const p2 = n => String(n).padStart(2, '0'), Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), se = d.getUTCSeconds();
      let out = '';
      if (isDate) out = /mmm/i.test(f) ? `${D} ${MESI[M]}${/y/i.test(f) ? ' ' + (/yyyy/i.test(f) ? Y : String(Y).slice(2)) : ''}` : `${p2(D)}/${p2(M + 1)}${/y/i.test(f) ? '/' + (/yyyy/i.test(f) || !/yy/i.test(f) ? Y : String(Y).slice(2)) : ''}`;
      if (isTime) out += (out ? ' ' : '') + `${p2(h)}:${p2(mi)}${/ss/i.test(f) ? ':' + p2(se) : ''}`;
      return out;
    }
    if (/^general$/i.test(f) || !f.trim()) { if (Number.isInteger(v)) return v.toLocaleString('it-IT', { useGrouping: Math.abs(v) >= 1e4 ? false : false }); const r = Math.abs(v) >= 1e11 || (Math.abs(v) < 1e-4 && v) ? v.toExponential(4).replace('.', ',') : String(+v.toPrecision(10)).replace('.', ','); return r; }
    const pct = /%/.test(f), dec = (/0\.(0+)/.exec(f) || [, ''])[1].length, group = /#,##|0,0/.test(f), eur = /€/.test(f), sci = /E\+/i.test(f);
    const x = pct ? v * 100 : v;
    if (sci) return x.toExponential(dec).replace('.', ',').replace('e+', 'E+').replace('e-', 'E-');
    let s = Math.abs(x).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group });
    if (/\(/.test(f) && v < 0) s = '(' + s + ')'; else if (v < 0 && !String(fmt).includes(';')) s = '-' + s;
    return s + (pct ? '%' : '') + (eur ? ' €' : '') + (/\$/.test(f) ? ' $' : '');
  };

  async function read(bytes, notes) {
    const z = await JSZip.loadAsync(bytes);
    const txt = async p => (await z.file(p)?.async('string')) || null;
    const wb = await txt('xl/workbook.xml'); if (!wb) throw codedError('Il file non contiene una cartella di lavoro Excel leggibile.', 'FORMAT');
    const wd = parse(wb); const d1904 = /date1904="(1|true)"/.test(wb);
    const rels = {}; const rx = await txt('xl/_rels/workbook.xml.rels'); if (rx) for (const r of desc(parse(rx), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const sst = []; const ss = await txt('xl/sharedStrings.xml'); if (ss) for (const si of desc(parse(ss), 'si')) sst.push(desc(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
    // stili delle celle: formato numerico, carattere, sfondo, bordi, allineamento
    const fmts = { ...BUILTIN }, xfs = [], fonts = [], fills = [], borders = [];
    const sx = await txt('xl/styles.xml');
    if (sx) {
      const sd = parse(sx);
      for (const n of desc(sd, 'numFmt')) fmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode');
      for (const f of desc(kid(sd.documentElement, 'fonts'), 'font')) { const c = kid(f, 'color')?.getAttribute('rgb'); fonts.push({ b: !!kid(f, 'b') && kid(f, 'b').getAttribute('val') !== '0', i: !!kid(f, 'i') && kid(f, 'i').getAttribute('val') !== '0', u: !!kid(f, 'u'), size: +(kid(f, 'sz')?.getAttribute('val') || 11), fam: FlowPdf.famOf(kid(f, 'name')?.getAttribute('val')), color: c && /^[0-9A-F]{8}$/i.test(c) ? '#' + c.slice(2) : null }); }
      for (const f of desc(kid(sd.documentElement, 'fills'), 'fill')) { const pf = kid(f, 'patternFill'), fg = pf && kid(pf, 'fgColor')?.getAttribute('rgb'); fills.push(pf && pf.getAttribute('patternType') === 'solid' && fg && /^[0-9A-F]{8}$/i.test(fg) && !/FFFFFF$/i.test(fg) ? '#' + fg.slice(2) : null); }
      for (const b of desc(kid(sd.documentElement, 'borders'), 'border')) { const has = t => { const e = kid(b, t); return !!(e && e.getAttribute('style')); }; borders.push({ t: has('top'), b: has('bottom'), l: has('left'), r: has('right') }); }
      for (const x of desc(kid(sd.documentElement, 'cellXfs'), 'xf')) { const al = kid(x, 'alignment'); xfs.push({ fmt: fmts[x.getAttribute('numFmtId') || 0] || 'General', font: fonts[+x.getAttribute('fontId') || 0], fill: fills[+x.getAttribute('fillId') || 0], border: borders[+x.getAttribute('borderId') || 0], h: al?.getAttribute('horizontal'), wrap: al?.getAttribute('wrapText') === '1' }); }
    }
    const sheets = [];
    for (const s of desc(wd, 'sheet')) {
      if (s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden') continue;
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const target = rels[rid]; if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const x = await txt(path); if (!x) continue;
      const sd = parse(x);
      const cells = new Map(); let maxC = -1, maxR = -1, minC = 1e9, minR = 1e9;
      const rowH = {};
      for (const row of desc(sd, 'row')) { const r = +row.getAttribute('r') - 1; if (row.getAttribute('ht') && row.getAttribute('customHeight') === '1') rowH[r] = +row.getAttribute('ht'); if (row.getAttribute('hidden') === '1') rowH[r] = -1; }
      for (const c of desc(sd, 'c')) {
        const rc = ref(c.getAttribute('r')); if (!rc) continue;
        const t = c.getAttribute('t'), st = xfs[+c.getAttribute('s') || 0] || { fmt: 'General' }, v = kid(c, 'v')?.textContent;
        let text = '', num = false;
        if (t === 's') text = sst[+v] ?? '';
        else if (t === 'inlineStr') text = desc(c, 't').map(q => q.textContent).join('');
        else if (t === 'b') text = v === '1' ? 'VERO' : 'FALSO';
        else if (t === 'e') text = v || '#ERR';
        else if (t === 'str') text = v ?? '';
        else if (v != null && v !== '') { text = fmtNum(+v, st.fmt, d1904); num = true; }
        const styled = st.fill || (st.border && (st.border.t || st.border.b || st.border.l || st.border.r));
        if (!text && !styled) continue;
        cells.set(rc[1] * 20000 + rc[0], { text, num, st });
        if (text || styled) { maxC = Math.max(maxC, rc[0]); maxR = Math.max(maxR, rc[1]); minC = Math.min(minC, rc[0]); minR = Math.min(minR, rc[1]); }
      }
      if (maxR < 0) continue;
      // larghezze delle colonne (in caratteri «0» di Calibri 11 → punti)
      const widths = {}; let defW = 8.43;
      const fmtPr = desc(sd, 'sheetFormatPr')[0]; if (fmtPr?.getAttribute('defaultColWidth')) defW = +fmtPr.getAttribute('defaultColWidth') - .71;
      for (const col of desc(sd, 'col')) { const a = +col.getAttribute('min') - 1, b = +col.getAttribute('max') - 1, w = col.getAttribute('hidden') === '1' ? 0 : +col.getAttribute('width'); for (let k = a; k <= Math.min(b, 16383); k++) widths[k] = w; }
      const merges = desc(sd, 'mergeCell').map(m => { const [a, b] = m.getAttribute('ref').split(':').map(ref); return a && b ? { c0: a[0], r0: a[1], c1: b[0], r1: b[1] } : null; }).filter(Boolean);
      sheets.push({ name: s.getAttribute('name'), cells, minC: 0, minR: 0, maxC, maxR, widths, defW, rowH, merges, startC: Math.min(minC, maxC), startR: Math.min(minR, maxR) });
    }
    if (!sheets.length) throw codedError('Il file Excel non contiene fogli con dati.', 'CONTENT');
    return sheets;
  }

  // foglio → blocchi tabella, adattati alla larghezza disponibile (colonne a gruppi se proprio non entrano)
  function blocks(sh, avail, { minScale = .55 } = {}) {
    const C0 = sh.startC, C1 = sh.maxC, R0 = sh.startR, R1 = sh.maxR;
    const colW = c => (sh.widths[c] ?? sh.defW) * 5.6;
    const cols = []; for (let c = C0; c <= C1; c++) cols.push(colW(c));
    const total = cols.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, avail / total);
    const bands = [];
    if (scale >= minScale) bands.push([C0, C1, scale]);
    else { let a = C0, w = 0; for (let c = C0; c <= C1; c++) { const cw = colW(c) * minScale; if (w + cw > avail && c > a) { bands.push([a, c - 1, minScale]); a = c; w = 0; } w += cw; } bands.push([a, C1, minScale]); }
    const mergeAt = new Map(), covered = new Set();
    for (const m of sh.merges) { mergeAt.set(m.r0 * 20000 + m.c0, m); for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) if (r !== m.r0 || c !== m.c0) covered.add(r * 20000 + c); }
    const out = [];
    for (const [a, b, k] of bands) {
      const rows = [];
      for (let r = R0; r <= R1; r++) {
        if (sh.rowH[r] === -1) continue;
        const cells = [];
        for (let c = a; c <= b; c++) {
          const key = r * 20000 + c;
          if (covered.has(key)) { const m = sh.merges.find(m => r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1); if (m && r === m.r0) continue; cells.push({ span: 1, blocks: [] }); continue; }
          const cell = sh.cells.get(key), st = cell?.st || {};
          let span = 1; const m = mergeAt.get(key); if (m) span = Math.min(m.c1, b) - c + 1;
          // testo che sborda: occupa le celle vuote accanto (come in Excel), se non va a capo da solo
          if (!m && cell && cell.text && !cell.num && !st.wrap && (!st.h || st.h === 'left' || st.h === 'general')) { while (c + span <= b && !sh.cells.get(r * 20000 + c + span)?.text && !covered.has(r * 20000 + c + span) && !mergeAt.has(r * 20000 + c + span)) span++; }
          const f = st.font || {}, size = Math.max(5, (f.size || 11) * k * .92);
          const align = st.h === 'center' || st.h === 'centerContinuous' ? 'center' : st.h === 'right' ? 'right' : st.h === 'left' ? 'left' : cell?.num ? 'right' : 'left';
          const bd = st.border && (st.border.t || st.border.b || st.border.l || st.border.r) ? st.border : undefined;
          cells.push({ span, fill: st.fill, borders: bd || false, blocks: cell && cell.text ? [{ type: 'p', runs: [{ t: cell.text, b: f.b, i: f.i, u: f.u, color: f.color, fam: f.fam, size }], size, align, after: 0, before: 0, lh: 1.12, fit: cell.num || !st.wrap && span === 1 && !/\s/.test(cell.text) }] : [] });
          c += span - 1;
        }
        rows.push({ cells, h: sh.rowH[r] > 0 ? sh.rowH[r] * Math.min(1, k * 1.05) : 0 });
      }
      const cw = []; for (let c = a; c <= b; c++) cw.push(colW(c) * k);
      out.push({ type: 'table', cols: cw, rows, borders: false, pad: 2.5, band: bands.length > 1 ? `colonne ${String.fromCharCode(65 + Math.min(25, a))}–${String.fromCharCode(65 + Math.min(25, b))}` : '' });
    }
    return { tables: out, total, scale, bands: bands.length };
  }
  return { read, blocks, fmtNum };
})();

/* ---------- testo, Markdown, CSV e pagine web → blocchi ---------- */
const TextIn = (() => {
  const decode = b => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(b); } };
  const P = (runs, o = {}) => ({ type: 'p', runs, size: 11, fam: 'sans', after: 6, lh: 1.25, ...o });
  // grassetto, corsivo, codice e collegamenti nel testo Markdown
  const inline = (s, base = {}) => {
    const out = []; const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g; let last = 0, m;
    while ((m = re.exec(s))) { if (m.index > last) out.push({ ...base, t: s.slice(last, m.index) }); if (m[2]) out.push({ ...base, b: true, t: m[2] }); else if (m[4]) out.push({ ...base, i: true, t: m[4] }); else if (m[5]) out.push({ ...base, fam: 'mono', t: m[5], hl: '#F1F1F4' }); else if (m[6]) out.push({ ...base, u: true, color: '#1D4ED8', t: m[6] }); last = re.lastIndex; }
    if (last < s.length) out.push({ ...base, t: s.slice(last) });
    return out.length ? out : [{ ...base, t: '' }];
  };
  function txt(s) { return s.replace(/\r\n?/g, '\n').split('\n').map(l => P([{ t: l }], { after: 0, lh: 1.3 })); }
  function md(s) {
    const L = s.replace(/\r\n?/g, '\n').split('\n'), out = []; let i = 0, n = 0;
    while (i < L.length) {
      const l = L[i];
      if (/^```/.test(l)) { const code = []; i++; while (i < L.length && !/^```/.test(L[i])) code.push(L[i++]); i++; out.push(P([{ t: code.join('\n'), fam: 'mono', size: 9.5 }], { shade: '#F4F4F6', after: 10, lh: 1.25 })); continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { const lv = m[1].length; out.push(P(inline(m[2], { b: true, size: [22, 18, 15, 13, 12, 11][lv - 1] }), { role: 'H' + lv, size: [22, 18, 15, 13, 12, 11][lv - 1], before: lv <= 2 ? 14 : 10, after: 6, keepNext: true })); i++; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { out.push({ type: 'hr' }); i++; continue; }
      if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(l))) { const lv = Math.floor(m[1].length / 2); out.push(P(inline(m[2]), { marker: lv % 2 ? '◦' : '•', left: 24 + 18 * lv, hang: 14, after: 2 })); i++; continue; }
      if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(l))) { const lv = Math.floor(m[1].length / 2); out.push(P(inline(m[3]), { marker: m[2] + '.', left: 24 + 18 * lv, hang: 18, after: 2 })); i++; continue; }
      if (/^>\s?/.test(l)) { const q = []; while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, '')); out.push(P(inline(q.join(' '), { i: true, color: '#444444' }), { left: 18, border: null, shade: '#F6F6F8' })); continue; }
      if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
        const row = s2 => s2.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = row(l); i += 2; const rows = [{ header: true, cells: head.map(c => ({ fill: '#F1F1F4', blocks: [P(inline(c, { b: true }), { after: 0 })] })) }];
        while (i < L.length && /^\|/.test(L[i])) { rows.push({ cells: row(L[i++]).map(c => ({ blocks: [P(inline(c), { after: 0 })] })) }); }
        out.push({ type: 'table', cols: head.map(() => 1000), rows, borders: true, borderColor: '#BBBBBB', pad: 4 }, { type: 'space', h: 8 }); continue;
      }
      if (!l.trim()) { i++; continue; }
      const para = []; while (i < L.length && L[i].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>|\|)/.test(L[i])) para.push(L[i++].trim());
      if (!para.length) { para.push(L[i++]); }
      out.push(P(inline(para.join(' ')), { after: 8 })); n++;
    }
    return out;
  }
  function csv(s) {
    const first = s.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ',', '|'].map(c => [c, (first.match(new RegExp(c === '|' ? '\\|' : c, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let k = 0; k < s.length; k++) { const ch = s[k]; if (q) { if (ch === '"' && s[k + 1] === '"') { cur += '"'; k++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[k + 1] === '\n') k++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function html(s, notes) {
    const d = new DOMParser().parseFromString(s, 'text/html'); const out = []; let skipped = 0;
    const HS = { h1: 22, h2: 18, h3: 15, h4: 13, h5: 12, h6: 11 };
    const runsOf = (n, st = {}) => {
      const r = [];
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t) r.push({ ...st, t }); continue; }
        if (c.nodeType !== 1) continue;
        const t = c.localName, cs = c.getAttribute('style') || '';
        if (/^(script|style|noscript|template|head)$/.test(t)) continue;
        if (t === 'br') { r.push({ ...st, t: '\n' }); continue; }
        if (t === 'img') { const src = c.getAttribute('src') || ''; if (!/^data:image\/(png|jpe?g);base64,/i.test(src)) skipped++; continue; }
        const s2 = { ...st };
        if (/^(b|strong|th)$/.test(t) || /font-weight:\s*(bold|[6-9]00)/.test(cs)) s2.b = true;
        if (/^(i|em|cite|var)$/.test(t) || /font-style:\s*italic/.test(cs)) s2.i = true;
        if (/^(u|ins)$/.test(t)) s2.u = true; if (/^(s|del|strike)$/.test(t)) s2.s = true;
        if (/^(code|kbd|samp|tt)$/.test(t)) s2.fam = 'mono';
        if (t === 'a') { s2.u = true; s2.color = '#1D4ED8'; }
        if (t === 'sup') s2.va = 'sup'; if (t === 'sub') s2.va = 'sub';
        const col = /(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i.exec(cs); if (col) s2.color = col[1];
        r.push(...runsOf(c, s2));
      }
      return r;
    };
    const imgBlock = el => { const src = el.getAttribute('src') || ''; const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(src); if (!m) { skipped++; return null; } const bin = atob(m[2]), b = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); const w = +el.getAttribute('width') || 300, hh = +el.getAttribute('height') || 200; return { type: 'img', kind: /png/i.test(m[1]) ? 'png' : 'jpg', bytes: b, w: w * .75, h: hh * .75, alt: el.getAttribute('alt') || 'Immagine' }; };
    const walk = (n, ctx = {}) => {
      for (const c of n.children) {
        const t = c.localName;
        if (/^(script|style|noscript|template|head|nav|button|form|iframe|svg)$/.test(t)) continue;
        if (HS[t]) { out.push(P(runsOf(c, { b: true, size: HS[t] }), { role: 'H' + t[1], size: HS[t], before: 12, after: 6, keepNext: true })); continue; }
        if (t === 'p' || t === 'address' || t === 'figcaption' || t === 'dt' || t === 'dd' || t === 'caption') { const r = runsOf(c); if (r.some(x => x.t.trim())) out.push(P(r, { left: ctx.left || 0, after: 8, align: c.getAttribute('align') === 'center' || /text-align:\s*center/.test(c.getAttribute('style') || '') ? 'center' : undefined })); continue; }
        if (t === 'pre') { out.push(P([{ t: c.textContent, fam: 'mono', size: 9.5 }], { shade: '#F4F4F6', after: 10 })); continue; }
        if (t === 'blockquote') { walk(c, { ...ctx, left: (ctx.left || 0) + 18 }); continue; }
        if (t === 'hr') { out.push({ type: 'hr' }); continue; }
        if (t === 'img') { const b = imgBlock(c); if (b) out.push(b); continue; }
        if (t === 'ul' || t === 'ol') { let k = +(c.getAttribute('start') || 1); for (const li of c.children) { if (li.localName !== 'li') continue; const own = [...li.childNodes].filter(x => !(x.nodeType === 1 && /^(ul|ol)$/.test(x.localName))); const tmp = d.createElement('div'); own.forEach(x => tmp.appendChild(x.cloneNode(true))); out.push(P(runsOf(tmp), { marker: t === 'ol' ? (k++) + '.' : ((ctx.depth || 0) % 2 ? '◦' : '•'), left: 24 + 18 * (ctx.depth || 0), hang: 16, after: 3 })); for (const sub of li.children) if (/^(ul|ol)$/.test(sub.localName)) walk({ children: [sub] }, { ...ctx, depth: (ctx.depth || 0) + 1 }); } continue; }
        if (t === 'table') {
          const rows = []; let ncol = 0;
          for (const tr of c.querySelectorAll('tr')) { const cells = [...tr.children].filter(x => /^t[dh]$/.test(x.localName)).map(td => ({ th: td.localName === 'th', span: +(td.getAttribute('colspan') || 1), fill: td.localName === 'th' ? '#F1F1F4' : null, blocks: [P(runsOf(td, td.localName === 'th' ? { b: true } : {}), { after: 0, size: 10 })] })); ncol = Math.max(ncol, cells.reduce((a, x) => a + x.span, 0)); rows.push({ cells, header: tr.parentNode?.localName === 'thead' }); }
          if (rows.length) out.push({ type: 'table', cols: Array.from({ length: ncol }, () => 1000), rows, borders: true, borderColor: '#BBBBBB', pad: 4 }, { type: 'space', h: 8 });
          continue;
        }
        // contenitori: dentro (div, section, article, main, header, footer, figure, li sciolti…); il testo sciolto fa un paragrafo
        const blockKids = [...c.children].some(x => /^(p|div|h[1-6]|ul|ol|table|pre|blockquote|section|article|figure|hr|img|header|footer|main|aside|dl)$/.test(x.localName));
        if (blockKids) walk(c, ctx); else { const r = runsOf(c); if (r.some(x => x.t.trim())) out.push(P(r, { left: ctx.left || 0, after: 6 })); }
      }
    };
    walk(d.body || d.documentElement);
    if (skipped) notes.push(`${plural(skippedImg2(skipped), 'immagine esterna', 'immagini esterne')} non ${skipped === 1 ? 'inclusa' : 'incluse'}: la pagina non scarica nulla da internet`);
    return { blocks: out, title: d.title || '', lang: d.documentElement.getAttribute('lang') || '' };
  }
  const skippedImg2 = n => n;
  return { decode, txt, md, csv, html };
})();

/* ---------- PowerPoint (.pptx) → pagine (una per diapositiva) ----------
   Ogni forma va al suo posto: caselle di testo (anche quelle che ereditano posizione e stile dal layout e dallo schema),
   elenchi puntati, colori del tema, sfondi, rettangoli colorati, immagini e tabelle. Il titolo della diapositiva è un H1. */
const PptxIn = (() => {
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const desc = (n, tag) => n ? [...n.getElementsByTagNameNS('*', tag)] : [];
  const kids = (n, tag) => n ? [...n.childNodes].filter(c => c.nodeType === 1 && (!tag || c.localName === tag)) : [];
  const kid = (n, tag) => kids(n, tag)[0] || null;
  const path = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = base.split('/').slice(0, -1); for (const x of t.split('/')) { if (x === '..') parts.pop(); else if (x !== '.') parts.push(x); } return parts.join('/'); };
  const EMU = 12700;
  async function read(bytes, notes) {
    const z = await JSZip.loadAsync(bytes);
    const txt = async p => (await z.file(p)?.async('string')) || null;
    const pres = await txt('ppt/presentation.xml'); if (!pres) throw codedError('Il file non contiene una presentazione PowerPoint leggibile.', 'FORMAT');
    const pd = parse(pres); const sz = desc(pd, 'sldSz')[0];
    const W = sz ? +sz.getAttribute('cx') / EMU : 720, H = sz ? +sz.getAttribute('cy') / EMU : 405;
    const relsOf = async p => { const r = await txt(p.replace(/([^/]+)$/, '_rels/$1.rels')); const o = {}; if (r) for (const e of desc(parse(r), 'Relationship')) o[e.getAttribute('Id')] = { t: path(p, e.getAttribute('Target')), type: e.getAttribute('Type') || '', ext: e.getAttribute('TargetMode') === 'External' }; return o; };
    const presRels = await relsOf('ppt/presentation.xml');
    // tema: colori e caratteri
    const theme = { colors: {}, minor: 'sans', major: 'sans' };
    const themeRel = Object.values(presRels).find(r => /theme/.test(r.type));
    let masterTheme = null;
    const loadTheme = async p => { const t = await txt(p); if (!t) return; const td = parse(t); for (const n of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) { const e = desc(td, n)[0]; const v = e && (desc(e, 'srgbClr')[0]?.getAttribute('val') || desc(e, 'sysClr')[0]?.getAttribute('lastClr')); if (v) theme.colors[n] = v; } const lat = tag => desc(desc(td, tag)[0], 'latin')[0]?.getAttribute('typeface'); theme.minor = FlowPdf.famOf(lat('minorFont')); theme.major = FlowPdf.famOf(lat('majorFont')); };
    if (themeRel) await loadTheme(themeRel.t);
    const MAP = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    const clr = n => {
      if (!n) return null; const s = kid(n, 'srgbClr'), sc = kid(n, 'schemeClr'), sy = kid(n, 'sysClr');
      let hex = s ? s.getAttribute('val') : sc ? theme.colors[MAP[sc.getAttribute('val')] || sc.getAttribute('val')] : sy ? sy.getAttribute('lastClr') : null;
      if (!hex) return null;
      const node = s || sc || sy; const lm = kid(node, 'lumMod'), lo = kid(node, 'lumOff'), sh = kid(node, 'shade'), ti = kid(node, 'tint');
      if (lm || lo || sh || ti) { let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); const f = (lm ? +lm.getAttribute('val') / 1e5 : 1), o = (lo ? +lo.getAttribute('val') / 1e5 : 0); if (lm || lo) [r, g, b] = [r, g, b].map(v => Math.min(255, v * f + 255 * o)); if (sh) [r, g, b] = [r, g, b].map(v => v * +sh.getAttribute('val') / 1e5); if (ti) [r, g, b] = [r, g, b].map(v => 255 - (255 - v) * +ti.getAttribute('val') / 1e5); hex = [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
      return '#' + hex;
    };
    const fillOf = sp => { if (!sp) return undefined; if (kid(sp, 'noFill')) return null; const f = kid(sp, 'solidFill'); return f ? clr(f) : undefined; };
    // segnaposto: posizione e testo predefinito dal layout e dallo schema
    const phKey = sp => { const ph = desc(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph')[0]; return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '' } : null; };
    const phIndex = doc => { const o = []; for (const sp of desc(doc, 'sp')) { const k = phKey(sp); if (k) o.push({ k, sp }); } return o; };
    const findPh = (list, k) => list.find(x => k.idx && x.k.idx === k.idx) || list.find(x => x.k.type === k.type) || list.find(x => (k.type === 'ctrTitle' && x.k.type === 'title') || (k.type === 'subTitle' && x.k.type === 'body'));
    const xfrmOf = sp => { const x = desc(kid(sp, 'spPr') || kid(sp, 'xfrm') && sp, 'xfrm')[0] || kid(sp, 'xfrm'); if (!x) return null; const off = kid(x, 'off'), ext = kid(x, 'ext'); return off && ext ? { x: +off.getAttribute('x') / EMU, y: +off.getAttribute('y') / EMU, w: +ext.getAttribute('cx') / EMU, h: +ext.getAttribute('cy') / EMU } : null; };
    const lvlSize = (st, lvl) => { const l = st && desc(st, `lvl${lvl}pPr`)[0]; const d = l && kid(l, 'defRPr'); return d && d.getAttribute('sz') ? +d.getAttribute('sz') / 100 : null; };
    // proprietà di un livello lungo la catena forma → layout → schema → stili del testo dello schema
    const lvlOf = (chain, lvl) => chain.map(st => st && desc(st, `lvl${lvl}pPr`)[0]).filter(Boolean);
    const firstAttr = (els, a) => { for (const e of els) if (e.getAttribute(a) != null) return e.getAttribute(a); return null; };
    const firstKid = (els, tag) => { for (const e of els) { const k = kid(e, tag); if (k) return k; } return null; };
    const firstDef = (els, f) => { for (const e of els) { const d = kid(e, 'defRPr'); if (d) { const v = f(d); if (v != null) return v; } } return null; };
    const slides = []; let skipped = 0, images = 0, charts = 0;
    const ids = desc(pd, 'sldId');
    for (const [si, sid] of ids.entries()) {
      const rid = sid.getAttribute('r:id') || sid.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const sp = presRels[rid]?.t; if (!sp) continue;
      const sx = await txt(sp); if (!sx) continue;
      const sd = parse(sx); if (sd.documentElement.getAttribute('show') === '0') continue;
      const rels = await relsOf(sp);
      const layP = Object.values(rels).find(r => /slideLayout/.test(r.type))?.t;
      const layD = layP ? parse(await txt(layP)) : null, layRels = layP ? await relsOf(layP) : {};
      const masP = Object.values(layRels).find(r => /slideMaster/.test(r.type))?.t;
      const masD = masP ? parse(await txt(masP)) : null, masRels = masP ? await relsOf(masP) : {};
      const layPh = layD ? phIndex(layD) : [], masPh = masD ? phIndex(masD) : [];
      const tStyles = masD ? desc(masD, 'txStyles')[0] : null;
      // sfondo: della diapositiva, del layout o dello schema
      const bgOf = d => { const bg = d && desc(d, 'bg')[0]; if (!bg) return undefined; const pr = kid(bg, 'bgPr'); if (pr) return fillOf(pr) || undefined; const ref = kid(bg, 'bgRef'); return ref ? clr(ref) : undefined; };
      const bg = bgOf(sd) ?? bgOf(layD) ?? bgOf(masD) ?? '#FFFFFF';
      const out = [{ type: 'newpage' }, { type: 'abs', kind: 'rect', x: 0, y: 0, w: W, h: H, fill: bg }];
      const img = async (blip, relMap, base) => {
        const r = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
        const t = relMap[r]; if (!t || t.ext) { skipped++; return null; }
        const b = await z.file(t.t)?.async('uint8array'); if (!b) { skipped++; return null; }
        if (b[0] === 0x89 && b[1] === 0x50) return { kind: 'png', bytes: b }; if (b[0] === 0xFF && b[1] === 0xD8) return { kind: 'jpg', bytes: b };
        try { const bmp = await createImageBitmap(new Blob([b])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); const bl = await new Promise(r => c.toBlob(r, 'image/png')); return { kind: 'png', bytes: new Uint8Array(await bl.arrayBuffer()) }; } catch { skipped++; return null; }
      };
      // testo di una forma → paragrafi
      const textBlocks = (spEl, inh, isTitle, phType) => {
        const tb = kid(spEl, 'txBody'); if (!tb) return [];
        const bp = kid(tb, 'bodyPr'), na = desc(bp, 'normAutofit')[0];
        const scale = na && na.getAttribute('fontScale') ? +na.getAttribute('fontScale') / 1e5 : 1;
        const lst = kid(tb, 'lstStyle');
        const master = isTitle ? kid(tStyles, 'titleStyle') : phType ? kid(tStyles, 'bodyStyle') : kid(tStyles, 'otherStyle');
        const out = [];
        for (const p of kids(tb, 'p')) {
          const pPr = kid(p, 'pPr'), lvl = +(pPr?.getAttribute('lvl') || 0) + 1;
          const base = (lvlSize(lst, lvl) || lvlSize(inh?.lst, lvl) || lvlSize(inh?.lst2, lvl) || lvlSize(master, lvl) || (isTitle ? 32 : 18)) * scale;
          const L = [pPr, ...lvlOf([lst, inh?.lst, inh?.lst2, master], lvl)].filter(Boolean);
          const inhColor = firstDef(L, d => clr(kid(d, 'solidFill'))), inhBold = firstDef(L, d => d.getAttribute('b') != null ? d.getAttribute('b') === '1' : null);
          const runs = [];
          for (const r of kids(p)) {
            if (r.localName !== 'r' && r.localName !== 'fld' && r.localName !== 'br') continue;
            if (r.localName === 'br') { runs.push({ t: '\n', size: base }); continue; }
            const rp = kid(r, 'rPr'); const t = kid(r, 't')?.textContent ?? '';
            const f = desc(rp, 'latin')[0]?.getAttribute('typeface');
            runs.push({ t, size: rp?.getAttribute('sz') ? +rp.getAttribute('sz') / 100 * scale : base, b: rp?.getAttribute('b') != null ? rp.getAttribute('b') === '1' : !!inhBold, i: rp?.getAttribute('i') === '1', u: !!rp?.getAttribute('u') && rp.getAttribute('u') !== 'none', s: rp?.getAttribute('strike') && rp.getAttribute('strike') !== 'noStrike', color: clr(kid(rp, 'solidFill')) || inh?.color || inhColor || (theme.colors.dk1 ? '#' + theme.colors.dk1 : null), fam: f ? (/^\+mj/.test(f) ? theme.major : /^\+mn/.test(f) ? theme.minor : FlowPdf.famOf(f)) : (isTitle ? theme.major : theme.minor) });
          }
          const algn = firstAttr(L, 'algn') || (phType === 'ctrTitle' || phType === 'subTitle' ? 'ctr' : 'l');
          // segno dell'elenco: il primo indicato lungo la catena (un «nessun segno» più vicino vince)
          let buNone = false, buChar = null, buAuto = null;
          for (const e of L) { if (kid(e, 'buNone')) { buNone = true; break; } const c = kid(e, 'buChar'); if (c) { buChar = c.getAttribute('char'); break; } const a = kid(e, 'buAutoNum'); if (a) { buAuto = a; break; } }
          const bullet = !buNone && runs.some(r => String(r.t).trim()) && !!(buChar || buAuto);
          const blk = { type: 'p', role: isTitle ? 'H1' : 'P', runs: runs.length ? runs : [{ t: '', size: base }], size: base, fam: isTitle ? theme.major : theme.minor, align: { ctr: 'center', r: 'right', just: 'justify' }[algn] || 'left', after: base * .25, lh: 1.08, color: inh?.color };
          if (bullet) { blk.marker = buAuto ? `${out.filter(b => b.marker).length + 1}.` : (buChar && !/[-]/.test(buChar) ? buChar : '•'); blk.left = base * .9 * lvl; blk.hang = base * .8; blk.markerColor = blk.runs[0]?.color || '#000000'; }
          out.push(blk);
        }
        return out;
      };
    // grafici (DrawingML Chart): si disegnano dai valori memorizzati nel file (colonne, barre, linee, aree, torte)
    const chartBlocks = async (cx, relMap, box, off) => {
      const cr = cx.getAttribute('r:id') || cx.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const t = relMap[cr]; if (!t) return null;
      const xml = await txt(t.t); if (!xml) return null;
      const cd = parse(xml), plot = desc(cd, 'plotArea')[0]; if (!plot) return null;
      const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'pieChart', 'pie3DChart', 'doughnutChart'];
      const ch = kids(plot).find(k => kinds.includes(k.localName)); if (!ch) return null;
      const kind = ch.localName.replace('3D', '').replace('Chart', ''), dir = kid(ch, 'barDir')?.getAttribute('val') || 'col', grp = kid(ch, 'grouping')?.getAttribute('val') || 'clustered';
      const ptsOf = n => { const c = n && (desc(n, 'numCache')[0] || desc(n, 'strCache')[0] || desc(n, 'strLit')[0] || desc(n, 'numLit')[0]); return c ? desc(c, 'pt').map(p => ({ i: +p.getAttribute('idx'), v: kid(p, 'v')?.textContent ?? '' })) : []; };
      const ACC = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(a => '#' + (theme.colors[a] || '4472C4'));
      const series = kids(ch, 'ser').map((s, k) => {
        const name = ptsOf(kid(s, 'tx')).map(p => p.v).join(' ') || `Serie ${k + 1}`;
        const cats = ptsOf(kid(s, 'cat')), vals = ptsOf(kid(s, 'val'));
        const n = Math.max(cats.length, vals.length, ...vals.map(v => v.i + 1));
        const v = Array.from({ length: n }, (_, i) => { const p = vals.find(x => x.i === i); return p ? +p.v || 0 : 0; });
        const c = Array.from({ length: n }, (_, i) => cats.find(x => x.i === i)?.v ?? String(i + 1));
        const col = fillOf(kid(s, 'spPr')) || clr(desc(kid(kid(s, 'spPr'), 'ln'), 'solidFill')[0]) || ACC[k % 6];
        const pc = kids(s, 'dPt').map(d => ({ i: +kid(d, 'idx')?.getAttribute('val'), c: fillOf(kid(d, 'spPr')) }));
        return { name, v, c, col, pc };
      });
      if (!series.length) return null;
      const title = desc(desc(cd, 'title')[0], 't').map(x => x.textContent).join('') || '';
      const fmt = x => (Math.abs(x) >= 1e6 ? (x / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' mln' : x.toLocaleString('it-IT', { maximumFractionDigits: 2 }));
      const out = [], label = (x, y, w, h, t, size, al = 'center', color = '#404040', b = false) => out.push({ type: 'abs', kind: 'frame', x, y, w, h, l: 0, r: 0, t: 0, b: 0, anchor: 'ctr', blocks: [{ type: 'p', role: 'Artifact', runs: [{ t, size, color, b }], size, align: al, after: 0, lh: 1, fit: true }] });
      const pad = Math.min(box.w, box.h) * .06, FS = Math.max(9, Math.min(14, box.h / 22));   // scritte proporzionate al grafico
      let x0 = box.x + pad, y0 = box.y + pad, w = box.w - 2 * pad, h = box.h - 2 * pad;
      if (title) { label(x0, y0, w, FS * 1.6, title, FS * 1.25, 'center', '#262626', true); y0 += FS * 2; h -= FS * 2; }
      const legend = series.length > 1 || kind === 'pie' || kind === 'doughnut';
      const items = kind === 'pie' || kind === 'doughnut' ? series[0].c.map((c, i) => ({ t: c, col: series[0].pc.find(p => p.i === i)?.c || ACC[i % 6] })) : series.map(s => ({ t: s.name, col: s.col }));
      if (legend) { h -= FS * 2.2; const iw = FS * 8; let lx = x0 + w / 2 - Math.min(8, items.length) * iw / 2; for (const it of items.slice(0, 8)) { out.push({ type: 'abs', kind: 'rect', x: lx, y: y0 + h + FS * .9, w: FS * .75, h: FS * .75, fill: it.col }); label(lx + FS, y0 + h + FS * .6, iw - FS * 1.2, FS * 1.4, it.t, FS, 'left'); lx += iw; } }
      if (kind === 'pie' || kind === 'doughnut') {
        const s = series[0], tot = s.v.reduce((a, b) => a + Math.max(0, b), 0) || 1, R = Math.min(w, h) / 2 * .92, cx0 = x0 + w / 2, cy0 = y0 + h / 2;
        let a0 = -Math.PI / 2;
        s.v.forEach((v, i) => {
          const a1 = a0 + 2 * Math.PI * Math.max(0, v) / tot, large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M 0 0 L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
          out.push({ type: 'abs', kind: 'svg', x: cx0, y: cy0, d, fill: s.pc.find(p => p.i === i)?.c || ACC[i % 6], line: '#FFFFFF', lw: 1 });
          const am = (a0 + a1) / 2; if (v / tot > .04) label(cx0 + R * .62 * Math.cos(am) - FS * 2.5, cy0 + R * .62 * Math.sin(am) - FS * .7, FS * 5, FS * 1.4, Math.round(100 * v / tot) + '%', FS, 'center', '#FFFFFF', true);
          a0 = a1;
        });
        if (kind === 'doughnut') out.push({ type: 'abs', kind: 'svg', x: cx0, y: cy0, d: `M ${-R * .5} 0 A ${R * .5} ${R * .5} 0 1 0 ${R * .5} 0 A ${R * .5} ${R * .5} 0 1 0 ${-R * .5} 0 Z`, fill: '#FFFFFF' });
      } else {
        const stacked = /stacked/i.test(grp), n = series[0].v.length;
        const sums = Array.from({ length: n }, (_, i) => series.reduce((a, s) => a + (s.v[i] || 0), 0));
        let max = Math.max(0, ...(stacked ? sums : series.flatMap(s => s.v))), min = Math.min(0, ...series.flatMap(s => s.v));
        const step = (() => { const r = (max - min) / 5 || 1, p = 10 ** Math.floor(Math.log10(r)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= r) || r; })();
        max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step; const span = max - min || 1;
        const ax = FS * 3.6, ay = FS * 1.8, px = x0 + ax, pw = w - ax - 4, py = y0 + 4, ph = h - ay - 4;
        const horiz = kind === 'bar' && dir === 'bar';
        // griglia e scala
        for (let v = min; v <= max + step / 2; v += step) {
          if (horiz) { const xx = px + (v - min) / span * pw; out.push({ type: 'abs', kind: 'line', x1: xx, y1: py, x2: xx, y2: py + ph, c: '#D9D9D9', w: .5 }); label(xx - FS * 2.5, py + ph + 2, FS * 5, FS * 1.3, fmt(v), FS * .9); }
          else { const yy = py + ph - (v - min) / span * ph; out.push({ type: 'abs', kind: 'line', x1: px, y1: yy, x2: px + pw, y2: yy, c: '#D9D9D9', w: .5 }); label(x0, yy - FS * .65, ax - 4, FS * 1.3, fmt(v), FS * .9, 'right'); }
        }
        const slot = (horiz ? ph : pw) / n;
        series[0].c.forEach((c, i) => horiz ? label(x0, py + slot * i, ax - 4, slot, c, FS * .9, 'right') : label(px + slot * i, py + ph + 3, slot, FS * 1.3, c, FS * .9));
        if (kind === 'bar') {
          const gw = slot * .7, bw = stacked ? gw : gw / series.length; const acc = new Array(n).fill(0);
          series.forEach((s, k) => s.v.forEach((v, i) => {
            const base = stacked ? acc[i] : 0, a = (Math.min(base, base + v) - min) / span, b2 = (Math.max(base, base + v) - min) / span; if (stacked) acc[i] += v;
            const o = slot * i + (slot - gw) / 2 + (stacked ? 0 : k * bw);
            out.push(horiz ? { type: 'abs', kind: 'rect', x: px + a * pw, y: py + o, w: (b2 - a) * pw, h: bw * .92, fill: s.col } : { type: 'abs', kind: 'rect', x: px + o, y: py + ph - b2 * ph, w: bw * .92, h: (b2 - a) * ph, fill: s.col });
          }));
        } else {
          series.forEach(s => {
            const P = s.v.map((v, i) => [px + slot * (i + .5), py + ph - (v - min) / span * ph]);
            if (kind === 'area') out.push({ type: 'abs', kind: 'svg', x: 0, y: 0, d: `M ${P[0][0]} ${py + ph} ` + P.map(p => `L ${p[0]} ${p[1]}`).join(' ') + ` L ${P[P.length - 1][0]} ${py + ph} Z`, fill: s.col });
            else { for (let i = 1; i < P.length; i++) out.push({ type: 'abs', kind: 'line', x1: P[i - 1][0], y1: P[i - 1][1], x2: P[i][0], y2: P[i][1], c: s.col, w: 2 }); for (const p of P) out.push({ type: 'abs', kind: 'rect', x: p[0] - 2.5, y: p[1] - 2.5, w: 5, h: 5, fill: s.col }); }
          });
        }
        out.push({ type: 'abs', kind: 'line', x1: px, y1: py + ph, x2: px + pw, y2: py + ph, c: '#8C8C8C', w: .75 });
      }
      // testo alternativo: tipo, titolo e dati (chi non vede il grafico ne ha i numeri)
      const KN = { bar: dir === 'bar' ? 'a barre' : 'a colonne', line: 'a linee', area: 'ad aree', pie: 'a torta', doughnut: 'ad anello' };
      const alt = `Grafico ${KN[kind] || ''}${title ? ' «' + title + '»' : ''}: ` + series.map(s => `${series.length > 1 ? s.name + ': ' : ''}${s.c.map((c, i) => `${c} ${fmt(s.v[i])}`).join(', ')}`).join('; ') + '.';
      return { blocks: out, alt };
    };
      const draw = async (tree, relMap, base, off = { dx: 0, dy: 0, sx: 1, sy: 1 }) => {
        for (const el of kids(tree)) {
          const t = el.localName;
          if (t === 'grpSp') { const gx = desc(kid(el, 'grpSpPr'), 'xfrm')[0]; let o = off; if (gx) { const off2 = kid(gx, 'off'), ext = kid(gx, 'ext'), co = kid(gx, 'chOff'), ce = kid(gx, 'chExt'); if (off2 && ext && co && ce) { const sx = (+ext.getAttribute('cx') || 1) / (+ce.getAttribute('cx') || 1), sy = (+ext.getAttribute('cy') || 1) / (+ce.getAttribute('cy') || 1); o = { sx: off.sx * sx, sy: off.sy * sy, dx: off.dx + off.sx * (+off2.getAttribute('x') / EMU - +co.getAttribute('x') / EMU * sx), dy: off.dy + off.sy * (+off2.getAttribute('y') / EMU - +co.getAttribute('y') / EMU * sy) }; } } await draw(el, relMap, base, o); continue; }
          const tr = r => r && { x: off.dx + r.x * off.sx, y: off.dy + r.y * off.sy, w: r.w * off.sx, h: r.h * off.sy };
          if (t === 'sp') {
            const k = phKey(el); const lay = k ? findPh(layPh, k) : null, mas = k ? findPh(masPh, k) : null;
            const box = tr(xfrmOf(el) || (lay && xfrmOf(lay.sp)) || (mas && xfrmOf(mas.sp))); if (!box) continue;
            const spPr = kid(el, 'spPr'); const fill = fillOf(spPr); const ln = kid(spPr, 'ln'); const lineC = ln && !kid(ln, 'noFill') ? clr(kid(ln, 'solidFill')) : null;
            if (fill || lineC) out.push({ type: 'abs', kind: 'rect', ...box, fill, line: lineC, lw: ln?.getAttribute('w') ? +ln.getAttribute('w') / EMU : .75 });
            const isTitle = !!k && /title/i.test(k.type) && !/sub/i.test(k.type);
            const inh = { lst: lay && kid(kid(lay.sp, 'txBody'), 'lstStyle'), lst2: mas && kid(kid(mas.sp, 'txBody'), 'lstStyle') };
            const blocks = textBlocks(el, inh, isTitle, k?.type);
            if (blocks.some(b => b.runs.some(r => String(r.t).trim()))) {
              const bp = desc(kid(el, 'txBody'), 'bodyPr')[0] || (lay && desc(kid(lay.sp, 'txBody'), 'bodyPr')[0]);
              const ins = a => bp?.getAttribute(a) ? +bp.getAttribute(a) / EMU : null;
              out.push({ type: 'abs', kind: 'frame', ...box, l: ins('lIns') ?? 7.2, r: ins('rIns') ?? 7.2, t: ins('tIns') ?? 3.6, b: ins('bIns') ?? 3.6, anchor: bp?.getAttribute('anchor') || (isTitle ? 'ctr' : 't'), shrink: true, blocks });
            }
          } else if (t === 'pic') {
            const box = tr(xfrmOf(el)); const im = await img(desc(el, 'blip')[0], relMap, base);
            if (box && im) { images++; const dp = desc(el, 'cNvPr')[0]; out.push({ type: 'abs', kind: 'img', ...box, img: im, alt: (dp?.getAttribute('descr') || dp?.getAttribute('title') || '').trim() || 'Immagine' }); }
          } else if (t === 'graphicFrame') {
            const tbl = desc(el, 'tbl')[0], gx = kid(el, 'xfrm'); if (!gx) continue;
            const box = tr({ x: +kid(gx, 'off').getAttribute('x') / EMU, y: +kid(gx, 'off').getAttribute('y') / EMU, w: +kid(gx, 'ext').getAttribute('cx') / EMU, h: +kid(gx, 'ext').getAttribute('cy') / EMU });
            if (!tbl) {
              const cx = desc(el, 'chart')[0];
              const g = cx ? await chartBlocks(cx, relMap, box, off).catch(() => null) : null;
              if (g) { charts++; out.push({ type: 'abs', kind: 'group', ...box, blocks: g.blocks, alt: g.alt }); } else skipped++;   // SmartArt e grafici di tipo non gestito
              continue;
            }
            const cols = desc(tbl, 'gridCol').map(g => +g.getAttribute('w') / EMU * off.sx);
            let yy = box.y;
            for (const [ri, rowEl] of kids(tbl, 'tr').entries()) {
              const rh = +rowEl.getAttribute('h') / EMU * off.sy; let xx = box.x, ci = 0;
              for (const tc of kids(rowEl, 'tc')) {
                if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') { xx += cols[ci++] || 0; continue; }
                const span = +(tc.getAttribute('gridSpan') || 1), w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0); ci += span;
                const tcPr = kid(tc, 'tcPr'), cf = fillOf(tcPr) ?? (ri === 0 ? clr(desc(kid(tcPr, 'solidFill'), 'schemeClr')[0] && kid(tcPr, 'solidFill')) : null);
                out.push({ type: 'abs', kind: 'rect', x: xx, y: yy, w, h: rh, fill: cf || (ri === 0 ? theme.colors.accent1 ? '#' + theme.colors.accent1 : null : (ri % 2 ? '#CFD5EA' : '#E9EBF5')), line: '#FFFFFF', lw: 1 });
                const blocks = textBlocks(tc, null, false, null).map(b => ({ ...b, runs: b.runs.map(r => ({ ...r, color: ri === 0 && !desc(tc, 'solidFill').some(f => f.parentNode.localName === 'rPr') ? '#FFFFFF' : r.color, b: r.b || ri === 0 })) }));
                out.push({ type: 'abs', kind: 'frame', x: xx, y: yy, w, h: rh, l: 7.2, r: 7.2, t: 3.6, b: 3.6, anchor: 't', shrink: true, blocks });
                xx += w;
              }
              yy += rh;
            }
          }
        }
      };
      // forme dello schema e del layout che compaiono su ogni diapositiva (loghi, bande colorate), poi la diapositiva
      const spTree = d => desc(d, 'spTree')[0];
      const nonPh = async (d, relMap, base) => { const t = spTree(d); if (!t) return; const clone = t.cloneNode(true); for (const sp of [...clone.childNodes]) if (sp.nodeType === 1 && (desc(sp, 'ph').length)) clone.removeChild(sp); await draw(clone, relMap, base); };
      if (masD && sd.documentElement.getAttribute('showMasterSp') !== '0' && layD?.documentElement.getAttribute('showMasterSp') !== '0') await nonPh(masD, masRels, masP);
      if (layD && sd.documentElement.getAttribute('showMasterSp') !== '0') await nonPh(layD, layRels, layP);
      await draw(spTree(sd), rels, sp);
      slides.push(out);
    }
    if (!slides.length) throw codedError('La presentazione non contiene diapositive visibili.', 'CONTENT');
    if (skipped) notes.push(`${plural(skipped, 'elemento', 'elementi')} (SmartArt, grafici di tipo raro, video o immagini in formati non leggibili dal browser) non ${skipped === 1 ? 'è incluso' : 'sono inclusi'}`);
    return { size: [W, H], blocks: slides.flat(), count: slides.length };
  }
  return { read };
})();

/* ---------- conversione: un file → PDF ---------- */