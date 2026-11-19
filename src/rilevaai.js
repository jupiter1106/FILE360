/* =====================================================================
   Rilevatore di testo AI (analisi e misure in RILEVATORE-AI.md)
   1. prove certe: impronte dei programmi che gli assistenti AI usano per creare i file (python-docx, docx.js,
      python-pptx, PptxGenJS, openpyxl, ReportLab…), nomi di assistenti nei metadati, caratteri delle chat, testo nascosto;
   2. prove forti: residui di una chat (Markdown, «Spero ti sia utile», «Fammi sapere…»);
   3. stile: modello statistico (n-grammi, regressione logistica) addestrato su 970 testi di Claude (Haiku, Sonnet,
      Opus) e oltre 40.000 testi umani scritti prima degli assistenti AI; soglia tarata per gruppo di testi umani.
      È una valutazione, non una prova: lo strumento lo dice sempre.
   Le prove e lo stile restano separati e non si mescolano in un solo numero.
   Nessuna AI esterna, nessuna richiesta di rete: il modello è un insieme di pesi dentro la pagina, tutto è calcolo locale.
   ===================================================================== */
const RilevaAI = (() => {
  /* ---------- testo: parole, frasi, paragrafi ---------- */
  const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;
  const words = t => t.match(WORD) || [];
  // frasi: si tagliano dopo . ! ? … seguiti da spazio e maiuscola (o fine riga); righe di elenco e titoli sono unità a sé
  function sentences(t) {
    const out = [];
    for (const line of t.split(/\n+/)) {
      const l = line.trim(); if (!l) continue;
      const parts = l.split(/(?<=[.!?…])["»”)]?\s+(?=["«“(]?[\p{Lu}\d])/u);
      for (const p of parts) { const n = words(p).length; if (n) out.push({ t: p, n }); }
    }
    return out;
  }
  const paragraphs = t => t.split(/\n\s*\n|\n(?=\s*(?:[-•*✅👉▪]|\d+[.)])\s)/).map(p => p.trim()).filter(p => words(p).length);
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) : 0; };
  const count = (t, re) => (t.match(re) || []).length;

  /* ---------- lessico: i tratti ricorrenti nei testi di Claude (e dei modelli simili) ----------
     Parole valutative e di collegamento che i modelli usano molto più delle persone; ognuna è contata e, nel testo,
     evidenziata. Da sole non dicono nulla: contano la loro densità e l'insieme con le altre misure. */
  const LEX_EVAL = ['fondamentale', 'fondamentali', 'cruciale', 'cruciali', 'essenziale', 'essenziali', 'significativo', 'significativa', 'significativi', 'significative', 'significativamente', 'prezioso', 'preziosa', 'preziosi', 'preziose', 'consapevole', 'consapevoli', 'consapevolezza', 'sfida', 'sfide', 'opportunità', 'equilibrio', 'approccio', 'panorama', 'contesto', 'dinamiche', 'efficace', 'efficaci', 'concreto', 'concreta', 'concreti', 'concrete', 'concretamente', 'favorire', 'favorisce', 'garantire', 'garantisce', 'promuovere', 'valorizzare', 'contribuire', 'contribuisce', 'rappresenta', 'rappresentano', 'offre', 'offrono', 'permette', 'permettono', 'consente', 'consentono', 'ambito', 'aspetto', 'aspetti', 'percorso', 'risorse', 'strumento', 'strumenti', 'qualità', 'importante', 'importanti', 'profondamente', 'evidente', 'notevole', 'particolarmente', 'semplicemente', 'naturalmente', 'certamente', 'inoltre', 'tuttavia', 'pertanto', 'infine', 'dunque', 'insomma'];
  const LEX_PHRASE = [/\bvale la pena\b/gi, /\bnon (?:è|si tratta di) solo\b/gi, /\bnon solo\b[^.]{1,80}\bma anche\b/gi, /\bè importante (?:notare|sottolineare|ricordare|considerare)\b/gi, /\bin (?:sintesi|definitiva|conclusione|altre parole|pratica|particolare)\b/gi, /\bda un lato\b/gi, /\bdall['’]altro\b/gi, /\bun ruolo (?:fondamentale|centrale|cruciale|chiave|importante|decisivo)\b/gi, /\bnel corso del tempo\b/gi, /\bsempre più\b/gi, /\bin modo (?:chiaro|efficace|semplice|concreto|significativo|consapevole)\b/gi, /\bgiocare? un ruolo\b/gi, /\bmettere al centro\b/gi, /\bal tempo stesso\b/gi, /\bnon mancano\b/gi, /\bdi conseguenza\b/gi, /\bper questo\b/gi, /\bin un mondo\b/gi];
  const EVAL = new Set(LEX_EVAL);
  // segni di scrittura umana non curata (i modelli non li producono): accenti sbagliati, abbreviazioni, spazi
  const HUMAN = [/\b(?:perchè|poichè|affinchè|benchè|finchè|nè|pò|qual'è|qual’è|un'altro|un’altro|xk|xké|xke|cmq|nn|ke|qlc|qlcs|tvb|grz|raga)\b/gi, /[!?]{2,}/g, /\.{4,}/g, /\b(?:boh|mah|bho|beh|uff|vabbè|vabbe|ahah\w*|ahaha\w*|lol)\b/gi, /:[)(DP]|;\)/g];

  /* ---------- misure di stile (le stesse in addestramento e nel programma) ----------
     Prima delle misure il testo si «appiattisce» allo stesso modo per tutti: righe unite, segni di elenco e Markdown
     tolti, un punto in fondo alle righe che non l'hanno (titoli, voci di elenco), lo spazio dopo il punto. Così
     l'impaginazione (che dipende da come il testo è stato copiato, non da chi l'ha scritto) non pesa sull'indice:
     i residui di Markdown e di chat sono prove a parte. */
  function piatto(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => l.replace(/^#{1,6}\s+/, '').replace(/^(?:[-•*✅👉▪]|\d+[.)])\s+/u, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`{1,3}/g, ''))
      .map(l => /[.!?:;…»"”)]$/.test(l) ? l : l + '.').join(' ')
      .replace(/([.!?])(?=\p{Lu})/gu, '$1 ').replace(/(\p{Ll})(\p{Lu}\p{Ll}{2,})/gu, '$1. $2').replace(/\s{2,}/g, ' ');
  }
  // tutte le misure calcolate (alcune solo informative); il modello ne usa un sottoinsieme (MODEL.feats): restano fuori
  // quelle che dipendono dal genere del testo più che da chi lo scrive (prima persona, emoji, lunghezza media delle frasi,
  // parentesi, punto e virgola delle liste, virgolette)
  const FEATS = ['sentMean', 'sentCv', 'emdash', 'colon', 'semicolon', 'excl', 'quest', 'paren', 'ellipsis', 'caporali', 'mattr', 'wordLen', 'longWords', 'first', 'second', 'human', 'emoji', 'evalLex', 'phrases', 'triads', 'connStart', 'commaSent'];
  function features(text) {
    const t = piatto(text);
    const W = words(t), n = Math.max(1, W.length), k = 1000 / n;
    const S = sentences(t), sl = S.map(s => s.n), P = paragraphs(t).map(p => words(p).length);
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
    const lw = W.map(w => w.toLowerCase());
    // diversità lessicale stabile rispetto alla lunghezza: media del rapporto tipi/parole su finestre di 50
    let mattr = 0; if (lw.length >= 50) { let acc = 0, c = 0; for (let i = 0; i + 50 <= lw.length; i += 10) { acc += new Set(lw.slice(i, i + 50)).size / 50; c++; } mattr = acc / c; } else mattr = new Set(lw).size / n;
    const first = lw.filter(w => /^(?:io|mi|me|mio|mia|miei|mie|ho|avevo|ero|noi|ci|nostro|nostra|abbiamo|eravamo)$/.test(w)).length;
    const second = lw.filter(w => /^(?:tu|ti|te|tuo|tua|tuoi|tue|vuoi|puoi|hai|sei|fammi|scrivimi|dimmi)$/.test(w)).length;
    const human = HUMAN.reduce((a, re) => a + count(t, re), 0);
    const evalLex = lw.filter(w => EVAL.has(w)).length, phrases = LEX_PHRASE.reduce((a, re) => a + count(t, re), 0);
    const triads = count(t, /\b\p{L}{3,}(?: \p{L}+)?, \p{L}{3,}(?: \p{L}+)? e \p{L}{3,}/gu);
    const connStart = S.filter(s => /^(?:Inoltre|Tuttavia|Infine|Naturalmente|Infatti|Pertanto|Dunque|Insomma|In conclusione|In sintesi|In definitiva|Per questo|Detto questo|In altre parole|Allo stesso tempo|Al tempo stesso|D['’]altra parte|Dall['’]altro lato|Da un lato)\b/.test(s.t)).length;
    const commas = count(t, /,/g);
    return {
      sentMean: mean(sl), sentCv: mean(sl) ? sd(sl) / mean(sl) : 0, paraCv: mean(P) ? sd(P) / mean(P) : 0,
      emdash: (count(t, /—/g) + count(t, / – /g)) * k, colon: count(t, /:(?!\d)/g) * k, semicolon: count(t, /;/g) * k,
      excl: count(t, /!/g) * k, quest: count(t, /\?/g) * k, paren: count(t, /\(/g) * k, ellipsis: (count(t, /\.\.\./g) + count(t, /…/g)) * k,
      caporali: count(t, /[«»]/g) * k,
      bullets: lines.length ? lines.filter(l => /^(?:[-•*✅👉▪]|\d+[.)])\s/u.test(l)).length / lines.length : 0,
      mdBold: count(t, /\*\*[^*\n]+\*\*/g) * k, headings: lines.length ? lines.filter(l => /^#{1,6}\s/.test(l) || (l.length < 70 && !/[.!?;:,]$/.test(l) && words(l).length <= 9 && words(l).length >= 2)).length / lines.length : 0,
      mattr, wordLen: mean(W.map(w => w.length)), longWords: W.filter(w => w.length >= 10).length / n,
      first: first * k, second: second * k, human: human * k, emoji: count(t, /\p{Extended_Pictographic}/gu) * k,
      evalLex: evalLex * k, phrases: phrases * k, triads: S.length ? triads / S.length : 0, connStart: S.length ? connStart / S.length : 0, commaSent: S.length ? commas / S.length : 0,
    };
  }

  /* =====================================================================
     1. PROVE CERTE
     ===================================================================== */
  // programmi che gli assistenti AI usano per creare i file (impronte verificate creando un file con ciascuno)
  const GENERATORI = [
    { re: /generated by python-docx/i, campo: 'description', nome: 'python-docx', cosa: 'una libreria di programmazione Python per creare file Word' },
    { re: /^python-docx$/i, campo: 'creator', nome: 'python-docx', cosa: 'una libreria di programmazione Python per creare file Word' },
    { re: /^2013-12-23T23:15:00Z$/, campo: 'created', nome: 'python-docx (data di creazione del suo modello)', cosa: 'la data fissa del modello di python-docx: il file non è stato creato con Word' },
    { re: /^Un-named$/, campo: 'creator', nome: 'docx.js', cosa: 'una libreria JavaScript per creare file Word, usata anche dagli assistenti AI per produrre documenti' },
    { re: /generated using python-pptx/i, campo: 'description', nome: 'python-pptx', cosa: 'una libreria di programmazione Python per creare presentazioni' },
    { re: /^Steve Canny$/, campo: 'lastModifiedBy', nome: 'python-pptx (autore del suo modello)', cosa: 'il nome dell’autore del modello di python-pptx' },
    { re: /^2013-01-27T09:14:16Z$/, campo: 'created', nome: 'python-pptx (data di creazione del suo modello)', cosa: 'la data fissa del modello di python-pptx' },
    { re: /PptxGenJS/i, campo: '*', nome: 'PptxGenJS', cosa: 'una libreria JavaScript per creare presentazioni, usata anche dagli assistenti AI' },
    { re: /^openpyxl$|Openpyxl/i, campo: '*', nome: 'openpyxl', cosa: 'una libreria di programmazione Python per creare fogli Excel' },
    { re: /ReportLab/i, campo: '*', nome: 'ReportLab', cosa: 'una libreria di programmazione Python per creare PDF' },
    { re: /pdf-lib/i, campo: '*', nome: 'pdf-lib', cosa: 'una libreria JavaScript per creare PDF' },
    { re: /WeasyPrint/i, campo: '*', nome: 'WeasyPrint', cosa: 'un programma che trasforma pagine web in PDF, usato anche dagli assistenti AI' },
    { re: /^(?:fpdf|FPDF)\b|PyFPDF|fpdf2/i, campo: '*', nome: 'FPDF', cosa: 'una libreria di programmazione per creare PDF' },
    { re: /python-docx|docx4j|Aspose|Apache POI|XlsxWriter|exceljs/i, campo: '*', nome: 'una libreria di programmazione', cosa: 'un componente software, non un programma di videoscrittura' },
  ];
  const ASSISTENTI = /\b(?:claude|anthropic|chatgpt|openai|gpt-?[345]\w*|gemini|bard|copilot|mistral|le chat|perplexity|deepseek|llama|grok)\b/i;
  // caratteri tipografici delle interfacce delle chat (verificati sui loro fogli di stile pubblici, 19/11/2026)
  const FONT_UI = [
    { re: /^OpenAI Sans$/i, chi: 'ChatGPT' }, { re: /^S(?:ö|o)hne(?: Mono)?$/i, chi: 'ChatGPT (versioni precedenti)' },
    { re: /^Google Sans(?: Flex| Text)?$/i, chi: 'Gemini o altri servizi web di Google' },
    { re: /^KaTeX_/i, chi: 'una pagina web che disegna le formule con KaTeX, come le chat di ChatGPT, Gemini e Claude' },
  ];
  // frasi che l'assistente rivolge a chi chatta: copiate nel documento sono il residuo della conversazione
  const CHAT = [
    [/^\s*(?:certo|certamente|ottima domanda|ecco(?: a te)?|perfetto|assolutamente)[!,.:]?\s*(?:ecco|di seguito|qui)\b[^\n]{0,80}/gim, 'apertura tipica di una risposta in chat'],
    [/\bspero (?:che )?(?:questo |questa |queste |questi )?(?:ti |le |vi )?(?:sia|siano|possa|possano) (?:utile|utili|d['’]aiuto|di aiuto)\b[^\n]{0,40}/gi, 'saluto finale di una risposta in chat'],
    [/\bfammi sapere se (?:(?:vuoi|preferisci|desideri|hai bisogno)\b|ti (?:serve|servono)\b)[^\n]{0,60}/gi, 'invito rivolto a chi chatta'],
    [/\b(?:se (?:vuoi|preferisci|desideri), posso|vuoi che ti (?:prepari|scriva|aiuti|mostri|spieghi|faccia|dia)|posso (?:anche )?aiutarti a|sarò felice di aiutarti)\b[^\n]{0,60}/gi, 'offerta di aiuto tipica di un assistente'],
    [/\b(?:come (?:modello|assistente) (?:di linguaggio|linguistico|di intelligenza artificiale)|in quanto (?:intelligenza artificiale|modello (?:di linguaggio|linguistico))|sono un (?:modello di linguaggio|modello linguistico|assistente (?:virtuale|di intelligenza artificiale))|non ho accesso a (?:internet|informazioni in tempo reale)|la mia conoscenza (?:si ferma|è aggiornata))\b[^\n]{0,60}/gi, 'l’assistente parla di sé'],
    [/\b(?:ecco (?:una|la) (?:versione|bozza|proposta) (?:rivista|migliorata|aggiornata|più)|ho (?:riscritto|riformulato|corretto|migliorato) il testo)\b[^\n]{0,60}/gi, 'l’assistente presenta una sua versione del testo'],
    [/\[(?:inserisci|inserire|nome|cognome|data|luogo|azienda|indirizzo)[^\]\n]{0,40}\]/gi, 'segnaposto da compilare lasciato dall’assistente'],
  ];
  const MARKDOWN = [
    [/\*\*[^*\n]{2,80}\*\*/g, 'grassetto in Markdown (**testo**)'], [/^#{1,6}\s+\S[^\n]*/gm, 'titolo in Markdown (# Titolo)'],
    [/^```[^\n]*$/gm, 'blocco di codice in Markdown (```)'], [/^\|[^\n]*\|\s*\n\|\s*:?-{3,}/gm, 'tabella in Markdown'], [/\[[^\]\n]{1,60}\]\(https?:[^)\s]+\)/g, 'collegamento in Markdown'],
  ];
  // caratteri invisibili e anomali (nascondono testo o ingannano i controlli)
  const INVIS = [[/[​‌‍⁠]/g, 'spazio a larghezza zero'], [/(?!^)﻿/g, 'segno BOM in mezzo al testo'], [/[‪-‮⁦-⁩]/g, 'controllo di direzione del testo'], [/­/g, 'trattino morbido nascosto'], [/[⁢-⁤]/g, 'operatore matematico invisibile']];
  function tagNascosti(t) {   // «tag Unicode» (U+E0000–E007F): testo invisibile leggibile dai programmi
    const out = []; let cur = '';
    for (const ch of t) { const c = ch.codePointAt(0); if (c >= 0xE0020 && c <= 0xE007E) cur += String.fromCharCode(c - 0xE0000); else if (cur) { out.push(cur); cur = ''; } }
    if (cur) out.push(cur); return out.filter(x => x.trim());
  }
  // lettere cirilliche o greche dentro parole latine (sembrano uguali, ma sono altri caratteri)
  const omoglifi = t => (t.match(/\b(?=[\p{L}]*\p{Script=Latin})(?=[\p{L}]*[\p{Script=Cyrillic}\p{Script=Greek}])[\p{L}]{2,}\b/gu) || []);
  function prove(text, meta = {}) {
    const out = [];
    const add = (tipo, forza, titolo, dettaglio, esempi = []) => out.push({ tipo, forza, titolo, dettaglio, esempi });
    // metadati del file
    const M = meta.props || {};
    for (const g of GENERATORI) for (const [k, v] of Object.entries(M)) {
      if (!v || (g.campo !== '*' && g.campo !== k)) continue;
      const gia = out.some(o => o.tipo === 'programma' && (o.titolo.includes(g.nome.split(' ')[0]) || g.nome.startsWith('una ')));
      if (g.re.test(String(v)) && !gia) add('programma', 'certa', `File creato con ${g.nome}`, `Nei metadati (${k}: «${String(v).slice(0, 60)}») c’è l’impronta di ${g.cosa}. Chi scrive in Word, PowerPoint o Excel non la lascia: il file è stato generato da un programma, come fanno gli assistenti AI quando consegnano un documento.`);
    }
    for (const [k, v] of Object.entries(M)) if (v && ASSISTENTI.test(String(v))) add('assistente', 'certa', `Nome di un assistente AI nei metadati`, `Il campo «${k}» del file contiene «${String(v).slice(0, 80)}».`);
    for (const f of meta.fonts || []) { const u = FONT_UI.find(x => x.re.test(f)); if (u && !out.some(o => o.tipo === 'carattere' && o.titolo.includes(f))) add('carattere', 'certa', `Carattere «${f}» nel documento`, `È il carattere dell’interfaccia di ${u.chi}: resta nel documento quando si copia una risposta dalla chat e la si incolla mantenendo la formattazione.`); }
    for (const c of meta.commentAuthors || []) if (ASSISTENTI.test(c)) add('assistente', 'certa', 'Commento firmato da un assistente AI', `Nel file c’è un commento o una revisione con autore «${c}».`);
    // residui di chat e di Markdown nel testo
    const pulito = x => x.replace(/[\u{E0000}-\u{E007F}\u200B-\u200D\u2060\uFEFF]/gu, '').trim();
    const chat = []; for (const [re, what] of CHAT) for (const m of text.matchAll(re)) chat.push([pulito(m[0]), what]);
    const SPEC = /parla di sé|presenta una sua versione|apertura tipica/;
    if (chat.length) { const tipi = [...new Set(chat.map(c => c[1]))]; add('chat', tipi.length >= 2 || tipi.some(x => SPEC.test(x)) ? 'forte' : 'indizio', `Residui di una conversazione con un assistente (×${chat.length})`, `Frasi che un assistente AI rivolge a chi chatta, rimaste nel testo: ${tipi.join('; ')}.`, [...new Set(chat.map(c => c[0]))].slice(0, 4)); }
    const md = MARKDOWN.map(([re, what]) => [what, (text.match(re) || []).length]).filter(x => x[1]);
    const mdForte = md.some(([w]) => !/grassetto/.test(w)) || (md.find(([w]) => /grassetto/.test(w))?.[1] || 0) >= 3;
    if (md.length) add('markdown', mdForte ? 'forte' : 'indizio', 'Formattazione Markdown non interpretata', `Il testo contiene la sintassi con cui le chat AI scrivono la formattazione: ${md.map(([w, n]) => `${w} ×${n}`).join(', ')}. Compare quando si copia una risposta come testo semplice.`, (text.match(MARKDOWN[0][0]) || []).slice(0, 3));
    // caratteri invisibili e anomali
    const hid = tagNascosti(text); if (hid.length) add('nascosto', 'certa', 'Testo invisibile nascosto nei caratteri', 'Il testo contiene «tag Unicode», caratteri invisibili che nascondono un messaggio leggibile solo dai programmi. Messaggio nascosto:', hid.map(x => x.slice(0, 120)));
    for (const [re, what] of INVIS) { const n = (text.match(re) || []).length; if (n >= 3) add('invisibile', 'indizio', `Caratteri invisibili: ${what} (×${n})`, 'Non si vedono ma ci sono. Possono venire da una copia da pagine web o da strumenti che «ripuliscono» i testi; non sono una firma di Claude.'); }
    const om = omoglifi(text); if (om.length) add('omoglifi', 'indizio', `Lettere di altri alfabeti dentro parole italiane (×${om.length})`, 'Lettere cirilliche o greche identiche a quelle latine: un trucco usato per ingannare i controlli automatici.', om.slice(0, 5));
    return out;
  }

  /* =====================================================================
     3. CONFRONTO TRA TESTI: passaggi identici (8 o più parole di fila, senza punteggiatura né maiuscole)
     Un testo confrontato con altri (le risposte di Claude alla stessa consegna, i compiti della classe, una fonte):
     le sequenze identiche così lunghe non nascono per caso.
     ===================================================================== */
  const NG = 8;
  function parole(t) { const out = []; for (const m of String(t).matchAll(WORD)) out.push({ w: m[0].toLowerCase().replace(/’/g, "'"), a: m.index, b: m.index + m[0].length }); return out; }
  function confronta(testo, altri) {
    const A = parole(testo), res = [];
    for (const [k, alt] of altri.entries()) {
      const B = parole(alt.text), set = new Map();
      for (let i = 0; i + NG <= B.length; i++) { const key = B.slice(i, i + NG).map(x => x.w).join(' '); if (!set.has(key)) set.set(key, i); }
      const hit = new Uint8Array(A.length);
      for (let i = 0; i + NG <= A.length; i++) if (set.has(A.slice(i, i + NG).map(x => x.w).join(' '))) for (let j = i; j < i + NG; j++) hit[j] = 1;
      const tratti = []; let i = 0;
      while (i < A.length) { if (!hit[i]) { i++; continue; } let j = i; while (j < A.length && hit[j]) j++; tratti.push({ a: A[i].a, b: A[j - 1].b, n: j - i }); i = j; }
      const n = hit.reduce((x, y) => x + y, 0);
      res.push({ idx: k, nome: alt.nome, quota: A.length ? n / A.length : 0, parole: n, tratti });
    }
    return res;
  }
  // segni da mostrare nel testo: residui di chat, Markdown, caratteri invisibili, passaggi in comune
  function segni(text, conf = []) {
    const marks = [];
    const push = (re, kind) => { for (const m of text.matchAll(re)) if (m[0]) marks.push({ a: m.index, b: m.index + m[0].length, kind }); };
    for (const [re] of CHAT) push(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), 'chat');
    for (const [re] of MARKDOWN) push(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), 'markdown');
    push(/[​‌‍⁠­‪-‮⁦-⁩]|(?!^)﻿|[\u{E0000}-\u{E007F}]+/gu, 'invisibile');
    push(/\b(?=[\p{L}]*\p{Script=Latin})(?=[\p{L}]*[\p{Script=Cyrillic}\p{Script=Greek}])[\p{L}]{2,}\b/gu, 'omoglifo');
    for (const c of conf) for (const t of c.tratti) marks.push({ a: t.a, b: t.b, kind: 'comune', ref: c.nome });
    marks.sort((x, y) => x.a - y.a || y.b - x.b);
    const out = []; let end = -1; for (const m of marks) if (m.a >= end) { out.push(m); end = m.b; }
    return out;
  }

  /* =====================================================================
     4. LETTURA DEI FILE: testo, metadati, caratteri tipografici, autori di commenti e revisioni
     ===================================================================== */
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const all = (d, tag) => [...d.getElementsByTagNameNS('*', tag)];
  const attr = (n, name) => n.getAttribute(name) ?? n.getAttributeNS('*', name.split(':').pop()) ?? null;
  async function zipText(z, name) { const f = z.file(name); return f ? f.async('string') : null; }
  async function propsOOXML(z) {
    const P = {};
    for (const n of ['docProps/core.xml', 'docProps/app.xml']) { const s0 = await zipText(z, n); if (!s0) continue; const d = xml(s0); for (const el of [...d.documentElement.children]) if (el.children.length === 0 && el.textContent.trim()) P[el.localName] = el.textContent.trim(); }
    const cu = await zipText(z, 'docProps/custom.xml'); if (cu) for (const p of all(xml(cu), 'property')) P['personalizzato:' + attr(p, 'name')] = p.textContent.trim();
    return P;
  }
  // paragrafi di Word / PowerPoint: testo, tabulazioni, a capo
  function paraText(p, ns) {
    let t = '';
    const walk = n => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; const l = c.localName; if (l === 't') t += c.textContent; else if (l === 'tab') t += '\t'; else if (l === 'br' || l === 'cr') t += '\n'; else if (l === 'delText' || l === 'instrText') continue; else walk(c); } };
    walk(p); return t;
  }
  async function leggiFile(file) {
    const name = file.name || 'testo', ext = (name.split('.').pop() || '').toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer());
    const R0 = { name, kind: ext, text: '', props: {}, fonts: [], commentAuthors: [], nota: null };
    const fonts = new Set(), authors = new Set();
    if (/^(docx|docm|dotx|pptx|pptm|potx|xlsx|xlsm|xltx)$/.test(ext)) {
      const z = await JSZip.loadAsync(bytes); R0.props = await propsOOXML(z);
      const parts = Object.keys(z.files);
      if (ext[0] === 'd') {
        const out = [];
        for (const n of ['word/document.xml', ...parts.filter(p => /^word\/(header|footer)\d*\.xml$|^word\/(footnotes|endnotes)\.xml$/.test(p))]) {
          const s0 = await zipText(z, n); if (!s0) continue; const d = xml(s0);
          for (const p of all(d, 'p')) { const t = paraText(p); if (n === 'word/document.xml' || t.trim()) out.push(t); }
          for (const r of all(d, 'rFonts')) for (const k of ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia']) { const v = r.getAttribute(k); if (v) fonts.add(v); }
          for (const e of [...all(d, 'ins'), ...all(d, 'del')]) { const a = e.getAttribute('w:author'); if (a) authors.add(a); }
        }
        R0.text = out.join('\n');
        const ft = await zipText(z, 'word/fontTable.xml'); if (ft) for (const f of all(xml(ft), 'font')) { const v = f.getAttribute('w:name'); if (v) fonts.add(v); }
        const cm = await zipText(z, 'word/comments.xml'); if (cm) for (const c of all(xml(cm), 'comment')) { const a = c.getAttribute('w:author'); if (a) authors.add(a); }
      } else if (ext[0] === 'p') {
        const slides = parts.filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]), out = [];
        for (const n of [...slides, ...parts.filter(p => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p))]) {
          const d = xml(await zipText(z, n)); for (const p of all(d, 'p')) { const t = paraText(p); if (t.trim()) out.push(t); }
          for (const f of all(d, 'latin')) { const v = f.getAttribute('typeface'); if (v && !/^\+/.test(v)) fonts.add(v); }
          out.push('');
        }
        for (const n of parts.filter(p => /^ppt\/theme\/theme\d+\.xml$/.test(p))) for (const f of all(xml(await zipText(z, n)), 'latin')) { const v = f.getAttribute('typeface'); if (v) fonts.add(v); }
        const ca = await zipText(z, 'ppt/commentAuthors.xml'); if (ca) for (const a of all(xml(ca), 'cmAuthor')) { const v = a.getAttribute('name'); if (v) authors.add(v); }
        R0.text = out.join('\n');
      } else {
        const out = [];
        const ss = await zipText(z, 'xl/sharedStrings.xml'); if (ss) for (const si of all(xml(ss), 'si')) out.push(all(si, 't').map(t => t.textContent).join(''));
        for (const n of parts.filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))) for (const is of all(xml(await zipText(z, n)), 'is')) out.push(all(is, 't').map(t => t.textContent).join(''));
        const st = await zipText(z, 'xl/styles.xml'); if (st) for (const f of all(xml(st), 'name')) { const v = f.getAttribute('val'); if (v) fonts.add(v); }
        R0.text = out.filter(x => x.trim()).join('\n');
      }
    } else if (/^(odt|odp|ods|ott)$/.test(ext)) {
      const z = await JSZip.loadAsync(bytes);
      const m = await zipText(z, 'meta.xml'); if (m) for (const el of all(xml(m), '*')) if (el.children.length === 0 && el.textContent.trim()) R0.props[el.localName] = el.textContent.trim();
      const d = xml(await zipText(z, 'content.xml') || '<x/>');
      R0.text = [...all(d, 'h'), ...all(d, 'p')].sort((a, b) => a.compareDocumentPosition(b) & 2 ? 1 : -1).map(p => p.textContent).join('\n');
      for (const f of all(d, 'font-face')) { const v = f.getAttribute('svg:font-family') || f.getAttribute('style:name'); if (v) fonts.add(v.replace(/^'|'$/g, '')); }
    } else if (ext === 'pdf') {
      const doc = await pdfDocument({ data: bytes.slice() }).promise;
      try { const md = await doc.getMetadata(); for (const [k, v] of Object.entries(md.info || {})) if (typeof v === 'string' && v.trim()) R0.props[k] = v.trim(); const x = md.metadata?.getAll?.() || {}; for (const [k, v] of Object.entries(x)) if (typeof v === 'string' && v.trim()) R0.props['xmp:' + k] = v.trim(); } catch { }
      const out = []; const N = Math.min(doc.numPages, 300);
      for (let p = 1; p <= N; p++) { const tc = await (await doc.getPage(p)).getTextContent(); out.push(tc.items.map(i => i.str + (i.hasEOL ? '\n' : '')).join('')); }
      R0.text = out.join('\n\n');
      // nomi dei caratteri scritti in chiaro nel file (dizionari dei font non compressi)
      const raw = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 30e6)));
      for (const m of raw.matchAll(/\/(?:BaseFont|FontName)\s*\/(?:[A-Z]{6}\+)?([^\s/<>\[\]()]+)/g)) fonts.add(m[1].replace(/#20/g, ' ').replace(/[-,](?:Bold|Italic|Regular|Medium|Light|BoldItalic|Semibold)$/i, ''));
      if (R0.text.replace(/\s/g, '').length < 40 && doc.numPages) R0.nota = 'Il PDF non contiene testo (è una scansione): restano i controlli sul file; per il testo, rendilo prima ricercabile con «PDF OCR».';
      try { doc.destroy(); } catch { }
    } else if (/^(html?|xhtml)$/.test(ext)) {
      const h = new TextDecoder().decode(bytes), d = new DOMParser().parseFromString(h, 'text/html');
      for (const m of d.querySelectorAll('meta[name]')) if (m.content) R0.props['meta:' + m.getAttribute('name')] = m.content;
      for (const el of d.querySelectorAll('[style*="font-family"],font[face]')) for (const f of fontsDaCss(el.getAttribute('style') || '', el.getAttribute('face'))) fonts.add(f);
      d.querySelectorAll('script,style,noscript').forEach(x => x.remove());
      R0.text = (d.body?.innerText ?? d.body?.textContent ?? '').trim();
    } else if (ext === 'rtf') {
      const r = new TextDecoder('latin1').decode(bytes);
      for (const m of r.matchAll(/\\f\d+[^;{}]*?\s([^;{}\\]+);/g)) fonts.add(m[1].trim());
      R0.text = r.replace(/\\'([0-9a-f]{2})/gi, (m, x) => String.fromCharCode(parseInt(x, 16))).replace(/\\par[d]?\b/g, '\n').replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '').trim();
    } else {
      R0.text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    }
    R0.fonts = [...fonts]; R0.commentAuthors = [...authors];
    return R0;
  }
  // caratteri da uno stile CSS (testo incollato da una pagina web o da Word)
  function fontsDaCss(style, face) {
    const out = []; const m = /font-family\s*:\s*([^;]+)/i.exec(style || ''); const list = m ? m[1] : face || '';
    for (const f of list.split(',')) { const v = f.trim().replace(/^["']|["']$/g, '').replace(/&quot;/g, ''); if (v && !/^(?:inherit|initial|serif|sans-serif|monospace|system-ui|ui-[a-z-]+|-apple-system|var\()/i.test(v)) out.push(v); }
    return out;
  }
  // testo incollato: se gli appunti portano anche l'HTML (pagine web, Word), se ne leggono i caratteri e la provenienza
  function datiIncolla(html) {
    const d = new DOMParser().parseFromString(html, 'text/html'), fonts = new Set(), props = {};
    for (const el of d.querySelectorAll('[style*="font-family"],font[face]')) for (const f of fontsDaCss(el.getAttribute('style') || '', el.getAttribute('face'))) fonts.add(f);
    const gen = d.querySelector('meta[name=Generator],meta[name=generator]'); if (gen) props['programma degli appunti'] = gen.content;
    const src = /SourceURL:([^\s]+)/.exec(html); if (src) props['pagina di provenienza'] = src[1];
    return { fonts: [...fonts], props };
  }

  /* ---------- modello statistico dello stile ----------
     Regressione logistica su n-grammi di caratteri (3-5) e di parole (1-2), addestrata con tools/rilevaai_modello.py
     su testi di Claude (Haiku, Sonnet, Opus, anche «umanizzati» su richiesta) e su testi scritti da persone prima degli
     assistenti AI (web, giornali, enciclopedie, temi e appunti di studenti). Le caratteristiche si calcolano qui e lo
     stesso codice serve all'addestramento (tools/rilevaai_feat.js), così i punteggi coincidono. */
  function normStile(t) {
    return String(t || '').normalize('NFC')
      .replace(/[‘’‚‛ʼ´`]/g, "'")
      .replace(/[“”„‟«»‹›]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/^[ \t]*(?:[-*•●▪◦>#]+|\d{1,2}[.)])[ \t]+/gm, '')
      .replace(/[*_#]{1,3}/g, '')
      .replace(/([a-zà-ú])\.([A-ZÀ-Ú])/g, '$1. $2')
      .replace(/[\s ​-‍⁠﻿]+/g, ' ')
      .trim().toLowerCase().replace(/\d/g, '0');
  }
  const TOK = /[\p{L}\p{N}']+|[.,;:!?"()\-]/gu;
  function featStile(text, bits = 20, nomi) {
    const mask = (1 << bits) - 1, t = normStile(text), m = new Map();
    const add = k => { let x = 0x811c9dc5; for (let i = 0; i < k.length; i++) { x ^= k.charCodeAt(i); x = Math.imul(x, 16777619); } const i = (x >>> 0) & mask; m.set(i, (m.get(i) || 0) + 1); if (nomi) nomi.set(i, k); };
    const s = ' ' + t + ' ';
    for (let n = 3; n <= 5; n++) for (let i = 0; i + n <= s.length; i++) add('c' + s.substr(i, n));
    const w = t.match(TOK) || [];
    for (let i = 0; i < w.length; i++) { add('w' + w[i]); if (i) add('b' + w[i - 1] + ' ' + w[i]); }
    let q = 0;
    for (const [k, v] of m) { const z = 1 + Math.log(v); m.set(k, z); q += z * z; }
    q = Math.sqrt(q) || 1;
    for (const [k, v] of m) m.set(k, v / q);
    return m;
  }
  // Finestre di circa n parole tagliate a fine frase, con la posizione nel testo originale (per evidenziare i passaggi).
  function finestreStile(text, n = 180) {
    const src = String(text || ''); let c = '', map = [], sp = false;
    for (let i = 0; i < src.length; i++) { const ch = src[i]; if (/\s/.test(ch)) { if (c.length && !sp) { c += ' '; map.push(i); sp = true; } } else { c += ch; map.push(i); sp = false; } }
    if (c.endsWith(' ')) { c = c.slice(0, -1); map.pop(); }
    const out = []; let a = -1, b = 0, cnt = 0;
    const span = (x, y) => { while (x < y && c[x] === ' ') x++; while (y > x && c[y - 1] === ' ') y--; return [x, y]; };
    const push = (x, y) => { [x, y] = span(x, y); if (y > x) out.push({ t: c.slice(x, y), a: map[x], b: map[y - 1] + 1, x, y }); };
    for (const mt of c.matchAll(/[^.!?]+[.!?]+["')»”]*\s*|[^.!?]+$/g)) {
      if (a < 0) a = mt.index; b = mt.index + mt[0].length; cnt += (mt[0].match(/\S+/g) || []).length;
      if (cnt >= n) { push(a, b); a = -1; cnt = 0; }
    }
    if (a >= 0) {
      const [x, y] = span(a, b);
      if (y > x) { if (out.length && cnt < n / 2) { const L = out[out.length - 1]; out[out.length - 1] = { t: c.slice(L.x, y), a: L.a, b: map[y - 1] + 1, x: L.x, y }; } else push(a, b); }
    }
    return out;
  }
  let MOD = null, PESI = null;
  function usaModello(m) { MOD = m; PESI = null; }
  function pesi() {
    if (PESI || !MOD) return PESI;
    const dec = s => typeof atob === 'function' ? Uint8Array.from(atob(s), ch => ch.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64'));
    const ix = dec(MOD.idx), pw = new Int8Array(dec(MOD.pesi).buffer); PESI = new Int8Array(1 << MOD.bits);
    let p = 0, cur = 0;
    for (let k = 0; k < pw.length; k++) { let v = 0, sh = 0, by; do { by = ix[p++]; v |= (by & 127) << sh; sh += 7; } while (by & 128); cur += v; PESI[cur] = pw[k]; }
    return PESI;
  }
  const punto = t => { const W = pesi(); let s = 0; for (const [i, v] of featStile(t, MOD.bits)) s += W[i] * v; return MOD.b + MOD.scala * s; };
  const MIN_PAROLE = 80;
  // Esito: punteggio medio delle finestre, confronto con la soglia (≤1% di falsi allarmi in ogni gruppo di testi umani
  // misurati), passaggi sopra la soglia dei testi brevi, posizione rispetto ai testi umani di taratura.
  function stile(text) {
    if (!MOD) return null;
    const nParole = (String(text || '').match(/\S+/g) || []).length;
    if (nParole < MIN_PAROLE) return { breve: true, parole: nParole, min: MIN_PAROLE };
    const F = finestreStile(text).map(f => ({ ...f, s: punto(f.t) }));
    const score = F.reduce((x, f) => x + f.s, 0) / F.length, soglia = F.length > 1 ? MOD.soglia : MOD.soglia_breve;
    const sopra = MOD.umani.filter(u => u < score).length / MOD.umani.length;
    // passaggi: con il testo sopra la soglia, quelli sopra la soglia dei testi brevi; altrimenti solo quelli sopra una soglia
    // molto più severa (7 passaggi umani su 88.697 misurati): un paragrafo di Claude dentro un testo umano
    const ai = score > soglia, P = F.map(f => ({ a: f.a, b: f.b, s: f.s, ai: ai ? f.s > MOD.soglia_breve : f.s > (MOD.soglia_passaggio ?? Infinity) }));
    return { score, soglia, ai, parte: !ai && F.length > 1 && P.some(p => p.ai), vicino: !ai && score > (MOD.soglia_dubbio ?? soglia - 1.5), parole: nParole, quota: sopra, passaggi: P };
  }
  return { normStile, featStile, finestreStile, usaModello, stile, modello: () => MOD, features, piatto, FEATS, prove, confronta, segni, leggiFile, datiIncolla, fontsDaCss, tagNascosti, GENERATORI, FONT_UI, sentences, paragraphs, words };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RilevaAI;

/* ---------- lo strumento ---------- */
async function startRilevaAI(stage, files = []) {
  const R = RilevaAI;
  if (!R.modello() && typeof Later !== 'undefined') Later.all();  // il modello dello stile sta in un blocco eseguito dopo
  const docs = []; let cur = 0, refs = [], pasteMeta = null;
  const LIVELLO = d => d.prove.some(p => p.forza === 'certa') ? 'certa' : d.prove.some(p => p.forza === 'forte') ? 'forte' : d.stile?.ai ? 'stile' : d.stile?.parte ? 'parte' : d.prove.length ? 'indizio' : d.stile?.vicino ? 'incerto' : 'nessuna';
  const analizza = d => { d.prove = R.prove(d.text, d); d.stile = R.stile(d.text); d.conf = refs.length ? R.confronta(d.text, refs) : []; return d; };
  const MIS = () => R.modello()?.misure || {};  // letto al momento: il modello può arrivare dopo l'avvio dello strumento
  // più file: ognuno si confronta anche con gli altri (passaggi in comune tra compiti)
  const incrocia = () => { if (docs.length < 2) return []; const out = []; for (let i = 0; i < docs.length; i++) { const altri = docs.map((d, j) => ({ nome: d.name, text: d.text, j })).filter(x => x.j !== i); R.confronta(docs[i].text, altri).forEach((c, k) => { if (c.parole >= 16) out.push({ i, j: altri[k].j, quota: c.quota, parole: c.parole }); }); } return out.sort((a, b) => b.quota - a.quota); };
  if (files.length) {
    await withBusy('Lettura dei file…', async () => {
      for (const [k, f] of files.entries()) { Busy.set?.(k / files.length, `File ${k + 1} di ${files.length}`); try { docs.push(analizza(await R.leggiFile(f))); } catch (e) { docs.push({ name: f.name, text: '', props: {}, fonts: [], commentAuthors: [], prove: [], conf: [], errore: Errors?.explain?.(e)?.text || 'Il file non si legge' }); } }
    });
  }
  const paste = !files.length;
  if (paste) docs.push(analizza({ name: 'Testo incollato', kind: 'testo', text: '', props: {}, fonts: [], commentAuthors: [] }));

  /* testo con i segni */
  const KIND = { chat: 'Residuo di chat', markdown: 'Markdown', invisibile: 'Carattere invisibile', omoglifo: 'Lettere di altri alfabeti', comune: 'Passaggio in comune' };
  const incrociati = i => docs.length < 2 ? [] : R.confronta(docs[i].text, docs.map((x, j) => ({ nome: x.name, text: x.text, j })).filter(x => x.j !== i)).filter(c => c.parole >= 8);
  // passaggi dello stile (finestre di ~180 parole sopra la soglia) come sfondo, con i segni delle prove dentro
  function testoEl(d, extra = []) {
    const t = d.text, M = R.segni(t, [...(d.conf || []), ...extra]);
    const piece = (a, b) => { const out = []; let at = a;
      for (const m0 of M) { const m = { ...m0, a: Math.max(m0.a, a), b: Math.min(m0.b, b) }; if (m.b <= m.a || m.a < at) continue;
        if (m.a > at) out.push(t.slice(at, m.a)); const s = t.slice(m.a, m.b);
        out.push(h('mark', { class: 'ra-m ra-' + m.kind, title: KIND[m.kind] + (m.ref ? ` · ${m.ref}` : '') }, m.kind === 'invisibile' ? `⟨${[...s].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).slice(0, 3).join(' ')}${[...s].length > 3 ? '…' : ''}⟩` : s)); at = m.b; }
      if (at < b) out.push(t.slice(at, b)); return out; };
    const P = (d.stile?.passaggi || []).filter(p => p.ai), out = []; let at = 0;
    for (const p of P) { if (p.a > at) out.push(...piece(at, p.a)); out.push(h('span', { class: 'ra-pass', title: 'Passaggio con lo stile tipico di Claude (modello statistico)' }, piece(p.a, p.b))); at = p.b; }
    if (at < t.length) out.push(...piece(at, t.length));
    return h('div', { class: 'ra-text', tabindex: '0', role: 'region', 'aria-label': 'Testo analizzato' }, out.length ? out : h('span', { class: 'muted' }, 'Nessun testo.'));
  }
  const VERD = {
    certa: ['bad', 'alert', 'Prove certe di un assistente AI', 'Il file porta impronte che una persona che scrive con Word, PowerPoint o Excel non lascia.'],
    forte: ['warn', 'alert', 'Tracce di copia da una chat AI', 'Nel testo restano elementi tipici delle risposte di un assistente.'],
    stile: ['warn', 'alert', 'Stile molto simile a quello di Claude', 'Il modello statistico riconosce nel testo il modo di scrivere di Claude. È una valutazione, non una prova: usala per decidere cosa verificare, per esempio chiedendo all’autore di spiegare il testo.'],
    parte: ['warn', 'alert', 'Alcuni passaggi scritti come scrive Claude', 'Il testo nel suo insieme resta sotto la soglia, ma i passaggi evidenziati hanno lo stile di Claude con un punteggio molto alto. Possono essere parti incollate da un assistente: verificale.'],
    incerto: ['note', 'info', 'Nessuna prova; stile non decisivo', 'Il punteggio dello stile è nella fascia in cui cadono anche 5 testi umani su 100 (per esempio prosa letteraria o giornalistica molto curata): non indica un assistente AI.'],
    indizio: ['note', 'info', 'Solo indizi deboli', 'Ci sono elementi insoliti, ma da soli non indicano un assistente AI.'],
    nessuna: ['ok', 'check', 'Nessuna prova trovata', 'Né prove nei file né stile da assistente AI. Un testo riscritto a mano con parole proprie può comunque sfuggire.'],
  };
  function esitoEl(d) {
    if (d.errore) return h('div', { class: 'ra-verd bad' }, h('b', {}, 'Il file non si legge'), h('div', {}, d.errore));
    if (paste && !d.text.trim()) return h('div', { class: 'ra-verd note' }, h('b', {}, 'Incolla o scrivi un testo'), h('div', {}, 'Il controllo parte da solo mentre scrivi.'));
    const L = LIVELLO(d), [cls, icon, t, sub] = VERD[L];
    return h('div', { class: 'ra-verd ' + cls, role: 'status' }, h('div', { class: 'ra-vh' }, ic(icon, 18), h('b', {}, t)), h('div', {}, sub));
  }
  function proveEl(d) {
    if (!d.prove.length) return null;
    const ord = { certa: 0, forte: 1, indizio: 2 };
    return h('div', { class: 'ra-list' }, d.prove.slice().sort((a, b) => ord[a.forza] - ord[b.forza]).map(p => h('div', { class: 'ra-item' },
      h('div', { class: 'ra-ih' }, h('span', { class: 'ra-chip ' + p.forza }, p.forza === 'certa' ? 'prova certa' : p.forza === 'forte' ? 'prova forte' : 'indizio'), h('b', {}, p.titolo)),
      h('div', { class: 'ra-id' }, p.dettaglio), p.esempi?.length ? h('ul', { class: 'ra-ex' }, p.esempi.map(x => h('li', {}, '«' + x + '»'))) : null)));
  }
  const pct = x => `${Math.round(x * 100)}%`;
  function stileEl(d) {
    const S = d.stile; if (!S || d.errore || (paste && !d.text.trim())) return null;
    if (S.breve) return h('div', { class: 'ra-item' }, h('div', { class: 'ra-ih' }, h('span', { class: 'ra-chip' }, 'stile'), h('b', {}, 'Testo troppo breve per lo stile')), h('div', { class: 'ra-id' }, `Servono almeno ${S.min} parole (ora ${S.parole}). Le prove nei file e nel testo si controllano comunque.`));
    const pos = Math.max(0, Math.min(1, (S.score - S.soglia + 4) / 8)), n = S.passaggi.length, nai = S.passaggi.filter(p => p.ai).length;
    return h('div', { class: 'ra-item' },
      h('div', { class: 'ra-ih' }, h('span', { class: 'ra-chip ' + (S.ai || S.parte ? 'forte' : S.vicino ? '' : 'ok') }, 'stile'), h('b', {}, S.ai ? 'Scritto come scrive Claude' : S.parte ? 'Passaggi scritti come scrive Claude' : S.vicino ? 'Sotto la soglia, fascia incerta' : 'Non scritto come scrive Claude')),
      h('div', { class: 'ra-gauge', role: 'img', 'aria-label': `Punteggio di stile ${S.score.toFixed(1)}, soglia ${S.soglia.toFixed(1)}` }, h('i', { style: `left:${(pos * 100).toFixed(1)}%` }), h('u', { style: 'left:50%' })),
      h('div', { class: 'ra-gl' }, h('span', {}, 'persona'), h('span', {}, 'soglia'), h('span', {}, 'Claude')),
      h('div', { class: 'ra-id' }, (S.quota >= 0.995 ? 'Punteggio più alto di quello di tutti i testi umani di taratura.' : `Punteggio più alto di quello del ${pct(S.quota)} dei testi umani di taratura.`) + (n > 1 ? ` Passaggi con lo stile di Claude: ${nai} su ${n} (evidenziati nel testo).` : '')),
      MIS().claude ? h('div', { class: 'ra-id ra-nota' }, `Nelle prove su testi mai visti: riconosciuti ${pct(MIS().claude)} dei testi di Claude (Haiku ${pct(MIS().haiku)}, Sonnet ${pct(MIS().sonnet)}, Opus ${pct(MIS().opus)}); falsi allarmi al massimo ${MIS().fp_max_txt} in ogni gruppo di testi umani.`) : null);
  }
  function metaEl(d) {
    const rows = Object.entries(d.props || {}).filter(([, v]) => v);
    if (!rows.length && !d.fonts?.length && !d.commentAuthors?.length) return null;
    return h('details', { class: 'adv' }, h('summary', {}, 'Metadati del file'),
      rows.length ? h('table', { class: 'ra-meta' }, rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, String(v).slice(0, 160))))) : null,
      d.fonts?.length ? h('div', { class: 'ra-id' }, h('b', {}, 'Caratteri: '), d.fonts.slice(0, 30).join(', ')) : null,
      d.commentAuthors?.length ? h('div', { class: 'ra-id' }, h('b', {}, 'Autori di commenti e revisioni: '), d.commentAuthors.join(', ')) : null);
  }
  function confEl(d) {
    const box = h('div', { class: 'ra-conf' });
    for (const c of [...(d.conf || []), ...(docs.length > 1 ? incrociati(docs.indexOf(d)) : [])]) box.append(h('div', { class: 'ra-cr' }, h('span', {}, c.nome), h('b', { class: c.quota >= 0.15 ? 'ra-hi' : '' }, `${Math.round(c.quota * 100)}% in comune`), h('span', { class: 'muted small' }, plural(c.tratti.length, 'passaggio', 'passaggi'))));
    return box;
  }
  /* confronto: testi incollati o file */
  function aggiungiTesto() {
    const ta = h('textarea', { class: 'input', rows: 10, placeholder: 'Incolla qui il testo da confrontare (per esempio la risposta di Claude alla stessa consegna)', 'aria-label': 'Testo da confrontare' }), nome = h('input', { class: 'input', value: `Testo di confronto ${refs.length + 1}`, 'aria-label': 'Nome del testo' });
    const m = modal(h('div', { class: 'ra-dlg' }, h('h3', {}, 'Aggiungi un testo di confronto'), nome, ta, h('div', { class: 'ra-dacts' }, h('button', { class: 'btn primary', onclick: () => { if (ta.value.trim()) { refs.push({ nome: nome.value.trim() || 'Testo', text: ta.value }); docs.forEach(analizza); m.close(); draw(); } } }, 'Confronta'), h('button', { class: 'btn', onclick: () => m.close() }, 'Annulla'))), { width: 640 });
    setTimeout(() => ta.focus(), 50);
  }
  function aggiungiFile() {
    const inp = h('input', { type: 'file', multiple: true, hidden: true, accept: ACCEPT, onchange: async () => { const fs = [...inp.files]; inp.remove(); await withBusy('Lettura dei testi di confronto…', async () => { for (const f of fs) { try { const x = await R.leggiFile(f); refs.push({ nome: f.name, text: x.text }); } catch { toast(`«${f.name}» non si legge`, 'error'); } } }); docs.forEach(analizza); draw(); } });
    document.body.append(inp); inp.click();
  }
  /* rapporto in PDF */
  async function rapporto() {
    await withBusy('Preparazione del rapporto…', async () => {
      const B = [], P = (t, o = {}) => ({ type: 'p', runs: [{ t, ...(o.r || {}) }], size: 10, fam: 'sans', after: 4, lh: 1.3, ...o });
      B.push({ type: 'p', role: 'H1', runs: [{ t: 'Rapporto di verifica: testo scritto con un assistente AI?', b: true, size: 15 }], size: 15, fam: 'sans', after: 4 }, P(`Data: ${new Date().toLocaleDateString('it-IT')} · ${plural(docs.length, 'documento esaminato', 'documenti esaminati')}`, { r: { color: '#555555' }, after: 12 }));
      for (const d of docs) {
        const L = LIVELLO(d), [, , t, sub] = VERD[L];
        B.push({ type: 'p', role: 'H2', runs: [{ t: d.name, b: true }], size: 12, fam: 'sans', before: 8, after: 2, keepNext: true }, P(`Esito: ${d.errore ? 'il file non si legge' : t}. ${d.errore ? '' : sub}`, { r: { b: L === 'certa' || L === 'forte' } }));
        for (const p of d.prove) B.push(P(`• [${p.forza}] ${p.titolo}: ${p.dettaglio}${p.esempi?.length ? ' Esempi: ' + p.esempi.map(x => '«' + x + '»').join('; ') : ''}`, { left: 10 }));
        const S = d.stile; if (S && !d.errore) B.push(P(S.breve ? `• Stile: testo troppo breve (${S.parole} parole, ne servono ${S.min}).` : `• Stile: ${S.ai ? 'scritto come scrive Claude' : S.parte ? 'alcuni passaggi scritti come scrive Claude' : S.vicino ? 'sotto la soglia, fascia incerta, nessuna segnalazione' : 'non scritto come scrive Claude'} (punteggio ${S.score.toFixed(2)}, soglia ${S.soglia.toFixed(2)}; più alto del ${pct(S.quota)} dei testi umani di taratura; passaggi sopra la soglia: ${S.passaggi.filter(p => p.ai).length} su ${S.passaggi.length}).`, { left: 10 }));
        for (const c of d.conf || []) B.push(P(`• Confronto con «${c.nome}»: ${Math.round(c.quota * 100)}% delle parole in passaggi identici di almeno 8 parole (${plural(c.tratti.length, 'passaggio', 'passaggi')}).`, { left: 10 }));
      }
      const X = incrocia(); if (X.length) { B.push({ type: 'p', role: 'H2', runs: [{ t: 'Passaggi in comune tra i file', b: true }], size: 12, fam: 'sans', before: 10, after: 2 }); X.slice(0, 40).forEach(x => B.push(P(`• «${docs[x.i].name}» e «${docs[x.j].name}»: ${Math.round(x.quota * 100)}% (${x.parole} parole)`, { left: 10 }))); }
      B.push({ type: 'space', h: 10 }, P(`Metodo. Prove certe: impronte nei metadati dei programmi con cui gli assistenti AI creano i file, nomi di assistenti nei metadati, caratteri tipografici delle interfacce delle chat, testo nascosto. Prove forti: residui di una conversazione con un assistente e formattazione Markdown non interpretata. Stile: modello statistico locale (sequenze di lettere e di parole) addestrato su testi di Claude (Haiku, Sonnet, Opus, anche scritti su richiesta «per non sembrare AI») e su testi scritti da persone prima degli assistenti AI; soglia scelta per non superare ${MIS().fp_max_txt || '1%'} di falsi allarmi in ogni gruppo di testi umani misurato${MIS().claude ? `; sui testi di prova mai visti ha riconosciuto il ${pct(MIS().claude)} dei testi di Claude` : ''}. Lo stile è una valutazione statistica, non una prova.`, { r: { i: true, color: '#555555' }, size: 9 }));
      const out = await FlowPdf.make({ size: FlowPdf.SIZES.a4, margins: { t: 56, r: 56, b: 56, l: 56 }, blocks: B, title: 'Rapporto di verifica AI', lang: 'it-IT', brand: false });
      showResult([{ name: 'Rapporto verifica AI.pdf', bytes: out.bytes, type: 'application/pdf', info: plural(docs.length, 'documento', 'documenti') }], { title: 'Rapporto pronto' });
    });
  }
  const ACCEPT = '.docx,.docm,.dotx,.pptx,.pptm,.xlsx,.xlsm,.odt,.odp,.ods,.pdf,.txt,.md,.html,.htm,.rtf,.csv';

  /* impaginazione */
  const main = h('div', { class: 'ws-main ra-main' }), side = h('div', { class: 'ra-side' });
  let ta = null;
  function draw() {
    const d = docs[cur], X = incrocia();
    const tb = h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, paste ? 'Testo da verificare' : docs.length > 1 ? `${plural(docs.length, 'file', 'file')} · ${d.name}` : d.name));
    const tabella = docs.length > 1 ? h('table', { class: 'ra-tab' }, h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Esito'), h('th', {}, 'Stile'), h('th', {}, 'In comune con un altro file'))),
      h('tbody', {}, docs.map((x, i) => { const L = LIVELLO(x), mx = X.filter(y => y.i === i)[0]; return h('tr', { class: i === cur ? 'on' : '', tabindex: '0', onclick: () => { cur = i; draw(); }, onkeydown: e => { if (e.key === 'Enter') { cur = i; draw(); } } }, h('td', {}, x.name), h('td', {}, h('span', { class: 'ra-chip ' + (x.errore ? 'certa' : L === 'nessuna' ? 'ok' : L === 'stile' ? 'forte' : L) }, x.errore ? 'non leggibile' : VERD[L][2])), h('td', {}, !x.stile || x.errore ? '—' : x.stile.breve ? 'troppo breve' : x.stile.ai ? 'come Claude' : x.stile.parte ? 'passaggi come Claude' : x.stile.vicino ? 'non decisivo' : 'da persona'), h('td', {}, mx ? `${Math.round(mx.quota * 100)}% con «${docs[mx.j].name}»` : '—')); }))) : null;
    if (paste) {
      if (!ta) { ta = h('textarea', { class: 'input ra-ta', rows: 12, placeholder: 'Incolla o scrivi qui il testo da verificare. Incollando da Word o da una pagina web si controllano anche i caratteri tipografici.', 'aria-label': 'Testo da verificare',
        oninput: () => { d.text = ta.value; clearTimeout(ta._t); ta._t = setTimeout(() => { analizza(d); draw(); }, 250); },
        onpaste: e => { const html = e.clipboardData?.getData('text/html'); if (html) { pasteMeta = R.datiIncolla(html); d.fonts = pasteMeta.fonts; d.props = pasteMeta.props; } } }); }
      main.replaceChildren(...[tb, ta, d.text.trim() && (d.prove.length || d.conf.length || d.stile?.passaggi?.some(p => p.ai)) ? h('div', { class: 'ra-sec' }, h('div', { class: 'ra-st' }, 'Dove sono le tracce'), testoEl(d)) : null].filter(Boolean));
    } else main.replaceChildren(...[tb, tabella, d.nota ? h('div', { class: 'hint' }, d.nota) : null, testoEl(d, incrociati(cur))].filter(Boolean));
    side.replaceChildren(...[
      sec('Esito', esitoEl(d), stileEl(d), proveEl(d)),
      metaEl(d),
      sec('Confronta con altri testi', h('div', { class: 'muted small' }, 'Passaggi identici di almeno 8 parole con le risposte di Claude alla stessa consegna, con una fonte o con altri compiti.'), confEl(d),
        h('div', { class: 'ra-acts' }, h('button', { class: 'btn sm', onclick: aggiungiTesto }, ic('plus', 15), 'Incolla un testo'), h('button', { class: 'btn sm', onclick: aggiungiFile }, ic('upload', 15), 'Aggiungi file'), refs.length ? h('button', { class: 'btn sm ghost', onclick: () => { refs = []; docs.forEach(analizza); draw(); } }, 'Togli i confronti') : null)),
      h('details', { class: 'adv' }, h('summary', {}, 'Come funziona l’analisi dello stile'),
        h('p', { class: 'small' }, 'Un modello statistico, calcolato su questo dispositivo, confronta le sequenze di lettere e di parole del testo con quelle di centinaia di testi scritti da Claude (Haiku, Sonnet e Opus, anche su richieste come «scrivilo in modo che non sembri fatto con l’AI») e di decine di migliaia di testi scritti da persone prima che esistessero gli assistenti AI: siti web, giornali, enciclopedie, temi e appunti di studenti.'),
        h('p', { class: 'small' }, `La soglia è scelta per segnalare per errore al massimo ${MIS().fp_max_txt || 'un testo umano su cento'} in ogni gruppo di testi umani, anche quelli scritti meglio (articoli di giornale).` + (MIS().claude ? ` Su testi di prova mai visti dal modello ha riconosciuto il ${pct(MIS().claude)} dei testi di Claude.` : '') + ' Un testo riscritto a mano con parole proprie può sfuggire; un testo segnalato va verificato, non sanzionato sulla sola base del punteggio.')),
    ].filter(Boolean));
  }
  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: rapporto }, ic('download', 18), 'Scarica il rapporto'), h('div', { class: 'muted small ra-foot' }, 'Tutto avviene su questo dispositivo: i testi non vengono inviati a nessuno.')]);
  ws.classList.add('ra-ws');
  draw();
  if (paste) setTimeout(() => ta?.focus(), 50);
}
