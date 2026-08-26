const u = 'https://contract.sen.go.kr/fus/MI000000000000000485/contract/list0030v.do?gb_cd=A3&gy_cd=B15&gm_cd=&step=';
const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
const t = await r.text();
console.log('status=', r.status, 'len=', t.length, 'tables=', (t.match(/<table/g) || []).length);
const txt = t
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
console.log(txt.slice(0, 1000));
