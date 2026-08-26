/**
 * 빈 카테고리(예: 청소용역 B08)의 유효 gm_cd/step 조합 탐색.
 * 관측된 파라미터 공간(gm=C00~C09, step=01~08)만 소극적으로 조회 — 내용은 응답이 진실 원천.
 */
const base = 'https://contract.sen.go.kr/fus/MI000000000000000487/contract/list0030v.do';
const gy = 'B08'; // 청소용역

for (const gm of ['C00', 'C01', 'C02', 'C03', 'C04', 'C05']) {
  for (const step of ['01', '02', '03', '04', '05', '06']) {
    const u = `${base}?gb_cd=A2&gy_cd=${gy}&gm_cd=${gm}&step=${step}`;
    try {
      const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const t = await r.text();
      const tables = (t.match(/<table/g) || []).length;
      if (t.length > 900 && tables > 0) {
        console.log('HIT', `gm=${gm} step=${step}`, 'len=' + t.length, 'tables=' + tables);
      }
    } catch { /* noop */ }
  }
}
console.log('probe done');
