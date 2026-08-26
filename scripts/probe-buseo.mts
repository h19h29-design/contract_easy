const u = 'https://buseo.sen.go.kr/buseo/bu20/user/bbs/BD_selectBbsList.do?q_rowPerPage=10&q_currPage=1&q_sortName=&q_sortOrder=&q_searchKeyTy2=1005&q_searchStartDt=&q_searchEndDt=&q_bbsSn=1412&q_bbsDocNo=&q_searchKeyTy=ttl___1002&q_searchVal=%EC%9B%90%ED%81%B4%EB%A6%AD';
const r = await fetch(u, { headers: { 'user-agent': 'sen-contract-guide-crawler/0.1' } });
const t = await r.text();
console.log('status=', r.status, 'len=', t.length);
const links = [...new Set((t.match(/href="[^"]*BD_[^"]*"/g) ?? []))];
console.log('BD links:', links.slice(0, 8));
const txt = t
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
console.log(txt.slice(400, 1300));
fs?.writeFileSync?.('artifacts/buseo-faq-list.html', t);
import fs from 'node:fs';
