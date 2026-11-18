/* =====================================================================
   Esperienza d'uso: scorciatoie da tastiera ovunque, annullamento universale, passaggi tra le schermate,
   avanzamento leggibile, apertura dei file dal sistema (quando file360 è installata come app).
   ===================================================================== */
const UX = (() => {
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || ''), MOD = isMac ? '⌘' : 'Ctrl';
  const typing = e => { const t = e.target, tag = (t && t.tagName || '').toLowerCase(); return tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable; };
  /* ---------- elenco delle scorciatoie (tasto ?) ---------- */
  const KEYS = [
    ['Ovunque', [['Cerca uno strumento o descrivi cosa devi fare', [MOD, 'K']], ['Cerca (rapido)', ['/']], ['Queste scorciatoie', ['?']], ['Torna alla home', ['G', 'H']], ['Progetti · Ricette · Attività', ['G', 'P / R / A']], ['Tema chiaro o scuro', ['G', 'T']]]],
    ['Con un documento aperto', [['Esegui lo strumento (il pulsante principale)', [MOD, 'Invio']], ['Scarica la versione attuale', [MOD, 'S']], ['Annulla l’ultima modifica applicata (versione precedente)', [MOD, 'Z']], ['Ripristina', [MOD, '⇧', 'Z']], ['Versioni del documento', ['G', 'V']]]],
    ['Nelle finestre', [['Chiudi', ['Esc']], ['Pulsante successivo / precedente', ['Tab', '⇧ Tab']]]],
    ['In «Modifica»', [['Grassetto · corsivo · sottolineato', [MOD, 'B / I / U']], ['Trova e sostituisci', [MOD, 'F']], ['Modifica testo · casella di testo', ['M', 'T']]]],
  ];
  let helpOpen = null;
  function help() {
    if (helpOpen) return;
    const m = modal([h('h3', {}, 'Scorciatoie da tastiera'),
      h('div', { class: 'keys' }, KEYS.flatMap(([g, rows]) => [h('h4', {}, g), ...rows.map(([t, ks]) => h('div', {}, h('span', {}, t), h('span', {}, ks.map(k => h('kbd', {}, k)))))]))],
      { width: 620, onClose: () => { helpOpen = null; } });
    helpOpen = m;
  }
  /* ---------- annullamento universale: ogni modifica applicata è una versione, Ctrl+Z torna a quella prima ---------- */
  let redoTo = null;
  function undo() {
    const st = Flow.state(); if (!st || st.cur < 1) return false;
    redoTo = st.cur; const lab = st.labels[st.cur];
    Flow.resumeVersion(st.cur - 1);
    // lo strumento si riapre sulla versione ripresa (e toglie gli avvisi vecchi): l'avviso arriva subito dopo
    setTimeout(() => toastActions(`Annullato: «${lab}». Sei alla versione ${st.cur}.`, [['Ripristina', redo]], 8000), 350);
    return true;
  }
  function redo() { const st = Flow.state(); if (!st || redoTo == null || redoTo >= st.n || redoTo <= st.cur) return false; const to = redoTo; redoTo = null; Flow.resumeVersion(to); toast(`Ripristinata la versione ${to + 1}`); return true; }
  let gAt = 0;
  addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && e.key === 'Enter' && !OPEN_MODALS.size && !Busy.el) { const b = [...document.querySelectorAll('.tool .btn-run')].filter(x => x.offsetParent && !x.disabled).pop(); if (b) { e.preventDefault(); b.click(); } return; }
    if (mod && k === 'z' && !typing(e) && !OPEN_MODALS.size && !Busy.el && Flow.active()) {
      // lo strumento aperto ha ancora modifiche sue non applicate: l'annullamento è il suo (non si tocca)
      if (Flow.dirty()) return;
      if (e.shiftKey ? redo() : undo()) e.preventDefault();
      return;
    }
    if (mod || e.altKey || typing(e) || OPEN_MODALS.size || Busy.el) return;
    if (e.key === '?') { e.preventDefault(); help(); return; }
    if (k === 'g') { gAt = Date.now(); return; }
    if (Date.now() - gAt < 1200) {
      gAt = 0;
      const go = { h: '', p: 'progetti', r: 'ricette', a: 'attivita' }[k];
      if (go != null && (go === '' || PAGES[go])) { e.preventDefault(); nav(go); }
      else if (k === 't') { e.preventDefault(); document.getElementById('theme-btn')?.click(); }
      else if (k === 'v' && Flow.active()) { e.preventDefault(); Flow.showHistory(); }
    }
  });
  /* ---------- passaggi tra le schermate: la scheda scelta diventa l'intestazione dello strumento ----------
     Niente «fotografie» della pagina intera (View Transitions): senza grafica dedicata costavano fino a 5 fotogrammi persi
     (misurato). Si anima solo ciò che spiega il passaggio, con trasformazioni pure: l'icona della scheda vola al suo posto
     nell'intestazione e il contenuto nuovo sale di pochi pixel. */
  let lastCard = null;
  document.addEventListener('pointerdown', e => { const c = e.target.closest?.('.tool-card, .intent, .wb-tool, .seo-rel-a, .rail-btn'); lastCard = c ? { el: c, at: Date.now() } : null; }, true);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = () => getComputedStyle(document.documentElement).getPropertyValue('--e-spring').trim() || 'cubic-bezier(.3,1.5,.5,1)';
  function transition(change, id) {
    if (still() || Busy.el || document.hidden) return change();
    const srcEl = lastCard && Date.now() - lastCard.at < 1500 && lastCard.el.isConnected ? lastCard.el.querySelector('.t-ic, .ic') : null;
    const from = srcEl ? srcEl.getBoundingClientRect() : null;
    lastCard = null;
    change();
    window.__transitions = (window.__transitions || 0) + 1;
    const dst = id && TOOLS[id] ? document.querySelector('.toolhead .t-ic') : null;
    if (dst && from && from.width) {
      const to = dst.getBoundingClientRect();
      if (to.width) { const sx = from.width / to.width, dx = from.left - to.left, dy = from.top - to.top;
        try { dst.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx})`, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: 420, easing: ease() }); } catch { } }
    }
    const body = document.querySelector('#main > .tool > :not(.toolhead), #main > .home, #main > .tool.page .page-body');
    if (body) try { body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' }); } catch { }
  }
  /* ---------- installata come app: i file aperti dal sistema («Apri con file360») arrivano qui ---------- */
  try {
    if ('launchQueue' in window && window.launchQueue.setConsumer) window.launchQueue.setConsumer(async p => {
      if (!p.files || !p.files.length) return;
      const files = await Promise.all(p.files.map(fh => fh.getFile()));
      Flow.setWorkbench(files); if (routeId()) nav(''); else route();
    });
  } catch (e) { console.warn(e); }
  return { help, undo, redo, transition };
})();

/* ---------- sfondo: documenti che passano come stelle cadenti ----------
   Piccoli fogli inclinati in prospettiva (PDF, DOCX, XLSX, JPG, XML, P7M) attraversano lo schermo in diagonale,
   ognuno con una scia leggera del colore del suo formato. Tre profondità: i lontani piccoli, lenti e tenui.
   Discreto: pochi fogli, molto trasparenti; si ferma con la scheda nascosta, col menu aperto o mentre uno strumento
   lavora; con «riduci movimento» resta un'immagine ferma. */
const BgFlow = (() => {
  let cv = null, ctx = null, W = 0, H = 0, S = 1, ps = [], raf = 0, dark = false, bg = '#fff', busyAt = 0, busy = false, still = false, frame = 0, sprites = {};
  const FMT = [['PDF', '#E8246A'], ['DOCX', '#2F6FE0'], ['XLSX', '#00A08A'], ['JPG', '#D98A00'], ['XML', '#5A2BFF'], ['P7M', '#9B30D9']];
  const ANG = 0.52;   // direzione: in basso a destra, circa 30°
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // un foglio disegnato una volta per formato (poi si copia: costa pochissimo a ogni fotogramma)
  function sprite(label, color) {
    const k = 2, w = 46 * k, h = 58 * k, c = document.createElement('canvas'); c.width = w + 4 * k; c.height = h + 4 * k;
    const x = c.getContext('2d'); x.translate(2 * k, 2 * k);
    const r = 6 * k, f = 13 * k;
    x.beginPath(); x.moveTo(r, 0); x.lineTo(w - f, 0); x.lineTo(w, f); x.lineTo(w, h - r); x.quadraticCurveTo(w, h, w - r, h); x.lineTo(r, h); x.quadraticCurveTo(0, h, 0, h - r); x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0); x.closePath();
    x.fillStyle = dark ? '#262046' : '#FFFFFF'; x.fill(); x.lineWidth = 1.2 * k; x.strokeStyle = dark ? 'rgba(180,165,255,.35)' : 'rgba(90,43,255,.22)'; x.stroke();
    x.beginPath(); x.moveTo(w - f, 0); x.lineTo(w - f, f - 3 * k); x.quadraticCurveTo(w - f, f, w - f + 3 * k, f); x.lineTo(w, f); x.closePath(); x.fillStyle = dark ? '#3A3170' : '#E6E0FF'; x.fill();
    x.strokeStyle = dark ? 'rgba(220,214,255,.28)' : 'rgba(21,18,46,.16)'; x.lineWidth = 2.4 * k; x.lineCap = 'round';
    [[16, 30], [22, 34], [28, 26]].forEach(([y, len]) => { x.beginPath(); x.moveTo(7 * k, y * k); x.lineTo((7 + len) * k, y * k); x.stroke(); });
    x.fillStyle = color; const bw = (label.length * 7 + 10) * k, bh = 13 * k; x.beginPath(); x.roundRect ? x.roundRect(6 * k, h - bh - 7 * k, bw, bh, 4 * k) : x.rect(6 * k, h - bh - 7 * k, bw, bh); x.fill();
    x.fillStyle = '#fff'; x.font = `700 ${9 * k}px "IBM Plex Mono", ui-monospace, monospace`; x.textBaseline = 'middle'; x.fillText(label, 11 * k, h - bh / 2 - 7 * k + 0.5 * k);
    return c;
  }
  function theme() {
    const r = document.documentElement;
    dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const probe = document.createElement('i'); probe.style.cssText = 'position:absolute;width:0;height:0;color:var(--bg)'; document.body.append(probe);
    bg = getComputedStyle(probe).color || (dark ? '#100D20' : '#F6F4FD'); probe.remove();
    sprites = Object.fromEntries(FMT.map(([l, c]) => [l, sprite(l, c)]));
    if (ctx) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  }
  function size() {
    S = Math.min(1, 1.1 / (devicePixelRatio || 1)) * (devicePixelRatio || 1) * .9;
    W = Math.max(1, Math.round(innerWidth * S)); H = Math.max(1, Math.round(innerHeight * S));
    cv.width = W; cv.height = H;
    theme();
    const n = Math.max(7, Math.min(22, Math.round(innerWidth * innerHeight / 60000)));
    ps = Array.from({ length: n }, () => seed({}, true));
  }
  // nasce fuori dallo schermo, in alto o a sinistra (o in un punto qualsiasi al primo disegno)
  function seed(p, anywhere = false) {
    const z = Math.random(); p.z = .35 + z * .65;
    const [l, c] = FMT[(Math.random() * FMT.length) | 0]; p.l = l; p.c = c;
    p.v = (0.35 + p.z * 0.95) * S; p.a = ANG + (Math.random() - .5) * .18;
    p.s = (0.42 + p.z * 0.5) * S;              // scala del foglio
    p.rot = -0.32 + (Math.random() - .5) * .3; p.spin = (Math.random() - .5) * .0016;
    p.alpha = (dark ? .16 : .13) + p.z * (dark ? .2 : .17);
    if (anywhere) { p.x = Math.random() * W; p.y = Math.random() * H; }
    else if (Math.random() < .55) { p.x = Math.random() * W * .8 - W * .1; p.y = -70 * S; }
    else { p.x = -70 * S; p.y = Math.random() * H * .8 - H * .1; }
    return p;
  }
  function step() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ps.sort((a, b) => a.z - b.z);
    for (const p of ps) {
      const dx = Math.cos(p.a), dy = Math.sin(p.a);
      p.x += dx * p.v; p.y += dy * p.v; p.rot += p.spin;
      // scia: dal foglio indietro, sfuma nel nulla
      const tl = (70 + 90 * p.z) * S, tx = p.x - dx * tl, ty = p.y - dy * tl;
      const g = ctx.createLinearGradient(p.x, p.y, tx, ty); g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = p.alpha * .55; ctx.strokeStyle = g; ctx.lineWidth = (1 + 2.2 * p.z) * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
      // foglio in prospettiva: inclinato e schiacciato come se fosse adagiato su un piano
      const im = sprites[p.l]; if (!im) continue;
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot), sx = p.s * .5 * .86, sy = p.s * .5;
      ctx.setTransform(cs * sx, sn * sx, (-sn + .28 * cs) * sy, (cs + .28 * sn) * sy, p.x, p.y);
      ctx.globalAlpha = p.alpha; ctx.drawImage(im, -im.width / 2, -im.height / 2);
      if (p.x - 80 * S > W || p.y - 80 * S > H) seed(p);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (now - busyAt > 500) { busyAt = now; busy = !!document.querySelector('.scrim.busy, .drawer.open'); }
    if (busy) return;
    // telefoni e computer lenti: mezza frequenza
    if (++frame % (innerWidth < 700 ? 2 : 1)) return;
    step();
  }
  function paintStill() { step(); }
  function start() {
    if (cv || window.__oauthPopup) return;
    cv = document.createElement('canvas'); cv.className = 'bg-flow'; cv.setAttribute('aria-hidden', 'true');
    document.body.prepend(cv);
    ctx = cv.getContext('2d', { alpha: false });
    size();
    if (!start._l) { start._l = 1;
      addEventListener('resize', () => { if (!cv) return; clearTimeout(start._r); start._r = setTimeout(() => { size(); if (still) paintStill(); }, 150); });
      new MutationObserver(() => setTimeout(() => cv && theme(), 30)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(() => cv && theme(), 30)); }
    still = reduce();
    if (still) paintStill(); else raf = requestAnimationFrame(loop);
    document.documentElement.classList.add('has-flow');
  }
  // preferenza «Animazioni»: solo «Complete» muove lo sfondo; con «Leggere» e «Nessuna» resta un'immagine ferma
  const moving = () => (document.documentElement.dataset.anim || 'full') === 'full' && !reduce();
  function apply() {
    if (!cv) return;
    const m = moving();
    if (!m && !still) { still = true; cancelAnimationFrame(raf); raf = 0; paintStill(); }
    else if (m && still) { still = false; raf = requestAnimationFrame(loop); }
  }
  return { start: () => { start(); apply(); }, stop: () => { cancelAnimationFrame(raf); raf = 0; }, apply };
})();

/* ---------- apertura animata: dopo ~2,3 s (o al primo clic/tasto) il logo vola al suo posto in alto ---------- */
const Intro = (() => {
  let done = false;
  function finish(fast) {
    const el = document.getElementById('intro'); if (!el || done) return; done = true;
    const root = document.documentElement;
    const logo = el.querySelector('.in-logo'), target = document.querySelector('#brand-logo svg') || document.getElementById('brand-logo');
    root.classList.add('intro-reveal');
    if (logo && target && !fast) {
      const a = logo.getBoundingClientRect(), b = target.getBoundingClientRect();
      // il disegno ha un margine di 4 unità su 72 in più del logo della barra (64): si tiene conto per farli coincidere
      const s = (b.width / 64) * 72 / a.width;
      el.style.setProperty('--tx', (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px');
      el.style.setProperty('--ty', (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px');
      el.style.setProperty('--ts', s.toFixed(3));
    }
    el.classList.add('out');
    setTimeout(() => el.classList.add('gone'), fast ? 0 : 420);
    setTimeout(() => { el.remove(); root.classList.remove('intro-on', 'intro-reveal'); }, fast ? 320 : 900);
  }
  function start() {
    const el = document.getElementById('intro'); if (!el) return;
    // durata fissa: finisce da sola, poi la pagina entra «a comparsa»
    setTimeout(() => finish(false), 2600);
  }
  return { start, finish };
})();

// la costruzione della home è un passo a sé, dopo l'esecuzione del programma: nessun blocco lungo all'avvio
Intro.start();
setTimeout(() => { initApp(); Later.idle(); setTimeout(() => { try { BgFlow.start(); } catch (e) { console.warn(e); } }, 700); }, 0);
