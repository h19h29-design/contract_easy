import { describe, it, expect } from 'vitest';
import {
  detectConflicts, evaluateCondition, evaluateWizard, REVIEW_REQUIRED_MESSAGE,
  validateActivatableRule
} from './engine.js';
import type { RuleDefinition, WizardInput } from '@sen/shared';

function input(over: Partial<WizardInput> = {}): WizardInput {
  return {
    workType: '건축',
    contractCategory: 'construction',
    estimatedPrice: 500_000_000,
    governmentMaterials: false,
    constructionWaste: false,
    emergency: false,
    regionRestriction: false,
    performanceRestriction: false,
    contractPlannedDate: null,
    completionPlannedDate: null,
    organizationType: 'school',
    ...over
  };
}

/** 테스트 전용 규칙 — 실제 법적 숫자가 아닌 가상의 검증값(엔진 로직 검증 목적) */
function rule(over: Partial<RuleDefinition>): RuleDefinition {
  return {
    id: 'test.rule',
    version: 1,
    status: 'active',
    scope: { contract_category: 'construction' },
    conditions: [{ field: 'estimated_price', operator: 'between', value: [100_000_000, 200_000_000] }],
    output: { method: 'TEST_METHOD_A' },
    source: { title: '테스트 원문', url: 'https://example.org/rule', effectiveFrom: '2020-01-01', checkedAt: '2026-08-25' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reviewedBy: null,
    supersededBy: null,
    ...over
  };
}

describe('evaluateCondition 경계값', () => {
  const c = (value: [number, number]) => ({ field: 'estimated_price' as const, operator: 'between' as const, value });
  it('정확히 기준금액(하한)이면 true', () => {
    expect(evaluateCondition(c([100_000_000, 200_000_000]), input({ estimatedPrice: 100_000_000 }))).toBe(true);
  });
  it('기준보다 1원 낮으면 false', () => {
    expect(evaluateCondition(c([100_000_000, 200_000_000]), input({ estimatedPrice: 99_999_999 }))).toBe(false);
  });
  it('기준보다 1원 높으면(하한+1) true', () => {
    expect(evaluateCondition(c([100_000_000, 200_000_000]), input({ estimatedPrice: 100_000_001 }))).toBe(true);
  });
  it('상한 경계는 미포함(hi-1 true, hi false)', () => {
    const cond = c([100_000_000, 200_000_000]);
    expect(evaluateCondition(cond, input({ estimatedPrice: 199_999_999 }))).toBe(true);
    expect(evaluateCondition(cond, input({ estimatedPrice: 200_000_000 }))).toBe(false);
  });
  it('잘못된 입력(음수/NaN)은 false', () => {
    expect(evaluateCondition(c([0, 0]), input({ estimatedPrice: -5 }))).toBe(false);
    expect(evaluateCondition(c([0, 0]), input({ estimatedPrice: Number.NaN }))).toBe(false);
  });
});

describe('시행일 버전 선택', () => {
  it('시행일 이전 질의면 active라도 제외', () => {
    const r = rule({ source: { title: 't', url: 'u', effectiveFrom: '2026-09-01', checkedAt: '2026-08-25' } });
    const { result } = evaluateWizard(input(), [r], { asOfDate: '2026-08-25' });
    expect(result.decisionState).toBe('REVIEW_REQUIRED');
  });
  it('시행일 이후 질의면 적용', () => {
    const r = rule({});
    const { result } = evaluateWizard(input({ estimatedPrice: 150_000_000 }), [r], { asOfDate: '2026-10-01' });
    expect(result.decisionState).toBe('DETERMINED');
  });
});

describe('구버전 비활성화', () => {
  it('신버전 active면 구버전(superseded)은 무시', () => {
    const oldR = rule({ id: 'test.rule', version: 1, status: 'superseded', output: { method: 'OLD_METHOD' } });
    const newR = rule({ id: 'test.rule', version: 2, output: { method: 'NEW_METHOD' } });
    const { result } = evaluateWizard(input({ estimatedPrice: 150_000_000 }), [oldR, newR]);
    expect(result.recommendedMethod?.method).toBe('NEW_METHOD');
  });
});

describe('충돌 규칙 감지', () => {
  it('겹치는 구간 + 다른 결과 → REVIEW_REQUIRED + conflicts', () => {
    const a = rule({ id: 'a', output: { method: 'METHOD_A' }, conditions: [{ field: 'estimated_price', operator: 'between', value: [100, 300] }] });
    const b = rule({ id: 'b', output: { method: 'METHOD_B' }, conditions: [{ field: 'estimated_price', operator: 'between', value: [250, 400] }] });
    const { result, conflicts } = evaluateWizard(input({ estimatedPrice: 280 }), [a, b]);
    expect(result.decisionState).toBe('REVIEW_REQUIRED');
    expect(conflicts.length).toBeGreaterThan(0);
    expect(result.cautions.join('\n')).toContain(REVIEW_REQUIRED_MESSAGE.split('\n')[0]!);
  });
});

describe('활성 규칙 없음', () => {
  it('draft만 있으면 REVIEW_REQUIRED, 숫자를 추측하지 않음', () => {
    const draft = rule({ status: 'draft' });
    const { result, conflicts } = evaluateWizard(input(), [draft]);
    expect(result.decisionState).toBe('REVIEW_REQUIRED');
    expect(result.recommendedMethod).toBeUndefined();
    expect(conflicts).toHaveLength(0);
    expect(result.evidence).toHaveLength(0);
  });
  it('빈 규칙 목록도 REVIEW_REQUIRED', () => {
    const { result } = evaluateWizard(input(), []);
    expect(result.decisionState).toBe('REVIEW_REQUIRED');
  });
});

describe('정상 판정', () => {
  it('단일 active 매칭 시 DETERMINED와 근거 반환', () => {
    const r = rule({ output: { method: 'METHOD_A', nextSteps: ['예산 확보'], warnings: ['견적 기간 확인'], documents: ['notice|제안서;견적서'] } });
    const { result } = evaluateWizard(input({ estimatedPrice: 120_000_000 }), [r]);
    expect(result.decisionState).toBe('DETERMINED');
    expect(result.appliedRules[0]!.id).toBe('test.rule@1');
    expect(result.documentsByStage[0]).toMatchObject({ stage: 'notice' });
  });

  it('scope 불일치는 제외', () => {
    const r = rule({ scope: { contract_category: 'ict' } });
    const { result } = evaluateWizard(input(), [r]);
    expect(result.decisionState).toBe('REVIEW_REQUIRED');
  });
});

describe('detectConflicts(관리자용 사전탐지)', () => {
  it('동일 scope 겹침+다른 method 보고', () => {
    const a = rule({ id: 'a', conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 100] }] });
    const b = rule({ id: 'b', output: { method: 'B' }, conditions: [{ field: 'estimated_price', operator: 'between', value: [50, 150] }] });
    expect(detectConflicts([a, b])).toHaveLength(1);
  });

  it('lte와 gt 경계를 포함해 겹치는 active 구간을 탐지', () => {
    const a = rule({ id: 'a', status: 'active', conditions: [
      { field: 'estimated_price', operator: 'gte', value: 0 },
      { field: 'estimated_price', operator: 'lte', value: 100 }
    ], output: { method: 'A' } });
    const b = rule({ id: 'b', status: 'active', conditions: [
      { field: 'estimated_price', operator: 'gt', value: 99 },
      { field: 'estimated_price', operator: 'lt', value: 200 }
    ], output: { method: 'B' } });
    expect(detectConflicts([a, b])).toHaveLength(1);
  });

  it('계약방법 없는 보조 규칙은 충돌로 보고하지 않음', () => {
    const methodRule = rule({ id: 'method', conditions: [
      { field: 'estimated_price', operator: 'between', value: [0, 0] }
    ], output: { method: 'A' } });
    const auxiliaryRule = rule({ id: 'auxiliary', conditions: [
      { field: 'estimated_price', operator: 'between', value: [0, 0] }
    ], output: { documents: ['plan|검토서'] } });
    expect(detectConflicts([methodRule, auxiliaryRule])).toHaveLength(0);
  });
});

describe('활성화 검증과 fail-closed 판정', () => {
  it('literal URL and equality/domain boundaries are validated', () => {
    const cases: Array<[string, Partial<RuleDefinition>, boolean]> = [
      ['malformed', { source: { ...rule({}).source, url: 'https://' } }, false],
      ['http', { source: { ...rule({}).source, url: 'http://example.test' } }, false],
      ['credentials', { source: { ...rule({}).source, url: 'https://u:p@example.test' } }, false],
      ['hostless', { source: { ...rule({}).source, url: 'https://#fragment' } }, false],
      ['https', { source: { ...rule({}).source, url: 'https://example.test/path' } }, true]
    ];
    for (const [, patch, valid] of cases) expect(validateActivatableRule(rule(patch)).length === 0).toBe(valid);
    for (const conditions of [
      [{ field: 'estimated_price', operator: 'eq', value: 1 }, { field: 'estimated_price', operator: 'gte', value: 1 }, { field: 'estimated_price', operator: 'lte', value: 1 }],
      [{ field: 'estimated_price', operator: 'eq', value: 1 }, { field: 'estimated_price', operator: 'gt', value: 1 }],
      [{ field: 'estimated_price', operator: 'eq', value: -1 }],
      [{ field: 'estimated_price', operator: 'lt', value: 0 }]
    ] as RuleDefinition['conditions'][]) {
      const valid = conditions.length === 3;
      expect(validateActivatableRule(rule({ conditions })).length === 0).toBe(valid);
    }
  });
  it('동일값 eq 조건과 양끝 포함 범위를 허용한다', () => {
    const equal = rule({ conditions: [
      { field: 'estimated_price', operator: 'eq', value: 100 },
      { field: 'estimated_price', operator: 'gte', value: 100 },
      { field: 'estimated_price', operator: 'lte', value: 100 }
    ] });
    expect(validateActivatableRule(equal)).toEqual([]);
  });
  it('인증정보 URL과 공집합 가격 조건을 거부한다', () => {
    const credentialed = rule({ source: { ...rule({}).source, url: 'https://user:pass@example.test/source' } });
    expect(validateActivatableRule(credentialed).map((x) => x.code)).toContain('INVALID_SOURCE');
    const emptyRange = rule({ conditions: [
      { field: 'estimated_price', operator: 'gt', value: 100 },
      { field: 'estimated_price', operator: 'lte', value: 100 }
    ] });
    expect(validateActivatableRule(emptyRange).map((x) => x.code)).toContain('INVALID_CONDITION');
  });
  it('알 수 없는 scope 키는 활성화 검증에서 거부', () => {
    const issues = validateActivatableRule(rule({ scope: { contract_catgory: 'construction' } }));
    expect(issues.map((x) => x.code)).toContain('UNKNOWN_SCOPE');
  });

  it('method 없는 active 보조 규칙만 매칭되면 PARTIAL', () => {
    const { result } = evaluateWizard(input(), [rule({
      status: 'active',
      conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 0] }],
      output: { documents: ['plan|검토서'] }
    })]);
    expect(result.decisionState).toBe('PARTIAL');
    expect(result.recommendedMethod).toBeUndefined();
  });

  it('계약예정일보다 미래 시행 규칙은 적용하지 않음', () => {
    const { result } = evaluateWizard(input(), [rule({
      status: 'active',
      conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 0] }],
      source: {
        title: '테스트 원문', url: 'https://example.org/future',
        effectiveFrom: '2027-01-01', checkedAt: '2026-08-25'
      }
    })], { asOfDate: '2026-12-31' });
    expect(result.decisionState).toBe('REVIEW_REQUIRED');
  });

  it('기준일보다 미래 시행 규칙은 활성화 검증에서 거부', () => {
    const future = rule({
      source: {
        title: '테스트 원문', url: 'https://example.org/future',
        effectiveFrom: '2027-01-01', checkedAt: '2026-08-25'
      }
    });
    expect(validateActivatableRule(future, { asOfDate: '2026-08-30' }).map((x) => x.code))
      .toContain('FUTURE_EFFECTIVE_DATE');
  });

  it('잘못된 기준일은 활성화 검증에서 거부', () => {
    expect(validateActivatableRule(rule({}), { asOfDate: '2026-02-30' }).map((x) => x.code))
      .toContain('INVALID_SOURCE');
  });

  it('명시적으로 제공한 빈 기준일은 활성화 검증에서 거부', () => {
    expect(validateActivatableRule(rule({}), { asOfDate: '' }).map((x) => x.code))
      .toContain('INVALID_SOURCE');
  });

  it('형식이 잘못되었거나 역전된 추정가격 조건은 활성화 검증에서 거부', () => {
    const scalarBetween = rule({ conditions: [
      { field: 'estimated_price', operator: 'between', value: 100 }
    ] });
    const reversedBetween = rule({ conditions: [
      { field: 'estimated_price', operator: 'between', value: [200, 100] }
    ] });
    expect(validateActivatableRule(scalarBetween).map((x) => x.code)).toContain('INVALID_CONDITION');
    expect(validateActivatableRule(reversedBetween).map((x) => x.code)).toContain('INVALID_CONDITION');
  });

  it('형식이 잘못된 between 조건은 평가 중 false로 끝남', () => {
    expect(evaluateCondition(
      { field: 'estimated_price', operator: 'between', value: 100 },
      input()
    )).toBe(false);
  });

  it('실재하지 않는 원문 확인일은 활성화 검증에서 거부', () => {
    const invalidDate = rule({ source: {
      title: '테스트 원문', url: 'https://example.org/rule',
      effectiveFrom: '2026-01-01', checkedAt: '2026-02-30'
    } });
    expect(validateActivatableRule(invalidDate).map((x) => x.code)).toContain('INVALID_SOURCE');
  });
});
