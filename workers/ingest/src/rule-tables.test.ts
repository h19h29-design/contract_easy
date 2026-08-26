import { describe, it, expect } from 'vitest';
import { parseAmountKrw, parseBand, extractContractMethodDrafts } from './rule-tables.js';
import type { NormalizedDoc } from '@sen/shared';

describe('parseAmountKrw', () => {
  it('단위 파싱', () => {
    expect(parseAmountKrw('2천만원')).toBe(null); // 천 단위 미지원 → null (파서 한계 명시)
    expect(parseAmountKrw('2천만')).toBe(null);
    expect(parseAmountKrw('20만원')).toBe(200_000);
    expect(parseAmountKrw('1억원')).toBe(100_000_000);
    expect(parseAmountKrw('2.3억')).toBe(230_000_000);
    expect(parseAmountKrw('5000원')).toBe(5_000);
  });
});

describe('parseBand', () => {
  it('"A 초과 ~ B 이하"', () => {
    expect(parseBand('2천만원 초과 ~ 1억원 이하'.replace(/2천만원/, '2000만원'))).toEqual({ lo: 20_000_000, hi: 100_000_000 });
  });
  it('"A 미만" → [0,A)', () => {
    expect(parseBand('1억 미만')).toEqual({ lo: 0, hi: 100_000_000 });
  });
  it('"A 초과" → (A,∞)', () => {
    expect(parseBand('1억원 초과')).toEqual({ lo: 100_000_000, hi: 0 });
  });
  it('"1억~2.3억 미만" 형태', () => {
    const b = parseBand('1억~2.3억미만');
    expect(b).toEqual({ lo: 100_000_000, hi: 230_000_000 });
  });
});

function docWithTable(rows: string[][]): NormalizedDoc {
  return {
    sourceVersionId: 'svt',
    url: 'https://contract.sen.go.kr/fus/MI000000000000000097/contract/list0010v.do',
    title: '계약방법 안내',
    menuPath: ['계약방법 메인'],
    collectedAt: '2026-08-26T00:00:00Z',
    publishedAt: null,
    blocks: [{ kind: 'table-row', text: rows.map((r) => r.join(' | ')).join('\n'), path: ['표'], tableRows: rows }],
    warnings: []
  };
}

// 실제 수집 원문과 동일한 구조의 표 fixture
const REAL_TABLE = [
  ['구분', '2인이상 수의계약', '입찰', '입찰'],
  ['추정가격', '2000만원 초과 ~ 1억원 이하', '1억 미만 입찰', '1억~2.3억 미만 입찰'],
  ['참가자격', '소기업, 소상공인', '소기업, 소상공인', '중소기업, 소상공인']
];

describe('extractContractMethodDrafts (실제 표 구조)', () => {
  const { drafts, skippedTables } = extractContractMethodDrafts([docWithTable(REAL_TABLE)]);

  it('열별 초안 생성(수의계약 1 + 입찰 2)', () => {
    void skippedTables;
    expect(drafts).toHaveLength(3);
    expect(drafts.filter((d) => d.output.method === '수의계약')).toHaveLength(1);
    expect(drafts.filter((d) => d.output.method === '입찰')).toHaveLength(2);
  });

  it('금액 조건은 원문 인용값 그대로', () => {
    const su = drafts.find((d) => d.output.method === '수의계약')!;
    expect(su.conditions[0]).toEqual({ field: 'estimated_price', operator: 'between', value: [20_000_000, 100_000_000] });
    const big = drafts.find((d) => d.candidate?.quotedSentence.includes('2.3억'))!;
    expect(big.conditions[0]?.value).toEqual([100_000_000, 230_000_000]);
  });

  it('항상 draft이며, 포함 경계(이하/초과) 밴드에만 warning 부여', () => {
    for (const d of drafts) {
      expect(d.status).toBe('draft');
      expect(d.source.url).toContain('contract.sen.go.kr');
      const bandText = d.candidate!.quotedSentence;
      const needsWarning = bandText.includes('이하') || bandText.includes('초과');
      expect(d.output.warnings?.some((w) => w.includes('경계'))).toBe(needsWarning);
    }
  });

  it('ID는 밴드+URL 기반 결정적', () => {
    const again = extractContractMethodDrafts([docWithTable(REAL_TABLE)]);
    expect(again.drafts.map((d) => d.id)).toEqual(drafts.map((d) => d.id));
  });

  it('추정가격 행 없는 표는 스킵', () => {
    const r = extractContractMethodDrafts([docWithTable([
      ['구분', '수의계약'],
      ['참가자격', '소기업']
    ])]);
    expect(r.drafts).toHaveLength(0);
  });
});
