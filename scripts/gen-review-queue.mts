import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '@sen/db';

/**
 * 규칙 검토 대기열 문서 생성(사람 승인 지원용).
 * - 구조화 초안(계약방법 밴드) 우선 → 나머지 candidate 요약
 * - 이 문서는 '검토 편의' 자료이며, 승인 행위는 반드시 /admin/rules UI에서 수행한다.
 */
function main(): void {
  const store = new FileStore(path.resolve('data/app-store'));
  const rules = store.listRules();
  const bands = rules.filter((r) => r.id.startsWith('construction.method.band') && r.status === 'draft');
  const candidates = rules.filter((r) => r.id.startsWith('candidate.') && r.status === 'draft');
  const others = rules.filter(
    (r) => !r.id.startsWith('candidate.') && !r.id.startsWith('construction.method.band')
  );

  const L: string[] = [];
  L.push('# RULE_REVIEW_QUEUE.md — 규칙 승인 대기열(자동 생성)');
  L.push('');
  L.push(`- 생성시각: ${new Date().toISOString()}`);
  L.push('- 활성화 절차: `/admin/rules`에서 [검토 완료(reviewed)] → [승인(active)] 순으로 클릭');
  L.push('- 원칙: 이 문서만 보고 승인하지 말 것 — 반드시 각 항목의 원문 URL에서 값 대조 후 승인');
  L.push('');

  L.push(`## A. 구조화 초안 — 계약방법 밴드 (${bands.length}건)`);
  L.push('');
  if (bands.length === 0) {
    L.push('_없음_');
  }
  for (const b of bands) {
    L.push(`### ${b.id}`);
    L.push('');
    L.push('| 항목 | 값 |');
    L.push('| --- | --- |');
    L.push(`| 계약방법(원문 인용) | ${b.output.method ?? '-'} |`);
    L.push(`| 조건(추정가격) | ${JSON.stringify(b.conditions[0]?.value)} (엔진: [lo, hi) 상한 미포함) |`);
    L.push(`| 원문 문장 | ${b.candidate?.quotedSentence ?? '-'} |`);
    L.push(`| 경계 검토 | ${(b.output.warnings ?? []).join(' / ') || '-'} |`);
    L.push(`| 원문 URL | ${b.source.url} |`);
    L.push(`| 마지막 확인일 | ${b.source.checkedAt} |`);
    L.push('');
  }

  L.push(`## B. 기타 draft 규칙 (${others.length}건)`);
  for (const o of others) {
    L.push(`- ${o.id}@${o.version} — ${o.output.message ?? ''} (원문: ${o.source.url})`);
  }
  if (others.length === 0) L.push('_없음_');

  L.push('');
  L.push(`## C. 문장 후보(candidate) 요약 — 상위 30건 / 전체 ${candidates.length}건`);
  for (const c of candidates.slice(0, 30)) {
    L.push(`- [${c.candidate?.kindOfValue}] "${c.candidate?.quotedSentence.slice(0, 90)}" — ${c.source.url}`);
  }

  const outDir = path.resolve('docs', 'harness');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'RULE_REVIEW_QUEUE.md'), L.join('\n') + '\n', 'utf8');
  console.log(`[rule-review-queue] bands=${bands.length} candidates=${candidates.length} others=${others.length} → docs/harness/RULE_REVIEW_QUEUE.md`);
}

main();
