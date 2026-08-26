import path from 'node:path';

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'ko-KR' } as never);

const seen: Array<{ url: string; data: string | null }> = [];
page.on('request', (req) => {
  if (/Sub|sub/i.test(req.url()) && /\.do/.test(req.url())) {
    seen.push({ url: req.url(), data: req.postData() });
  }
});

await page.goto('https://contract.sen.go.kr/fus/MI000000000000000097/contract/list0010v.do', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// gb 선택
await page.evaluate(
  `(() => { const g=document.querySelector('#gb_cd_top');
     g.value = Array.from(g.options).find(o=>o.text.includes('공사'))?.value || g.options[1].value;
     g.dispatchEvent(new Event('change',{bubbles:true})); })()`
);
await page.waitForTimeout(2600);

const gyInfo = await page.evaluate(
  `(() => { const y=document.querySelector('#gy_cd_top');
     return Array.from(y.options).map(o=>({v:o.value,t:o.text.trim()})); })()`
);
console.log('gy options:', JSON.stringify(gyInfo));

// 첫 실제 gy 선택 + change
const target = gyInfo.find((o) => o.v)!;
await page.evaluate(
  `((v) => { const y=document.querySelector('#gy_cd_top'); y.value=v;
     y.dispatchEvent(new Event('change',{bubbles:true})); })(${JSON.stringify(target.v)})`
);
await page.waitForTimeout(2500);

const state = await page.evaluate(
  `(() => ({
     tables: document.querySelectorAll('#content table').length,
     anyTable: document.querySelectorAll('table').length,
     contentHead: (document.querySelector('#content')||document.body).innerHTML.slice(0,400)
   }))()`
);
console.log('tables(content)=', state.tables, 'tables(any)=', state.anyTable);
console.log('content head:', state.contentHead.replace(/\s+/g, ' ').slice(0, 300));
console.log('--- fncSub requests:');
for (const s of seen) console.log(s.method, s.url.slice(0, 120), '| data=', (s.data ?? '').slice(0, 200));
void path;
await browser.close();
