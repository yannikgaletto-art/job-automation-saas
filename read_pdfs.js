const fs = require('fs');
const pdf = require('pdf-parse');

async function readPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  console.log(`\n\n=== ${filePath} ===\n`);
  console.log(data.text.substring(0, 3000));
}

(async () => {
    try {
        await readPdf('GDPR/DSGVO.pdf');
        await readPdf('GDPR/EU AI ACT.pdf');
        await readPdf('GDPR/Perplexity .pdf');
    } catch (e) {
        console.error(e);
    }
})();
