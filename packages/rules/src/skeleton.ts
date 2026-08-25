/**
 * 스켈레톤 규칙 세트.
 * 절대 원칙(D-004): 어떠한 금액·비율·기간도 하드코딩하지 않는다.
 * 원문 확인 → REVIEWER 검토 → ADMIN 승인(active) 전까지 마법사는 REVIEW_REQUIRED만 반환한다.
 */
import type { RuleDefinition } from '@sen/shared';
import { todayIso } from '@sen/shared';

export function skeletonRules(): RuleDefinition[] {
  const base = {
    version: 1,
    status: 'draft' as const,
    scope: { contract_category: 'construction' },
    conditions: [
      { field: 'estimated_price', operator: 'between' as const, value: [0, 0] as [number, number] }
    ],
    output: {
      method: undefined,
      reviewRequired: true,
      message:
        '추정가격 구간별 계약방법 기준은 원문(계약길잡이·관련 고시) 확인 후 관리자 승인 필요'
    },
    source: {
      title: '(원문 미확정 — 계약길잡이 계약방법 페이지)',
      url: 'https://contract.sen.go.kr/fus/MI000000000000000097/contract/list0010v.do',
      effectiveFrom: null,
      checkedAt: todayIso()
    },
    reviewedBy: null,
    supersededBy: null
  };
  return [{ ...base, id: 'construction.method.price-band', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as RuleDefinition];
}
