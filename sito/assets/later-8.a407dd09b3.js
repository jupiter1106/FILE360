const FirmaKit = (() => {
  /* ---------- BER / DER ---------- */
  function node(b, p, depth = 0) {
    if (depth > 60) throw new Error('struttura ASN.1 troppo profonda');
    const s = p;
    if (p >= b.length) throw new Error('ASN.1 troncato');
    const t = b[p++];
    let num = t & 0x1f;
    if (num === 0x1f) { num = 0; let c; do { c = b[p++]; num = num * 128 + (c & 0x7f); } while (c & 0x80); }
    let len = b[p++];
    if (len === undefined) throw new Error('ASN.1 troncato');
    if (len === 0x80) len = -1;
    else if (len & 0x80) { const n = len & 0x7f; if (n > 6) throw new Error('lunghezza ASN.1 non valida'); len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p++]; }
    const cons = !!(t & 0x20), vs = p;
    let kids = null, ve;
    if (len === -1) {
      if (!cons) throw new Error('lunghezza indefinita su valore primitivo');
      kids = [];
      while (!(b[p] === 0 && b[p + 1] === 0)) { if (p >= b.length) throw new Error('ASN.1 troncato'); const k = node(b, p, depth + 1); kids.push(k); p = k.end; }
      ve = p; p += 2;
    } else {
      ve = vs + len; if (ve > b.length) throw new Error('ASN.1 troncato');
      if (cons) { kids = []; let q = vs; while (q < ve) { const k = node(b, q, depth + 1); kids.push(k); q = k.end; } }
      p = ve;
    }
    return { cls: t >> 6, cons, num, tag: t, s, vs, ve, end: p, kids, b, indef: len === -1 };
  }
  const parse = b => node(b, 0);
  const val = n => n.b.subarray(n.vs, n.ve);
  const raw = n => n.b.subarray(n.s, n.end);
  function octets(n) { // OCTET STRING anche «costruita» (spezzata in pezzi)
    if (!n.cons) return val(n);
    const parts = n.kids.map(octets), len = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(len);
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const isCtx = (n, k) => n && n.cls === 2 && n.num === k;
  function oid(n) {
    const v = val(n), out = [];
    let x = 0;
    for (let i = 0; i < v.length; i++) { x = x * 128 + (v[i] & 0x7f); if (!(v[i] & 0x80)) { if (!out.length) { const a = x < 80 ? Math.floor(x / 40) : 2; out.push(a, x - a * 40); } else out.push(x); x = 0; } }
    return out.join('.');
  }
  const hex = u => [...u].map(x => x.toString(16).padStart(2, '0')).join('');
  const intHex = n => { let v = val(n); while (v.length > 1 && v[0] === 0) v = v.subarray(1); return hex(v).toUpperCase(); };
  const intNum = n => { let x = 0; for (const c of val(n)) x = x * 256 + c; return x; };
  function str(n) {
    const v = val(n);
    switch (n.num) {
      case 12: return new TextDecoder('utf-8').decode(v);
      case 30: { let s = ''; for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode(v[i] << 8 | v[i + 1]); return s; }
      case 28: { let s = ''; for (let i = 0; i + 3 < v.length; i += 4) s += String.fromCodePoint(v[i] << 24 | v[i + 1] << 16 | v[i + 2] << 8 | v[i + 3]); return s; }
      default: { const s = new TextDecoder('latin1').decode(v); try { return /[\xc0-\xff][\x80-\xbf]/.test(s) ? new TextDecoder('utf-8', { fatal: true }).decode(v) : s; } catch { return s; } }
    }
  }
  function time(n) {
    const s = new TextDecoder('latin1').decode(val(n));
    const m = n.num === 23 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(Z|[+-]\d{4})?$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)?(\d\d)?(?:[.,](\d+))?(Z|[+-]\d{4})?$/.exec(s);
    if (!m) return null;
    let y = +m[1]; if (n.num === 23) y += y < 50 ? 2000 : 1900;
    const ms = n.num === 24 && m[7] ? Math.round(+('0.' + m[7]) * 1000) : 0;
    const tz = n.num === 23 ? m[7] : m[8];
    let t = Date.UTC(y, +m[2] - 1, +m[3], +m[4], +(m[5] || 0), +(m[6] || 0), ms);
    if (tz && tz !== 'Z') { const sg = tz[0] === '-' ? -1 : 1; t -= sg * (+tz.slice(1, 3) * 60 + +tz.slice(3, 5)) * 60000; }
    return new Date(t);
  }
  /* ---------- nomi (DN) ---------- */
  const ATTR = { '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.5': 'SERIALNUMBER', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'T', '2.5.4.46': 'DNQ', '2.5.4.97': 'OI', '2.5.4.65': 'PSEUDO', '1.2.840.113549.1.9.1': 'E', '2.5.4.43': 'INITIALS', '2.5.4.44': 'GENQ', '0.9.2342.19200300.100.1.25': 'DC' };
  function dn(n) {
    const out = { raw: raw(n), list: [] };
    for (const set of n.kids || []) for (const a of set.kids || []) { const k = ATTR[oid(a.kids[0])] || oid(a.kids[0]); let v = ''; try { v = str(a.kids[1]); } catch { } out.list.push([k, v]); if (!(k in out)) out[k] = v; }
    out.text = out.list.map(([k, v]) => `${k}=${v}`).join(', ');
    return out;
  }
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  /* ---------- certificati ---------- */
  const EXT = { ku: '2.5.29.15', bc: '2.5.29.19', ski: '2.5.29.14', aki: '2.5.29.35', pol: '2.5.29.32', qc: '1.3.6.1.5.5.7.1.3', eku: '2.5.29.37', san: '2.5.29.17', crl: '2.5.29.31', aia: '1.3.6.1.5.5.7.1.1' };
  function cert(n) {
    const tbs = n.kids[0]; let i = 0;
    if (isCtx(tbs.kids[0], 0)) i = 1;
    const c = { node: n, der: raw(n), tbs: raw(tbs), serial: intHex(tbs.kids[i]), sigAlg: n.kids[1], sig: val(n.kids[2]).subarray(1),
      issuer: dn(tbs.kids[i + 2]), notBefore: time(tbs.kids[i + 3].kids[0]), notAfter: time(tbs.kids[i + 3].kids[1]), subject: dn(tbs.kids[i + 4]), spki: raw(tbs.kids[i + 5]),
      ku: null, ca: false, policies: [], qc: [], eku: [], ski: null, aki: null, email: '', ocsp: '', crl: '' };
    const ex = tbs.kids.find(k => isCtx(k, 3));
    for (const e of ex?.kids[0]?.kids || []) {
      try {
        const id = oid(e.kids[0]), v = parse(val(e.kids[e.kids.length - 1]));
        if (id === EXT.ku) { const bs = val(v); let bits = 0; for (let j = 1; j < bs.length; j++) bits |= bs[j] << (8 * (j - 1)); c.ku = { digitalSignature: !!(bs[1] & 0x80), nonRepudiation: !!(bs[1] & 0x40), keyCertSign: !!(bs[1] & 0x04) }; }
        else if (id === EXT.bc) c.ca = !!(v.kids?.[0] && v.kids[0].num === 1 && val(v.kids[0])[0]);
        else if (id === EXT.ski) c.ski = hex(val(v));
        else if (id === EXT.aki) { const k = v.kids?.find(x => isCtx(x, 0)); if (k) c.aki = hex(val(k)); }
        else if (id === EXT.pol) c.policies = v.kids.map(p => oid(p.kids[0]));
        else if (id === EXT.qc) c.qc = v.kids.map(q => oid(q.kids[0]));
        else if (id === EXT.eku) c.eku = v.kids.map(oid);
        else if (id === EXT.san) { const m = v.kids.find(x => isCtx(x, 1)); if (m) c.email = new TextDecoder().decode(val(m)); }
        else if (id === EXT.aia) for (const ad of v.kids) { if (oid(ad.kids[0]) === '1.3.6.1.5.5.7.48.1') c.ocsp = new TextDecoder().decode(val(ad.kids[1])); }
      } catch { }
    }
    return c;
  }
  /* chi è il titolare: nome, codice fiscale (SERIALNUMBER «TINIT-…» o «IT:…»), organizzazione */
  function holder(c) {
    const s = c.subject;
    let cf = '';
    const sn = s.SERIALNUMBER || '';
    let m = /^(?:TINIT-|IT:|TIN:?IT-?)([A-Z0-9]{11,16})$/i.exec(sn.replace(/\s/g, '')); if (m) cf = m[1].toUpperCase();
    if (!cf) { m = /([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])/.exec((s.CN || '') + ' ' + (s.DNQ || '') + ' ' + sn); if (m) cf = m[1]; }
    let name = s.GN && s.SN ? `${s.GN} ${s.SN}` : (s.CN || '').replace(/\/[A-Z0-9]{11,16}\/?.*$/, '').replace(/\s*\/\s*\d+$/, '');
    name = name.replace(/\s+/g, ' ').trim();
    const pretty = /^[A-ZÀ-Ý' .-]+$/.test(name) ? name.toLowerCase().replace(/(^|[\s'.-])([a-zà-ý])/g, (a, p, l) => p + l.toUpperCase()) : name;
    let org = s.O || ''; if (/^(non presente|na|n\/a|-)$/i.test(org)) org = '';
    let piva = ''; m = /VATIT-?(\d{11})/i.exec(s.OI || ''); if (m) piva = m[1];
    return { name: pretty || s.CN || '—', cn: s.CN || '', cf, org, piva, title: s.T || '', email: c.email || s.E || '', country: s.C || '' };
  }
  const issuerName = c => c.issuer.O || c.issuer.CN || c.issuer.text;
  const QC_COMPLIANCE = '0.4.0.1862.1.1', QC_SSCD = '0.4.0.1862.1.4';
  const QUAL_POL = ['0.4.0.194112.1.2', '0.4.0.194112.1.3', '0.4.0.1456.1.1', '0.4.0.1456.1.2'];
  /* ---------- algoritmi ---------- */
  const HASH = { '1.3.14.3.2.26': 'SHA-1', '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512' };
  const SIGALG = {
    '1.2.840.113549.1.1.1': ['RSA', null], '1.2.840.113549.1.1.5': ['RSA', 'SHA-1'], '1.2.840.113549.1.1.11': ['RSA', 'SHA-256'], '1.2.840.113549.1.1.12': ['RSA', 'SHA-384'], '1.2.840.113549.1.1.13': ['RSA', 'SHA-512'],
    '1.2.840.113549.1.1.10': ['PSS', null], '1.2.840.10045.4.1': ['ECDSA', 'SHA-1'], '1.2.840.10045.4.3.2': ['ECDSA', 'SHA-256'], '1.2.840.10045.4.3.3': ['ECDSA', 'SHA-384'], '1.2.840.10045.4.3.4': ['ECDSA', 'SHA-512'],
    '1.2.840.10045.2.1': ['ECDSA', null],
  };
  const CURVE = { '1.2.840.10045.3.1.7': ['P-256', 32], '1.3.132.0.34': ['P-384', 48], '1.3.132.0.35': ['P-521', 66] };
  const hasCrypto = () => !!(globalThis.crypto && crypto.subtle);
  const digest = async (alg, data) => new Uint8Array(await crypto.subtle.digest(alg, data));
  function derLen(n) { if (n < 128) return [n]; const a = []; while (n) { a.unshift(n & 255); n = Math.floor(n / 256); } return [0x80 | a.length, ...a]; }
  const tlv = (t, body) => new Uint8Array([t, ...derLen(body.length), ...body]);
  async function verify(spkiDer, algNode, hashName, data, sig) {
    const id = oid(algNode.kids[0]);
    let [kind, h] = SIGALG[id] || [];
    if (!kind) throw new Error('algoritmo di firma non supportato (' + id + ')');
    h = h || hashName || 'SHA-256';
    const spki = parse(spkiDer), kalg = oid(spki.kids[0].kids[0]);
    if (kind === 'ECDSA') {
      const cv = CURVE[oid(spki.kids[0].kids[1])]; if (!cv) throw new Error('curva ellittica non supportata');
      const key = await crypto.subtle.importKey('spki', spkiDer, { name: 'ECDSA', namedCurve: cv[0] }, false, ['verify']);
      const s = parse(sig), rs = new Uint8Array(cv[1] * 2);
      [0, 1].forEach(k => { let v = val(s.kids[k]); while (v.length > cv[1] && v[0] === 0) v = v.subarray(1); rs.set(v, cv[1] * (k + 1) - v.length); });
      return crypto.subtle.verify({ name: 'ECDSA', hash: h }, key, rs, data);
    }
    // RSA: una chiave «RSA-PSS» nell'SPKI viene riproposta come rsaEncryption (WebCrypto non la accetta altrimenti)
    let der = spkiDer;
    if (kalg === '1.2.840.113549.1.1.10') { const bits = raw(spki.kids[1]); der = tlv(0x30, [...tlv(0x30, [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]), ...bits]); }
    if (kind === 'PSS') {
      let ph = 'SHA-1', salt = 20;
      const p = algNode.kids[1];
      for (const k of p?.kids || []) { if (isCtx(k, 0)) ph = HASH[oid(k.kids[0].kids[0])] || ph; if (isCtx(k, 2)) salt = intNum(k.kids[0]); }
      const key = await crypto.subtle.importKey('spki', der, { name: 'RSA-PSS', hash: ph }, false, ['verify']);
      return crypto.subtle.verify({ name: 'RSA-PSS', saltLength: salt }, key, sig, data);
    }
    const key = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: h }, false, ['verify']);
    return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  }
  const algName = n => { const id = oid(n.kids[0]); const a = SIGALG[id]; return a ? (a[0] === 'PSS' ? 'RSA-PSS' : a[0]) + (a[1] ? ' ' + a[1] : '') : id; };
  /* ---------- CMS SignedData ---------- */
  const OID = { data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2', tstInfo: '1.2.840.113549.1.9.16.1.4', tsd: '1.2.840.113549.1.9.16.1.31',
    contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5', sigTs: '1.2.840.113549.1.9.16.2.14',
    essV1: '1.2.840.113549.1.9.16.2.12', essV2: '1.2.840.113549.1.9.16.2.47', counterSig: '1.2.840.113549.1.9.6', archTs: '0.4.0.1733.2.4' };
  function signedData(ci) {
    if (oid(ci.kids[0]) !== OID.signedData) throw new Error('non è una busta di firma CMS (SignedData)');
    const sd = ci.kids[1].kids[0];
    let k = 1; // version
    k++; // digestAlgorithms
    const encap = sd.kids[k++];
    const eType = oid(encap.kids[0]);
    const content = encap.kids[1] ? octets(encap.kids[1].kids[0]) : null;
    let certs = [], crls = [];
    while (k < sd.kids.length - 1) { const x = sd.kids[k++]; if (isCtx(x, 0)) certs = x.kids.filter(c => c.num === 16 && c.cls === 0).map(c => { try { return cert(c); } catch { return null; } }).filter(Boolean); else if (isCtx(x, 1)) crls = x.kids.filter(c => c.num === 16 && c.cls === 0); }
    const sis = sd.kids[sd.kids.length - 1].kids.map(signerInfo);
    return { eType, content, certs, crls, sis };
  }
  function attrs(n) {
    const m = new Map();
    for (const a of n?.kids || []) m.set(oid(a.kids[0]), a.kids[1].kids);
    return m;
  }
  function signerInfo(n) {
    let k = 1;
    const sid = n.kids[k++], dAlg = n.kids[k++];
    let sa = null; if (isCtx(n.kids[k], 0)) sa = n.kids[k++];
    const sAlg = n.kids[k++], sig = octets(n.kids[k++]);
    const ua = isCtx(n.kids[k], 1) ? n.kids[k] : null;
    const by = isCtx(sid, 0) ? { ski: hex(val(sid)) } : { issuer: raw(sid.kids[0]), serial: intHex(sid.kids[1]) };
    return { by, hash: HASH[oid(dAlg.kids[0])] || null, hashOid: oid(dAlg.kids[0]), sAlg, sig, signed: sa, sattrs: attrs(sa), uattrs: attrs(ua) };
  }
  const findCert = (si, certs) => certs.find(c => si.by.ski ? c.ski === si.by.ski : c.serial === si.by.serial && sameBytes(c.issuer.raw, si.by.issuer));
  /* catena: certificati presenti nella busta, verificati uno per uno */
  /* elenco ufficiale dei certificatori qualificati e delle marche temporali qualificate (Trusted List AgID), incorporato
     dalla build (tools/tsl.py): la fiducia si controlla sul dispositivo, senza rete */
  let TL = null;
  function trustList() {
    return TL ||= (async () => {
      const t = await inlineText('tsl'); if (!t) return null;
      const j = JSON.parse(t), out = [];
      for (const x of j.servizi) { try { out.push(tslEntry(x)); } catch { } }
      out.issued = j.emesso; return out;
    })().catch(e => { console.warn('elenco dei certificatori', e); return null; });
  }
  function tslEntry(x) { const der = Uint8Array.from(atob(x.c), ch => ch.charCodeAt(0)); return { n: x.n, t: x.t, h: x.h, cert: cert(parse(der)) }; }
  // stato del servizio in una data: concesso (anche le diciture precedenti a eIDAS) o ritirato
  const OK_STATUS = /^(granted|accredited|undersupervision|supervisionincessation|setbynationallaw|recognisedatnationallevel)$/;
  function statusAt(hist, when) { let st = null; for (const [s2, from] of hist) if (new Date(from) <= when) st = s2; return st; }
  // il certificato (o uno della sua catena) è emesso da un servizio dell'elenco, verificato con la sua chiave pubblica
  async function trustOf(chain, type, when) {
    const T0 = await trustList(); if (!T0) return { checked: false };
    const T = window.__tslTest ? [...T0, ...window.__tslTest.map(tslEntry)] : T0;   // (__tslTest: solo per le prove)
    for (const x of chain) for (const t of T) {
      if (t.t !== type) continue;
      let hit = sameBytes(t.cert.der, x.der);
      if (!hit && sameBytes(t.cert.subject.raw, x.issuer.raw)) { try { hit = await verify(t.cert.spki, x.sigAlg, null, x.tbs, x.sig); } catch { } }
      if (hit) { const st = statusAt(t.h, when || new Date()); return { checked: true, name: t.n, status: st, ok: !!st && OK_STATUS.test(st), issued: T0.issued }; }
    }
    return { checked: true, ok: false, issued: T0.issued };
  }
  async function chainOf(c, pool) {
    const chain = [c]; let cur = c, ok = true, selfRoot = false;
    for (let i = 0; i < 6; i++) {
      if (sameBytes(cur.subject.raw, cur.issuer.raw)) { try { selfRoot = await verify(cur.spki, cur.sigAlg, null, cur.tbs, cur.sig); } catch { selfRoot = false; } break; }
      const up = pool.find(x => x !== cur && sameBytes(x.subject.raw, cur.issuer.raw) && (!cur.aki || !x.ski || x.ski === cur.aki));
      if (!up) break;
      let good = false; try { good = await verify(up.spki, cur.sigAlg, null, cur.tbs, cur.sig); } catch { }
      if (!good) ok = false;
      chain.push(up); cur = up;
    }
    return { chain, ok, complete: selfRoot, root: selfRoot ? chain[chain.length - 1] : null };
  }
  /* ---------- revoca, con le informazioni incluse nel file (senza rete) ----------
     Molte firme «a lungo termine» portano con sé la risposta del certificatore (OCSP) o la lista dei certificati revocati
     (CRL) del momento della firma: nella busta (CRL), negli attributi (Adobe, CAdES-XL) o nel DSS del PDF (PAdES-LTV).
     Si verificano qui: firmate dal certificatore (o da un suo incaricato per la revoca), riferite proprio a questo
     certificato. Il controllo online non si fa: i servizi dei certificatori non lo permettono a una pagina web, e
     passare da un server vorrebbe dire mandare fuori dal dispositivo i dati del certificato. */
  const REV = { adbe: '1.2.840.113583.1.1.8', values: '1.2.840.113549.1.9.16.2.24', basic: '1.3.6.1.5.5.7.48.1.1', ocspSigning: '1.3.6.1.5.5.7.3.9' };
  function basicOf(n) {   // OCSPResponse o BasicOCSPResponse → BasicOCSPResponse
    try {
      if (n.kids?.[0]?.num === 10 && isCtx(n.kids[1], 0)) { const rb = n.kids[1].kids[0]; if (oid(rb.kids[0]) !== REV.basic) return null; return parse(octets(rb.kids[1])); }
      return n.kids?.[0]?.num === 16 ? n : null;
    } catch { return null; }
  }
  function revocationSources(sd, si, dss) {
    const ocsps = [], crls = [...(sd.crls || [])];
    const take = (v, crlTag, ocspTag) => { for (const x of v?.kids || []) { if (isCtx(x, crlTag)) crls.push(...(x.kids[0]?.kids || [])); else if (isCtx(x, ocspTag)) ocsps.push(...(x.kids[0]?.kids || [])); } };
    for (const v of si.sattrs.get(REV.adbe) || []) take(v, 0, 1);
    for (const v of si.uattrs.get(REV.values) || []) take(v, 0, 1);
    for (const b of dss?.ocsps || []) { try { ocsps.push(parse(b)); } catch { } }
    for (const b of dss?.crls || []) { try { crls.push(parse(b)); } catch { } }
    return { ocsps: ocsps.map(basicOf).filter(Boolean), crls };
  }
  async function revocationOf(c, chain, src, ref) {
    const issuer = chain.find(x => x !== c && sameBytes(x.subject.raw, c.issuer.raw)) || null;
    const found = src.ocsps.length + src.crls.length; if (!found) return null;
    const out = [];
    // OCSP
    for (const b of src.ocsps) {
      try {
        const tbs = b.kids[0], sigAlg = b.kids[1], sig = val(b.kids[2]).subarray(1), signers = [];
        if (issuer) signers.push(issuer);
        if (isCtx(b.kids[3], 0)) for (const cn of b.kids[3].kids[0].kids || []) { try { const rc = cert(cn); if (issuer && rc.eku.includes(REV.ocspSigning) && await verify(issuer.spki, rc.sigAlg, null, rc.tbs, rc.sig)) signers.push(rc); } catch { } }
        let ok = false; for (const sg of signers) { try { if (await verify(sg.spki, sigAlg, null, raw(tbs), sig)) { ok = true; break; } } catch { } }
        let i = 0; if (isCtx(tbs.kids[0], 0)) i++; i++; const produced = time(tbs.kids[i++]), list = tbs.kids[i].kids || [];
        for (const r of list) {
          const id = r.kids[0]; if (intHex(id.kids[3]) !== c.serial) continue;
          const hAlg = HASH[oid(id.kids[0].kids[0])] || 'SHA-1';
          if (!sameBytes(await digest(hAlg, c.issuer.raw), val(id.kids[1]))) continue;
          const st = r.kids[1], at = time(r.kids[2]) || produced;
          out.push({ how: 'OCSP', verified: ok, at, status: st.num === 0 ? 'good' : st.num === 1 ? 'revoked' : 'unknown', revokedAt: st.num === 1 ? time(st.kids[0]) : null });
        }
      } catch (e) { console.warn('OCSP', e); }
    }
    // CRL
    for (const L of src.crls) {
      try {
        const tbs = L.kids[0]; let i = 0; if (tbs.kids[0].num === 2) i++; i++;
        const iss = tbs.kids[i++]; if (!sameBytes(raw(iss), c.issuer.raw)) continue;
        const at = time(tbs.kids[i++]); if (tbs.kids[i] && (tbs.kids[i].num === 23 || tbs.kids[i].num === 24)) i++;
        const rl = tbs.kids[i] && tbs.kids[i].num === 16 && tbs.kids[i].cls === 0 ? tbs.kids[i].kids : [];
        let ok = false; if (issuer) { try { ok = await verify(issuer.spki, L.kids[1], null, raw(tbs), val(L.kids[2]).subarray(1)); } catch { } }
        const hit = rl.find(e => intHex(e.kids[0]) === c.serial);
        out.push({ how: 'CRL', verified: ok, at, status: hit ? 'revoked' : 'good', revokedAt: hit ? time(hit.kids[1]) : null });
      } catch (e) { console.warn('CRL', e); }
    }
    const ver = out.filter(x => x.verified && x.status !== 'unknown');
    if (!ver.length) return { checked: false, found, issuer: !!issuer };
    // revocato prima della firma: vale su tutto; altrimenti la prova più recente
    const before = ver.find(x => x.status === 'revoked' && x.revokedAt && ref && x.revokedAt <= ref);
    if (before) return { checked: true, ok: false, ...before };
    const best = ver.sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    return { checked: true, ok: true, ...best, after: best.status === 'revoked' };
  }
  /* verifica di una firma (SignerInfo) sul contenuto */
  async function checkSigner(si, sd, content, opts = {}) {
    const r = { errors: [], warnings: [], notes: [], hash: si.hash, alg: algName(si.sAlg) };
    const c = findCert(si, sd.certs.concat(opts.extraCerts || []));
    r.cert = c || null;
    if (!c) r.errors.push('Il certificato del firmatario non è incluso nel file: impossibile verificare la firma.');
    else { r.who = holder(c); r.issuer = issuerName(c); }
    const st = si.sattrs.get(OID.signingTime); r.signingTime = st ? time(st[0]) : opts.claimedTime || null; if (!st && opts.claimedTime) r.timeFromPdf = true;
    const md = si.sattrs.get(OID.messageDigest);
    if (!hasCrypto()) { r.errors.push('Questo browser non permette la verifica crittografica (serve una pagina https o un browser aggiornato).'); r.valid = null; return r; }
    // 1. integrità: impronta del contenuto
    if (si.signed) {
      if (!md) r.errors.push('Manca l’impronta del documento negli attributi firmati.');
      else if (content == null) r.integrity = null;
      else { const d = await digest(si.hash || 'SHA-256', content); r.integrity = sameBytes(d, val(md[0])); if (!r.integrity) r.errors.push('Il documento è stato modificato dopo la firma: l’impronta non corrisponde.'); }
    }
    // 2. firma
    if (c) {
      try {
        const data = si.signed ? (() => { const d = new Uint8Array(raw(si.signed)); d[0] = 0x31; return d; })() : content;
        r.sigOk = await verify(c.spki, si.sAlg, si.hash, data, si.sig);
        if (!r.sigOk) r.errors.push('La firma non corrisponde al certificato del firmatario.');
        if (!si.signed) r.integrity = r.sigOk;
      } catch (e) { r.sigOk = null; r.errors.push('Firma non verificabile: ' + e.message); }
      // 3. certificato collegato alla firma (ESS)
      const ess = si.sattrs.get(OID.essV2) || si.sattrs.get(OID.essV1);
      if (ess) {
        try {
          const first = ess[0].kids[0].kids[0];
          let h = 'SHA-1', hv;
          if (si.sattrs.get(OID.essV2)) { if (first.kids[0].num === 16) { h = HASH[oid(first.kids[0].kids[0])] || 'SHA-256'; hv = val(first.kids[1]); } else { h = 'SHA-256'; hv = val(first.kids[0]); } }
          else hv = val(first.kids[0]);
          r.essOk = sameBytes(await digest(h, c.der), hv);
          if (!r.essOk) r.errors.push('Il certificato indicato nella firma non è quello allegato.');
          r.cades = true;
        } catch { }
      }
      // 4. validità del certificato
      const at = r.signingTime || new Date();
      r.certAtSigning = at < c.notBefore ? 'futuro' : at > c.notAfter ? 'scaduto' : 'valido';
      r.certNow = new Date() > c.notAfter ? 'scaduto' : new Date() < c.notBefore ? 'futuro' : 'valido';
      r.qualified = c.qc.includes(QC_COMPLIANCE) || c.policies.some(p => QUAL_POL.includes(p));
      r.qscd = c.qc.includes(QC_SSCD) || c.policies.includes('0.4.0.194112.1.2');
      r.nonRep = !!c.ku?.nonRepudiation;
      const ch = await chainOf(c, sd.certs.concat(opts.extraCerts || []));
      r.chain = ch.chain.map(x => x.subject.CN || x.subject.O || x.subject.text); r.chainOk = ch.ok; r.chainComplete = ch.complete; r.chainCerts = ch.chain;
      if (!ch.ok) r.errors.push('La catena dei certificati inclusa nel file non è valida.');
    }
    // 5. marca temporale sulla firma (CAdES-T)
    const ts = si.uattrs.get(OID.sigTs);
    if (ts) {
      try { r.timestamp = await timestampToken(ts[0], si.sig); if (r.timestamp.ok === false) r.errors.push('La marca temporale non è valida.'); }
      catch (e) { r.timestamp = { ok: false, error: e.message }; r.warnings.push('Marca temporale illeggibile: ' + e.message); }
    }
    if (si.uattrs.get(OID.counterSig)) r.notes.push('Contiene anche una controfirma.');
    // tempo di riferimento: marca temporale (prova certa) oppure data dichiarata dal firmatario
    const ref = r.timestamp?.ok ? r.timestamp.time : r.signingTime || new Date();
    if (c && ref) r.certAtRef = ref < c.notBefore ? 'futuro' : ref > c.notAfter ? 'scaduto' : 'valido';
    if (c && r.certAtRef === 'scaduto') r.errors.push(`Il certificato era scaduto al momento della firma (scadenza ${fmt(c.notAfter)}).`);
    if (c && r.certAtRef === 'futuro') r.errors.push('Il certificato non era ancora valido al momento della firma.');
    if (c && r.certNow === 'scaduto' && r.certAtRef === 'valido' && !r.timestamp?.ok) r.warnings.push('Il certificato oggi è scaduto e la firma non ha una marca temporale: la data di firma è solo quella dichiarata dal firmatario.');
    // 6. certificatore riconosciuto: chi ha rilasciato il certificato è nell'elenco ufficiale (AgID) e lo era al momento della firma
    if (c) {
      const tr = await trustOf(r.chainCerts || [c], opts.tsa ? 'TSA' : 'QC', ref);
      r.trustChecked = tr.checked; r.trusted = tr.checked ? tr.ok : null; r.trust = tr;
      r.qualifiedClaim = r.qualified;
      if (tr.checked && !tr.ok) {
        r.qualified = false;
        r.untrusted = true;
        r.warnings.push(tr.name ? `Il certificatore «${tr.name}» non era tra quelli qualificati al momento della firma (stato: ${tr.status || 'sconosciuto'}).`
          : `Chi ha rilasciato il certificato («${r.issuer || 'sconosciuto'}») non è nell’elenco ufficiale dei certificatori qualificati (AgID): la firma è integra, ma non si può sapere chi l’abbia davvero rilasciata.${r.qualifiedClaim ? ' Il certificato si dichiara «qualificato», ma questo da solo non basta.' : ''}`);
      }
    }
    // 7. revoca: con le informazioni incluse nel file
    if (c && !opts.tsa) {
      try {
        const rv = await revocationOf(c, r.chainCerts || [c], revocationSources(sd, si, opts.dss), ref);
        r.revocation = rv;
        if (rv?.checked && !rv.ok) r.errors.push(`Il certificato era stato revocato prima della firma (il ${fmt(rv.revokedAt)}), secondo ${rv.how === 'OCSP' ? 'la risposta del certificatore (OCSP)' : 'la lista dei certificati revocati (CRL)'} inclusa nel file.`);
        else if (rv?.checked && rv.after) r.notes.push(`Il certificato è stato revocato dopo la firma (il ${fmt(rv.revokedAt)}): la firma, fatta prima, resta valida.`);
      } catch (e) { console.warn('revoca', e); }
    }
    if (c && !r.qualified && !r.untrusted) r.warnings.push('Il certificato non risulta «qualificato»: potrebbe essere una firma avanzata o semplice.');
    if (c && !r.chainComplete) r.notes.push('Il certificato dell’ente che l’ha rilasciato non è incluso nel file.');
    r.valid = r.errors.length === 0 && r.sigOk === true && r.integrity !== false;
    r.level = r.valid && !r.warnings.length ? 'ok' : r.valid ? 'warn' : 'bad';
    return r;
  }
  /* marca temporale RFC 3161: impronta di «data», firma della TSA */
  async function timestampToken(ciNode, data) {
    const sd = signedData(ciNode);
    if (sd.eType !== OID.tstInfo) throw new Error('non è una marca temporale');
    const t = parse(sd.content);
    let k = 1; const policy = oid(t.kids[k++]); const mi = t.kids[k++]; const serial = intHex(t.kids[k++]); const gen = time(t.kids[k++]);
    const h = HASH[oid(mi.kids[0].kids[0])] || 'SHA-256';
    const imprintOk = data ? sameBytes(await digest(h, data), val(mi.kids[1])) : null;
    const s = await checkSigner(sd.sis[0], sd, sd.content, { tsa: true });
    const tsaCert = s.cert;
    let tsaName = tsaCert ? (tsaCert.subject.CN || tsaCert.subject.O) : '';
    const tsaField = t.kids.find(x => isCtx(x, 0)); if (!tsaName && tsaField) { try { tsaName = dn(tsaField.kids[0].kids[0]).CN || ''; } catch { } }
    return { time: gen, serial, policy, tsa: tsaName, tsaOrg: tsaCert ? tsaCert.subject.O || '' : '', imprintOk, sigOk: s.valid && s.sigOk, ok: imprintOk !== false && s.sigOk === true && s.integrity !== false, hash: h, trusted: s.trusted, trustName: s.trust?.name || '' };
  }

  /* ---------- riconoscimento del formato ---------- */
  const latin = (u, a = 0, b = u.length) => new TextDecoder('latin1').decode(u.subarray(a, Math.min(b, u.length)));
  const isPdf = u => u[0] !== 0x30 && latin(u, 0, 1024).includes('%PDF-');
  function sniff(u) {
    const head = latin(u, 0, 600);
    if (isPdf(u)) return { ext: 'pdf', mime: 'application/pdf', label: 'PDF' };
    if (/^﻿?\s*<\?xml|^\s*</.test(head)) {
      if (/xbrl/i.test(head) || /xbrli:/.test(latin(u, 0, 8000))) return { ext: 'xbrl', mime: 'application/xml', label: 'XBRL (bilancio)' };
      if (/FatturaElettronica/i.test(latin(u, 0, 4000))) return { ext: 'xml', mime: 'application/xml', label: 'Fattura elettronica (XML)' };
      return { ext: 'xml', mime: 'application/xml', label: 'XML' };
    }
    if (u[0] === 0x50 && u[1] === 0x4b) { const s = latin(u, 0, 4000); return /word\//.test(s) ? { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' } : /xl\//.test(s) ? { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' } : { ext: 'zip', mime: 'application/zip', label: 'ZIP' }; }
    if (u[0] === 0xff && u[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg', label: 'Immagine JPEG' };
    if (u[0] === 0x89 && u[1] === 0x50) return { ext: 'png', mime: 'image/png', label: 'Immagine PNG' };
    if (/^II\*\0|^MM\0\*/.test(head)) return { ext: 'tif', mime: 'image/tiff', label: 'Immagine TIFF' };
    if (u[0] === 0xd0 && u[1] === 0xcf) return { ext: 'doc', mime: 'application/msword', label: 'Documento Office' };
    if (/^\{\\rtf/.test(head)) return { ext: 'rtf', mime: 'application/rtf', label: 'RTF' };
    if (/^[\x09\x0a\x0d\x20-\x7e\xa0-\xff]*$/.test(head)) return { ext: 'txt', mime: 'text/plain', label: 'Testo' };
    return { ext: 'bin', mime: 'application/octet-stream', label: 'File' };
  }
  function maybeBase64(u) {
    if (u[0] === 0x30) return u;
    let s = latin(u).replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(s) || s.length < 16) return u;
    try { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out[0] === 0x30 ? out : u; } catch { return u; }
  }
  function parseMime(u) {
    const s = latin(u);
    const bm = /boundary="?([^";\r\n]+)"?/i.exec(s); if (!bm) return null;
    const parts = s.split('--' + bm[1]).slice(1).filter(p => !p.startsWith('--'));
    const out = [];
    for (const p of parts) {
      const i = p.search(/\r?\n\r?\n/); if (i < 0) continue;
      const head = p.slice(0, i), body = p.slice(i).trim();
      const b64 = /base64/i.test(head);
      let bytes;
      if (b64) { const bin = atob(body.replace(/\s+/g, '')); bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k); }
      else bytes = Uint8Array.from(body, ch => ch.charCodeAt(0));
      out.push({ type: (/content-type:\s*([^;\r\n]+)/i.exec(head) || [])[1] || '', name: (/name="?([^";\r\n]+)/i.exec(head) || [])[1] || '', bytes });
    }
    return out;
  }
  const stripName = n => { let s = n || 'documento'; for (let i = 0; i < 6; i++) { const t = s.replace(/\.(p7m|p7s|tsd|m7m|p7c)$/i, ''); if (t === s) break; s = t; } return s; };

  /* ---------- apertura di un file firmato (buste annidate) ---------- */
  async function open(bytes, name = '') {
    let data = bytes; const layers = [];
    // .m7m: messaggio MIME con il .p7m e la marca temporale separata (.tsr)
    if (/\.m7m$/i.test(name) || /^MIME-Version|^Content-Type:\s*multipart/im.test(latin(bytes, 0, 400))) {
      const parts = parseMime(bytes);
      if (parts) {
        const p7 = parts.find(p => /pkcs7-mime|p7m/i.test(p.type + p.name)) || parts.find(p => p.bytes[0] === 0x30 && !/timestamp/i.test(p.type));
        const tsr = parts.find(p => /timestamp|tsr/i.test(p.type + p.name) && p !== p7);
        if (p7) {
          data = maybeBase64(p7.bytes);
          if (tsr) {
            try {
              const resp = parse(tsr.bytes);
              const tok = resp.kids.length > 1 && resp.kids[0].num === 16 && resp.kids[1].num === 16 && oid(resp.kids[1].kids[0]) === OID.signedData ? resp.kids[1] : resp;
              layers.push({ kind: 'marca', label: 'Marca temporale (.m7m)', ts: await timestampToken(tok, data) });
            } catch (e) { layers.push({ kind: 'marca', label: 'Marca temporale (.m7m)', ts: { ok: false, error: e.message } }); }
          }
        }
      }
    }
    for (let depth = 0; depth < 8; depth++) {
      data = maybeBase64(data);
      if (isPdf(data) || data[0] !== 0x30) break;
      let ci; try { ci = parse(data); } catch { break; }
      if (!ci.kids || ci.kids[0]?.num !== 6) break;
      const ct = oid(ci.kids[0]);
      if (ct === OID.signedData) {
        const sd = signedData(ci);
        if (!sd.content) throw new Error('È una firma «separata» (detached): il documento firmato non è dentro il file. Apri insieme anche il documento originale.');
        const sigs = [];
        for (const si of sd.sis) sigs.push(await checkSigner(si, sd, sd.content));
        layers.push({ kind: 'cades', label: 'Firma CAdES (.p7m)', sigs });
        data = sd.content; continue;
      }
      if (ct === OID.tsd) {
        const t = ci.kids[1].kids[0]; let content = null, evidence = null;
        for (const k of t.kids) { if (k.num === 4 && k.cls === 0) content = octets(k); if (isCtx(k, 0) && k.cons) evidence = k; }
        if (!content) throw new Error('Il file .tsd non contiene il documento.');
        let ts = null;
        try { const tok = evidence.kids[0].kids[0].kids[0]; ts = await timestampToken(tok, content); } catch (e) { ts = { ok: false, error: e.message }; }
        layers.push({ kind: 'marca', label: 'Marca temporale (.tsd)', ts });
        data = content; continue;
      }
      break;
    }
    const type = sniff(data);
    let outName = stripName(name);
    if (!/\.[a-z0-9]{2,5}$/i.test(outName) || outName === name) outName = outName.replace(/\.(p7m|bin)$/i, '') + '.' + type.ext;
    else if (type.ext === 'pdf' && !/\.pdf$/i.test(outName)) outName += '.pdf';
    return { layers, content: data, type, name: outName, signed: layers.length > 0 };
  }

  /* ---------- firme dentro un PDF (PAdES) ---------- */
  // DSS del PDF (PAdES-LTV): risposte OCSP e liste CRL conservate nel file
  async function pdfDss(bytes) {
    try {
      if (!/\/DSS\b/.test(latin(bytes.subarray(Math.max(0, bytes.length - 400000))))) return null;
      const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }), ctx = doc.context;
      const dss = doc.catalog.lookup(PDFLib.PDFName.of('DSS')); if (!dss) return null;
      const list = k => { const a = dss.lookup(PDFLib.PDFName.of(k)); return a && a.asArray ? a.asArray().map(r => { try { return PT.streamBytes(ctx.lookup(r)); } catch { return null; } }).filter(Boolean) : []; };
      return { ocsps: list('OCSPs'), crls: list('CRLs') };
    } catch (e) { console.warn('DSS', e); return null; }
  }
  async function pdfSignatures(bytes) {
    const s = latin(bytes), out = [], dss = await pdfDss(bytes);
    const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
    let m;
    while ((m = re.exec(s))) {
      const [a, b, c, d] = m.slice(1, 5).map(Number);
      if (a !== 0 || c < a + b || c + d > bytes.length) continue;
      let objStart = s.lastIndexOf(' obj', m.index); if (objStart < 0 || m.index - objStart > 200000) objStart = Math.max(0, m.index - 4000);
      const objEnd = s.indexOf('endobj', m.index); const dict = s.slice(objStart, objEnd > 0 ? Math.min(objEnd, m.index + 40000) : m.index + 4000).replace(/<[0-9A-Fa-f\s]{200,}>/g, '<…>');
      const sub = (/\/SubFilter\s*\/([^\s/<>\[\]]+)/.exec(dict) || [])[1] || '';
      const pdfStr = k => { const x = new RegExp('/' + k + '\\s*\\(((?:\\\\.|[^\\\\)])*)\\)').exec(dict); if (x) return x[1].replace(/\\([()\\])/g, '$1'); const hx = new RegExp('/' + k + '\\s*<([0-9A-Fa-f]+)>').exec(dict); if (hx) { const by = hx[1].match(/../g).map(h => parseInt(h, 16)); return by[0] === 0xfe ? new TextDecoder('utf-16be').decode(new Uint8Array(by.slice(2))) : String.fromCharCode(...by); } return ''; };
      const gap = s.slice(a + b, c), hexs = gap.replace(/[<>\s]/g, '');
      const sig = new Uint8Array(hexs.length >> 1); for (let i = 0; i < sig.length; i++) sig[i] = parseInt(hexs.substr(i * 2, 2), 16);
      const signedBytes = new Uint8Array(b + d); signedBytes.set(bytes.subarray(a, a + b), 0); signedBytes.set(bytes.subarray(c, c + d), b);
      const item = { range: [a, b, c, d], sub, reason: pdfStr('Reason'), location: pdfStr('Location'), nameField: pdfStr('Name'), m: pdfStr('M'), covers: c + d, whole: c + d === bytes.length, docTs: /RFC3161/i.test(sub) };
      try {
        let ci = parse(sig);
        if (item.docTs) item.ts = await timestampToken(ci, signedBytes);
        else {
          const sd = signedData(ci);
          let content = signedBytes;
          if (sd.content && /sha1/i.test(sub)) { const h = await digest('SHA-1', signedBytes); item.sha1Ok = sameBytes(h, sd.content); content = sd.content; }
          let claimed = null;
          const mm = /D:(\d{4})(\d\d)(\d\d)(\d\d)?(\d\d)?(\d\d)?([Z+-])?(\d\d)?'?(\d\d)?/.exec(item.m || '');
          if (mm) { let t = Date.UTC(+mm[1], +mm[2] - 1, +mm[3], +(mm[4] || 0), +(mm[5] || 0), +(mm[6] || 0)); if (mm[7] === '+' || mm[7] === '-') t -= (mm[7] === '-' ? -1 : 1) * ((+mm[8] || 0) * 60 + (+mm[9] || 0)) * 60000; claimed = new Date(t); }
          item.sig = await checkSigner(sd.sis[0], sd, content, { claimedTime: claimed, dss });
          if (item.sha1Ok === false) { item.sig.errors.push('Il documento è stato modificato dopo la firma.'); item.sig.valid = false; item.sig.level = 'bad'; }
        }
      } catch (e) { item.error = e.message; }
      out.push(item);
    }
    // in ordine di revisione
    out.sort((x, y) => x.covers - y.covers);
    return out;
  }

  /* ---------- testi ---------- */
  const fmt = (d, withTime = true) => !d ? '—' : d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : {}) }) + (withTime ? '' : '');
  const fmtTz = d => !d ? '—' : fmt(d) + ' (ora italiana)';
  return { open, pdfSignatures, sniff, isPdf, stripName, holder, fmt, fmtTz, parse, hasCrypto, maybeBase64 };
})();

/* ============================================================
   Firme digitali e P7M: estrazione del documento, verifica, rapporto
   ============================================================ */
const FirmeUI = (() => {
  const sha256hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const LEVEL = { ok: ['Firma valida', 'ok'], warn: ['Firma valida, con avvisi', 'warn'], bad: ['Firma NON valida', 'bad'] };
  const yes = v => (v === true ? 'sì' : v === false ? 'no' : '—');

  /* tutte le firme di un risultato, in forma piatta */
  function flatten(res) {
    const out = [];
    if (res.pdfSigs) res.pdfSigs.forEach((p, i) => out.push({ kind: p.docTs ? 'marca' : 'pades', idx: i, p, s: p.sig, ts: p.ts, label: p.docTs ? 'Marca temporale del documento' : `Firma nel PDF${res.pdfSigs.length > 1 ? ' ' + (i + 1) : ''}` }));
    (res.layers || []).forEach((l, li) => {
      if (l.sigs) l.sigs.forEach(s => out.push({ kind: 'cades', layer: li, s, label: res.layers.filter(x => x.sigs).length > 1 ? `Firma ${li + 1} (busta ${li === 0 ? 'esterna' : 'interna'})` : 'Firma CAdES (.p7m)' }));
      else if (l.ts) out.push({ kind: 'marca', ts: l.ts, label: l.label });
    });
    return out;
  }
  const levelOf = it => it.s ? (it.s.level === 'ok' && it.visual && !it.visual.same ? 'warn' : it.s.level) : it.ts ? (it.ts.ok ? 'ok' : 'bad') : it.p?.error ? 'bad' : 'warn';
  function overall(items) {
    if (!items.length) return 'none';
    return items.some(i => levelOf(i) === 'bad') ? 'bad' : items.some(i => levelOf(i) === 'warn') ? 'warn' : 'ok';
  }
  /* righe di dettaglio comuni a pannello e rapporto */
  function details(it) {
    const rows = [], s = it.s;
    if (s) {
      const w = s.who || {};
      rows.push(['Firmatario', w.name || '—']);
      if (w.cf) rows.push(['Codice fiscale', w.cf]);
      if (w.org) rows.push(['Organizzazione', w.org + (w.piva ? ` (P.IVA ${w.piva})` : '')]);
      if (w.title) rows.push(['Ruolo', w.title]);
      if (w.email) rows.push(['E-mail', w.email]);
      rows.push([s.timeFromPdf ? 'Data indicata nel PDF' : 'Data dichiarata della firma', s.signingTime ? FirmaKit.fmtTz(s.signingTime) : 'non indicata']);
      if (s.timestamp) rows.push(['Marca temporale', s.timestamp.ok ? `${FirmaKit.fmtTz(s.timestamp.time)} · ${s.timestamp.tsa}${s.timestamp.tsaOrg && s.timestamp.tsaOrg !== s.timestamp.tsa ? ' (' + s.timestamp.tsaOrg + ')' : ''}` : 'non valida' + (s.timestamp.error ? ': ' + s.timestamp.error : '')]);
      if (s.cert) {
        rows.push(['Certificato rilasciato da', s.issuer || '—']);
        rows.push(['Validità del certificato', `dal ${FirmaKit.fmt(s.cert.notBefore, false)} al ${FirmaKit.fmt(s.cert.notAfter, false)}`]);
        rows.push(['Numero di serie', s.cert.serial]);
        rows.push(['Certificato qualificato', yes(s.qualified) + (s.qscd ? ' · su dispositivo sicuro (QSCD)' : '') + (s.untrusted && s.qualifiedClaim ? ' (si dichiara qualificato, ma chi l’ha rilasciato non è nell’elenco ufficiale)' : '')]);
        if (s.trustChecked) rows.push(['Certificatore', s.trusted ? `${s.trust.name} · nell’elenco AgID dei certificatori qualificati${s.trust.issued ? ' (aggiornato al ' + new Date(s.trust.issued).toLocaleDateString('it-IT') + ')' : ''}` : 'non presente nell’elenco ufficiale dei certificatori qualificati (AgID)']);
      }
      rows.push(['Algoritmo', `${s.alg}${s.hash && !/SHA/.test(s.alg) ? ' · ' + s.hash : ''}`]);
      rows.push(['Formato', it.kind === 'pades' ? 'PAdES' + (it.p?.sub ? ` (${it.p.sub})` : '') : s.cades ? 'CAdES' + (s.timestamp?.ok ? '-T (con marca temporale)' : '-BES') : 'PKCS#7']);
      if (it.p) {
        if (it.p.reason) rows.push(['Motivo', it.p.reason]);
        if (it.p.location) rows.push(['Luogo', it.p.location]);
        rows.push(['Parte del PDF firmata', it.p.whole ? 'tutto il documento' : 'una versione precedente (dopo sono state aggiunte modifiche o altre firme)']);
      }
    } else if (it.ts) {
      rows.push(['Data e ora certa', it.ts.ok || it.ts.time ? FirmaKit.fmtTz(it.ts.time) : '—']);
      if (it.ts.tsa) rows.push(['Ente (TSA)', it.ts.tsa + (it.ts.tsaOrg && it.ts.tsaOrg !== it.ts.tsa ? ' · ' + it.ts.tsaOrg : '')]);
      if (it.ts.serial) rows.push(['Numero della marca', it.ts.serial]);
      rows.push(['Impronta del documento', it.ts.imprintOk ? 'corrisponde' : it.ts.imprintOk === false ? 'NON corrisponde' : '—']);
      if (it.ts.error) rows.push(['Errore', it.ts.error]);
    } else if (it.p?.error) rows.push(['Errore', it.p.error]);
    return rows;
  }
  const say = (v, yes, no, unk = '') => [v === true ? yes : v === false ? no : unk || yes, v];
  function checks(it) {
    const s = it.s; if (!s) return [];
    return [
      // la frase dice sempre com'è andata (non solo l'icona): chi legge in fretta o con un lettore di schermo capisce subito
      say(s.integrity, 'Il documento non è stato modificato dopo la firma', 'Il documento è stato modificato dopo la firma', 'Integrità del documento non verificabile'),
      say(s.sigOk, 'La firma corrisponde al certificato del firmatario', 'La firma non corrisponde al certificato del firmatario', 'Corrispondenza della firma non verificabile'),
      say(s.certAtRef ? s.certAtRef === 'valido' : null, 'Il certificato era valido al momento della firma', s.certAtRef === 'futuro' ? 'Il certificato non era ancora valido al momento della firma' : 'Il certificato era scaduto al momento della firma', 'Validità del certificato non verificabile'),
      s.essOk != null ? say(s.essOk, 'Il certificato è quello indicato nella firma', 'Il certificato non è quello indicato nella firma') : null,
      s.trustChecked ? say(s.trusted, `Rilasciato da un certificatore qualificato${s.trust?.name ? ' (' + s.trust.name + ')' : ''}`, 'Rilasciato da un ente che non è nell’elenco ufficiale dei certificatori qualificati') : null,
      s.timestamp ? say(s.timestamp.ok, 'Marca temporale valida', 'Marca temporale non valida') : null,
      s.revocation?.checked ? say(s.revocation.ok, `Certificato non revocato al momento della firma (${s.revocation.how === 'OCSP' ? 'risposta del certificatore' : 'lista dei revocati'} inclusa nel file)`, 'Certificato revocato prima della firma')
        : s.revocation?.found ? say(null, '', '', 'Informazioni di revoca incluse nel file, ma non verificabili (manca il certificato di chi le ha firmate)') : null,
      s.chain && s.chain.length > 1 ? say(s.chainOk, 'Catena dei certificati inclusa nel file valida', 'Catena dei certificati inclusa nel file non valida') : null,
      it.visual ? say(it.visual.same, 'Nessuna modifica visibile dopo questa firma', 'Il contenuto visibile è cambiato dopo questa firma') : null,
    ].filter(Boolean);
  }

  /* ---------- confronto visivo tra la versione firmata e il PDF finale ---------- */
  async function visualCheck(revBytes, fullBytes) {
    const A = await pdfDocument({ data: revBytes.slice(), isEvalSupported: false }).promise;
    const B = await pdfDocument({ data: fullBytes.slice(), isEvalSupported: false }).promise;
    const changed = [];
    if (A.numPages !== B.numPages) return { same: false, pages: [], note: `il numero di pagine è cambiato (${A.numPages} → ${B.numPages})` };
    for (let i = 1; i <= A.numPages; i++) {
      const pa = await A.getPage(i), pb = await B.getPage(i);
      const sc = Math.min(1, 900 / Math.max(pa.view[2], pa.view[3]));
      const va = pa.getViewport({ scale: sc }), vb = pb.getViewport({ scale: sc });
      if (Math.abs(va.width - vb.width) > 1 || Math.abs(va.height - vb.height) > 1) { changed.push(i); continue; }
      const draw = async (p, v) => { const c = h('canvas', { width: Math.ceil(v.width), height: Math.ceil(v.height) }); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: x, viewport: v }).promise; return x.getImageData(0, 0, c.width, c.height).data; };
      const da = await draw(pa, va), db = await draw(pb, vb);
      // le firme aggiunte dopo (campi firma) non contano come modifica
      const masks = [];
      for (const an of await pb.getAnnotations()) if (an.subtype === 'Widget' && an.fieldType === 'Sig') { const r = vb.convertToViewportRectangle(an.rect); masks.push([Math.min(r[0], r[2]) - 2, Math.min(r[1], r[3]) - 2, Math.max(r[0], r[2]) + 2, Math.max(r[1], r[3]) + 2]); }
      const W = Math.ceil(va.width);
      let diff = 0, tot = 0;
      for (let k = 0; k < da.length; k += 4) {
        const px = (k >> 2) % W, py = Math.floor((k >> 2) / W);
        if (masks.some(m => px >= m[0] && px <= m[2] && py >= m[1] && py <= m[3])) continue;
        tot++;
        if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 90) diff++;
      }
      if (diff > Math.max(12, tot * 0.00005)) changed.push(i);
      pa.cleanup(); pb.cleanup();
    }
    A.destroy(); B.destroy();
    return { same: !changed.length, pages: changed };
  }

  /* ---------- rapporto PDF ---------- */
  async function report(res, meta) {
    const pdf = await PDFDocument.create();
    const BF = await Brand.pdfFonts(pdf);
    const F = BF.r, FB = BF.b;
    const W = 595.28, H = 841.89, M = 48;
    let page, y;
    const C = { ink: Brand.rgbHex(Brand.C.ink), mute: Brand.rgbHex(Brand.C.muted), line: Brand.rgbHex(Brand.C.line2), ok: rgb(0.09, 0.55, 0.35), warn: rgb(0.7, 0.45, 0.05), bad: rgb(0.78, 0.16, 0.16) };
    const newPage = () => { page = pdf.addPage([W, H]); y = H - M - 10; };
    const need = hgt => { if (y - hgt < M + 24) newPage(); };
    const wrap = (t, font, size, width) => {
      const out = []; for (const para of String(t).split('\n')) { let line = ''; for (const w of para.split(' ')) { const tryL = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(pdfSafe(font, tryL), size) > width && line) { out.push(line); line = w; } else line = tryL; } out.push(line); }
      return out;
    };
    const text = (t, { font = F, size = 10, color = C.ink, x = M, width = W - 2 * M, gap = 3 } = {}) => {
      for (const l of wrap(t, font, size, width)) { need(size + gap); page.drawText(pdfSafe(font, l), { x, y: y - size, size, font, color }); y -= size + gap; }
    };
    const rowsT = (rows, x0 = M + 8) => {
      for (const [k, v] of rows) {
        const lines = wrap(v, F, 9.5, W - M - x0 - 150);
        need(lines.length * 12.5 + 2);
        page.drawText(pdfSafe(F, k), { x: x0, y: y - 9.5, size: 8.8, font: F, color: C.mute });
        lines.forEach((l, i) => page.drawText(pdfSafe(F, l), { x: x0 + 150, y: y - 9.5 - i * 12.5, size: 9.5, font: F, color: C.ink }));
        y -= lines.length * 12.5 + 2.5;
      }
    };
    newPage();
    page.drawRectangle({ x: M, y: y - 3, width: 28, height: 3, color: Brand.rgbHex(Brand.C.accent) }); y -= 14;
    page.drawText('Rapporto di verifica delle firme digitali', { x: M, y: y - 19, size: 19, font: BF.x, color: C.ink }); y -= 31;
    text(`Verifica eseguita il ${FirmaKit.fmtTz(new Date())} con file360, sul dispositivo dell'utente.`, { size: 9, color: C.mute }); y -= 6;
    rowsT([['File esaminato', meta.fileName], ['Dimensione', fmtSize(meta.fileSize)], ['Impronta SHA-256', meta.fileHash],
      ...(meta.contentName ? [['Documento contenuto', `${meta.contentName} (${meta.contentType})`], ['Impronta SHA-256', meta.contentHash]] : [])], M);
    y -= 8;
    const items = flatten(res), ov = overall(items);
    const modified = items.some(i => i.visual && !i.visual.same);
    const head = ov === 'ok' ? ['ESITO: tutte le firme sono valide', C.ok] : ov === 'warn' ? [modified ? 'ESITO: firma valida, ma il PDF è stato modificato dopo la firma' : 'ESITO: firme valide, con avvisi da leggere', C.warn] : ov === 'bad' ? ['ESITO: almeno una firma NON è valida', C.bad] : ['ESITO: nessuna firma digitale trovata', C.mute];
    need(30); page.drawRectangle({ x: M, y: y - 24, width: W - 2 * M, height: 24, color: head[1], opacity: 0.1 }); page.drawText(head[0], { x: M + 10, y: y - 16.5, size: 11.5, font: FB, color: head[1] }); y -= 36;
    items.forEach((it, n) => {
      const lv = levelOf(it), col = C[lv];
      need(60);
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line }); y -= 14;
      page.drawText(pdfSafe(FB, `${n + 1}. ${it.label}`), { x: M, y: y - 11, size: 11.5, font: FB, color: C.ink });
      const st = it.s ? (it.visual && !it.visual.same && lv === 'warn' && it.s.level === 'ok' ? 'Valida, documento modificato dopo' : LEVEL[lv][0]) : it.ts ? (it.ts.ok ? 'Marca temporale valida' : 'Marca temporale NON valida') : 'Non verificabile';
      const sw = FB.widthOfTextAtSize(st, 10); page.drawText(st, { x: W - M - sw, y: y - 11, size: 10, font: FB, color: col }); y -= 20;
      rowsT(details(it));
      const ck = checks(it);
      if (ck.length) { y -= 3; for (const [t, v] of ck) { need(13); const mark = v === true ? 'OK' : v === false ? 'NO' : '—'; page.drawText(mark, { x: M + 8, y: y - 9.5, size: 8.5, font: FB, color: v === true ? C.ok : v === false ? C.bad : C.mute }); page.drawText(pdfSafe(F, t), { x: M + 32, y: y - 9.5, size: 9.5, font: F, color: C.ink }); y -= 12.5; } }
      const msgs = [...(it.s?.errors || []).map(e => ['Errore', e, C.bad]), ...(it.s?.warnings || []).map(e => ['Avviso', e, C.warn]), ...(it.s?.notes || []).map(e => ['Nota', e, C.mute]), ...(it.visual && !it.visual.same ? [['Attenzione', `Il contenuto visibile è cambiato dopo questa firma${it.visual.pages.length ? ' (pagine ' + it.visual.pages.join(', ') + ')' : ''}${it.visual.note ? ': ' + it.visual.note : ''}.`, C.bad]] : [])];
      if (msgs.length) { y -= 3; for (const [k, t, c] of msgs) text(`${k}: ${t}`, { size: 9, color: c, x: M + 8, width: W - 2 * M - 8 }); }
      y -= 10;
    });
    y -= 6; need(80);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line }); y -= 12;
    text('Come leggere questo rapporto', { font: FB, size: 9.5 });
    text('Le verifiche crittografiche (integrità del documento, corrispondenza della firma, validità del certificato alla data, marca temporale) sono state eseguite sul tuo dispositivo, senza inviare il file a nessuno. Non è stato possibile controllare, perché richiedono una connessione a servizi esterni: l’iscrizione dell’ente che ha rilasciato il certificato negli elenchi di fiducia europei/AgID e l’eventuale revoca o sospensione del certificato (OCSP/CRL). Per un controllo con valore legale verifica il file anche con un servizio di verifica ufficiale.', { size: 8.5, color: C.mute, gap: 2.5 });
    const n = pdf.getPageCount();
    Brand.decorate(pdf, BF, { label: 'Rapporto di verifica delle firme digitali', ml: M, mr: M, foot: 26 });
    pdf.setTitle('Rapporto di verifica delle firme digitali'); pdf.setProducer('file360'); pdf.setCreationDate(new Date());
    return pdf.save();
  }
  /* dicitura in calce: «Firmato digitalmente da …» */
  async function stampSigners(lib, items) {
    const who = items.filter(i => i.s?.valid && i.s.who).map(i => `${i.s.who.name}${i.s.who.cf ? ' (CF ' + i.s.who.cf + ')' : ''}${(i.s.timestamp?.ok ? i.s.timestamp.time : i.s.signingTime) ? ' il ' + FirmaKit.fmt(i.s.timestamp?.ok ? i.s.timestamp.time : i.s.signingTime, false) : ''}`);
    if (!who.length) return 0;
    const F = await lib.embedFont(StandardFonts.Helvetica);
    const line = pdfSafe(F, `Documento firmato digitalmente da ${[...new Set(who)].join('; ')} · firma verificata il ${FirmaKit.fmt(new Date(), false)}`);
    for (const page of lib.getPages()) {
      const T = pageTransform(page);
      let s = 6.5; while (s > 4.5 && F.widthOfTextAtSize(line, s) > T.dw - 40) s -= 0.25;
      const w = F.widthOfTextAtSize(line, s), p = T((T.dw - w) / 2, T.dh - 9);
      page.drawText(line, { x: p.x, y: p.y, size: s, font: F, color: rgb(0.35, 0.37, 0.4), rotate: degrees(T.rot) });
    }
    return who.length;
  }

  /* ---------- interfaccia ---------- */
  function card(it) {
    const lv = levelOf(it);
    const ttl = it.s ? (it.s.who?.name || 'Firmatario sconosciuto') : it.ts ? 'Marca temporale' : it.label;
    const sub = it.s ? `${it.s.untrusted && it.s.valid ? 'Firma integra, certificatore non riconosciuto' : LEVEL[lv][0]}${(it.s.timestamp?.ok ? it.s.timestamp.time : it.s.signingTime) ? ' · ' + FirmaKit.fmt(it.s.timestamp?.ok ? it.s.timestamp.time : it.s.signingTime) : ''}` : it.ts ? (it.ts.ok ? 'Valida · ' + FirmaKit.fmt(it.ts.time) : 'NON valida') : (it.p?.error || '');
    const msgs = [...(it.s?.errors || []).map(e => ['bad', e]), ...(it.visual && !it.visual.same ? [['bad', `Il contenuto visibile è cambiato dopo questa firma${it.visual.pages.length ? ' (pagine ' + it.visual.pages.join(', ') + ')' : ''}.`]] : []), ...(it.s?.warnings || []).map(e => ['warn', e])];
    return h('details', { class: 'sigc s-' + lv, open: lv !== 'ok' },
      h('summary', {}, h('span', { class: 'sig-badge' }, ic(lv === 'ok' ? 'check' : lv === 'warn' ? 'shield' : 'x', 16, 2.6)),
        h('span', { class: 'sig-t' }, h('b', {}, ttl), h('span', { class: 'muted small' }, it.label + ' · ' + sub))),
      msgs.length ? h('div', { class: 'sig-msgs' }, ...msgs.map(([k, t]) => h('div', { class: 'sig-m ' + k }, t))) : null,
      h('div', { class: 'sig-ck' }, ...checks(it).map(([t, v]) => h('div', { class: 'ck ' + (v === true ? 'y' : v === false ? 'n' : 'u') }, ic(v === true ? 'check' : v === false ? 'x' : 'shield', 14, 2.6), t))),
      h('dl', { class: 'sig-dl' }, ...details(it).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  }

  // apre e verifica un file (PDF firmato o busta .p7m/.tsd/.m7m)
  async function openSigned(file, onStep = () => {}) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new Error(`«${file.name}» è vuoto.`);
    let res;
    if (FirmaKit.isPdf(bytes)) {
      const pdfSigs = await FirmaKit.pdfSignatures(bytes);
      res = { pdfSigs, layers: [], content: bytes, type: FirmaKit.sniff(bytes), name: file.name, isPdfInput: true };
      for (const p of pdfSigs) if (!p.whole && p.sig) { onStep(); try { p.visual = await visualCheck(bytes.slice(0, p.covers), bytes); } catch (e) { console.warn(e); } }
    } else {
      res = await FirmaKit.open(bytes, file.name);
      if (!res.signed) throw new Error('non è un file firmato digitalmente riconosciuto (.p7m, .tsd, .m7m) né un PDF');
    }
    const items = flatten(res);
    if (res.pdfSigs) items.forEach(it => { if (it.p?.visual) it.visual = it.p.visual; });
    const ov = overall(items);
    const meta = { fileName: file.name, fileSize: bytes.length, fileHash: await sha256hex(bytes), contentName: res.isPdfInput ? '' : res.name, contentType: res.type.label, contentHash: res.isPdfInput ? '' : await sha256hex(res.content) };
    const signers = [...new Set(items.filter(i => i.s?.who).map(i => i.s.who.name))];
    return { file, bytes, res, items, ov, meta, signers };
  }
  const OV_SHORT = { ok: 'Firma valida', warn: 'Firma valida, con avvisi', bad: 'Firma NON valida', none: 'Nessuna firma' };
  const ovShort = o => o.ov !== 'bad' && o.items.some(i => i.s?.untrusted && i.s.valid) ? 'Firma integra, certificatore non riconosciuto' : OV_SHORT[o.ov];

  // più file insieme: ognuno verificato e, se è una busta, estratto; i risultati restano separati
  async function startMany(stage, files) {
    const rows = files.map(f => batchRow(f.name, fmtSize(f.size), ic('seal', 22)));
    const opened = new Array(files.length).fill(null);
    const st = { reports: false, appendReport: false, stamp: false };
    let openErrors = [];
    await withBusy('Verifica delle firme…', async () => {
      const { results, errors } = await batchPool(rows, batchSlots(files.length, false), async (i, r, ctx, prog) => {
        const o = await openSigned(files[i], () => prog(0.5, 'Confronto con la versione firmata…'));
        const lv = o.ov === 'none' ? 'none' : o.ov;
        r.subEl.textContent = `${o.res.isPdfInput ? 'PDF' : o.res.type.label + ' estratto: ' + o.res.name} · ${fmtSize(o.res.content.length)}${o.signers.length ? ' · ' + o.signers.join(', ') : ''}`;
        r.done(ovShort(o) || 'Fatto');
        r.el.classList.add('sv-' + lv);
        return o;
      });
      results.forEach((o, i) => { opened[i] = o; });
      openErrors = errors;
    });
    const ok = opened.filter(Boolean);
    if (!ok.length) throw new Error('Nessuno dei file è un documento firmato digitalmente riconosciuto.');
    rows.forEach((r, i) => { if (!opened[i]) r.stEl.textContent = 'Non riconosciuto'; });
    const allPdf = ok.every(o => o.res.isPdfInput);
    const nBad = ok.filter(o => o.ov === 'bad').length, nPdfOut = ok.filter(o => o.res.type.ext === 'pdf' && !o.res.isPdfInput).length;
    const counts = ['ok', 'warn', 'bad', 'none'].map(k => [k, ok.filter(o => o.ov === k).length]).filter(x => x[1]);
    const mainEl = batchMain(rows, `${plural(files.length, 'file', 'file')} · ${counts.map(([k, n]) => `${n} ${{ ok: n > 1 ? 'con firme valide' : 'con firma valida', warn: 'con avvisi', bad: n > 1 ? 'NON validi' : 'NON valido', none: 'senza firma' }[k]}`).join(' · ')}`);
    mainEl.querySelector('.filelist').classList.add('nobar');
    workspace(stage, mainEl, [
      h('div', { class: 'sig-head s-' + (nBad ? 'bad' : ok.every(o => o.ov === 'ok') ? 'ok' : 'warn') }, ic(nBad ? 'x' : 'check', 22, 2.4),
        h('div', {}, h('b', {}, nBad ? `${plural(nBad, 'file con firma non valida', 'file con firma non valida')}` : `${plural(ok.length, 'file verificato', 'file verificati')}`),
          h('div', { class: 'small' }, 'Ogni documento viene estratto dalla sua busta e resta un file separato, con il suo nome. Per il dettaglio delle firme di un singolo file aprilo da solo.'))),
      sec('Cosa scaricare',
        checkbox('Anche il rapporto di verifica di ogni file (PDF)', st.reports, v => st.reports = v, 'Un rapporto separato per ciascun documento, con firmatari, certificati e controlli eseguiti.'),
        nPdfOut ? checkbox('Aggiungi il rapporto in fondo ai PDF estratti', st.appendReport, v => st.appendReport = v) : null,
        nPdfOut ? checkbox('Scrivi in calce alle pagine chi ha firmato', st.stamp, v => st.stamp = v, '«Documento firmato digitalmente da …» in piccolo, in fondo a ogni pagina dei PDF estratti.') : null),
      h('div', { class: 'hint' }, 'Verifica fatta sul tuo dispositivo, con l’elenco ufficiale italiano dei certificatori qualificati (AgID) incluso nell’app. La revoca si controlla quando il file contiene la risposta del certificatore (OCSP) o la lista dei certificati revocati (CRL), come nelle firme «a lungo termine»; il controllo online non si fa, per non mandare dati fuori dal dispositivo.'),
    ].filter(Boolean), [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), allPdf ? `Scarica i ${ok.length} rapporti di verifica` : `Scarica i ${ok.length} documenti`)]);

    async function run() {
      await withBusy('Preparazione dei file…', async () => {
        const outs = [];
        for (const [k, o] of ok.entries()) {
          Busy.check(); Busy.set(k / ok.length, o.file.name);
          const { res } = o;
          const isPdfContent = res.type.ext === 'pdf';
          const needRep = st.reports || res.isPdfInput || (isPdfContent && st.appendReport);
          const rep = needRep ? await report(res, o.meta) : null;
          const repName = `${FirmaKit.stripName(o.file.name).replace(/\.[a-z0-9]{2,5}$/i, '')}-verifica-firme.pdf`;
          if (res.isPdfInput) { outs.push({ name: repName, bytes: rep, info: `Rapporto di verifica di ${o.file.name} · ${ovShort(o)}` }); continue; }
          let content = res.content;
          if (isPdfContent && (st.appendReport || st.stamp)) {
            const lib = await loadLib(content);
            if (st.stamp) await stampSigners(lib, o.items);
            if (st.appendReport) { const r = await PDFDocument.load(rep); (await lib.copyPages(r, r.getPageIndices())).forEach(p => lib.addPage(p)); }
            content = await lib.save({ useObjectStreams: true });
          }
          outs.push({ name: res.name, bytes: content, type: res.type.mime, info: `${ovShort(o)}${o.signers.length ? ' · ' + o.signers.join(', ') : ''}` });
          if (st.reports) outs.push({ name: repName, bytes: rep, info: 'Rapporto di verifica' });
        }
        uniqueNames(outs.map(x => x.name)).forEach((n, i) => outs[i].name = n);
        showResult(outs, { title: allPdf ? 'Rapporti pronti' : 'Documenti estratti', zipName: 'documenti-estratti.zip',
          note: batchNote(outs.length, openErrors, [nBad ? `Attenzione: ${plural(nBad, 'file ha', 'file hanno')} una firma non valida.` : '', allPdf ? '' : 'I documenti estratti non contengono più la firma: per inviarli come originali usa i file .p7m.']) });
      }, { cancellable: true });
    }
  }

  async function start(stage, files) {
    if (files.length > 1) return startMany(stage, files);
    const file = files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new Error(`«${file.name}» è vuoto.`);
    const res = await withBusy('Verifica delle firme…', async () => {
      if (FirmaKit.isPdf(bytes)) {
        const pdfSigs = await FirmaKit.pdfSignatures(bytes);
        const r = { pdfSigs, layers: [], content: bytes, type: FirmaKit.sniff(bytes), name: file.name, isPdfInput: true };
        // revisioni: ciò che è stato aggiunto dopo ogni firma
        for (const p of pdfSigs) if (!p.whole && p.sig) {
          Busy.set(0.5, 'Confronto della versione firmata con il PDF attuale…');
          try { p.visual = await visualCheck(bytes.slice(0, p.covers), bytes); } catch (e) { console.warn(e); }
        }
        return r;
      }
      const r = await FirmaKit.open(bytes, file.name);
      if (!r.signed) throw new Error(`«${file.name}» non è un file firmato digitalmente riconosciuto (.p7m, .tsd, .m7m) né un PDF.`);
      return r;
    });
    const items = flatten(res);
    if (res.pdfSigs) items.forEach(it => { if (it.p?.visual) it.visual = it.p.visual; });
    const ov = overall(items);
    const isPdfContent = res.type.ext === 'pdf';
    let doc = null;
    if (isPdfContent) doc = await withBusy('Apertura del documento…', () => openPdf(new File([res.content], res.name, { type: 'application/pdf' })));
    const st = { appendReport: false, stamp: false };
    const meta = { fileName: file.name, fileSize: bytes.length, fileHash: await sha256hex(bytes), contentName: res.isPdfInput ? '' : res.name, contentType: res.type.label, contentHash: res.isPdfInput ? '' : await sha256hex(res.content) };

    let mainEl;
    if (doc) { const viewer = new Viewer(doc, { fit: IS_TOUCH ? 'width' : 'page' }); mainEl = viewer.el; requestAnimationFrame(() => viewer.render()); onLeave(() => viewer.destroy()); }
    else {
      let prev;
      if (/^(xml|xbrl|txt)$/.test(res.type.ext)) { const t = new TextDecoder('utf-8').decode(res.content.subarray(0, 60000)); prev = h('pre', { class: 'fx-pre' }, t.length >= 60000 ? t + '\n…' : t); }
      else if (/^(jpg|png)$/.test(res.type.ext)) prev = h('img', { class: 'fx-img', src: URL.createObjectURL(new Blob([res.content], { type: res.type.mime })), alt: res.name });
      else prev = h('div', { class: 'muted' }, 'Anteprima non disponibile per questo tipo di file: scaricalo e aprilo con il programma adatto.');
      mainEl = h('div', { class: 'fx-box' }, h('div', { class: 'fx-head' }, ic('file', 20), h('b', {}, res.name), h('span', { class: 'muted small' }, `${res.type.label} · ${fmtSize(res.content.length)}`)),
        res.type.ext === 'xbrl' && TOOLS.xbrl ? h('div', { class: 'hint' }, 'È un bilancio XBRL: puoi trasformarlo in un PDF leggibile.', h('button', { class: 'btn sm primary', style: { marginLeft: '8px' }, onclick: () => handoff('xbrl', new File([res.content], res.name, { type: 'application/xml' })) }, 'Converti in PDF')) : null,
        prev);
    }
    const modified = items.some(i => i.visual && !i.visual.same), untrusted = items.some(i => i.s?.untrusted && i.s.valid);
    const head = { ok: ['Tutte le firme sono valide', 'ok'], warn: [modified ? 'Firma valida, ma il PDF è stato modificato dopo la firma' : untrusted ? 'Firma integra, ma il certificatore non è riconosciuto' : 'Firme valide, con avvisi', 'warn'], bad: ['Attenzione: firma non valida', 'bad'], none: ['Nessuna firma digitale in questo PDF', 'none'] }[ov];
    const signers = [...new Set(items.filter(i => i.s?.who).map(i => i.s.who.name))];
    const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), res.isPdfInput ? 'Crea il rapporto di verifica' : isPdfContent ? 'Estrai il PDF' : `Estrai il file ${res.type.ext.toUpperCase()}`);
    const side = [
      h('div', { class: 'sig-head s-' + head[1] }, ic(ov === 'ok' ? 'check' : ov === 'none' ? 'file' : ov === 'warn' ? 'shield' : 'x', 22, 2.4),
        h('div', {}, h('b', {}, head[0]), h('div', { class: 'small' }, signers.length ? 'Firmato da ' + signers.join(', ') : res.isPdfInput && !items.length ? 'Il PDF non contiene firme digitali: eventuali firme visibili sono solo immagini.' : ''))),
      ...items.map(card),
      res.layers?.length ? h('div', { class: 'muted small' }, res.layers.length > 1 ? `Il file conteneva ${res.layers.length} buste una dentro l’altra: sono state aperte e verificate tutte.` : '') : null,
      isPdfContent && !res.isPdfInput ? sec('Opzioni del PDF estratto',
        checkbox('Aggiungi in fondo il rapporto di verifica', st.appendReport, v => st.appendReport = v, 'Utile per stampare o archiviare il documento insieme all’esito delle firme.'),
        checkbox('Scrivi in calce alle pagine chi ha firmato', st.stamp, v => st.stamp = v, '«Documento firmato digitalmente da …» in piccolo, in fondo a ogni pagina.')) : null,
      h('div', { class: 'hint' }, 'Verifica fatta sul tuo dispositivo, con l’elenco ufficiale italiano dei certificatori qualificati (AgID) incluso nell’app. La revoca si controlla quando il file contiene la risposta del certificatore (OCSP) o la lista dei certificati revocati (CRL), come nelle firme «a lungo termine»; il controllo online non si fa, per non mandare dati fuori dal dispositivo.'),
    ].filter(Boolean);
    workspace(stage, h('div', { class: 'ws-main vw' }, mainEl), side, [runBtn]);

    async function run() {
      await withBusy('Preparazione dei file…', async () => {
        const rep = await report(res, meta);
        const outs = [];
        if (res.isPdfInput) {
          outs.push({ name: `${stripExt(file.name)}-verifica-firme.pdf`, bytes: rep, info: 'Rapporto di verifica' });
          res.pdfSigs.forEach((p, i) => { if (!p.whole) outs.push({ name: `${stripExt(file.name)}-versione-firmata-${i + 1}.pdf`, bytes: bytes.slice(0, p.covers), info: `Il PDF com’era quando è stata apposta la firma ${i + 1}` }); });
          return showResult(outs, { primary: 0, title: 'Rapporto pronto', note: head[0] + '.', zipName: stripExt(file.name) + '-verifica.zip' });
        }
        let content = res.content;
        if (isPdfContent && (st.appendReport || st.stamp)) {
          const lib = await loadLib(content);
          if (st.stamp) await stampSigners(lib, items);
          if (st.appendReport) { const r = await PDFDocument.load(rep); (await lib.copyPages(r, r.getPageIndices())).forEach(p => lib.addPage(p)); }
          content = await lib.save({ useObjectStreams: true });
        }
        outs.push({ name: res.name, bytes: content, type: res.type.mime, info: isPdfContent ? 'Documento estratto dal file firmato' : res.type.label });
        outs.push({ name: `${FirmaKit.stripName(file.name).replace(/\.[a-z0-9]{2,5}$/i, '')}-verifica-firme.pdf`, bytes: rep, info: 'Rapporto di verifica' });
        showResult(outs, { primary: 0, title: isPdfContent ? 'PDF estratto' : 'File estratto', note: `${head[0]}${signers.length ? ': ' + signers.join(', ') : ''}. Il documento estratto non contiene più la firma: per inviarlo come originale usa il file .p7m.`, zipName: stripExt(file.name) + '.zip' });
      }, { job: true });
    }
  }
  return { start, report, flatten };
})();