import fs from 'node:fs';
import path from 'node:path';

/** 코퍼스 내 외부 법령 링크 열람(상위 20건) */
const dir = 'data/raw/html';
const urls = new Map<string, number>();
function walk(d: string): void {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      const h = fs.readFileSync(p, 'utf8');
      for (const m of h.matchAll(/https?:\/\/law\.go\.kr[^"'\s<>)]+/g)) {
        const u = m[0].replace(/&amp;/g, '&');
        urls.set(u, (urls.get(u) ?? 0) + 1);
      }
    }
  }
}
walk(dir);
const sorted = [...urls.entries()].sort((a, b) => b[1] - a[1]);
console.log('unique law.go.kr urls =', sorted.length);
for (const [u, n] of sorted.slice(0, 20)) console.log(n, u.slice(0, 110));
