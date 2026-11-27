/* =====================================================================
   Passa file: tra telefono e computer, direttamente, cifrato, senza cloud né account.
   Il computer mostra un QR (un indirizzo di file360 con i dati del collegamento dopo il «#», che non arriva mai al
   server): il telefono lo inquadra, anche con la fotocamera del sistema, e si collega da solo. Il computer conosce il
   telefono grazie all'abbinamento fatto una volta (un link o un'immagine mandati a sé stessi): l'impronta del
   certificato del telefono, che resta sul telefono per un anno e si rinnova da sola. I file viaggiano su un canale
   WebRTC cifrato (DTLS) da dispositivo a dispositivo sulla stessa rete; ogni file arriva con la sua impronta SHA-256
   verificata. Nessun server: niente STUN, niente TURN, niente appuntamenti.
   ===================================================================== */
const Passa = (() => {
  const enc = new TextEncoder();
  const b64u = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); s += '==='.slice((s.length + 3) % 4); const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const fpBytes = fp => Uint8Array.from(String(fp).split(':').map(x => parseInt(x, 16)));
  const fpText = u8 => [...u8].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
  const sha = async data => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
  const uguali = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const CERT = { name: 'ECDSA', namedCurve: 'P-256', expires: 360 * 864e5 };

  /* ---------- SHA-256 a pezzi (l'impronta di un file mentre arriva, senza tenerlo tutto in memoria) ---------- */
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  class Sha256 {
    constructor() { this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); this.buf = new Uint8Array(64); this.n = 0; this.len = 0; this.w = new Uint32Array(64); }
    _blk(d, o) {
      const w = this.w, h = this.h;
      for (let i = 0; i < 16; i++) w[i] = (d[o + 4 * i] << 24) | (d[o + 4 * i + 1] << 16) | (d[o + 4 * i + 2] << 8) | d[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) + w[i - 16]; }
      let a = h[0], b = h[1], c = h[2], e = h[4], f = h[5], g = h[6], dd = h[3], hh = h[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += dd; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    update(d) {
      d = d instanceof Uint8Array ? d : new Uint8Array(d); this.len += d.length; let i = 0;
      if (this.n) { while (this.n < 64 && i < d.length) this.buf[this.n++] = d[i++]; if (this.n === 64) { this._blk(this.buf, 0); this.n = 0; } }
      for (; i + 64 <= d.length; i += 64) this._blk(d, i);
      while (i < d.length) this.buf[this.n++] = d[i++];
      return this;
    }
    hex() {
      const bits = this.len * 8, pad = new Uint8Array(((this.n < 56 ? 56 : 120) - this.n) + 8); pad[0] = 0x80;
      const dv = new DataView(pad.buffer); dv.setUint32(pad.length - 8, Math.floor(bits / 2 ** 32)); dv.setUint32(pad.length - 4, bits >>> 0);
      this.update(pad); return [...this.h].map(x => x.toString(16).padStart(8, '0')).join('');
    }
  }

  /* ---------- archivio locale: identità di questo dispositivo e dispositivi abbinati ---------- */
  const IDB = (() => {
    let p = null;
    const db = () => p ||= new Promise((res, rej) => { const q = indexedDB.open('file360-passa', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const op = (mode, f) => db().then(d => new Promise((res, rej) => { const t = d.transaction('kv', mode); const r = f(t.objectStore('kv')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
    return { get: k => op('readonly', s => s.get(k)), set: (k, v) => op('readwrite', s => s.put(v, k)) };
  })();
  const nomeProposto = () => {
    const u = navigator.userAgent || '';
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Telefono Android' : 'Tablet Android') : /Windows/.test(u) ? 'Computer Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Computer Linux' : 'Dispositivo';
  };
  let ID = null;
  async function identita() {
    if (ID) return ID;
    let r = null; try { r = await IDB.get('identita'); } catch { }
    let temporanea = false;
    if (!r || !r.cert || r.cert.expires < Date.now() + 864e5) {
      r = { cert: await RTCPeerConnection.generateCertificate(CERT), nome: r?.nome || nomeProposto() };
      try { await IDB.set('identita', r); const back = await IDB.get('identita'); temporanea = !(back && back.cert && back.cert.getFingerprints); } catch { temporanea = true; }
    }
    const fp = r.cert.getFingerprints().find(f => /sha-256/i.test(f.algorithm))?.value.toUpperCase();
    ID = { cert: r.cert, nome: r.nome, fp, fpb: fpBytes(fp), temporanea, scade: r.cert.expires, nuovo: r.nuovo || null };
    try { if (navigator.storage?.persist) navigator.storage.persist(); } catch { }
    return ID;
  }
  async function rinomina(nome) { const i = await identita(); i.nome = String(nome || '').trim().slice(0, 40) || nomeProposto(); try { const r = await IDB.get('identita'); await IDB.set('identita', { ...r, nome: i.nome }); } catch { } return i.nome; }
  // certificato in scadenza (meno di 30 giorni): se ne prepara uno nuovo, che il computer impara al collegamento successivo
  async function certNuovo() { const i = await identita(); if (i.scade > Date.now() + 30 * 864e5) return null; if (!i.nuovo) { i.nuovo = await RTCPeerConnection.generateCertificate(CERT); try { const r = await IDB.get('identita'); await IDB.set('identita', { ...r, nuovo: i.nuovo }); } catch { } } return i.nuovo; }
  async function usaCertNuovo() { const i = await identita(); if (!i.nuovo) return; try { const r = await IDB.get('identita'); await IDB.set('identita', { cert: i.nuovo, nome: r.nome }); } catch { } ID = null; }
  async function dispositivi() { try { return (await IDB.get('dispositivi')) || []; } catch { return []; } }
  async function salvaDispositivi(L) { try { await IDB.set('dispositivi', L); } catch { } }
  async function abbina({ fp, nome }) {
    const L = (await dispositivi()).filter(d => d.fp !== fp);
    L.unshift({ fp, nome: String(nome || 'Telefono').slice(0, 40), quando: Date.now(), ultimo: 0, confermato: false });
    await salvaDispositivi(L.slice(0, 12)); return L[0];
  }
  async function aggiornaDispositivo(fp, cambi) { const L = await dispositivi(), d = L.find(x => x.fp === fp); if (d) { Object.assign(d, cambi); await salvaDispositivi(L); } return d; }
  async function togli(fp) { await salvaDispositivi((await dispositivi()).filter(d => d.fp !== fp)); }

  /* ---------- link e codice di abbinamento ---------- */
  // l'indirizzo pubblico di file360 (dal file unico si usa il sito): i dati stanno dopo «#» e non arrivano al server
  const base = () => { try { if (typeof IS_SITE !== 'undefined' && IS_SITE) return new URL(pagePath('passa'), SITE_BASE).href; } catch { } return 'https://file360.vercel.app/' + (typeof SEO !== 'undefined' ? SEO.slug('passa') : 'passa-file') + '/'; };
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function codice(fpb) {   // 52 caratteri Crockford: 256 bit + 4 bit di controllo, a gruppi di 4
    let bits = '', x = 0; for (const b of fpb) { bits += b.toString(2).padStart(8, '0'); x ^= (b >> 4) ^ (b & 15); }
    bits += x.toString(2).padStart(4, '0'); let s = ''; for (let i = 0; i < bits.length; i += 5) s += B32[parseInt(bits.slice(i, i + 5), 2)];
    return s.match(/.{1,4}/g).join('-');
  }
  function daCodice(t) {
    const s = String(t).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
    if (s.length !== 52) return null;
    let bits = ''; for (const c of s) { const v = B32.indexOf(c); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
    const u = new Uint8Array(32); let x = 0; for (let i = 0; i < 32; i++) { u[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2); x ^= (u[i] >> 4) ^ (u[i] & 15); }
    return parseInt(bits.slice(256, 260), 2) === x ? u : null;
  }
  async function linkAbbinamento() { const i = await identita(); return `${base()}#abbina=${b64u(i.fpb)}.${encodeURIComponent(i.nome)}`; }
  // da un link, dal testo di un messaggio o da un codice scritto a mano
  function leggiAbbinamento(t) {
    t = String(t || '');
    const m = /abbina=([A-Za-z0-9_-]{43})(?:\.([^\s&#"'<>]*))?/.exec(t);
    if (m) { const u = unb64u(m[1]); if (u.length === 32) { let nome = ''; try { nome = decodeURIComponent(m[2] || ''); } catch { } return { fp: fpText(u), nome: nome || 'Telefono' }; } }
    const c = /([0-9A-Za-z]{4}[- ]?){12}[0-9A-Za-z]{4}/.exec(t), u = c ? daCodice(c[0]) : null;
    return u ? { fp: fpText(u), nome: 'Telefono' } : null;
  }
  // il codice di controllo che i due schermi mostrano uguale (dalle due impronte): chi si mette in mezzo lo cambia
  async function controllo(fpA, fpB) { const h = await sha([fpA, fpB].sort().join('|')); const n = ((h[0] << 16) | (h[1] << 8) | h[2]) % 10000; return String(n).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1-$2'); }

  /* ---------- descrizioni della sessione (SDP) ricostruite dai pochi byte del QR ---------- */
  const sdp = ({ ufrag, pwd, fp, setup, cands = [] }) => ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', ...cands.map(c => 'a=' + c), 'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd,
    'a=fingerprint:sha-256 ' + fp, 'a=setup:' + setup, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
  const conCred = (s, u, p) => s.replace(/a=ice-ufrag:.*/g, 'a=ice-ufrag:' + u).replace(/a=ice-pwd:.*/g, 'a=ice-pwd:' + p);
  // credenziali di collegamento derivate dal seme del QR: le calcolano uguali tutti e due, senza scambiarle
  async function credenziali(seme, k) { const h = async t => hex(await sha(b64u(seme) + t + k)); return { pcU: (await h('pu')).slice(0, 8), pcP: (await h('pp')).slice(0, 24), telU: (await h('tu')).slice(0, 8), telP: (await h('tp')).slice(0, 24) }; }
  const raccogli = pc => new Promise(r => { if (pc.iceGatheringState === 'complete') return r(); const f = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', f); r(); } }; pc.addEventListener('icegatheringstatechange', f); setTimeout(r, 2500); });
  const candidati = s => s.split(/\r\n/).filter(l => /^a=candidate:/.test(l) && / udp /i.test(l) && / typ host/.test(l)).map(l => { const p = l.slice(12).split(' '); return { addr: p[4], port: +p[5] }; });
  function indirizzoBytes(a) {
    const md = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i.exec(a);
    if (md) return [0, ...md.slice(1).join('').match(/../g).map(x => parseInt(x, 16))];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(a)) return [1, ...a.split('.').map(Number)];
    return null;   // IPv6 senza nome: sulla stessa rete basta l'IPv4 o il nome .local
  }
  function indirizzoTesto(u, i) {
    if (u[i] === 0) { const h = hex(u.subarray(i + 1, i + 17)); return [`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`, i + 17]; }
    if (u[i] === 1) return [[...u.subarray(i + 1, i + 5)].join('.'), i + 5];
    throw new Error('QR non valido');
  }

  /* ---------- il canale: protocollo dei messaggi e trasferimento dei file ---------- */
  class Canale {
    constructor(pc, dc, { io, altro, fpAltro, fpMio }) {
      Object.assign(this, { pc, dc, io, altro, fpAltro, fpMio, ascolta: new Set(), coda: [], invio: null, arrivo: null, nId: 0, aperto: false, chiuso: false, file: [] });
      dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = 2 << 20;
      const apri = async () => { if (this.aperto) return; this.aperto = true; this.sas = await controllo(this.fpMio, this.fpAltro); this.manda({ t: 'ciao', nome: io.nome, v: 1 }); this._evento('aperto'); this._prossimo(); };
      if (dc.readyState === 'open') apri(); else dc.addEventListener('open', apri);
      dc.addEventListener('message', e => this._ricevi(e.data));
      const fine = () => { if (this.chiuso) return; this.chiuso = true; if (this.invio) this.invio.errore = 'collegamento interrotto'; this._evento('chiuso'); };
      dc.addEventListener('close', fine);
      pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) setTimeout(() => { if (pc.connectionState !== 'connected') fine(); }, pc.connectionState === 'disconnected' ? 4000 : 0); });
    }
    on(f) { this.ascolta.add(f); return () => this.ascolta.delete(f); }
    _evento(tipo, x) { for (const f of this.ascolta) try { f(tipo, x, this); } catch (e) { console.warn(e); } }
    manda(o) { if (this.dc.readyState === 'open') this.dc.send(JSON.stringify(o)); }
    get chunk() { const m = this.pc.sctp?.maxMessageSize || 65536; return Math.max(16384, Math.min(m || 65536, 256 * 1024)); }
    invia(files) { for (const f of files) { const x = { id: ++this.nId, dir: 'out', nome: f.name || 'file', size: f.size, tipo: f.type || '', fatti: 0, t0: 0, f, stato: 'in coda' }; this.file.push(x); this.coda.push(x); this._evento('file', x); } this._prossimo(); }
    testo(v) { this.manda({ t: 'testo', v: String(v) }); const x = { id: ++this.nId, dir: 'out', testo: String(v), stato: 'inviato' }; this.file.push(x); this._evento('file', x); }
    annulla(x) { if (x.dir === 'out') { if (this.invio === x) x.annullato = true; else { this.coda = this.coda.filter(y => y !== x); x.stato = 'annullato'; this._evento('file', x); } } else this.manda({ t: 'stop', id: x.rid }); }
    chiudi() { try { this.dc.close(); } catch { } try { this.pc.close(); } catch { } }
    async _spazio() { const dc = this.dc; if (dc.bufferedAmount < (8 << 20)) return; await new Promise(r => { const f = () => { dc.removeEventListener('bufferedamountlow', f); r(); }; dc.addEventListener('bufferedamountlow', f); setTimeout(f, 2000); }); }
    async _prossimo() {
      if (this.invio || !this.aperto || this.chiuso) return;
      const x = this.coda.shift(); if (!x) return;
      this.invio = x; x.stato = 'invio'; x.t0 = performance.now(); this._evento('file', x);
      try {
        this.manda({ t: 'file', id: x.id, nome: x.nome, size: x.size, tipo: x.tipo });
        const h = new Sha256(), CH = this.chunk, BL = 4 << 20;
        for (let o = 0; o < x.size && !x.annullato && !this.chiuso && !x.stop; o += BL) {
          const buf = new Uint8Array(await x.f.slice(o, Math.min(x.size, o + BL)).arrayBuffer());
          h.update(buf);
          for (let i = 0; i < buf.length; i += CH) { await this._spazio(); if (x.annullato || this.chiuso || x.stop) break; this.dc.send(buf.subarray(i, Math.min(buf.length, i + CH))); x.fatti += Math.min(CH, buf.length - i); }
          this._evento('progresso', x);
        }
        if (x.annullato || x.stop) { this.manda({ t: 'annullato', id: x.id }); x.stato = 'annullato'; }
        else if (this.chiuso) x.stato = 'interrotto';
        else { x.sha = h.hex(); this.manda({ t: 'fine', id: x.id, sha: x.sha }); x.stato = 'attesa'; }
      } catch (e) { x.stato = 'errore'; x.errore = e.message; }
      this._evento('file', x); this.invio = null; this._prossimo();
    }
    _ricevi(d) {
      if (typeof d !== 'string') {
        const a = this.arrivo; if (!a) return;
        const u = new Uint8Array(d); a.h.update(u); a.parti.push(u); a.inMem += u.length; a.fatti += u.length;
        // ogni 64 MB i pezzi passano in un Blob (il browser li può tenere su disco): niente gigabyte in memoria
        if (a.inMem >= 64 << 20) { a.blob = new Blob([a.blob, ...a.parti]); a.parti = []; a.inMem = 0; }
        if (performance.now() - (a.ultimo || 0) > 120) { a.ultimo = performance.now(); this._evento('progresso', a); }
        return;
      }
      let m; try { m = JSON.parse(d); } catch { return; }
      if (m.t === 'ciao') { this.nomeAltro = m.nome; this._evento('ciao', m); }
      else if (m.t === 'file') { const a = this.arrivo = { id: ++this.nId, rid: m.id, dir: 'in', nome: String(m.nome || 'file').replace(/[\\/:*?"<>|]+/g, '-'), size: +m.size || 0, tipo: m.tipo || '', fatti: 0, t0: performance.now(), h: new Sha256(), parti: [], blob: new Blob([]), inMem: 0, stato: 'arrivo' }; this.file.push(a); this._evento('file', a); }
      else if (m.t === 'fine' || m.t === 'annullato') {
        const a = this.arrivo; if (!a || a.rid !== m.id) return; this.arrivo = null;
        if (m.t === 'annullato') { a.stato = 'annullato'; a.parti = []; this._evento('file', a); return; }
        const blob = new Blob([a.blob, ...a.parti], { type: a.tipo }); a.parti = []; a.blob = null;
        const sha = a.h.hex(); a.verificato = sha === m.sha && blob.size === a.size;
        a.file = new File([blob], a.nome, { type: a.tipo, lastModified: Date.now() }); a.stato = a.verificato ? 'arrivato' : 'diverso'; a.t1 = performance.now();
        this.manda({ t: 'ricevuto', id: m.id, ok: a.verificato }); this._evento('file', a);
      }
      else if (m.t === 'ricevuto') { const x = this.file.find(y => y.dir === 'out' && y.id === m.id); if (x) { x.stato = m.ok ? 'consegnato' : 'diverso'; x.t1 = performance.now(); this._evento('file', x); } }
      else if (m.t === 'stop') { const x = this.file.find(y => y.dir === 'out' && y.id === m.id); if (x) { x.stop = true; if (this.invio !== x) { this.coda = this.coda.filter(y => y !== x); x.stato = 'annullato'; this._evento('file', x); } } }
      else if (m.t === 'testo') { const x = { id: ++this.nId, dir: 'in', testo: String(m.v || ''), stato: 'arrivato' }; this.file.push(x); this._evento('file', x); }
      else if (m.t === 'rinnova' || m.t === 'rinnovato') this._evento(m.t, m);
    }
  }
  const nuovoPc = cert => new RTCPeerConnection({ iceServers: [], certificates: [cert] });
  const canaleDati = pc => pc.createDataChannel('file360', { negotiated: true, id: 0, ordered: true });

  /* ---------- computer: il QR e le connessioni in attesa ---------- */
  // una connessione per ogni telefono abbinato (al massimo 3, i più recenti) più una libera per chi si abbina adesso
  async function ospita({ onCanale, max = 3 } = {}) {
    const cert = await RTCPeerConnection.generateCertificate(CERT), fp = cert.getFingerprints().find(f => /sha-256/i.test(f.algorithm)).value.toUpperCase();
    const io = { nome: (await identita()).nome, fp };
    const seme = crypto.getRandomValues(new Uint8Array(8));
    const tel = (await dispositivi()).slice().sort((a, b) => (b.ultimo || b.quando) - (a.ultimo || a.quando)).slice(0, max);
    const voci = [...tel.map(t => ({ t, id: fpBytes(t.fp).subarray(0, 3) })), { t: null, id: new Uint8Array(3) }];
    const indirizzi = [], chiuso = { v: false };
    // l'indirizzo IP del computer scritto una volta dall'utente: il browser lo nasconde dietro un nome «.local» che alcune
    // reti (o alcuni telefoni) non risolvono; con l'indirizzo nel QR il telefono non deve risolvere niente
    const ipFisso = await ipComputer();
    for (const [k, v] of voci.entries()) {
      const c = await credenziali(seme, k), pc = v.pc = nuovoPc(cert), dc = canaleDati(pc);
      const o = await pc.createOffer(); o.sdp = conCred(o.sdp, c.pcU, c.pcP);
      await pc.setLocalDescription(o); await raccogli(pc);
      v.porte = {}; const cs = candidati(pc.localDescription.sdp);
      for (const x of cs) { const b = indirizzoBytes(x.addr); if (!b) continue; const key = b.join(','); if (!indirizzi.some(i => i.key === key)) indirizzi.push({ key, b }); v.porte[key] = x.port; }
      // lo stesso indirizzo con la porta di ciascun candidato (quello IPv4 è uno di loro: il telefono li prova tutti)
      if (ipFisso && !cs.some(x => x.addr === ipFisso)) cs.filter((x, i, A) => A.findIndex(y => y.port === x.port) === i).slice(0, 2).forEach((x, j) => { const key = 'fisso' + j; if (!indirizzi.some(i => i.key === key)) indirizzi.push({ key, b: [1, ...ipFisso.split('.').map(Number)] }); v.porte[key] = x.port; });
      v.c = c;
      const attiva = async t => { v.t = t; await pc.setRemoteDescription({ type: 'answer', sdp: sdp({ ufrag: c.telU, pwd: c.telP, fp: t.fp, setup: 'active' }) }); };
      v.attiva = attiva;
      if (v.t) await attiva(v.t);
      const can = new Canale(pc, dc, { io, fpMio: fp, fpAltro: null });
      Object.defineProperty(can, 'fpAltro', { get: () => v.t?.fp, configurable: true });
      can.on(tipo => { if (tipo === 'aperto' && !chiuso.v) onCanale?.(can, v.t); });
      v.canale = can;
    }
    if (!indirizzi.length) throw codedError('Questo computer non è collegato a nessuna rete: collegalo alla Wi-Fi o al cavo dello stesso router del telefono.', 'NET');
    // il QR: versione, impronta del computer, seme, indirizzi, per ogni voce l'inizio dell'impronta del telefono e le porte
    const out = [1, ...fpBytes(fp), ...seme, indirizzi.length, ...indirizzi.flatMap(i => i.b), voci.length];
    for (const v of voci) { out.push(...v.id); for (const i of indirizzi) { const p = v.porte[i.key] || 0; out.push(p >> 8, p & 255); } }
    const url = base() + '#c=' + b64u(Uint8Array.from(out));
    return {
      url, fp, voci,
      // un telefono abbinato adesso (link aperto in un'altra scheda, immagine trascinata, codice incollato): usa la voce libera
      async attivaNuovo(t) { const v = voci[voci.length - 1]; if (v.t) return false; await v.attiva(t); return true; },
      // codice di rete del telefono: il computer conosce il suo indirizzo e bussa per primo
      async bussa({ addr, port, k }) { const v = voci[k]; if (!v || !v.t) return false; await v.pc.addIceCandidate({ candidate: `candidate:9 1 udp 2122260223 ${addr} ${port} typ host`, sdpMid: '0', sdpMLineIndex: 0 }); return true; },
      chiudi() { chiuso.v = true; for (const v of voci) if (!v.canale.aperto) try { v.pc.close(); } catch { } },
    };
  }

  /* ---------- telefono: dal QR al collegamento ---------- */
  function leggiQR(t) { try { return leggiQR_(t); } catch { return null; } }
  function leggiQR_(t) {
    const m = /[#&]c=([A-Za-z0-9_-]+)/.exec(String(t)); if (!m) return null;
    const u = unb64u(m[1]); if (u[0] !== 1) return null;
    let i = 1; const fp = fpText(u.subarray(i, i + 32)); i += 32; const seme = u.slice(i, i + 8); i += 8;
    const nI = u[i++], addr = []; for (let k = 0; k < nI; k++) { const [a, j] = indirizzoTesto(u, i); addr.push(a); i = j; }
    const nV = u[i++], voci = [];
    for (let k = 0; k < nV; k++) { const id = u.slice(i, i + 3); i += 3; const porte = []; for (let j = 0; j < nI; j++) { porte.push((u[i] << 8) | u[i + 1]); i += 2; } voci.push({ k, id, porte }); }
    return { fp, seme, addr, voci };
  }
  async function collegati(q, { onCanale, attesa = 15000 } = {}) {
    const io = await identita(), mio = io.fpb.subarray(0, 3);
    let v = q.voci.find(x => uguali(x.id, mio)); const nuovo = !v; if (!v) v = q.voci.find(x => x.id.every(b => b === 0));
    if (!v) throw codedError('Questo QR non ha posto per un telefono nuovo: sul computer riapri «Passa file».', 'PAIR');
    const c = await credenziali(q.seme, v.k);
    const cands = q.addr.map((a, j) => v.porte[j] ? `candidate:${j + 1} 1 udp ${2113937151 - j} ${a} ${v.porte[j]} typ host` : null).filter(Boolean);
    const pc = nuovoPc(io.cert), dc = canaleDati(pc);
    await pc.setRemoteDescription({ type: 'offer', sdp: sdp({ ufrag: c.pcU, pwd: c.pcP, fp: q.fp, setup: 'actpass', cands }) });
    const a = await pc.createAnswer(); a.sdp = conCred(a.sdp, c.telU, c.telP); await pc.setLocalDescription(a);
    const can = new Canale(pc, dc, { io, fpMio: io.fp, fpAltro: q.fp });
    can.on(t => { if (t === 'aperto') onCanale?.(can); });
    return { canale: can, nuovo, pc, k: v.k };
  }

  /* ---------- lettore di QR: fotocamera e immagini ---------- */
  let BD = null;
  const rilevatore = async () => { if (BD !== null) return BD; try { BD = typeof BarcodeDetector !== 'undefined' && (await BarcodeDetector.getSupportedFormats()).includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : false; } catch { BD = false; } return BD; };
  async function decodifica(src, w, h) {
    const bd = await rilevatore();
    if (bd) { try { const r = await bd.detect(src); if (r[0]?.rawValue) return r[0].rawValue; } catch { } }
    const c = decodifica.c ||= document.createElement('canvas'), s = Math.min(1, 900 / Math.max(w, h)); c.width = Math.round(w * s); c.height = Math.round(h * s);
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), r = jsQR(d.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    return r ? r.data || new TextDecoder().decode(Uint8Array.from(r.binaryData)) : null;
  }
  async function qrDaImmagine(file) { const bm = await createImageBitmap(file); try { return await decodifica(bm, bm.width, bm.height); } finally { bm.close?.(); } }
  // la fotocamera posteriore che cerca un QR finché lo trova (o finché ferma() viene chiamata)
  async function scansiona(video, { onTrovato, filtro = () => true }) {
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = st; video.setAttribute('playsinline', ''); video.muted = true; await video.play().catch(() => { });
    let vivo = true;
    (async () => { while (vivo) { if (video.readyState >= 2 && video.videoWidth) { const t = await decodifica(video, video.videoWidth, video.videoHeight).catch(() => null); if (t && filtro(t)) { vivo = false; st.getTracks().forEach(x => x.stop()); onTrovato(t); return; } } await new Promise(r => setTimeout(r, 120)); } })();
    return () => { vivo = false; st.getTracks().forEach(x => x.stop()); };
  }

  // immagine da mandare a sé stessi: QR del link di abbinamento, nome del telefono e codice scritto
  async function immagineAbbinamento() {
    const i = await identita(), link = await linkAbbinamento(), q = QR.encode(link, { ecl: 'M' }), qc = QR.canvas(q, 560, { border: 4 });
    const W = 720, H = 980, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(qc, (W - qc.width) / 2, 120);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = '700 34px system-ui, sans-serif'; g.fillText('file360 · abbina questo telefono', W / 2, 70);
    g.font = '600 30px system-ui, sans-serif'; g.fillText(i.nome, W / 2, 120 + qc.height + 56);
    g.font = '500 22px ui-monospace, monospace'; const cod = codice(i.fpb).split('-'); for (let r = 0; r < 3; r++) g.fillText(cod.slice(r * 5, r * 5 + 5).join('-'), W / 2, 120 + qc.height + 110 + r * 34);
    g.font = '400 20px system-ui, sans-serif'; g.fillStyle = '#555'; g.fillText('Sul computer: apri file360 › Passa file e trascina qui questa immagine', W / 2, H - 36);
    return await new Promise(r => c.toBlob(b => r(new File([b], `Abbina ${i.nome}.png`, { type: 'image/png' })), 'image/png'));
  }

  const ipValido = t => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(t || '').trim());
  async function ipComputer() { try { return (await IDB.get('ipComputer')) || ''; } catch { return ''; } }
  async function salvaIpComputer(t) { t = String(t || '').trim(); if (t && !ipValido(t)) return false; try { await IDB.set('ipComputer', t); } catch { } return true; }

  /* ---------- quando il telefono non arriva al computer ---------- */
  // che cosa è successo, dalle statistiche del collegamento del telefono
  async function diagnosi(pc) {
    const st = await pc.getStats(); let remoti = 0, inviati = 0, risposte = 0;
    st.forEach(x => { if (x.type === 'remote-candidate') remoti++; if (x.type === 'candidate-pair') { inviati += x.requestsSent || 0; risposte += x.responsesReceived || 0; } });
    const causa = risposte > 0 ? 'cifratura' : inviati > 0 ? 'risposta' : 'indirizzo';
    return { causa, remoti, inviati, risposte };
  }
  // il codice di rete: indirizzo IPv4 e porta del telefono (e quale voce del QR usa), da scrivere sul computer.
  // Con il codice è il computer a «bussare» al telefono: passa il firewall del computer e non serve il nome .local
  const privato = a => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a);
  async function indirizzoTelefono(pc) {
    await raccogli(pc);
    const L = candidati(pc.localDescription.sdp).filter(x => /^\d+\.\d+\.\d+\.\d+$/.test(x.addr) && !/^(127|0)\./.test(x.addr));
    const voto = a => (/^192\.168\./.test(a) ? 3 : privato(a) ? 2 : /^169\.254\./.test(a) ? 0 : 1);
    return L.sort((a, b) => voto(b.addr) - voto(a.addr))[0] || null;
  }
  function codiceRete({ addr, port }, k) {
    const b = [...addr.split('.').map(Number), port >> 8, port & 255, k & 255]; let bits = '', x = 0;
    for (const v of b) { bits += v.toString(2).padStart(8, '0'); x ^= (v >> 4) ^ (v & 15); }
    bits += x.toString(2).padStart(4, '0'); let out = ''; for (let i = 0; i < 60; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
    return out.match(/.{4}/g).join('-');
  }
  function leggiCodiceRete(t) {
    const s = String(t).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
    if (s.length !== 12) return null;
    let bits = ''; for (const c of s) { const v = B32.indexOf(c); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
    const b = []; let x = 0; for (let i = 0; i < 7; i++) { b.push(parseInt(bits.slice(i * 8, i * 8 + 8), 2)); x ^= (b[i] >> 4) ^ (b[i] & 15); }
    if (parseInt(bits.slice(56, 60), 2) !== x) return null;
    return { addr: b.slice(0, 4).join('.'), port: (b[4] << 8) | b[5], k: b[6] };
  }

  return { identita, rinomina, dispositivi, abbina, togli, aggiornaDispositivo, certNuovo, usaCertNuovo, linkAbbinamento, leggiAbbinamento, codice, daCodice, controllo, ospita, leggiQR, collegati, scansiona, qrDaImmagine, immagineAbbinamento, base, Sha256, diagnosi, indirizzoTelefono, codiceRete, leggiCodiceRete, ipComputer, salvaIpComputer, ipValido, _test: { b64u, unb64u, fpText, fpBytes } };
})();

/* ---------- la sessione resta viva anche fuori dalla pagina (per aprire un file ricevuto in un altro strumento) ---------- */
const PassaSessione = (() => {
  let can = null, pill = null; const ascolta = new Set();
  function imposta(c) {
    can = c; c.on((tipo) => { if (tipo === 'chiuso') { if (can === c) can = null; aggiornaPill(); } for (const f of ascolta) try { f(tipo); } catch { } aggiornaPill(); });
    aggiornaPill();
  }
  function aggiornaPill() {
    const fuori = typeof CURRENT_TOOL !== 'undefined' ? CURRENT_TOOL !== 'passa' : true;
    if (!can || can.chiuso || !fuori) { pill?.remove(); pill = null; return; }
    if (!pill) { pill = h('button', { type: 'button', class: 'pa-pill', onclick: () => nav('passa') }); document.body.append(pill); }
    const inArrivo = can.file.filter(x => x.stato === 'invio' || x.stato === 'arrivo').length;
    pill.replaceChildren(ic('phone', 16), h('span', {}, `${can.nomeAltro || 'Dispositivo'} collegato${inArrivo ? ` · ${inArrivo} in corso` : ''}`));
  }
  return { get canale() { return can && !can.chiuso ? can : null; }, imposta, aggiornaPill, on: f => (ascolta.add(f), () => ascolta.delete(f)) };
})();

/* ---------- lo strumento ---------- */
async function startPassa(stage) {
  const main = h('div', { class: 'pa-main' });
  stage.replaceChildren(h('div', { class: 'pa-wrap' }, main));
  const ingresso = (typeof PASSA_INGRESSO !== 'undefined' && PASSA_INGRESSO) || ''; if (typeof PASSA_INGRESSO !== 'undefined') PASSA_INGRESSO = '';
  const io = await Passa.identita();
  let ruolo = /[#&]c=/.test(ingresso) ? 'telefono' : /abbina=/.test(ingresso) ? 'computer' : (() => { try { return localStorage.getItem('passa-ruolo'); } catch { return null; } })() || (IS_TOUCH && Math.min(screen.width, screen.height) < 820 ? 'telefono' : 'computer');
  let sessione = null, fermaCam = null, vivo = true, timer = null;
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('file360-passa') : null;
  onLeave(() => { vivo = false; fermaCam?.(); sessione?.chiudi(); clearTimeout(timer); bc?.close(); setTimeout(() => PassaSessione.aggiornaPill(), 50); });
  setTimeout(() => PassaSessione.aggiornaPill(), 0);
  const eur = n => n >= 1e9 ? (n / 1e9).toFixed(2).replace('.', ',') + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' kB' : n + ' byte';
  const chip = (cls, t) => h('span', { class: 'au-chip ' + cls }, t);
  const cambiaRuolo = r => { ruolo = r; try { localStorage.setItem('passa-ruolo', r); } catch { } fermaCam?.(); sessione?.chiudi(); sessione = null; disegna(); };
  const testa = (t, s) => h('div', { class: 'pa-head' }, h('span', { class: 'pa-logo' }, ic('phone', 26)), h('div', {}, h('h2', {}, t), h('p', { class: 'muted' }, s)));
  const garanzia = () => h('p', { class: 'pa-priv small muted' }, ic('shield', 14), ' Diretto da dispositivo a dispositivo sulla tua rete, cifrato. Nessun server, nessun account, nessun cloud.');

  /* --- collegato: la stessa schermata sui due lati --- */
  function vistaCollegato(can) {
    PassaSessione.imposta(can);
    const lista = h('ul', { class: 'pa-list' }), stato = h('div', { class: 'pa-stato' });
    const pick = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { if (pick.files.length) can.invia([...pick.files]); pick.value = ''; } });
    const foto = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { if (foto.files.length) can.invia([...foto.files]); foto.value = ''; } });
    const area = h('div', { class: 'pa-drop', tabindex: '0', role: 'button', 'aria-label': 'Scegli i file da mandare', onclick: () => pick.click(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } } },
      ic('upload', 30), h('b', {}, ruolo === 'computer' ? 'Trascina qui i file per il telefono' : 'Scegli i file da mandare'), h('span', { class: 'small muted' }, 'Qualsiasi file, anche molto grande: arriva identico.'));
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('over'); }); area.addEventListener('dragleave', () => area.classList.remove('over'));
    area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('over'); const f = [...(e.dataTransfer?.files || [])]; if (f.length) can.invia(f); });
    const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Un link, un indirizzo, un codice…', 'aria-label': 'Testo da mandare' });
    const testoBox = h('div', { class: 'pa-testobox', hidden: true }, ta, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary sm', onclick: () => { const v = ta.value.trim(); if (!v) return; can.testo(v); ta.value = ''; testoBox.hidden = true; } }, ic('upload', 14), 'Manda'), h('button', { type: 'button', class: 'btn sm', onclick: () => { testoBox.hidden = true; } }, 'Annulla')));
    const testoBtn = h('button', { type: 'button', class: 'btn', onclick: () => { testoBox.hidden = !testoBox.hidden; if (!testoBox.hidden) ta.focus(); } }, ic('type', 16), 'Testo');
    const azioni = ruolo === 'telefono'
      ? h('div', { class: 'pa-acts' }, h('button', { type: 'button', class: 'btn primary big', onclick: () => foto.click() }, ic('camera', 20), 'Fotografa un documento'), h('button', { type: 'button', class: 'btn big', onclick: () => pick.click() }, ic('file', 20), 'Foto e file'), testoBtn)
      : h('div', { class: 'pa-acts' }, area, testoBtn);
    const scollega = h('button', { type: 'button', class: 'btn sm', onclick: () => { can.chiudi(); } }, ic('x', 15), 'Scollega');
    const SUGG = f => { const n = (f.name || '').toLowerCase(), t = f.type || ''; if (/pdf/.test(t) || n.endsWith('.pdf')) return ['modifica', 'oscura', 'comprimi', 'firma', 'unisci']; if (/^image\//.test(t) || /\.(jpe?g|png|heic|webp)$/.test(n)) return ['immagini', 'migliora', 'ocr']; if (/\.(xml|p7m)$/.test(n)) return ['fatture']; if (/\.(docx?|xlsx?|pptx?|odt)$/.test(n)) return ['officepdf']; return []; };
    const salva = async x => { if (IS_TOUCH && navigator.canShare?.({ files: [x.file] })) { try { await navigator.share({ files: [x.file] }); return; } catch (e) { if (e.name === 'AbortError') return; } } download(x.file, x.nome, x.tipo || 'application/octet-stream'); };
    const riga = x => {
      if (x.testo != null) return h('li', { class: 'pa-it' }, h('span', { class: 'pa-ic' }, ic('type', 18)), h('div', { class: 'pa-tx' }, h('b', {}, x.dir === 'in' ? 'Testo ricevuto' : 'Testo inviato'), h('span', { class: 'pa-testo' }, x.testo)),
        x.dir === 'in' ? h('button', { type: 'button', class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(x.testo); toast('Copiato'); } catch { toast('Seleziona il testo e copialo', 'error'); } } }, ic('copy', 14), 'Copia') : null);
      const pct = x.size ? Math.min(100, Math.round(x.fatti / x.size * 100)) : 100, sec = ((x.t1 || performance.now()) - (x.t0 || performance.now())) / 1000, vel = sec > 0.2 ? x.fatti / sec : 0;
      const st = { 'in coda': ['', 'in coda'], invio: ['', `${pct}% · ${eur(vel)}/s`], arrivo: ['', `${pct}% · ${eur(vel)}/s`], attesa: ['', 'controllo…'], consegnato: ['ok', 'consegnato, identico'], arrivato: ['ok', 'arrivato, identico'], diverso: ['bad', 'arrivato diverso: rimandalo'], annullato: ['', 'annullato'], interrotto: ['bad', 'interrotto'], errore: ['bad', x.errore || 'errore'] }[x.stato] || ['', x.stato];
      const fine = x.stato === 'arrivato' && x.file;
      return h('li', { class: 'pa-it' + (x.dir === 'in' ? ' in' : '') }, h('span', { class: 'pa-ic' }, ic(x.dir === 'in' ? 'download' : 'upload', 18)),
        h('div', { class: 'pa-tx' }, h('b', { title: x.nome }, x.nome), h('span', { class: 'small muted' }, `${eur(x.size)} · `, chip(st[0], st[1])),
          ['invio', 'arrivo'].includes(x.stato) ? h('div', { class: 'pa-bar' }, h('i', { style: { width: pct + '%' } })) : null,
          fine ? h('div', { class: 'pa-open' }, h('button', { type: 'button', class: 'btn sm primary', onclick: () => salva(x) }, ic('download', 14), IS_TOUCH ? 'Salva' : 'Scarica'),
            ...SUGG(x.file).filter(k => TOOLS[k]).slice(0, 3).map(k => h('button', { type: 'button', class: 'btn sm', onclick: () => handoff(k, [x.file]) }, ic(TOOLS[k].icon, 14), TOOLS[k].short))) : null),
        ['in coda', 'invio', 'arrivo'].includes(x.stato) ? iconBtn('x', 'Annulla', () => can.annulla(x)) : null);
    };
    const ridisegnaLista = () => { lista.replaceChildren(...can.file.slice().reverse().map(riga)); };
    const ridisegnaStato = () => stato.replaceChildren(h('span', { class: 'pa-dot' }), h('div', {}, h('b', {}, `Collegato a ${can.nomeAltro || '…'}`), h('span', { class: 'small muted' }, `Controllo ${can.sas || '…'} · diretto sulla rete, cifrato`)), scollega);
    let conferma = null;
    if (ruolo === 'computer') Passa.dispositivi().then(L => { const d = L.find(x => x.fp === can.fpAltro); if (d && !d.confermato) {
      conferma = h('div', { class: 'pa-conf' }, h('b', {}, `Sul telefono compare ${can.sas}?`), h('span', { class: 'small' }, 'Se il numero è lo stesso, il collegamento è proprio con il tuo telefono.'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary sm', onclick: async () => { await Passa.aggiornaDispositivo(can.fpAltro, { confermato: true }); conferma.remove(); } }, ic('check', 14), 'Sì, coincide'),
          h('button', { type: 'button', class: 'btn sm', onclick: async () => { await Passa.togli(can.fpAltro); can.chiudi(); toast('Telefono tolto: abbinalo di nuovo con il suo link'); } }, 'No')));
      main.querySelector('.pa-stato')?.after(conferma);
    } if (d) Passa.aggiornaDispositivo(d.fp, { ultimo: Date.now(), nome: can.nomeAltro || d.nome }); });
    let raf = 0; const tick = () => { raf = 0; ridisegnaLista(); };
    can.on(tipo => { if (!vivo) return; if (tipo === 'progresso') { if (!raf) raf = requestAnimationFrame(tick); } else if (tipo === 'file') ridisegnaLista(); else if (tipo === 'ciao') { ridisegnaStato(); if (ruolo === 'computer') Passa.aggiornaDispositivo(can.fpAltro, { nome: can.nomeAltro }); } else if (tipo === 'chiuso') { toast('Collegamento chiuso'); disegna(); } });
    // il telefono con il certificato in scadenza manda il nuovo al computer; il computer lo memorizza
    can.on(async (tipo, m) => { if (tipo === 'rinnova' && ruolo === 'computer') { const L = await Passa.dispositivi(), d = L.find(x => x.fp === can.fpAltro); if (d) { await Passa.abbina({ fp: m.fp, nome: d.nome }); await Passa.aggiornaDispositivo(m.fp, { confermato: true }); await Passa.togli(d.fp); can.manda({ t: 'rinnovato' }); } } if (tipo === 'rinnovato' && ruolo === 'telefono') Passa.usaCertNuovo(); });
    if (ruolo === 'telefono') Passa.certNuovo().then(c => { if (c) can.manda({ t: 'rinnova', fp: c.getFingerprints().find(f => /sha-256/i.test(f.algorithm)).value.toUpperCase() }); });
    if (ruolo === 'telefono' && 'wakeLock' in navigator) { let wl = null; const prendi = async () => { try { wl = await navigator.wakeLock.request('screen'); } catch { } }; prendi(); can.on(t => { if (t === 'chiuso') wl?.release?.(); }); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !can.chiuso) prendi(); }); }
    main.replaceChildren(stato, azioni, testoBox, h('section', { class: 'pa-sec' }, h('h3', {}, 'File'), lista), garanzia(), pick, foto);
    ridisegnaStato(); ridisegnaLista();
    if (!can.file.length) lista.replaceChildren(h('li', { class: 'pa-vuoto muted small' }, ruolo === 'computer' ? 'I file mandati dal telefono compaiono qui, pronti da aprire in file360 o da scaricare.' : 'I file mandati dal computer compaiono qui, pronti da salvare.'));
  }

  /* --- computer: il QR --- */
  async function vistaComputer() {
    const qrBox = h('div', { class: 'pa-qr', 'aria-live': 'polite' }, h('div', { class: 'pa-qr-load' }, 'Preparo il collegamento…'));
    const listaTel = h('div', { class: 'pa-tel' });
    const campo = h('input', { class: 'input pa-in-abb', placeholder: 'Incolla il link o il codice del telefono', 'aria-label': 'Link o codice di abbinamento' });
    const pickImg = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => { if (pickImg.files[0]) daImmagine(pickImg.files[0]); pickImg.value = ''; } });
    const campoRete = h('input', { class: 'input pa-in-rete', placeholder: 'Es. K7QF-9XMB-2PQ4', 'aria-label': 'Codice di rete del telefono', autocomplete: 'off', spellcheck: 'false' });
    const reteBox = h('div', { class: 'pa-abb' }, h('b', {}, 'Il telefono non si collega?'), h('p', { class: 'small muted' }, 'Il telefono mostra un codice di rete di 12 caratteri: scrivilo qui e sarà il computer a chiamarlo.'),
      h('div', { class: 'row pa-abb-in' }, campoRete, h('button', { type: 'button', class: 'btn', onclick: () => daRete(campoRete.value) }, 'Collega')));
    campoRete.addEventListener('keydown', e => { if (e.key === 'Enter') daRete(campoRete.value); });
    async function daRete(v) {
      const c = Passa.leggiCodiceRete(v); if (!c) return toast('Codice di rete non valido: controlla i 12 caratteri', 'error');
      if (!sessione || !(await sessione.bussa(c).catch(() => false))) return toast('Il codice non corrisponde a questo QR: sul telefono premi «Inquadra di nuovo»', 'error');
      toast('Chiamo il telefono…');
      // dopo un collegamento con il codice: si propone di scrivere l'indirizzo del computer, così la prossima volta basta il QR
      try { if (!(await Passa.ipComputer())) setTimeout(() => toast('Per non usare più il codice: in «Il telefono chiede sempre il codice?» scrivi una volta l’indirizzo IP di questo computer', 'info'), 1500); } catch { }
    }
    const abbinaBox = h('div', { class: 'pa-abb' }, h('b', {}, 'Prima volta con un telefono?'),
      h('ol', { class: 'small' }, h('li', {}, 'Inquadra il QR con il telefono: ti proporrà di mandarti un link.'), h('li', {}, 'Apri qui quel link (o trascina l’immagine, o incolla il codice): il telefono resta abbinato e il collegamento parte.')),
      h('div', { class: 'row pa-abb-in' }, campo, h('button', { type: 'button', class: 'btn', onclick: () => daTesto(campo.value) }, 'Abbina'), h('button', { type: 'button', class: 'btn', onclick: () => pickImg.click() }, ic('photo', 15), 'Immagine')), pickImg);
    main.replaceChildren(
      h('div', { class: 'pa-grid' }, qrBox, h('div', { class: 'pa-side' }, listaTel, reteBox, abbinaBox)), garanzia(),
      h('p', { class: 'small muted pa-switch' }, 'Questo dispositivo è un telefono? ', h('button', { type: 'button', class: 'btn sm ghost', onclick: () => cambiaRuolo('telefono') }, 'Usalo come telefono')));
    main.addEventListener('dragover', e => e.preventDefault());
    main.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f && /^image\//.test(f.type)) { e.preventDefault(); daImmagine(f); } });
    campo.addEventListener('paste', () => setTimeout(() => daTesto(campo.value), 0));
    document.addEventListener('paste', incolla);
    onLeave(() => document.removeEventListener('paste', incolla));
    function incolla(e) { if (!main.isConnected || e.target === campo) return; const it = [...(e.clipboardData?.items || [])].find(i => /^image\//.test(i.type)); if (it) { const f = it.getAsFile(); if (f) daImmagine(f); } else { const t = e.clipboardData?.getData('text'); if (t && Passa.leggiAbbinamento(t)) daTesto(t); } }
    async function disegnaTel() {
      const L = await Passa.dispositivi();
      const nomePc = h('input', { class: 'input', value: io.nome, 'aria-label': 'Nome di questo computer', onchange: async () => { nomePc.value = await Passa.rinomina(nomePc.value); io.nome = nomePc.value; nuovaSessione(); } });
      const ipNow = await Passa.ipComputer();
      const ipPc = h('input', { class: 'input pa-in-ip', value: ipNow, placeholder: 'es. 192.168.1.117', inputmode: 'decimal', 'aria-label': 'Indirizzo IP di questo computer', onchange: async () => { if (!(await Passa.salvaIpComputer(ipPc.value))) { toast('Indirizzo non valido: quattro numeri separati da punti, es. 192.168.1.117', 'error'); return; } toast(ipPc.value.trim() ? 'Indirizzo salvato: il QR lo contiene' : 'Indirizzo tolto'); nuovaSessione(); } });
      const ipBox = h('details', { class: 'pa-ip small', open: !!ipNow || null }, h('summary', {}, ipNow ? `Indirizzo di questo computer: ${ipNow}` : 'Il telefono chiede sempre il codice?'),
        h('p', { class: 'muted' }, 'Scrivi una volta l’indirizzo IP di questo computer: il QR lo conterrà e al telefono basterà inquadrare. Su Windows lo trovi in Impostazioni › Rete e Internet › Proprietà › «Indirizzo IPv4» (va bene se è fisso o se il router lo assegna sempre uguale).'), ipPc);
      listaTel.replaceChildren(h('label', { class: 'pa-nome small' }, h('span', {}, 'Nome di questo computer (lo vede il telefono)'), nomePc), ipBox, h('b', {}, L.length ? 'Telefoni abbinati' : 'Nessun telefono abbinato'),
        L.length ? h('ul', { class: 'pa-tl' }, L.map(d => h('li', {}, ic('phone', 15), h('span', {}, d.nome), h('span', { class: 'small muted' }, d.ultimo ? 'ultimo uso ' + new Date(d.ultimo).toLocaleDateString('it-IT') : 'mai collegato'), iconBtn('x', 'Togli ' + d.nome, async () => { await Passa.togli(d.fp); nuovaSessione(); })))) : h('p', { class: 'small muted' }, 'Dopo il primo abbinamento basta inquadrare il QR, senza scrivere niente.'));
    }
    async function nuovoTelefono(t, { fonte = '' } = {}) {
      if (!t) return toast('Non trovo un link o un codice di abbinamento valido', 'error');
      if (t.fp === io.fp) return toast('Questo è il codice di questo stesso dispositivo', 'error');
      await Passa.abbina(t); disegnaTel(); toast(`${t.nome} abbinato${fonte}`);
      if (!(sessione && await sessione.attivaNuovo(t))) await nuovaSessione();
    }
    const daTesto = v => nuovoTelefono(Passa.leggiAbbinamento(v));
    async function daImmagine(f) { const t = await Passa.qrDaImmagine(f).catch(() => null); nuovoTelefono(t ? Passa.leggiAbbinamento(t) : null, { fonte: ' dall’immagine' }); }
    // il link di abbinamento aperto in un'altra scheda del browser: questa scheda, che mostra il QR, lo riceve
    if (bc) bc.onmessage = e => { const m = e.data || {}; if (m.t === 'abbinato' && vivo && ruolo === 'computer') { bc.postMessage({ t: 'preso' }); Passa.dispositivi().then(() => { disegnaTel(); toast(`${m.nome} abbinato`); sessione?.attivaNuovo({ fp: m.fp, nome: m.nome }).then(ok => { if (!ok) nuovaSessione(); }); }); } };
    async function nuovaSessione() {
      sessione?.chiudi(); sessione = null; clearTimeout(timer);
      try {
        const s = await Passa.ospita({ onCanale: can => { if (!vivo || s !== sessione) return; sessione = null; s.chiudi(); vistaCollegato(can); } });
        if (!vivo) { s.chiudi(); return; }
        sessione = s;
        const q = QR.encode(s.url, { ecl: 'L' });
        qrBox.replaceChildren(h('div', { class: 'pa-qr-img', role: 'img', 'aria-label': 'Codice QR per collegare il telefono', dataset: { url: s.url }, html: QR.svg(q, { border: 3 }) }), h('p', { class: 'pa-qr-cap' }, h('b', {}, 'Inquadra con il telefono'), h('span', { class: 'small muted' }, 'Con la fotocamera del sistema o da file360 › Passa file')));
        // il QR si rinnova ogni 10 minuti (le connessioni in attesa non restano aperte per sempre)
        timer = setTimeout(() => { if (vivo && sessione === s) nuovaSessione(); }, 10 * 60e3);
      } catch (e) { qrBox.replaceChildren(h('div', { class: 'pa-err' }, ic('alert', 22), h('p', {}, e.message || 'Non riesco a preparare il collegamento.'), h('button', { type: 'button', class: 'btn sm', onclick: nuovaSessione }, 'Riprova'))); }
    }
    disegnaTel(); await nuovaSessione();
  }

  /* --- telefono: inquadra --- */
  async function vistaTelefono(qrTesto = '') {
    const nome = h('input', { class: 'input', value: io.nome, 'aria-label': 'Nome di questo telefono', onchange: async () => { nome.value = await Passa.rinomina(nome.value); io.nome = nome.value; } });
    const msg = h('div', { class: 'pa-msg', 'aria-live': 'polite' });
    const cell = navigator.connection?.type === 'cellular';
    const avvisoRete = cell ? h('div', { class: 'pa-warn' }, ic('wifi0', 18), h('span', {}, 'Il telefono è sulla rete mobile: collegalo alla Wi-Fi dello stesso router del computer (il computer può essere col cavo).')) : null;
    const inquadra = h('button', { type: 'button', class: 'btn primary big pa-big', onclick: () => apriCamera() }, ic('camera', 22), 'Inquadra il QR del computer');
    const condividi = h('button', { type: 'button', class: 'btn big', onclick: () => mandaAbbinamento() }, ic('share', 20), 'Abbina a un computer');
    main.replaceChildren(...[h('p', { class: 'pa-intro' }, 'Sul computer apri file360 › Passa file e inquadra il QR. Puoi anche usare la fotocamera del telefono: si apre file360 e si collega da solo.'), avvisoRete, h('div', { class: 'pa-acts' }, inquadra, condividi), msg,
      h('label', { class: 'pa-nome small' }, h('span', {}, 'Nome di questo telefono'), nome),
      io.temporanea ? h('p', { class: 'pa-warn small' }, 'Questo browser non conserva l’abbinamento: su iPhone aggiungi file360 alla schermata Home (Condividi › Aggiungi alla schermata Home) e usalo da lì.') : null,
      garanzia(), h('p', { class: 'small muted pa-switch' }, 'È un computer? ', h('button', { type: 'button', class: 'btn sm ghost', onclick: () => cambiaRuolo('computer') }, 'Mostra il QR qui'))].filter(Boolean));
    async function mandaAbbinamento() {
      const link = await Passa.linkAbbinamento(), img = await Passa.immagineAbbinamento(), cod = Passa.codice((await Passa.identita()).fpb);
      const testo = `Abbina «${io.nome}» a file360 su questo computer: apri questo link qui sul computer (oppure trascina l'immagine in Passa file).\n\nCodice: ${cod}`;
      if (navigator.share) { try { const d = { title: 'Abbina il telefono a file360', text: testo, url: link }; if (navigator.canShare?.({ files: [img] })) { try { await navigator.share({ ...d, files: [img] }); return; } catch (e) { if (e.name === 'AbortError') return; } } await navigator.share(d); return; } catch (e) { if (e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(testo + '\n' + link); toast('Link copiato: incollalo in una mail a te stesso'); } catch { }
      msg.replaceChildren(h('div', { class: 'pa-abb' }, h('b', {}, 'Manda al computer questo link'), h('a', { href: link, class: 'small pa-link' }, link), h('p', { class: 'small muted' }, 'Oppure scrivi il codice nel computer:'), h('code', { class: 'pa-code' }, cod),
        h('button', { type: 'button', class: 'btn sm', onclick: () => download(img, img.name, 'image/png') }, ic('download', 14), 'Scarica l’immagine')));
    }
    async function apriCamera() {
      const video = h('video', { class: 'pa-video', playsinline: '', muted: '' }), box = h('div', { class: 'pa-cam' }, video, h('div', { class: 'pa-mirino' }), h('p', { class: 'pa-cam-t' }, 'Inquadra il QR sullo schermo del computer'),
        h('button', { type: 'button', class: 'btn', onclick: () => { fermaCam?.(); box.remove(); } }, ic('x', 16), 'Chiudi'));
      document.body.append(box);
      try { fermaCam = await Passa.scansiona(video, { filtro: t => !!Passa.leggiQR(t) || !!Passa.leggiAbbinamento(t), onTrovato: t => { box.remove(); fermaCam = null; if (Passa.leggiQR(t)) collega(t); else toast('Questo è il QR di abbinamento di un telefono: va aperto sul computer', 'error'); } }); }
      catch (e) { box.remove(); toast(e.name === 'NotAllowedError' ? 'Permesso fotocamera negato: concedilo nelle impostazioni del browser, oppure inquadra il QR con la fotocamera del telefono' : 'Fotocamera non disponibile: inquadra il QR con la fotocamera del telefono', 'error'); }
    }
    let tentativi = 0;
    async function collega(t) {
      const q = Passa.leggiQR(t); if (!q) return toast('QR non valido', 'error');
      msg.replaceChildren(h('div', { class: 'pa-wait' }, h('span', { class: 'pa-spin' }), h('span', {}, 'Mi collego al computer…')));
      let fatto = false;
      try {
        const r = await Passa.collegati(q, { onCanale: can => { fatto = true; if (vivo) vistaCollegato(can); } });
        if (r.nuovo) {
          // primo collegamento con questo computer: serve l'abbinamento; intanto il telefono resta in attesa
          msg.replaceChildren(h('div', { class: 'pa-abb' }, h('b', {}, 'Primo collegamento con questo computer'), h('p', { class: 'small' }, 'Manda al computer il link di abbinamento (per mail, WhatsApp…) e aprilo lì: il collegamento parte da solo, senza inquadrare di nuovo.'),
            h('button', { type: 'button', class: 'btn primary', onclick: () => mandaAbbinamento() }, ic('share', 16), 'Manda il link al computer'), h('div', { class: 'pa-wait small' }, h('span', { class: 'pa-spin' }), 'In attesa del computer…')));
          const fino = Date.now() + 5 * 60e3;
          // se dopo 25 secondi non si è ancora collegato (computer già abbinato ma irraggiungibile), si offre il codice di rete
          setTimeout(async () => { if (fatto || !vivo) return; const d = msg.querySelector('.pa-abb'); if (!d) return;
            const vai = h('button', { type: 'button', class: 'btn sm', onclick: () => { fatto = true; nonArriva(q, r); } }, 'Il computer ha il link ma non si collega');
            d.append(vai); }, 25000);
          const prova = () => setTimeout(async () => { if (fatto || !vivo) return; if (r.pc.connectionState === 'failed' && Date.now() < fino) { try { r.pc.close(); } catch { } const r2 = await Passa.collegati(q, { onCanale: can => { fatto = true; if (vivo) vistaCollegato(can); } }); r.pc = r2.pc; } if (Date.now() < fino) prova(); }, 4000);
          prova(); return;
        }
        setTimeout(() => { if (!fatto && vivo) nonArriva(q, r); }, 12000);
      } catch (e) { msg.replaceChildren(h('div', { class: 'pa-err' }, ic('alert', 22), h('p', {}, e.message || 'Collegamento non riuscito'))); }
    }
    // il telefono non raggiunge il computer: la causa precisa e il codice di rete (con cui è il computer a bussare)
    async function nonArriva(q, r) {
      tentativi++;
      const d = await Passa.diagnosi(r.pc).catch(() => ({ causa: 'indirizzo' }));
      const CAUSA = {
        indirizzo: ['Il telefono non trova il computer sulla rete', 'Il computer si presenta con un nome «.local» che questo telefono non riesce a risolvere, oppure i due dispositivi non sono sulla stessa rete.'],
        risposta: ['Il computer non risponde', 'Il telefono ha bussato ma il computer non ha risposto: di solito è il firewall del computer (su Windows con la rete impostata come «pubblica») o una Wi-Fi che isola i dispositivi.'],
        cifratura: ['Il computer non riconosce questo telefono', 'La rete funziona ma l’abbinamento non coincide: sul computer togli questo telefono e abbinalo di nuovo.'],
      }[d.causa];
      const box = h('div', { class: 'pa-err pa-diag' }, ic('alert', 22), h('div', {}, h('b', {}, CAUSA[0]), h('p', { class: 'small' }, CAUSA[1]), h('div', { class: 'pa-codebox' }, h('span', { class: 'pa-wait small' }, h('span', { class: 'pa-spin' }), 'Preparo il codice di rete…'))));
      msg.replaceChildren(box);
      if (d.causa === 'cifratura') { box.querySelector('.pa-codebox').replaceChildren(h('button', { type: 'button', class: 'btn sm', onclick: () => mandaAbbinamento() }, ic('share', 14), 'Manda di nuovo il link al computer')); return; }
      // un nuovo collegamento del telefono, con l'indirizzo vero (il permesso della fotocamera lo rende visibile)
      let cam = null; try { cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch { }
      let r2 = null, ind = null;
      try { r2 = await Passa.collegati(q, { onCanale: can => { if (vivo) vistaCollegato(can); } }); ind = await Passa.indirizzoTelefono(r2.pc); } catch (e) { console.warn(e); }
      cam?.getTracks().forEach(t => t.stop()); try { r.pc.close(); } catch { }
      const cb = box.querySelector('.pa-codebox');
      if (!ind) { cb.replaceChildren(h('p', { class: 'small' }, 'Non riesco a leggere l’indirizzo di questo telefono: concedi la fotocamera a file360 e premi «Inquadra di nuovo».'), h('button', { type: 'button', class: 'btn sm', onclick: () => apriCamera() }, 'Inquadra di nuovo')); return; }
      cb.replaceChildren(h('b', {}, 'Scrivi questo codice sul computer'), h('code', { class: 'pa-netcode' }, Passa.codiceRete(ind, r2.k)), h('span', { class: 'small muted' }, 'Sotto il QR: «Il telefono non si collega?». Con il codice è il computer a chiamare il telefono.'),
        h('details', { class: 'small' }, h('summary', {}, 'Altre cose da controllare'), h('ul', {}, h('li', {}, 'Telefono e computer sulla stessa Wi-Fi (il computer può essere col cavo allo stesso router). Le reti «ospiti» isolano i dispositivi.'), h('li', {}, 'Se usi Chrome su iPhone: Impostazioni › Chrome › Rete locale attiva.'), h('li', {}, 'Per non usare più il codice: sul computer, in «Il telefono chiede sempre il codice?», scrivi una volta il suo indirizzo IP.'), h('li', {}, 'Computer Windows: imposta la rete come «privata» (Impostazioni › Rete › Proprietà).'), h('li', {}, 'In 4G/5G il collegamento diretto non è possibile; senza Wi-Fi usa l’hotspot del telefono.'))),
        h('button', { type: 'button', class: 'btn sm', onclick: () => apriCamera() }, 'Inquadra di nuovo'));
    }
    if (qrTesto) collega(qrTesto);
    // permesso della fotocamera già dato: la fotocamera parte da sola (resta solo da inquadrare)
    else { try { navigator.permissions?.query({ name: 'camera' }).then(p => { if (p.state === 'granted' && vivo && !PassaSessione.canale && main.isConnected && !document.querySelector('.pa-cam')) apriCamera(); }).catch(() => { }); } catch { } }
  }

  /* --- link di abbinamento aperto sul computer --- */
  async function daLinkAbbinamento(t) {
    const d = Passa.leggiAbbinamento(t); if (!d) { toast('Link di abbinamento non valido', 'error'); return vistaComputer(); }
    if (d.fp === io.fp) { toast('Questo link va aperto sul computer, non sul telefono stesso', 'error'); return vistaTelefono(); }
    await Passa.abbina(d);
    // se un'altra scheda mostra già il QR, è lei a collegarsi
    let preso = false; if (bc) { const f = e => { if (e.data?.t === 'preso') preso = true; }; bc.addEventListener('message', f); bc.postMessage({ t: 'abbinato', fp: d.fp, nome: d.nome }); await new Promise(r => setTimeout(r, 500)); bc.removeEventListener('message', f); }
    if (preso) { main.replaceChildren(testa(`${d.nome} abbinato`, 'Torna alla scheda di file360 con il QR: il collegamento parte da solo.'), garanzia()); return; }
    toast(`${d.nome} abbinato: ora inquadra il QR con il telefono`); vistaComputer();
  }

  function disegna() {
    fermaCam?.(); fermaCam = null;
    const c = PassaSessione.canale; if (c) return vistaCollegato(c);
    if (ruolo === 'computer') return vistaComputer();
    return vistaTelefono();
  }
  if (/abbina=/.test(ingresso)) return daLinkAbbinamento(ingresso);
  if (/[#&]c=/.test(ingresso) && !PassaSessione.canale) { ruolo = 'telefono'; return vistaTelefono(ingresso); }
  disegna();
}
