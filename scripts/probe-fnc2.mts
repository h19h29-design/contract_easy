import fs from 'node:fs';
const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://contract.sen.go.kr/fus/MI000000000000000485/contract/list0010v.do?gb=A3&gy=B15', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const html = await page.content();
fs.writeFileSync('artifacts/mi485-full.html', html);

// fncSubView 전체 정의
const defM = html.match(/function fncSubView\([^)]*\)\{[\s\S]{0,1200}?\n\s*\}/);
console.log('=== fncSubView full ===');
console.log(defM ? defM[0] : '(not found)');
// 호출부(인자 실값)
console.log('=== callers ===');
for (const m of new Set(html.match(/fncSubView\('[^']*'(?:,\s*'[^']*')*\)/g) ?? [])) console.log(m);
// fncSubView_pre 정의
const pre = html.match(/function fncSubView_pre\([^)]*\)\{[\s\S]{0,600}/);
console.log('=== pre ===');
console.log(pre ? pre[0].slice(0, 500) : '(none)');
void path;
await browser.close();
