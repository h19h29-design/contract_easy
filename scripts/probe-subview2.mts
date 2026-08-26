import fs from 'node:fs';

const pw = await import('@playwright/test');
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://contract.sen.go.kr/fus/MI000000000000000097/contract/list0010v.do', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// gb=공사 선택
await page.evaluate(
  `(() => { const g=document.querySelector('#gb_cd_top');
    const o=Array.from(g.options).find(o=>o.text.includes('공사'));
    g.value=o.value; g.dispatchEvent(new Event('change',{bubbles:true})); })()`
);
await page.waitForTimeout(2600);

const dump = await page.evaluate(
  `(() => {
    const c = document.querySelector('#content');
    const clicks = Array.from((c||document).querySelectorAll('[onclick]')).map(el => ({
      onclick: el.getAttribute('onclick').slice(0,120),
      text: (el.textContent||'').trim().slice(0,40),
      tag: el.tagName.toLowerCase()
    }));
    return {
      htmlLen: (c?c.innerHTML:'').length,
      clicks,
      forms: Array.from(document.querySelectorAll('form')).map(f=>({id:f.id,name:f.name,action:f.action})),
      hiddenInputs: Array.from(document.querySelectorAll('input[type=hidden]')).map(i=>i.id+'='+i.value).slice(0,15)
    };
  })()`
);
console.log(JSON.stringify(dump, null, 1).slice(0, 2500));
await browser.close();
