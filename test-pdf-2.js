
const { PDFParse } = require('pdf-parse');
console.log('Type of PDFParse:', typeof PDFParse);
if (typeof PDFParse === 'function') {
    console.log('PDFParse is a function!');
} else {
    console.log('PDFParse is NOT a function.');
}
