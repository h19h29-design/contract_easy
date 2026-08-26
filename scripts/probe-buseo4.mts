import fs from 'node:fs';
const t = fs.readFileSync('artifacts/buseo-faq-list.html', 'utf8');
// opView 정의 검색
const m = t.match(/function\s+opView[\s\S]{0,500}/);
console.log(m ? m[0] : 'opView not found');
// form 들
console.log('--- forms:');
for (const f of t.match(/<form[^>]*>/g) ?? []) console.log(f);
// hidden inputs of main form
const fm = t.match(/<form[^>]*name="[^"]*"[^>]*>[\s\S]{0,800}?<\/form>/g) ?? [];
for (const f of fm.slice(0, 2)) {
  console.log('FORM:', f.match(/<form[^>]*>/)?.[0]);
  console.log([...(f.match(/<input[^>]*type="hidden"[^>]*>/g) ?? [])].slice(0, 12));
}
