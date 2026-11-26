// file360: la pagina, il codice e, dopo il primo uso, il motore OCR restano sul dispositivo (funziona anche senza rete).
// I file dell'utente non passano mai di qui: non vengono mai inviati né salvati.
const V = 'file360-dd521bd63338', OCR = 'file360-ocr', PRE = ["/", "/informazioni/", "/privacy/", "/termini/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/assets/app-1.12dbfb9f4e.js", "/assets/app-2.acc7e41455.js", "/assets/app-3.a8e29918d0.js", "/assets/app-4.2ca27e9a8d.js", "/assets/app-5.01aab1f127.js", "/assets/app-6.87ca385c4c.js", "/assets/later-0.b67f207c08.js", "/assets/later-1.4abc508921.js", "/assets/later-10.35368c0a33.js", "/assets/later-11.df18a4bacd.js", "/assets/later-12.9717748c55.js", "/assets/later-13.3c2fab64d1.js", "/assets/later-14.26fde54d45.js", "/assets/later-15.dca1c74174.js", "/assets/later-16.cb173cb5de.js", "/assets/later-17.233cd01539.js", "/assets/later-18.a912585fcf.js", "/assets/later-19.f29333e524.js", "/assets/later-2.03c57162f7.js", "/assets/later-20.652feca9cc.js", "/assets/later-21.f5bbc498b1.js", "/assets/later-22.853ad9ea7d.js", "/assets/later-23.f25b186b76.js", "/assets/later-24.e78af54072.js", "/assets/later-25.47c1514895.js", "/assets/later-26.f65e395b63.js", "/assets/later-27.3ae4467845.js", "/assets/later-28.433f44a0ba.js", "/assets/later-29.3b1940baba.js", "/assets/later-3.a71dfde86d.js", "/assets/later-30.f925fce315.js", "/assets/later-4.b64909114d.js", "/assets/later-5.07a3e18d23.js", "/assets/later-6.8c75f273f1.js", "/assets/later-7.98ff855259.js", "/assets/later-8.a407dd09b3.js", "/assets/later-9.d9a285cccb.js", "/assets/later-mappa.5e21d4e318.js", "/assets/later-pdfjs.b4a089553e.js", "/assets/lazy-pdfworker.38cde53119.js", "/assets/style.05641fccae.css"];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(PRE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== OCR).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const fromCache = (name, r) => caches.open(name).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || u.pathname === '/cloud.json') return;
  if (u.pathname.startsWith('/tess/')) { e.respondWith(fromCache(OCR, r)); return; }            // motore OCR e lingue
  if (u.pathname.startsWith('/assets/')) { e.respondWith(fromCache(V, r)); return; }           // codice con l'impronta nel nome
  if (r.mode === 'navigate') {                                                                  // le pagine: dalla rete, altrimenti dalla memoria
    e.respondWith(fetch(r).then(res => { if (res.ok) caches.open(V).then(c => c.put(u.pathname, res.clone())); return res; })
      .catch(() => caches.open(V).then(c => c.match(u.pathname).then(hit => hit || c.match('/')))));
  }
});
