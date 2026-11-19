// Misura delle «prove» del rilevatore su testi umani e di Claude (corpus locali, non nel repository):
//   node tools/rilevaai_misura.js umani.json fuori.json claude.json
// umani.json: [{text}] (PAISÀ), fuori.json: {nome: [testo]} (Il Post, Fanpage), claude.json: [{text}].
// Una prova «forte» o «certa» su un testo umano è un falso allarme: devono essere zero.
const R = require('../src/rilevaai.js'), fs = require('fs'), [u, f, c] = process.argv.slice(2).map(p => JSON.parse(fs.readFileSync(p)));
const umani = [...u.map(x => x.text || x), ...Object.values(f).flat()];
const allarmi = umani.filter(t => R.prove(t).some(p => p.forza !== 'indizio'));
console.log(`testi umani con una prova forte o certa: ${allarmi.length}/${umani.length}`);
console.log(`testi di Claude con una prova nel solo testo: ${c.filter(x => R.prove(x.text).some(p => p.forza !== 'indizio')).length}/${c.length}`);
