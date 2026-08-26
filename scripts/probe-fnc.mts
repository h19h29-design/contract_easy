import path from 'node:path';
const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage();
const reqs: Array<{ url: string; data: string | null }> = [];
page.on('request', (r) => {
  if (r.method() === 'POST' || /sub/i.test(r.url())) reqs.push({ url: r.url(), data: r.postData() });
});
await page.goto('https://contract.sen.go.kr/fus/MI000000000000000485/contract/list0010v.do?gb=A3&gy=B15', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
// 페이지 내 모든 a/button 텍스트 나열(#content 밖 포함, 상위 30개)
const els = await page.evaluate(
  `(() => Array.from(document.querySelectorAll('a,button'))
     .map(e => ({ t:(e.textContent||'').trim().slice(0,20), oc:(e.getAttribute('onclick')||'').slice(0,80) }))
     .filter(x => x.t || x.oc).slice(0,30))()`
);
console.log(JSON.stringify(els, null, 1));
// fncSubView 정의부 찾기
const js = await page.evaluate(
  `(() => { const m=document.body.innerHTML.match(/function fncSubView[\\s\\S]{0,700}/); return m?m[0]:''; })()`
);
console.log('--- fncSubView def:');
console.log(js.slice(0, 700));
void path;
await browser.close();
