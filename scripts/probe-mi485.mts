import path from 'node:path';
const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://contract.sen.go.kr/fus/MI000000000000000485/contract/list0010v.do?gb=A3&gy=B15', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const d = await page.evaluate(
  `(() => {
    const c = document.querySelector('#content');
    return {
      len: (c ? c.innerHTML : '').length,
      clicks: Array.from((c || document).querySelectorAll('[onclick]')).map(el => el.getAttribute('onclick').slice(0, 100)).slice(0, 10),
      selects: Array.from(document.querySelectorAll('select')).map(s => s.id + ':' + s.options.length),
      tables: document.querySelectorAll('table').length
    };
  })()`
);
console.log(JSON.stringify(d, null, 1));
void path;
await browser.close();
