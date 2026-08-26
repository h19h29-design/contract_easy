import fs from 'node:fs';
const t = fs.readFileSync('artifacts/buseo-faq-list.html', 'utf8');
console.log('q_currPage occurrences:');
for (const m of t.matchAll(/q_currPage=(\d+)/g)) console.log(' ', m[1]);
console.log('--- anchor hrefs containing currPage:');
for (const m of new Set(t.match(/href="[^"]*q_currPage[^"]*"/g) ?? [])) console.log(m.slice(0, 120));
