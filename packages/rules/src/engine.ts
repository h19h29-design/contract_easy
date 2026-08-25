import type {
  RuleCondition, RuleDefinition, WizardInput, WizardResult,
  RuleSourceMeta
} from '@sen/shared';
import { isoNow } from '@sen/shared';

export const REVIEW_REQUIRED_MESSAGE =
  '담당자 검토 필요\n현재 활성화된 검토 규칙이 없습니다.\n원문 자료를 확인한 뒤 관리자 승인이 필요합니다.';

export interface RuleConflict {
  ruleVersionIdA: string;
  ruleVersionIdB: string;
  reason: string;
}

function matchesScope(rule: RuleDefinition, input: WizardInput): boolean {
  return Object.entries(rule.scope).every(([k, v]) => {
    switch (k) {
      case 'contract_category': return v === '*' || v === input.contractCategory;
      case 'organization_type': return v === '*' || v === input.organizationType;
      case 'emergency': return String(input.emergency) === v;
      case 'government_materials': return String(input.governmentMaterials) === v;
      case 'construction_waste': return String(input.constructionWaste) === v;
      default: return true; // 미지정 키는 제약 없음
    }
  });
}

/** 결정적 조건 평가: 동일 입력 → 동일 결과 (LLM 호출 없음) */
export function evaluateCondition(cond: RuleCondition, input: WizardInput, asOfDate?: string): boolean {
  switch (cond.field) {
    case 'estimated_price': {
      const p = Number(input.estimatedPrice);
      if (!Number.isFinite(p) || p < 0) return false;
      if (cond.operator === 'between') {
        const [lo, hi] = cond.value as [number, number];
        return p >= lo && (hi <= 0 ? true : p < hi); // hi<=0 → 상한 없음
      }
      if (cond.operator === 'lt') return p < Number(cond.value);
      if (cond.operator === 'lte') return p <= Number(cond.value);
      if (cond.operator === 'gt') return p > Number(cond.value);
      if (cond.operator === 'gte') return p >= Number(cond.value);
      if (cond.operator === 'eq') return p === Number(cond.value);
      return false;
    }
    case 'effective_from_satisfied': {
      // 시행일 이후인지(구버전 비활성화 보조). asOfDate가 없으면 통과
      if (!asOfDate) return true;
      const eff = typeof cond.value === 'string' ? cond.value : null;
      return !eff || asOfDate >= eff;
    }
    default:
      return false;
  }
}

export interface EvaluateOptions {
  /** yyyy-mm-dd. 지정하면 시행일이 미래인 active 규칙은 제외 */
  asOfDate?: string;
}

/**
 * 활성 규칙만 사용해 계약방법을 산출한다.
 * - active 규칙이 하나도 매칭되지 않으면 REVIEW_REQUIRED
 * - 서로 다른 method를 내는 active 규칙이 둘 이상이면 충돌로 REVIEW_REQUIRED + conflicts 반환
 */
export function evaluateWizard(
  input: WizardInput,
  rules: RuleDefinition[],
  options: EvaluateOptions = {}
): { result: WizardResult; conflicts: RuleConflict[] } {
  const asOf = options.asOfDate;
  const matched = rules.filter(
    (r) =>
      r.status === 'active' &&
      (!asOf || !r.source.effectiveFrom || r.source.effectiveFrom <= asOf) &&
      matchesScope(r, input) &&
      r.conditions.every((c) => evaluateCondition(c, input, asOf))
  );

  const appliedRules = matched.map((r) => ({
    id: `${r.id}@${r.version}`,
    status: r.status,
    summary: r.output.message ?? r.output.method ?? ''
  }));
  const evidence: RuleSourceMeta[] = matched.map((r) => r.source);
  const lastCheckedAt = matched.length
    ? matched.map((r) => r.source.checkedAt).sort().at(-1)!
    : isoNow();

  const conflicts: RuleConflict[] = [];
  const distinctMethods = new Set(matched.map((r) => r.output.method).filter(Boolean));
  if (distinctMethods.size > 1) {
    for (let i = 1; i < matched.length; i++) {
      conflicts.push({
        ruleVersionIdA: `${matched[0]!.id}@${matched[0]!.version}`,
        ruleVersionIdB: `${matched[i]!.id}@${matched[i]!.version}`,
        reason: `서로 다른 계약방법 판정(${[...distinctMethods].join(' vs ')}) — 관리자 충돌 확인 필요`
      });
    }
  }

  const documentsByStage = mergeStageDocuments(matched);
  const nextSteps = uniqueStrings(matched.flatMap((r) => r.output.nextSteps ?? []));
  const cautions = uniqueStrings(matched.flatMap((r) => r.output.warnings ?? []));

  if (matched.length === 0 || conflicts.length > 0) {
    return {
      result: {
        decisionState: 'REVIEW_REQUIRED',
        appliedRules,
        nextSteps: [],
        documentsByStage,
        cautions: [
          REVIEW_REQUIRED_MESSAGE,
          ...cautions
        ],
        evidence,
        lastCheckedAt
      },
      conflicts
    };
  }

  const primary = matched.find((r) => r.output.method)!;
  return {
    result: {
      decisionState: 'DETERMINED',
      recommendedMethod: {
        method: primary.output.method!,
        ruleId: `${primary.id}@${primary.version}`,
        message: primary.output.message
      },
      appliedRules,
      nextSteps,
      documentsByStage,
      cautions,
      evidence,
      lastCheckedAt
    },
    conflicts
  };
}

function mergeStageDocuments(rules: RuleDefinition[]): WizardResult['documentsByStage'] {
  const map = new Map<string, { docs: Set<string>; sourceRuleId?: string }>();
  for (const r of rules) {
    for (const entry of r.output.documents ?? []) {
      // 형식: "stage|문서1;문서2"
      const [stage, docsRaw] = entry.split('|');
      if (!stage || !docsRaw) continue;
      if (!map.has(stage)) map.set(stage, { docs: new Set() });
      const bucket = map.get(stage)!;
      bucket.sourceRuleId ??= `${r.id}@${r.version}`;
      for (const d of docsRaw.split(';')) if (d.trim()) bucket.docs.add(d.trim());
    }
  }
  return [...map.entries()].map(([stage, b]) => ({
    stage, documents: [...b.docs], sourceRuleId: b.sourceRuleId
  }));
}

function uniqueStrings(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

/** 규칙 후보 간 충돌 탐지(관리자 화면용): 같은 scope+겹치는 금액구간+다른 결과 */
export function detectConflicts(rules: RuleDefinition[]): RuleConflict[] {
  const actives = rules.filter((r) => r.status === 'active');
  const out: RuleConflict[] = [];
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i]!, b = actives[j]!;
      const aPrice = a.conditions.find((c) => c.field === 'estimated_price' && c.operator === 'between');
      const bPrice = b.conditions.find((c) => c.field === 'estimated_price' && c.operator === 'between');
      if (!aPrice || !bPrice) continue;
      if (JSON.stringify(a.scope) !== JSON.stringify(b.scope)) continue;
      if (rangesOverlap(aPrice.value as [number, number], bPrice.value as [number, number]) &&
          a.output.method !== b.output.method) {
        out.push({
          ruleVersionIdA: `${a.id}@${a.version}`,
          ruleVersionIdB: `${b.id}@${b.version}`,
          reason: '동일 scope에서 겹치는 추정가격 구간과 상충하는 계약방법'
        });
      }
    }
  }
  return out;
}

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  const aHi = a[1] <= 0 ? Infinity : a[1];
  const bHi = b[1] <= 0 ? Infinity : b[1];
  return Math.max(a[0], b[0]) < Math.min(aHi, bHi);
}
