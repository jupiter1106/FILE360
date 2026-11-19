// docx.js e PptxGenJS (le librerie che gli assistenti AI usano per Word e PowerPoint): servono i pacchetti npm
// «docx» e «pptxgenjs» (cartella indicata da NODE_PATH). Testi inventati.
const fs = require('fs'), path = require('path'), D = path.join(__dirname, 'fixtures', 'ai');
const docx = require('docx'), PptxGenJS = require('pptxgenjs');
const T = 'Ecco una sintesi chiara della fotosintesi clorofilliana. È un processo fondamentale: le piante trasformano la luce in energia chimica, producendo zuccheri e ossigeno.';
(async () => {
  fs.writeFileSync(path.join(D, 'ai-docxjs.docx'), await docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [new docx.Paragraph(T)] }] })));
  const p = new PptxGenJS(); p.addSlide().addText(T, { x: 0.5, y: 0.5, w: 9, h: 2 }); await p.writeFile({ fileName: path.join(D, 'ai-pptxgenjs.pptx') });
  console.log('ok');
})();
