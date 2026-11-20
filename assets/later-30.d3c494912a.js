async function startVendite(stage, files = []) {
  const V = Vendite, eur = V.eur, pct = V.pct, DAY = 864e5;
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v); for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  const corto = v => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mln` : a >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('it-IT')} k` : Math.round(v).toLocaleString('it-IT'); };
  const data = t => t ? new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  /* lettura dei file: XML, P7M, ZIP (anche annidati) e PDF con l'XML incorporato o nel formato del foglio di stile */
  const invs = [], errori = [];
  async function leggi(name, bytes) {
    if (/\.zip$/i.test(name)) { for (const f of await FattureKit.zipRead(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))) await leggi(f.name, f.data); return; }
    if (/\.pdf$/i.test(name)) { try { invs.push(...await FattureKit.leggiPdf(bytes, name)); } catch (e) { errori.push([name, e.message]); } return; }
    if (/\.(xml|p7m)$/i.test(name)) { try { invs.push(...FattureKit.leggiBytes(bytes, name)); } catch (e) { errori.push([name, e.message]); } }
  }
  if (files.length) await withBusy('Lettura delle fatture…', async () => { for (const [i, f] of files.entries()) { Busy.set?.(i / files.length, `File ${i + 1} di ${files.length}`); await leggi(f.name, new Uint8Array(await f.arrayBuffer())); } });
  let D = V.prepara(invs);
  const st = { tab: 'panoramica', periodo: 'tutto', tipoCli: '', regione: '', prov: '', comune: '', estero: false, cliente: '', prodotto: '', segmento: '', sel: null, modo: typeof Mappa !== 'undefined' && Mappa.webgl() ? 'strade' : 'bolle', cerca: '', ord: { clienti: ['fatt', -1], prodotti: ['fatt', -1] } };
  let A = null;
  const periodi = () => { const anni = [...new Set(D.fatture.map(f => new Date(f.t).getFullYear()))].sort(); return [['tutto', 'Tutto il periodo'], ['12', 'Ultimi 12 mesi'], ...anni.reverse().map(y => [String(y), `Anno ${y}`])]; };
  const filtro = () => { const fine = D.fatture[D.fatture.length - 1]?.t || Date.now(); let da = null, a = null; if (st.periodo === '12') { da = fine - 365 * DAY; } else if (/^\d{4}$/.test(st.periodo)) { da = Date.parse(`${st.periodo}-01-01`); a = Date.parse(`${st.periodo}-12-31T23:59:59`); } return { da, a, tipoCli: st.tipoCli, regione: st.regione, prov: st.prov, comune: st.comune, estero: st.estero, cliente: st.cliente, prodotto: st.prodotto }; };
  // «oggi» per l'analisi è il giorno dell'ultima fattura caricata: un archivio dell'anno scorso non fa sembrare fermi tutti i clienti
  const oggi = () => D.fatture[D.fatture.length - 1]?.t || Date.now();
  const calcola = () => { A = V.analizza(D, filtro(), oggi()); };

  /* grafici (SVG): barre verticali con previsione, barre orizzontali, linea dei prezzi */
  const tip = h('div', { class: 'vd-tip', role: 'tooltip', hidden: true });
  const mostraTip = (e, html) => { tip.replaceChildren(...html); tip.hidden = false; const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect?.() || e.currentTarget.getBoundingClientRect(); const x = (e.clientX || r.left + r.width / 2), y = (e.clientY || r.top); tip.style.left = `${Math.min(innerWidth - 240, Math.max(8, x + 14))}px`; tip.style.top = `${Math.max(8, y - 10)}px`; };
  const nascondiTip = () => { tip.hidden = true; };
  // larghezza vera del grafico: il testo resta di 11 px su telefono e su computer
  const larg = (meta = false) => { const cw = Math.max(300, (main.clientWidth || 760) - 48); return Math.round(meta && innerWidth > 1200 ? (cw - 24) / 2 : cw); };
  function barre(dati, { h: H = 220, prev = [], fmt = eur, desc = '', meta = false } = {}) {
    const W = larg(meta), padL = 46, padB = 26, padT = 10, all = [...dati, ...prev], n = all.length || 1, max = Math.max(1, ...all.map(d => Math.max(d.v, d.hi || 0))), bw = (W - padL) / n, ih = H - padB - padT;
    const yv = v => padT + ih - (Math.max(0, v) / max) * ih, ticks = [0, max / 2, max];
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vd-chart', role: 'img', 'aria-label': desc });
    for (const t of ticks) svg.append(S('line', { x1: padL, x2: W, y1: yv(t), y2: yv(t), class: 'vd-grid' }), S('text', { x: padL - 6, y: yv(t) + 4, class: 'vd-ax', 'text-anchor': 'end' }, corto(t)));
    all.forEach((d, i) => {
      const x = padL + i * bw + 1, w = Math.max(1, bw - 2), y = yv(d.v), hh = padT + ih - y, r = Math.min(4, w / 2, hh);
      const path = hh > 0 ? `M${x} ${padT + ih}V${y + r}q0 -${r} ${r} -${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${padT + ih}z` : '';
      if (d.hi != null) svg.append(S('rect', { x, y: yv(d.hi), width: w, height: Math.max(0, yv(d.lo) - yv(d.hi)), class: 'vd-band', rx: 2 }));
      if (path) svg.append(S('path', { d: path, class: d.prev ? 'vd-bar vd-bar-prev' : d.on ? 'vd-bar on' : 'vd-bar' }));
      if (d.lbl && (n * 34 <= W || d.mostra)) svg.append(S('text', { x: x + w / 2, y: H - 8, class: 'vd-ax', 'text-anchor': 'middle' }, d.lbl));
      const hit = S('rect', { x: x - 1, y: padT, width: bw, height: ih + 4, class: 'vd-hit', tabindex: '0', role: 'img', 'aria-label': `${d.tit}: ${fmt(d.v)}` });
      hit.addEventListener('pointerenter', e => mostraTip(e, [h('b', {}, d.tit), h('div', {}, d.prev ? `stima ${fmt(d.v)} (tra ${fmt(d.lo)} e ${fmt(d.hi)})` : fmt(d.v)), d.extra ? h('div', { class: 'muted' }, d.extra) : null]));
      hit.addEventListener('pointermove', e => mostraTip(e, [...tip.childNodes])); hit.addEventListener('pointerleave', nascondiTip);
      hit.addEventListener('focus', e => mostraTip(e, [h('b', {}, d.tit), h('div', {}, fmt(d.v))])); hit.addEventListener('blur', nascondiTip);
      svg.append(hit);
    });
    svg.append(S('line', { x1: padL, x2: W, y1: padT + ih, y2: padT + ih, class: 'vd-base' }));
    return h('div', { class: 'vd-chartw' }, svg);
  }
  const hbar = (righe, { fmt = eur, onClick = null } = {}) => { const max = Math.max(1, ...righe.map(r => Math.abs(r.v))); return h('ol', { class: 'vd-hb' }, righe.map(r => h('li', { class: onClick ? 'cl' : '', tabindex: onClick ? '0' : null, onclick: onClick ? () => onClick(r) : null, onkeydown: onClick ? e => { if (e.key === 'Enter') onClick(r); } : null },
    h('span', { class: 'vd-hbl', title: r.l }, r.l), h('span', { class: 'vd-hbt' }, h('i', { style: `width:${Math.max(1, Math.abs(r.v) / max * 100)}%` })), h('span', { class: 'vd-hbv' }, fmt(r.v), r.sub ? h('small', {}, ' ' + r.sub) : null)))); };
  function linea(pts, { w = 120, h: H = 28 } = {}) {
    if (pts.length < 2) return null; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = x => 2 + (x - x0) / Math.max(1, x1 - x0) * (w - 4), Y = y => H - 3 - (y - y0) / Math.max(1e-9, y1 - y0) * (H - 6);
    return S('svg', { viewBox: `0 0 ${w} ${H}`, class: 'vd-spark', 'aria-hidden': 'true' }, S('polyline', { points: pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' '), class: 'vd-line' }));
  }

  /* mappa: province e regioni dai confini ISTAT, un punto per Comune grande come il fatturato, la sede con i cerchi di 50 e 100 km */
  const GEO = typeof GEO_IT !== 'undefined' ? GEO_IT : null;
  let vb = GEO ? [0, 0, GEO.proj.w, GEO.proj.h] : [0, 0, 1000, 1300];
  function mappa({ grande = false } = {}) {
    if (!GEO) return h('div', { class: 'hint' }, 'Mappa non disponibile.');
    const svg = S('svg', { viewBox: vb.join(' '), class: 'vd-map' + (grande ? ' big' : ''), role: 'group', 'aria-label': 'Mappa dei clienti in Italia' });
    const g = S('g'); svg.append(g);
    const provV = new Map(A.province.map(p => [p.s, p.fatt])), vals = A.province.map(p => p.fatt).filter(v => v > 0).sort((a, b) => a - b);
    const classe = v => { if (!(v > 0) || !vals.length) return 0; const q = vals.findIndex(x => x >= v) / vals.length; return 1 + Math.min(4, Math.floor(q * 5)); };
    for (const [sig, p] of Object.entries(GEO.province)) {
      const c = st.modo === 'province' ? classe(provV.get(sig)) : 0, el = S('path', { d: p.d, class: `vd-prov c${c}` + (st.prov === sig ? ' sel' : ''), 'data-s': sig });
      el.addEventListener('pointerenter', e => mostraTip(e, [h('b', {}, `${p.n} (${sig})`), h('div', {}, provV.get(sig) ? eur(provV.get(sig)) : 'Nessun cliente'), h('div', { class: 'muted' }, p.r)]));
      el.addEventListener('pointermove', e => { tip.style.left = `${Math.min(innerWidth - 240, e.clientX + 14)}px`; tip.style.top = `${e.clientY - 10}px`; }); el.addEventListener('pointerleave', nascondiTip);
      el.addEventListener('click', () => { if (moved) return; seleziona({ tipo: 'prov', k: sig }); });
      g.append(el);
    }
    for (const d of Object.values(GEO.reg)) g.append(S('path', { d, class: 'vd-reg' }));
    const sc = vb[2] / GEO.proj.w;   // a ingrandimento maggiore, segni più sottili
    if (A.distanze?.sede) {
      const s = A.distanze.sede, perKm = GEO.proj.k / 6371 / Math.cos(V.km ? (s.y && (() => { const P = GEO.proj, Y0 = Math.log(Math.tan(Math.PI / 4 + P.lat1 * Math.PI / 360)); return 2 * Math.atan(Math.exp(Y0 - s.y / P.k)) - Math.PI / 2; })()) : 0);
      for (const r of [50, 100]) g.append(S('circle', { cx: s.x, cy: s.y, r: r * perKm, class: 'vd-ring', 'stroke-width': 1.2 * sc }), S('text', { x: s.x + r * perKm * 0.72, y: s.y - r * perKm * 0.72, class: 'vd-ringl', 'font-size': 11 * sc }, `${r} km`));
    }
    if (st.modo !== 'province') {
      const max = Math.max(1, ...A.luoghi.map(l => l.fatt));
      for (const l of [...A.luoghi].sort((a, b) => b.fatt - a.fatt)) {
        if (!(l.fatt > 0)) continue;
        const r = (3 + 24 * Math.sqrt(l.fatt / max)) * Math.sqrt(sc), c = S('circle', { cx: l.x, cy: l.y, r, class: 'vd-dot' + (st.sel?.tipo === 'luogo' && st.sel.k === l.k ? ' sel' : ''), 'stroke-width': 1.5 * sc, tabindex: '0', role: 'button', 'aria-label': `${l.comune}: ${l.clienti.length} ${l.clienti.length === 1 ? 'cliente' : 'clienti'}, ${eur(l.fatt)}` });
        const info = () => [h('b', {}, `${l.comune} (${l.prov})`), h('div', {}, `${eur(l.fatt)} · ${l.clienti.length} ${l.clienti.length === 1 ? 'cliente' : 'clienti'}`), h('div', { class: 'muted' }, l.clienti.slice(0, 3).map(c => c.nome).join(', ') + (l.clienti.length > 3 ? '…' : ''))];
        c.addEventListener('pointerenter', e => mostraTip(e, info())); c.addEventListener('pointermove', e => { tip.style.left = `${Math.min(innerWidth - 240, e.clientX + 14)}px`; tip.style.top = `${e.clientY - 10}px`; }); c.addEventListener('pointerleave', nascondiTip);
        c.addEventListener('focus', e => mostraTip(e, info())); c.addEventListener('blur', nascondiTip);
        const sel = () => { if (!moved) seleziona({ tipo: 'luogo', k: l.k }); };
        c.addEventListener('click', e => { e.stopPropagation(); sel(); }); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleziona({ tipo: 'luogo', k: l.k }); } });
        g.append(c);
      }
    }
    if (A.distanze?.sede) { const s = A.distanze.sede, k = 7 * Math.sqrt(sc); g.append(S('path', { d: `M${s.x} ${s.y - k}l${k} ${k}l${-k} ${k}l${-k} ${-k}z`, class: 'vd-sede', 'stroke-width': 1.5 * sc }, S('title', {}, `Sede: ${s.comune}`))); }
    // zoom con la rotella e con i pulsanti, spostamento trascinando
    let moved = false, drag = null;
    const set = nv => { const W = GEO.proj.w, H = GEO.proj.h; nv[2] = Math.max(W / 12, Math.min(W, nv[2])); nv[3] = nv[2] * H / W; nv[0] = Math.max(-W * 0.1, Math.min(W * 1.1 - nv[2], nv[0])); nv[1] = Math.max(-H * 0.1, Math.min(H * 1.1 - nv[3], nv[1])); vb = nv; svg.setAttribute('viewBox', vb.join(' ')); };
    const zoom = (f, cx, cy) => { const nw = vb[2] / f; set([cx - (cx - vb[0]) / f, cy - (cy - vb[1]) / f, nw, 0]); redrawSoon(); };
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(), cx = vb[0] + (e.clientX - r.left) / r.width * vb[2], cy = vb[1] + (e.clientY - r.top) / r.height * vb[3]; zoom(e.deltaY < 0 ? 1.25 : 0.8, cx, cy); }, { passive: false });
    svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = (e.clientX - drag.x) / r.width * drag.vb[2], dy = (e.clientY - drag.y) / r.height * drag.vb[3]; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { moved = true; svg.setPointerCapture?.(e.pointerId); } if (moved) set([drag.vb[0] - dx, drag.vb[1] - dy, drag.vb[2], 0]); });
    svg.addEventListener('pointerup', () => { drag = null; setTimeout(() => { moved = false; }, 0); });
    const ctr = h('div', { class: 'vd-mapctl' },
      h('button', { type: 'button', class: 'icon-btn', title: 'Ingrandisci', 'aria-label': 'Ingrandisci la mappa', onclick: () => zoom(1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2) }, ic('zoomin', 18)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Rimpicciolisci', 'aria-label': 'Rimpicciolisci la mappa', onclick: () => zoom(1 / 1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2) }, ic('zoomout', 18)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Tutta Italia', 'aria-label': 'Mostra tutta Italia', onclick: () => { set([0, 0, GEO.proj.w, 0]); redrawSoon(); } }, ic('fit', 18)));
    const legenda = st.modo === 'province' ? h('div', { class: 'vd-leg' }, h('span', {}, 'Fatturato per provincia'), h('span', { class: 'vd-ramp' }, [1, 2, 3, 4, 5].map(i => h('i', { class: 'c' + i }))), h('span', { class: 'muted' }, 'meno → più'))
      : h('div', { class: 'vd-leg' }, h('i', { class: 'vd-legdot' }), h('span', {}, 'Un cerchio per Comune, grande come il fatturato'), A.distanze?.sede ? [h('i', { class: 'vd-legsede' }), h('span', {}, `Sede (${A.distanze.sede.comune})`)] : null);
    return h('div', { class: 'vd-mapw' }, svg, ctr, legenda, h('div', { class: 'vd-fonte muted' }, GEO.fonte));
  }
  let rdT = 0; const redrawSoon = () => { clearTimeout(rdT); rdT = setTimeout(() => { const old = main.querySelector('.vd-mapw'); if (old) old.replaceWith(mappa({ grande: old.querySelector('svg')?.classList.contains('big') })); }, 160); };

  /* mappa stradale (MapLibre, src/mappa.js): l'Italia nello stile del prodotto; ingrandendo, strade, edifici e il cliente
     sul civico scritto in fattura. Gli indirizzi si cercano sul dispositivo nell'indice dei civici di OpenStreetMap. */
  const GL = { wrap: null, box: null, stato: null, avviso: null, zona: null, prec: null, modi: null, inst: null, tema: '', pronto: null, coda: Promise.resolve(), rifai: false, rilievo: false, prov: [] };
  const geoC = new Map(); let sedeGL = null;
  const PREC = { civico: 'al civico', stimato: 'civico stimato tra i vicini', via: 'sulla via (civico non trovato)', comune: 'al centro del Comune', cap: 'dal CAP', provincia: 'al centro della provincia' };
  const statoGL = t => { if (GL.stato) { GL.stato.textContent = t; GL.stato.hidden = !t; } };
  async function geocodifica() {
    if (typeof Mappa === 'undefined') return;
    await Mappa.riprendi(false);
    const tutti = [...D.clienti.values()].filter(c => c.luogo && !c.luogo.estero && c.luogo.x != null);
    const provs = [...new Set([...tutti.map(c => c.luogo.prov), D.me?.luogo?.prov].filter(Boolean))];
    if (Mappa.haCivici()) statoGL('Cerco gli indirizzi dei clienti…');
    const I = new Map(await Promise.all(provs.map(async p => [p, Mappa.haCivici() ? await Mappa.indice(p) : null])));
    const pos = (L, via) => { const r = (L.prec === 'comune' || L.prec === 'cap') && via ? Mappa.cerca(I.get(L.prov), L.comune, L.prov, via) : null; if (r) return r; const [lon, lat] = V.lonLat(L.x, L.y); return { lon, lat, prec: L.prec }; };
    geoC.clear(); const visti = new Map();
    for (const c of tutti) {
      const g = pos(c.luogo, c.via), k = `${g.lon.toFixed(5)},${g.lat.toFixed(5)}`, n = visti.get(k) || 0; visti.set(k, n + 1);
      if (n) { const a = n * 2.4, r = 0.00004 * Math.sqrt(n); g.lon += r * Math.cos(a) / Math.cos(g.lat * Math.PI / 180); g.lat += r * Math.sin(a); }   // stesso edificio: i punti si affiancano
      geoC.set(c.key, g);
    }
    sedeGL = D.me?.luogo?.x != null ? { ...pos(D.me.luogo, D.me.via), nome: D.me.nome } : null;
    // le province da vedere in dettaglio: dove ci sono clienti (prima quelle con più fatturato) e la sede
    const perProv = new Map(); for (const f of D.fatture) { const c = D.clienti.get(f.cli), pr = c?.luogo?.estero ? null : c?.luogo?.prov; if (pr) perProv.set(pr, (perProv.get(pr) || 0) + Math.abs(f.imp || 0) + 1); }
    GL.prov = [...perProv.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); GL.provSede = D.me?.luogo?.prov || null;
  }
  function puntiGL() {
    return A.clienti.filter(c => geoC.has(c.key)).map(c => { const g = geoC.get(c.key); return { id: c.key, nome: c.nome, lon: g.lon, lat: g.lat, f: c.fatt, prec: g.prec, prov: c.luogo?.prov,
      tip: () => h('div', { class: 'vd-popt' }, h('b', {}, c.nome), h('div', {}, `${eur(c.fatt)} · ${c.n} ${c.n === 1 ? 'fattura' : 'fatture'}`), h('div', { class: 'muted' }, `${c.luogo?.comune || ''} · ${PREC[g.prec] || ''}`)) }; });
  }
  function zonaGL(ps) {
    if (!GL.zona) return;
    const tot = ps.reduce((a, p) => a + Math.max(0, p.f), 0), top = [...ps].sort((a, b) => b.f - a.f).slice(0, 6);
    GL.zona.replaceChildren(h('h3', {}, 'Nella zona che vedi'), h('div', { class: 'vd-big' }, eur(tot), h('small', {}, ` · ${ps.length} ${ps.length === 1 ? 'cliente' : 'clienti'} · ${pct(tot / Math.max(1, A.fatturato))} del totale`)),
      top.length ? h('ul', { class: 'vd-cl' }, top.map(p => h('li', {}, h('button', { type: 'button', class: 'vd-clb', onclick: () => { seleziona({ tipo: 'cliente', k: p.id }); GL.inst?.vola(p.id); } }, h('b', {}, p.nome), h('span', {}, eur(p.f)))))) : h('p', { class: 'muted small' }, 'Nessun cliente in questa zona.'));
  }
  function precGL() {
    if (!GL.prec) return;
    const n = {}; for (const c of A.clienti) { const g = geoC.get(c.key); if (g) n[g.prec] = (n[g.prec] || 0) + 1; }
    const righe = ['civico', 'stimato', 'via', 'comune', 'cap', 'provincia'].filter(k => n[k]).map(k => h('li', {}, h('b', {}, String(n[k])), ` ${PREC[k]}`));
    const pv = GL.inst?.province || [];
    GL.prec.replaceChildren(h('h3', {}, 'Precisione delle posizioni'), righe.length ? h('ul', { class: 'vd-precl' }, righe) : h('p', { class: 'muted small' }, '—'),
      GL.inst?.regione ? h('p', { class: 'small vd-provd' }, h('b', {}, `Solo ${GL.inst.regione}`), `: tutti i clienti sono in questa regione, quindi la mappa mostra lei sola${pv.length ? `, con strade ed edifici delle sue ${pv.length} province` : ''}. Il resto d’Italia non si scarica.`)
        : pv.length ? h('p', { class: 'small vd-provd' }, h('b', {}, `Strade ed edifici in ${pv.length} ${pv.length === 1 ? 'provincia' : 'province'}`), `, quelle dove hai clienti: ${pv.slice(0, 12).join(', ')}${pv.length > 12 ? '…' : ''}. Il resto d’Italia è d’insieme: si scarica solo ciò che serve.`) : null,
      h('p', { class: 'muted small' }, Mappa.haCivici() ? 'Gli indirizzi si cercano su questo dispositivo, nell’indice dei numeri civici di OpenStreetMap: nessun indirizzo viene inviato.' : 'Senza l’indice degli indirizzi i clienti stanno al centro del Comune scritto in fattura.'));
  }
  function avvisoGL() {
    if (!GL.avviso) return;
    const det = GL.inst ? GL.inst.dettaglio : Mappa.haDettaglio(), civ = Mappa.haCivici();
    if (det && civ) { GL.avviso.hidden = true; return; }
    const sceglie = async () => { const n = await Mappa.scegliCartella(); if (!n) return toast('Nella cartella scelta non c’è la mappa: serve la cartella «mappa-italia» (italia.pmtiles e la cartella civici).', 'error'); GL.pronto = null; GL.rifai = true; avviaGL(); };
    const riapri = async () => { if (await Mappa.riprendi(true)) { GL.pronto = null; GL.rifai = true; avviaGL(); } };
    GL.avviso.hidden = false;
    GL.avviso.replaceChildren(h('div', {}, h('b', {}, !det ? 'Vedi l’Italia d’insieme.' : 'Mappa dettagliata senza indirizzi.'), ' ',
      !det ? 'Per strade ed edifici delle province dove vendi scegli la cartella «mappa-italia»: resta su questo dispositivo e funziona senza rete.' : 'Per mettere i clienti sul numero civico serve anche la cartella «civici».'),
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm primary', onclick: sceglie }, ic('folder', 15), 'Scegli la cartella della mappa'), GL.ricordata ? h('button', { type: 'button', class: 'btn sm', onclick: riapri }, 'Riapri l’ultima cartella') : null));
  }
  function vistaGL() {
    if (!GL.wrap) {
      GL.box = h('div', { class: 'vd-gl', role: 'region', 'aria-label': 'Mappa stradale dei clienti' });
      GL.stato = h('div', { class: 'vd-glst', role: 'status' }, 'Preparo la mappa…');
      GL.avviso = h('div', { class: 'vd-glav', hidden: true });
      const modo = (on, l, t) => h('button', { type: 'button', class: 'vd-glm' + (GL.rilievo === on ? ' on' : ''), 'aria-pressed': String(GL.rilievo === on), title: t, onclick: e => { if (GL.rilievo === on) return; GL.rilievo = on; GL.inst?.rilievo(on); GL.modi.querySelectorAll('button').forEach(b => { const a = b === e.currentTarget; b.classList.toggle('on', a); b.setAttribute('aria-pressed', String(a)); }); } }, l);
      GL.modi = h('div', { class: 'vd-glmodi', role: 'group', 'aria-label': 'Che cosa mostrare' }, modo(false, 'Clienti', 'Un punto per cliente, grande come il fatturato'), modo(true, 'Rilievo', 'Colonne in 3D, alte come il fatturato di ogni zona'));
      GL.wrap = h('div', { class: 'vd-glw' }, GL.box, GL.modi, GL.stato);
      GL.zona = h('section', { class: 'vd-sec vd-zona' }); GL.prec = h('section', { class: 'vd-sec' });
    }
    return GL.wrap;
  }
  function avviaGL() {
    GL.coda = GL.coda.then(async () => {
      if (st.tab !== 'mappa' || st.modo !== 'strade' || !GL.box?.isConnected) return;
      try {
        if (!GL.pronto) { GL.pronto = geocodifica(); GL.rifai = true; }
        await GL.pronto;
        if (GL.ricordata == null) GL.ricordata = await Mappa.ricordata();
        const P = puntiGL(), tema = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        if (GL.inst && GL.tema === tema && !GL.rifai) { GL.inst.map.resize(); GL.inst.aggiorna(P); }
        else {
          GL.inst?.chiudi(); GL.inst = null; statoGL('Preparo la mappa…');
          GL.inst = await Mappa.disegna(GL.box, { punti: P, sede: sedeGL, province: GL.prov, provSede: GL.provSede, onPunto: k => seleziona({ tipo: 'cliente', k }), onZona: zonaGL });
          if (GL.rilievo) GL.inst.rilievo(true);
          GL.tema = tema; GL.rifai = false; GL.box._mappa = GL.inst; GL.inst.map.resize(); GL.inst.tutta();
        }
        GL.inst.seleziona(st.sel?.tipo === 'cliente' ? st.sel.k : '');
        statoGL(''); precGL(); avvisoGL();
      } catch (e) {
        statoGL('La mappa stradale non si può mostrare su questo dispositivo: usa la vista per Comuni.'); console.warn(e);
      }
    });
    return GL.coda;
  }

  /* selezione: un Comune, una provincia, un cliente o un prodotto → dettagli nel pannello */
  function seleziona(s) { st.sel = s; GL.inst?.seleziona(s?.tipo === 'cliente' ? s.k : ''); if (s.tipo === 'prov') { st.modo = st.modo; } drawSide(); main.querySelectorAll('.vd-dot.sel').forEach(e => e.classList.remove('sel')); redrawSoon(); if (matchMedia('(max-width: 900px)').matches) side.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  const segInfo = { campioni: 'Comprano spesso, da poco e molto: i clienti migliori.', fedeli: 'Comprano con regolarità.', nuovi: 'Primo acquisto negli ultimi 4 mesi.', 'da coltivare': 'Comprano poco o di rado: margine per crescere.', 'a rischio': 'Non comprano da più tempo degli altri.', 'da recuperare': 'Clienti importanti fermi da molto più del loro solito: da ricontattare subito.', persi: 'Clienti abituali fermi da tempo.', note: 'Solo note di credito nel periodo.' };
  const chipSeg = s => h('span', { class: `vd-seg s-${s.replace(/\s/g, '-')}`, title: segInfo[s] || '' }, s);
  function schedaCliente(c) {
    const comprati = c.prodotti.slice(0, 6), luogoTxt = c.luogo?.estero ? c.luogo.paese : c.luogo?.comune ? `${c.luogo.comune} (${c.luogo.prov})` : c.sede || '—', g = geoC.get(c.key);
    return [h('div', { class: 'vd-sh' }, h('b', {}, c.nome), chipSeg(c.segmento)), h('div', { class: 'muted small' }, [c.pa ? 'Pubblica amministrazione' : c.persona ? 'Privato' : 'Azienda', c.piva ? `P.IVA ${c.piva}` : null, luogoTxt].filter(Boolean).join(' · ')),
      c.via ? h('div', { class: 'muted small' }, c.via, g ? ` · posizione ${PREC[g.prec] || ''}` : '') : null,
      h('dl', { class: 'vd-dl' }, h('dt', {}, 'Fatturato'), h('dd', {}, `${eur(c.fatt)} (${pct(c.quota)})`), h('dt', {}, 'Fatture'), h('dd', {}, String(c.n) + (c.note ? ` · note di credito ${eur(c.note)}` : '')),
        h('dt', {}, 'Primo e ultimo acquisto'), h('dd', {}, `${data(c.primo)} → ${data(c.ultimo)}`), h('dt', {}, 'Ritmo'), h('dd', {}, c.ritmo ? `ogni ${c.ritmo} giorni circa` : '—'),
        c.prossimo ? [h('dt', {}, 'Prossimo acquisto atteso'), h('dd', {}, c.prossimo < oggi() ? `${data(c.prossimo)} (in ritardo)` : data(c.prossimo))] : null,
        c.termini != null ? [h('dt', {}, 'Termini di pagamento'), h('dd', {}, `${c.termini} giorni · ${V.MOD_PAG[c.modalita] || c.modalita || '—'}`)] : null),
      h('div', { class: 'vd-st' }, 'Che cosa ha comprato'), hbar(comprati.map(p => ({ l: p.desc, v: p.fatt, sub: p.qta ? `· ${Math.round(p.qta).toLocaleString('it-IT')}` : '' }))),
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.cliente = c.key; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo cliente'),
        geoC.has(c.key) && typeof Mappa !== 'undefined' && Mappa.webgl() ? h('button', { type: 'button', class: 'btn sm', onclick: () => { if (st.tab !== 'mappa' || st.modo !== 'strade') { st.tab = 'mappa'; st.modo = 'strade'; drawMain(); avviaGL().then(() => GL.inst?.vola(c.key)); } else GL.inst?.vola(c.key); } }, ic('pin', 15), 'Mostra sulla mappa') : null)];
  }
  function drawSide() {
    const s = st.sel, out = [];
    if (s?.tipo === 'luogo') {
      const l = A.luoghi.find(x => x.k === s.k);
      if (l) out.push(h('div', { class: 'vd-sh' }, h('b', {}, `${l.comune} (${l.prov})`), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onclick: () => { st.sel = null; drawSide(); redrawSoon(); } }, ic('x', 16))),
        h('div', { class: 'muted small' }, `${l.regione}${l.km != null ? ` · ${l.km} km dalla sede` : ''}${l.prec === 'cap' ? ' · posizione dal CAP' : l.prec === 'provincia' ? ' · posizione della provincia' : ''}`),
        h('div', { class: 'vd-big' }, eur(l.fatt), h('small', {}, ` · ${l.clienti.length} ${l.clienti.length === 1 ? 'cliente' : 'clienti'}`)),
        h('div', { class: 'vd-st' }, 'Chi sono e che cosa hanno comprato'),
        h('ul', { class: 'vd-cl' }, l.clienti.map(c => h('li', {}, h('button', { type: 'button', class: 'vd-clb', onclick: () => seleziona({ tipo: 'cliente', k: c.key }) }, h('b', {}, c.nome), h('span', {}, eur(c.fatt))), h('div', { class: 'muted small' }, `${c.n} fatture · ultima ${data(c.ultimo)}`), h('div', { class: 'small' }, c.prodotti.slice(0, 3).map(p => p.desc).join(' · '))))),
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.comune = l.comune; st.prov = l.prov; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo Comune')));
    } else if (s?.tipo === 'prov') {
      const p = GEO?.province[s.k], ls = A.luoghi.filter(l => l.prov === s.k), tot = ls.reduce((a, l) => a + l.fatt, 0);
      out.push(h('div', { class: 'vd-sh' }, h('b', {}, `${p?.n || s.k} (${s.k})`), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onclick: () => { st.sel = null; drawSide(); } }, ic('x', 16))), h('div', { class: 'muted small' }, p?.r || ''),
        h('div', { class: 'vd-big' }, eur(tot), h('small', {}, ` · ${ls.reduce((a, l) => a + l.clienti.length, 0)} clienti`)),
        ls.length ? hbar(ls.map(l => ({ l: l.comune, v: l.fatt, k: l.k })), { onClick: r => seleziona({ tipo: 'luogo', k: r.k }) }) : h('p', { class: 'muted small' }, 'Nessun cliente in questa provincia: un territorio da esplorare.'),
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.prov = s.k; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questa provincia')));
    } else if (s?.tipo === 'cliente') {
      const c = A.clienti.find(x => x.key === s.k); if (c) out.push(...schedaCliente(c));
    } else {
      const p = A.precisione;
      out.push(h('div', { class: 'vd-st' }, 'Dati letti'), h('dl', { class: 'vd-dl' }, h('dt', {}, 'Azienda'), h('dd', {}, D.me ? `${D.me.nome}${D.me.luogo?.comune ? ` · ${D.me.luogo.comune}` : ''}` : '—'),
        h('dt', {}, 'Fatture di vendita'), h('dd', {}, `${D.fatture.length.toLocaleString('it-IT')} · fino al ${data(oggi())}`), D.scartate.passive ? [h('dt', {}, 'Fatture di acquisto'), h('dd', {}, `${D.scartate.passive} (escluse)`)] : null,
        errori.length ? [h('dt', {}, 'File non letti'), h('dd', {}, String(errori.length))] : null,
        h('dt', {}, 'Clienti sulla mappa'), h('dd', {}, `${p.comune + p.cap + p.provincia} su ${A.clienti.length - p.estero}${p.cap || p.provincia ? ` (${[p.cap ? `${p.cap} dal CAP` : '', p.provincia ? `${p.provincia} dalla provincia` : ''].filter(Boolean).join(', ')})` : ''}${p.estero ? ` · ${p.estero} all'estero` : ''}`)),
        D.emittenti.length > 1 ? h('label', { class: 'vd-f' }, h('span', {}, 'Azienda da analizzare'), h('select', { class: 'select', onchange: e => { D = V.prepara(invs, e.target.value); st.sel = null; GL.pronto = null; ridisegna(); } }, D.emittenti.sort((a, b) => b.n - a.n).map(e => h('option', { value: e.key, selected: e.key === D.me?.key }, `${e.nome} (${e.n})`)))) : null,
        h('div', { class: 'vd-st' }, 'Come leggere'), h('p', { class: 'small muted' }, 'Sulla mappa stradale tocca un gruppo per ingrandire e un cliente per la sua scheda. Nella vista per Comuni tocca un cerchio per vedere chi sono i clienti di quel Comune e che cosa hanno comprato, e una provincia per i suoi Comuni. Gli importi sono imponibili (senza IVA), al netto delle note di credito.'),
        h('p', { class: 'small muted' }, 'Sulla mappa stradale i clienti stanno all’indirizzo della sede scritta in fattura, fino al numero civico; nelle viste per Comune e provincia, al centro del Comune. Tutto avviene su questo dispositivo: nessun dato viene inviato.'));
    }
    side.replaceChildren(...out.filter(Boolean));
  }

  /* contenuto delle schede */
  const kpi = (l, v, sub = null, cls = '') => h('div', { class: 'vd-kpi ' + cls }, h('span', {}, l), h('b', {}, v), sub ? h('small', {}, sub) : null);
  const sez = (titolo, ...kids) => h('section', { class: 'vd-sec' }, h('h3', {}, titolo), ...kids);
  const mesiDati = (lbl = true) => A.mesi.map((m, i) => ({ v: m.fatt, tit: m.nome, lbl: lbl && (m.k.endsWith('-01') || i === 0) ? `${V.MESI3[+m.k.slice(5) - 1]} ${m.k.slice(2, 4)}` : V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0, extra: `${m.n} fatture · ${m.clienti} clienti${m.nuovi ? ` · ${m.nuovi} nuovi` : ''}` }));
  const prevDati = () => (A.previsione?.mesi || []).map(m => ({ v: m.val, lo: m.lo, hi: m.hi, prev: true, tit: `${m.nome} (stima)`, lbl: V.MESI3[+m.k.slice(5) - 1] }));
  function scoperteEl(max = 6) {
    if (!A.scoperte.length) return h('p', { class: 'muted' }, 'Servono più fatture per trovare tendenze.');
    const ICO = { rischio: 'alert', azione: 'bell', stagione: 'cal', bene: 'check', info: 'bulb', territorio: 'home', incassi: 'bank', previsione: 'chart' };
    return h('div', { class: 'vd-scop' }, A.scoperte.slice(0, max).map(s => h('article', { class: `vd-sc t-${s.tipo}` }, h('div', { class: 'vd-sci' }, ic(ICO[s.tipo] || 'bulb', 18)), h('div', {}, h('h4', {}, s.titolo), h('p', {}, s.testo),
      s.rif ? h('button', { type: 'button', class: 'linkbtn', onclick: () => { st.tab = s.rif.tab; if (s.rif.segmento) st.segmento = s.rif.segmento; drawMain(); } }, s.azione || 'Approfondisci') : null))));
  }
  function tabella(cols, righe, key, { onRow = null, vuoto = 'Nessun dato.' } = {}) {
    const [k, dir] = st.ord[key] || [cols[0].k, 1];
    const sorted = [...righe].sort((a, b) => { const x = a[k], y = b[k]; return (x == null) - (y == null) || (typeof x === 'string' ? x.localeCompare(y, 'it') : x - y) * dir; });
    return h('div', { class: 'vd-tw' }, h('table', { class: 'vd-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.num ? 'num' : '', 'aria-sort': k === c.k ? (dir > 0 ? 'ascending' : 'descending') : null }, h('button', { type: 'button', onclick: () => { st.ord[key] = [c.k, k === c.k ? -dir : (c.num ? -1 : 1)]; drawMain(); } }, c.l, k === c.k ? (dir > 0 ? ' ↑' : ' ↓') : ''))))),
      h('tbody', {}, sorted.length ? sorted.slice(0, 500).map(r => h('tr', { tabindex: onRow ? '0' : null, class: onRow ? 'cl' : '', onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? e => { if (e.key === 'Enter') onRow(r); } : null }, cols.map(c => h('td', { class: c.num ? 'num' : '' }, c.f ? c.f(r) : r[c.k] ?? '—')))) : h('tr', {}, h('td', { colspan: cols.length, class: 'muted' }, vuoto)))));
  }
  function contenuto() {
    if (!D.fatture.length) return [h('div', { class: 'vd-empty' }, h('h3', {}, invs.length ? 'Nessuna fattura di vendita' : 'Nessuna fattura letta'), h('p', {}, invs.length ? 'I file caricati sono fatture di acquisto o di un’altra azienda. Carica le fatture emesse (attive): XML, P7M, lo ZIP del cassetto fiscale o i PDF.' : 'Carica le fatture emesse: XML, P7M, lo ZIP scaricato dal cassetto fiscale o i PDF della fattura elettronica.'))];
    const t = st.tab;
    if (t === 'panoramica') return [
      h('div', { class: 'vd-kpis' }, kpi('Fatturato', eur(A.fatturato), 'imponibile, senza IVA'), kpi('Fatture', A.nFatture.toLocaleString('it-IT'), A.nNote ? `${A.nNote} note di credito` : null), kpi('Clienti', A.nClienti.toLocaleString('it-IT'), `80% da ${A.pareto.n80}`),
        kpi('Fattura media', eur(A.media)), A.crescita?.var != null ? kpi('Ultimi 12 mesi', `${A.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(A.crescita.var))}`, 'sui 12 mesi prima', A.crescita.var >= 0 ? 'up' : 'down') : kpi('Periodo', `${data(A.da)}`, `→ ${data(A.a)}`)),
      sez('Scoperte', scoperteEl(6)),
      h('div', { class: 'vd-two' }, sez('Dove sono i clienti', mappa()), sez('Andamento mensile', barre([...mesiDati()], { prev: prevDati(), desc: 'Fatturato per mese', meta: true }), A.previsione ? h('p', { class: 'muted small' }, 'In chiaro la stima dei prossimi 3 mesi, con l’intervallo probabile.') : null,
        h('div', { class: 'vd-st' }, 'Primi clienti'), hbar(A.clienti.slice(0, 6).map(c => ({ l: c.nome, v: c.fatt, sub: pct(c.quota), k: c.key })), { onClick: r => seleziona({ tipo: 'cliente', k: r.k }) })))];
    const tbMappa = () => h('div', { class: 'vd-maptb' }, seg([...(typeof Mappa !== 'undefined' && Mappa.webgl() ? [['strade', 'Strade']] : []), ['bolle', 'Comuni'], ['province', 'Province']], st.modo, v => { st.modo = v; drawMain(); }), A.distanze ? h('span', { class: 'muted small' }, `Metà del fatturato entro ${A.distanze.mediana ?? '—'} km dalla sede`) : null);
    if (t === 'mappa' && st.modo === 'strade') { setTimeout(avviaGL, 0); vistaGL(); return [tbMappa(), GL.wrap, GL.avviso, h('div', { class: 'vd-two' }, GL.zona, h('div', {}, GL.prec,
        A.estero.length ? sez('Estero', hbar(A.estero.map(e => ({ l: e.paese, v: e.fatt, sub: `· ${e.clienti.length}` })))) : null,
        A.senzaLuogo.n ? h('p', { class: 'muted small' }, `${A.senzaLuogo.n} clienti senza un Comune riconoscibile in fattura (${eur(A.senzaLuogo.fatt)}).`) : null))]; }
    if (t === 'mappa') return [
      tbMappa(),
      h('div', { class: 'vd-two map' }, mappa({ grande: true }), h('div', {},
        A.distanze ? sez('Distanza dalla sede', hbar(A.distanze.fasce.filter(f => f.n).map(f => ({ l: f.r === Infinity ? 'oltre 250 km' : `entro ${f.r} km`, v: f.fatt, sub: `· ${f.n} ${f.n === 1 ? 'cliente' : 'clienti'}` })))) : null,
        sez('Regioni', hbar(A.regioni.slice(0, 10).map(r => ({ l: r.n, v: r.fatt, k: r.n })), { onClick: r => { st.regione = r.k; ridisegna(); } })),
        sez('Comuni', hbar(A.luoghi.slice(0, 12).map(l => ({ l: `${l.comune} (${l.prov})`, v: l.fatt, sub: `· ${l.clienti.length}`, k: l.k })), { onClick: r => seleziona({ tipo: 'luogo', k: r.k }) })),
        A.estero.length ? sez('Estero', hbar(A.estero.map(e => ({ l: e.paese, v: e.fatt, sub: `· ${e.clienti.length}` })))) : null,
        A.senzaLuogo.n ? h('p', { class: 'muted small' }, `${A.senzaLuogo.n} clienti senza un Comune riconoscibile in fattura (${eur(A.senzaLuogo.fatt)}).`) : null))];
    if (t === 'clienti') {
      const q = st.cerca.toLowerCase(), righe = A.clienti.filter(c => (!st.segmento || c.segmento === st.segmento) && (!q || c.nome.toLowerCase().includes(q) || (c.luogo?.comune || '').toLowerCase().includes(q)));
      return [h('div', { class: 'vd-segs', role: 'group', 'aria-label': 'Segmenti di clienti' }, h('button', { type: 'button', class: 'vd-segb' + (!st.segmento ? ' on' : ''), 'aria-pressed': String(!st.segmento), onclick: () => { st.segmento = ''; drawMain(); } }, `Tutti · ${A.clienti.length}`),
        A.segmenti.map(s => h('button', { type: 'button', class: 'vd-segb' + (st.segmento === s.s ? ' on' : ''), 'aria-pressed': String(st.segmento === s.s), title: segInfo[s.s], onclick: () => { st.segmento = st.segmento === s.s ? '' : s.s; drawMain(); } }, `${s.s} · ${s.n}`, h('small', {}, ` ${corto(s.fatt)} €`)))),
        st.segmento ? h('p', { class: 'muted small' }, segInfo[st.segmento]) : null,
        h('input', { class: 'input vd-q', type: 'search', placeholder: 'Cerca un cliente o un Comune', value: st.cerca, 'aria-label': 'Cerca un cliente', oninput: e => { st.cerca = e.target.value; const pos = e.target.selectionStart; drawMain(); const el = main.querySelector('.vd-q'); el?.focus(); try { el?.setSelectionRange(pos, pos); } catch { } } }),
        tabella([{ k: 'nome', l: 'Cliente', f: c => h('span', {}, h('b', {}, c.nome), h('small', { class: 'muted' }, ' ' + (c.luogo?.estero ? c.luogo.paese : c.luogo?.comune || ''))) }, { k: 'fatt', l: 'Fatturato', num: true, f: c => eur(c.fatt) }, { k: 'quota', l: 'Quota', num: true, f: c => pct(c.quota) }, { k: 'n', l: 'Fatture', num: true }, { k: 'ultimo', l: 'Ultimo acquisto', num: true, f: c => data(c.ultimo) }, { k: 'ritmo', l: 'Ritmo', num: true, f: c => c.ritmo ? `${c.ritmo} gg` : '—' }, { k: 'segmento', l: 'Segmento', f: c => chipSeg(c.segmento) }, { k: 'abc', l: 'ABC' }],
          righe, 'clienti', { onRow: c => seleziona({ tipo: 'cliente', k: c.key }), vuoto: 'Nessun cliente con questi filtri.' })];
    }
    if (t === 'prodotti') return [
      tabella([{ k: 'desc', l: 'Prodotto o servizio', f: p => h('b', {}, p.desc) }, { k: 'fatt', l: 'Fatturato', num: true, f: p => eur(p.fatt) }, { k: 'qta', l: 'Quantità', num: true, f: p => `${Math.round(p.qta).toLocaleString('it-IT')} ${p.um || ''}` }, { k: 'clienti', l: 'Clienti', num: true }, { k: 'prezzoMedio', l: 'Prezzo medio', num: true, f: p => p.prezzoMedio != null ? eur(p.prezzoMedio) : '—' },
        { k: 'variazione', l: 'Prezzo nel tempo', num: true, f: p => h('span', { class: 'vd-pv' }, linea(p.prezzi), p.variazione != null ? h('small', { class: p.variazione > 0.005 ? 'up' : p.variazione < -0.005 ? 'down' : '' }, `${p.variazione > 0 ? '+' : ''}${(p.variazione * 100).toFixed(1).replace('.', ',')}%`) : null) }],
        A.prodotti, 'prodotti', { onRow: p => { st.prodotto = st.prodotto === p.k ? '' : p.k; ridisegna(); } }),
      h('p', { class: 'muted small' }, 'Tocca un prodotto per vedere solo le vendite che lo contengono (mappa, clienti, andamento).'),
      A.coppie.length ? sez('Comprati insieme', h('ul', { class: 'vd-pairs' }, A.coppie.slice(0, 6).map(c => h('li', {}, h('b', {}, c.nomeA), ' + ', h('b', {}, c.nomeB), h('span', { class: 'muted' }, ` · ${c.n} fatture · ${c.lift.toFixed(1)} volte più del caso`))))) : null];
    if (t === 'tempo') return [
      sez('Fatturato per mese', barre(mesiDati(), { prev: prevDati(), h: 260, desc: 'Fatturato per mese con la stima dei prossimi tre mesi' }), A.previsione ? h('p', { class: 'muted small' }, `Stima dei prossimi 3 mesi con la tendenza (${A.previsione.tendenza >= 0 ? 'in crescita' : 'in calo'} di circa ${eur(Math.abs(A.previsione.tendenza))} al mese) e la stagionalità: ${A.previsione.mesi.map(m => `${m.nome} ${eur(m.val)}`).join(', ')}.`) : h('p', { class: 'muted small' }, 'Con almeno 12 mesi di fatture compare anche la stima dei prossimi 3 mesi.')),
      h('div', { class: 'vd-two' }, sez('Stagionalità: media di ogni mese', barre(A.stagioni.map(s => ({ v: s.media || 0, tit: s.nome, lbl: V.MESI3[s.m], extra: s.anni ? `media di ${s.anni} ${s.anni === 1 ? 'anno' : 'anni'}` : 'nessun dato' })), { h: 200, desc: 'Fatturato medio per mese dell’anno', meta: true })),
        sez('Clienti nuovi per mese', barre(A.mesi.map((m, i) => ({ v: m.nuovi, tit: m.nome, lbl: V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0 })), { h: 200, fmt: v => `${v} ${v === 1 ? 'cliente nuovo' : 'clienti nuovi'}`, desc: 'Clienti nuovi per mese', meta: true })))];
    if (t === 'incassi') return [
      h('div', { class: 'vd-kpis' }, kpi('Termini medi', A.pagamenti.termini != null ? `${A.pagamenti.termini} giorni` : '—', 'dalla data della fattura alla scadenza'), ...A.pagamenti.futuro.map((f, i) => kpi(`Scadenze entro ${f.d} giorni`, eur(f.imp), `${f.n} rate${i ? '' : ' · da verificare in banca'}`))),
      h('div', { class: 'vd-two' }, sez('Come pagano i clienti', hbar(A.pagamenti.modalita.map(m => ({ l: m.nome, v: m.fatt })))), sez('Termini di 90 giorni o più', A.pagamenti.lunghi.length ? hbar(A.pagamenti.lunghi.map(c => ({ l: c.nome, v: c.fatt, sub: `· ${c.termini} gg`, k: c.key })), { onClick: r => seleziona({ tipo: 'cliente', k: r.k }) }) : h('p', { class: 'muted' }, 'Nessun cliente con termini così lunghi.'))),
      h('p', { class: 'muted small' }, 'Le scadenze vengono dalle fatture: il programma non sa quali sono già state incassate.')];
    return [];
  }

  /* filtri in una riga sopra i contenuti; schede */
  const TABS = [['panoramica', 'Panoramica'], ['mappa', 'Mappa'], ['clienti', 'Clienti'], ['prodotti', 'Prodotti'], ['tempo', 'Andamento'], ['incassi', 'Incassi']];
  function barraFiltri() {
    const attivi = [st.regione && ['regione', st.regione], st.prov && !st.comune && ['prov', `Provincia ${st.prov}`], st.comune && ['comune', `${st.comune}${st.prov ? ` (${st.prov})` : ''}`], st.estero && ['estero', 'Estero'], st.cliente && ['cliente', D.clienti.get(st.cliente)?.nome || 'cliente'], st.prodotto && ['prodotto', A.prodotti.find(p => p.k === st.prodotto)?.desc || D.fatture.flatMap(f => f.righe).find(r => r.k === st.prodotto)?.desc || 'prodotto']].filter(Boolean);
    return h('div', { class: 'vd-filt' },
      h('label', { class: 'vd-f' }, h('span', {}, 'Periodo'), h('select', { class: 'select', onchange: e => { st.periodo = e.target.value; ridisegna(); } }, periodi().map(([v, l]) => h('option', { value: v, selected: st.periodo === v }, l)))),
      h('label', { class: 'vd-f' }, h('span', {}, 'Clienti'), h('select', { class: 'select', onchange: e => { st.tipoCli = e.target.value; ridisegna(); } }, [['', 'Tutti'], ['aziende', 'Aziende'], ['privati', 'Privati'], ['pa', 'Pubblica amministrazione']].map(([v, l]) => h('option', { value: v, selected: st.tipoCli === v }, l)))),
      attivi.map(([k, l]) => h('button', { type: 'button', class: 'vd-chipf', 'aria-label': `Togli il filtro ${l}`, onclick: () => { st[k] = k === 'estero' ? false : ''; if (k === 'prov' || k === 'comune') { st.comune = ''; st.prov = ''; } ridisegna(); } }, l, ic('x', 14))));
  }
  const main = h('div', { class: 'ws-main vd-main' }), side = h('div', { class: 'vd-side' });
  function drawMain() {
    nascondiTip();
    main.replaceChildren(h('div', { class: 'toolbar vd-tb' }, barraFiltri()), D.fatture.length ? h('div', { class: 'vd-tabs', role: 'tablist', 'aria-label': 'Analisi' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'vd-tab' + (st.tab === k ? ' on' : ''), 'aria-selected': String(st.tab === k), onclick: () => { st.tab = k; drawMain(); } }, l))) : null,
      h('div', { class: 'vd-body', role: 'tabpanel' }, ...contenuto().filter(Boolean)), tip);
  }
  function ridisegna() { calcola(); drawMain(); drawSide(); }

  /* Excel: clienti, prodotti, mesi, luoghi, fatture e scoperte */
  async function excel() {
    if (!D.fatture.length) return toast('Nessuna fattura di vendita da esportare', 'error');
    await withBusy('Preparazione del file Excel…', async () => {
      const b = { bold: true, fill: '#EEF2FF' }, n = v => ({ v: +v || 0, t: 'n', fmt: '#,##0.00' }), i = v => ({ v: +v || 0, t: 'n', fmt: '0' }), p = v => ({ v: +v || 0, t: 'n', fmt: '0.0%' }), d = t => t ? { v: Math.round((t - Date.UTC(1899, 11, 30)) / DAY), t: 'd', fmt: 'dd/mm/yyyy' } : null, s = v => ({ v: v ?? '' });
      const head = l => l.map(x => ({ v: x, ...b }));
      const sheets = [
        { name: 'Scoperte', widths: [40, 110], rows: [head(['Scoperta', 'Dettaglio']), ...A.scoperte.map(x => [s(x.titolo), { v: x.testo, wrap: true }])] },
        { name: 'Clienti', freeze: 1, widths: [34, 16, 22, 8, 16, 10, 10, 14, 14, 10, 16, 8, 30], rows: [head(['Cliente', 'P.IVA', 'Comune', 'Prov.', 'Regione', 'Fatturato', 'Quota', 'Fatture', 'Primo acquisto', 'Ultimo acquisto', 'Ritmo (giorni)', 'Segmento', 'ABC', 'Prodotto principale']),
          ...A.clienti.map(c => [s(c.nome), s(c.piva), s(c.luogo?.estero ? c.luogo.paese : c.luogo?.comune), s(c.luogo?.prov), s(c.luogo?.regione), n(c.fatt), p(c.quota), i(c.n), d(c.primo), d(c.ultimo), c.ritmo ? i(c.ritmo) : null, s(c.segmento), s(c.abc), s(c.prodotti[0]?.desc)])] },
        { name: 'Prodotti', freeze: 1, widths: [44, 14, 12, 8, 10, 14, 14], rows: [head(['Prodotto o servizio', 'Fatturato', 'Quantità', 'U.M.', 'Clienti', 'Prezzo medio', 'Variazione prezzo']), ...A.prodotti.map(x => [s(x.desc), n(x.fatt), n(x.qta), s(x.um), i(x.clienti), x.prezzoMedio != null ? n(x.prezzoMedio) : null, x.variazione != null ? p(x.variazione) : null])] },
        { name: 'Mesi', freeze: 1, widths: [18, 14, 10, 10, 12], rows: [head(['Mese', 'Fatturato', 'Fatture', 'Clienti', 'Clienti nuovi']), ...A.mesi.map(m => [s(m.nome), n(m.fatt), i(m.n), i(m.clienti), i(m.nuovi)]), ...(A.previsione?.mesi || []).map(m => [s(`${m.nome} (stima)`), n(m.val), null, null, null])] },
        { name: 'Territorio', freeze: 1, widths: [26, 8, 18, 14, 10, 10, 60], rows: [head(['Comune', 'Prov.', 'Regione', 'Fatturato', 'Clienti', 'Km dalla sede', 'Clienti']), ...A.luoghi.map(l => [s(l.comune), s(l.prov), s(l.regione), n(l.fatt), i(l.clienti.length), l.km != null ? i(l.km) : null, s(l.clienti.map(c => c.nome).join(', '))]), ...A.estero.map(e => [s(e.paese), s(e.naz), s('Estero'), n(e.fatt), i(e.clienti.length), null, s(e.clienti.map(c => c.nome).join(', '))])] },
        { name: 'Fatture', freeze: 1, widths: [12, 12, 8, 34, 14, 12, 14, 30], rows: [head(['Data', 'Numero', 'Tipo', 'Cliente', 'Imponibile', 'IVA', 'Totale', 'File']), ...V.filtra(D, filtro()).map(f => [d(f.t), s(f.numero), s(f.tipo), s(f.cliNome), n(f.imp), n(f.iva), n(f.tot), s(f.file)])] },
      ];
      const bytes = await XlsxOut.build(sheets, { title: 'Analisi delle vendite' });
      showResult([{ name: `Analisi vendite - ${D.me?.nome || 'azienda'}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-'), bytes, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', info: '6 fogli: scoperte, clienti, prodotti, mesi, territorio, fatture' }], { title: 'Analisi pronta', note: 'Gli importi sono imponibili al netto delle note di credito. Il file resta sul tuo dispositivo.' });
    });
  }

  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: excel }, ic('download', 18), 'Scarica l’analisi in Excel'), h('div', { class: 'muted small vd-foot' }, 'Clienti, prodotti, mesi, territorio e fatture in un file.')]);
  ws.classList.add('vd-ws');
  // se la finestra cambia larghezza, i grafici si ridisegnano sulla misura nuova
  let lw = 0, rz = 0; const onRz = () => { if (!ws.isConnected) return removeEventListener('resize', onRz); clearTimeout(rz); rz = setTimeout(() => { const w = main.clientWidth; if (Math.abs(w - lw) > 40) { lw = w; drawMain(); } }, 200); }; addEventListener('resize', onRz);
  if (errori.length && !D.fatture.length) toast(`${errori.length} file non letti: ${errori[0][1]}`, 'error');
  ridisegna();
}
