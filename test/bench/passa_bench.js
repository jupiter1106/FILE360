// Passa file: collegamento senza server tra due browser separati (computer e telefono) sulla stessa macchina.
// Misura: lunghezza del QR, tempo dal QR al canale aperto, velocità e integrità su 1 GB nei due sensi, richieste di rete.
const { chromium, open } = require('../lib');
(async () => {
  const b = await chromium.launch(); let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
  const { page: pc, ctx: c1 } = await open(b, 'desk1440'); const { page: tel, ctx: c2 } = await open(b, 'iphoneSE');
  const esterne = []; for (const c of [c1, c2]) c.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) esterne.push(r.url()); });
  const APP = pc.url().split('#')[0];
  await pc.evaluate(() => { location.hash = 'passa'; }); await pc.waitForSelector('.pa-qr-img svg', { timeout: 20000 });
  const url1 = await pc.getAttribute('.pa-qr-img', 'data-url');
  ok(url1.length <= 200, `QR: ${url1.length} caratteri (soglia 200: si legge da lontano)`);
  await tel.goto(APP + '#' + url1.split('#')[1]); await tel.waitForSelector('.pa-abb', { timeout: 20000 });
  await pc.fill('.pa-in-abb', await tel.evaluate(() => Passa.linkAbbinamento())); await pc.locator('.pa-abb-in button', { hasText: 'Abbina' }).click();
  await pc.waitForSelector('.pa-stato', { timeout: 20000 }); await tel.waitForSelector('.pa-stato', { timeout: 20000 });
  const giro = async (da, nome, MB) => da.evaluate(async ({ nome, MB }) => {
    const n = MB * 1e6, u = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(u.subarray(i, Math.min(n, i + 65536)));
    const f = new File([u], nome), c = PassaSessione.canale, t0 = performance.now(); c.invia([f]);
    await new Promise(res => { const off = c.on((t, x) => { if (t === 'file' && x.nome === nome && ['consegnato', 'diverso', 'errore', 'interrotto'].includes(x.stato)) { off(); res(); } }); });
    const x = c.file.find(y => y.nome === nome), s = (performance.now() - t0) / 1000; return { stato: x.stato, s, mbs: MB / s };
  }, { nome, MB });
  const a = await giro(pc, 'giga-dal-computer.bin', 1000);
  ok(a.stato === 'consegnato' && a.mbs >= 20, `1 GB dal computer al telefono: ${a.stato}, ${a.s.toFixed(1)} s, ${a.mbs.toFixed(0)} MB/s (soglia 20 MB/s, impronta SHA-256 uguale)`);
  const r = await giro(tel, 'dal-telefono.bin', 300);
  ok(r.stato === 'consegnato' && r.mbs >= 20, `300 MB dal telefono al computer: ${r.stato}, ${r.s.toFixed(1)} s, ${r.mbs.toFixed(0)} MB/s`);
  // secondo collegamento: solo il QR
  await pc.locator('.pa-stato button', { hasText: 'Scollega' }).click(); await pc.waitForSelector('.pa-qr-img svg', { timeout: 20000 }); await tel.waitForSelector('.pa-big', { timeout: 20000 });
  const url2 = await pc.getAttribute('.pa-qr-img', 'data-url'), t0 = Date.now();
  await tel.goto(APP + '#' + url2.split('#')[1]); await tel.waitForSelector('.pa-stato', { timeout: 15000 });
  const ms = Date.now() - t0; ok(ms < 2000, `dal QR al collegamento la seconda volta: ${ms} ms (soglia 2 s)`);
  ok(!esterne.length, `richieste di rete fuori dal dispositivo: ${esterne.length ? esterne.slice(0, 3).join(', ') : 'nessuna'}`);
  ok(!pc.errs.length && !tel.errs.length, 'nessun errore nelle pagine' + [...pc.errs, ...tel.errs].join(' | '));
  await b.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
