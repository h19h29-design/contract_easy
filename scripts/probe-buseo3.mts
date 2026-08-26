import fs from 'node:fs';
const t = fs.readFileSync('artifacts/buseo-faq-list.html', 'utf8');
const ids = [...new Set((t.match(/opView\('(\d{10,20})'\)/g) ?? []).map((m) => m.replace(/\D/g, '')))];
console.log('article ids:', ids.length, ids.slice(0, 5));
const u = `https://buseo.sen.go.kr/buseo/bu20/user/bbs/BD_selectBbsDetailView.do?q_bbsSn=1412&q_bbsDocNo=${ids[0]}&q_currPage=1&q_rowPerPage=10`;
const r = await fetch(u, { headers: { 'user-agent': 'sen-contract-guide-crawler/0.1' } });
const html = await r.text();
console.log('detail status=', r.status, 'len=', html.length);
const txt = html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const i = txt.indexOf('부서업무방');
console.log(txt.slice(i + 6, i + 700));
fs.writeFileSync('artifacts/buseo-faq-detail.html', html);
