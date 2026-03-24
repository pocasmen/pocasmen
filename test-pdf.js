
const pdf = require('pdf-parse');
console.log('Result of require:', typeof pdf);
console.log('Keys:', Object.keys(pdf));
if (pdf.default) console.log('Type of default:', typeof pdf.default);
if (typeof pdf === 'function') {
    console.log('It is a function!');
} else {
    console.log('It is NOT a function.');
}
