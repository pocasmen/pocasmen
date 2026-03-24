
const { PDFParse } = require('pdf-parse');
console.log('PDFParse keys:', Object.keys(PDFParse));
console.log('PDFParse Prototype keys:', Object.keys(PDFParse.prototype));
(async () => {
    try {
        const parser = new PDFParse();
        console.log('Parser Instance keys:', Object.keys(parser));
        // Use the buffer with the instance if possible
    } catch (err) {
        console.error('Error:', err);
    }
})();
