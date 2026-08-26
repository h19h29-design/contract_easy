const base = 'https://contract.sen.go.kr/fus/MI000000000000000485/contract/list0030v.do';
for (const q of [
  'gm_cd=C00&step=',
  'gm_cd=C00&step=01',
  'gm_cd=C00&step=1',
  'gm_cd=&step=01',
]) {
  const r = await fetch(`${base}?gb_cd=A3&gy_cd=B15&${q}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const t = await r.text();
  console.log(q.padEnd(20), '→', r.status, 'len=', String(t.length).padStart(5), 'tables=', (t.match(/<table/g) || []).length);
}
