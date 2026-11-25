// Caratteristiche del testo per il modello statistico del rilevatore AI: usa le funzioni di src/rilevaai.js,
// così addestramento e programma calcolano esattamente gli stessi numeri.
// Uso: node tools/rilevaai_feat.js ingresso.jsonl uscita.bin   (RILEVA_BITS=20 per la dimensione dello spazio)
//   ingresso: una riga JSON per testo {"text": "..."}; uscita: per ogni testo [n uint32][n indici uint32][n valori float32].
'use strict';
const R = require('../src/rilevaai.js');
const BITS = +process.env.RILEVA_BITS || 20;
const feat = (t, nomi) => R.featStile(t, BITS, nomi);
const finestre = t => R.finestreStile(t).map(f => f.t);
module.exports = { norm: R.normStile, feat, finestre, BITS };
if (require.main === module) {
  const fs = require('fs');
  const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const bufs = [];
  for (const r of rows) {
    const m = feat(r.text), n = m.size;
    const b = Buffer.alloc(4 + 8 * n); b.writeUInt32LE(n, 0);
    let o = 4; for (const k of m.keys()) { b.writeUInt32LE(k, o); o += 4; }
    for (const v of m.values()) { b.writeFloatLE(v, o); o += 4; }
    bufs.push(b);
  }
  fs.writeFileSync(process.argv[3], Buffer.concat(bufs));
  console.log(rows.length + ' testi');
}
