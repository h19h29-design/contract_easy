import path from 'node:path';

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://contract.sen.go.kr/fus/MI000000000000000097/contract/list0010v.do', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const info = await page.evaluate(`(() => {
  const sels = Array.from(document.querySelectorAll('select')).map((s,i)=>({i,name:s.name||s.id,opt:s.options.length}));
  const ifr = Array.from(document.querySelectorAll('iframe')).map(f=>f.src);
  const btns = Array.from(document.querySelectorAll('#wrap a,#wrap button')).map(b=>(b.textContent||'').trim()).filter(t=>t&&t.length<10).slice(0,20);
  return { sels, ifr, btns, bodyLen: document.body.innerHTML.length };
})()`);
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'artifacts/selector-full.png', fullPage: false });
void path;
await browser.close();
