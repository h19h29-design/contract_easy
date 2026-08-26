import fs from 'node:fs';
const t = fs.readFileSync('artifacts/buseo-faq-list.html', 'utf8');
console.log('--- js includes:');
for (const s of new Set(t.match(/src="[^"]+\.js[^"]*"/g) ?? [])) console.log(s);
const i = t.indexOf('opView(');
console.log('--- first use context:');
console.log(t.slice(Math.max(0, i - 260), i + 140).replace(/\s+/g, ' '));
