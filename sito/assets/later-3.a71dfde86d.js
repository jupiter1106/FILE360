const PDFACheck = (() => {
  /* ---------- oggetti ---------- */
  class Name { constructor(v, len) { this.v = v; this.len = len; } toString() { return '/' + this.v; } }
  class Ref { constructor(n, g) { this.n = n; this.g = g; } toString() { return `${this.n} ${this.g} R`; } }
  class Str { constructor(b, hex) { this.b = b; this.hex = hex; } get s() { return latin1(this.b); } }
  class Dict { constructor() { this.m = new Map(); } get(k) { return this.m.get(k); } has(k) { return this.m.has(k); } get size() { return this.m.size; } keys() { return [...this.m.keys()]; } }
  class Stream { constructor(dict, data, ref) { this.dict = dict; this.data = data; this.ref = ref; this._dec = undefined; } get(k) { return this.dict.get(k); } has(k) { return this.dict.has(k); } }
  class Op { constructor(op, args) { this.op = op; this.args = args; } }
  const latin1 = (b, s = 0, e = b.length) => { let out = ''; for (let i = s; i < e; i += 8192) out += String.fromCharCode.apply(null, b.subarray(i, Math.min(e, i + 8192))); return out; };
  const isName = (o, v) => o instanceof Name && (v === undefined || o.v === v);
  const nv = o => o instanceof Name ? o.v : null;

  /* ---------- lettura (lexer) ---------- */
  const WS = new Uint8Array(256); for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
  const DL = new Uint8Array(256); for (const c of '()<>[]{}/%') DL[c.charCodeAt(0)] = 1;
  const HEXV = new Int8Array(256).fill(-1); for (let i = 0; i < 16; i++) { HEXV['0123456789abcdef'.charCodeAt(i)] = i; HEXV['0123456789ABCDEF'.charCodeAt(i)] = i; }
  const EOFT = { eof: true };
  class Lexer {
    constructor(b, p = 0, lim = null) { this.b = b; this.p = p; this.lim = lim; this.n = b.length; }
    ws() {
      const b = this.b, n = this.n;
      for (;;) {
        while (this.p < n && WS[b[this.p]]) this.p++;
        if (this.p < n && b[this.p] === 37) { while (this.p < n && b[this.p] !== 10 && b[this.p] !== 13) this.p++; continue; }
        return;
      }
    }
    // un token: numero, nome, stringa, parola chiave o delimitatore
    tok() {
      this.ws();
      const b = this.b, n = this.n;
      if (this.p >= n) return EOFT;
      const c = b[this.p];
      if (c === 47) return this.name();
      if (c === 40) return this.lit();
      if (c === 60) { if (b[this.p + 1] === 60) { this.p += 2; return '<<'; } return this.hex(); }
      if (c === 62) { if (b[this.p + 1] === 62) { this.p += 2; return '>>'; } this.p++; return '>'; }
      if (c === 91 || c === 93 || c === 123 || c === 125) { this.p++; return String.fromCharCode(c); }
      if (c === 41) { this.p++; return ')'; }
      const s = this.p; while (this.p < n && !WS[b[this.p]] && !DL[b[this.p]]) this.p++;
      if (this.p === s) { this.p++; return String.fromCharCode(c); }
      const t = latin1(b, s, this.p);
      if (/^[+-]?\d+$/.test(t)) { const v = parseInt(t, 10); this.lim?.int(v); return { num: v, int: true }; }
      if (/^[+-]?(\d+\.\d*|\.\d+)$/.test(t)) { const v = parseFloat(t); this.lim?.real(v); return { num: v, int: false }; }
      if (/^[+-]?[\d.]+$/.test(t) || /^[+-]+[\d.]*$/.test(t)) return { num: 0, int: false, bad: true };
      return { kw: t };
    }
    name() {
      const b = this.b, n = this.n; this.p++;
      const out = [];
      while (this.p < n && !WS[b[this.p]] && !DL[b[this.p]]) {
        const c = b[this.p];
        if (c === 35 && HEXV[b[this.p + 1]] >= 0 && HEXV[b[this.p + 2]] >= 0) { out.push(HEXV[b[this.p + 1]] * 16 + HEXV[b[this.p + 2]]); this.p += 3; }
        else { out.push(c); this.p++; }
      }
      const u = Uint8Array.from(out);
      this.lim?.name(u.length);
      const nm = new Name(latin1(u), u.length); nm.bytes = u; return nm;
    }
    lit() {
      const b = this.b, n = this.n; this.p++;
      let depth = 1; const out = [];
      while (this.p < n) {
        let c = b[this.p++];
        if (c === 92) {
          c = b[this.p++];
          if (c === 110) out.push(10); else if (c === 114) out.push(13); else if (c === 116) out.push(9); else if (c === 98) out.push(8); else if (c === 102) out.push(12);
          else if (c >= 48 && c <= 55) { let v = c - 48; for (let k = 0; k < 2 && b[this.p] >= 48 && b[this.p] <= 55; k++) v = v * 8 + b[this.p++] - 48; out.push(v & 255); }
          else if (c === 13) { if (b[this.p] === 10) this.p++; }
          else if (c === 10) { }
          else out.push(c);
        } else if (c === 40) { depth++; out.push(c); }
        else if (c === 41) { if (--depth === 0) break; out.push(c); }
        else out.push(c);
      }
      const s = new Str(Uint8Array.from(out), false);
      this.lim?.str(s.b.length, false);
      return s;
    }
    hex() {
      const b = this.b, n = this.n; this.p++;
      const out = []; let cnt = 0, bad = false, hi = -1;
      while (this.p < n && b[this.p] !== 62) {
        const c = b[this.p++]; if (WS[c]) continue;
        cnt++; const v = HEXV[c]; if (v < 0) { bad = true; continue; }
        if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
      }
      this.p++;
      if (hi >= 0) out.push(hi * 16);
      const s = new Str(Uint8Array.from(out), true); s.hexCount = cnt; s.hexBad = bad;
      this.lim?.str(s.b.length, true, cnt, bad);
      return s;
    }
    // un oggetto intero (con array, dizionari e riferimenti)
    obj(t = this.tok(), depth = 0) {
      if (t === EOFT) return undefined;
      if (depth > 200) throw new Error('annidamento eccessivo');
      if (t === '[') {
        const a = [];
        for (;;) { const x = this.tok(); if (x === ']' || x === EOFT) break; if (x && x.kw && (x.kw === 'endobj' || x.kw === 'stream')) { this.p -= x.kw.length; break; } a.push(this.obj(x, depth + 1)); }
        this.lim?.arr(a.length);
        return this.refs(a);
      }
      if (t === '<<') {
        const d = new Dict();
        for (;;) {
          const k = this.tok(); if (k === '>>' || k === EOFT) break;
          if (!(k instanceof Name)) { if (k && k.kw && (k.kw === 'endobj' || k.kw === 'stream')) { this.p -= k.kw.length; break; } continue; }
          const v = this.tok(); if (v === '>>') { d.m.set(k.v, null); break; }
          d.m.set(k.v, this.obj(v, depth + 1));
          if (d.m.get(k.v) && d.m.get(k.v).pendingRef) { }
        }
        this.lim?.dict(d.size);
        // riferimenti «n g R» scritti come numeri consecutivi
        for (const [k, v] of d.m) if (v && v.__ref) d.m.set(k, v.__ref);
        return d;
      }
      if (t && t.num !== undefined) {
        if (t.int && t.num >= 0) {
          const save = this.p, t2 = this.tok();
          if (t2 && t2.int && t2.num >= 0) {
            const save2 = this.p, t3 = this.tok();
            if (t3 && t3.kw === 'R') return new Ref(t.num, t2.num);
            this.p = save2;
          }
          this.p = save;
        }
        return t.num;
      }
      if (t instanceof Name || t instanceof Str) return t;
      if (t && t.kw) { if (t.kw === 'true') return true; if (t.kw === 'false') return false; if (t.kw === 'null') return null; return t; }
      return null;
    }
    refs(a) { return a; }
  }

  /* ---------- filtri ---------- */
  function inflate(data) {
    try { return pako.inflate(data); } catch (e) { }
    try { const inf = new pako.Inflate(); inf.push(data, false); if (inf.result && inf.result.length) return inf.result; if (inf.chunks && inf.chunks.length) { let n = 0; inf.chunks.forEach(c => n += c.length); const o = new Uint8Array(n); let k = 0; inf.chunks.forEach(c => { o.set(c, k); k += c.length; }); return o; } } catch (e) { }
    try { return pako.inflateRaw(data.subarray(2)); } catch (e) { }
    return new Uint8Array(0);
  }
  function predict(data, parms) {
    if (!(parms instanceof Dict)) return data;
    const pred = parms.get('Predictor') || 1; if (pred < 2) return data;
    const colors = parms.get('Colors') || 1, bpc = parms.get('BitsPerComponent') || 8, cols = parms.get('Columns') || 1;
    const bpp = Math.max(1, Math.ceil(colors * bpc / 8)), row = Math.ceil(colors * bpc * cols / 8);
    if (pred === 2) { const out = data.slice(); for (let r = 0; r + row <= out.length; r += row) for (let i = bpp; i < row; i++) out[r + i] = (out[r + i] + out[r + i - bpp]) & 255; return out; }
    const rows = Math.floor(data.length / (row + 1)), out = new Uint8Array(rows * row);
    let prev = new Uint8Array(row);
    for (let r = 0; r < rows; r++) {
      const t = data[r * (row + 1)], cur = data.subarray(r * (row + 1) + 1, (r + 1) * (row + 1)), o = out.subarray(r * row, (r + 1) * row);
      for (let i = 0; i < row; i++) {
        const a = i >= bpp ? o[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v = cur[i];
        if (t === 1) v += a; else if (t === 2) v += b; else if (t === 3) v += (a + b) >> 1;
        else if (t === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        o[i] = v & 255;
      }
      prev = o;
    }
    return out;
  }
  function a85(d) {
    const out = []; let t = [];
    for (let i = 0; i < d.length; i++) {
      const c = d[i]; if (WS[c]) continue; if (c === 126) break;
      if (c === 122 && !t.length) { out.push(0, 0, 0, 0); continue; }
      t.push(c - 33);
      if (t.length === 5) { let v = 0; for (const x of t) v = v * 85 + x; out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); t = []; }
    }
    if (t.length > 1) { const k = t.length; while (t.length < 5) t.push(84); let v = 0; for (const x of t) v = v * 85 + x; const bs = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...bs.slice(0, k - 1)); }
    return Uint8Array.from(out);
  }
  function ahx(d) { const out = []; let hi = -1; for (const c of d) { if (c === 62) break; const v = HEXV[c]; if (v < 0) continue; if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; } } if (hi >= 0) out.push(hi * 16); return Uint8Array.from(out); }
  function rl(d) { const out = []; for (let i = 0; i < d.length;) { const l = d[i++]; if (l === 128) break; if (l < 128) { for (let k = 0; k <= l && i < d.length; k++) out.push(d[i++]); } else { const v = d[i++]; for (let k = 0; k < 257 - l; k++) out.push(v); } } return Uint8Array.from(out); }
  function lzw(d, early = 1) {
    const out = []; let dict = [], bits = 9, bitbuf = 0, nb = 0, prev = null;
    const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push(null, null); bits = 9; };
    reset();
    for (let i = 0; i < d.length; i++) {
      bitbuf = (bitbuf << 8) | d[i]; nb += 8;
      while (nb >= bits) {
        const code = (bitbuf >> (nb - bits)) & ((1 << bits) - 1); nb -= bits;
        if (code === 256) { reset(); prev = null; continue; }
        if (code === 257) return Uint8Array.from(out);
        let e = dict[code];
        if (!e) { if (!prev) return Uint8Array.from(out); e = prev.concat(prev[0]); }
        out.push(...e);
        if (prev) dict.push(prev.concat(e[0]));
        prev = e;
        if (dict.length + early >= (1 << bits) && bits < 12) bits++;
      }
    }
    return Uint8Array.from(out);
  }
  const FILTERS = new Set(['ASCIIHexDecode', 'ASCII85Decode', 'FlateDecode', 'RunLengthDecode', 'CCITTFaxDecode', 'JBIG2Decode', 'DCTDecode', 'JPXDecode', 'LZWDecode', 'Crypt']);

  /* ---------- il documento ---------- */
  function parse(b, issue) {
    const D = { b, xref: new Map(), cache: new Map(), trailers: [], objStms: new Map(), lexical: [], issue };
    const lim = D.lim = makeLimits(D);
    const rawLex = (p) => new Lexer(b, p, lim);
    // fine del file e startxref
    const tail = latin1(b, Math.max(0, b.length - 2048));
    const sx = tail.lastIndexOf('startxref');
    let start = -1;
    if (sx >= 0) { const m = /startxref\s+(\d+)/.exec(tail.slice(sx)); if (m) start = +m[1]; }
    const seen = new Set();
    const readXref = (off, depth = 0) => {
      if (off < 0 || off >= b.length || seen.has(off) || depth > 50) return false;
      seen.add(off);
      let p = off; while (p < b.length && WS[b[p]]) p++;
      if (b[p] === 120 && latin1(b, p, p + 4) === 'xref') return readTable(p, depth);
      return readXrefStream(p, depth);
    };
    function readTable(p, depth) {
      const sec = { off: p, kind: 'table' };
      p += 4;
      // dopo «xref» un solo fine riga
      let q = p, eol = 0; if (b[q] === 13) { q++; eol++; } if (b[q] === 10) { q++; eol++; }
      if (!eol || (eol === 2 && b[p] !== 13)) sec.badEol = true;
      if (WS[b[q]]) sec.badEol = true;
      p = q;
      for (;;) {
        // intestazione della sottosezione: «primo numero»
        let e = p; while (e < b.length && b[e] !== 10 && b[e] !== 13) e++;
        const line = latin1(b, p, e);
        if (/^\s*trailer/.test(line) || !line.trim()) { if (!line.trim()) { p = e + 1; if (p >= b.length) break; continue; } break; }
        const m = /^(\d+)(\s+)(\d+)(\s*)$/.exec(line);
        if (!m) { if (/^\s*\d+\s+\d+/.test(line)) sec.badHeader = true; else break; }
        if (m && m[2] !== ' ') sec.badHeader = true;
        const first = m ? +m[1] : +line.trim().split(/\s+/)[0], count = m ? +m[3] : +line.trim().split(/\s+/)[1];
        p = e; if (b[p] === 13) p++; if (b[p] === 10) p++;
        for (let k = 0; k < count; k++) {
          let le = p; while (le < b.length && b[le] !== 10 && b[le] !== 13) le++;
          const ent = latin1(b, p, le).trim(); p = le; if (b[p] === 13) p++; if (b[p] === 10) p++;
          if (!ent) { k--; if (p >= b.length) break; continue; }
          const mm = /^(\d+)\s+(\d+)\s+([nf])/.exec(ent); if (!mm) continue;
          const num = first + k;
          if (!D.xref.has(num)) D.xref.set(num, mm[3] === 'n' ? { t: 1, off: +mm[1], g: +mm[2] } : { t: 0 });
        }
      }
      // il trailer
      const ti = latin1(b, p, Math.min(b.length, p + 200)).indexOf('trailer');
      if (ti < 0) { D.sections.push(sec); return true; }
      const L = rawLex(p + ti + 7), tr = L.obj();
      sec.trailer = tr instanceof Dict ? tr : new Dict();
      D.sections.push(sec);
      D.trailers.push(sec.trailer);
      if (sec.trailer.has('XRefStm')) readXref(sec.trailer.get('XRefStm'), depth + 1);
      if (sec.trailer.has('Prev')) readXref(sec.trailer.get('Prev'), depth + 1);
      return true;
    }
    function readXrefStream(p, depth) {
      const o = readIndirect(p, null);
      if (!o || !(o.v instanceof Stream) || nv(o.v.get('Type')) !== 'XRef') return false;
      const s = o.v, d = s.dict, sec = { off: p, kind: 'stream', trailer: d };
      D.sections.push(sec); D.trailers.push(d); D.hasXrefStream = true;
      const W = d.get('W'), size = d.get('Size') || 0;
      const idx = Array.isArray(d.get('Index')) ? d.get('Index') : [0, size];
      const data = decode(s);
      if (Array.isArray(W) && W.length >= 3) {
        const [w0, w1, w2] = W, rec = w0 + w1 + w2; let pos = 0;
        const rd = (w) => { let v = 0; for (let i = 0; i < w; i++) v = v * 256 + (data[pos++] || 0); return v; };
        for (let i = 0; i + 1 < idx.length; i += 2) for (let k = 0; k < idx[i + 1]; k++) {
          if (pos + rec > data.length) break;
          const t = w0 ? rd(w0) : 1, f2 = rd(w1), f3 = rd(w2), num = idx[i] + k;
          if (D.xref.has(num)) continue;
          if (t === 1) D.xref.set(num, { t: 1, off: f2, g: f3 }); else if (t === 2) D.xref.set(num, { t: 2, stm: f2, i: f3 }); else D.xref.set(num, { t: 0 });
        }
      }
      if (d.has('Prev')) readXref(d.get('Prev'), depth + 1);
      return true;
    }
    // ricostruzione: tutti gli «n g obj» del file
    function rebuild() {
      const s = latin1(b), re = /(\d+)[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+obj\b/g; let m;
      while ((m = re.exec(s))) D.xref.set(+m[1], { t: 1, off: m.index, g: +m[2] });
      let t = s.lastIndexOf('trailer');
      while (t >= 0) { const tr = rawLex(t + 7).obj(); if (tr instanceof Dict && tr.has('Root')) { D.trailers.unshift(tr); break; } t = s.lastIndexOf('trailer', t - 1); }
      if (!D.trailers.length) for (const [n] of D.xref) { const o = D.get(n); if (o instanceof Dict && nv(o.get('Type')) === 'Catalog') { const tr = new Dict(); tr.m.set('Root', new Ref(n, 0)); D.trailers.unshift(tr); break; } }
    }
    // un oggetto indiretto all'inizio di p: «n g obj … endobj»; controlla anche gli spazi
    function readIndirect(p, num) {
      let s0 = p; while (s0 < b.length && WS[b[s0]]) s0++;
      const L = rawLex(s0);
      const t1 = L.tok(); if (!t1 || !t1.int) return null;
      const a = L.p; const t2 = L.tok(); if (!t2 || !t2.int) return null;
      const bpos = L.p; const t3 = L.tok(); if (!t3 || t3.kw !== 'obj') return null;
      const sp = { ok: true };
      // «n g obj»: un solo spazio tra i numeri e prima di obj; fine riga prima del numero e dopo obj
      if (!(b[a] === 32 || WS[b[a]]) || WS[b[a + 1]]) sp.ok = false;
      if (WS[b[bpos + 1]] && !(bpos + 1 < L.p - 3)) { }
      const objKw = L.p - 3; if (objKw - bpos !== 1) sp.ok = false;
      if (s0 > 0 && b[s0 - 1] !== 10 && b[s0 - 1] !== 13) sp.ok = false;
      if (!(b[L.p] === 10 || b[L.p] === 13)) sp.ok = false;
      let v = L.obj();
      const save = L.p; const t = L.tok();
      if (t && t.kw === 'stream') {
        const d = v instanceof Dict ? v : new Dict();
        let q = L.p; const st = { crlf: true, eolEnd: true };
        if (b[q] === 13 && b[q + 1] === 10) q += 2; else if (b[q] === 10) q += 1; else { st.crlf = false; if (b[q] === 13) q++; }
        const start = q;
        let len = d.get('Length'); if (len instanceof Ref) { const lo = D.get(len.n); len = typeof lo === 'number' ? lo : null; }
        let end = -1, real = null;
        const endKw = (i) => b[i] === 101 && latin1(b, i, i + 9) === 'endstream';
        if (typeof len === 'number' && len >= 0 && start + len <= b.length) {
          let i = start + len, eol = 0; if (b[i] === 13) { i++; eol++; } if (b[i] === 10) { i++; eol++; }
          if (endKw(i)) { end = start + len; real = len; if (!eol) st.eolEnd = false; }
        }
        if (end < 0) {
          // cerca «endstream»
          let i = start; const lim2 = b.length - 9;
          while (i < lim2 && !endKw(i)) i++;
          let e = i; if (b[e - 1] === 10) e--; if (b[e - 1] === 13) e--;
          if (e === i) st.eolEnd = false;
          end = e; real = e - start;
          L.p = i;
        } else L.p = end;
        const s = new Stream(d, b.subarray(start, end), num != null ? new Ref(num, t2.num) : null);
        s._doc = D;
        s.lenOk = typeof len === 'number' && len === real; s.real = real; s.lenDecl = len; s.kw = st; s.at = start;
        v = s;
        const t4 = L.tok(); // endstream
        if (t4 && t4.kw === 'endstream') { }
      } else L.p = save;
      // «endobj» preceduto e seguito da un fine riga
      const before = L.p; const te = L.tok();
      if (te && te.kw === 'endobj') {
        const kwPos = L.p - 6;
        let j = kwPos - 1; if (!(b[j] === 10 || b[j] === 13)) sp.ok = false;
        if (L.p < b.length && !(b[L.p] === 10 || b[L.p] === 13)) sp.ok = false;
      } else { L.p = before; sp.ok = false; sp.noEnd = true; }
      return { v, num: t1.num, gen: t2.num, sp };
    }
    D.readIndirect = readIndirect;
    D.get = (num) => {
      if (D.cache.has(num)) return D.cache.get(num);
      D.cache.set(num, null);
      const e = D.xref.get(num); let v = null;
      try {
        if (e && e.t === 1) {
          const r = readIndirect(e.off, num);
          if (r && r.num === num) { v = r.v; D.lexical.push({ num, sp: r.sp }); }
          else {
            // offset sbagliato: si cerca l'oggetto nel file
            const s = latin1(b); const m = new RegExp(`(^|[^0-9])${num}\\s+\\d+\\s+obj\\b`).exec(s);
            if (m) { const r2 = readIndirect(m.index + m[1].length, num); if (r2) { v = r2.v; D.lexical.push({ num, sp: r2.sp }); } }
            D.badOffsets = true;
          }
        } else if (e && e.t === 2) v = fromObjStm(e.stm, e.i, num);
      } catch (err) { v = null; }
      D.cache.set(num, v);
      return v;
    };
    function fromObjStm(sn, idx, num) {
      let os = D.objStms.get(sn);
      if (!os) {
        const s = D.get(sn); if (!(s instanceof Stream)) return null;
        const data = decode(s), n = s.get('N') || 0, first = s.get('First') || 0;
        const L = new Lexer(data, 0, lim), offs = [];
        for (let i = 0; i < n; i++) { const a = L.tok(), c = L.tok(); offs.push([a.num, c.num]); }
        os = { data, first, offs }; D.objStms.set(sn, os);
      }
      const o = os.offs[idx]; if (!o || o[0] !== num) { const k = os.offs.findIndex(x => x[0] === num); if (k < 0) return null; return new Lexer(os.data, os.first + os.offs[k][1], lim).obj(); }
      return new Lexer(os.data, os.first + o[1], lim).obj();
    }
    D.R = (o) => { let k = 0; while (o instanceof Ref && k++ < 20) o = D.get(o.n); return o; };
    D.sections = [];
    let ok = start >= 0 && readXref(start);
    if (!ok || !D.trailers.length || !D.trailers.some(t => t.has('Root'))) { D.rebuilt = true; rebuild(); }
    D.trailer = D.trailers[0] || new Dict();
    return D;
  }
  function decode(s) {
    if (!(s instanceof Stream)) return new Uint8Array(0);
    if (s._dec !== undefined) return s._dec;
    let data = s.data;
    const D = s._doc;
    let f = s.get('Filter'), p = s.get('DecodeParms');
    const R = D ? D.R : (x => x);
    f = R(f); p = R(p);
    const fl = Array.isArray(f) ? f.map(R) : f ? [f] : [], pl = Array.isArray(p) ? p.map(R) : [p];
    try {
      fl.forEach((x, i) => {
        const n = nv(x), parms = pl[i];
        if (n === 'FlateDecode' || n === 'Fl') data = predict(inflate(data), parms);
        else if (n === 'ASCIIHexDecode' || n === 'AHx') data = ahx(data);
        else if (n === 'ASCII85Decode' || n === 'A85') data = a85(data);
        else if (n === 'RunLengthDecode' || n === 'RL') data = rl(data);
        else if (n === 'LZWDecode' || n === 'LZW') data = predict(lzw(data, parms instanceof Dict && parms.get('EarlyChange') === 0 ? 0 : 1), parms);
        else throw { stop: true };
      });
    } catch (e) { if (!e.stop) data = new Uint8Array(0); }
    s._dec = data;
    return data;
  }

  /* ---------- limiti della norma (contati mentre si legge) ---------- */
  function makeLimits(D) {
    const L = { part: 1, hits: {}, where: null };
    // per ogni regola: i primi valori trovati e le pagine dove compaiono
    const hit = (k, d) => { const a = (L.hits[k] ||= []); if (a.length < 3 || (L.where && !a.some(x => x.w === L.where) && a.length < 50)) a.push({ v: d, w: L.where }); };
    L.int = v => { if (v > 2147483647 || v < -2147483648) hit('int', v); };
    L.real = v => { if (L.part === 1 ? Math.abs(v) > 32767 : Math.abs(v) > 3.403e38) hit('real', v); if (L.part > 1 && v !== 0 && Math.abs(v) < 1.175e-38) hit('realSmall', v); };
    L.str = (len, hex, cnt, bad) => { if (L.part === 1 ? len > 65535 : len > 32767) hit('str', len); if (hex && cnt % 2) hit('hexOdd', cnt); if (hex && bad) hit('hexBad', 1); };
    L.name = len => { if (len > 127) hit('name', len); };
    L.arr = n => { if (L.part === 1 && n > 8191) hit('arr', n); };
    L.dict = n => { if (L.part === 1 && n > 4095) hit('dict', n); };
    return L;
  }

  /* ---------- profili ICC ---------- */
  function iccHeader(bytes) {
    if (!bytes || bytes.length < 128) return null;
    const s4 = o => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    return { size: ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0, ver: bytes[8] + (bytes[9] >> 4) / 10, cls: s4(12), cs: s4(16), sig: s4(36) };
  }

  /* ---------- XML minimo (per XMP) ---------- */
  function parseXML(text) {
    let i = 0; const n = text.length;
    const root = { name: '#doc', kids: [], attrs: {}, ns: {} };
    const stack = [root];
    const ent = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]);
    while (i < n) {
      const lt = text.indexOf('<', i);
      if (lt < 0) { const t = text.slice(i); if (t.trim()) stack[stack.length - 1].kids.push({ text: ent(t) }); break; }
      if (lt > i) { const t = text.slice(i, lt); if (/&(?!(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);)/i.test(t)) throw new Error('entità non valida'); stack[stack.length - 1].kids.push({ text: ent(t) }); }
      if (text.startsWith('<?', lt)) { const e = text.indexOf('?>', lt); if (e < 0) throw new Error('PI'); stack[stack.length - 1].kids.push({ pi: text.slice(lt + 2, e) }); i = e + 2; continue; }
      if (text.startsWith('<!' + '--', lt)) { const e = text.indexOf('-->', lt); if (e < 0) throw new Error('commento'); i = e + 3; continue; }
      if (text.startsWith('<![CDATA[', lt)) { const e = text.indexOf(']]>', lt); if (e < 0) throw new Error('CDATA'); stack[stack.length - 1].kids.push({ text: text.slice(lt + 9, e) }); i = e + 3; continue; }
      if (text.startsWith('<!', lt)) { const e = text.indexOf('>', lt); i = e + 1; continue; }
      if (text[lt + 1] === '/') {
        const e = text.indexOf('>', lt); const nm = text.slice(lt + 2, e).trim();
        const top = stack.pop(); if (!top || top.name !== nm) throw new Error('chiusura non corrispondente: ' + nm);
        i = e + 1; continue;
      }
      // apertura
      const m = /^<([A-Za-z_][\w.:-]*)/.exec(text.slice(lt, lt + 200)); if (!m) throw new Error('tag');
      let j = lt + m[0].length; const attrs = {};
      for (;;) {
        while (/\s/.test(text[j])) j++;
        if (text[j] === '>' || text.startsWith('/>', j)) break;
        const am = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(text.slice(j, j + 4000));
        if (!am) throw new Error('attributo');
        if (attrs[am[1]] !== undefined) throw new Error('attributo doppio');
        attrs[am[1]] = ent(am[3] ?? am[4]); j += am[0].length;
      }
      const self = text.startsWith('/>', j);
      const parent = stack[stack.length - 1];
      const el = { name: m[1], attrs, kids: [], ns: Object.assign({}, parent.ns), parent };
      for (const [k, v] of Object.entries(attrs)) { if (k === 'xmlns') el.ns[''] = v; else if (k.startsWith('xmlns:')) el.ns[k.slice(6)] = v; }
      parent.kids.push(el);
      if (!self) stack.push(el);
      i = j + (self ? 2 : 1);
    }
    if (stack.length !== 1) throw new Error('elementi non chiusi');
    return root;
  }
  const qn = (el, name = el.name) => { const k = name.indexOf(':'); const pfx = k >= 0 ? name.slice(0, k) : ''; return { ns: k >= 0 || el.ns[''] ? el.ns[pfx] : '', local: k >= 0 ? name.slice(k + 1) : name, pfx }; };
  const kidsEl = el => el.kids.filter(k => k.name);
  const textOf = el => el.kids.filter(k => k.text != null).map(k => k.text).join('');

  /* ---------- schemi XMP predefiniti (XMP 2004/2005, ISO 19005) ---------- */
  const NS = {
    dc: 'http://purl.org/dc/elements/1.1/', xmp: 'http://ns.adobe.com/xap/1.0/', xmpRights: 'http://ns.adobe.com/xap/1.0/rights/', xmpMM: 'http://ns.adobe.com/xap/1.0/mm/',
    xmpBJ: 'http://ns.adobe.com/xap/1.0/bj/', xmpTPg: 'http://ns.adobe.com/xap/1.0/t/pg/', xmpDM: 'http://ns.adobe.com/xmp/1.0/DynamicMedia/', pdf: 'http://ns.adobe.com/pdf/1.3/',
    photoshop: 'http://ns.adobe.com/photoshop/1.0/', crs: 'http://ns.adobe.com/camera-raw-settings/1.0/', tiff: 'http://ns.adobe.com/tiff/1.0/', exif: 'http://ns.adobe.com/exif/1.0/',
    aux: 'http://ns.adobe.com/exif/1.0/aux/', pdfaid: 'http://www.aiim.org/pdfa/ns/id/', pdfaExtension: 'http://www.aiim.org/pdfa/ns/extension/', pdfaSchema: 'http://www.aiim.org/pdfa/ns/schema#',
    pdfaProperty: 'http://www.aiim.org/pdfa/ns/property#', pdfaType: 'http://www.aiim.org/pdfa/ns/type#', pdfaField: 'http://www.aiim.org/pdfa/ns/field#', xmpidq: 'http://ns.adobe.com/xmp/Identifier/qual/1.0/',
    xmpG: 'http://ns.adobe.com/xap/1.0/g/', xmpGImg: 'http://ns.adobe.com/xap/1.0/g/img/', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', xml: 'http://www.w3.org/XML/1998/namespace',
  };
  // proprietà e tipo di valore: XMP 2004 per PDF/A-1, XMP 2005 per PDF/A-2 e -3
  const SCH = {
    dc: 'contributor=Bag Text coverage=Text creator=Seq Text date=Seq Date description=LangAlt format=Text identifier=Text language=Bag Text publisher=Bag Text relation=Bag Text rights=LangAlt source=Text subject=Bag Text title=LangAlt type=Bag Text',
    xmp: 'Advisory=Bag Text BaseURL=Text CreateDate=Date CreatorTool=Text Identifier=Bag Text MetadataDate=Date ModifyDate=Date Nickname=Text Thumbnails=Alt Struct',
    xmp5: 'Label=Text Rating=Real',
    xmpRights: 'Certificate=Text Marked=Boolean Owner=Bag Text UsageTerms=LangAlt WebStatement=Text',
    xmpMM: 'DerivedFrom=Struct DocumentID=Text History=Seq Struct InstanceID=Text LastURL=Text ManagedFrom=Struct Manager=Text ManageTo=Text ManageUI=Text ManagerVariant=Text RenditionClass=Text RenditionOf=Struct RenditionParams=Text SaveID=Integer VersionID=Text Versions=Seq Struct',
    xmpBJ: 'JobRef=Bag Struct',
    xmpTPg: 'MaxPageSize=Struct NPages=Integer',
    xmpTPg5: 'Fonts=Bag Struct Colorants=Seq Struct PlateNames=Seq Text',
    pdf: 'Keywords=Text PDFVersion=Text Producer=Text',
    pdf5: 'Trapped=Text',
    photoshop: 'AuthorsPosition=Text CaptionWriter=Text Category=Text City=Text Country=Text Credit=Text DateCreated=Date Headline=Text Instructions=Text Source=Text State=Text SupplementalCategories=Text TransmissionReference=Text Urgency=Integer',
    photoshop5: 'SupplementalCategories=Bag Text ColorMode=Integer ICCProfile=Text History=Text',
    tiff: 'ImageWidth=Integer ImageLength=Integer BitsPerSample=Seq Integer Compression=Integer PhotometricInterpretation=Integer Orientation=Integer SamplesPerPixel=Integer PlanarConfiguration=Integer YCbCrSubSampling=Seq Integer YCbCrPositioning=Integer XResolution=Rational YResolution=Rational ResolutionUnit=Integer TransferFunction=Seq Integer WhitePoint=Seq Rational PrimaryChromaticities=Seq Rational YCbCrCoefficients=Seq Rational ReferenceBlackWhite=Seq Rational DateTime=Date ImageDescription=LangAlt Make=Text Model=Text Software=Text Artist=Text Copyright=LangAlt',
    tiff5: 'NativeDigest=Text',
    exif: 'ExifVersion=Text FlashpixVersion=Text ColorSpace=Integer ComponentsConfiguration=Seq Integer CompressedBitsPerPixel=Rational PixelXDimension=Integer PixelYDimension=Integer MakerNote=Text UserComment=LangAlt RelatedSoundFile=Text DateTimeOriginal=Date DateTimeDigitized=Date ExposureTime=Rational FNumber=Rational ExposureProgram=Integer SpectralSensitivity=Text ISOSpeedRatings=Seq Integer OECF=Struct ShutterSpeedValue=Rational ApertureValue=Rational BrightnessValue=Rational ExposureBiasValue=Rational MaxApertureValue=Rational SubjectDistance=Rational MeteringMode=Integer LightSource=Integer Flash=Struct FocalLength=Rational SubjectArea=Seq Integer FlashEnergy=Rational SpatialFrequencyResponse=Struct FocalPlaneXResolution=Rational FocalPlaneYResolution=Rational FocalPlaneResolutionUnit=Integer SubjectLocation=Seq Integer ExposureIndex=Rational SensingMethod=Integer FileSource=Integer SceneType=Integer CFAPattern=Struct CustomRendered=Integer ExposureMode=Integer WhiteBalance=Integer DigitalZoomRatio=Rational FocalLengthIn35mmFilm=Integer SceneCaptureType=Integer GainControl=Integer Contrast=Integer Saturation=Integer Sharpness=Integer DeviceSettingDescription=Struct SubjectDistanceRange=Integer ImageUniqueID=Text GPSVersionID=Text GPSLatitude=GPS GPSLongitude=GPS GPSAltitudeRef=Integer GPSAltitude=Rational GPSTimeStamp=Date GPSSatellites=Text GPSStatus=Text GPSMeasureMode=Integer GPSDOP=Rational GPSSpeedRef=Text GPSSpeed=Rational GPSTrackRef=Text GPSTrack=Rational GPSImgDirectionRef=Text GPSImgDirection=Rational GPSMapDatum=Text GPSDestLatitude=GPS GPSDestLongitude=GPS GPSDestBearingRef=Text GPSDestBearing=Rational GPSDestDistanceRef=Text GPSDestDistance=Rational GPSProcessingMethod=Text GPSAreaInformation=Text GPSDifferential=Integer',
    exif5: 'NativeDigest=Text',
    aux5: 'Lens=Text SerialNumber=Text',
    crs5: 'AutoBrightness=Boolean AutoContrast=Boolean AutoExposure=Boolean AutoShadows=Boolean BlueHue=Integer BlueSaturation=Integer Brightness=Integer CameraProfile=Text ChromaticAberrationB=Integer ChromaticAberrationR=Integer ColorNoiseReduction=Integer Contrast=Integer CropTop=Real CropLeft=Real CropBottom=Real CropRight=Real CropAngle=Real CropWidth=Real CropHeight=Real CropUnits=Integer Exposure=Real GreenHue=Integer GreenSaturation=Integer HasCrop=Boolean HasSettings=Boolean LuminanceSmoothing=Integer RawFileName=Text RedHue=Integer RedSaturation=Integer Saturation=Integer Shadows=Integer ShadowTint=Integer Sharpness=Integer Temperature=Integer Tint=Integer ToneCurve=Seq Text ToneCurveName=Text Version=Text VignetteAmount=Integer VignetteMidpoint=Integer WhiteBalance=Text',
    xmpDM5: 'absPeakAudioFilePath=Text album=Text altTapeName=Text altTimecode=Struct artist=Text audioModDate=Date audioSampleRate=Integer audioSampleType=Text audioChannelType=Text audioCompressor=Text beatSpliceParams=Struct composer=Text contributedMedia=Bag Struct copyright=Text duration=Struct engineer=Text fileDataRate=Rational genre=Text instrument=Text introTime=Struct key=Text logComment=Text loop=Boolean numberOfBeats=Real markers=Seq Struct metadataModDate=Date outCue=Struct projectRef=Struct pullDown=Text relativePeakAudioFilePath=Text relativeTimestamp=Struct releaseDate=Date resampleParams=Struct scaleType=Text scene=Text shotDate=Date shotLocation=Text shotName=Text speakerPlacement=Text startTimecode=Struct stretchMode=Text tapeName=Text tempo=Real timeScaleParams=Struct timeSignature=Text trackNumber=Integer videoAlphaMode=Text videoAlphaPremultipleColor=Struct videoAlphaUnityIsTransparent=Boolean videoColorSpace=Text videoCompressor=Text videoFieldOrder=Text videoFrameRate=Text videoFrameSize=Struct videoModDate=Date videoPixelDepth=Text videoPixelAspectRatio=Rational',
    pdfaid: 'part=Integer conformance=Text amd=Text',
    pdfaid2: 'corr=Text',
  };
  const PREDEF = (() => {
    const mk = (v5, p2) => {
      const out = new Map();
      for (const [k, spec] of Object.entries(SCH)) {
        const base = k.replace(/5$|2$/, ''), is5 = /5$/.test(k), is2 = /2$/.test(k);
        if (is5 && !v5) continue; if (is2 && !p2) continue;
        const m = out.get(NS[base]) || new Map();
        for (const it of spec.split(/ (?=[A-Za-z][A-Za-z0-9]*=)/)) { const [n, t] = it.split('='); m.set(n, t); }
        out.set(NS[base], m);
      }
      return out;
    };
    return { 1: mk(false, false), 2: mk(true, true) };
  })();

  /* ---------- glifi e codifiche ---------- */
  const ENC = { std: "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl - endash dagger daggerdbl periodcentered - paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand - questiondown - grave acute circumflex tilde macron breve dotaccent dieresis - ring cedilla - hungarumlaut ogonek caron emdash - - - - - - - - - - - - - - - - AE - ordfeminine - - - - Lslash Oslash OE ordmasculine - - - - - ae - - - dotlessi - - lslash oslash oe germandbls - - - -".split(" "), win: "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde bullet Euro bullet quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE bullet Zcaron bullet bullet quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe bullet zcaron Ydieresis space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis".split(" "), mac: "NUL Eth eth Lslash lslash Scaron scaron Yacute yacute HT LF Thorn thorn CR Zcaron zcaron DLE DC1 DC2 DC3 DC4 onehalf onequarter onesuperior threequarters threesuperior twosuperior brokenbar minus multiply RS US space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde DEL Adieresis Aring Ccedilla Eacute Ntilde Odieresis Udieresis aacute agrave acircumflex adieresis atilde aring ccedilla eacute egrave ecircumflex edieresis iacute igrave icircumflex idieresis ntilde oacute ograve ocircumflex odieresis otilde uacute ugrave ucircumflex udieresis dagger degree cent sterling section bullet paragraph germandbls registered copyright trademark acute dieresis notequal AE Oslash infinity plusminus lessequal greaterequal yen mu partialdiff summation product pi integral ordfeminine ordmasculine Omega ae oslash questiondown exclamdown logicalnot radical florin approxequal Delta guillemotleft guillemotright ellipsis nbspace Agrave Atilde Otilde OE oe endash emdash quotedblleft quotedblright quoteleft quoteright divide lozenge ydieresis Ydieresis fraction currency guilsinglleft guilsinglright fi fl daggerdbl periodcentered quotesinglbase quotedblbase perthousand Acircumflex Ecircumflex Aacute Edieresis Egrave Iacute Icircumflex Idieresis Igrave Oacute Ocircumflex apple Ograve Uacute Ucircumflex Ugrave dotlessi circumflex tilde macron breve dotaccent ring cedilla hungarumlaut ogonek caron".split(" ") };
  for (const k in ENC) ENC[k] = ENC[k].map(x => x === "-" ? "" : x);
  const AGL = new Map("onesuperior:b9 twosuperior:b2 threesuperior:b3 fi:fb01 fl:fb02 nbspace:a0 A:41 AE:c6 AEacute:1fc Aacute:c1 Abreve:102 Acircumflex:c2 Adieresis:c4 Agrave:c0 Alpha:391 Alphatonos:386 Amacron:100 Aogonek:104 Aring:c5 Aringacute:1fa Atilde:c3 B:42 Beta:392 C:43 Cacute:106 Ccaron:10c Ccedilla:c7 Ccircumflex:108 Cdotaccent:10a Chi:3a7 D:44 Dcaron:10e Dcroat:110 Delta:2206 E:45 Eacute:c9 Ebreve:114 Ecaron:11a Ecircumflex:ca Edieresis:cb Edotaccent:116 Egrave:c8 Emacron:112 Eng:14a Eogonek:118 Epsilon:395 Epsilontonos:388 Eta:397 Etatonos:389 Eth:d0 Euro:20ac F:46 G:47 Gamma:393 Gbreve:11e Gcaron:1e6 Gcircumflex:11c Gdotaccent:120 H:48 H18533:25cf H18543:25aa H18551:25ab H22073:25a1 Hbar:126 Hcircumflex:124 I:49 IJ:132 Iacute:cd Ibreve:12c Icircumflex:ce Idieresis:cf Idotaccent:130 Ifraktur:2111 Igrave:cc Imacron:12a Iogonek:12e Iota:399 Iotadieresis:3aa Iotatonos:38a Itilde:128 J:4a Jcircumflex:134 K:4b Kappa:39a L:4c Lacute:139 Lambda:39b Lcaron:13d Ldot:13f Lslash:141 M:4d Mu:39c N:4e Nacute:143 Ncaron:147 Ntilde:d1 Nu:39d O:4f OE:152 Oacute:d3 Obreve:14e Ocircumflex:d4 Odieresis:d6 Ograve:d2 Ohorn:1a0 Ohungarumlaut:150 Omacron:14c Omega:2126 Omegatonos:38f Omicron:39f Omicrontonos:38c Oslash:d8 Oslashacute:1fe Otilde:d5 P:50 Phi:3a6 Pi:3a0 Psi:3a8 Q:51 R:52 Racute:154 Rcaron:158 Rfraktur:211c Rho:3a1 S:53 SF010000:250c SF020000:2514 SF030000:2510 SF040000:2518 SF050000:253c SF060000:252c SF070000:2534 SF080000:251c SF090000:2524 SF100000:2500 SF110000:2502 SF190000:2561 SF200000:2562 SF210000:2556 SF220000:2555 SF230000:2563 SF240000:2551 SF250000:2557 SF260000:255d SF270000:255c SF280000:255b SF360000:255e SF370000:255f SF380000:255a SF390000:2554 SF400000:2569 SF410000:2566 SF420000:2560 SF430000:2550 SF440000:256c SF450000:2567 SF460000:2568 SF470000:2564 SF480000:2565 SF490000:2559 SF500000:2558 SF510000:2552 SF520000:2553 SF530000:256b SF540000:256a Sacute:15a Scaron:160 Scedilla:15e Scircumflex:15c Sigma:3a3 T:54 Tau:3a4 Tbar:166 Tcaron:164 Theta:398 Thorn:de U:55 Uacute:da Ubreve:16c Ucircumflex:db Udieresis:dc Ugrave:d9 Uhorn:1af Uhungarumlaut:170 Umacron:16a Uogonek:172 Upsilon:3a5 Upsilon1:3d2 Upsilondieresis:3ab Upsilontonos:38e Uring:16e Utilde:168 V:56 W:57 Wacute:1e82 Wcircumflex:174 Wdieresis:1e84 Wgrave:1e80 X:58 Xi:39e Y:59 Yacute:dd Ycircumflex:176 Ydieresis:178 Ygrave:1ef2 Z:5a Zacute:179 Zcaron:17d Zdotaccent:17b Zeta:396 a:61 aacute:e1 abreve:103 acircumflex:e2 acute:b4 acutecomb:301 adieresis:e4 ae:e6 aeacute:1fd agrave:e0 aleph:2135 alpha:3b1 alphatonos:3ac amacron:101 ampersand:26 angle:2220 angleleft:2329 angleright:232a anoteleia:387 aogonek:105 approxequal:2248 aring:e5 aringacute:1fb arrowboth:2194 arrowdblboth:21d4 arrowdbldown:21d3 arrowdblleft:21d0 arrowdblright:21d2 arrowdblup:21d1 arrowdown:2193 arrowleft:2190 arrowright:2192 arrowup:2191 arrowupdn:2195 arrowupdnbse:21a8 asciicircum:5e asciitilde:7e asterisk:2a asteriskmath:2217 at:40 atilde:e3 b:62 backslash:5c bar:7c beta:3b2 block:2588 braceleft:7b braceright:7d bracketleft:5b bracketright:5d breve:2d8 brokenbar:a6 bullet:2022 c:63 cacute:107 caron:2c7 carriagereturn:21b5 ccaron:10d ccedilla:e7 ccircumflex:109 cdotaccent:10b cedilla:b8 cent:a2 chi:3c7 circle:25cb circlemultiply:2297 circleplus:2295 circumflex:2c6 club:2663 colon:3a colonmonetary:20a1 comma:2c congruent:2245 copyright:a9 currency:a4 d:64 dagger:2020 daggerdbl:2021 dcaron:10f dcroat:111 degree:b0 delta:3b4 diamond:2666 dieresis:a8 dieresistonos:385 divide:f7 dkshade:2593 dnblock:2584 dollar:24 dong:20ab dotaccent:2d9 dotbelowcomb:323 dotlessi:131 dotmath:22c5 e:65 eacute:e9 ebreve:115 ecaron:11b ecircumflex:ea edieresis:eb edotaccent:117 egrave:e8 eight:38 element:2208 ellipsis:2026 emacron:113 emdash:2014 emptyset:2205 endash:2013 eng:14b eogonek:119 epsilon:3b5 epsilontonos:3ad equal:3d equivalence:2261 estimated:212e eta:3b7 etatonos:3ae eth:f0 exclam:21 exclamdbl:203c exclamdown:a1 existential:2203 f:66 female:2640 figuredash:2012 filledbox:25a0 filledrect:25ac five:35 fiveeighths:215d florin:192 four:34 fraction:2044 franc:20a3 g:67 gamma:3b3 gbreve:11f gcaron:1e7 gcircumflex:11d gdotaccent:121 germandbls:df gradient:2207 grave:60 gravecomb:300 greater:3e greaterequal:2265 guillemotleft:ab guillemotright:bb guilsinglleft:2039 guilsinglright:203a h:68 hbar:127 hcircumflex:125 heart:2665 hookabovecomb:309 house:2302 hungarumlaut:2dd hyphen:2d i:69 iacute:ed ibreve:12d icircumflex:ee idieresis:ef igrave:ec ij:133 imacron:12b infinity:221e integral:222b integralbt:2321 integraltp:2320 intersection:2229 invbullet:25d8 invcircle:25d9 invsmileface:263b iogonek:12f iota:3b9 iotadieresis:3ca iotadieresistonos:390 iotatonos:3af itilde:129 j:6a jcircumflex:135 k:6b kappa:3ba kgreenlandic:138 l:6c lacute:13a lambda:3bb lcaron:13e ldot:140 less:3c lessequal:2264 lfblock:258c lira:20a4 logicaland:2227 logicalnot:ac logicalor:2228 longs:17f lozenge:25ca lslash:142 ltshade:2591 m:6d macron:af male:2642 minus:2212 minute:2032 mu:b5 multiply:d7 musicalnote:266a musicalnotedbl:266b n:6e nacute:144 napostrophe:149 ncaron:148 nine:39 notelement:2209 notequal:2260 notsubset:2284 ntilde:f1 nu:3bd numbersign:23 o:6f oacute:f3 obreve:14f ocircumflex:f4 odieresis:f6 oe:153 ogonek:2db ograve:f2 ohorn:1a1 ohungarumlaut:151 omacron:14d omega:3c9 omega1:3d6 omegatonos:3ce omicron:3bf omicrontonos:3cc one:31 onedotenleader:2024 oneeighth:215b onehalf:bd onequarter:bc onethird:2153 openbullet:25e6 ordfeminine:aa ordmasculine:ba orthogonal:221f oslash:f8 oslashacute:1ff otilde:f5 p:70 paragraph:b6 parenleft:28 parenright:29 partialdiff:2202 percent:25 period:2e periodcentered:b7 perpendicular:22a5 perthousand:2030 peseta:20a7 phi:3c6 phi1:3d5 pi:3c0 plus:2b plusminus:b1 prescription:211e product:220f propersubset:2282 propersuperset:2283 proportional:221d psi:3c8 q:71 question:3f questiondown:bf quotedbl:22 quotedblbase:201e quotedblleft:201c quotedblright:201d quoteleft:2018 quotereversed:201b quoteright:2019 quotesinglbase:201a quotesingle:27 r:72 racute:155 radical:221a rcaron:159 reflexsubset:2286 reflexsuperset:2287 registered:ae revlogicalnot:2310 rho:3c1 ring:2da rtblock:2590 s:73 sacute:15b scaron:161 scedilla:15f scircumflex:15d second:2033 section:a7 semicolon:3b seven:37 seveneighths:215e shade:2592 sigma:3c3 sigma1:3c2 similar:223c six:36 slash:2f smileface:263a space:20 spade:2660 sterling:a3 suchthat:220b summation:2211 sun:263c t:74 tau:3c4 tbar:167 tcaron:165 therefore:2234 theta:3b8 theta1:3d1 thorn:fe three:33 threeeighths:215c threequarters:be tilde:2dc tildecomb:303 tonos:384 trademark:2122 triagdn:25bc triaglf:25c4 triagrt:25ba triagup:25b2 two:32 twodotenleader:2025 twothirds:2154 u:75 uacute:fa ubreve:16d ucircumflex:fb udieresis:fc ugrave:f9 uhorn:1b0 uhungarumlaut:171 umacron:16b underscore:5f underscoredbl:2017 union:222a universal:2200 uogonek:173 upblock:2580 upsilon:3c5 upsilondieresis:3cb upsilondieresistonos:3b0 upsilontonos:3cd uring:16f utilde:169 v:76 w:77 wacute:1e83 wcircumflex:175 wdieresis:1e85 weierstrass:2118 wgrave:1e81 x:78 xi:3be y:79 yacute:fd ycircumflex:177 ydieresis:ff yen:a5 ygrave:1ef3 z:7a zacute:17a zcaron:17e zdotaccent:17c zero:30 zeta:3b6".split(" ").map(x => { const i = x.lastIndexOf(":"); return [x.slice(0, i), parseInt(x.slice(i + 1), 16)]; }));
  const STD14 = new Set(['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic', 'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique', 'Symbol', 'ZapfDingbats']);
  const uniOfName = (n) => {
    if (!n) return null;
    const base = n.split('.')[0].split('_')[0];
    if (AGL.has(base)) return AGL.get(base);
    let m = /^uni([0-9A-F]{4})$/.exec(base); if (m) return parseInt(m[1], 16);
    m = /^u([0-9A-F]{4,6})$/.exec(base); if (m) return parseInt(m[1], 16);
    return null;
  };

  /* ---------- programmi dei font ---------- */
  function parseTT(b) {
    try {
      if (b.length < 12) return null;
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      let off = 0; const tag0 = String.fromCharCode(b[0], b[1], b[2], b[3]);
      if (tag0 === 'ttcf') off = dv.getUint32(12);
      const nt = dv.getUint16(off + 4), t = {};
      for (let i = 0; i < nt; i++) { const r = off + 12 + i * 16; const tag = String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]); t[tag] = { o: dv.getUint32(r + 8), l: dv.getUint32(r + 12) }; }
      const tt = { t, cmaps: {} };
      if (t.head) tt.upem = dv.getUint16(t.head.o + 18) || 1000;
      tt.numGlyphs = t.maxp ? dv.getUint16(t.maxp.o + 4) : 0;
      const nh = t.hhea ? dv.getUint16(t.hhea.o + 34) : 0;
      tt.adv = g => { if (!t.hmtx || !nh) return null; const k = Math.min(g, nh - 1); const o = t.hmtx.o + k * 4; if (o + 2 > b.length) return null; return dv.getUint16(o) * 1000 / (tt.upem || 1000); };
      if (t.cmap) {
        const co = t.cmap.o, n = dv.getUint16(co + 2);
        for (let i = 0; i < n; i++) {
          const pid = dv.getUint16(co + 4 + i * 8), eid = dv.getUint16(co + 6 + i * 8), so = co + dv.getUint32(co + 8 + i * 8);
          try { tt.cmaps[pid + ',' + eid] = readCmap(dv, so); } catch (e) { tt.cmaps[pid + ',' + eid] = new Map(); }
        }
        tt.nCmaps = n;
      } else tt.nCmaps = 0;
      if (t.post && dv.getUint32(t.post.o) === 0x00020000) {
        try {
          const po = t.post.o, ng = dv.getUint16(po + 32), idx = []; for (let i = 0; i < ng; i++) idx.push(dv.getUint16(po + 34 + i * 2));
          let p = po + 34 + ng * 2; const extra = [];
          while (p < po + t.post.l) { const l = b[p]; extra.push(latin1(b, p + 1, p + 1 + l)); p += 1 + l; }
          tt.names = new Map(); idx.forEach((k, g) => { const name = k < 258 ? MACGLYPHS[k] : extra[k - 258]; if (name && !tt.names.has(name)) tt.names.set(name, g); });
        } catch (e) { }
      }
      if (t.loca && t.glyf && t.head) {
        const lf = dv.getInt16(t.head.o + 50);
        tt.glyphLen = g => { if (g >= tt.numGlyphs) return 0; const o = t.loca.o; return lf ? dv.getUint32(o + (g + 1) * 4) - dv.getUint32(o + g * 4) : (dv.getUint16(o + (g + 1) * 2) - dv.getUint16(o + g * 2)) * 2; };
      }
      return tt;
    } catch (e) { return null; }
  }
  function readCmap(dv, o) {
    const f = dv.getUint16(o), m = new Map();
    if (f === 0) { for (let c = 0; c < 256; c++) { const g = dv.getUint8(o + 6 + c); if (g) m.set(c, g); } }
    else if (f === 4) {
      const segX2 = dv.getUint16(o + 6), n = segX2 / 2;
      const eo = o + 14, so = eo + segX2 + 2, dO = so + segX2, ro = dO + segX2;
      for (let i = 0; i < n; i++) {
        const end = dv.getUint16(eo + i * 2), start = dv.getUint16(so + i * 2), delta = dv.getInt16(dO + i * 2), rOff = dv.getUint16(ro + i * 2);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          let g;
          if (!rOff) g = (c + delta) & 0xFFFF;
          else { const a = ro + i * 2 + rOff + (c - start) * 2; g = a + 2 <= dv.byteLength ? dv.getUint16(a) : 0; if (g) g = (g + delta) & 0xFFFF; }
          if (g) m.set(c, g);
        }
      }
    } else if (f === 6) { const first = dv.getUint16(o + 6), cnt = dv.getUint16(o + 8); for (let i = 0; i < cnt; i++) { const g = dv.getUint16(o + 10 + i * 2); if (g) m.set(first + i, g); } }
    else if (f === 12) { const ng = dv.getUint32(o + 12); for (let i = 0; i < ng; i++) { const s = dv.getUint32(o + 16 + i * 12), e = dv.getUint32(o + 20 + i * 12), g0 = dv.getUint32(o + 24 + i * 12); for (let c = s; c <= e && c - s < 70000; c++) m.set(c, g0 + c - s); } }
    return m;
  }
  const MACGLYPHS = '.notdef .null nonmarkingreturn space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde Adieresis Aring Ccedilla Eacute Ntilde Odieresis Udieresis aacute agrave acircumflex adieresis atilde aring ccedilla eacute egrave ecircumflex edieresis iacute igrave icircumflex idieresis ntilde oacute ograve ocircumflex odieresis otilde uacute ugrave ucircumflex udieresis dagger degree cent sterling section bullet paragraph germandbls registered copyright trademark acute dieresis notequal AE Oslash infinity plusminus lessequal greaterequal yen mu partialdiff summation product pi integral ordfeminine ordmasculine Omega ae oslash questiondown exclamdown logicalnot radical florin approxequal Delta guillemotleft guillemotright ellipsis nonbreakingspace Agrave Atilde Otilde OE oe endash emdash quotedblleft quotedblright quoteleft quoteright divide lozenge ydieresis Ydieresis fraction currency guilsinglleft guilsinglright fi fl daggerdbl periodcentered quotesinglbase quotedblbase perthousand Acircumflex Ecircumflex Aacute Edieresis Egrave Iacute Icircumflex Idieresis Igrave Oacute Ocircumflex apple Ograve Uacute Ucircumflex Ugrave dotlessi circumflex tilde macron breve dotaccent ring cedilla hungarumlaut ogonek caron Lslash lslash Scaron scaron Zcaron zcaron brokenbar Eth eth Yacute yacute Thorn thorn minus multiply onesuperior twosuperior threesuperior onehalf onequarter threequarters franc Gbreve gbreve Idotaccent Scedilla scedilla Cacute cacute Ccaron ccaron dcroat'.split(' ');

  // CFF (Type1C, CIDFontType0C, OpenType CFF)
  const CFF_STD = '.notdef space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron exclamsmall Hungarumlautsmall dollaroldstyle dollarsuperior ampersandsmall Acutesmall parenleftsuperior parenrightsuperior twodotenleader onedotenleader zerooldstyle oneoldstyle twooldstyle threeoldstyle fouroldstyle fiveoldstyle sixoldstyle sevenoldstyle eightoldstyle nineoldstyle commasuperior threequartersemdash periodsuperior questionsmall asuperior bsuperior centsuperior dsuperior esuperior isuperior lsuperior msuperior nsuperior osuperior rsuperior ssuperior tsuperior ff ffi ffl parenleftinferior parenrightinferior Circumflexsmall hyphensuperior Gravesmall Asmall Bsmall Csmall Dsmall Esmall Fsmall Gsmall Hsmall Ismall Jsmall Ksmall Lsmall Msmall Nsmall Osmall Psmall Qsmall Rsmall Ssmall Tsmall Usmall Vsmall Wsmall Xsmall Ysmall Zsmall colonmonetary onefitted rupiah Tildesmall exclamdownsmall centoldstyle Lslashsmall Scaronsmall Zcaronsmall Dieresissmall Brevesmall Caronsmall Gravesmall Macronsmall figuredash hypheninferior Ogoneksmall Ringsmall Cedillasmall questiondownsmall oneeighth threeeighths fiveeighths seveneighths onethird twothirds zerosuperior foursuperior fivesuperior sixsuperior sevensuperior eightsuperior ninesuperior zeroinferior oneinferior twoinferior threeinferior fourinferior fiveinferior sixinferior seveninferior eightinferior nineinferior centinferior dollarinferior periodinferior commainferior Agravesmall Aacutesmall Acircumflexsmall Atildesmall Adieresissmall Aringsmall AEsmall Ccedillasmall Egravesmall Eacutesmall Ecircumflexsmall Edieresissmall Igravesmall Iacutesmall Icircumflexsmall Idieresissmall Ethsmall Ntildesmall Ogravesmall Oacutesmall Ocircumflexsmall Otildesmall Odieresissmall OEsmall Oslashsmall Ugravesmall Uacutesmall Ucircumflexsmall Udieresissmall Yacutesmall Thornsmall Ydieresissmall 001.000 001.001 001.002 001.003 Black Bold Book Light Medium Regular Roman Semibold'.split(' ');
  function parseCFF(b) {
    try {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      let p = b[2];
      const index = () => {
        const cnt = dv.getUint16(p); if (!cnt) { p += 2; return []; }
        const os = b[p + 2], base = p + 3 + (cnt + 1) * os - 1;
        const off = i => { let v = 0; for (let k = 0; k < os; k++) v = v * 256 + b[p + 3 + i * os + k]; return v; };
        const items = []; for (let i = 0; i < cnt; i++) items.push(b.subarray(base + off(i), base + off(i + 1)));
        p = base + off(cnt); return items;
      };
      const names = index(), tops = index(), strings = index(), gsubrs = index();
      const sid = i => i < CFF_STD.length ? CFF_STD[i] : strings[i - CFF_STD.length] ? latin1(strings[i - CFF_STD.length]) : null;
      const dict = (d) => {
        const out = {}; let ops = [];
        for (let i = 0; i < d.length;) {
          const c = d[i];
          if (c <= 21) { let k = c; i++; if (c === 12) { k = 1200 + d[i++]; } out[k] = ops; ops = []; }
          else if (c === 28) { ops.push(dv.getInt16(d.byteOffset - b.byteOffset + i + 1)); i += 3; }
          else if (c === 29) { ops.push(dv.getInt32(d.byteOffset - b.byteOffset + i + 1)); i += 5; }
          else if (c === 30) { let s = ''; i++; for (;;) { const x = d[i++], hi = x >> 4, lo = x & 15; const m = n => n < 10 ? n : n === 10 ? '.' : n === 11 ? 'E' : n === 12 ? 'E-' : n === 14 ? '-' : ''; if (hi === 15) break; s += m(hi); if (lo === 15) break; s += m(lo); } ops.push(parseFloat(s)); }
          else if (c >= 32 && c <= 246) { ops.push(c - 139); i++; }
          else if (c >= 247 && c <= 250) { ops.push((c - 247) * 256 + d[i + 1] + 108); i += 2; }
          else if (c >= 251 && c <= 254) { ops.push(-(c - 251) * 256 - d[i + 1] - 108); i += 2; }
          else i++;
        }
        return out;
      };
      const top = dict(tops[0] || new Uint8Array(0));
      const fm = top[1207] || [0.001];
      p = top[17][0]; const cs = index();
      const n = cs.length;
      const cid = !!top[1230];
      // charset
      const glyphNames = new Array(n); const cids = new Array(n);
      glyphNames[0] = '.notdef'; cids[0] = 0;
      const co = top[15] ? top[15][0] : 0;
      if (co > 2) {
        const f = b[co]; let q = co + 1, g = 1;
        if (f === 0) { for (; g < n; g++, q += 2) { const v = dv.getUint16(q); cids[g] = v; glyphNames[g] = cid ? null : sid(v); } }
        else { while (g < n) { const first = dv.getUint16(q), left = f === 1 ? b[q + 2] : dv.getUint16(q + 2); q += f === 1 ? 3 : 4; for (let k = 0; k <= left && g < n; k++, g++) { cids[g] = first + k; glyphNames[g] = cid ? null : sid(first + k); } } }
      } else if (!cid) { for (let g = 1; g < n; g++) glyphNames[g] = CFF_STD[g]; }
      // private: larghezze di default e nominali (per i CID: un dizionario per ogni FD)
      const privOf = (d) => { const pr = d[18]; if (!pr) return { dw: 0, nw: 0 }; const pd = dict(b.subarray(pr[1], pr[1] + pr[0])); return { dw: pd[20] ? pd[20][0] : 0, nw: pd[21] ? pd[21][0] : 0 }; };
      let fdPriv = [privOf(top)], fdSel = null, fdm = [fm];
      if (cid && top[1236]) {
        p = top[1236][0]; const fds = index().map(dict);
        fdPriv = fds.map(privOf); fdm = fds.map(f => f[1207] || null);
        if (top[1237]) {
          const so = top[1237][0], f = b[so]; fdSel = new Uint8Array(n);
          if (f === 0) for (let g = 0; g < n; g++) fdSel[g] = b[so + 1 + g];
          else if (f === 3) { const nr = dv.getUint16(so + 1); for (let r = 0; r < nr; r++) { const first = dv.getUint16(so + 3 + r * 3), fd = b[so + 5 + r * 3], next = dv.getUint16(so + 3 + (r + 1) * 3); for (let g = first; g < next && g < n; g++) fdSel[g] = fd; } }
        }
      }
      const width = (g) => {
        const s = cs[g]; if (!s) return null;
        const pv = fdPriv[fdSel ? fdSel[g] : 0] || fdPriv[0];
        const stack = [];
        for (let i = 0; i < s.length;) {
          const c = s[i];
          if (c === 28) { stack.push(((s[i + 1] << 24) >> 16) | s[i + 2]); i += 3; }
          else if (c >= 32 && c <= 246) { stack.push(c - 139); i++; }
          else if (c >= 247 && c <= 250) { stack.push((c - 247) * 256 + s[i + 1] + 108); i += 2; }
          else if (c >= 251 && c <= 254) { stack.push(-(c - 251) * 256 - s[i + 1] - 108); i += 2; }
          else if (c === 255) { stack.push(((s[i + 1] << 24) | (s[i + 2] << 16) | (s[i + 3] << 8) | s[i + 4]) / 65536); i += 5; }
          else {
            let has = false;
            if ([1, 3, 18, 23, 19, 20].includes(c)) has = stack.length % 2 === 1;
            else if (c === 21) has = stack.length === 3;
            else if (c === 4 || c === 22) has = stack.length === 2;
            else if (c === 14) has = stack.length === 1 || stack.length === 5;
            else return pv.dw;
            return has ? pv.nw + stack[0] : pv.dw;
          }
        }
        return pv.dw;
      };
      const scale = (g) => { const m = (fdSel && fdm[fdSel[g]]) || fm; return (m && m[0] ? m[0] : 0.001) * 1000 * (fdSel && fdm[fdSel[g]] && fm ? fm[0] / 0.001 : 1); };
      const nameToGid = new Map(); glyphNames.forEach((nm, g) => { if (nm && !nameToGid.has(nm)) nameToGid.set(nm, g); });
      const cidToGid = new Map(); if (cid) cids.forEach((c, g) => cidToGid.set(c, g));
      // codifica interna (font non CID)
      let enc = null;
      if (!cid && top[16] && top[16][0] > 1) {
        try { const eo = top[16][0], f = b[eo] & 0x7f; enc = new Map(); if (f === 0) { const nc = b[eo + 1]; for (let i = 0; i < nc; i++) enc.set(b[eo + 2 + i], i + 1); } else { const nr = b[eo + 1]; let g = 1; for (let r = 0; r < nr; r++) { const first = b[eo + 2 + r * 2], left = b[eo + 3 + r * 2]; for (let k = 0; k <= left; k++) enc.set(first + k, g++); } } } catch (e) { enc = null; }
      } else if (!cid && top[16] && top[16][0] === 0) { enc = new Map(); ENC.std.forEach((nm, c) => { if (nm && nameToGid.has(nm)) enc.set(c, nameToGid.get(nm)); }); }
      return { kind: 'cff', cid, n, glyphNames, nameToGid, cidToGid, width: g => { const w = width(g); return w == null ? null : w * scale(g); }, enc, fontName: names[0] ? latin1(names[0]) : '' };
    } catch (e) { return null; }
  }
  // Type 1 (FontFile): parte in chiaro + parte cifrata (eexec)
  function parseT1(b, l1, l2) {
    try {
      let clearEnd = l1 && l1 < b.length ? l1 : -1;
      const txt = latin1(b, 0, Math.min(b.length, clearEnd > 0 ? clearEnd : b.length));
      if (clearEnd < 0) { const k = txt.indexOf('eexec'); clearEnd = k >= 0 ? k + 5 : b.length; while (WS[b[clearEnd]]) clearEnd++; }
      const clear = latin1(b, 0, clearEnd);
      let enc = null;
      if (/\/Encoding\s+StandardEncoding/.test(clear)) enc = 'std';
      else { const re = /dup\s+(\d+)\s*\/([^\s\/\[\]{}()<>]+)\s+put/g; let m; while ((m = re.exec(clear))) { (enc ||= new Map()).set(+m[1], m[2]); } }
      const fmm = /\/FontMatrix\s*\[\s*([-\d.eE]+)/.exec(clear); const fm = fmm ? parseFloat(fmm[1]) : 0.001;
      let e = b.subarray(clearEnd, l2 ? Math.min(b.length, clearEnd + l2) : b.length);
      // binario o esadecimale?
      const isHex = e.length >= 4 && [...e.subarray(0, 4)].every(c => HEXV[c] >= 0);
      if (isHex) e = ahx(e);
      let r = 55665; const dec = new Uint8Array(e.length);
      for (let i = 0; i < e.length; i++) { const c = e[i]; dec[i] = c ^ (r >> 8); r = ((c + r) * 52845 + 22719) & 0xFFFF; }
      const ds = latin1(dec);
      const liv = /\/lenIV\s+(\d+)/.exec(ds); const lenIV = liv ? +liv[1] : 4;
      const csi = ds.indexOf('/CharStrings'); if (csi < 0) return { kind: 't1', names: new Set(), widths: new Map(), enc, fm };
      const names = new Set(), widths = new Map();
      const re2 = /\/([^\s\/\[\]{}()<>]+)\s+(\d+)\s+(RD|-\|)\s/g; re2.lastIndex = csi;
      let m;
      while ((m = re2.exec(ds))) {
        const nm = m[1], len = +m[2], st = m.index + m[0].length;
        names.add(nm);
        // la larghezza dall'operatore hsbw / sbw
        let rr = 4330; const cs = dec.subarray(st, st + len), cd = new Uint8Array(cs.length);
        for (let i = 0; i < cs.length; i++) { const c = cs[i]; cd[i] = c ^ (rr >> 8); rr = ((c + rr) * 52845 + 22719) & 0xFFFF; }
        const s = cd.subarray(lenIV), stack = [];
        for (let i = 0; i < s.length;) {
          const v = s[i];
          if (v >= 32 && v <= 246) { stack.push(v - 139); i++; }
          else if (v >= 247 && v <= 250) { stack.push((v - 247) * 256 + s[i + 1] + 108); i += 2; }
          else if (v >= 251 && v <= 254) { stack.push(-(v - 251) * 256 - s[i + 1] - 108); i += 2; }
          else if (v === 255) { stack.push((s[i + 1] << 24) | (s[i + 2] << 16) | (s[i + 3] << 8) | s[i + 4]); i += 5; }
          else if (v === 13) { widths.set(nm, stack[1] * fm * 1000); break; }
          else if (v === 12 && s[i + 1] === 7) { widths.set(nm, stack[2] * fm * 1000); break; }
          else if (v === 12 && s[i + 1] === 12) { const y = stack.pop(), x = stack.pop(); stack.push(x / y); i += 2; }
          else break;
        }
        re2.lastIndex = st + len;
      }
      return { kind: 't1', names, widths, enc, fm };
    } catch (e) { return null; }
  }

  /* ---------- CMap ---------- */
  function parseCMap(bytes) {
    const s = latin1(bytes); const out = { ranges: [], cid: [], uni: new Map(), wmode: null, usecmap: null, name: null, reg: null, ord: null, sup: null };
    let m = /\/WMode\s+(\d+)\s+def/.exec(s); if (m) out.wmode = +m[1];
    m = /\/([^\s\/]+)\s+usecmap/.exec(s); if (m) out.usecmap = m[1];
    m = /\/CMapName\s+\/([^\s\/]+)\s+def/.exec(s); if (m) out.name = m[1];
    m = /\/Registry\s*\(([^)]*)\)/.exec(s); if (m) out.reg = m[1];
    m = /\/Ordering\s*\(([^)]*)\)/.exec(s); if (m) out.ord = m[1];
    m = /\/Supplement\s+(\d+)/.exec(s); if (m) out.sup = +m[1];
    const hexs = t => [...t.matchAll(/<([0-9a-fA-F\s]*)>/g)].map(x => x[1].replace(/\s/g, ''));
    for (const blk of s.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) { const h = hexs(blk[1]); for (let i = 0; i + 1 < h.length; i += 2) out.ranges.push({ len: h[i].length / 2, lo: parseInt(h[i] || '0', 16), hi: parseInt(h[i + 1] || '0', 16) }); }
    for (const blk of s.matchAll(/begincidrange([\s\S]*?)endcidrange/g)) { const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\d+)/g; let x; while ((x = re.exec(blk[1]))) out.cid.push([parseInt(x[1], 16), parseInt(x[2], 16), +x[3]]); }
    for (const blk of s.matchAll(/begincidchar([\s\S]*?)endcidchar/g)) { const re = /<([0-9a-fA-F]+)>\s*(\d+)/g; let x; while ((x = re.exec(blk[1]))) out.cid.push([parseInt(x[1], 16), parseInt(x[1], 16), +x[2]]); }
    // ToUnicode
    const u16 = h => { const cps = []; for (let i = 0; i + 4 <= h.length; i += 4) cps.push(parseInt(h.substr(i, 4), 16)); let r = ''; try { r = String.fromCharCode(...cps); } catch (e) { } return r; };
    for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) { const re = /<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\/[^\s<>\/]+)/g; let x; while ((x = re.exec(blk[1]))) out.uni.set(parseInt(x[1], 16), x[3] != null ? u16(x[3]) : uniOfName(x[2].slice(1)) != null ? String.fromCodePoint(uniOfName(x[2].slice(1))) : ''); }
    for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g; let x;
      while ((x = re.exec(blk[1]))) {
        const lo = parseInt(x[1], 16), hi = parseInt(x[2], 16);
        if (hi - lo > 65535) continue;
        if (x[4] != null) { const base = x[4]; for (let c = lo; c <= hi; c++) { const v = (parseInt(base.slice(-4) || '0', 16) + (c - lo)) & 0xFFFF; out.uni.set(c, u16(base.slice(0, -4) + v.toString(16).padStart(4, '0'))); } }
        else { const arr = hexs(x[5]); arr.forEach((h, k) => out.uni.set(lo + k, u16(h))); }
      }
    }
    return out;
  }
  const CJK = { GB: 'GB1', CNS: 'CNS1', B5: 'CNS1', ETen: 'CNS1', HKscs: 'CNS1', UniCNS: 'CNS1', KSC: 'Korea1', UniKS: 'Korea1', UniGB: 'GB1', UniJIS: 'Japan1', RKSJ: 'Japan1', EUC: 'Japan1', '83pv': 'Japan1', '90': 'Japan1', Add: 'Japan1', Ext: 'Japan1', H: 'Japan1', V: 'Japan1' };
  const PREDEF_CMAPS = new Set('Identity-H Identity-V GB-EUC-H GB-EUC-V GBpc-EUC-H GBpc-EUC-V GBK-EUC-H GBK-EUC-V GBKp-EUC-H GBKp-EUC-V GBK2K-H GBK2K-V UniGB-UCS2-H UniGB-UCS2-V UniGB-UTF16-H UniGB-UTF16-V B5pc-H B5pc-V HKscs-B5-H HKscs-B5-V ETen-B5-H ETen-B5-V ETenms-B5-H ETenms-B5-V CNS-EUC-H CNS-EUC-V UniCNS-UCS2-H UniCNS-UCS2-V UniCNS-UTF16-H UniCNS-UTF16-V 83pv-RKSJ-H 90ms-RKSJ-H 90ms-RKSJ-V 90msp-RKSJ-H 90msp-RKSJ-V 90pv-RKSJ-H Add-RKSJ-H Add-RKSJ-V EUC-H EUC-V Ext-RKSJ-H Ext-RKSJ-V H V UniJIS-UCS2-H UniJIS-UCS2-V UniJIS-UCS2-HW-H UniJIS-UCS2-HW-V UniJIS-UTF16-H UniJIS-UTF16-V KSC-EUC-H KSC-EUC-V KSCms-UHC-H KSCms-UHC-V KSCms-UHC-HW-H KSCms-UHC-HW-V KSCpc-EUC-H UniKS-UCS2-H UniKS-UCS2-V UniKS-UTF16-H UniKS-UTF16-V'.split(' '));
  // spazi dei codici delle CMap predefinite (servono per dividere il testo in codici)
  function predefRanges(name) {
    if (!name) return null;
    const R1 = (lo, hi) => ({ len: 1, lo, hi }), R2 = (lo, hi) => ({ len: 2, lo, hi }), R4 = (lo, hi) => ({ len: 4, lo, hi });
    if (/^Identity-|UCS2/.test(name)) return [R2(0, 0xFFFF)];
    if (/UTF16/.test(name)) return [R2(0, 0xD7FF), R4(0xD800DC00, 0xDBFFDFFF), R2(0xE000, 0xFFFF)];
    if (/^KSCms-UHC/.test(name)) return [R1(0, 0x80), R2(0x8141, 0xFEFE)];
    if (/^(KSC|KSCpc)-EUC|^GB-EUC|^GBpc-EUC/.test(name)) return [R1(0, 0x80), R2(0xA1A1, 0xFEFE)];
    if (/^GBK2K/.test(name)) return [R1(0, 0x80), R2(0x8140, 0xFEFE), R4(0x81308130, 0xFE39FE39)];
    if (/^GBKp?-EUC/.test(name)) return [R1(0, 0x80), R2(0x8140, 0xFEFE)];
    if (/^(B5pc|ETen-B5|ETenms-B5|HKscs-B5)/.test(name)) return [R1(0, 0x80), R1(0xA0, 0xA0), R1(0xFD, 0xFF), R2(0x8140, 0xFEFE)];
    if (/^CNS-EUC/.test(name)) return [R1(0, 0x80), R2(0xA1A1, 0xFEFE), R4(0x8EA1A1A1, 0x8EA2FEFE)];
    if (/RKSJ/.test(name)) return [R1(0, 0x80), R1(0xA0, 0xDF), R2(0x8140, 0x9FFC), R2(0xE040, 0xFCFC)];
    if (/^EUC-/.test(name)) return [R1(0, 0x80), R2(0x8EA0, 0x8EDF), R2(0xA1A1, 0xFEFE)];
    if (/^(H|V)$/.test(name)) return [R2(0x2121, 0x7E7E)];
    return null;
  }
  const cmapOrdering = name => { if (/^Uni(GB)/.test(name) || /^GB/.test(name)) return 'GB1'; if (/^(UniCNS|CNS|B5|ETen|HKscs)/.test(name)) return 'CNS1'; if (/^(UniKS|KSC)/.test(name)) return 'Korea1'; if (/^(UniJIS|83pv|90|Add|Ext|EUC|H$|V$)/.test(name)) return 'Japan1'; return null; };

  /* =====================================================================
     LE REGOLE
     ===================================================================== */
  // chiave → [clausola parte 1, clausola parti 2-3, categoria, testo]
  const RULES = {
    header: ['6.1.2-1', '6.1.2-1', 'struttura', 'L’intestazione del file non è «%PDF-1.x» in apertura'],
    headerBin: ['6.1.2-2', '6.1.2-2', 'struttura', 'Manca la riga di commento con caratteri binari subito dopo l’intestazione'],
    noId: ['6.1.3-1', '6.1.3-1', 'struttura', 'Il trailer non contiene l’identificativo del file (ID)'],
    encrypt: ['6.1.3-2', '6.1.3-2', 'sicurezza', 'Il file è cifrato o protetto da password'],
    postEof: ['6.1.3-3', '6.1.3-3', 'struttura', 'Ci sono dati dopo la fine del file (%%EOF)'],
    linId: ['6.1.3-4', null, 'struttura', 'Gli identificativi (ID) del primo e dell’ultimo trailer sono diversi'],
    xrefHead: ['6.1.4-1', null, 'struttura', 'Intestazione della tabella dei riferimenti incrociati scritta male'],
    xrefEol: ['6.1.4-2', '6.1.4-2', 'struttura', 'Dopo «xref» non c’è un solo fine riga'],
    xrefStream: ['6.1.4-3', null, 'struttura', 'Tabella dei riferimenti compressa (xref stream), non ammessa in PDF/A-1'],
    hexOdd: ['6.1.6-1', '6.1.6-1', 'struttura', 'Stringa esadecimale con un numero dispari di cifre'],
    hexBad: ['6.1.6-2', '6.1.6-2', 'struttura', 'Stringa esadecimale con caratteri non validi'],
    streamLen: ['6.1.7-1', '6.1.7.1-1', 'struttura', 'La lunghezza dichiarata di uno stream non corrisponde ai dati'],
    streamKw: ['6.1.7-2', '6.1.7.1-2', 'struttura', 'Le parole chiave stream / endstream non sono seguite o precedute dal fine riga'],
    streamF: ['6.1.7-3', '6.1.7.1-3', 'struttura', 'Uno stream rimanda a un file esterno (F, FFilter, FDecodeParms)'],
    unicodeName: [null, '6.1.8-1', 'struttura', 'Nome di font, colore o struttura non codificato in UTF-8'],
    objSpacing: ['6.1.8-1', '6.1.9-1', 'struttura', 'Spazi e fine riga attorno a «obj» / «endobj» non regolari'],
    lzw: ['6.1.10-1', '6.1.7.2-1', 'struttura', 'Compressione LZW (o un filtro non standard)'],
    lzwInline: ['6.1.10-2', '6.1.10-1', 'struttura', 'Immagine in linea con compressione LZW (o non standard)'],
    ef: ['6.1.11-1', null, 'allegati', 'File allegati: non ammessi in PDF/A-1'],
    embeddedFiles: ['6.1.11-2', null, 'allegati', 'File allegati: non ammessi in PDF/A-1'],
    int: ['6.1.12-1', '6.1.13-1', 'struttura', 'Numero intero oltre i limiti'],
    real: ['6.1.12-2', '6.1.13-2', 'struttura', 'Numero decimale oltre i limiti'],
    realSmall: [null, '6.1.13-5', 'struttura', 'Numero decimale troppo vicino a zero'],
    str: ['6.1.12-3', '6.1.13-3', 'struttura', 'Stringa troppo lunga'],
    name: ['6.1.12-4', '6.1.13-4', 'struttura', 'Nome più lungo di 127 byte'],
    arr: ['6.1.12-5', null, 'struttura', 'Array con più di 8191 elementi'],
    dict: ['6.1.12-6', null, 'struttura', 'Dizionario con più di 4095 voci'],
    nObj: ['6.1.12-7', '6.1.13-7', 'struttura', 'Troppi oggetti nel file'],
    qNest: ['6.1.12-8', '6.1.13-8', 'contenuto', 'Più di 28 livelli di q/Q annidati'],
    devN: ['6.1.12-9', '6.1.13-9', 'colori', 'Spazio colore DeviceN con troppi componenti'],
    cidMax: ['6.1.12-10', '6.1.13-10', 'font', 'Codice CID oltre 65535'],
    pageBox: [null, '6.1.13-11', 'struttura', 'Dimensioni della pagina (MediaBox, CropBox…) fuori dai limiti (3–14400 punti)'],
    oc: ['6.1.13-1', null, 'contenuto', 'Livelli (contenuti opzionali): non ammessi in PDF/A-1'],
    perms: [null, '6.1.12-1', 'sicurezza', 'Dizionario dei permessi con voci non ammesse'],
    sigRef: [null, '6.1.12-2', 'sicurezza', 'Firma con riferimenti al digest non ammessi'],
    oiProfile: ['6.2.2-1', '6.2.3-1', 'colori', 'Profilo colore dell’OutputIntent non valido o di tipo non ammesso'],
    oiSame: ['6.2.2-2', '6.2.3-2', 'colori', 'Più OutputIntent con profili colore diversi'],
    oiRef: [null, '6.2.3-3', 'colori', 'OutputIntent PDF/X con profilo esterno (DestOutputProfileRef)'],
    iccIn: ['6.2.3.2-1', '6.2.4.2-1', 'colori', 'Profilo colore ICC incorporato non valido o di versione non ammessa'],
    iccN: ['6.2.3.2-2', '6.2.4.2-1', 'colori', 'Numero di componenti del profilo ICC non coerente'],
    opm: [null, '6.2.4.2-2', 'colori', 'Sovrastampa con OPM 1 su colori CMYK ICC'],
    rgb: ['6.2.3.3-1', '6.2.4.3-2', 'colori', 'Colori RGB del dispositivo senza un profilo colore di destinazione (OutputIntent RGB)'],
    cmyk: ['6.2.3.3-2', '6.2.4.3-3', 'colori', 'Colori CMYK del dispositivo senza un profilo colore di destinazione (OutputIntent CMYK)'],
    gray: ['6.2.3.3-3', '6.2.4.3-4', 'colori', 'Colori in scala di grigi del dispositivo senza OutputIntent'],
    colorants: [null, '6.2.4.4-1', 'colori', 'Colore spot non elencato tra i Colorants'],
    sepConsist: [null, '6.2.4.4-2', 'colori', 'Colori spot con lo stesso nome ma definizioni diverse'],
    alternates: ['6.2.4-1', '6.2.8-1', 'immagini', 'Immagine con versioni alternative (Alternates)'],
    opi: ['6.2.4-2', '6.2.8-2', 'immagini', 'Immagine o oggetto con riferimenti OPI'],
    interpolate: ['6.2.4-3', '6.2.8-3', 'immagini', 'Immagine con interpolazione attiva'],
    bpc: ['6.2.4-4', '6.2.8-4', 'immagini', 'Profondità di colore delle immagini non ammessa'],
    maskBpc: ['6.2.4-5', '6.2.8-5', 'immagini', 'Maschera d’immagine con profondità diversa da 1 bit'],
    jpx: [null, '6.2.8.3-1', 'immagini', 'Immagine JPEG 2000 non conforme'],
    formPs: ['6.2.5-1', '6.2.9-1', 'contenuto', 'Oggetto grafico con codice PostScript'],
    refX: ['6.2.6-1', '6.2.9-2', 'contenuto', 'Oggetto grafico che rimanda a un altro file (reference XObject)'],
    psX: ['6.2.7-1', '6.2.9-3', 'contenuto', 'Oggetto PostScript (PS XObject)'],
    tr: ['6.2.8-1', '6.2.5-1', 'colori', 'Funzioni di trasferimento (TR) nello stato grafico'],
    tr2: ['6.2.8-2', '6.2.5-2', 'colori', 'Funzioni di trasferimento (TR2) nello stato grafico'],
    htp: [null, '6.2.5-3', 'colori', 'Chiave HTP nello stato grafico'],
    halftone: [null, '6.2.5-4', 'colori', 'Retinatura (halftone) di tipo non ammesso'],
    htName: [null, '6.2.5-5', 'colori', 'Retinatura con nome (HalftoneName)'],
    htTransfer: [null, '6.2.5-6', 'colori', 'Funzione di trasferimento nella retinatura non ammessa'],
    intent: ['6.2.9-1', '6.2.6-1', 'colori', 'Intento di rendering non valido'],
    undefOp: ['6.2.10-1', '6.2.2-1', 'contenuto', 'Comandi non previsti dalla specifica PDF nel contenuto delle pagine'],
    inheritRes: [null, '6.2.2-2', 'contenuto', 'Contenuto senza un proprio dizionario delle risorse'],
    fontType: ['6.3.2-1', '6.2.11.2-1', 'font', 'Dizionario di font senza Type /Font'],
    fontSub: ['6.3.2-2', '6.2.11.2-2', 'font', 'Tipo di font non valido'],
    fontBase: ['6.3.2-3', '6.2.11.2-3', 'font', 'Font senza nome (BaseFont)'],
    fontFirst: ['6.3.2-4', '6.2.11.2-4', 'font', 'Font senza FirstChar'],
    fontLast: ['6.3.2-5', '6.2.11.2-5', 'font', 'Font senza LastChar'],
    fontWidths: ['6.3.2-6', '6.2.11.2-6', 'font', 'Tabella delle larghezze (Widths) del font mancante o di lunghezza errata'],
    fontFileSub: ['6.3.2-7', '6.2.11.2-7', 'font', 'Formato del programma del font non ammesso'],
    cidSysInfo: ['6.3.3.1-1', '6.2.11.3.1-1', 'font', 'Font composito con CIDSystemInfo incompatibile'],
    cidToGid: ['6.3.3.2-1', '6.2.11.3.2-1', 'font', 'Font CID TrueType senza CIDToGIDMap'],
    cmapEmb: ['6.3.3.3-1', '6.2.11.3.3-1', 'font', 'CMap non incorporata'],
    cmapWMode: ['6.3.3.3-2', '6.2.11.3.3-2', 'font', 'CMap con WMode incoerente'],
    cmapRef: [null, '6.2.11.3.3-3', 'font', 'CMap che rimanda a un’altra CMap non standard'],
    fontEmb: ['6.3.4-1', '6.2.11.4.1-1', 'font', 'Font non incorporati nel file'],
    glyph: ['6.3.5-1', '6.2.11.4.1-2', 'font', 'Caratteri usati che mancano nel font incorporato'],
    charset: ['6.3.5-2', '6.2.11.4.2-1', 'font', 'Font Type 1 ridotto (subset) con CharSet mancante o incompleto'],
    cidset: ['6.3.5-3', '6.2.11.4.2-2', 'font', 'Font CID ridotto (subset) con CIDSet mancante o incompleto'],
    width: ['6.3.6-1', '6.2.11.5-1', 'font', 'Larghezze dei caratteri diverse tra il PDF e il font incorporato'],
    ttEnc: ['6.3.7-1', '6.2.11.6-2', 'font', 'Font TrueType non simbolico senza codifica WinAnsi o MacRoman'],
    ttSymEnc: ['6.3.7-2', '6.2.11.6-3', 'font', 'Font TrueType simbolico con una codifica (Encoding) dichiarata'],
    ttCmap: ['6.3.7-3', '6.2.11.6-4', 'font', 'Font TrueType simbolico con tabella cmap non valida'],
    ttCmapNS: [null, '6.2.11.6-1', 'font', 'Font TrueType non simbolico senza tabelle cmap utilizzabili'],
    notdef: [null, '6.2.11.8-1', 'font', 'Il testo usa il glifo .notdef (carattere mancante)'],
    toUni: ['6.3.8-1', '6.2.11.7.2-1', 'testo', 'Caratteri senza corrispondenza Unicode (ToUnicode): il testo non si può estrarre correttamente'],
    toUniBad: [null, '6.2.11.7.2-2', 'testo', 'Mappatura Unicode con valori non validi (0, FEFF, FFFE)'],
    pua: [null, '6.2.11.7.3-1', 'testo', 'Caratteri nell’area privata Unicode senza testo alternativo (ActualText)'],
    smaskGs: ['6.4-1', null, 'trasparenza', 'Trasparenze (maschere morbide): non ammesse in PDF/A-1'],
    smaskX: ['6.4-2', null, 'trasparenza', 'Immagini con canale di trasparenza (SMask): non ammesse in PDF/A-1'],
    group: ['6.4-3', null, 'trasparenza', 'Gruppi di trasparenza: non ammessi in PDF/A-1'],
    bm: ['6.4-4', '6.2.10-1', 'trasparenza', 'Metodo di fusione (blend mode) non ammesso'],
    ca: ['6.4-5', null, 'trasparenza', 'Opacità diversa dal 100%: non ammessa in PDF/A-1'],
    caF: ['6.4-6', null, 'trasparenza', 'Opacità del riempimento diversa dal 100%: non ammessa in PDF/A-1'],
    transpCS: [null, '6.2.10-2', 'trasparenza', 'Pagina con trasparenze senza spazio colore di fusione né OutputIntent'],
    annotType: ['6.5.2-1', '6.3.1-1', 'annotazioni', 'Annotazioni di tipo non ammesso (allegati, suoni, filmati, 3D…)'],
    annotCA: ['6.5.3-1', null, 'annotazioni', 'Annotazione semitrasparente'],
    annotF: ['6.5.3-2', '6.3.2-1', 'annotazioni', 'Annotazione senza i flag di stampa corretti (F)'],
    annotFlags: [null, '6.3.2-2', 'annotazioni', 'Annotazione nascosta o non stampabile'],
    annotC: ['6.5.3-3', null, 'annotazioni', 'Annotazione con colori (C/IC) senza OutputIntent RGB'],
    annotAP: [null, '6.3.3-1', 'annotazioni', 'Annotazione senza aspetto (appearance)'],
    annotAPN: ['6.5.3-4', '6.3.3-2', 'annotazioni', 'Aspetto dell’annotazione con voci diverse da N'],
    annotBtn: ['6.5.3-5', '6.3.3-3', 'annotazioni', 'Pulsante del modulo con aspetto non valido'],
    annotNStream: ['6.5.3-6', '6.3.3-4', 'annotazioni', 'Aspetto dell’annotazione non valido'],
    action: ['6.6.1-1', '6.5.1-1', 'azioni', 'Azioni non ammesse (JavaScript, avvio di programmi, suoni…)'],
    namedAction: ['6.6.1-2', '6.5.1-2', 'azioni', 'Azione con nome non ammessa'],
    widgetA: ['6.6.1-3', '6.4.1-1', 'moduli', 'Campi del modulo che eseguono azioni'],
    widgetAA: ['6.6.2-1', '6.4.1-1', 'moduli', 'Campi del modulo con azioni automatiche'],
    fieldAA: ['6.6.2-2', '6.4.1-2', 'moduli', 'Campi del modulo con azioni automatiche'],
    catAA: ['6.6.2-3', '6.5.2-1', 'azioni', 'Azioni automatiche all’apertura del documento'],
    pageAA: [null, '6.5.2-2', 'azioni', 'Azioni automatiche sulle pagine'],
    needApp: ['6.9-1', '6.4.1-3', 'moduli', 'Modulo con NeedAppearances attivo'],
    fieldAP: ['6.9-2', null, 'moduli', 'Campo del modulo senza aspetto'],
    xfa: [null, '6.4.2-1', 'moduli', 'Modulo XFA'],
    needsRend: [null, '6.4.2-2', 'moduli', 'Il documento richiede il rendering dinamico (NeedsRendering)'],
    sigRange: [null, '6.4.3-1', 'sicurezza', 'La firma digitale non copre l’intero file'],
    metaMissing: ['6.7.2-1', '6.6.2.1-1', 'metadati', 'Mancano i metadati XMP del documento'],
    metaFilter: ['6.7.2-2', null, 'metadati', 'Metadati XMP compressi'],
    infoDate: ['6.7.3-1', null, 'metadati', 'Data di creazione diversa tra le proprietà del documento e i metadati XMP'],
    infoTitle: ['6.7.3-2', null, 'metadati', 'Titolo diverso tra le proprietà del documento e i metadati XMP'],
    infoAuthor: ['6.7.3-3', null, 'metadati', 'Autore diverso tra le proprietà del documento e i metadati XMP'],
    infoSubject: ['6.7.3-4', null, 'metadati', 'Oggetto diverso tra le proprietà del documento e i metadati XMP'],
    infoKeywords: ['6.7.3-5', null, 'metadati', 'Parole chiave diverse tra le proprietà del documento e i metadati XMP'],
    infoCreator: ['6.7.3-6', null, 'metadati', 'Applicazione di origine diversa tra le proprietà del documento e i metadati XMP'],
    infoProducer: ['6.7.3-7', null, 'metadati', 'Produttore diverso tra le proprietà del documento e i metadati XMP'],
    infoModDate: ['6.7.3-8', null, 'metadati', 'Data di modifica diversa tra le proprietà del documento e i metadati XMP'],
    xmpBytes: ['6.7.5-1', '6.6.2.1-2', 'metadati', 'Intestazione del pacchetto XMP con l’attributo bytes'],
    xmpEncAttr: ['6.7.5-2', '6.6.2.1-3', 'metadati', 'Intestazione del pacchetto XMP con l’attributo encoding'],
    xmpSyntax: ['6.7.9-1', '6.6.2.1-4', 'metadati', 'Metadati XMP scritti male (XML non valido)'],
    xmpUtf8: [null, '6.6.2.1-5', 'metadati', 'Metadati XMP non codificati in UTF-8'],
    xmpProp: ['6.7.9-2', '6.6.2.3.1-1', 'metadati', 'Proprietà XMP non previste né descritte da uno schema di estensione'],
    xmpType: ['6.7.9-3', '6.6.2.3.1-2', 'metadati', 'Proprietà XMP con un tipo di valore sbagliato'],
    extSchema: ['6.7.8-1', '6.6.2.3.2-1', 'metadati', 'Schema di estensione XMP non valido'],
    pdfaid: ['6.7.11-1', '6.6.4-1', 'metadati', 'I metadati non dichiarano la conformità PDF/A (pdfaid)'],
    pdfaidPart: ['6.7.11-2', '6.6.4-2', 'metadati', 'La parte PDF/A dichiarata non corrisponde'],
    pdfaidConf: ['6.7.11-3', '6.6.4-3', 'metadati', 'Livello di conformità dichiarato non valido'],
    pdfaidPfx: ['6.7.11-4', '6.6.4-4', 'metadati', 'Identificazione PDF/A con prefisso non standard'],
    ocName: [null, '6.9-1', 'contenuto', 'Configurazione dei livelli senza nome'],
    ocDup: [null, '6.9-2', 'contenuto', 'Configurazioni dei livelli con nomi duplicati'],
    ocOrder: [null, '6.9-3', 'contenuto', 'Livelli non elencati nell’ordine (Order)'],
    ocAS: [null, '6.9-4', 'contenuto', 'Configurazione dei livelli con azioni automatiche (AS)'],
    altPres: [null, '6.10-1', 'contenuto', 'Presentazioni alternative'],
    presSteps: [null, '6.10-2', 'contenuto', 'Passi di presentazione sulle pagine'],
    requirements: [null, '6.11-1', 'struttura', 'Il documento dichiara requisiti per il lettore (Requirements)'],
    efFUF: [null, '6.8-2', 'allegati', 'File allegato senza i nomi F e UF'],
    efPdfa: [null, '6.8-5', 'allegati', 'File allegato che non è PDF/A-1 o PDF/A-2'],
    efMime: [null, '6.8-1', 'allegati', 'File allegato senza tipo MIME (Subtype)'],
    efAFRel: [null, '6.8-3', 'allegati', 'File allegato senza relazione con il documento (AFRelationship)'],
    efAssoc: [null, '6.8-4', 'allegati', 'File allegato non associato al documento (AF)'],
    marked: ['6.8.2.2-1', '6.7.2.2-1', 'accessibilità', 'Il documento non è contrassegnato come strutturato (MarkInfo)'],
    structRoot: ['6.8.3.3-1', '6.7.3.3-1', 'accessibilità', 'Manca la struttura logica (tag) del documento'],
    roleMap: ['6.8.3.4-1', '6.7.3.4-1', 'accessibilità', 'Tipi di struttura non standard non mappati'],
    roleCirc: ['6.8.3.4-2', '6.7.3.4-2', 'accessibilità', 'Mappatura circolare dei tipi di struttura'],
    roleStd: [null, '6.7.3.4-3', 'accessibilità', 'Tipi di struttura standard rimappati'],
    lang: ['6.8.4-1', '6.7.4-1', 'accessibilità', 'Lingua (Lang) non valida'],
    broken: ['', '', 'struttura', 'Struttura del file non leggibile'],
  };
  const CAT = { struttura: 'Struttura del file', sicurezza: 'Protezione e firme', colori: 'Colori', immagini: 'Immagini', contenuto: 'Contenuto delle pagine', font: 'Font', testo: 'Testo ricercabile', trasparenza: 'Trasparenze', annotazioni: 'Annotazioni', azioni: 'Azioni e script', moduli: 'Moduli', metadati: 'Metadati', allegati: 'File allegati', accessibilità: 'Accessibilità (tag)' };

  /* =====================================================================
     VERIFICA
     ===================================================================== */
  const OPS = new Set(`b B b* B* BDC BI BMC BT BX c cm CS cs d d0 d1 Do DP EI EMC ET EX f F f* G g gs h i ID j J K k l m M MP n q Q re RG rg ri s S SC sc SCN scn sh T* Tc Td TD Tf Tj TJ TL Tm Tr Ts Tw Tz v w W W* y ' "`.split(/\s+/));
  const RI = new Set(['RelativeColorimetric', 'AbsoluteColorimetric', 'Perceptual', 'Saturation']);
  const BMS = new Set(['Normal', 'Compatible', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'ColorDodge', 'ColorBurn', 'HardLight', 'SoftLight', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity']);
  const ANN1 = new Set(['Text', 'Link', 'FreeText', 'Line', 'Square', 'Circle', 'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Stamp', 'Ink', 'Popup', 'Widget', 'PrinterMark', 'TrapNet']);
  const ANN2 = new Set(['Text', 'Link', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine', 'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Stamp', 'Caret', 'Ink', 'Popup', 'FileAttachment', 'Widget', 'PrinterMark', 'TrapNet', 'Watermark', 'Redact']);
  const ACT1 = new Set(['GoTo', 'GoToR', 'Thread', 'URI', 'Named', 'SubmitForm']);
  const ACT2 = new Set(['GoTo', 'GoToR', 'GoToE', 'Thread', 'URI', 'Named', 'SubmitForm']);
  const NAMED = new Set(['NextPage', 'PrevPage', 'FirstPage', 'LastPage']);
  const STD_STRUCT = new Set('Document Part Art Sect Div BlockQuote Caption TOC TOCI Index NonStruct Private P H H1 H2 H3 H4 H5 H6 L LI Lbl LBody Table TR TH TD THead TBody TFoot Span Quote Note Reference BibEntry Code Link Annot Ruby RB RT RP Warichu WT WP Figure Formula Form'.split(' '));

  // legge la dichiarazione PDF/A senza verificare (per riconoscere subito i file)
  function claim(bytes) {
    try {
      const D = parse(bytes, () => { });
      const root = D.R(D.trailer.get('Root'));
      const ms = root instanceof Dict ? D.R(root.get('Metadata')) : null;
      if (!(ms instanceof Stream)) return null;
      ms._doc = D;
      const x = readXmp(decode(ms));
      return x.ok && x.part ? { part: x.part, level: (x.conf || 'B').toUpperCase() } : null;
    } catch (e) { return null; }
  }
  function readXmp(bytes) {
    const r = { ok: false };
    let text;
    const u32 = (le) => { let o = ''; for (let i = 0; i + 3 < bytes.length; i += 4) { const v = le ? (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0 : ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0; try { o += String.fromCodePoint(v); } catch (e) { } } return o; };
    if (bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 0 && bytes[3] || bytes[2] === 0xFE && bytes[3] === 0xFF)) { r.enc = 'UTF-32BE'; text = u32(false); }
    else if ((bytes[0] && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0) || (bytes[0] === 0xFF && bytes[1] === 0xFE && bytes[2] === 0 && bytes[3] === 0)) { r.enc = 'UTF-32LE'; text = u32(true); }
    else if ((bytes[0] === 0xFE && bytes[1] === 0xFF) || (bytes[0] === 0 && bytes[1])) { r.enc = 'UTF-16BE'; text = new TextDecoder('utf-16be').decode(bytes); }
    else if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] && bytes[1] === 0)) { r.enc = 'UTF-16LE'; text = new TextDecoder('utf-16le').decode(bytes); }
    else { r.enc = 'UTF-8'; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { r.enc = 'other'; text = latin1(bytes); } }
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    r.text = text;
    try { r.doc = parseXML(text); } catch (e) { r.err = e.message; return r; }
    r.ok = true;
    const pi = r.doc.kids.find(k => k.pi && /^xpacket\b/.test(k.pi) && /\bbegin\s*=/.test(k.pi));
    if (pi) { r.bytesAttr = /\bbytes\s*=/.test(pi.pi); r.encAttr = /\bencoding\s*=/.test(pi.pi); }
    // le proprietà di primo livello
    const rdf = findRdf(r.doc); r.props = [];
    if (rdf) for (const desc of kidsEl(rdf)) {
      const q = qn(desc); if (q.ns !== NS.rdf || q.local !== 'Description') continue;
      for (const [k, v] of Object.entries(desc.attrs)) { if (k.startsWith('xmlns') || k === 'xml:lang') continue; const a = qn(desc, k); if (a.ns === NS.rdf) continue; r.props.push({ ns: a.ns, local: a.local, pfx: a.pfx, attr: true, value: v }); }
      for (const p of kidsEl(desc)) { const a = qn(p); r.props.push({ ns: a.ns, local: a.local, pfx: a.pfx, el: p }); }
    }
    const get = (ns, local) => r.props.find(p => p.ns === ns && p.local === local);
    const val = p => p ? (p.attr ? p.value : simpleText(p.el)) : null;
    const part = get(NS.pdfaid, 'part'), conf = get(NS.pdfaid, 'conformance');
    r.part = part ? parseInt(val(part), 10) || null : null; r.partRaw = part ? val(part) : null; r.conf = conf ? (val(conf) || '').trim() : null;
    r.partPfx = part?.pfx; r.confPfx = conf?.pfx; r.amdPfx = get(NS.pdfaid, 'amd')?.pfx; r.corrPfx = get(NS.pdfaid, 'corr')?.pfx;
    r.get = get; r.val = val;
    return r;
  }
  const findRdf = (el) => { for (const k of kidsEl(el)) { const q = qn(k); if (q.ns === NS.rdf && q.local === 'RDF') return k; const f = findRdf(k); if (f) return f; } return null; };
  const simpleText = el => { const ks = kidsEl(el); if (!ks.length) return el.attrs['rdf:resource'] ?? textOf(el).trim(); const c = ks[0]; const q = qn(c); if (q.ns === NS.rdf && ['Alt', 'Seq', 'Bag'].includes(q.local)) { const li = kidsEl(c); return li.length ? textOf(li[0]).trim() : ''; } return textOf(el).trim(); };

  const SIMPLE = {
    Text: () => true, Integer: v => /^[+-]?\d+$/.test(v), Real: v => /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v), Boolean: v => v === 'True' || v === 'False',
    Date: v => /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/.test(v),
    Rational: v => /^[+-]?\d+\/[+-]?\d+$/.test(v), GPS: v => /^\d{1,3},\d{1,2}(,\d{1,2}|\.\d+)[NSEW]$/.test(v),
  };
  async function check(bytes, opts = {}) {
    const issues = new Map();
    let part = opts.part || null, level = opts.level || null;
    let declared = null, pages = [];
    const efSeen = new Set(), afSet = new Set();
    const nameOfFs = fs => { const v = R(fs.get('UF')) || R(fs.get('F')); return v instanceof Str ? textStr(v) : null; };
    const customTypes = new Map();
    const add = (key, detail, where) => {
      let it = issues.get(key);
      if (!it) { it = { key, n: 0, details: [], pages: new Set() }; issues.set(key, it); }
      it.n++; if (detail != null && it.details.length < 5 && !it.details.includes(String(detail))) it.details.push(String(detail));
      if (where) it.pages.add(where);
    };
    const yieldNow = typeof opts.yield === 'function' ? opts.yield : () => null;
    let D;
    try { D = parse(bytes, add); } catch (e) { return finish({ fatal: 'Il file non è un PDF leggibile.' }); }
    const R = D.R;
    for (const o of D.cache.values()) if (o instanceof Stream) o._doc = D;
    const root = R(D.trailer.get('Root'));
    if (!(root instanceof Dict)) return finish({ fatal: 'Il file non ha un catalogo leggibile.' });
    // la dichiarazione nei metadati
    const metaS = R(root.get('Metadata'));
    let X = null;
    if (metaS instanceof Stream) { metaS._doc = D; X = readXmp(decode(metaS)); }
    declared = X && X.ok && X.part ? { part: X.part, level: (X.conf || '').toUpperCase() } : null;
    if (!part) part = declared && [1, 2, 3].includes(declared.part) ? declared.part : 1;
    if (!level) level = declared && ['A', 'B', 'U'].includes(declared.level) && !(part === 1 && declared.level === 'U') ? declared.level : 'B';
    D.lim.part = part;
    const P1 = part === 1, P2 = !P1;
    const unicodeLevel = level === 'U' || level === 'A';

    /* --- struttura del file --- */
    {
      const head = latin1(bytes, 0, Math.min(bytes.length, 64));
      const eol = head.search(/[\r\n]/);
      const line = eol >= 0 ? head.slice(0, eol) : head;
      if (P1 ? !/^%PDF-\d\.\d/.test(line) : !/^%PDF-1\.[0-7]$/.test(line)) add('header', line.slice(0, 12));
      let p = eol; if (bytes[p] === 13) p++; if (bytes[p] === 10) p++;
      if (!(bytes[p] === 37 && bytes[p + 1] > 127 && bytes[p + 2] > 127 && bytes[p + 3] > 127 && bytes[p + 4] > 127)) add('headerBin');
      // dopo l'ultimo %%EOF al massimo un fine riga
      const tail = latin1(bytes, Math.max(0, bytes.length - 1100));
      const k = tail.lastIndexOf('%%EOF');
      if (k < 0) add('postEof', 'manca %%EOF');
      else { const after = tail.slice(k + 5); if (!(after === '' || after === '\n' || after === '\r' || after === '\r\n')) add('postEof', `${after.length} byte`); }
      // ID nell'ultimo trailer (o nel primo, se il file è linearizzato)
      const first = D.xref.size ? null : null;
      const lin = (() => { const m = /^\s*(\d+)\s+\d+\s+obj/.exec(latin1(bytes, p, Math.min(bytes.length, p + 200)).replace(/^%[^\r\n]*[\r\n]+/, '')); if (!m) return null; const o = D.get(+m[1]); return o instanceof Dict && o.has('Linearized') ? o : null; })();
      const sorted = D.sections.slice().sort((a, b) => a.off - b.off);
      const firstTr = sorted.length ? sorted[0].trailer : null;
      const lastTr = sorted.length ? sorted[sorted.length - 1].trailer : D.trailers[0];
      const idOf = t => { const v = t && R(t.get('ID')); return Array.isArray(v) && v.length === 2 && v.map(R).every(x => x instanceof Str && x.b.length > 0) ? v : null; };
      if (lin) { const a = idOf(firstTr), b2 = idOf(lastTr); if (!a) add('noId'); else if (P1 && b2 && a.map(x => latin1(R(x).b)).join('|') !== b2.map(x => latin1(R(x).b)).join('|')) add('linId'); }
      else if (!idOf(lastTr)) add('noId');
      if (D.trailers.some(t => t.has('Encrypt'))) add('encrypt');
      for (const s of D.sections) { if (s.kind === 'table') { if (s.badEol) add('xrefEol'); if (P1 && s.badHeader) add('xrefHead'); } }
      if (P1 && D.hasXrefStream) add('xrefStream');
    }
    // tutti gli oggetti: limiti, stringhe, stream, spazi
    let nObj = 0;
    for (const [num, e] of D.xref) { if (e.t === 0) continue; nObj++; const o = D.get(num); if (o instanceof Stream) o._doc = D; if (nObj % 2000 === 0) await yieldNow(); }
    if (nObj > 8388607) add('nObj', nObj);
    for (const l of D.lexical) if (!l.sp.ok) add('objSpacing', `oggetto ${l.num}`);
    for (const [num] of D.xref) {
      const o = D.cache.get(num);
      if (!(o instanceof Stream)) continue;
      if (D.xref.get(num).t === 1) {
        if (!o.lenOk) add('streamLen', `oggetto ${num}: dichiarati ${o.lenDecl ?? '—'} byte, reali ${o.real}`);
        if (!o.kw.crlf || !o.kw.eolEnd) add('streamKw', `oggetto ${num}`);
      }
      if (o.has('F') || o.has('FFilter') || o.has('FDecodeParms')) add('streamF', `oggetto ${num}`);
      const f = R(o.get('Filter')); const fl = Array.isArray(f) ? f.map(R) : f ? [f] : [];
      const dp = R(o.get('DecodeParms')); const dpl = Array.isArray(dp) ? dp.map(R) : [dp];
      fl.forEach((x, i) => {
        const n = nv(x);
        if (n === 'LZWDecode') add('lzw', `oggetto ${num}`);
        else if (P2 && (!FILTERS.has(n) || (n === 'Crypt' && !(dpl[i] instanceof Dict && nv(dpl[i].get('Name')) === 'Identity')))) add('lzw', `oggetto ${num}: ${n}`);
      });
    }
    for (const [k, list] of Object.entries(D.lim.hits)) if (RULES[k]) list.forEach(x => add(k, x.v, x.w));
    const resetLim = () => { D.lim.hits = {}; };
    resetLim();
    await yieldNow();

    /* --- OutputIntent --- */
    let gOutputCS = null;
    {
      const ois = R(root.get('OutputIntents'));
      const list = Array.isArray(ois) ? ois.map(R).filter(x => x instanceof Dict) : [];
      const profRefs = new Set();
      for (const oi of list) {
        const s = nv(R(oi.get('S')));
        const dop = oi.get('DestOutputProfile');
        if (dop) profRefs.add(dop instanceof Ref ? dop.n + ' ' + dop.g : 'direct');
        if (P2 && s === 'GTS_PDFX' && oi.has('DestOutputProfileRef')) add('oiRef');
        if (s !== 'GTS_PDFA1') continue;
        const ps = R(dop);
        if (!(ps instanceof Stream)) { add('oiProfile', 'profilo mancante'); continue; }
        ps._doc = D;
        const h = iccHeader(decode(ps));
        const maxV = P1 ? 3 : 5;
        if (!h || !['prtr', 'mntr'].includes(h.cls) || !['RGB ', 'CMYK', 'GRAY'].includes(h.cs) || h.ver >= maxV) add('oiProfile', h ? `${h.cls.trim()} ${h.cs.trim()} v${h.ver}` : 'profilo illeggibile');
        else if (!gOutputCS) gOutputCS = h.cs;
        if (h && !gOutputCS && ['RGB ', 'CMYK', 'GRAY'].includes(h.cs)) gOutputCS = null;
      }
      const withProf = list.filter(oi => oi.has('DestOutputProfile'));
      if (withProf.length > 1 && profRefs.size > 1) add('oiSame');
    }

    /* --- catalogo --- */
    if (P1 && root.has('OCProperties')) add('oc');
    if (root.has('AA')) add('catAA');
    if (P2 && root.has('NeedsRendering') && R(root.get('NeedsRendering')) !== false) add('needsRend');
    if (P2 && root.has('Requirements')) add('requirements');
    const names = R(root.get('Names'));
    if (names instanceof Dict) {
      if (P1 && names.has('EmbeddedFiles')) add('embeddedFiles');
      if (P2 && names.has('AlternatePresentations')) add('altPres');
    }
    const perms = R(root.get('Perms'));
    if (P2 && perms instanceof Dict) {
      const extra = perms.keys().filter(k => k !== 'UR3' && k !== 'DocMDP'); if (extra.length) add('perms', extra.join(', '));
      if (perms.has('DocMDP')) {
        const sig = R(perms.get('DocMDP')); const refs = sig instanceof Dict ? R(sig.get('Reference')) : null;
        (Array.isArray(refs) ? refs.map(R) : []).forEach(r => { if (r instanceof Dict && ['DigestLocation', 'DigestMethod', 'DigestValue'].some(k => r.has(k))) add('sigRef'); });
      }
    }
    // livelli (PDF/A-2)
    if (P2) {
      const ocp = R(root.get('OCProperties'));
      if (ocp instanceof Dict) {
        const cfgArr = R(ocp.get('Configs')); const cfgs = [R(ocp.get('D')), ...(Array.isArray(cfgArr) ? cfgArr.map(R) : [])].filter(x => x instanceof Dict);
        const seenN = new Set();
        const ocgs = (R(ocp.get('OCGs')) || []); const ocgSet = new Set((Array.isArray(ocgs) ? ocgs : []).map(x => x instanceof Ref ? x.n : x));
        for (const c of cfgs) {
          const nmv = R(c.get('Name')); const nmS = nmv instanceof Str ? textStr(nmv) : null;
          if (!nmS) add('ocName'); else { if (seenN.has(nmS)) add('ocDup', nmS); seenN.add(nmS); }
          if (c.has('AS')) add('ocAS');
          const ord = R(c.get('Order'));
          if (Array.isArray(ord)) { const inOrd = new Set(); const walkO = a => a.forEach(x => { const v = R(x); if (Array.isArray(v)) walkO(v); else if (x instanceof Ref) inOrd.add(x.n); }); walkO(ord); if ([...ocgSet].some(n => !inOrd.has(n))) add('ocOrder'); }
        }
      }
    }
    // azioni del documento
    const actionSeen = new Set();
    const checkAction = (a, where, depth = 0) => {
      a = R(a); if (!(a instanceof Dict) || actionSeen.has(a) || depth > 30) return; actionSeen.add(a);
      const s = nv(R(a.get('S')));
      if (!(P1 ? ACT1 : ACT2).has(s)) add('action', s || 'sconosciuta', where);
      if (s === 'Named' && !NAMED.has(nv(R(a.get('N'))))) add('namedAction', nv(R(a.get('N'))), where);
      const nx = R(a.get('Next')); if (Array.isArray(nx)) nx.forEach(x => checkAction(x, where, depth + 1)); else if (nx) checkAction(nx, where, depth + 1);
    };
    const oa = R(root.get('OpenAction')); if (oa instanceof Dict) checkAction(oa);
    // segnalibri
    { const ol = R(root.get('Outlines')); const seenO = new Set(); const walkOl = (it, d = 0) => { let n = 0; while (it instanceof Dict && !seenO.has(it) && d < 50 && n++ < 100000) { seenO.add(it); if (it.has('A')) checkAction(it.get('A')); walkOl(R(it.get('First')), d + 1); it = R(it.get('Next')); } }; if (ol instanceof Dict) walkOl(R(ol.get('First'))); }

    /* --- pagine --- */
    { const seenP = new Set(); const walkP = (n, inh, d = 0) => { n = R(n); if (!(n instanceof Dict) || seenP.has(n) || d > 64) return; seenP.add(n); const I = { Resources: n.get('Resources') ?? inh.Resources, MediaBox: n.get('MediaBox') ?? inh.MediaBox, CropBox: n.get('CropBox') ?? inh.CropBox }; const kids = R(n.get('Kids')); if (nv(R(n.get('Type'))) === 'Pages' || Array.isArray(kids) && !n.has('Contents') && nv(R(n.get('Type'))) !== 'Page') { (Array.isArray(kids) ? kids : []).forEach(k => walkP(k, I, d + 1)); } else pages.push({ dict: n, ...I }); }; walkP(root.get('Pages'), {}); }

    // stato condiviso per la verifica del contenuto
    const used = { rgb: new Set(), cmyk: new Set(), gray: new Set() };
    const fonts = new Map();     // dizionario del font → uso
    const seenX = new Set(), seenGS = new Set(), seenCS = new Set(), seenPat = new Set(), seenSh = new Set();
    const sepDefs = new Map();
    let pageTransp = false, pageNo = 0;
    const where = () => pageNo || null;
    const resGet = (res, cat, key) => { res = R(res); if (!(res instanceof Dict)) return undefined; const c = R(res.get(cat)); return c instanceof Dict ? c.get(key) : undefined; };
    const hasDefault = (res, n) => res && resGet(res, 'ColorSpace', n) !== undefined;
    const devUse = (k, res) => {
      const def = { rgb: 'DefaultRGB', cmyk: 'DefaultCMYK', gray: 'DefaultGray' }[k];
      if (hasDefault(res, def)) { checkCS(resGet(res, 'ColorSpace', def), res); return; }
      used[k].add(where() || 0);
    };
    function checkICC(s) {
      s = R(s); if (!(s instanceof Stream)) return;
      if (seenCS.has(s)) return s._icc; seenCS.add(s); s._doc = D;
      const h = iccHeader(decode(s)), N = R(s.get('N')); s._icc = h;
      const maxV = P1 ? 3 : 5;
      if (!h || !['prtr', 'mntr', 'scnr', 'spac'].includes(h.cls) || !['RGB ', 'CMYK', 'GRAY', 'Lab '].includes(h.cs) || h.ver >= maxV) add('iccIn', h ? `${h.cls.trim()} ${h.cs.trim()} v${h.ver}` : 'profilo illeggibile', where());
      else if (!((N === 1 && h.cs === 'GRAY') || (N === 3 && (h.cs === 'RGB ' || h.cs === 'Lab ')) || (N === 4 && h.cs === 'CMYK'))) add('iccN', `N=${N}, profilo ${h.cs.trim()}`, where());
      return h;
    }
    const gst = { op: false, OP: false, opm: 0, iccCmyk: false };
    function checkCS(cs, res, depth = 0) {
      cs = R(cs); if (depth > 10 || cs == null) return null;
      if (cs instanceof Name) {
        const n = cs.v;
        if (n === 'DeviceRGB' || n === 'RGB') return devUse('rgb', res), 'rgb';
        if (n === 'DeviceCMYK' || n === 'CMYK') return devUse('cmyk', res), 'cmyk';
        if (n === 'DeviceGray' || n === 'G') return devUse('gray', res), 'gray';
        if (n === 'Pattern') return 'pattern';
        const r = resGet(res, 'ColorSpace', n); if (r !== undefined) return checkCS(r, res, depth + 1);
        return null;
      }
      if (!Array.isArray(cs) || !cs.length) return null;
      const k = nv(R(cs[0]));
      if (k === 'ICCBased') { const h = checkICC(cs[1]); return h && h.cs === 'CMYK' ? 'iccCmyk' : 'icc'; }
      if (k === 'Indexed' || k === 'I') { checkCS(cs[1], res, depth + 1); return 'indexed'; }
      if (k === 'Separation') {
        const nm = R(cs[1]); if (P2 && nm instanceof Name) unicodeName(nm);
        checkCS(cs[2], res, depth + 1);
        if (P2 && nm instanceof Name && nm.v !== 'All' && nm.v !== 'None') { const sig = sigOf(cs[2]) + '|' + sigOf(cs[3]); const prev = sepDefs.get(nm.v); if (prev && prev !== sig) add('sepConsist', nm.v); else sepDefs.set(nm.v, sig); }
        return 'sep';
      }
      if (k === 'DeviceN') {
        const nms = R(cs[1]); const cnt = Array.isArray(nms) ? nms.length : 0;
        if (cnt > (P1 ? 8 : 32)) add('devN', cnt);
        if (P2 && Array.isArray(nms)) nms.map(R).forEach(x => x instanceof Name && unicodeName(x));
        checkCS(cs[2], res, depth + 1);
        const attrs = R(cs[4]);
        if (P2 && Array.isArray(nms) && !(attrs instanceof Dict && R(attrs.get('Colorants')) instanceof Dict)) { const procN = new Set(['Cyan', 'Magenta', 'Yellow', 'Black', 'None', 'All']); const spots = nms.map(R).filter(x => x instanceof Name && !procN.has(x.v)); if (spots.length) add('colorants', spots.map(x => x.v).join(', ')); }
        if (attrs instanceof Dict) {
          const col = R(attrs.get('Colorants'));
          if (col instanceof Dict) for (const [, v] of col.m) checkCS(v, res, depth + 1);
          if (P2 && Array.isArray(nms)) { const proc = new Set(['Cyan', 'Magenta', 'Yellow', 'Black', 'Red', 'Green', 'Blue', 'Gray', 'None']); const pc = R(attrs.get('Process')); const pcomp = pc instanceof Dict ? R(pc.get('Components')) : null; const pset = new Set(Array.isArray(pcomp) ? pcomp.map(x => nv(R(x))) : []); for (const x of nms.map(R)) if (x instanceof Name && !pset.has(x.v) && !proc.has(x.v) && !(col instanceof Dict && col.has(x.v))) add('colorants', x.v); }
        }
        return 'devn';
      }
      if (k === 'Pattern') { if (cs[1]) checkCS(cs[1], res, depth + 1); return 'pattern'; }
      if (k === 'CalRGB' || k === 'CalGray' || k === 'Lab' || k === 'CalCMYK') return 'cal';
      if (k === 'DeviceRGB' || k === 'DeviceCMYK' || k === 'DeviceGray') return checkCS(cs[0], res, depth + 1);
      return null;
    }
    const sigOf = (o, d = 0) => { o = R(o); if (d > 8) return ''; if (o instanceof Stream) { o._doc = D; return 'S{' + sigOf(o.dict, d + 1) + latin1(decode(o)) + '}'; } if (o instanceof Dict) return '{' + o.keys().filter(k => k !== 'Length' && k !== 'Filter' && k !== 'DecodeParms').sort().map(k => k + ':' + sigOf(o.get(k), d + 1)).join(',') + '}'; if (Array.isArray(o)) return '[' + o.map(x => sigOf(x, d + 1)).join(',') + ']'; if (o instanceof Name) return '/' + o.v; if (o instanceof Str) return '(' + latin1(o.b) + ')'; return String(o); };
    function unicodeName(nm) { try { new TextDecoder('utf-8', { fatal: true }).decode(nm.bytes || new Uint8Array(0)); } catch (e) { add('unicodeName', nm.v); } }
    function checkRI(n) { if (n != null && !RI.has(n)) add('intent', n, where()); }
    function checkGS(g, res) {
      g = R(g); if (!(g instanceof Dict)) return;
      const fresh = !seenGS.has(g); seenGS.add(g);
      const sm = R(g.get('SMask'));
      const bm = R(g.get('BM')); const bmn = Array.isArray(bm) ? bm.map(R).map(nv) : [nv(bm)];
      const CA = R(g.get('CA')), ca = R(g.get('ca'));
      const transp = (sm != null && !isName(sm, 'None')) || (typeof CA === 'number' && CA < 1) || (typeof ca === 'number' && ca < 1) || bmn.some(b => b && b !== 'Normal' && b !== 'Compatible');
      if (transp) pageTransp = true;
      if (typeof g.get('OPM') === 'number') gst.opm = g.get('OPM');
      if (g.has('OP')) gst.OP = R(g.get('OP')) === true; if (g.has('op')) gst.op = R(g.get('op')) === true; else if (g.has('OP')) gst.op = gst.OP;
      if (!fresh) return;
      if (P1) {
        if (sm != null && !isName(sm, 'None')) add('smaskGs', null, where());
        if (bmn.some(b => b && b !== 'Normal' && b !== 'Compatible')) add('bm', bmn.join(','), where());
        if (typeof CA === 'number' && Math.abs(CA - 1) > 1e-6) add('ca', CA, where());
        if (typeof ca === 'number' && Math.abs(ca - 1) > 1e-6) add('caF', ca, where());
      } else {
        bmn.forEach(b => { if (b && !BMS.has(b)) add('bm', b, where()); });
        if (g.has('HTP')) add('htp', null, where());
        const ht = R(g.get('HT'));
        const chkHT = (h, colorant) => {
          h = R(h); if (!(h instanceof Dict || h instanceof Stream)) return;
          const t = R(h.get('HalftoneType'));
          if (t !== 1 && t !== 5) add('halftone', t, where());
          if (h.has('HalftoneName')) add('htName', null, where());
          if (t === 5) { for (const [k, v] of (h.dict || h).m) if (k !== 'Type' && k !== 'HalftoneType' && k !== 'HalftoneName') chkHT(v, k); }
          else if (colorant !== undefined) { const tf = h.has('TransferFunction'); const proc = colorant === null || ['Cyan', 'Magenta', 'Yellow', 'Black'].includes(colorant); if (colorant !== 'Default' && (proc ? tf : !tf)) add('htTransfer', colorant, where()); }
        };
        if (ht) chkHT(ht, R(ht) instanceof Dict && R(R(ht).get('HalftoneType')) === 5 ? undefined : null);
        if (sm instanceof Dict) { const gx = R(sm.get('G')); if (gx instanceof Stream) checkXObject(gx, res, 1); }
      }
      if (g.has('TR')) add('tr', null, where());
      const tr2 = R(g.get('TR2')); if (tr2 != null && !isName(tr2, 'Default')) add('tr2', null, where());
      const ri = R(g.get('RI')); if (ri instanceof Name) checkRI(ri.v);
      const font = R(g.get('Font')); if (Array.isArray(font)) useFont(font[0], null, 0);
    }
    function checkFilterList(f, inline, w) {
      f = R(f); const fl = Array.isArray(f) ? f.map(R) : f ? [f] : [];
      const ok = new Set(['ASCIIHexDecode', 'ASCII85Decode', 'FlateDecode', 'RunLengthDecode', 'CCITTFaxDecode', 'DCTDecode', 'AHx', 'A85', 'Fl', 'RL', 'CCF', 'DCT']);
      for (const x of fl) { const n = nv(x); if (n === 'LZWDecode' || n === 'LZW' || (P2 && !ok.has(n))) add('lzwInline', n, w); }
    }
    function checkImage(s, res, isInline, isSMask) {
      const d = s instanceof Stream ? s.dict : s;
      const g = k => R(d.get(k)) ?? (isInline ? R(d.get({ ColorSpace: 'CS', BitsPerComponent: 'BPC', ImageMask: 'IM', Interpolate: 'I', Filter: 'F', Intent: 'Intent', Decode: 'D' }[k])) : undefined);
      if (!isInline) { if (d.has('Alternates')) add('alternates', null, where()); if (d.has('OPI')) add('opi', null, where()); }
      if (g('Interpolate') === true) add('interpolate', null, where());
      const isMask = g('ImageMask') === true;
      const bpc = g('BitsPerComponent');
      const okB = P1 ? [1, 2, 4, 8] : [1, 2, 4, 8, 16];
      if (isMask) { if (bpc != null && bpc !== 1) add('maskBpc', bpc, where()); }
      else if (bpc != null && !okB.includes(bpc)) add('bpc', bpc, where());
      const it = g('Intent'); if (it instanceof Name) checkRI(it.v);
      if (!isInline) {
        const sm = R(d.get('SMask'));
        if (sm) { if (P1) add('smaskX', null, where()); else { pageTransp = true; if (sm instanceof Stream) checkImage(sm, res, false, true); } }
        if (typeof R(d.get('SMaskInData')) === 'number' && R(d.get('SMaskInData')) > 0) { if (P1) add('smaskX', null, where()); else pageTransp = true; }
        const mk = R(d.get('Mask')); if (mk instanceof Stream) checkImage(mk, res, false);
        const f = R(d.get('Filter')); const fl = Array.isArray(f) ? f.map(R).map(nv) : [nv(f)];
        if (P2 && fl.includes('JPXDecode') && s instanceof Stream) checkJpx(s.data);
      }
      if (!isMask && !isSMask) { const cs = g('ColorSpace'); if (cs != null) { const k = checkCS(cs, res); if (k === 'iccCmyk') gst.iccCmyk = true; } }
    }
    function checkJpx(b) {
      try {
        let p = 0, nc = null, colr = [], bpcc = false, depth = null;
        const box = (s, e) => { const out = []; let q = s; while (q + 8 <= e) { let len = ((b[q] << 24) | (b[q + 1] << 16) | (b[q + 2] << 8) | b[q + 3]) >>> 0; const t = latin1(b, q + 4, q + 8); let h = 8; if (len === 1) { len = Number((BigInt(b[q + 12]) << 24n) | BigInt((b[q + 13] << 16) | (b[q + 14] << 8) | b[q + 15])); h = 16; } else if (len === 0) len = e - q; out.push({ t, s: q + h, e: q + len }); q += len; if (len < 8) break; } return out; };
        const top = box(0, b.length); const jp2h = top.find(x => x.t === 'jp2h');
        if (!jp2h) return;
        for (const x of box(jp2h.s, jp2h.e)) {
          if (x.t === 'ihdr') { nc = (b[x.s + 8] << 8) | b[x.s + 9]; depth = (b[x.s + 10] & 0x7f) + 1; if (b[x.s + 10] === 255) depth = null; }
          if (x.t === 'bpcc') bpcc = true;
          if (x.t === 'colr') colr.push({ meth: b[x.s], approx: b[x.s + 2], enumCS: b[x.s] === 1 ? ((b[x.s + 3] << 24) | (b[x.s + 4] << 16) | (b[x.s + 5] << 8) | b[x.s + 6]) : null });
        }
        if (nc != null && ![1, 3, 4].includes(nc)) add('jpx', `${nc} canali`, where());
        if (colr.length > 1 && colr.filter(c => c.approx === 1).length !== 1) add('jpx', 'più spazi colore', where());
        const c0 = colr.length === 1 ? colr[0] : colr.find(c => c.approx === 1);
        if (c0 && ![1, 2, 3].includes(c0.meth)) add('jpx', 'METH', where());
        if (c0 && c0.enumCS === 19) add('jpx', 'CIEJab', where());
        if (bpcc || (depth != null && (depth < 1 || depth > 38))) add('jpx', 'profondità', where());
      } catch (e) { }
    }
    function checkXObject(x, res, depth, col) {
      x = R(x); if (!(x instanceof Stream)) return;
      const st = nv(R(x.get('Subtype')));
      if (st === 'Image') { if (!seenX.has(x)) { seenX.add(x); checkImage(x, res, false); } else { if (R(x.get('SMask'))) pageTransp = true; } return; }
      if (st === 'PS') { add('psX', null, where()); return; }
      if (st !== 'Form') { add('psX', st, where()); return; }
      if (x.has('OPI')) add('opi', null, where());
      if (nv(R(x.get('Subtype2'))) === 'PS' || x.has('PS')) add('formPs', null, where());
      if (x.has('Ref')) add('refX', null, where());
      const grp = R(x.get('Group'));
      if (grp instanceof Dict && nv(R(grp.get('S'))) === 'Transparency') { if (P1) add('group', 'oggetto grafico', where()); else { pageTransp = true; if (grp.has('CS')) checkCS(grp.get('CS'), res); } }
      if (seenX.has(x) && !x._transp) return;
      if (seenX.has(x)) { if (x._transp) pageTransp = true; return; }
      seenX.add(x);
      const own = R(x.get('Resources'));
      const before = pageTransp; pageTransp = false;
      walkContent(decode(x), own instanceof Dict ? own : null, depth + 1, { inheritedFrom: own instanceof Dict ? null : res, kind: 'form', col });
      x._transp = pageTransp; pageTransp = before || pageTransp;
    }
    function checkShading(sh, res) {
      sh = R(sh); const d = sh instanceof Stream ? sh.dict : sh; if (!(d instanceof Dict)) return;
      if (seenSh.has(d)) return; seenSh.add(d);
      const k = checkCS(d.get('ColorSpace'), res); if (k === 'iccCmyk') gst.iccCmyk = true;
    }
    function checkPattern(pat, res, depth) {
      pat = R(pat); const d = pat instanceof Stream ? pat.dict : pat; if (!(d instanceof Dict) || seenPat.has(d)) return; seenPat.add(d);
      const t = R(d.get('PatternType'));
      if (t === 1 && pat instanceof Stream) { const own = R(d.get('Resources')); walkContent(decode(pat), own instanceof Dict ? own : null, depth + 1, { inheritedFrom: own instanceof Dict ? null : res, kind: 'pattern' }); }
      else if (t === 2) { checkShading(d.get('Shading'), res); const eg = d.get('ExtGState'); if (eg) checkGS(eg, res); }
    }
    function walkType3(f, res, depth, col) {
      if (f._t3 === undefined) {
        f._t3 = { transp: false };
        const cp = R(f.get('CharProcs')), own = R(f.get('Resources'));
        const before = pageTransp; pageTransp = false;
        if (cp instanceof Dict) for (const [, s] of cp.m) { const ss = R(s); if (ss instanceof Stream) { ss._doc = D; walkContent(decode(ss), own instanceof Dict ? own : null, depth + 1, { kind: 'type3', inheritedFrom: own instanceof Dict ? null : res, col }); } }
        f._t3.transp = pageTransp; pageTransp = before || pageTransp;
      } else if (f._t3.transp) pageTransp = true;
    }
    // uso di un font: codici mostrati e modo di rendering
    function useFont(f, codesBytes, mode, ctx) {
      f = R(f); if (!(f instanceof Dict)) return null;
      let u = fonts.get(f);
      if (!u) { u = { dict: f, render: new Set(), invis: new Set(), all: new Set(), pages: new Set(), pua: false }; fonts.set(f, u); }
      if (where()) u.pages.add(where());
      if (codesBytes) {
        const codes = splitCodes(f, codesBytes);
        for (const c of codes) { u.all.add(c); if (mode === 3) u.invis.add(c); else u.render.add(c); if (ctx && ctx.actual) { (u.withActual ||= new Set()).add(c); } }
      }
      return u;
    }
    const cmapCache = new Map();
    function fontCMap(f) {
      if (cmapCache.has(f)) return cmapCache.get(f);
      let r = null; const enc = R(f.get('Encoding'));
      if (enc instanceof Stream) { enc._doc = D; r = parseCMap(decode(enc)); }
      cmapCache.set(f, r); return r;
    }
    function splitCodes(f, b) {
      const st = nv(R(f.get('Subtype')));
      if (st !== 'Type0') return [...b];
      const enc = R(f.get('Encoding'));
      const cm = enc instanceof Stream ? fontCMap(f) : null;
      const um = enc instanceof Stream ? R(enc.get('UseCMap')) : null;
      const ranges = cm && cm.ranges.length ? cm.ranges : predefRanges(enc instanceof Name ? enc.v : (um instanceof Name ? um.v : null) || cm?.usecmap);
      if (ranges) {
        const out = [];
        for (let i = 0; i < b.length;) {
          let done = false;
          for (let len = 1; len <= 4 && !done; len++) {
            if (i + len > b.length) break;
            let v = 0; for (let k = 0; k < len; k++) v = v * 256 + b[i + k];
            if (ranges.some(r => r.len === len && v >= r.lo && v <= r.hi)) { out.push(v); i += len; done = true; }
          }
          if (!done) { out.push(b[i]); i++; }
        }
        return out;
      }
      const out = []; for (let i = 0; i + 1 < b.length; i += 2) out.push((b[i] << 8) | b[i + 1]); if (b.length % 2) out.push(-1 - b[b.length - 1]); return out;
    }
    // il contenuto: operatori, risorse usate, colori, testo
    function walkContent(bytes, res, depth, ctx = {}) {
      if (depth > 30) return;
      res = R(res);
      const resD = res || R(ctx.inheritedFrom) || null;
      const L = new Lexer(bytes, 0, D.lim);
      let args = [], q = 0, font = null, mode = 0;
      const stack = [];
      // colore corrente: impostato o no (se no, si dipinge con il grigio del dispositivo), ICC CMYK, sovrastampa
      let col = Object.assign({ fill: false, stroke: false, fIcc: false, sIcc: false }, ctx.col || {});
      const fillUse = () => { if (!col.fill) { devUse('gray', resD); col.fill = true; } if (P2 && col.fIcc && gst.op && gst.opm === 1) add('opm', null, where()); };
      const strokeUse = () => { if (!col.stroke) { devUse('gray', resD); col.stroke = true; } if (P2 && col.sIcc && gst.OP && gst.opm === 1) add('opm', null, where()); };
      const mc = [];
      const inh = [];
      const getRes = (cat, n) => { const v = resGet(res, cat, n); if (v === undefined && ctx.inheritedFrom) { const v2 = resGet(ctx.inheritedFrom, cat, n); if (v2 !== undefined) inh.push(n); return v2; } return v; };
      let guard = 0;
      for (;;) {
        if (++guard > 5e6) break;
        let t;
        try { t = L.tok(); } catch (e) { break; }
        if (t === EOFT) break;
        if (t && t.kw !== undefined) {
          const op = t.kw;
          if (op === 'BI') {
            // immagine in linea: dizionario fino a ID, poi i dati fino a EI
            const d = new Dict();
            for (;;) { const k = L.tok(); if (k === EOFT || (k && k.kw === 'ID')) break; if (k instanceof Name) d.m.set(k.v, L.obj()); }
            let j = L.p + 1; const b = bytes;
            while (j < b.length - 1) { if (b[j] === 69 && b[j + 1] === 73 && WS[b[j - 1]] && (j + 2 >= b.length || WS[b[j + 2]])) break; j++; }
            L.p = j + 2;
            checkFilterList(d.get('F') ?? d.get('Filter'), true, where());
            const csv = d.get('CS') ?? d.get('ColorSpace');
            if (csv instanceof Name && !['G', 'RGB', 'CMYK', 'I', 'DeviceGray', 'DeviceRGB', 'DeviceCMYK', 'Indexed'].includes(csv.v)) d.m.set('CS', getRes('ColorSpace', csv.v) ?? csv);
            if (R(d.get('IM') ?? d.get('ImageMask')) === true) fillUse();
            checkImage(d, resD, true);
            args = []; continue;
          }
          if (!OPS.has(op)) { if (op !== 'true' && op !== 'false' && op !== 'null') { add('undefOp', op, where()); args = []; continue; } args.push(op === 'true'); continue; }
          const a0 = args[0], nm0 = a0 instanceof Name ? a0.v : null;
          switch (op) {
            case 'q': q++; if (q > 28) add('qNest', q, where()); stack.push({ font, mode, opm: gst.opm, OP: gst.OP, op: gst.op, col: { ...col } }); break;
            case 'Q': if (q > 0) q--; { const s = stack.pop(); if (s) { font = s.font; mode = s.mode; gst.opm = s.opm; gst.OP = s.OP; gst.op = s.op; col = s.col; } } break;
            case 'rg': devUse('rgb', resD); col.fill = true; col.fIcc = false; break;
            case 'RG': devUse('rgb', resD); col.stroke = true; col.sIcc = false; break;
            case 'g': devUse('gray', resD); col.fill = true; col.fIcc = false; break;
            case 'G': devUse('gray', resD); col.stroke = true; col.sIcc = false; break;
            case 'k': devUse('cmyk', resD); col.fill = true; col.fIcc = false; break;
            case 'K': devUse('cmyk', resD); col.stroke = true; col.sIcc = false; break;
            case 'cs': case 'CS': if (nm0) { const v = ['DeviceRGB', 'DeviceCMYK', 'DeviceGray', 'Pattern'].includes(nm0) ? a0 : getRes('ColorSpace', nm0); const k = checkCS(v ?? a0, resD); if (op === 'cs') { col.fill = true; col.fIcc = k === 'iccCmyk'; } else { col.stroke = true; col.sIcc = k === 'iccCmyk'; } } break;
            case 'sc': case 'scn': case 'SC': case 'SCN': { const fill = op === 'sc' || op === 'scn'; if (fill ? !col.fill : !col.stroke) { devUse('gray', resD); if (fill) col.fill = true; else col.stroke = true; } const last = args[args.length - 1]; if (last instanceof Name) { const p = getRes('Pattern', last.v); if (p) checkPattern(p, resD, depth); } break; }
            case 'f': case 'F': case 'f*': fillUse(); break;
            case 'S': case 's': strokeUse(); break;
            case 'B': case 'B*': case 'b': case 'b*': fillUse(); strokeUse(); break;
            case 'gs': if (nm0) { const g = getRes('ExtGState', nm0); if (g !== undefined) checkGS(g, resD); } break;
            case 'ri': if (nm0) checkRI(nm0); break;
            case 'sh': if (nm0) { const s = getRes('Shading', nm0); if (s) checkShading(s, resD); } break;
            case 'Do': if (nm0) { const x = R(getRes('XObject', nm0)); if (x instanceof Stream && nv(R(x.get('Subtype'))) === 'Image' && R(x.get('ImageMask')) === true) fillUse(); if (x) checkXObject(x, resD, depth, col); } break;
            case 'Tf': if (nm0) { font = getRes('Font', nm0) ?? null; useFont(font, null, mode); } break;
            case 'Tr': if (typeof a0 === 'number') mode = a0; break;
            case 'Tj': case "'": case '"': case 'TJ': {
              if (!font) break;
              if ([0, 2, 4, 6].includes(mode)) fillUse();
              if ([1, 2, 5, 6].includes(mode)) strokeUse();
              { const fd = R(font); if (fd instanceof Dict && nv(R(fd.get('Subtype'))) === 'Type3') walkType3(fd, resD, depth, col); }
              const items = op === 'TJ' ? (Array.isArray(a0) ? a0 : []) : [args[args.length - 1]];
              const actual = mc.some(m => m.actual);
              for (const it of items) if (it instanceof Str) useFont(font, it.b, mode, { actual });
              break;
            }
            case 'BDC': case 'DP': {
              const pr = args[1]; let pd = pr instanceof Name ? getRes('Properties', pr.v) : pr; pd = R(pd);
              if (op === 'BDC') { const mcid = pd instanceof Dict ? R(pd.get('MCID')) : null; mc.push({ actual: pd instanceof Dict && (pd.has('ActualText') || (typeof mcid === 'number' && !!mcidActual.get(curPage)?.has(mcid))) }); }
              if (level === 'A' && pd instanceof Dict) { const lg = R(pd.get('Lang')); if (lg instanceof Str) checkLang(textStr(lg)); }
              if (P1 && nm0 === 'OC') add('oc', null, where());
              break;
            }
            case 'BMC': mc.push({ actual: false }); break;
            case 'EMC': mc.pop(); break;
          }
          args = [];
          continue;
        }
        // operando
        L.p = L.p; let v;
        if (t === '[' || t === '<<') { try { v = L.obj(t); } catch (e) { v = null; } }
        else if (t && t.num !== undefined) v = t.num;
        else if (t instanceof Name || t instanceof Str) v = t;
        else v = null;
        args.push(v);
        if (args.length > 64) args.shift();
      }
      if (inh.length && P2) add('inheritRes', [...new Set(inh)].slice(0, 5).join(', '), where());
    }

    { const collectAF = (d) => { const af = R(d && d.get && d.get('AF')); if (Array.isArray(af)) af.forEach(x => { const v = R(x); if (v instanceof Dict) afSet.add(v); }); }; collectAF(root); pages.forEach(p => collectAF(p.dict)); for (const [n] of D.xref) { const o = D.cache.get(n); if (o instanceof Dict && o.has('AF')) collectAF(o); if (o instanceof Stream && o.has('AF')) collectAF(o.dict); } }
    // livello A: contenuti marcati che nella struttura hanno un testo alternativo (ActualText)
    const mcidActual = new Map(); let curPage = null;
    if (level === 'A') {
      const str = R(root.get('StructTreeRoot')); const seenSE = new Set();
      const mark = (pg, mcid) => { if (!(pg instanceof Dict) || typeof mcid !== 'number') return; let st = mcidActual.get(pg); if (!st) mcidActual.set(pg, st = new Set()); st.add(mcid); };
      const walkSE = (k, pg, act, d = 0) => {
        if (d > 300) return; const kr = R(k);
        if (typeof kr === 'number') { if (act) mark(pg, kr); return; }
        if (Array.isArray(kr)) { kr.forEach(x => walkSE(x, pg, act, d + 1)); return; }
        if (!(kr instanceof Dict) || seenSE.has(kr)) return; seenSE.add(kr);
        const t = nv(R(kr.get('Type')));
        if (t === 'MCR') { if (act) mark(R(kr.get('Pg')) || pg, R(kr.get('MCID'))); return; }
        if (t === 'OBJR') return;
        walkSE(kr.get('K'), R(kr.get('Pg')) || pg, act || kr.has('ActualText'), d + 1);
      };
      if (str instanceof Dict) walkSE(str.get('K'), null, false);
    }
    const pageList = pages.slice(0, 5000);
    let annotSeen = new Set();
    for (const [i, pg] of pageList.entries()) {
      pageNo = i + 1; pageTransp = false; D.lim.where = where();
      const pd = pg.dict; curPage = pd;
      if (P2) {
        for (const k of ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) {
          const v = R(k === 'MediaBox' ? pg.MediaBox : k === 'CropBox' ? pg.CropBox : pd.get(k)); if (!Array.isArray(v) || v.length < 4) continue;
          const [a, b, c, d] = v.map(R).map(Number); const w = Math.abs(c - a), h = Math.abs(d - b);
          if (w < 3 || h < 3 || w > 14400 || h > 14400) add('pageBox', `${k} ${Math.round(w)}×${Math.round(h)}`, where());
        }
        if (pd.has('AA')) add('pageAA', null, where());
      }
      { const aa = R(pd.get('AA')); if (aa instanceof Dict) for (const [, v] of aa.m) checkAction(v, where());
        if (pd.has('PresSteps')) add('presSteps', null, where());
      }
      const res = R(pg.Resources);
      const grp = R(pd.get('Group'));
      if (grp instanceof Dict && nv(R(grp.get('S'))) === 'Transparency') { if (P1) add('group', 'pagina', where()); else if (grp.has('CS')) checkCS(grp.get('CS'), res); }
      const cont = R(pd.get('Contents'));
      const parts = Array.isArray(cont) ? cont.map(R) : [cont];
      const chunks = parts.filter(s => s instanceof Stream).map(s => { s._doc = D; return decode(s); });
      let tot = 0; chunks.forEach(c => tot += c.length + 1); const all = new Uint8Array(tot); let o = 0; chunks.forEach(c => { all.set(c, o); o += c.length; all[o++] = 10; });
      walkContent(all, pd.has('Resources') ? res : null, 0, { kind: 'page', inheritedFrom: pd.has('Resources') ? null : res });
      // annotazioni
      const annots = R(pd.get('Annots'));
      for (const ar of Array.isArray(annots) ? annots : []) {
        const a = R(ar); if (!(a instanceof Dict) || annotSeen.has(a)) continue; annotSeen.add(a);
        checkAnnot(a, res);
      }
      if (P2 && pageTransp && !gOutputCS && !(grp instanceof Dict && grp.has('CS'))) add('transpCS', null, where());
      if (i % 20 === 19) await yieldNow();
    }
    pageNo = 0; D.lim.where = null;

    function checkAnnot(a, res) {
      const st = nv(R(a.get('Subtype')));
      if (!(P1 ? ANN1 : ANN2).has(st)) add('annotType', st || '?', where());
      const F = R(a.get('F'));
      if (P1) {
        const CA = R(a.get('CA')); if (typeof CA === 'number' && CA !== 1) add('annotCA', CA, where());
        if (typeof F !== 'number' || (F & 4) !== 4 || (F & 1) || (F & 2) || (F & 32)) add('annotF', st, where());
        if ((a.has('C') || a.has('IC')) && gOutputCS !== 'RGB ') add('annotC', st, where());
      } else {
        if (st !== 'Popup' && F == null) add('annotF', st, where());
        if (typeof F === 'number' && ((F & 1) || (F & 2) || (F & 4) !== 4 || (F & 32) || (F & 256))) add('annotFlags', st, where());
        const rect = R(a.get('Rect')); const rr = Array.isArray(rect) ? rect.map(R).map(Number) : null;
        const zero = rr && rr[0] === rr[2] && rr[1] === rr[3];
        if (!zero && st !== 'Popup' && st !== 'Link' && !a.has('AP')) add('annotAP', st, where());
        const CA = R(a.get('CA')); if (typeof CA === 'number' && CA < 1) pageTransp = true;
      }
      const ap = R(a.get('AP'));
      if (ap instanceof Dict) {
        if (ap.keys().some(k => k !== 'N')) add('annotAPN', st, where());
        else {
          const N = R(ap.get('N'));
          let ft = nv(R(a.get('FT'))); let par = R(a.get('Parent')); let k = 0; while (!ft && par instanceof Dict && k++ < 20) { ft = nv(R(par.get('FT'))); par = R(par.get('Parent')); }
          if (st === 'Widget' && ft === 'Btn') { if (!(N instanceof Dict) || N instanceof Stream || !N.size) add('annotBtn', null, where()); }
          else if (!(N instanceof Stream)) add('annotNStream', st, where());
        }
        // il contenuto degli aspetti
        for (const k of ['N', 'R', 'D']) {
          const v = R(ap.get(k));
          if (v instanceof Stream) checkXObject(v, res, 1);
          else if (v instanceof Dict) for (const [, s] of v.m) { const ss = R(s); if (ss instanceof Stream) checkXObject(ss, res, 1); }
        }
      }
      if (a.has('A')) { if (st === 'Widget') add('widgetA', null, where()); else checkAction(a.get('A'), where()); }
      if (st === 'Widget' && a.has('AA')) add('widgetAA', null, where());
      else { const aa = R(a.get('AA')); if (aa instanceof Dict) for (const [, v] of aa.m) checkAction(v, where()); }
      if (st === 'FileAttachment' || a.has('FS')) { const fs = R(a.get('FS')); if (fs instanceof Dict) checkFileSpec(fs); }
    }

    /* --- moduli --- */
    const acro = R(root.get('AcroForm'));
    if (acro instanceof Dict) {
      if (R(acro.get('NeedAppearances')) === true) add('needApp');
      if (P2 && acro.has('XFA')) add('xfa');
      const seenF = new Set();
      const walkF = (f, d = 0) => {
        f = R(f); if (!(f instanceof Dict) || seenF.has(f) || d > 40) return; seenF.add(f);
        if (f.has('AA')) add('fieldAA');
        if (P1 && f.has('A') && (nv(R(f.get('Subtype'))) === 'Widget' || !f.has('Kids'))) { }
        const kids = R(f.get('Kids'));
        if (Array.isArray(kids) && kids.length) kids.forEach(k => walkF(k, d + 1));
        else if (P1 && !f.has('AP')) add('fieldAP');
        // firme digitali
        if (P2 && nv(R(f.get('FT'))) === 'Sig') {
          const v = R(f.get('V'));
          if (v instanceof Dict) { const br = R(v.get('ByteRange')); if (Array.isArray(br) && br.length === 4) { const [a0, a1, a2, a3] = br.map(R); const cont = v.get('Contents'); if (a0 !== 0 || a2 + a3 !== bytes.length && a2 + a3 !== bytes.length - 1 && a2 + a3 !== bytes.length - 2) add('sigRange'); } }
        }
      };
      const fl = R(acro.get('Fields')); if (Array.isArray(fl)) fl.forEach(f => walkF(f));
    }

    /* --- font --- */
    for (const [f, u] of fonts) { try { checkFont(f, u); } catch (e) { } }
    function checkFont(f, u) {
      const fw = [...u.pages][0] || null;
      const type = nv(R(f.get('Type'))), st = nv(R(f.get('Subtype'))), base = nv(R(f.get('BaseFont')));
      if (type !== 'Font') add('fontType', base, fw);
      if (!['Type1', 'MMType1', 'TrueType', 'Type3', 'Type0', 'CIDFontType0', 'CIDFontType2'].includes(st)) { add('fontSub', st, fw); return; }
      if (st !== 'Type3' && !base) add('fontBase', null, fw);
      if (P2 && base && R(f.get('BaseFont')) instanceof Name) unicodeName(R(f.get('BaseFont')));
      const rendered = u.render.size > 0;
      if (st === 'Type3') { checkType3(f, u, fw); return; }
      if (st === 'Type0') { checkType0(f, u, fw); return; }
      // font semplice
      const fd = R(f.get('FontDescriptor'));
      const prog = fd instanceof Dict ? (R(fd.get('FontFile')) || R(fd.get('FontFile2')) || R(fd.get('FontFile3'))) : null;
      const embedded = prog instanceof Stream;
      const isStd = STD14.has(base) && !embedded;
      if (!isStd) {
        if (!f.has('FirstChar')) add('fontFirst', base, fw);
        if (!f.has('LastChar')) add('fontLast', base, fw);
        const W = R(f.get('Widths')), fc = R(f.get('FirstChar')), lc = R(f.get('LastChar'));
        if (!Array.isArray(W) || W.length !== lc - fc + 1) add('fontWidths', base, fw);
      }
      if (!embedded) { if (rendered) add('fontEmb', base, fw); return; }
      prog._doc = D;
      const ff3 = fd.get('FontFile3') ? R(fd.get('FontFile3')) : null;
      const sub3 = ff3 instanceof Stream ? nv(R(ff3.get('Subtype'))) : null;
      if (sub3 != null && !(sub3 === 'Type1C' || sub3 === 'CIDFontType0C' || (P2 && sub3 === 'OpenType'))) add('fontFileSub', sub3, fw);
      const subset = /^[A-Z]{6}\+/.test(base || '');
      const flags = R(fd.get('Flags')) || 0, symbolic = !!(flags & 4);
      const data = decode(prog);
      let prg = null;
      if (fd.get('FontFile2')) prg = parseTT(data);
      else if (fd.get('FontFile')) prg = parseT1(data, R(prog.get('Length1')), R(prog.get('Length2')));
      else if (ff3) prg = sub3 === 'OpenType' ? (() => { const tt = parseTT(data); if (tt && tt.t['CFF ']) { const c = parseCFF(data.subarray(tt.t['CFF '].o, tt.t['CFF '].o + tt.t['CFF '].l)); return c; } return tt; })() : parseCFF(data);
      // TrueType: codifica e cmap
      if (st === 'TrueType') {
        const enc = R(f.get('Encoding'));
        if (!symbolic) {
          const en = enc instanceof Name ? enc.v : enc instanceof Dict ? nv(R(enc.get('BaseEncoding'))) : null;
          const diffs = enc instanceof Dict && enc.has('Differences');
          const diffOk = () => { const df = R(enc.get('Differences')); return Array.isArray(df) && df.map(R).every(x => !(x instanceof Name) || uniOfName(x.v) != null || x.v === '.notdef'); };
          if (!(en === 'MacRomanEncoding' || en === 'WinAnsiEncoding') || (diffs && (P1 || !diffOk()))) add('ttEnc', base, fw);
          if (P2 && prg && prg.kind !== 'cff') { const n = prg.nCmaps || 0; const has30 = !!prg.cmaps?.['3,0']; if (has30 ? n <= 1 : n <= 0) add('ttCmapNS', base, fw); }
        } else {
          if (enc != null) add('ttSymEnc', base, fw);
          if (prg && prg.cmaps) { const n = prg.nCmaps || 0; if (P1 ? n !== 1 : !(n === 1 || prg.cmaps['3,0'])) add('ttCmap', base, fw); }
        }
      }
      // glifi e larghezze
      if (!prg) return;
      const W = R(f.get('Widths')), fc = R(f.get('FirstChar')) ?? 0;
      const mw = R(fd.get('MissingWidth')) ?? 0;
      const enc = R(f.get('Encoding'));
      const diff = new Map();
      if (enc instanceof Dict) { const df = R(enc.get('Differences')); let c = 0; if (Array.isArray(df)) for (const x of df.map(R)) { if (typeof x === 'number') c = x; else if (x instanceof Name) diff.set(c++, x.v); } }
      const baseEnc = enc instanceof Name ? enc.v : enc instanceof Dict ? nv(R(enc.get('BaseEncoding'))) : null;
      const encTable = baseEnc === 'WinAnsiEncoding' ? ENC.win : baseEnc === 'MacRomanEncoding' ? ENC.mac : baseEnc === 'StandardEncoding' ? ENC.std : null;
      const nameOf = (c) => {
        if (diff.has(c)) return diff.get(c);
        if (encTable) return encTable[c] || null;
        if (prg.kind === 't1') { if (prg.enc === 'std') return ENC.std[c] || null; if (prg.enc instanceof Map) return prg.enc.get(c) || null; return symbolic ? null : ENC.std[c] || null; }
        return symbolic ? null : ENC.std[c] || null;
      };
      const toU = toUnicodeOf(f);
      const usedNames = new Set();
      for (const c of u.all) {
        const isR = u.render.has(c);
        let present = null, progW = null, gname = null;
        if (prg.kind === 't1') { gname = nameOf(c); present = gname != null && prg.names.has(gname); if (present) progW = prg.widths.get(gname) ?? null; if (gname == null) gname = '.notdef'; }
        else if (prg.kind === 'cff') {
          let g = null;
          gname = nameOf(c);
          if (gname != null && prg.nameToGid.has(gname)) g = prg.nameToGid.get(gname);
          else if ((gname == null || !diff.has(c)) && prg.enc && prg.enc.has(c) && (symbolic || !encTable)) { g = prg.enc.get(c); gname = prg.glyphNames[g]; }
          present = g != null && g > 0; if (present) progW = prg.width(g);
          if (gname == null) gname = '.notdef';
        } else if (prg.cmaps) {
          let g = 0; const cm = prg.cmaps;
          if (symbolic || (!cm['3,1'] && !cm['1,0'])) { const c30 = cm['3,0']; if (c30) g = c30.get(c) || c30.get(0xF000 + c) || c30.get(0xF100 + c) || c30.get(0xF200 + c) || 0; if (!g && cm['1,0']) g = cm['1,0'].get(c) || 0; if (!g && cm['3,1']) g = cm['3,1'].get(c) || 0; }
          else {
            const gn = nameOf(c);
            if (cm['3,1']) { const uv = uniOfName(gn); if (uv != null) g = cm['3,1'].get(uv) || 0; }
            if (!g && cm['1,0']) { const mc = gn ? ENC.mac.indexOf(gn) : -1; if (mc >= 0) g = cm['1,0'].get(mc) || 0; }
            if (!g && gn && prg.names?.has(gn)) g = prg.names.get(gn);
            if (!g && !cm['3,1'] && !cm['1,0'] && cm['3,0']) g = cm['3,0'].get(c) || cm['3,0'].get(0xF000 + c) || 0;
          }
          present = g > 0 && g < prg.numGlyphs;
          if (present) progW = prg.adv(g);
          gname = present ? 'g' + g : '.notdef';
        }
        if (isR && present === false) add('glyph', `${base}: codice ${c}`, fw);
        if (P2 && gname === '.notdef') add('notdef', `${base}: codice ${c}`, fw);
        if (isR && present && progW != null) {
          const dw = Array.isArray(W) && c - fc >= 0 && c - fc < W.length ? R(W[c - fc]) : mw;
          if (typeof dw === 'number' && Math.abs(dw - progW) > 1) add('width', `${base}: codice ${c} (${Math.round(dw)} invece di ${Math.round(progW)})`, fw);
        }
        if (unicodeLevel) checkUni(f, u, c, toU, () => { const gn = gname && gname !== '.notdef' && !/^g\d+$/.test(gname) ? gname : nameOf(c); const uv = uniOfName(gn); return uv != null ? String.fromCodePoint(uv) : null; }, base, fw);
        if (present && gname && !/^g\d+$/.test(gname)) usedNames.add(gname);
      }
      // CharSet dei Type1 ridotti: in PDF/A-1 deve elencare almeno i glifi usati, in PDF/A-2 tutti quelli del font
      if ((st === 'Type1' || st === 'MMType1') && subset && prg && (prg.kind === 't1' || prg.kind === 'cff')) {
        const cs = R(fd.get('CharSet'));
        const progNames = prg.kind === 't1' ? [...prg.names] : prg.glyphNames.filter(Boolean);
        if (cs == null) { if (P1) add('charset', base, fw); }
        else {
          const list = new Set((cs instanceof Str ? latin1(cs.b) : '').split('/').map(s => s.trim()).filter(Boolean));
          const need = P1 ? [...usedNames] : progNames;
          if (!need.filter(n => n && n !== '.notdef').every(n => list.has(n))) add('charset', base, fw);
        }
      }
    }
    function toUnicodeOf(f) { const t = R(f.get('ToUnicode')); if (t instanceof Stream) { t._doc = D; try { return parseCMap(decode(t)); } catch (e) { } } return null; }
    function checkUni(f, u, c, toU, fallback, base, fw) {
      let s = toU ? toU.uni.get(c) : undefined;
      if (s === undefined || s === '') { const fb = fallback(); if (fb == null) { add('toUni', `${base}: codice ${c}`, fw); return; } s = fb; }
      if (/[\u0000﻿￾]/.test(s)) add('toUniBad', `${base}: codice ${c}`, fw);
      if (level === 'A' && P2 && /[-]/.test(s) && !(u.withActual && u.withActual.has(c))) add('pua', `${base}: codice ${c}`, fw);
    }
    function checkType3(f, u, fw) {
      const cp = R(f.get('CharProcs')); const res = R(f.get('Resources'));
      const enc = R(f.get('Encoding')); const diff = new Map();
      if (enc instanceof Dict) { const df = R(enc.get('Differences')); let c = 0; if (Array.isArray(df)) for (const x of df.map(R)) { if (typeof x === 'number') c = x; else if (x instanceof Name) diff.set(c++, x.v); } }
      if (!f.has('FirstChar')) add('fontFirst', 'Type3', fw);
      if (!f.has('LastChar')) add('fontLast', 'Type3', fw);
      const W = R(f.get('Widths')), fc = R(f.get('FirstChar')), lc = R(f.get('LastChar'));
      if (!Array.isArray(W) || W.length !== lc - fc + 1) add('fontWidths', 'Type3', fw);
      if (f._t3 === undefined) walkType3(f, null, 1, null);
      const toU = unicodeLevel ? toUnicodeOf(f) : null;
      for (const c of u.all) {
        const gn = diff.get(c);
        const present = gn != null && cp instanceof Dict && cp.has(gn);
        if (u.render.has(c) && !present) add('glyph', `Type3: codice ${c}`, fw);
        if (u.render.has(c) && present && Array.isArray(W) && c - fc >= 0 && c - fc < W.length) {
          const ps = R(cp.get(gn)); if (ps instanceof Stream) { ps._doc = D; const L = new Lexer(decode(ps)); const nums = []; for (let k = 0; k < 12; k++) { const t = L.tok(); if (t === EOFT) break; if (t && t.num !== undefined) nums.push(t.num); else { if (t && (t.kw === 'd0' || t.kw === 'd1')) { const wx = nums[t.kw === 'd0' ? nums.length - 2 : nums.length - 6]; const dw = R(W[c - fc]); if (typeof wx === 'number' && typeof dw === 'number' && Math.abs(wx - dw) > 1) add('width', `Type3: codice ${c} (${dw} invece di ${wx})`, fw); } break; } } }
        }
        if (P2 && (gn == null || gn === '.notdef')) add('notdef', `Type3: codice ${c}`, fw);
        if (unicodeLevel) checkUni(f, u, c, toU, () => { const uv = uniOfName(gn); return uv != null ? String.fromCodePoint(uv) : null; }, 'Type3', fw);
      }
    }
    function checkType0(f, u, fw) {
      const base = nv(R(f.get('BaseFont')));
      const encO = R(f.get('Encoding'));
      const cmapName = encO instanceof Name ? encO.v : encO instanceof Stream ? (nv(R(encO.get('CMapName'))) || fontCMap(f)?.name) : null;
      const df = R(f.get('DescendantFonts')); const cf = Array.isArray(df) ? R(df[0]) : null;
      if (!(cf instanceof Dict)) return;
      const cst = nv(R(cf.get('Subtype')));
      if (nv(R(cf.get('Type'))) !== 'Font') add('fontType', base, fw);
      if (!['CIDFontType0', 'CIDFontType2'].includes(cst)) add('fontSub', cst, fw);
      // CMap
      if (encO instanceof Name) {
        if (!(P1 ? ['Identity-H', 'Identity-V'].includes(encO.v) : PREDEF_CMAPS.has(encO.v))) add('cmapEmb', encO.v, fw);
      } else if (encO instanceof Stream) {
        const cm = fontCMap(f);
        const dw = R(encO.get('WMode'));
        if (cm && (dw ?? 0) !== (cm.wmode ?? 0) && (dw != null || cm.wmode != null)) add('cmapWMode', null, fw);
        const um = R(encO.get('UseCMap'));
        const refName = um instanceof Name ? um.v : um instanceof Stream ? (nv(R(um.get('CMapName'))) || (um._doc = D, parseCMap(decode(um)).name)) : cm?.usecmap || null;
        if (P2 && refName && !PREDEF_CMAPS.has(refName)) add('cmapRef', refName, fw);
        if (cm) for (const r of cm.cid) if (r[2] + (r[1] - r[0]) > 65535) { add('cidMax', r[2] + (r[1] - r[0]), fw); break; }
      }
      // CIDSystemInfo
      if (cmapName !== 'Identity-H' && cmapName !== 'Identity-V') {
        const si = R(cf.get('CIDSystemInfo'));
        const reg = si instanceof Dict ? textStr(R(si.get('Registry'))) : null, ord = si instanceof Dict ? textStr(R(si.get('Ordering'))) : null, sup = si instanceof Dict ? R(si.get('Supplement')) : null;
        let cReg = null, cOrd = null, cSup = null;
        if (encO instanceof Stream) { const s2 = R(encO.get('CIDSystemInfo')); if (s2 instanceof Dict) { cReg = textStr(R(s2.get('Registry'))); cOrd = textStr(R(s2.get('Ordering'))); cSup = R(s2.get('Supplement')); } else { const cm = fontCMap(f); cReg = cm?.reg; cOrd = cm?.ord; cSup = cm?.sup; } }
        else if (encO instanceof Name) { cReg = 'Adobe'; cOrd = cmapOrdering(encO.v); cSup = sup; }
        if (!(ord != null && ord === cOrd && reg != null && reg === cReg && (P1 || (sup != null && cSup != null && sup <= cSup)))) add('cidSysInfo', base, fw);
      }
      const fd = R(cf.get('FontDescriptor'));
      const prog = fd instanceof Dict ? (R(fd.get('FontFile2')) || R(fd.get('FontFile3')) || R(fd.get('FontFile'))) : null;
      const embedded = prog instanceof Stream;
      if (P2 && cf.get('BaseFont') && R(cf.get('BaseFont')) instanceof Name) unicodeName(R(cf.get('BaseFont')));
      { const c2 = R(cf.get('CIDToGIDMap')); if (cst === 'CIDFontType2' && (P1 ? u.render.size > 0 : embedded) && !(c2 instanceof Stream || isName(c2, 'Identity'))) add('cidToGid', base, fw); }
      if (!embedded) { if (u.render.size) add('fontEmb', base, fw); return; }
      prog._doc = D;
      const ff3 = R(fd.get('FontFile3')); const sub3 = ff3 instanceof Stream ? nv(R(ff3.get('Subtype'))) : null;
      if (sub3 != null && !(sub3 === 'Type1C' || sub3 === 'CIDFontType0C' || (P2 && sub3 === 'OpenType'))) add('fontFileSub', sub3, fw);
      const data = decode(prog);
      let prg = null;
      if (fd.get('FontFile2')) prg = parseTT(data);
      else if (ff3 instanceof Stream) { if (sub3 === 'OpenType') { const tt = parseTT(data); prg = tt && tt.t['CFF '] ? parseCFF(data.subarray(tt.t['CFF '].o, tt.t['CFF '].o + tt.t['CFF '].l)) : tt; } else prg = parseCFF(data); }
      // codice → CID
      const cm = encO instanceof Stream ? fontCMap(f) : null;
      const toCid = (code) => { if (!cm) return (cmapName === 'Identity-H' || cmapName === 'Identity-V') ? code : null; for (const r of cm.cid) if (code >= r[0] && code <= r[1]) return r[2] + code - r[0]; return 0; };
      const c2g = R(cf.get('CIDToGIDMap')); const mapB = c2g instanceof Stream ? (c2g._doc = D, decode(c2g)) : null;
      const gidOf = (cid) => {
        if (!prg) return null;
        if (prg.kind === 'cff') { if (prg.cid) return prg.cidToGid.has(cid) ? prg.cidToGid.get(cid) : 0; return cid < prg.n ? cid : 0; }
        if (mapB) return cid * 2 + 1 < mapB.length ? (mapB[cid * 2] << 8) | mapB[cid * 2 + 1] : 0;
        return cid;
      };
      const presentGid = (g) => { if (g == null) return null; if (!prg) return null; if (prg.kind === 'cff') return g > 0 && g < prg.n; return g > 0 && g < prg.numGlyphs; };
      // CIDSet
      const subset = /^[A-Z]{6}\+/.test(base || '') || /^[A-Z]{6}\+/.test(nv(R(cf.get('BaseFont'))) || '');
      if (subset && prg) {
        const cs = R(fd.get('CIDSet'));
        if (!(cs instanceof Stream)) { if (P1) add('cidset', base, fw); }
        else {
          cs._doc = D; const bits = decode(cs);
          const inSet = cid => (bits[cid >> 3] >> (7 - (cid & 7))) & 1;
          let ok = true;
          if (prg.kind === 'cff' && prg.cid) { for (const cid of prg.cidToGid.keys()) if (cid && !inSet(cid)) { ok = false; break; } }
          else if (prg.kind === 'cff') { for (let g = 1; g < prg.n; g++) if (!inSet(g)) { ok = false; break; } }
          else if (mapB) { for (let cid = 1; cid * 2 + 1 < mapB.length; cid++) { const g = (mapB[cid * 2] << 8) | mapB[cid * 2 + 1]; if (g && g < prg.numGlyphs && !inSet(cid)) { ok = false; break; } } }
          else { for (let g = 1; g < prg.numGlyphs; g++) if (!inSet(g) && (!prg.glyphLen || prg.glyphLen(g) > 0)) { ok = false; break; } }
          // e nessun CID dichiarato che il font non ha
          if (ok) for (let cid = 1; cid < bits.length * 8; cid++) if (inSet(cid)) { const g = gidOf(cid); if (!presentGid(g)) { ok = false; break; } }
          if (!ok) add('cidset', base, fw);
        }
      }
      // glifi e larghezze
      const dwv = R(cf.get('DW')) ?? 1000; const Wm = new Map(); const warr = R(cf.get('W'));
      if (Array.isArray(warr)) { const a = warr.map(R); for (let k = 0; k < a.length;) { const c0 = a[k]; if (Array.isArray(R(a[k + 1]))) { R(a[k + 1]).map(R).forEach((x, j) => Wm.set(c0 + j, x)); k += 2; } else { const c1 = a[k + 1], w = a[k + 2]; for (let c = c0; c <= c1 && c - c0 < 70000; c++) Wm.set(c, w); k += 3; } } }
      const toU = unicodeLevel ? toUnicodeOf(f) : null;
      const ordering = (() => { const si = R(cf.get('CIDSystemInfo')); return si instanceof Dict ? textStr(R(si.get('Ordering'))) : null; })();
      for (const code of u.all) {
        if (code < 0) { if (u.render.has(code)) add('glyph', `${base}: codice incompleto`, fw); if (P2) add('notdef', `${base}: codice incompleto`, fw); continue; }
        const cid = toCid(code);
        if (cid != null && cid > 65535) add('cidMax', cid, fw);
        const g = cid == null ? null : gidOf(cid);
        const present = presentGid(g);
        if (u.render.has(code) && present === false) add('glyph', `${base}: CID ${cid}`, fw);
        if (P2 && present === false) add('notdef', `${base}: CID ${cid}`, fw);
        if (u.render.has(code) && present && prg) {
          const pw = prg.kind === 'cff' ? prg.width(g) : prg.adv(g);
          const dw = Wm.has(cid) ? Wm.get(cid) : dwv;
          if (pw != null && typeof dw === 'number' && Math.abs(pw - dw) > 1) add('width', `${base}: CID ${cid} (${Math.round(dw)} invece di ${Math.round(pw)})`, fw);
        }
        if (unicodeLevel) checkUni(f, u, code, toU, () => (['GB1', 'CNS1', 'Japan1', 'Korea1'].includes(ordering) && cmapName && cmapName !== 'Identity-H' && cmapName !== 'Identity-V') ? 'x' : null, base, fw);
      }
    }

    /* --- allegati --- */
    function checkFileSpec(fs) {
      if (efSeen.has(fs)) return; efSeen.add(fs);
      if (!fs.has('EF')) return;
      if (P1) { add('ef'); return; }
      if (!(fs.has('F') && fs.has('UF'))) add('efFUF');
      const ef = R(fs.get('EF')); const s = ef instanceof Dict ? R(ef.get('F')) || R(ef.get('UF')) : null;
      if (part === 2) {
        if (s instanceof Stream) { s._doc = D; const eb = decode(s); const c = claim(eb); if (!c || (c.part !== 1 && c.part !== 2)) add('efPdfa', nameOfFs(fs)); }
      } else {
        const sub = s instanceof Stream ? R(s.get('Subtype')) : null;
        if (!(sub instanceof Name) || !/^[-\w+.]+\/[-\w+.]+$/.test(sub.v)) add('efMime', nameOfFs(fs));
        if (!fs.has('AFRelationship')) add('efAFRel', nameOfFs(fs));
        if (!afSet.has(fs)) add('efAssoc', nameOfFs(fs));
      }
    }
    if (names instanceof Dict) {
      const ef = R(names.get('EmbeddedFiles'));
      const walkN = (n, d = 0) => { n = R(n); if (!(n instanceof Dict) || d > 30) return; const arr = R(n.get('Names')); if (Array.isArray(arr)) for (let i = 1; i < arr.length; i += 2) { const v = R(arr[i]); if (v instanceof Dict) checkFileSpec(v); } const kids = R(n.get('Kids')); if (Array.isArray(kids)) kids.forEach(k => walkN(k, d + 1)); };
      if (ef) walkN(ef);
    }
    for (const [n] of D.xref) { const o = D.cache.get(n); if (o instanceof Dict && (nv(R(o.get('Type'))) === 'Filespec' || o.has('EF'))) checkFileSpec(o); }

    /* --- metadati --- */
    if (!(metaS instanceof Stream)) add('metaMissing');
    else {
      if (P1 && metaS.has('Filter')) add('metaFilter');
      if (!X.ok) add('xmpSyntax', X.err);
      else {
        if (X.bytesAttr) add('xmpBytes'); if (X.encAttr) add('xmpEncAttr');
        if (P2 && X.enc !== 'UTF-8') add('xmpUtf8', X.enc);
        // identificazione PDF/A
        if (!X.part) add('pdfaid');
        else {
          if (X.part !== part) add('pdfaidPart', `dichiarata ${X.partRaw}, verificata ${part}`);
          const confs = P1 ? ['A', 'B'] : ['A', 'B', 'U'];
          if (!confs.includes(X.conf) || (level === 'A' && X.conf !== 'A') || (level === 'U' && !['U', 'A'].includes(X.conf))) add('pdfaidConf', X.conf || 'assente');
          for (const k of ['partPfx', 'confPfx', 'amdPfx', 'corrPfx']) if (X[k] != null && X[k] !== 'pdfaid') add('pdfaidPfx', X[k]);
        }
        checkXmpProps(X);
        // proprietà del documento ↔ XMP (PDF/A-1)
        if (P1) checkInfo(X);
      }
    }
    // altri metadati (immagini, pagine…)
    if (P2) for (const [n] of D.xref) { const o = D.cache.get(n); if (o instanceof Stream && o !== metaS && nv(R(o.get('Type'))) === 'Metadata') { o._doc = D; const x = readXmp(decode(o)); if (!x.ok) add('xmpSyntax', 'metadati di un oggetto'); else { if (x.bytesAttr) add('xmpBytes'); if (x.encAttr) add('xmpEncAttr'); if (x.enc !== 'UTF-8') add('xmpUtf8', x.enc); } } }

    function checkXmpProps(X) {
      // schemi di estensione presenti
      const defined = new Map();
      customTypes.clear();
      const extP = X.props.filter(p => p.ns === NS.pdfaExtension);
      for (const p of extP) {
        if (p.local !== 'schemas' || p.pfx !== 'pdfaExtension') { add('extSchema', 'contenitore'); continue; }
        const bag = p.el && kidsEl(p.el)[0];
        if (!bag || qn(bag).ns !== NS.rdf || qn(bag).local !== 'Bag') { add('extSchema', 'contenitore non è un Bag'); continue; }
        for (const li of kidsEl(bag)) {
          const fieldsOf = (el) => { const out = {}; const ks = el.attrs['rdf:parseType'] === 'Resource' ? kidsEl(el) : (() => { const d = kidsEl(el).find(k => qn(k).local === 'Description'); return d ? [...kidsEl(d), ...Object.entries(d.attrs).filter(([k]) => !k.startsWith('xmlns') && !k.startsWith('rdf:')).map(([k, v]) => ({ name: k, attrs: {}, kids: [{ text: v }], ns: d.ns }))] : []; })(); for (const k of ks) { const q = qn(k); (out[q.local] ||= []).push({ q, el: k }); } return out; };
          const fs = fieldsOf(li);
          const need = { schema: 'pdfaSchema', namespaceURI: 'pdfaSchema', prefix: 'pdfaSchema' };
          let bad = false;
          for (const [k, pf] of Object.entries(need)) { const f = fs[k]?.[0]; if (!f || f.q.ns !== NS[pf] || f.q.pfx !== pf || kidsEl(f.el).length) bad = true; }
          for (const [k, arr] of Object.entries(fs)) { if (!['schema', 'namespaceURI', 'prefix', 'property', 'valueType'].includes(k) || arr.some(f => f.q.ns !== NS.pdfaSchema || f.q.pfx !== 'pdfaSchema')) bad = true; }
          const nsU = fs.namespaceURI?.[0] ? textOf(fs.namespaceURI[0].el).trim() : null;
          const props = new Map();
          const vtDefined = customTypes, fieldTypes = [];
          const seqItems = (f) => { if (!f) return []; const sq = kidsEl(f.el)[0]; if (!sq || qn(sq).local !== 'Seq' || qn(sq).ns !== NS.rdf) { bad = true; return []; } return kidsEl(sq); };
          for (const vt of seqItems(fs.valueType?.[0])) {
            const vf = fieldsOf(vt);
            for (const [k, arr] of Object.entries(vf)) if (!['type', 'namespaceURI', 'prefix', 'description', 'field'].includes(k) || arr.some(x => x.q.ns !== NS.pdfaType || x.q.pfx !== 'pdfaType')) bad = true;
            for (const k of ['type', 'namespaceURI', 'prefix', 'description']) if (!vf[k]) bad = true;
            const fields = new Set();
            for (const fl of seqItems(vf.field?.[0])) { const ff = fieldsOf(fl); for (const [k, arr] of Object.entries(ff)) if (!['name', 'valueType', 'description'].includes(k) || arr.some(x => x.q.ns !== NS.pdfaField || x.q.pfx !== 'pdfaField')) bad = true; for (const k of ['name', 'valueType', 'description']) if (!ff[k]) bad = true; if (ff.valueType) fieldTypes.push(textOf(ff.valueType[0].el).trim()); if (ff.name) fields.add(textOf(ff.name[0].el).trim()); }
            if (vf.type) vtDefined.set(textOf(vf.type[0].el).trim(), { ns: vf.namespaceURI ? textOf(vf.namespaceURI[0].el).trim() : null, fields });
          }
          for (const pr of seqItems(fs.property?.[0])) {
            const pf = fieldsOf(pr);
            for (const [k, arr] of Object.entries(pf)) if (!['name', 'valueType', 'category', 'description'].includes(k) || arr.some(x => x.q.ns !== NS.pdfaProperty || x.q.pfx !== 'pdfaProperty')) bad = true;
            for (const k of ['name', 'valueType', 'category', 'description']) if (!pf[k]) bad = true;
            const cat = pf.category ? textOf(pf.category[0].el).trim() : null; if (cat && cat !== 'internal' && cat !== 'external') bad = true;
            const vtN = pf.valueType ? textOf(pf.valueType[0].el).trim() : null;
            if (vtN && !knownType(vtN) && !vtDefined.has(vtN) && !vtDefined.has(vtN.replace(/^(seq|bag|alt|Seq|Bag|Alt|Lang Alt)\s+/, ''))) bad = true;
            if (pf.name) props.set(textOf(pf.name[0].el).trim(), vtN);
          }
          if (fieldTypes.some(t => !knownType(t) && !vtDefined.has(t) && !vtDefined.has(t.replace(/^(seq|bag|alt)\s+/i, '')))) bad = true;
          if (bad) add('extSchema', nsU || '');
          if (nsU) { const m = defined.get(nsU) || new Map(); props.forEach((v, k) => m.set(k, v)); defined.set(nsU, m); }
        }
      }
      const pre = PREDEF[P1 ? 1 : 2];
      for (const p of X.props) {
        if (p.ns === NS.pdfaExtension) continue;
        const m = pre.get(p.ns), ext = defined.get(p.ns);
        const ty = m && m.has(p.local) ? m.get(p.local) : ext && ext.has(p.local) ? normType(ext.get(p.local)) : undefined;
        if (ty === undefined) { add('xmpProp', `${p.pfx ? p.pfx + ':' : ''}${p.local}`); continue; }
        if (ty && !typeOk(p, ty)) add('xmpType', `${p.pfx}:${p.local}`);
      }
    }
    function knownType(t) { return !!normType(t) || /^(ProperName|AgentName|Locale|MIMEType|URI|URL|RenditionClass|XPath|GUID|ResourceEvent|ResourceRef|Version|Thumbnail|Dimensions|Font|Colorant|Job|Flash|OECF\/SFR|CFAPattern|DeviceSettings|GPSCoordinate|Rational|Lang Alt|Choice|Open Choice|Closed Choice|open choice|closed choice)$/i.test(t) || /^(seq|bag|alt)\s+/i.test(t) || /choice of/i.test(t); }
    // tipo dichiarato in uno schema di estensione → tipo verificabile (null = non si controlla)
    function normType(t) {
      if (!t) return null; t = t.trim();
      if (customTypes.has(t)) return 'Custom:' + t;
      const c = /^(seq|bag|alt)\s+(.+)$/i.exec(t); if (c) { const inner = normType(c[2]); return inner ? c[1][0].toUpperCase() + c[1].slice(1).toLowerCase() + ' ' + inner : null; }
      if (/^lang ?alt$/i.test(t)) return 'LangAlt';
      if (/^(text|propername|agentname|locale|mimetype|uri|url|renditionclass|xpath|guid)$/i.test(t)) return 'Text';
      if (/^integer$/i.test(t)) return 'Integer'; if (/^real$/i.test(t)) return 'Real'; if (/^boolean$/i.test(t)) return 'Boolean'; if (/^date$/i.test(t)) return 'Date';
      if (/^rational$/i.test(t)) return 'Rational';
      return null;
    }
    // il valore di una proprietà: testo, contenitore (Bag/Seq/Alt) o struttura; i qualificatori (rdf:value) contano come valore
    function shape(el) {
      if (el.attrs['rdf:resource'] != null) return { k: 'text', v: el.attrs['rdf:resource'] };
      const ks = kidsEl(el);
      if (el.attrs['rdf:parseType'] === 'Resource') { const v = ks.find(k => qn(k).ns === NS.rdf && qn(k).local === 'value'); return v ? shape(v) : { k: 'struct' }; }
      const otherAttrs = Object.keys(el.attrs).filter(a => !a.startsWith('xmlns') && a !== 'xml:lang' && !a.startsWith('rdf:'));
      if (!ks.length) return otherAttrs.length ? { k: 'struct' } : { k: 'text', v: textOf(el).trim() };
      if (ks.length === 1) {
        const q = qn(ks[0]);
        if (q.ns === NS.rdf && ['Bag', 'Seq', 'Alt'].includes(q.local)) return { k: q.local, items: kidsEl(ks[0]) };
        if (q.ns === NS.rdf && q.local === 'Description') { const v = kidsEl(ks[0]).find(k => qn(k).ns === NS.rdf && qn(k).local === 'value'); return v ? shape(v) : { k: 'struct' }; }
      }
      return { k: 'struct' };
    }
    function typeOkEl(el, ty) {
      const sh = shape(el);
      const c = /^(Bag|Seq|Alt) (.+)$/.exec(ty);
      if (c) return sh.k === c[1] && sh.items.every(li => typeOkEl(li, c[2]));
      if (ty === 'LangAlt') return sh.k === 'Alt' && sh.items.every(li => li.attrs['xml:lang'] != null && shape(li).k === 'text');
      if (ty === 'Struct') return sh.k === 'struct';
      if (ty.startsWith('Custom:')) {
        const ct = customTypes.get(ty.slice(7)); if (!ct) return true;
        if (sh.k === 'text') return ct.fields.size === 0;
        if (sh.k !== 'struct') return false;
        const d = el.attrs['rdf:parseType'] === 'Resource' ? el : kidsEl(el).find(k => qn(k).ns === NS.rdf && qn(k).local === 'Description') || el;
        const fl = kidsEl(d).map(k => qn(k)).concat(Object.keys(d.attrs).filter(a => !a.startsWith('xmlns') && !a.startsWith('rdf:') && a !== 'xml:lang').map(a => qn(d, a)));
        return fl.every(q => q.ns === ct.ns && ct.fields.has(q.local));
      }
      return sh.k === 'text' && (SIMPLE[ty] ? SIMPLE[ty](sh.v) : true);
    }
    function typeOk(p, ty) {
      if (p.attr) return /^(Text|Integer|Real|Boolean|Date|Rational|GPS)$/.test(ty) && (SIMPLE[ty] ? SIMPLE[ty](p.value) : true);
      return typeOkEl(p.el, ty);
    }
    function checkInfo(X) {
      const info = R(D.trailers[0]?.get('Info'));
      if (!(info instanceof Dict)) return;
      const iv = k => { if (!info.has(k)) return null; const v = R(info.get(k)); return v instanceof Str ? textStr(v) : v == null ? null : '\u0000' + String(v); };
      const xv = (ns, l, mode) => { const p = X.get(ns, l); if (!p) return null; if (p.attr) return p.value; const ks = kidsEl(p.el); if (!ks.length) return textOf(p.el); const c = ks[0]; const lis = kidsEl(c); if (mode === 'lang') { const d = lis.find(li => li.attrs['xml:lang'] === 'x-default') || null; return d ? textOf(d) : null; } if (mode === 'seq') return lis.map(textOf); return lis.length ? textOf(lis[0]) : textOf(p.el); };
      const t = iv('Title'); if (t != null && t !== xv(NS.dc, 'title', 'lang')) add('infoTitle');
      const a = iv('Author'); if (a != null) { const cr = xv(NS.dc, 'creator', 'seq'); if (!Array.isArray(cr) || cr.length !== 1 || cr[0] !== a) add('infoAuthor'); }
      const s = iv('Subject'); if (s != null && s !== xv(NS.dc, 'description', 'lang')) add('infoSubject');
      const kw = iv('Keywords'); if (kw != null && kw !== xv(NS.pdf, 'Keywords')) add('infoKeywords');
      const c = iv('Creator'); if (c != null && c !== xv(NS.xmp, 'CreatorTool')) add('infoCreator');
      const pr = iv('Producer'); if (pr != null && pr !== xv(NS.pdf, 'Producer')) add('infoProducer');
      const cd = iv('CreationDate'); if (cd != null && !sameDate(cd, xv(NS.xmp, 'CreateDate'))) add('infoDate');
      const md = iv('ModDate'); if (md != null && !sameDate(md, xv(NS.xmp, 'ModifyDate'))) add('infoModDate');
    }
    function sameDate(pdfD, xmpD) {
      if (xmpD == null) return false;
      const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+\-])?(\d{2})?'?(\d{2})?'?/.exec(pdfD.trim()); if (!m) return false;
      const x = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/.exec(xmpD.trim()); if (!x) return false;
      const tz1 = m[7] ? (m[7] === 'Z' || m[7] === 'z' ? 0 : (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0))) : null;
      const tz2 = x[7] ? (x[7] === 'Z' ? 0 : (x[7][0] === '-' ? -1 : 1) * (+x[7].slice(1, 3) * 60 + +x[7].slice(4, 6))) : null;
      if ((tz1 == null) !== (tz2 == null)) return false;
      const t1 = Date.UTC(+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0, +m[6] || 0) - (tz1 || 0) * 60000;
      const t2 = Date.UTC(+x[1], (+x[2] || 1) - 1, +x[3] || 1, +x[4] || 0, +x[5] || 0, +x[6] || 0) - (tz2 || 0) * 60000;
      return t1 === t2;
    }

    /* --- livello A: struttura logica --- */
    if (level === 'A') {
      const mi = R(root.get('MarkInfo'));
      if (!(mi instanceof Dict) || R(mi.get('Marked')) !== true) add('marked');
      const str = R(root.get('StructTreeRoot'));
      if (!(str instanceof Dict)) add('structRoot');
      else {
        const rm = R(str.get('RoleMap'));
        const role = rm instanceof Dict ? rm : new Dict();
        const types = new Set(); const seenS = new Set();
        const walkS = (e, d = 0) => { e = R(e); if (d > 200 || seenS.has(e)) return; if (Array.isArray(e)) { e.forEach(x => walkS(x, d + 1)); return; } if (!(e instanceof Dict)) return; seenS.add(e); const s = R(e.get('S')); if (s instanceof Name) { types.add(s.v); if (P2) unicodeName(s); } const lg = R(e.get('Lang')); if (lg instanceof Str) checkLang(textStr(lg)); walkS(e.get('K'), d + 1); };
        walkS(str.get('K'));
        for (const t of types) {
          if (STD_STRUCT.has(t)) { if (P2 && role.has(t)) add('roleStd', t); continue; }
          let cur = t, k = 0; const path = new Set([t]); let ok = false, circ = false;
          while (k++ < 50) { const nx = R(role.get(cur)); if (!(nx instanceof Name)) break; if (path.has(nx.v)) { circ = true; break; } path.add(nx.v); if (STD_STRUCT.has(nx.v)) { ok = true; break; } cur = nx.v; }
          if (circ) add('roleCirc', t); else if (!ok) add('roleMap', t);
        }
      }
      const lg = R(root.get('Lang')); if (lg instanceof Str) checkLang(textStr(lg));
    }
    function checkLang(s) { if (s !== '' && !(P1 ? /^[a-zA-Z]{1,8}(-[a-zA-Z]{1,8})*$/ : /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/).test(s)) add('lang', s); }

    // limiti incontrati leggendo il contenuto
    for (const [k, list] of Object.entries(D.lim.hits)) if (RULES[k]) list.forEach(x => add(k, x.v, x.w));
    // colori del dispositivo senza OutputIntent adatto
    const devIssue = (k, set) => set.forEach(p => add(k, null, p || null));
    if (used.rgb.size && gOutputCS !== 'RGB ') devIssue('rgb', used.rgb);
    if (used.cmyk.size && gOutputCS !== 'CMYK') devIssue('cmyk', used.cmyk);
    if (used.gray.size && !gOutputCS) devIssue('gray', used.gray);

    return finish({});

    function finish(extra) {
      const list = [...issues.values()].filter(it => RULES[it.key] && RULES[it.key][part === 1 ? 0 : 1] !== null).map(it => {
        const r = RULES[it.key];
        return { key: it.key, clause: r[part === 1 ? 0 : 1], cat: r[2], catLabel: CAT[r[2]], text: r[3], n: it.n, details: it.details, pages: [...it.pages].sort((a, b) => a - b) };
      });
      const order = Object.keys(CAT);
      list.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.clause.localeCompare(b.clause, 'en', { numeric: true }));
      return {
        part, level, profile: `PDF/A-${part}${level.toLowerCase()}`,
        declared: declared ? `PDF/A-${declared.part}${(declared.level || '').toLowerCase()}` : null, declaredPart: declared?.part ?? null, declaredLevel: declared?.level ?? null,
        valid: !extra.fatal && list.length === 0, fatal: extra.fatal || null,
        issues: list, pages: pages ? pages.length : 0,
      };
    }
  }
  function textStr(s) {
    if (!(s instanceof Str)) return s == null ? null : String(s);
    const b = s.b;
    if (b[0] === 0xFE && b[1] === 0xFF) { let o = ''; for (let i = 2; i + 1 < b.length; i += 2) o += String.fromCharCode((b[i] << 8) | b[i + 1]); return o; }
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) { try { return new TextDecoder('utf-8').decode(b.subarray(3)); } catch (e) { } }
    let o = ''; for (const c of b) o += PDFDOC[c] ?? String.fromCharCode(c); return o;
  }
  const PDFDOC = { 0x18: '˘', 0x19: 'ˇ', 0x1a: 'ˆ', 0x1b: '˙', 0x1c: '˝', 0x1d: '˛', 0x1e: '˚', 0x1f: '˜', 0x80: '•', 0x81: '†', 0x82: '‡', 0x83: '…', 0x84: '—', 0x85: '–', 0x86: 'ƒ', 0x87: '⁄', 0x88: '‹', 0x89: '›', 0x8a: '−', 0x8b: '‰', 0x8c: '„', 0x8d: '“', 0x8e: '”', 0x8f: '‘', 0x90: '’', 0x91: '‚', 0x92: '™', 0x93: 'ﬁ', 0x94: 'ﬂ', 0x95: 'Ł', 0x96: 'Œ', 0x97: 'Š', 0x98: 'Ÿ', 0x99: 'Ž', 0x9a: 'ı', 0x9b: 'ł', 0x9c: 'œ', 0x9d: 'š', 0x9e: 'ž', 0xa0: '€' };

  return { check, claim, RULES, CAT };
})();

/* =====================================================================
   Conversione PDF/A-1b / PDF/A-2b
   - pagine conformi: copiate e sanate (vettoriali, testo originale)
   - pagine non conformi: ricostruite (immagine + testo invisibile ricercabile)
   ===================================================================== */