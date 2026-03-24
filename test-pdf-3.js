
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
(async () => {
    try {
        const buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Test) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
        const data = await PDFParse(buffer);
        console.log('PDFParse Data Keys:', Object.keys(data));
        console.log('Text result:', data.text);
    } catch (err) {
        console.error('PDFParse Error:', err);
    }
})();
