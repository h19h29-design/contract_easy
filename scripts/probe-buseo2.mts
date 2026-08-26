import fs from 'node:fs';
const t = fs.readFileSync('artifacts/buseo-faq-list.html', 'utf8');
console.log('--- Detail fn:');
console.log([...new Set(t.match(/function\s+\w*Detail\w*\([^)]*\)[\s\S]{0,260}/g) ?? [])].slice(0, 2));
console.log('--- Page fn:');
console.log([...new Set(t.match(/function\s+\w*[Pp]age\w*\([^)]*\)[\s\S]{0,200}/g) ?? [])].slice(0, 2));
console.log('--- onclick samples:');
console.log([...new Set(t.match(/onclick="[^"]{5,90}"/g) ?? [])].slice(0, 8));
