/* =====================================================================
   FattureKit — il motore di «Fatture XML» v2.5 integrato in file360.
   File generato da tools/make_fatture_engine.py: non modificarlo a mano.
   Lettura (XML, P7M anche a lunghezza indefinita, ZIP, PDF nel layout del
   foglio di stile o con l'XML incorporato), tabelle dei codici, layout
   Standard (fedele al foglio di stile dell'Agenzia) ed Esteso, nomi dei file,
   esplosione in righe di prestazione. Il layout Esteso esce con il marchio di
   Officina (Manrope, colori, intestazione) grazie a BrandPDF.
   ===================================================================== */
const FattureKit = (() => {
  /* =========================================================================
     1. MOTORE PDF — scrittura nativa, font base14, codifica WinAnsi
     ========================================================================= */
  const MM = 72 / 25.4;
  const fmt = n => (Math.round(n * 100) / 100).toString();

  const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

  const W_EXTRA = {128:556,130:222,131:556,132:333,133:1000,134:556,135:556,136:333,137:1000,138:667,139:333,140:1000,142:611,145:222,146:222,147:333,148:333,149:350,150:556,151:1000,152:333,153:1000,154:500,155:333,156:889,158:500,159:667,160:278,161:333,162:556,163:556,164:556,165:556,166:260,167:556,168:333,169:737,170:370,171:556,172:584,173:333,174:737,175:333,176:400,177:584,178:333,179:333,180:333,181:556,182:537,183:278,184:333,185:333,186:365,187:556,188:834,189:834,190:834,191:611,198:1000,199:722,208:722,209:722,215:584,216:778,221:667,222:667,223:611,230:889,231:500,240:556,241:556,247:584,248:556,253:500,254:556,255:500};
  for (let c = 192; c <= 197; c++) W_EXTRA[c] = 667;
  for (let c = 200; c <= 203; c++) W_EXTRA[c] = 667;
  for (let c = 204; c <= 207; c++) W_EXTRA[c] = 278;
  for (let c = 210; c <= 214; c++) W_EXTRA[c] = 778;
  for (let c = 217; c <= 220; c++) W_EXTRA[c] = 722;
  for (let c = 224; c <= 229; c++) W_EXTRA[c] = 556;
  for (let c = 232; c <= 235; c++) W_EXTRA[c] = 556;
  for (let c = 236; c <= 239; c++) W_EXTRA[c] = 278;
  for (let c = 242; c <= 246; c++) W_EXTRA[c] = 556;
  for (let c = 249; c <= 252; c++) W_EXTRA[c] = 556;

  const UNI2WIN = {0x20AC:128,0x201A:130,0x0192:131,0x201E:132,0x2026:133,0x2020:134,0x2021:135,0x02C6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017D:142,0x2010:45,0x2011:45,0x2212:45,0x2018:145,0x2019:146,0x201C:147,0x201D:148,0x2022:149,0x2013:150,0x2014:151,0x02DC:152,0x2122:153,0x0161:154,0x203A:155,0x0153:156,0x017E:158,0x0178:159};

  function winByte(cp){
    if (cp < 0x100) return cp;
    const m = UNI2WIN[cp];
    return m === undefined ? 63 : m;
  }
  function toWin(s){
    let o = "";
    for (const ch of String(s)) {
      const b = winByte(ch.codePointAt(0));
      o += String.fromCharCode(b === 10 || b === 13 || b === 9 ? 32 : b);
    }
    return o;
  }
  function charW(b, bold){
    if (b >= 32 && b <= 126) return (bold ? W_BOLD : W_REG)[b - 32];
    const e = W_EXTRA[b];
    return e === undefined ? 556 : e;
  }
  /* larghezza in millimetri di una stringa già codificata */
  function widthMM(win, size, bold){
    let t = 0;
    for (let i = 0; i < win.length; i++) t += charW(win.charCodeAt(i), bold);
    return (t * size / 1000) / MM;
  }
  function escPdf(s){
    return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  class PDF {
    constructor(opt){
      opt = opt || {};
      this.W = 210; this.H = 297;
      this.top = opt.top || 11;
      this.bottom = opt.bottom || 14;
      this.left = opt.left || 10;
      this.right = opt.right || 10;
      this.pages = [];
      this.addPage();
    }
    get innerW(){ return this.W - this.left - this.right; }
    addPage(){
      this.ops = [];
      this.pages.push(this.ops);
      this.y = this.top;
      return this.ops;
    }
    /* garantisce spazio verticale, altrimenti apre una pagina nuova */
    ensure(h){
      if (this.y + h > this.H - this.bottom) { this.addPage(); return true; }
      return false;
    }
    rgb(hex){
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16 & 255) / 255).toFixed(3) + " " + ((n >> 8 & 255) / 255).toFixed(3) + " " + ((n & 255) / 255).toFixed(3);
    }
    rect(x, y, w, h, o){
      o = o || {};
      const X = fmt(x * MM), Y = fmt((this.H - y - h) * MM), Wd = fmt(w * MM), Ht = fmt(h * MM);
      if (o.fill) this.ops.push(this.rgb(o.fill) + " rg " + X + " " + Y + " " + Wd + " " + Ht + " re f");
      if (o.stroke) this.ops.push(this.rgb(o.stroke) + " RG " + fmt((o.lw || 0.2) * MM) + " w " + X + " " + Y + " " + Wd + " " + Ht + " re S");
    }
    line(x1, y1, x2, y2, o){
      o = o || {};
      this.ops.push(this.rgb(o.color || "#000000") + " RG " + fmt((o.lw || 0.2) * MM) + " w " +
        fmt(x1 * MM) + " " + fmt((this.H - y1) * MM) + " m " + fmt(x2 * MM) + " " + fmt((this.H - y2) * MM) + " l S");
    }
    /* y è il bordo superiore della riga di testo */
    text(x, y, s, o){
      o = o || {};
      const size = o.size || 8, bold = !!o.bold;
      let win = toWin(s == null ? "" : s);
      if (!win) return 0;
      if (o.max) win = this.clip(win, o.max, size, bold);
      const w = widthMM(win, size, bold);
      let X = x;
      if (o.align === "right") X = x - w;
      else if (o.align === "center") X = x - w / 2;
      const base = y + (size * 0.79) / MM;
      this.ops.push("BT " + this.rgb(o.color || "#0E0E0E") + " rg /F" + (bold ? 2 : 1) + " " + size +
        " Tf " + fmt(X * MM) + " " + fmt((this.H - base) * MM) + " Td (" + escPdf(win) + ") Tj ET");
      return w;
    }
    clip(win, maxMM, size, bold){
      if (widthMM(win, size, bold) <= maxMM) return win;
      let out = win;
      while (out.length > 1 && widthMM(out + "\u2026", size, bold) > maxMM) out = out.slice(0, -1);
      return out + toWin("\u2026");
    }
    /* manda a capo su larghezza massima, rispettando le parole */
    wrap(s, maxMM, size, bold){
      const win = toWin(s == null ? "" : s);
      if (!win) return [""];
      const words = win.split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = "";
      for (let w of words) {
        while (widthMM(w, size, bold) > maxMM && w.length > 1) {
          let part = w;
          while (part.length > 1 && widthMM(part, size, bold) > maxMM) part = part.slice(0, -1);
          lines.push(part);
          w = w.slice(part.length);
        }
        const t = cur ? cur + " " + w : w;
        if (widthMM(t, size, bold) > maxMM && cur) { lines.push(cur); cur = w; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    }
    /* scrive più righe già codificate, restituisce l'altezza usata */
    textLines(x, y, lines, o){
      o = o || {};
      const size = o.size || 8, lh = o.lh || (size * 1.22) / MM;
      lines.forEach((ln, i) => this.text(x, y + i * lh, ln, o));
      return lines.length * lh;
    }
    output(){
      const objs = [];
      const n = this.pages.length;
      const kids = [];
      for (let i = 0; i < n; i++) kids.push((5 + i * 2) + " 0 R");
      objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
      objs[2] = "<< /Type /Pages /Count " + n + " /Kids [" + kids.join(" ") + "] >>";
      objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
      objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
      for (let i = 0; i < n; i++) {
        const pid = 5 + i * 2, cid = 6 + i * 2;
        objs[pid] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + cid + " 0 R >>";
        const c = this.pages[i].join("\n");
        objs[cid] = "<< /Length " + c.length + " >>\nstream\n" + c + "\nendstream";
      }
      let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
      const off = [];
      for (let i = 1; i < objs.length; i++) {
        off[i] = out.length;
        out += i + " 0 obj\n" + objs[i] + "\nendobj\n";
      }
      const xref = out.length;
      let x = "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
      for (let i = 1; i < objs.length; i++) x += String(off[i]).padStart(10, "0") + " 00000 n \n";
      out += x + "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    }
  }

  /* =========================================================================
     2. ARCHIVI ZIP — scrittura (store) e lettura (store + deflate nativo)
     ========================================================================= */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf){
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosStamp(d){
    const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time, date };
  }
  function zipCreate(files){
    const enc = new TextEncoder();
    const st = dosStamp(new Date());
    const parts = [], central = [];
    let offset = 0, total = 0;
    for (const f of files) {
      const nm = enc.encode(f.name);
      const crc = crc32(f.data), sz = f.data.length;
      const lh = new Uint8Array(30 + nm.length);
      const a = new DataView(lh.buffer);
      a.setUint32(0, 0x04034b50, true); a.setUint16(4, 20, true); a.setUint16(6, 0x0800, true);
      a.setUint16(8, 0, true); a.setUint16(10, st.time, true); a.setUint16(12, st.date, true);
      a.setUint32(14, crc, true); a.setUint32(18, sz, true); a.setUint32(22, sz, true);
      a.setUint16(26, nm.length, true); a.setUint16(28, 0, true);
      lh.set(nm, 30);
      const cd = new Uint8Array(46 + nm.length);
      const b = new DataView(cd.buffer);
      b.setUint32(0, 0x02014b50, true); b.setUint16(4, 20, true); b.setUint16(6, 20, true);
      b.setUint16(8, 0x0800, true); b.setUint16(10, 0, true);
      b.setUint16(12, st.time, true); b.setUint16(14, st.date, true);
      b.setUint32(16, crc, true); b.setUint32(20, sz, true); b.setUint32(24, sz, true);
      b.setUint16(28, nm.length, true); b.setUint32(42, offset, true);
      cd.set(nm, 46);
      parts.push(lh, f.data); central.push(cd);
      offset += lh.length + sz; total += lh.length + sz;
    }
    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const eocd = new Uint8Array(22);
    const e = new DataView(eocd.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, total, true);
    const all = new Uint8Array(total + cdSize + 22);
    let p = 0;
    for (const c of parts) { all.set(c, p); p += c.length; }
    for (const c of central) { all.set(c, p); p += c.length; }
    all.set(eocd, p);
    return all;
  }
  async function inflateRaw(bytes){
    if (typeof DecompressionStream === "undefined") throw new Error("Il browser non sa decomprimere lo ZIP");
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function zipRead(buf){
    const u = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Archivio ZIP non leggibile");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder("utf-8"), dec2 = new TextDecoder("windows-1252");
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const nameB = u.subarray(p + 46, p + 46 + nlen);
      const name = (flags & 0x0800) ? dec.decode(nameB) : dec2.decode(nameB);
      p += 46 + nlen + elen + clen;
      if (name.endsWith("/")) continue;
      const lnlen = dv.getUint16(lo + 26, true), lelen = dv.getUint16(lo + 28, true);
      const start = lo + 30 + lnlen + lelen;
      const raw = u.subarray(start, start + csize);
      out.push({ name, method, raw });
    }
    const files = [];
    for (const f of out) {
      try {
        files.push({ name: f.name, data: f.method === 0 ? f.raw.slice() : await inflateRaw(f.raw) });
      } catch (e) { /* voce illeggibile: la salta e prosegue */ }
    }
    return files;
  }
  /* =========================================================================
     3. LETTURA DEI FILE — estrazione XML anche da firma CAdES (.p7m)
     ========================================================================= */
  function latin1(bytes){
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return s;
  }
  const RE_OPEN = /<([A-Za-z0-9_.\-]+:)?FatturaElettronica(Semplificata)?[\s>]/;
  const RE_CLOSE = /<\/([A-Za-z0-9_.\-]+:)?FatturaElettronica(Semplificata)?>/g;

  /* --- lettura della busta CAdES (PKCS#7 / CMS) ---
     Le firme prodotte da alcuni certificatori usano lunghezze indefinite e
     spezzano il documento in segmenti da 1000 byte, ciascuno preceduto da
     quattro byte di intestazione. Estrarre il testo "a occhio" produce quindi
     un XML corrotto: bisogna percorrere la struttura ASN.1 e ricucire i pezzi. */
  function berNodo(u, i, limite){
    if (i >= limite) return null;
    const tag = u[i];
    let j = i + 1;
    if ((tag & 0x1f) === 0x1f) { while (j < limite && (u[j] & 0x80)) j++; j++; }
    if (j >= limite) return null;
    let l = u[j]; j++;
    let cs, ce, next;
    if (l === 0x80) {                       /* lunghezza indefinita: cerco l'EOC */
      cs = j;
      let k = j;
      while (k < limite - 1) {
        if (u[k] === 0x00 && u[k + 1] === 0x00) break;
        const n = berNodo(u, k, limite);
        if (!n || n.next <= k) { k = limite - 1; break; }
        k = n.next;
      }
      ce = k; next = k + 2;
    } else if (l & 0x80) {
      const n = l & 0x7f;
      if (n > 4 || j + n > limite) return null;
      let len = 0;
      for (let k = 0; k < n; k++) len = len * 256 + u[j + k];
      j += n; cs = j; ce = Math.min(j + len, limite); next = ce;
    } else { cs = j; ce = Math.min(j + l, limite); next = ce; }
    return { tag, costruito: !!(tag & 0x20), cs, ce, next };
  }
  function berFigli(u, start, end){
    const out = [];
    let i = start;
    while (i < end - 1) {
      if (u[i] === 0x00 && u[i + 1] === 0x00) break;
      const n = berNodo(u, i, end);
      if (!n || n.next <= i) break;
      out.push(n);
      i = n.next;
    }
    return out;
  }
  function estraiCms(u){
    try {
      const top = berNodo(u, 0, u.length);
      if (!top || !top.costruito) return null;
      const ctx = berFigli(u, top.cs, top.ce).find(n => (n.tag & 0xC0) === 0x80 && n.costruito);
      if (!ctx) return null;
      const sd = berFigli(u, ctx.cs, ctx.ce)[0];
      if (!sd) return null;
      const eci = berFigli(u, sd.cs, sd.ce).find(n => (n.tag & 0x1f) === 0x10 && n.costruito);
      if (!eci) return null;
      const cont = berFigli(u, eci.cs, eci.ce).find(n => (n.tag & 0xC0) === 0x80 && n.costruito);
      if (!cont) return null;
      const oct = berFigli(u, cont.cs, cont.ce)[0];
      if (!oct) return null;
      if (!oct.costruito) return u.subarray(oct.cs, oct.ce);
      const segs = berFigli(u, oct.cs, oct.ce);      /* documento spezzettato */
      let tot = 0;
      segs.forEach(x => { tot += x.ce - x.cs; });
      const out = new Uint8Array(tot);
      let p = 0;
      segs.forEach(x => { out.set(u.subarray(x.cs, x.ce), p); p += x.ce - x.cs; });
      return out;
    } catch (e) { return null; }
  }
  function testoXml(u){
    if (!u || !u.length) return null;
    const t = new TextDecoder("utf-8").decode(u).replace(/^\uFEFF/, "").trim();
    return RE_OPEN.test(t.slice(0, 400000)) ? t : null;
  }
  function daBase64(u){
    const s = latin1(u).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    if (s.length < 100 || !/^[A-Za-z0-9+/=]+$/.test(s.slice(0, 4000))) return null;
    try {
      const bin = atob(s);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    } catch (e) { return null; }
  }
  /* ritaglio grezzo: usato solo se la struttura della busta non è leggibile */
  function ritaglia(bytes){
    const s = latin1(bytes);
    const m = RE_OPEN.exec(s);
    if (!m) return null;
    let start = m.index;
    const decl = s.lastIndexOf("<?xml", start);
    if (decl >= 0 && start - decl < 400) start = decl;
    RE_CLOSE.lastIndex = 0;
    let end = -1, mc;
    while ((mc = RE_CLOSE.exec(s)) !== null) end = mc.index + mc[0].length;
    if (end < 0) return null;
    return new TextDecoder("utf-8").decode(bytes.subarray(start, end)).replace(/^\uFEFF/, "");
  }
  function xmlValido(t){
    if (!t) return false;
    try {
      const d = new DOMParser().parseFromString(t, "application/xml");
      return !d.getElementsByTagName("parsererror").length && !!d.documentElement &&
        /FatturaElettronica/.test(d.documentElement.localName);
    } catch (e) { return false; }
  }
  /* Provo tutte le strade e tengo la prima che dà un XML davvero ben formato:
     se una busta è malformata, il ritaglio grezzo resta come rete di sicurezza. */
  function carveXml(bytes){
    const cand = [];
    const agg = v => { if (v) cand.push(v); };
    agg(testoXml(estraiCms(bytes)));
    const b64 = daBase64(bytes);
    if (b64) { agg(testoXml(estraiCms(b64))); agg(testoXml(b64)); agg(ritaglia(b64)); }
    agg(testoXml(bytes));
    agg(ritaglia(bytes));
    for (const t of cand) if (xmlValido(t)) return t;
    return cand.length ? cand[0] : null;
  }

  /* =========================================================================
     4. TABELLE DEI CODICI MINISTERIALI
     ========================================================================= */
  const T_DOC = {TD01:"Fattura",TD02:"Acconto/anticipo su fattura",TD03:"Acconto/anticipo su parcella",TD04:"Nota di credito",TD05:"Nota di debito",TD06:"Parcella",TD07:"Fattura semplificata",TD08:"Nota di credito semplificata",TD09:"Nota di debito semplificata",TD10:"Fattura per acquisto intracomunitario beni",TD11:"Fattura per acquisto intracomunitario servizi",TD12:"Documento riepilogativo",TD16:"Integrazione fattura reverse charge interno",TD17:"Integrazione/autofattura acquisto servizi dall'estero",TD18:"Integrazione acquisto beni intracomunitari",TD19:"Integrazione/autofattura acquisto beni ex art.17 c.2",TD20:"Autofattura per regolarizzazione",TD21:"Autofattura per splafonamento",TD22:"Estrazione beni da deposito IVA",TD23:"Estrazione beni da deposito IVA con versamento",TD24:"Fattura differita ex art.21 c.4 lett. a)",TD25:"Fattura differita ex art.21 c.4 terzo periodo lett. b)",TD26:"Cessione di beni ammortizzabili e passaggi interni",TD27:"Fattura per autoconsumo o cessioni gratuite",TD28:"Acquisti da San Marino con IVA (fattura cartacea)"};
  const T_DOC_BREVE = {TD01:"Fattura",TD02:"Acconto",TD03:"Acconto parcella",TD04:"Nota di credito",TD05:"Nota di debito",TD06:"Parcella",TD07:"Fattura semplificata",TD08:"Nota di credito semplificata",TD09:"Nota di debito semplificata",TD10:"Fattura intracomunitaria beni",TD11:"Fattura intracomunitaria servizi",TD12:"Documento riepilogativo",TD16:"Integrazione reverse charge",TD17:"Autofattura servizi estero",TD18:"Integrazione beni UE",TD19:"Autofattura art.17 c.2",TD20:"Autofattura regolarizzazione",TD21:"Autofattura splafonamento",TD22:"Estrazione da deposito IVA",TD23:"Estrazione da deposito IVA",TD24:"Fattura differita",TD25:"Fattura differita",TD26:"Cessione beni ammortizzabili",TD27:"Autoconsumo",TD28:"Acquisti San Marino"};
  const T_NATURA = {N1:"Escluse ex art. 15",N2:"Non soggette","N2.1":"Non soggette ad IVA ex artt. da 7 a 7-septies","N2.2":"Non soggette — altri casi",N3:"Non imponibili","N3.1":"Non imponibili — esportazioni","N3.2":"Non imponibili — cessioni intracomunitarie","N3.3":"Non imponibili — cessioni verso San Marino","N3.4":"Non imponibili — operazioni assimilate alle esportazioni","N3.5":"Non imponibili — a seguito di dichiarazioni d'intento","N3.6":"Non imponibili — altre operazioni che non concorrono al plafond",N4:"Esenti",N5:"Regime del margine / IVA non esposta in fattura",N6:"Inversione contabile","N6.1":"Inversione contabile — cessione di rottami","N6.2":"Inversione contabile — cessione di oro e argento puro","N6.3":"Inversione contabile — subappalto nel settore edile","N6.4":"Inversione contabile — cessione di fabbricati","N6.5":"Inversione contabile — cessione di telefoni cellulari","N6.6":"Inversione contabile — cessione di prodotti elettronici","N6.7":"Inversione contabile — prestazioni comparto edile e settori connessi","N6.8":"Inversione contabile — operazioni settore energetico","N6.9":"Inversione contabile — altri casi",N7:"IVA assolta in altro stato UE"};
  const T_PAG = {MP01:"Contanti",MP02:"Assegno",MP03:"Assegno circolare",MP04:"Contanti presso Tesoreria",MP05:"Bonifico",MP06:"Vaglia cambiario",MP07:"Bollettino bancario",MP08:"Carta di pagamento",MP09:"RID",MP10:"RID utenze",MP11:"RID veloce",MP12:"RIBA",MP13:"MAV",MP14:"Quietanza erario",MP15:"Giroconto su conti di contabilità speciale",MP16:"Domiciliazione bancaria",MP17:"Domiciliazione postale",MP18:"Bollettino di c/c postale",MP19:"SEPA Direct Debit",MP20:"SEPA Direct Debit CORE",MP21:"SEPA Direct Debit B2B",MP22:"Trattenuta su somme già riscosse",MP23:"PagoPA"};
  const T_COND = {TP01:"Pagamento a rate",TP02:"Pagamento completo",TP03:"Anticipo"};
  /* famiglie dei metodi di pagamento: per l'evidenza a colpo d'occhio, i filtri e i riepiloghi */
  const PAG_FAM = {MP01:"contanti",MP04:"contanti",MP08:"carta",MP05:"bonifico",MP15:"bonifico",MP02:"assegno",MP03:"assegno",MP06:"assegno",
    MP09:"addebito",MP10:"addebito",MP11:"addebito",MP16:"addebito",MP17:"addebito",MP19:"addebito",MP20:"addebito",MP21:"addebito",
    MP07:"bollettino",MP12:"bollettino",MP13:"bollettino",MP18:"bollettino",MP23:"bollettino",MP14:"altro",MP22:"altro"};
  const PAG_FAM_NOME = {contanti:"Contanti",carta:"Carta",bonifico:"Bonifico",assegno:"Assegno",addebito:"Addebito diretto",bollettino:"RiBa, MAV, bollettino",altro:"Altro",misto:"Più metodi",nd:"Non indicato"};
  /* trasferimenti in contanti fra soggetti diversi: vietati da 5.000 euro in su (art. 49 d.lgs. 231/2007, dal 2023) */
  const SOGLIA_CONTANTI = 5000;
  const T_REGIME = {RF01:"Ordinario",RF02:"Contribuenti minimi",RF04:"Agricoltura e attività connesse e pesca",RF05:"Vendita sali e tabacchi",RF06:"Commercio dei fiammiferi",RF07:"Editoria",RF08:"Gestione servizi telefonia pubblica",RF09:"Rivendita documenti di trasporto pubblico e di sosta",RF10:"Intrattenimenti e giochi",RF11:"Agenzie viaggi e turismo",RF12:"Agriturismo",RF13:"Vendite a domicilio",RF14:"Rivendita beni usati, oggetti d'arte, d'antiquariato o da collezione",RF15:"Agenzie di vendite all'asta di oggetti d'arte",RF16:"IVA per cassa P.A.",RF17:"IVA per cassa",RF18:"Altro",RF19:"Regime forfettario"};
  const T_RIT = {RT01:"Ritenuta persone fisiche",RT02:"Ritenuta persone giuridiche",RT03:"Contributo INPS",RT04:"Contributo ENASARCO",RT05:"Contributo ENPAM",RT06:"Altro contributo previdenziale"};
  const T_CASSA = {TC01:"Cassa nazionale previdenza e assistenza avvocati e procuratori legali",TC02:"Cassa previdenza dottori commercialisti",TC03:"Cassa previdenza e assistenza geometri",TC04:"Cassa nazionale previdenza e assistenza ingegneri e architetti liberi professionisti",TC05:"Cassa nazionale del notariato",TC06:"Cassa nazionale previdenza e assistenza ragionieri e periti commerciali",TC07:"ENASARCO",TC08:"ENPACL — consulenti del lavoro",TC09:"ENPAM — medici",TC10:"ENPAF — farmacisti",TC11:"ENPAV — veterinari",TC12:"ENPAIA — impiegati agricoltura",TC13:"Fondo previdenza impiegati imprese di spedizione e agenzie marittime",TC14:"INPGI — giornalisti",TC15:"ONAOSI — orfani sanitari italiani",TC16:"CASAGIT — giornalisti",TC17:"EPPI — periti industriali",TC18:"EPAP — psicologi e altri",TC19:"ENPAB — biologi",TC20:"ENPAPI — infermieri",TC21:"ENPAP — psicologi",TC22:"INPS"};
  const T_ESIG = {I:"Immediata",D:"Differita",S:"Scissione dei pagamenti"};
  const T_SM = {SC:"Sconto",MG:"Maggiorazione"};
  const T_CESSIONE = {SC:"sconto",PR:"premio",AB:"abbuono",AC:"spesa accessoria"};
  const T_SOGG = {CC:"cessionario/committente",TZ:"terzo"};
  const T_SU = {SU:"socio unico",SM:"pi\u00f9 soci"};
  const T_LIQ = {LS:"in liquidazione",LN:"non in liquidazione"};

  const decode = (tab, code, prefix) => {
    if (!code) return "";
    const v = tab[code];
    return v ? (prefix === false ? v : code + " — " + v) : code;
  };

  /* =========================================================================
     5. FORMATTAZIONI
     ========================================================================= */
  function nf(v, dec){
    if (v === "" || v == null || isNaN(v)) return "";
    let n = Number(v);
    const neg = n < 0 && Math.abs(n) >= Math.pow(10, -dec) / 2;
    const parti = Math.abs(n).toFixed(dec).split(".");
    const interi = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + interi + (parti[1] ? "," + parti[1] : "");
  }
  const eur = v => nf(v, 2);
  /* quantità e prezzi unitari: da 2 a 5 decimali, senza zeri superflui */
  function decimaliUtili(v, min, max){
    const s = Number(v).toFixed(max).replace(/0+$/, "");
    const i = s.indexOf(".");
    return Math.max(min, i < 0 ? 0 : s.length - i - 1);
  }
  const qty = v => (v === "" || v == null || isNaN(v)) ? "" : nf(v, decimaliUtili(v, 2, 5));
  const price = qty;
  function dt(iso){
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
    return m ? m[3] + "/" + m[2] + "/" + m[1] : iso;
  }
  function dtFile(iso){
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
    return m ? m[3] + "-" + m[2] + "-" + m[1] : iso.replace(/[^\dA-Za-z]/g, "-");
  }
  const dtDash = iso => dt(iso).replace(/\//g, "-");
  const num = s => { const v = parseFloat(s); return isNaN(v) ? null : v; };
  const onlyDigits = s => (s || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

  /* =========================================================================
     6. PARSER FATTURAPA
     ========================================================================= */
  const kid = (n, name) => { if (!n) return null; for (const c of n.children) if (c.localName === name) return c; return null; };
  const kids = (n, name) => n ? Array.from(n.children).filter(c => c.localName === name) : [];
  function deep(n, path){ let c = n; for (const p of path) { c = kid(c, p); if (!c) return null; } return c; }
  function tx(n, ...path){ const e = path.length ? deep(n, path) : n; return e ? e.textContent.trim() : ""; }
  function nx(n, ...path){ return num(tx(n, ...path)); }

  function indirizzo(sede){
    if (!sede) return "";
    const via = [tx(sede, "Indirizzo"), tx(sede, "NumeroCivico")].filter(Boolean).join(", ");
    const citta = [tx(sede, "CAP"), tx(sede, "Comune"), tx(sede, "Provincia") ? "(" + tx(sede, "Provincia") + ")" : ""].filter(Boolean).join(" ");
    return [via, citta, tx(sede, "Nazione")].filter(Boolean).join(" \u2014 ");
  }
  function anagrafica(node){
    if (!node) return null;
    /* la fattura semplificata raccoglie i dati sotto AltriDatiIdentificativi
       e gli identificativi sotto IdentificativiFiscali */
    const alt = kid(node, "AltriDatiIdentificativi");
    const da = kid(node, "DatiAnagrafici") || alt || node;
    const an = kid(da, "Anagrafica") || da;
    const fisc = kid(node, "IdentificativiFiscali") || kid(da, "IdentificativiFiscali") || da;
    const sede = kid(node, "Sede") || (alt ? kid(alt, "Sede") : null);
    const so = kid(node, "StabileOrganizzazione") || (alt ? kid(alt, "StabileOrganizzazione") : null);
    const rf = kid(node, "RappresentanteFiscale") || (alt ? kid(alt, "RappresentanteFiscale") : null);
    const rea = kid(node, "IscrizioneREA");
    const cont = kid(node, "Contatti");
    let nome = tx(an, "Denominazione");
    const cg = tx(an, "Cognome"), nm = tx(an, "Nome"), tt = tx(an, "Titolo");
    const persona = !nome && !!(cg || nm);
    if (!nome) nome = [tt, nm, cg].filter(Boolean).join(" ").trim();
    const idp = tx(fisc, "IdFiscaleIVA", "IdPaese"), idc = tx(fisc, "IdFiscaleIVA", "IdCodice");
    let rappr = "";
    if (rf) {
      const rn = tx(rf, "Denominazione") || tx(rf, "DatiAnagrafici", "Anagrafica", "Denominazione") ||
        [tx(rf, "Nome"), tx(rf, "Cognome"), tx(rf, "DatiAnagrafici", "Anagrafica", "Nome"), tx(rf, "DatiAnagrafici", "Anagrafica", "Cognome")].filter(Boolean).join(" ");
      const rp = (tx(rf, "IdFiscaleIVA", "IdPaese") + tx(rf, "IdFiscaleIVA", "IdCodice")) ||
        (tx(rf, "DatiAnagrafici", "IdFiscaleIVA", "IdPaese") + tx(rf, "DatiAnagrafici", "IdFiscaleIVA", "IdCodice"));
      rappr = [rn, rp].filter(Boolean).join(" \u2014 ");
    }
    const naz = tx(sede, "Nazione");
    return {
      nome: nome || "(anagrafica assente)", persona,
      piva: idc ? (idp || "") + idc : "", pivaRaw: idc,
      cf: tx(fisc, "CodiceFiscale"),
      eori: tx(an, "CodEORI"),
      regime: tx(da, "RegimeFiscale"),
      albo: [tx(da, "AlboProfessionale"),
        tx(da, "ProvinciaAlbo") ? "(" + tx(da, "ProvinciaAlbo") + ")" : "",
        tx(da, "NumeroIscrizioneAlbo") ? "n. " + tx(da, "NumeroIscrizioneAlbo") : "",
        tx(da, "DataIscrizioneAlbo") ? "dal " + dt(tx(da, "DataIscrizioneAlbo")) : ""].filter(Boolean).join(" "),
      via: [tx(sede, "Indirizzo"), tx(sede, "NumeroCivico")].filter(Boolean).join(", "),
      comune: tx(sede, "Comune"), prov: tx(sede, "Provincia"), cap: tx(sede, "CAP"),
      nazAll: naz, naz: naz && naz !== "IT" ? naz : "",
      citta: [tx(sede, "CAP"), tx(sede, "Comune"), tx(sede, "Provincia") ? "(" + tx(sede, "Provincia") + ")" : ""].filter(Boolean).join(" "),
      indirizzo: indirizzo(sede),
      stabile: indirizzo(so),
      rappr: rappr,
      rea: rea ? [tx(rea, "Ufficio"), tx(rea, "NumeroREA")].filter(Boolean).join(" ") : "",
      reaCap: rea ? tx(rea, "CapitaleSociale") : "",
      reaSocio: rea ? tx(rea, "SocioUnico") : "",
      reaLiq: rea ? tx(rea, "StatoLiquidazione") : "",
      tel: cont ? tx(cont, "Telefono") : "",
      fax: cont ? tx(cont, "Fax") : "",
      mail: cont ? tx(cont, "Email") : "",
      rifAmm: tx(node, "RiferimentoAmministrazione")
    };
  }

  function parseFatture(xmlText, srcName){
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("XML non valido o corrotto");
    const root = doc.documentElement;
    if (!root || !/FatturaElettronica/.test(root.localName)) throw new Error("Non è una fattura elettronica");
    const semplificata = /Semplificata/.test(root.localName);
    const head = kid(root, "FatturaElettronicaHeader");
    const dt_ = kid(head, "DatiTrasmissione");
    const trasm = {
      idPaese: tx(dt_, "IdTrasmittente", "IdPaese"),
      idCodice: tx(dt_, "IdTrasmittente", "IdCodice"),
      progressivo: tx(dt_, "ProgressivoInvio"),
      formato: tx(dt_, "FormatoTrasmissione"),
      destinatario: tx(dt_, "CodiceDestinatario"),
      pec: tx(dt_, "PECDestinatario"),
      tel: tx(dt_, "ContattiTrasmittente", "Telefono"),
      mail: tx(dt_, "ContattiTrasmittente", "Email")
    };
    const cedente = anagrafica(kid(head, "CedentePrestatore"));
    const cessionario = anagrafica(kid(head, "CessionarioCommittente"));
    const rappr = anagrafica(kid(head, "RappresentanteFiscale"));
    const terzo = anagrafica(kid(head, "TerzoIntermediarioOSoggettoEmittente"));
    const emittente = tx(head, "SoggettoEmittente");
    const bodies = kids(root, "FatturaElettronicaBody");
    const out = [];
    bodies.forEach((body, i) => {
      out.push(semplificata
        ? bodySemplificata(body, { trasm, cedente, cessionario, rappr, terzo, emittente, semplificata: true, srcName, idx: i, tot: bodies.length })
        : bodyOrdinaria(body, { trasm, cedente, cessionario, rappr, terzo, emittente, semplificata: false, srcName, idx: i, tot: bodies.length }));
    });
    return out;
  }

  function bodyOrdinaria(body, base){
    const dg = kid(body, "DatiGenerali");
    const g = kid(dg, "DatiGeneraliDocumento");
    const bs = kid(body, "DatiBeniServizi");
    const inv = Object.assign({}, base);
    inv.tipo = tx(g, "TipoDocumento");
    inv.divisa = tx(g, "Divisa") || "EUR";
    inv.data = tx(g, "Data");
    inv.numero = tx(g, "Numero");
    inv.totale = nx(g, "ImportoTotaleDocumento");
    inv.arrotondamento = nx(g, "Arrotondamento");
    inv.art73 = tx(g, "Art73");
    inv.causali = kids(g, "Causale").map(c => c.textContent.trim()).filter(Boolean);
    inv.ritenute = kids(g, "DatiRitenuta").map(r => ({
      tipo: tx(r, "TipoRitenuta"), importo: nx(r, "ImportoRitenuta"),
      aliquota: nx(r, "AliquotaRitenuta"), causale: tx(r, "CausalePagamento")
    }));
    const bo = kid(g, "DatiBollo");
    inv.bollo = bo ? { virtuale: tx(bo, "BolloVirtuale"), importo: nx(bo, "ImportoBollo") } : null;
    inv.casse = kids(g, "DatiCassaPrevidenziale").map(c => ({
      tipo: tx(c, "TipoCassa"), aliquota: nx(c, "AlCassa"), importo: nx(c, "ImportoContributoCassa"),
      imponibile: nx(c, "ImponibileCassa"), iva: nx(c, "AliquotaIVA"), ritenuta: tx(c, "Ritenuta"),
      natura: tx(c, "Natura"), rifAmm: tx(c, "RiferimentoAmministrazione")
    }));
    inv.scontiDoc = kids(g, "ScontoMaggiorazione").map(s => ({
      tipo: tx(s, "Tipo"), perc: nx(s, "Percentuale"), importo: nx(s, "Importo")
    }));
    const rif = n => kids(dg, n).map(o => ({
      id: tx(o, "IdDocumento"), data: tx(o, "Data"), cup: tx(o, "CodiceCUP"), cig: tx(o, "CodiceCIG"),
      commessa: tx(o, "CodiceCommessaConvenzione"), numItem: tx(o, "NumItem"),
      rifLinea: tx(o, "RiferimentoNumeroLinea")
    }));
    inv.ordini = rif("DatiOrdineAcquisto");
    inv.contratti = rif("DatiContratto");
    inv.convenzioni = rif("DatiConvenzione");
    inv.ricezioni = rif("DatiRicezione");
    inv.collegate = rif("DatiFattureCollegate");
    inv.ddt = kids(dg, "DatiDDT").map(d => ({ numero: tx(d, "NumeroDDT"), data: tx(d, "DataDDT"),
      rifLinea: tx(d, "RiferimentoNumeroLinea") }));
    inv.sal = kids(dg, "DatiSAL").map(o => ({ fase: tx(o, "RiferimentoFase") }));
    const fp = kid(dg, "FatturaPrincipale");
    inv.principale = fp ? { numero: tx(fp, "NumeroFatturaPrincipale"), data: tx(fp, "DataFatturaPrincipale") } : null;
    const dv = kid(body, "DatiVeicoli");
    inv.veicoli = dv ? { data: tx(dv, "Data"), percorso: tx(dv, "TotalePercorso") } : null;
    inv.rettifica = null;
    const tr = kid(dg, "DatiTrasporto");
    const vet = tr ? kid(tr, "DatiAnagraficiVettore") : null;
    const av = vet ? anagrafica(vet) : null;
    inv.trasporto = tr ? {
      vettore: av && av.nome !== "(anagrafica assente)" ? av.nome : "",
      vettorePiva: av ? (av.piva || av.cf) : "",
      licenza: tx(vet, "NumeroLicenzaGuida"),
      mezzo: tx(tr, "MezzoTrasporto"), causale: tx(tr, "CausaleTrasporto"),
      colli: tx(tr, "NumeroColli"), aspetto: tx(tr, "Descrizione"),
      um: tx(tr, "UnitaMisuraPeso"), pesoLordo: tx(tr, "PesoLordo"), pesoNetto: tx(tr, "PesoNetto"),
      ritiro: tx(tr, "DataOraRitiro"), inizio: tx(tr, "DataInizioTrasporto"),
      resa: tx(tr, "TipoResa"), indirizzoResa: indirizzo(kid(tr, "IndirizzoResa")),
      consegna: tx(tr, "DataOraConsegna")
    } : null;
    inv.righe = kids(bs, "DettaglioLinee").map(l => ({
      n: tx(l, "NumeroLinea"),
      tipo: tx(l, "TipoCessionePrestazione"),
      codici: kids(l, "CodiceArticolo").map(c => ({ t: tx(c, "CodiceTipo"), v: tx(c, "CodiceValore") })),
      desc: tx(l, "Descrizione"),
      qta: nx(l, "Quantita"),
      um: tx(l, "UnitaMisura"),
      dal: tx(l, "DataInizioPeriodo"), al: tx(l, "DataFinePeriodo"),
      prezzo: nx(l, "PrezzoUnitario"),
      sconti: kids(l, "ScontoMaggiorazione").map(s => ({ tipo: tx(s, "Tipo"), perc: nx(s, "Percentuale"), importo: nx(s, "Importo") })),
      totale: nx(l, "PrezzoTotale"),
      iva: nx(l, "AliquotaIVA"),
      ritenuta: tx(l, "Ritenuta"),
      natura: tx(l, "Natura"),
      rifAmm: tx(l, "RiferimentoAmministrazione"),
      gestionali: kids(l, "AltriDatiGestionali").map(a => ({
        t: tx(a, "TipoDato"), rt: tx(a, "RiferimentoTesto"), rn: tx(a, "RiferimentoNumero"), rd: tx(a, "RiferimentoData")
      }))
    }));
    inv.riepiloghi = kids(bs, "DatiRiepilogo").map(r => ({
      iva: nx(r, "AliquotaIVA"), natura: tx(r, "Natura"),
      spese: nx(r, "SpeseAccessorie"), arrot: nx(r, "Arrotondamento"),
      imponibile: nx(r, "ImponibileImporto"), imposta: nx(r, "Imposta"),
      esigibilita: tx(r, "EsigibilitaIVA"), norma: tx(r, "RiferimentoNormativo")
    }));
    inv.pagamenti = kids(body, "DatiPagamento").map(p => ({
      condizioni: tx(p, "CondizioniPagamento"),
      dettagli: kids(p, "DettaglioPagamento").map(d => ({
        beneficiario: tx(d, "Beneficiario"), modalita: tx(d, "ModalitaPagamento"),
        giorni: tx(d, "GiorniTerminiPagamento"), dataRif: tx(d, "DataRiferimentoTerminiPagamento"),
        scadenza: tx(d, "DataScadenzaPagamento"), importo: nx(d, "ImportoPagamento"),
        iban: tx(d, "IBAN"), abi: tx(d, "ABI"), cab: tx(d, "CAB"), bic: tx(d, "BIC"),
        istituto: tx(d, "IstitutoFinanziario"), codPag: tx(d, "CodicePagamento"),
        codUff: tx(d, "CodUfficioPostale"),
        quietanzante: [tx(d, "TitoloQuietanzante"), tx(d, "NomeQuietanzante"), tx(d, "CognomeQuietanzante"),
          tx(d, "CFQuietanzante")].filter(Boolean).join(" "),
        scontoPag: nx(d, "ScontoPagamentoAnticipato"), dataSconto: tx(d, "DataLimitePagamentoAnticipato"),
        penale: nx(d, "PenalitaPagamentiRitardati"), dataPenale: tx(d, "DataDecorrenzaPenale")
      }))
    }));
    inv.allegati = kids(body, "Allegati").map(a => ({
      nome: tx(a, "NomeAttachment"), formato: tx(a, "FormatoAttachment"),
      desc: tx(a, "DescrizioneAttachment"), algoritmo: tx(a, "AlgoritmoCompressione"), dati: tx(a, "Attachment")
    }));
    finalize(inv);
    return inv;
  }

  function bodySemplificata(body, base){
    const g = deep(body, ["DatiGenerali", "DatiGeneraliDocumento"]);
    const inv = Object.assign({}, base);
    inv.tipo = tx(g, "TipoDocumento");
    inv.divisa = tx(g, "Divisa") || "EUR";
    inv.data = tx(g, "Data");
    inv.numero = tx(g, "Numero");
    inv.totale = nx(g, "ImportoTotaleDocumento");
    inv.causali = kids(g, "Causale").map(c => c.textContent.trim()).filter(Boolean);
    const bo = kid(g, "DatiBollo") || kid(g, "Bollo");
    inv.bollo = bo ? { virtuale: tx(bo, "BolloVirtuale"), importo: nx(bo, "ImportoBollo") } : null;
    const rt = kid(g, "DatiRettifica");
    inv.rettifica = rt ? { numero: tx(rt, "NumeroFR"), data: tx(rt, "DataFR"), elementi: tx(rt, "ElementiRettificati") } : null;
    inv.art73 = tx(g, "Art73");
    inv.casse = []; inv.ritenute = []; inv.scontiDoc = [];
    inv.ordini = []; inv.contratti = []; inv.convenzioni = []; inv.ricezioni = [];
    inv.collegate = []; inv.ddt = []; inv.sal = []; inv.principale = null; inv.veicoli = null;
    inv.trasporto = null; inv.pagamenti = []; inv.allegati = [];
    inv.righe = kids(body, "DatiBeniServizi").map((d, i) => {
      const iva = kid(d, "DatiIVA");
      return {
        n: String(i + 1), desc: tx(d, "Descrizione"), qta: null, um: "",
        prezzo: nx(d, "Importo"), totale: nx(d, "Importo"), sconti: [], codici: [], gestionali: [],
        iva: iva ? num(tx(iva, "Aliquota")) : null,
        imposta: iva ? num(tx(iva, "Imposta")) : null,
        natura: tx(d, "Natura") || (iva ? tx(iva, "Natura") : ""),
        norma: tx(d, "RiferimentoNormativo"),
        arrot: nx(d, "ArrotondamentoImporto")
      };
    });
    /* riepilogo ricostruito per aliquota */
    const map = new Map();
    for (const r of inv.righe) {
      const k = (r.iva == null ? "-" : r.iva) + "|" + (r.natura || "");
      const cur = map.get(k) || { iva: r.iva, natura: r.natura, imponibile: 0, imposta: 0, esigibilita: "", norma: "", arrot: null };
      cur.imponibile += (r.totale || 0) - (r.imposta || 0);
      cur.imposta += r.imposta || 0;
      if (r.norma) cur.norma = r.norma;
      if (r.arrot != null) cur.arrot = (cur.arrot || 0) + r.arrot;
      map.set(k, cur);
    }
    inv.riepiloghi = Array.from(map.values());
    finalize(inv);
    return inv;
  }

  /* codice IVA: una voce per ogni riepilogo, aliquota oppure natura quando l'IVA non si applica */
  function codiciIva(inv){
    const out = [];
    (inv.riepiloghi || []).forEach(r => {
      const c = r.natura ? r.natura : (r.iva != null ? nf(r.iva, r.iva % 1 ? 2 : 0) + "%" : "");
      if (c && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  function finalize(inv){
    inv.imponibile = inv.riepiloghi.reduce((s, r) => s + (r.imponibile || 0), 0);
    inv.imposta = inv.riepiloghi.reduce((s, r) => s + (r.imposta || 0), 0);
    inv.ritenutaTot = (inv.ritenute || []).reduce((s, r) => s + (r.importo || 0), 0);
    inv.tipoLabel = T_DOC[inv.tipo] || inv.tipo || "Documento";
    inv.tipoBreve = T_DOC_BREVE[inv.tipo] || inv.tipo || "Documento";
    inv.classe = inv.semplificata ? "semp"
      : (inv.tipo === "TD04" || inv.tipo === "TD08") ? "nc"
      : /^TD(1[6-9]|2[0-3]|27)$/.test(inv.tipo) ? "auto" : "std";
    /* il totale può essere esposto con o senza ritenuta e con o senza bollo addebitato */
    const lordo = inv.imponibile + inv.imposta;
    const bollo = inv.bollo && inv.bollo.importo || 0, arr = inv.arrotondamento || 0;
    inv.quadra = inv.totale == null ? null
      : [lordo, lordo - inv.ritenutaTot, lordo + bollo, lordo - inv.ritenutaTot + bollo]
          .some(v => Math.abs(v - inv.totale) < 0.02 || Math.abs(v + arr - inv.totale) < 0.02);
    inv.codiciIva = codiciIva(inv);
    inv.metodo = metodoPagamento(inv);
    inv.id = "f" + Math.random().toString(36).slice(2, 10);
  }

  /* il metodo di pagamento dichiarato (ModalitaPagamento di ogni rata): codici, nomi, famiglia, importo in contanti.
     Nella fattura è facoltativo: senza DatiPagamento il metodo resta «non indicato», mai indovinato. */
  function metodoPagamento(inv){
    const dett = (inv.pagamenti || []).reduce((a, p) => a.concat(p.dettagli || []), []);
    const codici = [], imp = {};
    dett.forEach(d => {
      const k = String(d.modalita || "").trim().toUpperCase(); if (!k) return;
      if (!codici.includes(k)) codici.push(k);
      imp[k] = (imp[k] || 0) + (typeof d.importo === "number" && isFinite(d.importo) ? d.importo : 0);
    });
    if (!codici.length) return { codici: [], nome: "", famiglia: "nd", famiglie: [], contanti: 0, oltreSoglia: false, rate: dett.length };
    const famiglie = codici.map(k => PAG_FAM[k] || "altro").filter((f, i, a) => a.indexOf(f) === i);
    /* contanti veri e propri (MP01; MP04 è il versamento alla tesoreria di un ente pubblico): l'importo delle rate, o il totale se le rate non lo dicono */
    let contanti = codici.includes("MP01") ? imp.MP01 : 0;
    if (codici.includes("MP01") && !contanti && codici.length === 1) contanti = Math.abs(inv.totale || 0);
    return { codici, nome: codici.map(k => T_PAG[k] || k).join(" + "), famiglia: famiglie.length === 1 ? famiglie[0] : "misto",
      famiglie, contanti: Math.round(contanti * 100) / 100, oltreSoglia: contanti >= SOGLIA_CONTANTI, rate: dett.length };
  }

  /* l'etichetta del metodo (HTML, per gli elenchi a schermo): icona della famiglia e nome breve; i contanti in evidenza,
     in rosso da 5.000 euro in su. Il titolo dice il codice e il nome completo. */
  const PAG_ICO = {
    contanti: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    carta: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>',
    bonifico: '<path d="M3 10 12 4.5 21 10"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3 20h18"/>',
    assegno: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 14.5c1.4-2 2.4.8 3.8-1s2 .9 3.2-.2M15 10h3.5"/>',
    addebito: '<path d="M17 3l3.5 3.5L17 10"/><path d="M3.5 11.5v-1A4 4 0 0 1 7.5 6.5h13"/><path d="M7 21l-3.5-3.5L7 14"/><path d="M20.5 12.5v1a4 4 0 0 1-4 4h-13"/>',
    bollettino: '<path d="M5.5 3h13v18l-2.6-1.7-2.2 1.7-1.7-1.7-1.7 1.7-2.2-1.7L5.5 21z"/><path d="M9 8h6M9 12h6"/>',
    altro: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
    misto: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'
  };
  const PAG_BREVE = { MP08: "Carta", MP04: "Contanti (tesoreria)", MP15: "Giroconto", MP14: "Quietanza erario", MP22: "Trattenuta", MP19: "SEPA Direct Debit",
    MP20: "SDD CORE", MP21: "SDD B2B", MP16: "Domiciliazione bancaria", MP17: "Domiciliazione postale", MP18: "Bollettino postale" };
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function metodoBreve(m){
    if (!m || !m.codici || !m.codici.length) return "Non indicato";
    return m.codici.length === 1 ? (PAG_BREVE[m.codici[0]] || T_PAG[m.codici[0]] || m.codici[0]) : m.codici.map(k => PAG_BREVE[k] || T_PAG[k] || k).join(" + ");
  }
  function metodoTitolo(m){
    if (!m || !m.codici || !m.codici.length) return "Metodo di pagamento non indicato nella fattura";
    let t = "Metodo di pagamento: " + m.codici.map(k => k + " " + (T_PAG[k] || "")).join(", ");
    if (m.oltreSoglia) t += " \u2014 contanti per " + eur(m.contanti) + " euro: da 5.000 euro in su il contante non \u00e8 ammesso fra soggetti diversi (d.lgs. 231/2007). Da verificare.";
    return t;
  }
  /* o.famiglia + o.label: l'etichetta di una famiglia intera (riepiloghi); o.soglia: in rosso */
  function pagChip(m, o){
    o = o || {};
    const f = o.famiglia || (m && m.codici && m.codici.length ? m.famiglia : "nd"), soglia = o.famiglia ? !!o.soglia : !!(m && m.oltreSoglia);
    const svg = PAG_ICO[f] ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PAG_ICO[f] + "</svg>" : "";
    const label = o.label || (f === "nd" ? "\u2014" : metodoBreve(m)), title = o.famiglia ? "" : ' title="' + escH(metodoTitolo(m)) + '"';
    return '<span class="pag-chip f-' + f + (soglia ? " soglia" : "") + '"' + title + ">" + svg + escH(label) +
      (soglia ? '<b aria-label="oltre la soglia del contante">!</b>' : "") + "</span>";
  }

  /* =========================================================================
     7. PRIMITIVE DI IMPAGINAZIONE
     ========================================================================= */
  /* niente colori: solo scala di grigi */
  const P_GRAY = { blu:"#1A1A1A", blu2:"#3D3D3D", pale:"#EAEAE8", line:"#B4B4B2",
              hair:"#E6E6E4", grigio:"#7A7A78", ink:"#0E0E0E", ink2:"#454545",
              zebra:"#F7F7F5", bianco:"#FFFFFF", rosso:"#0E0E0E" };
  const P_BRAND = { blu:"#5A2BFF", blu2:"#615D7E", pale:"#F0EDFB", line:"#CFC8EC", hair:"#E4E0F5", grigio:"#615D7E",
              ink:"#15122E", ink2:"#38345A", zebra:"#F7F5FD", bianco:"#FFFFFF", rosso:"#15122E" };
  let P = P_GRAY, BR = false;
  let mkPdf = o => new PDF(o);

  function sec(pdf, title){
    pdf.ensure(14);
    if (BR) {
      pdf.rect(pdf.left, pdf.y, pdf.innerW, 5.6, { fill:P.ink });
      pdf.rect(pdf.left, pdf.y, 1.1, 5.6, { fill:P.blu });
      pdf.text(pdf.left + 3, pdf.y + 1.55, title.toUpperCase(), { size:7, bold:true, color:"#FFFFFF" });
    } else {
      pdf.rect(pdf.left, pdf.y, pdf.innerW, 5.4, { stroke:"#000000", lw:0.25 });
      pdf.text(pdf.left + 2, pdf.y + 1.5, title.toUpperCase(), { size:7, bold:true, color:"#000000" });
    }
    pdf.y += 7.6;
  }
  function kvGrid(pdf, pairs, ncol){
    pairs = pairs.filter(p => p && (p[1] || p[1] === 0));
    if (!pairs.length) return;
    const gap = 3.5, w = (pdf.innerW - (ncol - 1) * gap) / ncol;
    const vs = 7.6, lh = (vs * 1.2) / MM;
    for (let i = 0; i < pairs.length; i += ncol) {
      const slice = pairs.slice(i, i + ncol);
      const cells = slice.map(p => pdf.wrap(String(p[1]), w, vs, !!p[2]));
      const h = Math.max.apply(null, cells.map(c => c.length)) * lh + 4.3;
      pdf.ensure(h);
      slice.forEach((p, j) => {
        const x = pdf.left + j * (w + gap);
        pdf.text(x, pdf.y, p[0].toUpperCase(), { size:5.6, bold:true, color:P.grigio });
        pdf.textLines(x, pdf.y + 2.7, cells[j], { size:vs, lh, color:P.ink, bold:!!p[2] });
      });
      pdf.y += h;
    }
    pdf.y += 1.4;
  }
  function tbl(pdf, cols, rows, o){
    o = o || {};
    const size = o.size || 7.1, hs = o.hs || 6, pad = o.pad || 1.15;
    const lh = (size * 1.2) / MM;
    const x0 = o.x != null ? o.x : pdf.left;
    const totW = cols.reduce((s, c) => s + c.w, 0);
    function head(){
      pdf.ensure(5 + lh * 2);
      let x = x0;
      for (const c of cols) {
        const tx2 = c.align === "right" ? x + c.w - pad : (c.align === "center" ? x + c.w / 2 : x + pad);
        pdf.text(tx2, pdf.y + 1.25, c.label, { size:hs, bold:true, color:BR ? P.ink2 : "#000000", align:c.align, max:c.w - 2 * pad });
        x += c.w;
      }
      pdf.y += 5;
      pdf.line(x0, pdf.y, x0 + totW, pdf.y, { color:P.line, lw:0.25 });
    }
    head();
    rows.forEach((r, z) => {
      const cells = cols.map((c, i) => {
        const v = r[i] == null ? "" : String(r[i]);
        if (c.wrap === false) return [pdf.clip(toWin(v), c.w - 2 * pad, size, !!c.bold)];
        let out = [];
        v.split("\n").forEach(part => { out = out.concat(pdf.wrap(part, c.w - 2 * pad, size, !!c.bold)); });
        return out;
      });
      const h = Math.max.apply(null, cells.map(c => c.length)) * lh + 2 * pad;
      if (pdf.y + h > pdf.H - pdf.bottom) { pdf.addPage(); head(); }
      if (o.zebra === true && z % 2 === 1) pdf.rect(x0, pdf.y, totW, h, { fill:P.zebra });
      let x = x0;
      cells.forEach((lines, i) => {
        const c = cols[i];
        const tx2 = c.align === "right" ? x + c.w - pad : (c.align === "center" ? x + c.w / 2 : x + pad);
        pdf.textLines(tx2, pdf.y + pad, lines, { size, lh, bold:!!c.bold, align:c.align, color:c.color || P.ink });
        x += c.w;
      });
      pdf.y += h;
      pdf.line(x0, pdf.y, x0 + totW, pdf.y, { color:P.hair, lw:0.15 });
    });
    pdf.y += 2.2;
  }
  /* riquadro dei totali */
  function totaliBox(pdf, inv, x, w, yStart){
    const rows = [];
    rows.push(["Totale imponibile", eur(inv.imponibile)]);
    rows.push(["Totale imposta", eur(inv.imposta)]);
    const cassa = (inv.casse || []).reduce((s, c) => s + (c.importo || 0), 0);
    if (cassa) rows.push(["Contributo cassa", eur(cassa)]);
    if (inv.bollo && inv.bollo.importo) rows.push(["Bollo", eur(inv.bollo.importo)]);
    if (inv.arrotondamento) rows.push(["Arrotondamento", eur(inv.arrotondamento)]);
    if (inv.ritenutaTot) rows.push(["Ritenuta d'acconto", "\u2212 " + eur(inv.ritenutaTot)]);
    const lh = 4.1, headH = 0;
    const h = rows.length * lh + 11.5;
    let y = yStart != null ? yStart : pdf.y;
    if (yStart == null && pdf.y + h > pdf.H - pdf.bottom) { pdf.addPage(); y = pdf.y; }
    pdf.rect(x, y, w, h, { fill:BR ? "#FBF9F5" : "#FAFAF8", stroke:P.line, lw:0.3 });
    let ry = y + 2.6;
    rows.forEach(r => {
      pdf.text(x + 3, ry, r[0], { size:6.9, color:P.ink2 });
      pdf.text(x + w - 3, ry, r[1], { size:6.9, align:"right", color:P.ink });
      ry += lh;
    });
    pdf.line(x + 2.5, ry + 0.4, x + w - 2.5, ry + 0.4, { color:P.blu, lw:0.4 });
    pdf.text(x + 3, ry + 2.4, "TOTALE DOCUMENTO", { size:6.4, bold:true, color:P.blu });
    pdf.text(x + w - 3, ry + 1.6, (inv.totale == null ? "" : eur(inv.totale)) + " " + (inv.divisa || "EUR"),
      { size:10.5, bold:true, align:"right", color:P.blu });
    return y + h;
  }
  function footers(pdf, inv){
    if (BR) return; /* nel layout di file360 intestazione e piè di pagina sono del marchio */
    const n = pdf.pages.length;
    const label = "Rappresentazione grafica di " + (inv.srcName || "documento") +
      (inv.tot > 1 ? "  \u00b7  documento " + (inv.idx + 1) + " di " + inv.tot : "");
    for (let i = 0; i < n; i++) {
      pdf.ops = pdf.pages[i];
      const y = pdf.H - pdf.bottom + 4.5;
      pdf.line(pdf.left, y - 2.4, pdf.W - pdf.right, y - 2.4, { color:P.line, lw:0.2 });
      pdf.text(pdf.left, y, label, { size:5.8, color:P.grigio, max: pdf.innerW - 34 });
      pdf.text(pdf.W - pdf.right, y, "Pagina " + (i + 1) + " di " + n, { size:5.8, color:P.grigio, align:"right" });
    }
  }
  /* testo di sconto/maggiorazione di riga */
  function scontoTxt(list){
    if (!list || !list.length) return "";
    return list.map(s => (s.tipo || "") + " " + (T_SM[s.tipo] === "Maggiorazione" ? "+" : "\u2212") +
      (s.perc != null ? " " + nf(s.perc, 2) + "%" : "") +
      (s.importo != null ? (s.perc != null ? " / " : " ") + eur(s.importo) : "")).join("\n");
  }
  /* i pesi vanno in formato italiano come ogni altro numero */
  function peso(v, um){
    if (!v) return "";
    return (isNaN(v) ? String(v) : nf(v, 2)) + (um ? " " + um : "");
  }
  function dettagliPagamento(d){
    return [d.iban ? "IBAN: " + d.iban : "",
      [d.abi ? "ABI " + d.abi : "", d.cab ? "CAB " + d.cab : "", d.bic ? "BIC " + d.bic : ""].filter(Boolean).join("  "),
      d.istituto,
      (d.cond || "") + (T_COND[d.cond] ? " " + T_COND[d.cond].toLowerCase() : ""),
      d.quietanzante ? "Quietanzante: " + d.quietanzante : "",
      d.codUff ? "Ufficio postale: " + d.codUff : "",
      d.scontoPag != null ? "Sconto anticipato: " + eur(d.scontoPag) + (d.dataSconto ? " entro " + dtDash(d.dataSconto) : "") : "",
      d.penale != null ? "Penale ritardo: " + eur(d.penale) + (d.dataPenale ? " dal " + dtDash(d.dataPenale) : "") : "",
      d.codPag ? "Codice pagamento: " + d.codPag : ""].filter(Boolean).join("\n");
  }
  function scadenzaPagamento(d){
    return [dtDash(d.scadenza), d.giorni ? d.giorni + " gg" : "",
      d.dataRif ? "dal " + dtDash(d.dataRif) : ""].filter(Boolean).join("\n");
  }
  function anagraficaRighe(a){
    const out = [];
    if (a.via) out.push(a.via);
    if (a.citta) out.push(a.citta + (a.naz ? " " + a.naz : ""));
    return out;
  }

  /* =========================================================================
     8. LAYOUT MINISTERIALE
     ========================================================================= */
  function renderMinisteriale(inv){
    const pdf = mkPdf({ top:12, bottom:16, left:12, right:12 });
    pdf.text(pdf.left, pdf.y, inv.semplificata ? "FATTURA ELETTRONICA SEMPLIFICATA" : "FATTURA ELETTRONICA",
      { size:6.4, bold:true, color:P.blu2 });
    pdf.y += 3.6;
    pdf.text(pdf.left, pdf.y, inv.tipoLabel, { size:13.5, bold:true, color:P.ink, max:118 });
    pdf.text(pdf.W - pdf.right, pdf.y + 1, "n. " + inv.numero + "   del   " + dt(inv.data),
      { size:10, bold:true, align:"right", color:P.blu });
    pdf.y += 7.2;
    pdf.line(pdf.left, pdf.y, pdf.W - pdf.right, pdf.y, { color:P.blu, lw:0.5 });
    pdf.y += 4.2;

    const t = inv.trasm;
    sec(pdf, "Dati relativi alla trasmissione");
    kvGrid(pdf, [
      ["Identificativo trasmittente", (t.idPaese || "") + (t.idCodice || "")],
      ["Progressivo invio", t.progressivo],
      ["Formato trasmissione", t.formato],
      ["Codice destinatario", t.destinatario],
      ["PEC destinatario", t.pec],
      ["Contatti trasmittente", [t.tel, t.mail].filter(Boolean).join(" \u00b7 ")]
    ], 3);

    const blocco = (titolo, a) => {
      if (!a) return;
      sec(pdf, titolo);
      kvGrid(pdf, [
        ["Denominazione", a.nome, true],
        ["Identificativo fiscale IVA", a.piva],
        ["Codice fiscale", a.cf],
        ["Sede", [a.via, a.citta, a.naz].filter(Boolean).join(" \u2014 ")],
        ["Regime fiscale", decode(T_REGIME, a.regime)],
        ["Iscrizione REA", a.rea],
        ["Capitale sociale", a.reaCap ? eur(a.reaCap) : ""],
        ["Socio unico", a.reaSocio],
        ["Stato liquidazione", a.reaLiq],
        ["Albo professionale", a.albo],
        ["Codice EORI", a.eori],
        ["Stabile organizzazione", a.stabile],
        ["Rappresentante fiscale", a.rappr],
        ["Riferimento amministrazione", a.rifAmm],
        ["Fax", a.fax],
        ["Telefono", a.tel],
        ["Email", a.mail]
      ], 3);
    };
    blocco("Dati del cedente / prestatore", inv.cedente);
    blocco("Dati del cessionario / committente", inv.cessionario);
    if (inv.rappr && inv.rappr.nome !== "(anagrafica assente)") blocco("Rappresentante fiscale", inv.rappr);
    if (inv.terzo && inv.terzo.nome !== "(anagrafica assente)") blocco("Terzo intermediario o soggetto emittente", inv.terzo);

    sec(pdf, "Dati generali del documento");
    kvGrid(pdf, [
      ["Tipologia documento", decode(T_DOC, inv.tipo)],
      ["Numero documento", inv.numero, true],
      ["Data documento", dt(inv.data), true],
      ["Divisa", inv.divisa],
      ["Importo totale documento", inv.totale == null ? "" : eur(inv.totale), true],
      ["Arrotondamento", inv.arrotondamento != null ? eur(inv.arrotondamento) : ""],
      ["Art. 73", inv.art73],
      ["Soggetto emittente", inv.emittente]
    ], 3);
    if (inv.causali.length) {
      pdf.text(pdf.left, pdf.y, "CAUSALE", { size:5.6, bold:true, color:P.grigio });
      pdf.y += 2.7;
      inv.causali.forEach(c => {
        const lines = pdf.wrap(c, pdf.innerW, 7.4, false);
        pdf.ensure(lines.length * 3.2 + 2);
        pdf.y += pdf.textLines(pdf.left, pdf.y, lines, { size:7.4, color:P.ink });
      });
      pdf.y += 2.4;
    }

    if (inv.rettifica) {
      sec(pdf, "Dati della fattura rettificata");
      kvGrid(pdf, [["Numero fattura rettificata", inv.rettifica.numero],
        ["Data fattura rettificata", dt(inv.rettifica.data)],
        ["Elementi rettificati", inv.rettifica.elementi]], 3);
    }
    if (inv.casse.length) {
      sec(pdf, "Dati cassa previdenziale");
      tbl(pdf, [
        { label:"Tipo cassa", w:46 }, { label:"Aliq. cassa %", w:18, align:"right" },
        { label:"Imponibile", w:24, align:"right" }, { label:"Contributo", w:24, align:"right", bold:true },
        { label:"IVA %", w:14, align:"right" }, { label:"Ritenuta", w:14 }, { label:"Natura", w:16 },
        { label:"Rif. amministrazione", w:30 }
      ], inv.casse.map(c => [decode(T_CASSA, c.tipo), nf(c.aliquota, 2), eur(c.imponibile), eur(c.importo),
        nf(c.iva, 2), c.ritenuta === "SI" ? "SI" : "", c.natura, c.rifAmm]));
    }
    if (inv.ritenute.length) {
      sec(pdf, "Dati ritenuta");
      tbl(pdf, [
        { label:"Tipo ritenuta", w:62 }, { label:"Aliquota %", w:24, align:"right" },
        { label:"Importo", w:26, align:"right", bold:true }, { label:"Causale di pagamento", w:74 }
      ], inv.ritenute.map(r => [decode(T_RIT, r.tipo), nf(r.aliquota, 2), eur(r.importo), r.causale]));
    }
    if (inv.bollo || inv.scontiDoc.length) {
      sec(pdf, "Bollo, sconti e maggiorazioni sul documento");
      kvGrid(pdf, [
        ["Bollo virtuale", inv.bollo ? (inv.bollo.virtuale === "SI" ? "S\u00ec" : inv.bollo.virtuale) : ""],
        ["Importo bollo", inv.bollo && inv.bollo.importo != null ? eur(inv.bollo.importo) : ""],
        ["Sconto / maggiorazione", inv.scontiDoc.map(s => (T_SM[s.tipo] || s.tipo) + " " +
          (s.perc != null ? nf(s.perc, 2) + "%" : "") + (s.importo != null ? " " + eur(s.importo) : "")).join("  \u00b7  ")]
      ], 3);
    }

    const rifTbl = (titolo, list) => {
      if (!list || !list.length) return;
      sec(pdf, titolo);
      tbl(pdf, [
        { label:"Id documento", w:40 }, { label:"Data", w:20 }, { label:"Linea / item", w:24 },
        { label:"Codice CUP", w:34 }, { label:"Codice CIG", w:34 }, { label:"Commessa", w:34 }
      ], list.map(o => [o.id, dt(o.data),
        [o.rifLinea ? "linea " + o.rifLinea : "", o.numItem ? "item " + o.numItem : ""].filter(Boolean).join(" \u00b7 "),
        o.cup, o.cig, o.commessa]));
    };
    rifTbl("Dati ordine di acquisto", inv.ordini);
    rifTbl("Dati contratto", inv.contratti);
    rifTbl("Dati convenzione", inv.convenzioni);
    rifTbl("Dati ricezione", inv.ricezioni);
    rifTbl("Dati fatture collegate", inv.collegate);
    if (inv.principale) rifTbl("Fattura principale", [{ id:inv.principale.numero, data:inv.principale.data }]);
    if (inv.sal && inv.sal.length) {
      sec(pdf, "Dati stato avanzamento lavori");
      kvGrid(pdf, inv.sal.map(o => ["Riferimento fase", o.fase]), 3);
    }
    if (inv.veicoli && (inv.veicoli.data || inv.veicoli.percorso)) {
      sec(pdf, "Dati veicoli");
      kvGrid(pdf, [["Data immatricolazione o prima iscrizione", dt(inv.veicoli.data)],
        ["Totale percorso", inv.veicoli.percorso]], 3);
    }
    if (inv.ddt.length) {
      sec(pdf, "Dati documento di trasporto");
      tbl(pdf, [{ label:"Numero DDT", w:93 }, { label:"Data DDT", w:93 }],
        inv.ddt.map(d => [d.numero, dt(d.data)]));
    }
    if (inv.trasporto && Object.keys(inv.trasporto).some(k => inv.trasporto[k])) {
      sec(pdf, "Dati relativi al trasporto");
      kvGrid(pdf, [
        ["Vettore", [inv.trasporto.vettore, inv.trasporto.vettorePiva].filter(Boolean).join(" \u2014 ")],
        ["Numero licenza guida", inv.trasporto.licenza],
        ["Causale del trasporto", inv.trasporto.causale],
        ["Numero colli", inv.trasporto.colli], ["Aspetto dei beni", inv.trasporto.aspetto],
        ["Peso lordo", peso(inv.trasporto.pesoLordo, inv.trasporto.um)],
        ["Peso netto", peso(inv.trasporto.pesoNetto, inv.trasporto.um)],
        ["Mezzo di trasporto", inv.trasporto.mezzo], ["Tipo resa", inv.trasporto.resa],
        ["Data ritiro", dt(inv.trasporto.ritiro)], ["Inizio trasporto", dt(inv.trasporto.inizio)],
        ["Data consegna", dt(inv.trasporto.consegna)], ["Indirizzo di resa", inv.trasporto.indirizzoResa]
      ], 3);
    }

    sec(pdf, "Dati delle linee di dettaglio");
    tbl(pdf, [
      { label:"N.", w:7, align:"right" }, { label:"Descrizione", w:60 },
      { label:"Qt\u00e0", w:14, align:"right" }, { label:"U.M.", w:10 },
      { label:"Prezzo unit.", w:21, align:"right" }, { label:"Sc/Mg", w:12, align:"right" },
      { label:"Prezzo totale", w:22, align:"right", bold:true },
      { label:"IVA %", w:11, align:"right" }, { label:"Natura", w:29 }
    ], inv.righe.map(l => [l.n, descrizioneEstesa(l), qty(l.qta), l.um, price(l.prezzo),
      scontoTxt(l.sconti), eur(l.totale), l.iva != null ? nf(l.iva, 2) : "", l.natura]));

    sec(pdf, "Riepiloghi IVA");
    tbl(pdf, [
      { label:"Aliquota IVA %", w:20, align:"right" }, { label:"Natura", w:32 },
      { label:"Spese acc.", w:20, align:"right" }, { label:"Imponibile", w:26, align:"right", bold:true },
      { label:"Imposta", w:24, align:"right", bold:true }, { label:"Esigibilit\u00e0", w:22 },
      { label:"Riferimento normativo", w:42 }
    ], inv.riepiloghi.map(r => [r.iva != null ? nf(r.iva, 2) : "", r.natura ? decode(T_NATURA, r.natura) : "",
      r.spese != null ? eur(r.spese) : "", eur(r.imponibile), eur(r.imposta),
      decode(T_ESIG, r.esigibilita, false), r.norma]));

    const dett = inv.pagamenti.reduce((a, p) => a.concat(p.dettagli.map(d => Object.assign({ cond:p.condizioni }, d))), []);
    if (dett.length) {
      sec(pdf, "Dati relativi al pagamento");
      tbl(pdf, [
        { label:"Modalit\u00e0", w:40 }, { label:"Beneficiario", w:32 }, { label:"Scadenza", w:24 },
        { label:"Importo", w:24, align:"right", bold:true }, { label:"Dettagli", w:66 }
      ], dett.map(d => [(d.modalita || "") + (T_PAG[d.modalita] ? " \u2014 " + T_PAG[d.modalita] : ""),
        d.beneficiario, scadenzaPagamento(d), eur(d.importo), dettagliPagamento(d)]));
    }
    if (inv.allegati.length) {
      sec(pdf, "Allegati");
      tbl(pdf, [{ label:"Nome", w:60 }, { label:"Formato", w:24 }, { label:"Compressione", w:26 },
        { label:"Descrizione", w:76 }],
        inv.allegati.map(a => [a.nome, a.formato, a.algoritmo, a.desc]));
    }

    pdf.ensure(34);
    totaliBox(pdf, inv, pdf.W - pdf.right - 82, 82);
    footers(pdf, inv);
    return pdf;
  }
  function descrizioneEstesa(l, conCodici){
    const out = [l.desc || ""];
    if (conCodici !== false && l.codici && l.codici.length)
      out.push(l.codici.map(c => (c.t ? c.t + ": " : "cod. ") + c.v).join("  \u00b7  "));
    if (l.tipo) out.push("Tipo cessione/prestazione: " + l.tipo + (T_CESSIONE[l.tipo] ? " " + T_CESSIONE[l.tipo] : ""));
    if (l.ritenuta === "SI") out.push("Soggetta a ritenuta");
    if (l.dal || l.al) out.push("Periodo: " + dt(l.dal) + (l.al ? " \u2013 " + dt(l.al) : ""));
    if (l.rifAmm) out.push("Rif. amministrazione: " + l.rifAmm);
    if (l.gestionali && l.gestionali.length)
      out.push("Dati gestionali: " + l.gestionali.map(g => [g.t, g.rt, g.rn, g.rd ? dt(g.rd) : ""].filter(Boolean).join(" ")).join("  \u00b7  "));
    return out.filter(Boolean).join("\n");
  }

  /* =========================================================================
     9. LAYOUT STANDARD — riproduzione del foglio di stile: solo filetti,
        nessuna intestazione, celle squadrate
     ========================================================================= */
  const NERO = "#000000", FILO = 0.25;

  /* griglia a blocchi: ogni riga porta le proprie colonne, come nel modello */
  function griglia(pdf, righe){
    const x0 = pdf.left;
    righe.forEach((r, idx) => {
      const size = r.size || (r.head ? 7 : 8);
      const grassetto = r.head === true || r.bold === true;
      const pad = 1.1, lh = (size * 1.3) / MM;
      const testi = r.celle.map(c => {
        let out = [];
        String(c.t == null ? "" : c.t).split("\n").forEach(part => {
          out = out.concat(pdf.wrap(part, c.w - 2 * pad, size, grassetto || c.bold));
        });
        return out;
      });
      const h = Math.max(r.minH || 4.7, Math.max.apply(null, testi.map(t => t.length)) * lh + 1.9);
      let primo = idx === 0;
      if (pdf.y + h > pdf.H - pdf.bottom) { pdf.addPage(); primo = true; }
      const y = pdf.y, tot = r.celle.reduce((t, c) => t + c.w, 0);
      if (primo || righe[idx - 1].head || r.head) pdf.line(x0, y, x0 + tot, y, { color:NERO, lw:FILO });
      let x = x0;
      pdf.line(x, y, x, y + h, { color:NERO, lw:FILO });
      r.celle.forEach((c, i) => {
        const al = c.align || (r.head ? "center" : "left");
        const tx = al === "right" ? x + c.w - pad : (al === "center" ? x + c.w / 2 : x + pad);
        pdf.textLines(tx, y + 0.95, testi[i], { size, lh, bold:grassetto || c.bold, align:al, color:NERO });
        x += c.w;
        pdf.line(x, y, x, y + h, { color:NERO, lw:FILO });
      });
      pdf.y = y + h;
      if (r.head || idx === righe.length - 1) pdf.line(x0, pdf.y, x0 + tot, pdf.y, { color:NERO, lw:FILO });
    });
    pdf.y += 3.6;
  }

  /* i due riquadri anagrafici in testa alla pagina */
  function riquadri(pdf, inv){
    const bw = (pdf.innerW - 1.6) / 2, pad = 2.2, lh = 3.9;
    const comp = a => {
      if (!a) return [];
      const r = [];
      if (a.piva) r.push("Identificativo fiscale ai fini IVA: " + a.piva);
      if (a.cf) r.push("Codice fiscale: " + a.cf);
      if (a.nome) r.push((a.persona ? "Cognome nome: " : "Denominazione: ") + a.nome);
      if (a.eori) r.push("Codice EORI: " + a.eori);
      if (a.regime) r.push("Regime fiscale: " + a.regime + (T_REGIME[a.regime] ? " " + T_REGIME[a.regime].toLowerCase() : ""));
      if (a.albo) r.push("Albo professionale: " + a.albo);
      if (a.via) r.push("Indirizzo: " + a.via);
      if (a.comune) r.push("Comune: " + a.comune + (a.prov ? " Provincia: " + a.prov : ""));
      if (a.cap || a.nazAll) r.push([a.cap ? "Cap: " + a.cap : "", a.nazAll ? "Nazione: " + a.nazAll : ""].filter(Boolean).join(" "));
      if (a.stabile) r.push("Stabile organizzazione: " + a.stabile);
      if (a.rea) r.push(["Iscrizione REA: " + a.rea,
        a.reaCap ? "Capitale sociale: " + eur(a.reaCap) : "",
        a.reaSocio ? a.reaSocio + (T_SU[a.reaSocio] ? " (" + T_SU[a.reaSocio] + ")" : "") : "",
        a.reaLiq ? a.reaLiq + (T_LIQ[a.reaLiq] ? " (" + T_LIQ[a.reaLiq] + ")" : "") : ""]
        .filter(Boolean).join(" \u00b7 "));
      if (a.rappr) r.push("Rappresentante fiscale: " + a.rappr);
      if (a.tel) r.push("Telefono: " + a.tel);
      if (a.fax) r.push("Fax: " + a.fax);
      if (a.mail) r.push("Email: " + a.mail);
      if (a.rifAmm) r.push("Riferimento amministrazione: " + a.rifAmm);
      return r;
    };
    const sx = [{ t:"Cedente/prestatore (fornitore)", b:true }]
      .concat(comp(inv.cedente).map(t => ({ t })));
    if (inv.rappr && inv.rappr.nome !== "(anagrafica assente)")
      sx.push({ t:"", b:false }, { t:"Rappresentante fiscale", b:true }, ...comp(inv.rappr).map(t => ({ t })));
    if (inv.terzo && inv.terzo.nome !== "(anagrafica assente)")
      sx.push({ t:"", b:false }, { t:"Terzo Intermediario", b:true }, ...comp(inv.terzo).map(t => ({ t })));
    const dx = [{ t:"Cessionario/committente (cliente)", b:true }]
      .concat(comp(inv.cessionario).map(t => ({ t })));

    const spezza = arr => {
      const out = [];
      arr.forEach(o => {
        if (o.t === "") { out.push({ t:"", b:false }); return; }
        pdf.wrap(o.t, bw - 2 * pad, o.b ? 8.5 : 8, !!o.b).forEach(l => out.push({ t:l, b:!!o.b }));
      });
      return out;
    };
    const L = spezza(sx), R = spezza(dx);
    const h = Math.max(L.length, R.length) * lh + 2 * pad + 0.6;
    const disegna = (x, righe) => {
      pdf.rect(x, pdf.y, bw, h, { stroke:NERO, lw:FILO });
      righe.forEach((o, i) => pdf.text(x + pad, pdf.y + pad + i * lh, o.t,
        { size:o.b ? 8.5 : 8, bold:o.b, color:NERO }));
    };
    disegna(pdf.left, L);
    disegna(pdf.left + bw + 1.6, R);
    pdf.y += h + 3.6;
  }

  function renderStandard(inv){
    const pdf = new PDF({ top:12, bottom:11, left:8, right:8 });
    const W = pdf.innerW;
    riquadri(pdf, inv);

    /* dati generali del documento */
    griglia(pdf, [
      { head:true, celle:[{ t:"Tipologia documento", w:46 }, { t:"Art. 73", w:18 },
        { t:"Numero documento", w:40 }, { t:"Data documento", w:28 }, { t:"Divisa", w:18 },
        { t:"Codice destinatario", w:44 }] },
      { celle:[{ t:inv.tipo + (T_DOC[inv.tipo] ? " " + T_DOC[inv.tipo].toLowerCase() : ""), w:46 },
        { t:inv.art73, w:18, align:"center" }, { t:inv.numero, w:40, align:"center" },
        { t:dtDash(inv.data), w:28, align:"center" }, { t:inv.divisa, w:18, align:"center" },
        { t:inv.trasm.destinatario, w:44, align:"center" }] }
    ]);

    /* dati della trasmissione */
    const t = inv.trasm;
    griglia(pdf, [
      { head:true, celle:[{ t:"Identificativo trasmittente", w:40 }, { t:"Progressivo invio", w:26 },
        { t:"Formato", w:22 }, { t:"PEC destinatario", w:48 }, { t:"Contatti trasmittente", w:34 },
        { t:"Soggetto emittente", w:24 }] },
      { celle:[{ t:(t.idPaese || "") + (t.idCodice || ""), w:40 }, { t:t.progressivo, w:26, align:"center" },
        { t:t.formato, w:22, align:"center" }, { t:t.pec, w:48 },
        { t:[t.tel, t.mail].filter(Boolean).join("\n"), w:34 },
        { t:inv.emittente + (T_SOGG[inv.emittente] ? " " + T_SOGG[inv.emittente] : ""), w:24, align:"center" }] }
    ]);

    if (inv.rettifica)
      griglia(pdf, [{ head:true, celle:[{ t:"Fattura rettificata \u2014 numero", w:60 },
        { t:"Data", w:40 }, { t:"Elementi rettificati", w:94 }] },
        { celle:[{ t:inv.rettifica.numero, w:60 }, { t:dtDash(inv.rettifica.data), w:40, align:"center" },
          { t:inv.rettifica.elementi, w:94 }] }]);

    if (inv.causali.length)
      griglia(pdf, [{ head:true, celle:[{ t:"Causale", w:W }] }]
        .concat(inv.causali.map(c => ({ celle:[{ t:c, w:W }] }))));

    const rif = [];
    const cell5 = (et, id, data, linea, commessa, cup, cig) => ({ celle:[
      { t:et, w:36 }, { t:id, w:40 }, { t:dtDash(data), w:24, align:"center" },
      { t:linea, w:20, align:"center" }, { t:commessa, w:24 },
      { t:cup, w:25 }, { t:cig, w:25 }] });
    const agg = (et, list) => list.forEach(o => rif.push(cell5(et, o.id, o.data,
      [o.rifLinea ? "linea " + o.rifLinea : "", o.numItem ? "item " + o.numItem : ""].filter(Boolean).join(" \u00b7 "),
      o.commessa, o.cup, o.cig)));
    agg("Ordine di acquisto", inv.ordini); agg("Contratto", inv.contratti);
    agg("Convenzione", inv.convenzioni); agg("Ricezione", inv.ricezioni);
    agg("Fattura collegata", inv.collegate);
    inv.ddt.forEach(d => rif.push(cell5("Documento di trasporto", d.numero, d.data,
      d.rifLinea ? "linea " + d.rifLinea : "", "", "", "")));
    inv.sal.forEach(o => rif.push(cell5("Stato avanzamento lavori", "", "", "fase " + o.fase, "", "", "")));
    if (inv.principale) rif.push(cell5("Fattura principale", inv.principale.numero, inv.principale.data, "", "", "", ""));
    if (rif.length)
      griglia(pdf, [{ head:true, celle:[{ t:"Documenti correlati", w:36 }, { t:"Numero", w:40 },
        { t:"Data", w:24 }, { t:"Linea / item", w:20 }, { t:"Commessa", w:24 },
        { t:"CUP", w:25 }, { t:"CIG", w:25 }] }].concat(rif));

    /* trasporto */
    if (inv.trasporto && Object.keys(inv.trasporto).some(k => inv.trasporto[k])) {
      const tr = inv.trasporto;
      const bl = [
        { head:true, celle:[{ t:"Vettore", w:56 }, { t:"N. licenza guida", w:26 },
          { t:"Causale trasporto", w:30 }, { t:"Colli", w:14 }, { t:"Aspetto beni", w:34 }, { t:"Mezzo", w:34 }] },
        { celle:[{ t:[tr.vettore, tr.vettorePiva].filter(Boolean).join(" \u2014 "), w:56 },
          { t:tr.licenza, w:26 }, { t:tr.causale, w:30 }, { t:tr.colli, w:14, align:"center" },
          { t:tr.aspetto, w:34 }, { t:tr.mezzo, w:34 }] },
        { head:true, celle:[{ t:"Peso lordo", w:28 }, { t:"Peso netto", w:28 }, { t:"Data ritiro", w:32 },
          { t:"Inizio trasporto", w:32 }, { t:"Consegna", w:32 }, { t:"Tipo resa", w:42 }] },
        { celle:[{ t:peso(tr.pesoLordo, tr.um), w:28, align:"right" },
          { t:peso(tr.pesoNetto, tr.um), w:28, align:"right" },
          { t:dtDash(tr.ritiro), w:32, align:"center" }, { t:dtDash(tr.inizio), w:32, align:"center" },
          { t:dtDash(tr.consegna), w:32, align:"center" }, { t:tr.resa, w:42 }] }
      ];
      if (tr.indirizzoResa) {
        bl.push({ head:true, celle:[{ t:"Indirizzo di resa", w:W }] });
        bl.push({ celle:[{ t:tr.indirizzoResa, w:W }] });
      }
      griglia(pdf, bl);
    }

    if (inv.veicoli && (inv.veicoli.data || inv.veicoli.percorso))
      griglia(pdf, [{ head:true, celle:[{ t:"Veicoli \u2014 data immatricolazione o prima iscrizione", w:97 },
        { t:"Totale percorso", w:97 }] },
        { celle:[{ t:dtDash(inv.veicoli.data), w:97, align:"center" },
          { t:inv.veicoli.percorso, w:97, align:"right" }] }]);

    if (inv.casse.length)
      griglia(pdf, [{ head:true, celle:[{ t:"Tipo cassa", w:46 }, { t:"Aliq. cassa", w:18 },
        { t:"Imponibile cassa", w:26 }, { t:"Contributo cassa", w:26 }, { t:"%IVA", w:14 },
        { t:"Ritenuta", w:14 }, { t:"Natura", w:16 }, { t:"Rif. amministrazione", w:34 }] }]
        .concat(inv.casse.map(c => ({ celle:[
          { t:c.tipo + (T_CASSA[c.tipo] ? " " + T_CASSA[c.tipo].toLowerCase() : ""), w:46 },
          { t:nf(c.aliquota, 2), w:18, align:"right" }, { t:eur(c.imponibile), w:26, align:"right" },
          { t:eur(c.importo), w:26, align:"right" }, { t:nf(c.iva, 2), w:14, align:"right" },
          { t:c.ritenuta === "SI" ? "SI" : "", w:14, align:"center" }, { t:c.natura, w:16, align:"center" },
          { t:c.rifAmm, w:34 }] }))));

    if (inv.ritenute.length)
      griglia(pdf, [{ head:true, celle:[{ t:"Tipo ritenuta", w:60 }, { t:"Aliquota ritenuta", w:26 },
        { t:"Importo ritenuta", w:34 }, { t:"Causale di pagamento", w:74 }] }]
        .concat(inv.ritenute.map(r => ({ celle:[
          { t:r.tipo + (T_RIT[r.tipo] ? " " + T_RIT[r.tipo].toLowerCase() : ""), w:60 },
          { t:nf(r.aliquota, 2), w:26, align:"right" }, { t:eur(r.importo), w:34, align:"right" },
          { t:r.causale, w:74 }] }))));

    /* linee di dettaglio */
    griglia(pdf, [{ head:true, celle:[{ t:"Cod. articolo", w:27 }, { t:"Descrizione", w:57 },
      { t:"Quantità", w:20 }, { t:"Prezzo unitario", w:24 }, { t:"UM", w:12 },
      { t:"Sconto o magg.", w:18 }, { t:"%IVA", w:14 }, { t:"Prezzo totale", w:22 }] }]
      .concat(inv.righe.map(l => ({ celle:[
        { t:(l.codici || []).map(c => [c.t, c.v].filter(Boolean).join(" ")).join("\n"), w:27 },
        { t:descrizioneEstesa(l, false), w:57 },
        { t:qty(l.qta), w:20, align:"right" },
        { t:price(l.prezzo), w:24, align:"right" },
        { t:l.um, w:12, align:"center" },
        { t:scontoTxt(l.sconti), w:18, align:"right" },
        { t:l.natura ? l.natura : nf(l.iva, 2), w:14, align:"right" },
        { t:eur(l.totale), w:22, align:"right" }] }))));

    /* riepiloghi IVA e totali */
    const cassa = (inv.casse || []).reduce((t, c) => t + (c.importo || 0), 0);
    const sconti = inv.scontiDoc.map(x => (T_SM[x.tipo] || x.tipo) + " " +
      (x.perc != null ? nf(x.perc, 2) + "%" : "") + (x.importo != null ? " " + eur(x.importo) : "")).join("  ");
    const blocco = [
      { head:true, celle:[{ t:"RIEPILOGHI IVA E TOTALI", w:W }] },
      { head:true, celle:[{ t:"esigibilità iva / riferimenti normativi", w:74 }, { t:"%IVA", w:18 },
        { t:"Spese accessorie", w:22 }, { t:"Arr.", w:16 }, { t:"Totale imponibile", w:32 }, { t:"Totale imposta", w:32 }] }
    ];
    inv.riepiloghi.forEach(r => blocco.push({ celle:[
      { t:[r.esigibilita ? (T_ESIG[r.esigibilita] || r.esigibilita) : "Esigib. non dich. (si presume immediata)", r.norma].filter(Boolean).join("\n"), w:74 },
      { t:r.natura ? r.natura : nf(r.iva, 2), w:18, align:"right" },
      { t:r.spese != null ? eur(r.spese) : "", w:22, align:"right" },
      { t:r.arrot != null ? eur(r.arrot) : "", w:16, align:"right" },
      { t:eur(r.imponibile), w:32, align:"right" }, { t:eur(r.imposta), w:32, align:"right" }] }));
    blocco.push({ head:true, celle:[{ t:"Importo bollo", w:42 }, { t:"Sconto/Maggiorazione", w:66 },
      { t:"Arr.", w:22 }, { t:"Totale documento", w:64 }] });
    blocco.push({ celle:[
      { t:inv.bollo ? [inv.bollo.importo != null ? eur(inv.bollo.importo) : "",
          inv.bollo.virtuale ? "virtuale " + inv.bollo.virtuale : ""].filter(Boolean).join(" \u2014 ") : "", w:42, align:"right" },
      { t:sconti, w:66 }, { t:inv.arrotondamento != null ? eur(inv.arrotondamento) : "", w:22, align:"right" },
      { t:inv.totale == null ? "" : eur(inv.totale), w:64, align:"right" }] });
    if (cassa || inv.ritenutaTot)
      blocco.push({ head:true, celle:[{ t:"Contributo cassa", w:97 }, { t:"Ritenuta d'acconto", w:97 }] },
        { celle:[{ t:cassa ? eur(cassa) : "", w:97, align:"right" },
          { t:inv.ritenutaTot ? eur(inv.ritenutaTot) : "", w:97, align:"right" }] });
    griglia(pdf, blocco);

    /* pagamento */
    const dett = inv.pagamenti.reduce((a2, p) => a2.concat(p.dettagli.map(d => Object.assign({ cond:p.condizioni }, d))), []);
    if (dett.length)
      griglia(pdf, [{ head:true, celle:[{ t:"Modalità pagamento", w:42 }, { t:"Beneficiario", w:36 },
        { t:"Dettagli", w:62 }, { t:"Scadenze", w:30 }, { t:"Importo", w:24 }] }]
        .concat(dett.map(d => ({ celle:[
          { t:(d.modalita || "") + (T_PAG[d.modalita] ? " " + T_PAG[d.modalita] : ""), w:42 },
          { t:d.beneficiario, w:36 },
          { t:dettagliPagamento(d), w:62 },
          { t:scadenzaPagamento(d), w:30, align:"center" },
          { t:eur(d.importo), w:24, align:"right" }] }))));

    if (inv.allegati.length)
      griglia(pdf, [{ head:true, celle:[{ t:"Allegato", w:60 }, { t:"Formato", w:24 },
        { t:"Compressione", w:28 }, { t:"Descrizione", w:82 }] }]
        .concat(inv.allegati.map(a2 => ({ celle:[{ t:a2.nome, w:60 },
          { t:a2.formato, w:24, align:"center" }, { t:a2.algoritmo, w:28, align:"center" },
          { t:a2.desc, w:82 }] }))));

    /* numero di pagina solo se il documento ne occupa più di una */
    const n = pdf.pages.length;
    if (n > 1) for (let i = 0; i < n; i++) {
      pdf.ops = pdf.pages[i];
      pdf.text(pdf.W - pdf.right, pdf.H - pdf.bottom + 3.5, "Pag. " + (i + 1) + " di " + n,
        { size:7, align:"right", color:"#3D3D3D" });
    }
    return pdf;
  }

  /* =========================================================================
     10. NOME DEL FILE
     ========================================================================= */
  function controparte(inv, tipo){
    return tipo === "passive" ? inv.cedente : inv.cessionario;
  }
  function pulisci(s, finale){
    let v = String(s || "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    /* Windows non tollera punti o spazi in coda: li tolgo solo al nome completo */
    if (finale) v = v.replace(/[.\s]+$/, "").trim();
    return v;
  }
  function nomeFile(inv, cfg){
    const cp = controparte(inv, cfg.tipo);
    const prefisso = cfg.tipopref ? inv.tipoBreve : "Fattura";
    let nome = pulisci(cp.nome);
    if (nome.length > 70) nome = nome.slice(0, 70).replace(/\s+\S*$/, "").trim();
    if (!nome) nome = "Controparte";
    let base = prefisso + " " + nome + " n. " + pulisci(inv.numero) + " del " + dtFile(inv.data);
    base = pulisci(base, true);
    if (base.length > 150) base = base.slice(0, 150).trim();
    return base + ".pdf";
  }
  function nomiUnivoci(list, cfg){
    const visti = new Map();
    return list.map(inv => {
      let nome = nomeFile(inv, cfg);
      const chiave = nome.toLowerCase();
      if (visti.has(chiave)) {
        const k = visti.get(chiave) + 1;
        visti.set(chiave, k);
        nome = nome.replace(/\.pdf$/i, "") + " (" + k + ").pdf";
      } else visti.set(chiave, 1);
      return nome;
    });
  }


  /* =========================================================================
     7. ESPLOSIONE IN RIGHE DI PRESTAZIONE
     Una riga per ogni DettaglioLinee. Imposta e ritenuta non esistono a
     livello di riga nel tracciato: vengono derivate e la derivazione è
     dichiarata, non nascosta.
     ========================================================================= */
  function nomeControparte(inv, tipo){
    const a = controparte(inv, tipo);
    return a && a.nome ? a.nome : "";
  }
  function codiceIvaRiga(l){
    if (l.natura) return l.natura;
    return l.iva != null ? nf(l.iva, l.iva % 1 ? 2 : 0) + "%" : "";
  }
  /* ripartizione di un totale di documento sulle righe, in proporzione
     all'importo, con l'ultimo centesimo assegnato per differenza */
  function riparti(totale, pesi){
    const somma = pesi.reduce((a, v) => a + Math.abs(v), 0);
    const out = pesi.map(() => 0);
    if (!totale || !somma) return out;
    let residuo = totale;
    for (let i = 0; i < pesi.length; i++) {
      if (i === pesi.length - 1) { out[i] = Math.round(residuo * 100) / 100; break; }
      const q = Math.round(totale * (Math.abs(pesi[i]) / somma) * 100) / 100;
      out[i] = q; residuo -= q;
    }
    return out;
  }
  function scontiRiga(l){
    return (l.sconti || []).map(s2 => [(s2.tipo || ""),
      (T_SM[s2.tipo] ? T_SM[s2.tipo].toLowerCase() : ""),
      (s2.perc != null ? nf(s2.perc, 2) + "%" : ""),
      (s2.importo != null ? eur(s2.importo) : "")].filter(Boolean).join(" ")).join("  \u00b7  ");
  }
  function gestionaliRiga(l){
    return (l.gestionali || []).map(g => [g.t, g.rt, g.rn, g.rd ? dt(g.rd) : ""]
      .filter(Boolean).join(" ")).join("  \u00b7  ");
  }
  /* Il riferimento normativo non sta nella riga di dettaglio delle fatture
     ordinarie ma nel riepilogo IVA: lo si ritrova abbinando aliquota e natura.
     Nelle semplificate è invece già sulla riga. */
  function normaRiga(l, inv){
    if (l.norma) return l.norma;
    const nat = l.natura || "";
    const riep = (inv.riepiloghi || []);
    /* prima l'abbinamento pieno su natura e aliquota, poi solo sulla natura */
    let r = riep.find(x => (x.natura || "") === nat &&
      ((x.iva == null && l.iva == null) || Number(x.iva) === Number(l.iva)));
    if (!r && nat) r = riep.find(x => (x.natura || "") === nat);
    if (!r && !nat && riep.length === 1) r = riep[0];
    return r && r.norma ? r.norma : "";
  }
  function codiciRiga(l){
    return (l.codici || []).map(c => [c.t, c.v].filter(Boolean).join(" ")).join("  \u00b7  ");
  }
  function esplodi(inv){
    const righe = inv.righe || [];
    /* 6. una fattura senza righe di dettaglio non deve sparire dall'elenco */
    if (!righe.length) return [{
      id: inv.id + "-0", inv: inv, n: "", vuota: true,
      desc: "", codici: "", qta: null, um: "", prezzo: null, periodo: "",
      sconti: "", gestionali: "", rifAmm: "", cessione: "", conRitenuta: false, norma: "",
      importo: inv.totale != null ? null : null, codIva: (inv.codiciIva || []).join(" \u00b7 "),
      imposta: null, ritenuta: null, derivata: false
    }];
    /* imposta: dall'aliquota della riga, azzerata quando c'è una natura */
    const imposte = righe.map(l => {
      if (l.imposta != null) return l.imposta;
      if (l.natura || !l.iva) return 0;
      return Math.round((l.totale || 0) * l.iva) / 100;
    });
    /* ritenuta: il documento la espone solo in testata. La ripartisco sulle
       righe marcate Ritenuta=SI; se nessuna lo è, su tutte in proporzione. */
    const marcate = righe.map(l => l.ritenuta === "SI");
    const qualcunaMarcata = marcate.some(Boolean);
    const pesi = righe.map((l, i) => (qualcunaMarcata && !marcate[i]) ? 0 : (l.totale || 0));
    const ritenute = riparti(inv.ritenutaTot || 0, pesi);
    return righe.map((l, i) => ({
      id: inv.id + "-" + i,
      inv: inv,
      n: l.n,
      vuota: false,
      /* 7. la descrizione conserva gli a capo originali: si perderebbe la struttura */
      desc: (l.desc || "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ")
        .split("\n").map(x => x.trim()).filter(Boolean).join("\n"),
      codici: codiciRiga(l),
      sconti: scontiRiga(l),
      gestionali: gestionaliRiga(l),
      rifAmm: l.rifAmm || "",
      norma: normaRiga(l, inv),
      cessione: l.tipo ? l.tipo + (T_CESSIONE[l.tipo] ? " " + T_CESSIONE[l.tipo] : "") : "",
      conRitenuta: l.ritenuta === "SI",
      qta: l.qta, um: l.um, prezzo: l.prezzo,
      periodo: (l.dal || l.al) ? (dt(l.dal) + (l.al ? " \u2013 " + dt(l.al) : "")) : "",
      importo: l.totale,
      codIva: codiceIvaRiga(l),
      imposta: imposte[i],
      ritenuta: ritenute[i],
      derivata: l.imposta == null
    }));
  }

  /* =========================================================================
     8. SCRITTURA DEL FILE EXCEL (.xlsx nativo, nessuna libreria)
     ========================================================================= */
  const xmlEsc = s => String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const colonna = n => {
    let s = "";
    n++;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  };
  /* data in numero seriale, come Excel la vuole */
  function serialeData(iso){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    const g = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Math.floor(g / 86400000) + 25569;
  }
  function cella(rif, v, stile){
    if (v == null || v === "") return '<c r="' + rif + '"' + (stile ? ' s="' + stile + '"' : "") + "/>";
    if (typeof v === "number" && isFinite(v))
      return '<c r="' + rif + '"' + (stile ? ' s="' + stile + '"' : "") + "><v>" + v + "</v></c>";
    return '<c r="' + rif + '" t="inlineStr"' + (stile ? ' s="' + stile + '"' : "") +
      "><is><t xml:space=\"preserve\">" + xmlEsc(v) + "</t></is></c>";
  }
  /* intestazioni: array di {label, w, tipo} — tipo: testo | data | importo */
  function xlsx(intestazioni, righe, nomeFoglio){
    const enc = new TextEncoder();
    const S = { testo: 0, data: 2, importo: 3, capo: 1 };
    let sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      "<cols>" + intestazioni.map((h, i) =>
        '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (h.w || 16) + '" customWidth="1"/>').join("") +
      "</cols><sheetData>";
    sheet += '<row r="1">' + intestazioni.map((h, i) =>
      cella(colonna(i) + "1", h.label, S.capo)).join("") + "</row>";
    righe.forEach((r, ri) => {
      const n = ri + 2;
      sheet += '<row r="' + n + '">' + intestazioni.map((h, i) => {
        let v = r[i];
        let st = S.testo;
        if (h.tipo === "data") { const s = serialeData(v); if (s != null) { v = s; st = S.data; } }
        else if (h.tipo === "importo") { v = (v == null || v === "") ? null : Number(v); st = S.importo; }
        return cella(colonna(i) + n, v, st);
      }).join("") + "</row>";
    });
    sheet += "</sheetData><autoFilter ref=\"A1:" + colonna(intestazioni.length - 1) + (righe.length + 1) + "\"/>" +
      '<sheetViews/></worksheet>';
    /* il pannello bloccato va dichiarato prima di sheetData */
    sheet = sheet.replace("<sheetViews/>", "")
      .replace("<cols>", '<sheetViews><sheetView workbookViewId="0" tabSelected="1">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>');

    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
      '<numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDEA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      "</cellXfs></styleSheet>";

    const files = [
      { name: "[Content_Types].xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>") },
      { name: "_rels/.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>") },
      { name: "xl/workbook.xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + xmlEsc((nomeFoglio || "Prestazioni").slice(0, 28)) +
        '" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>") },
      { name: "xl/styles.xml", data: enc.encode(styles) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet) }
    ];
    return zipCreate(files);
  }

  /* =========================================================================
     LETTURA PDF — 1. estrazione di testo e filetti con pdf.js
     Restituisce, per ogni pagina, i frammenti di testo con coordinate
     (origine in alto a sinistra, punti tipografici) e i filetti orizzontali
     e verticali disegnati: servono a ricostruire le celle delle tabelle.
     ========================================================================= */
  const PDF_PAINT = new Set();
  function pdfOps(lib){
    const O = lib.OPS;
    if (!PDF_PAINT.size) [O.stroke, O.closeStroke, O.fill, O.eoFill, O.fillStroke, O.eoFillStroke,
      O.closeFillStroke, O.closeEOFillStroke].forEach(x => PDF_PAINT.add(x));
    return O;
  }
  function molt(m, n){
    return [m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1],
            m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3],
            m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5]];
  }
  function punto(m, x, y){ return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }

  async function estraiPagina(lib, page){
    const O = pdfOps(lib);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent({ disableCombineTextItems: false });
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = lib.Util.transform(vp.transform, it.transform);
      const h = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 8;
      /* solo testo orizzontale: le scritte ruotate non fanno parte delle tabelle */
      if (Math.abs(t[1]) > 0.01 * h || Math.abs(t[2]) > 0.01 * h) continue;
      const w = it.width * vp.scale;
      const font = (tc.styles[it.fontName] && tc.styles[it.fontName].fontFamily) || "";
      items.push({ s: it.str, x0: t[4], x1: t[4] + w, y: t[5], h, f: it.fontName + " " + font });
    }
    /* filetti: percorsi dipinti, con la matrice corrente tracciata a mano */
    const ol = await page.getOperatorList();
    const hr = [], vr = [];
    let ctm = vp.transform.slice();
    const pila = [];
    const fn = ol.fnArray, ar = ol.argsArray;
    for (let i = 0; i < fn.length; i++) {
      const op = fn[i], a = ar[i];
      if (op === O.save) pila.push(ctm.slice());
      else if (op === O.restore) { if (pila.length) ctm = pila.pop(); }
      else if (op === O.transform) ctm = molt(ctm, a);
      else if (op === O.paintFormXObjectBegin) { pila.push(ctm.slice()); if (a && a[0]) ctm = molt(ctm, a[0]); }
      else if (op === O.paintFormXObjectEnd) { if (pila.length) ctm = pila.pop(); }
      else if (op === O.constructPath) {
        /* il percorso conta solo se viene dipinto, non se è un ritaglio */
        let j = i + 1;
        while (j < fn.length && fn[j] === O.constructPath) j++;
        if (j >= fn.length || !PDF_PAINT.has(fn[j])) continue;
        /* il riquadro del percorso arriva come [minX, maxX, minY, maxY] */
        const mm = a[2];
        if (!mm) continue;
        const c = [punto(ctm, mm[0], mm[2]), punto(ctm, mm[1], mm[2]),
                   punto(ctm, mm[0], mm[3]), punto(ctm, mm[1], mm[3])];
        const x0 = Math.min(c[0][0], c[1][0], c[2][0], c[3][0]), x1 = Math.max(c[0][0], c[1][0], c[2][0], c[3][0]);
        const y0 = Math.min(c[0][1], c[1][1], c[2][1], c[3][1]), y1 = Math.max(c[0][1], c[1][1], c[2][1], c[3][1]);
        const w = x1 - x0, h = y1 - y0;
        if (h <= 2.2 && w > 3) hr.push({ x0, x1, y: (y0 + y1) / 2 });
        else if (w <= 2.2 && h > 3) vr.push({ y0, y1, x: (x0 + x1) / 2 });
        else if (w > 3 && h > 3 && fn[j] !== O.fill && fn[j] !== O.eoFill) {
          /* rettangolo tracciato: i suoi quattro lati sono filetti */
          hr.push({ x0, x1, y: y0 }, { x0, x1, y: y1 });
          vr.push({ y0, y1, x: x0 }, { y0, y1, x: x1 });
        }
      }
    }
    return { w: vp.width, h: vp.height, items, hr, vr };
  }
  async function estraiDocumento(lib, bytes, worker){
    const opz = { data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0, useSystemFonts: false };
    if (worker) opz.worker = worker;
    const doc = await lib.getDocument(opz).promise;
    const pagine = [];
    for (let p = 1; p <= doc.numPages; p++) pagine.push(await estraiPagina(lib, await doc.getPage(p)));
    let allegati = null;
    try { allegati = await doc.getAttachments(); } catch (e) { allegati = null; }
    await doc.destroy();
    return { pagine, allegati };
  }

  /* =========================================================================
     LETTURA PDF — 2. interpretazione del layout "foglio di stile"
     Formato riconosciuto: la rappresentazione grafica della fattura
     elettronica con i riquadri "Cedente/prestatore (fornitore)" e
     "Cessionario/committente (cliente)", la tabella "Tipologia documento",
     le linee di dettaglio e il blocco "RIEPILOGHI IVA E TOTALI".
     Qualunque altro formato viene rifiutato con un motivo esplicito:
     meglio un PDF scartato che un dato inventato.
     ========================================================================= */

  /* ---------- numeri, date, testo ---------- */
  function pdfNumero(s){
    if (s == null) return null;
    let t = String(s).replace(/−/g, "-").replace(/[€\s]/g, "").replace(/EUR$/i, "");
    const m = /^\(?([-+]?)(\d[\d.,']*)\)?$/.exec(t);
    if (!m) return null;
    let n = m[2].replace(/'/g, "");
    const neg = m[1] === "-" || /^\(.*\)$/.test(t);
    const uv = n.lastIndexOf(","), up = n.lastIndexOf(".");
    if (uv >= 0 && up >= 0) {
      n = uv > up ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
    } else if (uv >= 0) {
      n = n.replace(",", ".");
    } else if (up >= 0 && /^\d{1,3}(\.\d{3})+$/.test(n)) {
      n = n.replace(/\./g, "");
    }
    const v = parseFloat(n);
    return isNaN(v) ? null : (neg ? -v : v);
  }
  /* il primo numero contenuto in un testo, escluse le percentuali */
  function pdfPrimoNumero(s){
    const t = String(s || "");
    const re = /\(?[-−+]?\d[\d.,]*\)?/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (/^\s*%/.test(t.slice(m.index + m[0].length))) continue;
      const v = pdfNumero(m[0].replace(/[.,]$/, ""));
      if (v != null) return v;
    }
    return null;
  }
  function pdfData(s){
    const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(String(s || ""));
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    const n = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    return n ? n[0] : "";
  }
  const pdfNorm = s => String(s || "").toLowerCase().replace(/[’`]/g, "'")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

  /* ---------- 1. righe di testo ricostruite ---------- */
  function pdfUnici(v, tol){
    v.sort((a, b) => a - b);
    const out = [];
    for (const x of v) if (!out.length || x - out[out.length - 1] > tol) out.push(x);
    return out;
  }
  /* larghezza relativa stimata di un carattere, per localizzare uno spazio dentro un frammento */
  const pdfPesoCar = ch => /\s/.test(ch) ? 0.5 : /[.,:;'il|!1]/.test(ch) ? 0.45 : /[mwMW]/.test(ch) ? 1.4 : 1;
  /* pdf.js a volte fonde in un solo frammento testi di celle adiacenti:
     si spezza sullo spazio più vicino a ciascun filetto verticale che lo attraversa */
  function pdfSpezza(i, pg){
    const yc = i.y - 0.32 * i.h;
    const tagli = pg.vr.filter(v => v.y0 - 1 <= yc && yc <= v.y1 + 1 && v.x > i.x0 + 1 && v.x < i.x1 - 1)
      .map(v => v.x).sort((a, b) => a - b);
    if (!tagli.length || !/\s/.test(i.s.trim())) return [i];
    const pesi = Array.from(i.s).map(pdfPesoCar);
    const tot = pesi.reduce((a, b) => a + b, 0);
    const xDi = k => i.x0 + (i.x1 - i.x0) * pesi.slice(0, k).reduce((a, b) => a + b, 0) / tot;
    const tagliIdx = [];
    tagli.forEach(x => {
      let best = -1, bd = Infinity;
      Array.from(i.s).forEach((ch, k) => {
        if (!/\s/.test(ch)) return;
        const d = Math.abs(xDi(k) + (xDi(k + 1) - xDi(k)) / 2 - x);
        if (d < bd) { bd = d; best = k; }
      });
      if (best > 0 && tagliIdx.indexOf(best) < 0) tagliIdx.push(best);
    });
    tagliIdx.sort((a, b) => a - b);
    const out = [];
    let da = 0;
    tagliIdx.concat([i.s.length]).forEach(k => {
      const s = i.s.slice(da, k);
      if (s.trim()) out.push(Object.assign({}, i, { s, x0: xDi(da), x1: xDi(k) }));
      da = k + 1;
    });
    return out.length ? out : [i];
  }
  function pdfRighe(pagine){
    const out = [];
    pagine.forEach((pg, p) => {
      const it = [].concat.apply([], pg.items.map(i => pdfSpezza(i, pg))).sort((a, b) => a.y - b.y || a.x0 - b.x0);
      const gruppi = [];
      for (const i of it) {
        const g = gruppi.length ? gruppi[gruppi.length - 1] : null;
        if (g && Math.abs(i.y - g.y) <= 0.45 * Math.min(i.h, g.h)) g.items.push(i);
        else gruppi.push({ y: i.y, h: i.h, items: [i] });
      }
      for (const g of gruppi) {
        g.items.sort((a, b) => a.x0 - b.x0);
        const yc = g.y - 0.32 * g.h;
        /* un filetto verticale fra due frammenti li separa sempre: sono celle diverse */
        const tagli = pdfUnici(pg.vr.filter(v => v.y0 - 1 <= yc && yc <= v.y1 + 1).map(v => v.x), 1.6);
        const pezzi = [];
        for (const i of g.items) {
          const u = pezzi.length ? pezzi[pezzi.length - 1] : null;
          const gap = u ? i.x0 - u.x1 : Infinity;
          const lo = u ? Math.min(u.x1, i.x0) - 0.8 : 0, hi = u ? Math.max(u.x1, i.x0) + 0.8 : 0;
          const taglio = u && tagli.some(x => x >= lo && x <= hi);
          if (u && gap < 0.3 * i.h && !taglio) {
            u.s += (gap > 0.12 * i.h && !/\s$/.test(u.s) && !/^\s/.test(i.s) ? " " : "") + i.s;
            u.x1 = Math.max(u.x1, i.x1);
          } else pezzi.push({ s: i.s, x0: i.x0, x1: i.x1, h: i.h });
        }
        pezzi.forEach(z => { z.s = z.s.replace(/\s+/g, " ").trim(); z.cx = (z.x0 + z.x1) / 2; });
        const h = Math.max.apply(null, g.items.map(i => i.h));
        const pz = pezzi.filter(z => z.s);
        out.push({ p, y: g.y, h, yc: g.y - 0.32 * h, pezzi: pz,
          x0: Math.min.apply(null, pz.map(z => z.x0)), x1: Math.max.apply(null, pz.map(z => z.x1)),
          testo: pz.map(z => z.s).join(" ") });
      }
    });
    /* numeri di pagina e diciture a piè di pagina non fanno parte del documento */
    return out.filter(r => r.testo && !/^(pag\.?|pagina)\s*\d+\s*(di|\/)\s*\d+$/i.test(r.testo) &&
      !/^rappresentazione grafica di /i.test(r.testo));
  }

  /* ---------- 2. bande: righe di testo comprese fra gli stessi filetti ---------- */
  function pdfOrizzontali(pg, cx){
    return pdfUnici(pg.hr.filter(r => r.x0 - 1 <= cx && cx <= r.x1 + 1).map(r => r.y), 1.6);
  }
  function pdfIndiceBanda(ys, yc){
    let k = 0;
    while (k < ys.length && ys[k] < yc) k++;
    return k;
  }
  function pdfBanda(pagine, r, cx){
    return r.p * 1000 + pdfIndiceBanda(pdfOrizzontali(pagine[r.p], cx), r.yc);
  }
  /* etichette: frammenti impilati in verticale (intestazioni andate a capo) */
  function pdfEtichette(righe){
    const cl = [];
    righe.forEach(r => r.pezzi.forEach(z => {
      const c = cl.find(c2 => c2.righe.indexOf(r) < 0 &&
        z.x0 < c2.x1 + 0.3 * z.h && z.x1 > c2.x0 - 0.3 * z.h &&
        Math.abs(z.cx - c2.cx) < Math.max(z.x1 - z.x0, c2.x1 - c2.x0) * 0.75 + 2);
      if (c) { c.parti.push(z.s); c.righe.push(r); c.x0 = Math.min(c.x0, z.x0); c.x1 = Math.max(c.x1, z.x1); }
      else cl.push({ parti: [z.s], righe: [r], x0: z.x0, x1: z.x1, cx: z.cx });
    }));
    return cl.sort((a, b) => a.x0 - b.x0).map(c => pdfNorm(c.parti.join(" ")));
  }
  const PDF_PAROLE_TESTA = /^(magg\.?|accessorie|emittente|unitario|totale|imponibile|imposta|documento|articolo|normativi|pagamento|destinatario|invio|trasmittente|ritenuta|cassa|acconto|d'acconto)$/i;
  /* gruppi: righe consecutive nella stessa banda. Senza filetti, una riga di
     sole parole d'intestazione si unisce all'intestazione che la precede. */
  function pdfGruppi(pagine, righe){
    const out = [];
    righe.forEach((r, i) => {
      const g = out.length ? out[out.length - 1] : null;
      if (g && g.p === r.p) {
        const ys = pdfOrizzontali(pagine[r.p], g.cx);
        const ultima = g.righe[g.righe.length - 1];
        if (ys.length && pdfIndiceBanda(ys, g.righe[0].yc) === pdfIndiceBanda(ys, r.yc) &&
            r.y - ultima.y < 3 * Math.max(r.h, ultima.h)) { g.righe.push(r); g.i1 = i + 1; return; }
        if (!ys.length && g.righe.length < 3 && r.y - ultima.y < 1.6 * ultima.h &&
            r.pezzi.every(z => PDF_PAROLE_TESTA.test(z.s))) { g.righe.push(r); g.i1 = i + 1; return; }
      }
      out.push({ p: r.p, cx: (r.x0 + r.x1) / 2, righe: [r], i0: i, i1: i + 1 });
    });
    out.forEach(g => { g.etichette = pdfEtichette(g.righe); g.tipo = pdfTipoGruppo(g); });
    return out;
  }

  /* ---------- 3. riconoscimento delle intestazioni di tabella ---------- */
  const PDF_TABELLE = [
    { k:"doc",    t: n => n.indexOf("tipologia documento") >= 0 && n.indexOf("numero documento") >= 0 },
    { k:"righe",  t: n => n.indexOf("descrizione") >= 0 && (n.indexOf("prezzo totale") >= 0 || n.indexOf("quantita") >= 0) },
    { k:"titriep",t: n => /^riepiloghi iva( e totali)?$/.test(n) },
    { k:"riep",   t: n => n.indexOf("totale imponibile") >= 0 || (n.indexOf("esigibilita") >= 0 && n.indexOf("imposta") >= 0) },
    { k:"tot",    t: n => n.indexOf("totale documento") >= 0 },
    { k:"cassarit", t: n => n.indexOf("contributo cassa") >= 0 && /ritenuta d'? ?acconto/.test(n) },
    /* titoli di sezione su una riga a sé (foglio di stile dell'Agenzia) */
    { k:"titolo", t: n => /^dati (ritenuta d'? ?acconto|cassa previdenziale)$|^allegati:?$/.test(n) },
    { k:"ritenuta", t: n => /tipo ritenuta|aliquota ritenuta/.test(n) && n.indexOf("importo") >= 0 },
    { k:"cassa",  t: n => n.indexOf("tipo cassa") >= 0 || (/% ?contr/.test(n) && n.indexOf("imponibile") >= 0) },
    { k:"causale",t: n => n === "causale" },
    { k:"altro",  t: n => /identificativo trasmittente|documenti correlati|modalita pagamento|causale trasporto|peso lordo|indirizzo di resa|data immatricolazione|fattura rettificata|^allegato .*formato/.test(n) }
  ];
  function pdfTipoGruppo(g){
    /* un'intestazione è corta e non contiene importi */
    if (g.righe.length > 4) return null;
    if (g.etichette.some(e => /^[-+]?[\d.,]+%?$/.test(e) || e.split(" ").length > 8)) return null;
    const n = g.etichette.join(" ");
    for (const t of PDF_TABELLE) if (t.t(n)) return t.k;
    return null;
  }

  /* ---------- 4. colonne e celle ---------- */
  function pdfColonne(pagine, testa, regole){
    const pg = pagine[testa.p];
    const yc = testa.righe[0].yc;
    const xs = pdfUnici(pg.vr.filter(v => v.y0 - 1 <= yc && yc <= v.y1 + 1).map(v => v.x), 1.6);
    const pezzi = [];
    testa.righe.forEach(r => r.pezzi.forEach(z => pezzi.push(z)));
    let col = [];
    if (xs.length >= 2) {
      for (let i = 0; i < xs.length - 1; i++) {
        const dentro = pezzi.filter(z => z.cx > xs[i] && z.cx < xs[i + 1]);
        if (!dentro.length) continue;
        col.push({ x0: xs[i], x1: xs[i + 1], label: pdfNorm(pdfEtichette(testa.righe.map(r =>
          Object.assign({}, r, { pezzi: r.pezzi.filter(z => dentro.indexOf(z) >= 0) }))).join(" ")) });
      }
    }
    if (col.length < 2) {
      /* senza filetti verticali: confini a metà fra le etichette */
      const cl = [];
      const et = pdfEtichette(testa.righe);
      testa.righe.forEach(r => r.pezzi.forEach(z => cl.push(z)));
      const centri = [];
      et.forEach(e => {
        const zs = cl.filter(z => e.indexOf(pdfNorm(z.s)) >= 0);
        const cx = zs.length ? zs.reduce((s, z) => s + z.cx, 0) / zs.length : 0;
        centri.push({ e, cx });
      });
      centri.sort((a, b) => a.cx - b.cx);
      col = centri.map((c, i) => ({
        x0: i ? (centri[i - 1].cx + c.cx) / 2 : -1e9,
        x1: i < centri.length - 1 ? (c.cx + centri[i + 1].cx) / 2 : 1e9,
        label: c.e }));
    }
    col.forEach(c => {
      const r = regole.find(x => x[1].test(c.label));
      c.k = r ? r[0] : null;
    });
    return col;
  }
  /* un frammento va nella colonna con cui si sovrappone di più */
  function pdfCelle(r, col){
    const c = {};
    r.pezzi.forEach(z => {
      let best = null, bv = 0;
      col.forEach(k => {
        const ov = Math.min(z.x1, k.x1) - Math.max(z.x0, k.x0);
        if (ov > bv) { bv = ov; best = k; }
      });
      if (!best) best = col.find(k => z.cx >= k.x0 && z.cx <= k.x1);
      if (!best || !best.k) return;
      c[best.k] = c[best.k] ? c[best.k] + " " + z.s : z.s;
    });
    return c;
  }
  /* righe di una tabella: una banda fra due filetti è una riga; dentro una
     banda con più importi (tabelle senza filetti fra le righe) ogni riga di
     testo va all'ultimo importo che la precede, come nelle celle allineate in alto */
  function pdfRaggruppa(pagine, dati, col, chiaveAncora, colRif){
    const cx = (colRif.x0 + colRif.x1) / 2;
    const bande = [];
    for (const r of dati) {
      const b = pdfBanda(pagine, r, isFinite(cx) ? cx : r.x0);
      if (!bande.length || bande[bande.length - 1].b !== b) bande.push({ b, righe: [] });
      bande[bande.length - 1].righe.push(r);
    }
    const out = [];
    for (const banda of bande) {
      const celle = banda.righe.map(r => ({ r, c: pdfCelle(r, col) }));
      const ancore = celle.filter(x => pdfNumero(x.c[chiaveAncora]) != null);
      if (!ancore.length) {
        if (out.length) out[out.length - 1].linee.push(...celle);
        continue;
      }
      if (ancore.length === 1) { out.push({ ancora: ancore[0], linee: celle }); continue; }
      const gruppi = ancore.map(a => ({ ancora: a, linee: [] }));
      celle.forEach(x => {
        let g = gruppi[0];
        for (const c of gruppi) if (c.ancora.r.y <= x.r.y + 0.3 * x.r.h) g = c;
        g.linee.push(x);
      });
      out.push(...gruppi);
    }
    out.forEach(g => g.linee.sort((a, b) => a.r.p - b.r.p || a.r.y - b.r.y));
    return out;
  }

  /* ---------- 5. riquadri anagrafici ---------- */
  const PDF_ETICHETTE = ["Identificativo fiscale ai fini IVA", "Codice fiscale", "Denominazione",
    "Cognome nome", "Codice EORI", "Regime fiscale", "Albo professionale", "Indirizzo", "Comune",
    "Provincia", "Cap", "Nazione", "Stabile organizzazione", "Iscrizione REA", "Rappresentante fiscale",
    "Telefono", "Fax", "E-mail", "Email", "Riferimento amministrazione", "Partita IVA", "Cognome", "Nome", "Titolo"];
  const PDF_RE_ETICH = new RegExp("(^|\\s)(" + PDF_ETICHETTE.map(e => e.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"))
    .join("|") + ")\\s*:", "gi");
  function pdfCampi(linee){
    const sezioni = { principale: {} };
    let sez = "principale", ultimo = null;
    for (const t of linee) {
      if (/^(terzo intermediario|rappresentante fiscale|soggetto emittente)( o soggetto emittente)?\s*$/i.test(t)) {
        sez = "altro"; sezioni[sez] = sezioni[sez] || {}; ultimo = null; continue;
      }
      const pos = [];
      PDF_RE_ETICH.lastIndex = 0;
      let m;
      while ((m = PDF_RE_ETICH.exec(t)) !== null) pos.push({ i: m.index + m[1].length, l: m[2], fine: m.index + m[0].length });
      if (!pos.length) {
        if (ultimo) sezioni[sez][ultimo] += " " + t;
        continue;
      }
      pos.forEach((x, j) => {
        const v = t.slice(x.fine, j < pos.length - 1 ? pos[j + 1].i : t.length).trim();
        const k = pdfNorm(x.l);
        sezioni[sez][k] = sezioni[sez][k] ? sezioni[sez][k] + " " + v : v;
        ultimo = k;
      });
    }
    return sezioni.principale;
  }
  function pdfAnagrafica(c){
    const piva = (c["identificativo fiscale ai fini iva"] || c["partita iva"] || "").replace(/\s+/g, "");
    const persona = !c.denominazione && !!(c["cognome nome"] || c.cognome || c.nome);
    const nome = (c.denominazione || c["cognome nome"] ||
      [c.titolo, c.nome, c.cognome].filter(Boolean).join(" ") || "").trim();
    const prov = (c.provincia || "").trim(), cap = (c.cap || "").trim(), naz = (c.nazione || "").trim();
    return {
      nome: nome || "(anagrafica assente)", persona,
      piva, pivaRaw: piva.replace(/^[A-Z]{2}(?=\d)/, ""),
      cf: (c["codice fiscale"] || "").replace(/\s+/g, ""),
      eori: c["codice eori"] || "", regime: ((c["regime fiscale"] || "").match(/RF\d{2}/) || [""])[0],
      albo: c["albo professionale"] || "",
      via: c.indirizzo || "", comune: c.comune || "", prov, cap, nazAll: naz, naz: naz && naz !== "IT" ? naz : "",
      citta: [cap, c.comune || "", prov ? "(" + prov + ")" : ""].filter(Boolean).join(" "),
      indirizzo: [c.indirizzo, [cap, c.comune, prov ? "(" + prov + ")" : ""].filter(Boolean).join(" "), naz]
        .filter(Boolean).join(" — "),
      stabile: c["stabile organizzazione"] || "", rappr: c["rappresentante fiscale"] || "",
      rea: c["iscrizione rea"] || "", reaCap: "", reaSocio: "", reaLiq: "",
      tel: c.telefono || "", fax: c.fax || "", mail: c.email || c["e-mail"] || "",
      rifAmm: c["riferimento amministrazione"] || ""
    };
  }
  /* righe da..a escluse le intestazioni: i due riquadri affiancati (o impilati) */
  function pdfRiquadri(righe, da, a){
    const i = righe.findIndex((r, j) => j >= da && j < a && /cedente\s*\/\s*prestatore/i.test(r.testo));
    if (i < 0) return null;
    const rCed = righe[i];
    let xSplit = null, jCess = -1;
    for (let j = i; j < a; j++) {
      const z = righe[j].pezzi.find(x => /cessionario\s*\/\s*committente/i.test(x.s));
      if (z) { jCess = j; if (Math.abs(righe[j].y - rCed.y) < rCed.h) xSplit = z.x0 - 2; break; }
    }
    const sx = [], dx = [];
    for (let j = i + 1; j < a; j++) {
      const r = righe[j];
      if (xSplit != null) {
        const s = r.pezzi.filter(z => z.cx < xSplit).map(z => z.s).join(" ");
        const d = r.pezzi.filter(z => z.cx >= xSplit).map(z => z.s).join(" ");
        if (s) sx.push(s);
        if (d) dx.push(d);
      } else if (j === jCess) continue;
      else (jCess > 0 && j > jCess ? dx : sx).push(r.testo);
    }
    return { cedente: pdfAnagrafica(pdfCampi(sx)), cessionario: pdfAnagrafica(pdfCampi(dx)) };
  }

  /* ---------- 6. tabelle: regole delle colonne ---------- */
  const PDF_REG = {
    doc: [["tipo", /tipologia/], ["art73", /art\.? ?73/], ["numero", /numero/], ["data", /^data/],
          ["divisa", /divisa/], ["dest", /destinatario/]],
    righe: [["cod", /cod/], ["desc", /descrizione/], ["qta", /quantit|q\.?t/], ["prezzo", /prezzo unit/],
            ["um", /^u\.? ?m\.?$/], ["sconto", /sconto|magg/], ["iva", /iva|aliquota/], ["tot", /prezzo totale|importo|totale/]],
    riep: [["esig", /esigibil|riferiment/], ["iva", /%? ?iva|aliquota/], ["spese", /spese/], ["arr", /^arr/],
           ["imp", /imponibile/], ["imposta", /imposta/]],
    tot: [["bollo", /bollo/], ["sconto", /sconto|magg/], ["arr", /^arr/], ["totale", /totale documento/]],
    cassarit: [["cassa", /cassa/], ["rit", /ritenuta/]],
    ritenuta: [["tipo", /tipo ritenuta|dati ritenuta/], ["aliq", /aliquota/], ["importo", /importo/], ["causale", /causale/]],
    cassa: [["tipo", /tipo cassa|dati cassa/], ["aliq", /^aliq|^%? ?contr\.?$/], ["imponibile", /imponibile/],
            ["importo", /^importo$|contributo cassa/], ["iva", /iva/], ["rit", /ritenuta/]],
    causale: [["testo", /causale/]]
  };
  /* una tabella = gruppo d'intestazione + gruppi di dati fino alla prossima intestazione */
  function pdfTabella(pagine, gruppi, gi, fine){
    const testa = gruppi[gi];
    const k = testa.tipo;
    const col = pdfColonne(pagine, testa, PDF_REG[k]);
    const dati = [];
    let j = gi + 1;
    while (j < fine) {
      const t = gruppi[j].tipo;
      if (t) {
        /* intestazione ripetuta su una nuova pagina: la tabella prosegue */
        if (t === k && gruppi[j].p !== testa.p && k === "righe") { j++; continue; }
        break;
      }
      dati.push(...gruppi[j].righe);
      j++;
    }
    return { k, col, dati, fine: j };
  }
  function pdfUnisci(dati, col){
    const c = {};
    dati.forEach(r => { const x = pdfCelle(r, col); for (const z in x) c[z] = c[z] ? c[z] + " " + x[z] : x[z]; });
    return c;
  }

  /* ---------- 7. dalle tabelle al modello dati ---------- */
  function pdfIva(s){
    const t = String(s || "").trim();
    const n = /\bN\d(\.\d)?\b/.exec(t);
    if (n) return { natura: n[0], iva: 0 };
    return { natura: "", iva: pdfNumero(t.replace("%", "")) };
  }
  /* la cella può andare a capo: si ricompone il testo e lo si divide su ogni SC/MG */
  function pdfSconti(linee){
    const t = linee.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!t) return [];
    const parti = /\b(SC|MG)\b/.test(t) ? t.split(/(?=\b(?:SC|MG)\b)/).map(x => x.trim()).filter(Boolean) : [t];
    return parti.map(p => {
      const tipo = (/\b(SC|MG)\b/.exec(p) || [])[1] || (/magg|\+/i.test(p) ? "MG" : "SC");
      const perc = /([\d.,]+)\s*%/.exec(p);
      const resto = p.replace(/([\d.,]+)\s*%/, "").replace(/\b(SC|MG)\b/g, "");
      const imp = /(\d[\d.,]*)/.exec(resto);
      return { tipo, perc: perc ? pdfNumero(perc[1]) : null, importo: imp ? pdfNumero(imp[1]) : null };
    }).filter(x => x.perc != null || x.importo != null);
  }
  const PDF_EXTRA = /^(Tipo cessione\/prestazione:|Soggetta a ritenuta|Periodo:|Rif\. amministrazione:|Dati gestionali:)/;
  function pdfRigaDettaglio(g, n){
    const c = g.ancora.c;
    const desc = [], extra = [];
    let inExtra = false;
    g.linee.forEach(x => {
      const t = (x.c.desc || "").trim();
      if (!t) return;
      if (PDF_EXTRA.test(t)) inExtra = true;
      (inExtra ? extra : desc).push(t);
    });
    const l = { n: String(n), tipo: "", codici: [], desc: desc.join(" "), qta: null, um: "", dal: "", al: "",
      prezzo: null, sconti: [], totale: pdfNumero(c.tot), iva: null, ritenuta: "", natura: "",
      rifAmm: "", gestionali: [] };
    /* un codice andato a capo si ricompone: le parti di sole cifre si uniscono senza spazio */
    const cod = g.linee.map(x => (x.c.cod || "").trim()).filter(Boolean);
    if (cod.length) l.codici.push({ t: "", v: cod.reduce((a, b) => a + (/\d$/.test(a) && /^\d+$/.test(b) ? "" : " ") + b) });
    const prima = k => { const v = g.linee.map(x => x.c[k]).find(Boolean); return v == null ? null : v; };
    l.qta = prima("qta") != null ? pdfNumero(prima("qta")) : null;
    l.prezzo = prima("prezzo") != null ? pdfNumero(prima("prezzo")) : null;
    l.um = (prima("um") || "").trim();
    l.sconti = pdfSconti(g.linee.map(x => x.c.sconto).filter(Boolean));
    const iv = pdfIva(prima("iva"));
    l.iva = iv.iva; l.natura = iv.natura;
    extra.forEach(t => {
      let m;
      if ((m = /^Tipo cessione\/prestazione:\s*(\S+)/.exec(t))) l.tipo = m[1];
      else if (/^Soggetta a ritenuta/.test(t)) l.ritenuta = "SI";
      else if ((m = /^Periodo:\s*(\S+)(?:\s*[–-]\s*(\S+))?/.exec(t))) { l.dal = pdfData(m[1]); l.al = pdfData(m[2]); }
      else if ((m = /^Rif\. amministrazione:\s*(.+)$/.exec(t))) l.rifAmm = m[1];
      else if ((m = /^Dati gestionali:\s*(.+)$/.exec(t))) l.gestionali.push({ t: m[1], rt: "", rn: "", rd: "" });
    });
    return l;
  }
  /* esigibilità in testa alla cella, il resto è il riferimento normativo */
  const PDF_ESIG = /^(esigib\.?\s*non\s*dich\.?\s*\(\s*si\s*presume\s*immediata\s*\)|[IDS]\s*\(\s*(esigibilit[aà]\s*(immediata|differita)|scissione\s*dei\s*pagamenti)\s*\)|immediata|differita|scissione\s*dei\s*pagamenti)\s*/i;
  function pdfEsigibilita(t){
    const m = PDF_ESIG.exec(t);
    if (!m) return { esig: "", norma: t.trim() };
    const n = pdfNorm(m[1]);
    const esig = /non dich|presume/.test(n) ? "" : /scission/.test(n) ? "S" : /differit/.test(n) ? "D" : "I";
    return { esig, norma: t.slice(m[0].length).trim() };
  }
  function pdfDocumento(pagine, gruppi, da, a, base){
    const inv = Object.assign({
      semplificata: false, trasm: { destinatario: "", pec: "", idPaese: "", idCodice: "", progressivo: "", formato: "", tel: "", mail: "" },
      rappr: null, terzo: null, emittente: "", tipo: "", divisa: "EUR", data: "", numero: "", totale: null,
      arrotondamento: null, art73: "", causali: [], ritenute: [], bollo: null, casse: [], scontiDoc: [],
      ordini: [], contratti: [], convenzioni: [], ricezioni: [], collegate: [], ddt: [], sal: [],
      principale: null, veicoli: null, rettifica: null, trasporto: null, righe: [], riepiloghi: [],
      pagamenti: [], allegati: []
    }, base);
    let ritTot = null;
    let gi = da;
    while (gi < a) {
      const k = gruppi[gi].tipo;
      if (!k || k === "titriep" || k === "altro" || !PDF_REG[k]) { gi++; continue; }
      const tb = pdfTabella(pagine, gruppi, gi, a);
      const col = tb.col;
      if (k === "doc") {
        const c = pdfUnisci(tb.dati, col);
        inv.tipo = ((c.tipo || "").match(/TD\d{2}/) || [""])[0];
        inv.numero = (c.numero || "").trim();
        inv.data = pdfData(c.data);
        inv.art73 = (c.art73 || "").trim();
        if (c.divisa) inv.divisa = c.divisa.trim();
        inv.trasm.destinatario = (c.dest || "").trim();
      } else if (k === "righe") {
        const rif = col.find(c => c.k === "desc") || col[0];
        if (rif) pdfRaggruppa(pagine, tb.dati, col, "tot", rif).forEach(g =>
          inv.righe.push(pdfRigaDettaglio(g, inv.righe.length + 1)));
      } else if (k === "riep") {
        const rif = col.find(c => c.k === "esig") || col[0];
        if (rif) pdfRaggruppa(pagine, tb.dati, col, "imp", rif).forEach(g => {
          const c = g.ancora.c;
          const e = pdfEsigibilita(g.linee.map(x => (x.c.esig || "").trim()).filter(Boolean).join(" "));
          const iv = pdfIva(g.linee.map(x => x.c.iva).find(Boolean));
          inv.riepiloghi.push({ iva: iv.iva, natura: iv.natura,
            spese: c.spese ? pdfNumero(c.spese) : null, arrot: c.arr ? pdfNumero(c.arr) : null,
            imponibile: pdfNumero(c.imp), imposta: pdfPrimoNumero(c.imposta) || 0,
            esigibilita: e.esig, norma: e.norma });
        });
      } else if (k === "tot") {
        const c = pdfUnisci(tb.dati, col);
        inv.totale = pdfPrimoNumero(c.totale);
        const b = pdfPrimoNumero(c.bollo), virt = /virtuale\s*(SI|NO)/i.exec(c.bollo || "");
        if (b != null || virt) inv.bollo = { importo: b, virtuale: virt ? virt[1].toUpperCase() : "" };
        if (c.arr) inv.arrotondamento = pdfNumero(c.arr);
      } else if (k === "cassarit") {
        const v = pdfPrimoNumero(pdfUnisci(tb.dati, col).rit);
        if (v != null) ritTot = v;
      } else if (k === "ritenuta") {
        const rif = col.find(c => c.k === "importo") || col[0];
        if (rif) pdfRaggruppa(pagine, tb.dati, col, "importo", rif).forEach(g => {
          const c = g.ancora.c;
          const testo = g.linee.map(x => x.r.testo).join(" ");
          inv.ritenute.push({ tipo: (testo.match(/RT\d{2}/) || [""])[0],
            aliquota: pdfPrimoNumero(c.aliq), importo: pdfNumero(c.importo),
            causale: ((c.causale || "").trim().match(/^[A-Z0-9]{1,2}\b/) || [(c.causale || "").trim()])[0] });
        });
      } else if (k === "cassa") {
        const rif = col.find(c => c.k === "importo") || col[0];
        if (rif) pdfRaggruppa(pagine, tb.dati, col, "importo", rif).forEach(g => {
          const c = g.ancora.c;
          const testo = g.linee.map(x => x.r.testo).join(" ");
          inv.casse.push({ tipo: (testo.match(/TC\d{2}/) || [""])[0], aliquota: pdfPrimoNumero(c.aliq),
            imponibile: pdfPrimoNumero(c.imponibile), importo: pdfNumero(c.importo),
            iva: pdfPrimoNumero(c.iva), ritenuta: /\bSI\b/i.test(c.rit || "") ? "SI" : "", natura: "", rifAmm: "" });
        });
      } else if (k === "causale") {
        const t = tb.dati.map(r => r.testo).join(" ").trim();
        if (t) inv.causali.push(t);
      }
      gi = Math.max(tb.fine, gi + 1);
    }
    if (!inv.ritenute.length && ritTot) inv.ritenute.push({ tipo: "", aliquota: null, importo: ritTot, causale: "" });
    /* metodo di pagamento: il codice MPxx seguito dal suo nome («MP05 Bonifico»), come lo stampa ogni foglio di stile;
       un codice da solo non basta (potrebbe essere un codice articolo) */
    const mp = [];
    for (let j = da; j < a; j++) (gruppi[j].righe || []).forEach(r => {
      const t = String(r.testo || ""), re = /\bMP(0[1-9]|1\d|2[0-3])\b\s*[\u2014\u2013:\-]?\s*([A-Za-zÀ-ÿ]+)/g; let m;
      while ((m = re.exec(t))) {
        const k = "MP" + m[1], nome = T_PAG[k];
        if (nome && nome.split(" ")[0].toLowerCase() === m[2].toLowerCase() && !mp.includes(k)) mp.push(k);
      }
    });
    if (mp.length) inv.pagamenti = [{ condizioni: "", dettagli: mp.map(k => ({ modalita: k, importo: null, daPdf: true })) }];
    return inv;
  }

  /* ---------- 8. controlli di coerenza sul risultato ---------- */
  function pdfVerifica(inv){
    const avvisi = [];
    const tol = 0.02;
    if (!inv.numero) avvisi.push("numero documento non trovato");
    if (!inv.data) avvisi.push("data non trovata");
    if (!inv.cedente || inv.cedente.nome === "(anagrafica assente)") avvisi.push("cedente non trovato");
    if (!inv.cessionario || inv.cessionario.nome === "(anagrafica assente)") avvisi.push("cessionario non trovato");
    if (!inv.righe.length) avvisi.push("nessuna riga di dettaglio letta");
    if (inv.totale == null) avvisi.push("totale documento non trovato");
    inv.righe.forEach(l => {
      if (l.totale == null) { avvisi.push("riga " + l.n + ": importo non leggibile"); return; }
      if (l.qta != null && l.prezzo != null && !l.sconti.length &&
          Math.abs(l.qta * l.prezzo - l.totale) > Math.max(0.011, Math.abs(l.totale) * 0.0005))
        avvisi.push("riga " + l.n + ": quantità × prezzo non corrisponde all'importo");
    });
    const sRighe = inv.righe.reduce((s, l) => s + (l.totale || 0), 0);
    const imp = inv.riepiloghi.reduce((s, r) => s + (r.imponibile || 0), 0);
    const tax = inv.riepiloghi.reduce((s, r) => s + (r.imposta || 0), 0);
    const rit = inv.ritenute.reduce((s, r) => s + (r.importo || 0), 0);
    const bollo = inv.bollo && inv.bollo.importo || 0;
    const spese = inv.riepiloghi.reduce((s, r) => s + (r.spese || 0) + (r.arrot || 0), 0);
    const cassa = inv.casse.reduce((s, c) => s + (c.importo || 0), 0);
    if (!inv.riepiloghi.length) avvisi.push("riepilogo IVA non trovato");
    else if (inv.righe.length &&
        ![0, bollo, spese, -spese, bollo + spese, cassa, cassa + bollo, cassa + spese]
          .some(d => Math.abs(sRighe + d - imp) <= tol) &&
        Math.abs(sRighe + tax - (inv.totale || 0)) > tol)
      avvisi.push("la somma delle righe (" + eur(sRighe) + ") non corrisponde all'imponibile del riepilogo (" + eur(imp) + ")");
    if (inv.totale != null && inv.riepiloghi.length) {
      const lordo = imp + tax, arr = inv.arrotondamento || 0;
      const ok = [lordo, lordo - rit, lordo + bollo, lordo - rit + bollo, sRighe + tax, sRighe + tax - rit]
        .some(v => Math.abs(v + arr - inv.totale) <= tol || Math.abs(v - inv.totale) <= tol);
      if (!ok) avvisi.push("imponibile più imposta non corrisponde al totale documento" +
        (rit ? "" : ": se la fattura ha una ritenuta, nel PDF non è stampata"));
    }
    return avvisi;
  }

  /* ---------- 9. punto d'ingresso ---------- */
  function leggiPdfLayout(pagine, nomeFile){
    if (!pagine.some(p => p.items.length))
      throw new Error("PDF senza testo: probabilmente una scansione, non leggibile senza riconoscimento ottico");
    const righe = pdfRighe(pagine);
    const gruppi = pdfGruppi(pagine, righe);
    const haCed = righe.some(r => /cedente\s*\/\s*prestatore/i.test(r.testo));
    const inizi = [];
    gruppi.forEach((g, i) => { if (g.tipo === "doc") inizi.push(i); });
    if (!haCed || !inizi.length) {
      if (righe.some(r => /dati del cedente \/ prestatore/i.test(r.testo)))
        throw new Error("PDF in layout esteso: si leggono solo i PDF nel layout standard del foglio di stile");
      throw new Error("formato non riconosciuto: si leggono i PDF nel layout del foglio di stile della fattura elettronica");
    }
    const out = [];
    inizi.forEach((da, n) => {
      const a = n < inizi.length - 1 ? inizi[n + 1] : gruppi.length;
      /* i riquadri anagrafici sono gli ultimi che precedono il documento */
      const iDoc = gruppi[da].i0;
      let k = -1;
      for (let j = iDoc - 1; j >= 0; j--) if (/cedente\s*\/\s*prestatore/i.test(righe[j].testo)) { k = j; break; }
      const ana = k >= 0 ? pdfRiquadri(righe, k, iDoc) : null;
      if (!ana) throw new Error("riquadri del cedente e del cessionario non leggibili");
      /* il documento termina dove iniziano i riquadri del successivo */
      let fine = a;
      for (let j = da + 1; j < a; j++) if (gruppi[j].righe.some(r => /cedente\s*\/\s*prestatore/i.test(r.testo))) { fine = j; break; }
      out.push(pdfDocumento(pagine, gruppi, da, fine, {
        srcName: nomeFile, idx: n, tot: inizi.length,
        cedente: ana.cedente, cessionario: ana.cessionario
      }));
    });
    return out;
  }


  /* =========================================================================
     OFFICINA — BrandPDF: la stessa interfaccia della classe PDF (millimetri,
     y dall'alto) ma scritta con pdf-lib e il carattere del marchio (Manrope).
     Le misure del testo vengono dal carattere vero: a capo e tagli restano giusti.
     ========================================================================= */
  const WIN2UNI = {};
  for (const k of Object.keys(UNI2WIN)) { const b = UNI2WIN[k]; if (b >= 128 && b < 160 && !(b in WIN2UNI)) WIN2UNI[b] = String.fromCharCode(+k); }
  const fromWin = s => String(s == null ? "" : s).replace(/[\u0080-\u009F]/g, c => WIN2UNI[c.charCodeAt(0)] || "");
  class BrandPDF {
    constructor(opt, ctx){
      opt = opt || {};
      this.doc = ctx.doc; this.F = ctx.F;
      this.W = 210; this.H = 297;
      this.top = opt.top || 11; this.bottom = opt.bottom || 14; this.left = opt.left || 10; this.right = opt.right || 10;
      this.pages = [];
      this.addPage();
    }
    get innerW(){ return this.W - this.left - this.right; }
    get ops(){ return this.cur; }
    set ops(p){ this.cur = p; }
    addPage(){ const p = this.doc.addPage([595.28, 841.89]); this.pages.push(p); this.cur = p; this.y = this.top; return p; }
    ensure(h){ if (this.y + h > this.H - this.bottom) { this.addPage(); return true; } return false; }
    font(bold){ return bold ? this.F.b : this.F.r; }
    col(hex){ const n = parseInt(String(hex || "#0E0E0E").slice(1), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
    norm(s, bold){ return pdfSafe(this.font(bold), fromWin(s)); }
    wmm(s, size, bold){ return this.font(bold).widthOfTextAtSize(s, size) / MM; }
    rect(x, y, w, h, o){
      o = o || {};
      const r = { x: x * MM, y: (this.H - y - h) * MM, width: w * MM, height: h * MM };
      if (o.fill) this.cur.drawRectangle({ ...r, color: this.col(o.fill) });
      if (o.stroke) this.cur.drawRectangle({ ...r, borderColor: this.col(o.stroke), borderWidth: (o.lw || 0.2) * MM });
    }
    line(x1, y1, x2, y2, o){
      o = o || {};
      this.cur.drawLine({ start: { x: x1 * MM, y: (this.H - y1) * MM }, end: { x: x2 * MM, y: (this.H - y2) * MM }, thickness: (o.lw || 0.2) * MM, color: this.col(o.color || "#000000") });
    }
    text(x, y, s, o){
      o = o || {};
      const size = o.size || 8, bold = !!o.bold;
      let t = this.norm(s, bold);
      if (!t) return 0;
      if (o.max) t = this.clip(t, o.max, size, bold);
      const w = this.wmm(t, size, bold);
      let X = x;
      if (o.align === "right") X = x - w; else if (o.align === "center") X = x - w / 2;
      const base = y + (size * 0.79) / MM;
      this.cur.drawText(t, { x: X * MM, y: (this.H - base) * MM, size, font: this.font(bold), color: this.col(o.color || P.ink) });
      return w;
    }
    clip(s, maxMM, size, bold){
      let t = this.norm(s, bold);
      if (this.wmm(t, size, bold) <= maxMM) return t;
      while (t.length > 1 && this.wmm(t + "…", size, bold) > maxMM) t = t.slice(0, -1);
      return t + "…";
    }
    wrap(s, maxMM, size, bold){
      const t = this.norm(s, bold);
      if (!t) return [""];
      const words = t.split(/\s+/).filter(Boolean), lines = [];
      let cur = "";
      for (let w of words) {
        while (this.wmm(w, size, bold) > maxMM && w.length > 1) {
          let part = w;
          while (part.length > 1 && this.wmm(part, size, bold) > maxMM) part = part.slice(0, -1);
          lines.push(part); w = w.slice(part.length);
        }
        const tt = cur ? cur + " " + w : w;
        if (this.wmm(tt, size, bold) > maxMM && cur) { lines.push(cur); cur = w; } else cur = tt;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    }
    textLines(x, y, lines, o){
      o = o || {};
      const size = o.size || 8, lh = o.lh || (size * 1.22) / MM;
      lines.forEach((ln, i) => this.text(x, y + i * lh, ln, o));
      return lines.length * lh;
    }
  }
  const etichettaDoc = inv => "Rappresentazione grafica di " + (inv.srcName || "documento") +
    (inv.tot > 1 ? " · documento " + (inv.idx + 1) + " di " + inv.tot : "");
  /* layout esteso con il marchio di Officina */
  async function pdfEsteso(inv){
    const doc = await PDFLib.PDFDocument.create();
    const F = await Brand.pdfFonts(doc);
    const prev = [P, BR, mkPdf];
    P = P_BRAND; BR = true; mkPdf = o => new BrandPDF(Object.assign({}, o, { top: 17, bottom: 17 }), { doc, F });
    try { renderMinisteriale(inv); }
    finally { [P, BR, mkPdf] = prev; }
    Brand.decorate(doc, F, { label: etichettaDoc(inv), ml: 12 * MM, mr: 12 * MM, foot: 22 });
    doc.setTitle((inv.tipoLabel || "Fattura") + " n. " + (inv.numero || "") + " del " + dt(inv.data));
    doc.setSubject("Fattura elettronica " + (inv.srcName || ""));
    return doc.save();
  }
  /* il PDF di una fattura: l'originale se viene da un PDF, altrimenti nel layout scelto */
  async function creaPdf(inv, layout){
    if (inv.pdfBytes) return inv.pdfBytes;
    if (layout === "min") return pdfEsteso(inv);
    return renderStandard(inv).output();
  }
  /* acquisizione di un file XML/P7M (ignora i metadati _MT_ dello SdI) */
  function leggiBytes(bytes, name){
    if (/_MT_\d+\.xml$/i.test(name)) return [];
    const xml = carveXml(bytes);
    if (!xml) throw new Error("nessuna fattura elettronica nel file");
    const list = parseFatture(xml, name);
    if (!list.length) throw new Error("il file non contiene corpi fattura");
    return list;
  }
  /* un PDF: se contiene l'XML della fattura si usa quello (dato esatto), altrimenti si legge il layout */
  async function leggiPdf(bytes, nome){
    let r;
    // il motore pronto prima di leggere (alla prima apertura il worker si sta ancora preparando)
    try { PdfJs.load(); if (PDF_PORT_READY) await PDF_PORT_READY; r = await estraiDocumento(pdfjsLib, bytes.slice(), PDF_SHARED_WORKER || null); }
    catch (e) { throw new Error(/password/i.test(e && e.name || "") ? "PDF protetto da password" : "PDF danneggiato o non leggibile"); }
    if (r.allegati) {
      const inc = [];
      for (const k of Object.keys(r.allegati)) {
        const a = r.allegati[k];
        if (!/\.(xml|p7m)$/i.test(a.filename || k)) continue;
        try { inc.push.apply(inc, leggiBytes(a.content, a.filename || k)); } catch (e) { /* allegato non fattura */ }
      }
      if (inc.length) {
        inc.forEach(inv => { inv.origine = "pdfxml"; inv.pdfBytes = bytes; inv.avvisi = []; inv.srcName = nome; });
        return inc;
      }
    }
    /* scansione (nessun testo nel PDF): la pagina si migliora e si legge con l'OCR del motore condiviso, poi le parole
       riconosciute, con la loro posizione, passano allo stesso lettore del layout. Il risultato resta «da verificare». */
    let daScansione = false;
    if (!r.pagine.some(p => p.items.length)) { const o = await pagineDaScansione(bytes, r.pagine); if (o) { r.pagine = o; daScansione = true; } }
    const list = leggiPdfLayout(r.pagine, nome);
    list.forEach(inv => { inv.avvisi = pdfVerifica(inv); if (daScansione) inv.avvisi.unshift("letta da una scansione con il riconoscimento del testo (OCR): verifica numeri e importi"); finalize(inv); inv.origine = "pdf"; inv.daScansione = daScansione; inv.pdfBytes = bytes; });
    return list;
  }
  /* errori tipici dell'OCR sulle fatture stampate: i filetti letti come «|», la barra di «Cedente/prestatore» letta come
     «l», zeri letti come «O» nei codici ministeriali (TD01, RF01, MP05, N2.2) e negli importi, «1T» per «IT» */
  function correggiOcr(t){
    t = String(t || "").trim().replace(/^[|¦]+|[|¦]+$/g, "").trim();
    if (!t || /^[|¦!]+$/.test(t)) return "";
    t = t.replace(/^(cedente|cessionario)[l1I|\\]+(prestatore|committente)/i, "$1/$2");
    const cod = /^(TD|RF|MP|TP|RT|TC)[O0]?([O0-9IlSsB]{2})$/i.exec(t);
    if (cod && /\d/.test(cod[2].replace(/[Oo]/g, "0"))) return cod[1].toUpperCase() + cod[2].replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/[Ss]/g, "5").replace(/B/g, "8");
    if (/^[1lI]T\d{11}$/.test(t)) return "IT" + t.slice(2);
    if (/^N[O0-9][.,]?[O0-9]?$/.test(t) && /\d/.test(t)) return t.replace(/(?<=.)[Oo]/g, "0").replace(",", ".");
    if (/\d/.test(t) && /^[\dOo.,%-]+$/.test(t)) return t.replace(/[Oo]/g, "0");
    return t;
  }
  /* filetti delle tabelle in una scansione: tratti scuri lunghi e sottili nell'immagine già raddrizzata (orizzontali almeno
     il 3% della larghezza, verticali almeno il 2,5% dell'altezza, spessi al più 7 pixel), riportati sulla pagina con P */
  function filettiDaImmagine(img, P){
    const hr = [], vr = [];
    if (!img || !img.g || !img.w) return { hr, vr };
    const W = img.w, H = img.h, g = img.g, SCURO = 205, LH = Math.max(30, Math.round(W * 0.03)), LV = Math.max(30, Math.round(H * 0.025));
    const scuro = i => g[i] < SCURO, BUCO = 4;   // un filetto sottile e chiaro, nella scansione, ha buchi di qualche pixel
    const unisci = (segs, spessore) => {   // tratti su righe (o colonne) vicine e allineate: un filetto solo
      segs.sort((a, b) => a[1] - b[1] || a[0] - b[0]); const out = [];
      for (const s of segs) {
        const u = out.find(o => Math.abs(s[0] - (o.a + o.b) / 2) <= 2.5 && s[1] <= o.x1 + 12 && s[2] >= o.x0 - 12);
        if (u) { u.a = Math.min(u.a, s[0]); u.b = Math.max(u.b, s[0]); u.x0 = Math.min(u.x0, s[1]); u.x1 = Math.max(u.x1, s[2]); } else out.push({ a: s[0], b: s[0], x0: s[1], x1: s[2] });
      }
      return out.filter(o => o.b - o.a + 1 <= spessore);
    };
    const corsa = (scuroIn, n) => { const out = []; let i = 0; while (i < n) { if (!scuroIn(i)) { i++; continue; } let j = i, k = i; while (k + 1 < n && k - j <= BUCO) { k++; if (scuroIn(k)) j = k; } out.push([i, j]); i = j + 1; } return out; };
    const sh = [], sv = [], MIN = 18;
    for (let y = 0; y < H; y++) { const r = y * W; for (const [a, b] of corsa(x => scuro(r + x), W)) if (b - a >= MIN) sh.push([y, a, b]); }
    for (let x = 0; x < W; x++) for (const [a, b] of corsa(y => scuro(y * W + x), H)) if (b - a >= MIN) sv.push([x, a, b]);
    const lunghi = (L, lim) => L.filter(o => o.x1 - o.x0 >= lim);
    for (const o of lunghi(unisci(sh, 7), LH)) { const yc = (o.a + o.b) / 2, a = P(o.x0, yc), b = P(o.x1, yc); hr.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: (a[1] + b[1]) / 2 }); }
    for (const o of lunghi(unisci(sv, 7), LV)) { const xc = (o.a + o.b) / 2, a = P(xc, o.x0), b = P(xc, o.x1); vr.push({ y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), x: (a[0] + b[0]) / 2 }); }
    return { hr, vr };
  }
  async function pagineDaScansione(bytes, pagine){
    if (typeof makeOcrWorker !== "function" && typeof Later !== "undefined") try { Later.all(); } catch (e) { /* moduli già eseguiti */ }
    if (typeof makeOcrWorker !== "function" || typeof ocrRecognizePage !== "function" || typeof OCRPrep === "undefined") return null;
    if (typeof need === "function") await need("tesseract");
    const doc = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    let worker = null;
    try {
      worker = await makeOcrWorker(new Set(["ita"]), 300);
      const out = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const rec = await ocrRecognizePage(worker, doc, p, { dpi: 300 });
        // coordinate della pagina già raddrizzata (in punti): le celle di una riga restano alla stessa altezza
        const sc = rec.r.scale, P = (x, y) => [x / sc, y / sc];
        const base = pagine[p - 1] || {}, fil = filettiDaImmagine(rec.prep.img, P);
        // le parole vicine della stessa riga diventano il testo di una cella, senza scavalcare un filetto verticale
        const items = [];
        for (const line of rec.data.lines || []) {
          const ws = (line.words || []).map(w => ({ t: correggiOcr(w.text), c: w.confidence == null ? 100 : w.confidence, b: w.bbox })).filter(w => w.t && w.b && w.c >= 25)
            .map(w => { const a = P(w.b.x0, w.b.y0), b = P(w.b.x1, w.b.y1); return { s: w.t, x0: a[0], x1: b[0], y0: a[1], y: b[1] }; }).sort((a, b) => a.x0 - b.x0);
          let cur = null;
          for (const w of ws) {
            const h = Math.max(4, w.y - w.y0), yc = (w.y0 + w.y) / 2;
            const taglio = cur && fil.vr.some(v => v.x > cur.x1 - 0.5 && v.x < w.x0 + 0.5 && v.y0 - 2 <= yc && yc <= v.y1 + 2);
            if (cur && !taglio && w.x0 - cur.x1 < 0.9 * h) { cur.s += " " + w.s; cur.x1 = w.x1; cur.y = Math.max(cur.y, w.y); cur.y0 = Math.min(cur.y0, w.y0); }
            else { if (cur) items.push(cur); cur = { s: w.s, x0: w.x0, x1: w.x1, y0: w.y0, y: w.y }; }
          }
          if (cur) items.push(cur);
        }
        items.forEach(i => { i.h = Math.max(4, i.y - i.y0); i.f = "ocr"; delete i.y0; });
        out.push({ w: base.w, h: base.h, items, hr: (base.hr || []).concat(fil.hr), vr: (base.vr || []).concat(fil.vr) });
      }
      return out.some(x => x.items.length) ? out : null;
    } catch (e) { console.warn("fattura da scansione", e); return null; }
    finally { try { await worker?.terminate(); } catch (e) { /* già chiuso */ } try { await doc.destroy(); } catch (e) { /* già chiuso */ } }
  }
  /* allegati della fattura (di solito la copia di cortesia in PDF): nome, tipo, byte */
  function allegati(inv){
    return (inv.allegati || []).filter(a => a.dati).map(a => {
      let bytes = null;
      try { const bin = atob(a.dati.replace(/\s+/g, "")); bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); } catch (e) { bytes = null; }
      if (!bytes || !bytes.length) return null;
      let nome = pulisci(a.nome || "allegato", true) || "allegato";
      const fmt = (a.formato || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (fmt && !/\.[a-z0-9]{2,5}$/i.test(nome)) nome += "." + fmt;
      if (a.algoritmo && /zip/i.test(a.algoritmo) && !/\.zip$/i.test(nome)) nome += ".zip";
      return { nome, desc: a.desc, formato: a.formato, compresso: !!a.algoritmo, bytes };
    }).filter(Boolean);
  }
  return {
    leggiBytes, leggiPdf, zipRead, zipCreate, creaPdf, allegati, nomeFile, nomiUnivoci, esplodi, finalize,
    controparte, nomeControparte, serialeData, parseFatture, carveXml, estraiCms,
    fmt: { eur, qty, price, dt, dtFile, dtDash, nf },
    tabelle: { T_DOC, T_DOC_BREVE, T_NATURA, T_PAG, PAG_FAM, PAG_FAM_NOME }, metodoPagamento, metodoBreve, metodoTitolo, pagChip, SOGLIA_CONTANTI,
    _render: { renderStandard, renderMinisteriale, pdfEsteso },
    _scansione: { pagineDaScansione, pdfRighe, pdfGruppi, correggiOcr, estraiDocumento },
  };
})();
