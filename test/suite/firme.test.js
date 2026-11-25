// Firme digitali e P7M: si aprono e si verificano i file firmati (busta .p7m CAdES e firma dentro il PDF PAdES).
// La firma digitale e le ricevute Entratel (.rcc) non sono più strumenti del prodotto: non devono comparire.
// (firmato-*.pdf*: firmati con un certificato di prova «BIANCHI ANNA (PROVA)» valido fino a novembre 2027)
const { chromium, open, idle, fx } = require('../lib');
const ok = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const browser = await chromium.launch(); let fail = 0;
  const step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n      ', String(e.message).split('\n')[0]); } };
  const { page } = await open(browser, 'desk1280');
  await step('firma digitale e ricevute .rcc non ci sono più (home, ricerca, indirizzo)', async () => {
    ok(await page.locator('.tl-w[data-id="firma"], .tl-w[data-id="ricevute"]').count() === 0, 'scheda ancora in home');
    ok(await page.locator('.tl-w[data-id="firme"]').count() === 1, 'manca «Firme digitali e P7M»');
    await page.fill('.home-search-input', 'firma'); await page.waitForTimeout(200);
    const vis = await page.evaluate(() => [...document.querySelectorAll('.tl-w:not([hidden])')].map(w => w.dataset.id));
    ok(vis.includes('firme') && !vis.includes('firma'), JSON.stringify(vis));
    await page.fill('.home-search-input', '');
    ok(await page.evaluate(() => typeof TOOLS !== 'undefined' ? !TOOLS.firma && !TOOLS.ricevute : true), 'strumenti ancora registrati');
  });
  for (const [label, f, who] of [['busta .p7m (CAdES)', 'firmato-cades.pdf.p7m', /BIANCHI ANNA/], ['firma dentro il PDF (PAdES)', 'firmato-pades.pdf', /BIANCHI ANNA/], ['delibera .p7m', 'delibera.pdf.p7m', /\S/]]) await step(`${label}: si verifica e il PDF si apre`, async () => {
    await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = 'firme'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
    await page.locator('.tool .dz-input').first().setInputFiles(fx(f));
    await page.waitForSelector('.tool .ws', { timeout: 30000 }); await idle(page); await page.waitForTimeout(800);
    const t = await page.locator('.tool .ws').textContent();
    ok(who.test(t), 'il firmatario non compare nella verifica'); ok(!/alterat|manomess/i.test(t), 'la firma risulta non integra');
    if (f.endsWith('.p7m')) ok(await page.locator('.tool .ws button, .tool .ws a', { hasText: /Apri|Scarica|PDF/ }).count() > 0, 'manca il modo di aprire il PDF contenuto');
    await page.evaluate(() => { location.hash = ''; }); await page.waitForTimeout(400);
  });
  // certificato fatto in casa che si dichiara «qualificato»: mai «valida», si dice che il certificatore non è riconosciuto
  const open1 = async f => { await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = 'firme'; }, 40); }); await page.waitForSelector('.tool .dz-input', { state: 'attached' }); await page.locator('.tool .dz-input').first().setInputFiles(f); await page.waitForSelector('.tool .sig-head', { timeout: 30000 }); await idle(page); await page.waitForTimeout(600); return page.locator('.tool .ws').innerText(); };
  await step('firma con certificato inventato («qualificato» per finta): integra ma certificatore non riconosciuto, mai «valida»', async () => {
    const t = await open1(require('path').join(__dirname, '..', 'stress', 'corpus', 'firma-falsa.pdf.p7m'));
    const head = await page.locator('.tool .sig-head b').innerText();
    ok(/certificatore non è riconosciuto/.test(head) && !/sono valide|^Firma valida/.test(head), 'esito: ' + head);
    ok(/Rilasciato da un ente che non è nell’elenco ufficiale/.test(t), 'manca il controllo del certificatore');
    ok(/Il documento non è stato modificato dopo la firma/.test(t), 'integrità');
  });
  await step('firma manomessa: la frase del controllo dice che il documento è stato modificato (non solo l’icona)', async () => {
    const t = await open1(require('path').join(__dirname, '..', 'stress', 'corpus', 'firma-manomessa.pdf.p7m'));
    ok(/Il documento è stato modificato dopo la firma/.test(t) && !/Il documento non è stato modificato dopo la firma/.test(t), 'controllo: ' + t.slice(0, 300));
  });
  await step('certificatore presente nell’elenco ufficiale: «Rilasciato da un certificatore qualificato» e niente avviso di certificatore sconosciuto', async () => {
    await page.evaluate(c => { window.__tslTest = [{ n: 'Certificatore di prova', t: 'QC', c, h: [['granted', '2020-01-01T00:00:00Z']] }]; }, 'MIIC0TCCAbmgAwIBAgIBAjANBgkqhkiG9w0BAQsFADAsMR0wGwYDVQQDExRCSUFOQ0hJIEFOTkEgKFBST1ZBKTELMAkGA1UEBhMCSVQwHhcNMjYxMTE1MjE1OTA5WhcNMjcxMTE2MjE1OTA5WjAsMR0wGwYDVQQDExRCSUFOQ0hJIEFOTkEgKFBST1ZBKTELMAkGA1UEBhMCSVQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDLFxoufIhtk6i/DEHykrsz8HT0N0IlMS+9UpzzxY57PuBErpGkC4QZkFOvyoWHAgCTtS7FAw1Mbr+ndVPygQNyJt2UvmLHd6imW/yUwFVKQrZwhz0Idcis9AJ51m1rtX2BukIHMPU2CGhfWS/x1sKlq7GykyGPNr+1phJWrAOQSfKVGctop+O/d6+5cvDZiMXZ+YbiMoUD4C5hogO4nCf6tlnTCGhs3NgLkXPR5Asj5dqEUzzcEQAdYJhtQtbhoH0h/QvDdUlD0u6jImUKYU/wBon8+wO3GyEZDfvDkF9onFhMXdEGKPe5KGJ3SR9bqJEY3elte7xe4caFZcOAuec/AgMBAAEwDQYJKoZIhvcNAQELBQADggEBAJ2oDduupH9jf3UgRunBxKHVowZy+PI8IC0A3DSgUzKWAznImgfsaql/sVdFB0gKF7ihKbIGnijffq4HE5+lc5TZ72Q5ucJEN+tBqqfeSsSyTK4RtJkokOTj2PtIDE1DlyP1EJrcaS12r2ZAgCUFLIM+me9sMvhW0sel63dxRNsr5g8qfmmyI9Kl+EQLCK2GzizKI+P0ciCLGIneYXGVOrcujGwc58tN9VOJSSGoCLO96u97C7U5r+tWSpK6krrlgF6iB9TFV7LoYqKvh0WXXQfKInQlwe7J2V5bytWIQsfM39UAMMOZIEwGecM7FQBKELRvou+DgKEeOoB0ZEmHQP0=');
    const t = await open1(fx('firmato-cades.pdf.p7m'));
    ok(/Rilasciato da un certificatore qualificato \(Certificatore di prova\)/.test(t) && !/non è nell’elenco ufficiale/.test(t), 'controllo: ' + t.slice(0, 400));
  });
  // revoca con le informazioni incluse nel file (test/bench/make_revoca.py): OCSP nella firma, CRL nella busta, OCSP nel DSS del PDF
  const R = f => require('path').join(__dirname, '..', 'bench', 'tools', f);
  await step('revoca: risposta OCSP inclusa (CAdES) → «non revocato al momento della firma»', async () => {
    const t = await open1(R('revoca-ocsp.pdf.p7m'));
    ok(/Certificato non revocato al momento della firma \(risposta del certificatore inclusa nel file\)/.test(t), 'controllo: ' + t.slice(0, 500));
  });
  await step('revoca: certificato revocato prima della firma (CRL nella busta) → firma NON valida, con la data', async () => {
    const t = await open1(R('revoca-revocata.pdf.p7m'));
    const head = await page.locator('.tool .sig-head b').innerText();
    ok(/NON valid|non valid/i.test(head), 'esito: ' + head); ok(/revocato prima della firma/.test(t), 'manca il motivo');
  });
  await step('revoca: PAdES con il DSS (PAdES-LTV) → «non revocato»', async () => {
    const t = await open1(R('revoca-pades.pdf'));
    ok(/Certificato non revocato al momento della firma/.test(t), 'controllo: ' + t.slice(0, 500));
  });
  await step('revoca: risposta OCSP manomessa → non creduta (non verificabile), mai «non revocato»', async () => {
    const fs = require('fs'), b = Buffer.from(fs.readFileSync(R('revoca-ocsp.pdf.p7m')));
    // una cifra di una data dentro la risposta OCSP firmata (l'ultima GeneralizedTime del file: la risposta è in coda)
    const at = b.lastIndexOf(Buffer.from([0x18, 0x0f])); ok(at > 0, 'data della risposta non trovata'); b[at + 2 + 3] = b[at + 2 + 3] === 0x39 ? 0x38 : b[at + 2 + 3] + 1;
    const tmp = require('path').join(require('os').tmpdir(), 'revoca-manomessa.pdf.p7m'); fs.writeFileSync(tmp, b);
    const t = await open1(tmp);
    ok(!/Certificato non revocato al momento della firma/.test(t), 'risposta manomessa creduta');
    ok(/non verificabili/.test(t), 'manca l’avviso: ' + t.slice(0, 500));
  });
  if (page.errs.length) { fail++; console.log('  ✗ errori JavaScript:', page.errs.slice(0, 3).join(' | ')); }
  await browser.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
