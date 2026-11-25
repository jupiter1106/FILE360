// Crea i file di prova (tutti sintetici: nessun dato reale) usando le librerie già dentro Officina PDF.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'fixtures');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(process.argv[2] || 'dist/file360.html'));
  await page.waitForSelector('.intent');
  const files = await page.evaluate(async () => {
    const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const out = {};
    const LOREM = 'Il presente contratto disciplina i rapporti tra le parti in relazione alla fornitura dei servizi descritti. Le parti convengono quanto segue e si impegnano a rispettarne ogni clausola in buona fede.';
    async function textPdf(pages, extra) {
      const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
      for (let p = 1; p <= pages; p++) {
        const pg = d.addPage([595.28, 841.89]);
        pg.drawText('Contratto di fornitura n. 145/2026', { x: 56, y: 780, size: 18, font: fb });
        pg.drawText('Pagina ' + p + ' di ' + pages, { x: 56, y: 756, size: 10, font: f, color: rgb(.4, .4, .4) });
        let y = 720;
        for (let k = 0; k < 14; k++) { const words = LOREM.split(' '); let line = ''; for (const w of words) { if ((line + ' ' + w).length > 88) { pg.drawText(line, { x: 56, y, size: 11, font: f }); y -= 16; line = w; } else line = line ? line + ' ' + w : w; } pg.drawText(line, { x: 56, y, size: 11, font: f }); y -= 24; if (y < 120) break; }
        if (extra && p === 1) extra(pg, f, fb);
      }
      return d.save();
    }
    // 1) testo con dati personali finti (IBAN, codice fiscale, email, telefono: tutti inventati)
    out['contratto.pdf'] = await textPdf(3, (pg, f, fb) => {
      pg.drawRectangle({ x: 50, y: 60, width: 495, height: 86, color: rgb(1, 1, 1) });
      pg.drawText('Intestatario: Mario Rossi - Codice fiscale RSSMRA80A01H501U', { x: 56, y: 126, size: 11, font: f });
      pg.drawText('IBAN: IT60X0542811101000000123456', { x: 56, y: 108, size: 11, font: f });
      pg.drawText('Email: mario.rossi@example.com - Tel. 06 5550123', { x: 56, y: 90, size: 11, font: f });
      pg.drawText('Importo: 1.250,00 euro - Data: 12/03/2026', { x: 56, y: 72, size: 11, font: f });
    });
    out['appunti-2.pdf'] = await textPdf(2);
    out['lungo-300.pdf'] = await textPdf(300);
    // 2) scansione: pagine come immagini, leggermente storte, con rumore
    async function scanCanvas(p, w = 1240, hgt = 1754, skew = 1.2) {
      const c = document.createElement('canvas'); c.width = w; c.height = hgt; const x = c.getContext('2d');
      x.fillStyle = '#f3f0e8'; x.fillRect(0, 0, w, hgt); x.save(); x.translate(w / 2, hgt / 2); x.rotate(skew * Math.PI / 180); x.translate(-w / 2, -hgt / 2);
      x.fillStyle = '#222'; x.font = 'bold 40px Georgia'; x.fillText('Verbale di assemblea ordinaria', 110, 180);
      x.font = '26px Georgia'; let y = 260; for (let k = 0; k < 30; k++) { x.fillText(('Riga ' + (k + 1) + ' della pagina ' + p + '. ' + LOREM).slice(0, 78), 110, y); y += 44; }
      x.restore();
      const id = x.getImageData(0, 0, w, hgt), a = id.data; let s = 12345 + p; for (let i = 0; i < a.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = (s % 23) - 11; a[i] += n; a[i + 1] += n; a[i + 2] += n; } x.putImageData(id, 0, 0);
      return c;
    }
    const toBytes = (c, type, q) => new Promise(r => c.toBlob(async b => r(new Uint8Array(await b.arrayBuffer())), type, q));
    { const d = await PDFDocument.create(); for (let p = 1; p <= 2; p++) { const c = await scanCanvas(p); const img = await d.embedJpg(await toBytes(c, 'image/jpeg', .8)); d.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 }); } out['scansione.pdf'] = await d.save(); }
    // 3) pesante: immagini PNG grandi e rumorose (da comprimere)
    { const d = await PDFDocument.create(); for (let p = 1; p <= 4; p++) { const c = await scanCanvas(p, 2480, 3508, 0); const img = await d.embedJpg(await toBytes(c, 'image/jpeg', .97)); d.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 }); } out['pesante.pdf'] = await d.save(); }
    // 4) foto di un documento (JPG)
    out['foto-documento.jpg'] = await toBytes(await scanCanvas(1, 1240, 1754, -3), 'image/jpeg', .85);
    // 5) modulo con campi veri
    { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const pg = d.addPage([595.28, 841.89]); const form = d.getForm();
      pg.drawText('Richiesta di iscrizione', { x: 56, y: 780, size: 18, font: f });
      [['Nome', 'nome'], ['Cognome', 'cognome'], ['Codice fiscale', 'cf'], ['Email', 'email']].forEach(([l, n], i) => { const y = 720 - i * 46; pg.drawText(l, { x: 56, y: y + 6, size: 11, font: f }); const t = form.createTextField(n); t.addToPage(pg, { x: 180, y, width: 300, height: 24 }); });
      const cb = form.createCheckBox('privacy'); pg.drawText('Accetto il trattamento dei dati', { x: 84, y: 520, size: 11, font: f }); cb.addToPage(pg, { x: 56, y: 516, width: 16, height: 16 });
      out['modulo.pdf'] = await d.save(); }
    // 6) file rotto e file che non è un PDF
    out['rotto.pdf'] = out['contratto.pdf'].slice(0, 900);
    out['finto.pdf'] = new TextEncoder().encode('Questo non è un PDF, è un file di testo rinominato.');
    // 7) protetto da password («segreta»)
    out['protetto.pdf'] = await PdfCrypt.encrypt(out['appunti-2.pdf'], { userPw: 'segreta', ownerPw: 'segreta' });
    // 8) fattura elettronica sintetica
    out['IT01234567890_FPR01.xml'] = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdTrasmittente><ProgressivoInvio>FPR01</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>ABC1234</CodiceDestinatario></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>ALFA SERVIZI SRL</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>VIA ROMA 1</Indirizzo><CAP>00100</CAP><Comune>ROMA</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>BETA COMMERCIALE SPA</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>CORSO ITALIA 22</Indirizzo><CAP>20100</CAP><Comune>MILANO</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede></CessionarioCommittente></FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>2026-03-12</Data><Numero>145/2026</Numero><ImportoTotaleDocumento>1525.00</ImportoTotaleDocumento><Causale>Consulenza marzo 2026</Causale></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Consulenza amministrativa</Descrizione><Quantita>10.00</Quantita><PrezzoUnitario>125.00</PrezzoUnitario><PrezzoTotale>1250.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1250.00</ImponibileImporto><Imposta>275.00</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo></DatiBeniServizi>
<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2026-04-11</DataScadenzaPagamento><ImportoPagamento>1525.00</ImportoPagamento></DettaglioPagamento></DatiPagamento></FatturaElettronicaBody></p:FatturaElettronica>`);
    // 9) P7M: il PDF firmato con un certificato di prova creato qui (autofirmato)
    try {
      await need('forge');
      const keys = forge.pki.rsa.generateKeyPair(1024), cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey; cert.serialNumber = '01'; cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
      const attrs = [{ name: 'commonName', value: 'ROSSI MARIO (PROVA)' }, { name: 'countryName', value: 'IT' }, { name: 'organizationName', value: 'Certificato di prova' }];
      cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
      const p7 = forge.pkcs7.createSignedData(); let s = ''; const src = out['appunti-2.pdf']; for (let i = 0; i < src.length; i++) s += String.fromCharCode(src[i]);
      p7.content = forge.util.createBuffer(s); p7.addCertificate(cert);
      p7.addSigner({ key: keys.privateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
      p7.sign(); const der = forge.asn1.toDer(p7.toAsn1()).getBytes(); const u = new Uint8Array(der.length); for (let i = 0; i < der.length; i++) u[i] = der.charCodeAt(i);
      out['delibera.pdf.p7m'] = u;
    } catch (e) { out['_p7m_error.txt'] = new TextEncoder().encode(String(e && e.stack || e)); }
    const res = {}; for (const k in out) res[k] = b64(out[k]); return res;
  });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, b] of Object.entries(files)) { fs.writeFileSync(path.join(OUT, name), Buffer.from(b, 'base64')); console.log(name, fs.statSync(path.join(OUT, name)).size); }
  await browser.close();
})();
