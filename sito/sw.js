// file360: la pagina, il codice e, dopo il primo uso, il motore OCR restano sul dispositivo (funziona anche senza rete).
// I file dell'utente non passano mai di qui: non vengono mai inviati né salvati.
const V = 'file360-5165e71aed23', OCR = 'file360-ocr', PRE = ["/", "/informazioni/", "/privacy/", "/termini/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/assets/app-1.d4f6147eb6.js", "/assets/app-2.acc7e41455.js", "/assets/app-3.a8e29918d0.js", "/assets/app-4.2ca27e9a8d.js", "/assets/app-5.01aab1f127.js", "/assets/app-6.e90909dd28.js", "/assets/later-0.b67f207c08.js", "/assets/later-1.4abc508921.js", "/assets/later-10.35368c0a33.js", "/assets/later-11.df18a4bacd.js", "/assets/later-12.9717748c55.js", "/assets/later-13.3c2fab64d1.js", "/assets/later-14.26fde54d45.js", "/assets/later-15.af41696fa3.js", "/assets/later-16.79cfcb7019.js", "/assets/later-17.233cd01539.js", "/assets/later-18.aa40f1a9d8.js", "/assets/later-19.305707957a.js", "/assets/later-2.df57295380.js", "/assets/later-20.602b4425f9.js", "/assets/later-21.f5bbc498b1.js", "/assets/later-22.853ad9ea7d.js", "/assets/later-23.f25b186b76.js", "/assets/later-24.37e2191d68.js", "/assets/later-3.a71dfde86d.js", "/assets/later-4.b64909114d.js", "/assets/later-5.07a3e18d23.js", "/assets/later-6.8c75f273f1.js", "/assets/later-7.08b825e400.js", "/assets/later-8.a407dd09b3.js", "/assets/later-9.d9a285cccb.js", "/assets/later-autentica.dc7408d16b.js", "/assets/later-contratti.8a5b98ced3.js", "/assets/later-incassi.69c8644400.js", "/assets/later-leggicontratto.d558ac33ca.js", "/assets/later-mappa.3aa73ee421.js", "/assets/later-passa.caf83256d0.js", "/assets/later-pdfjs.b4a089553e.js", "/assets/later-rilevaai.2b3f10e34f.js", "/assets/later-vendite.c93a102dc0.js", "/assets/lazy-pdfworker.38cde53119.js", "/assets/style.e791181248.css"];
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
