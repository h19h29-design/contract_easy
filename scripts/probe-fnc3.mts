import fs from 'node:fs';
const t = fs.readFileSync('artifacts/mi485-full.html', 'utf8');
console.log('--- all fncSub calls:');
for (const m of new Set(t.match(/fncSubView(?:_pre)?\([^)]*\)/g) ?? [])) console.log(m);
console.log('--- dd_ containers:');
for (const m of new Set(t.match(/id="dd_[^"]*"/g) ?? [])) console.log(m);
// step 값 후보: contract_step 영역
const stepArea = t.match(/contract_step[\s\S]{0,1200}/);
if (stepArea) {
  const txt = stepArea[0].replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ');
  console.log('--- steps area:', txt.slice(0, 400));
}
