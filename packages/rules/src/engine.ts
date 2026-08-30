import type {
  RuleCondition, RuleDefinition, WizardInput, WizardResult,
  RuleSourceMeta, RuleValidationIssue
} from '@sen/shared';
import { isIsoDate, isoNow } from '@sen/shared';

export const REVIEW_REQUIRED_MESSAGE =
  '담당자 검토 필요\n현재 활성화된 검토 규칙이 없습니다.\n원문 자료를 확인한 뒤 관리자 승인이 필요합니다.';

export interface RuleConflict {
  ruleVersionIdA: string;
  ruleVersionIdB: string;
  reason: string;
}

const ALLOWED_SCOPE_KEYS = new Set([
  'contract_category', 'organization_type', 'emergency',
  'government_materials', 'construction_waste'
]);

const ALLOWED_PRICE_OPERATORS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'between']);

export function validateActivatableRule(
  rule: RuleDefinition,
  options: { asOfDate?: string } = {}
): RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];
  for (const key of Object.keys(rule.scope)) {
    if (!ALLOWED_SCOPE_KEYS.has(key)) {
      issues.push({ code: 'UNKNOWN_SCOPE', message: `지원하지 않는 scope: ${key}` });
    }
  }
  if (!rule.source.title.trim() ||
    !isSafeHttpsSourceUrl(rule.source.url) ||
    !isIsoDate(rule.source.checkedAt) ||
    (rule.source.effectiveFrom != null && !isIsoDate(rule.source.effectiveFrom))) {
    issues.push({ code: 'INVALID_SOURCE', message: 'HTTPS 원문 URL, 제목, 확인일이 필요합니다.' });
  }
  if (!rule.output.method?.trim()) {
    issues.push({ code: 'MISSING_METHOD', message: '계약방법 출력이 필요합니다.' });
  }
  if (options.asOfDate !== undefined && !isIsoDate(options.asOfDate)) {
    issues.push({ code: 'INVALID_SOURCE', message: '기준일은 엄격한 yyyy-mm-dd 날짜여야 합니다.' });
  } else if (options.asOfDate !== undefined && rule.source.effectiveFrom && rule.source.effectiveFrom > options.asOfDate) {
    issues.push({ code: 'FUTURE_EFFECTIVE_DATE', message: '기준일 이후 시행 규칙입니다.' });
  }
  if (rule.conditions.length === 0 || rule.conditions.some(
    (condition) => !isValidActivatablePriceCondition(condition)
  ) || !normalizedPriceInterval(rule.conditions)) {
    issues.push({ code: 'INVALID_CONDITION', message: '지원되는 추정가격 조건이 필요합니다.' });
  }
  return issues;
}

function isSafeHttpsSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function matchesScope(rule: RuleDefinition, input: WizardInput): boolean {
  return Object.entries(rule.scope).every(([k, v]) => {
    switch (k) {
      case 'contract_category': return v === '*' || v === input.contractCategory;
      case 'organization_type': return v === '*' || v === input.organizationType;
      case 'emergency': return String(input.emergency) === v;
      case 'government_materials': return String(input.governmentMaterials) === v;
      case 'construction_waste': return String(input.constructionWaste) === v;
      default: return false;
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
        const range = priceRange(cond.value);
        if (!range) return false;
        const [lo, hi] = range;
        return p >= lo && (hi <= 0 ? true : p < hi); // hi<=0 → 상한 없음
      }
      if (!isFiniteNumber(cond.value)) return false;
      if (cond.operator === 'lt') return p < cond.value;
      if (cond.operator === 'lte') return p <= cond.value;
      if (cond.operator === 'gt') return p > cond.value;
      if (cond.operator === 'gte') return p >= cond.value;
      if (cond.operator === 'eq') return p === cond.value;
      return false;
    }
    case 'effective_from_satisfied': {
      // 시행일 이후인지(구버전 비활성화 보조). asOfDate가 없으면 통과
      if (!asOfDate) return true;
      if (!isIsoDate(asOfDate)) return false;
      const eff = typeof cond.value === 'string' ? cond.value : null;
      return !eff || (isIsoDate(eff) && asOfDate >= eff);
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
      isEffectiveOn(r, asOf) &&
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

  const primary = matched.find((r) => r.output.method?.trim());
  if (!primary) {
    return {
      result: {
        decisionState: 'PARTIAL',
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

function isEffectiveOn(rule: RuleDefinition, asOfDate?: string): boolean {
  const effectiveFrom = rule.source.effectiveFrom;
  if (effectiveFrom && !isIsoDate(effectiveFrom)) return false;
  if (!asOfDate) return true;
  return isIsoDate(asOfDate) && (!effectiveFrom || effectiveFrom <= asOfDate);
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
      const aMethod = a.output.method?.trim();
      const bMethod = b.output.method?.trim();
      if (!aMethod || !bMethod || aMethod === bMethod) continue;
      const aInterval = normalizedPriceInterval(a.conditions);
      const bInterval = normalizedPriceInterval(b.conditions);
      if (!aInterval || !bInterval) continue;
      if (scopeKey(a.scope) !== scopeKey(b.scope)) continue;
      if (rangesOverlap(aInterval, bInterval)) {
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

interface PriceInterval {
  lower: number;
  lowerInclusive: boolean;
  upper: number;
  upperInclusive: boolean;
}

function normalizedPriceInterval(conditions: RuleCondition[]): PriceInterval | null {
  const priceConditions = conditions.filter((condition) => condition.field === 'estimated_price');
  if (priceConditions.length === 0) return null;
  let interval: PriceInterval = {
    lower: 0,
    lowerInclusive: true,
    upper: Number.POSITIVE_INFINITY,
    upperInclusive: true
  };
  for (const condition of priceConditions) {
    const next = intervalFor(condition);
    if (!next) return null;
    interval = intersectIntervals(interval, next);
  }
  return intervalIsNonEmpty(interval) ? interval : null;
}

function intervalFor(condition: RuleCondition): PriceInterval | null {
  if (condition.operator === 'between') {
    const range = priceRange(condition.value);
    if (!range) return null;
    const [lower, upper] = range;
    return {
      lower,
      lowerInclusive: true,
      upper: upper <= 0 ? Number.POSITIVE_INFINITY : upper,
      upperInclusive: false
    };
  }
  if (!isFiniteNumber(condition.value)) return null;
  const value = condition.value;
  switch (condition.operator) {
    case 'gt': return { lower: value, lowerInclusive: false, upper: Infinity, upperInclusive: true };
    case 'gte': return { lower: value, lowerInclusive: true, upper: Infinity, upperInclusive: true };
    case 'lt': return { lower: -Infinity, lowerInclusive: true, upper: value, upperInclusive: false };
    case 'lte': return { lower: -Infinity, lowerInclusive: true, upper: value, upperInclusive: true };
    case 'eq': return { lower: value, lowerInclusive: true, upper: value, upperInclusive: true };
    default: return null;
  }
}

function isValidActivatablePriceCondition(condition: RuleCondition): boolean {
  if (condition.field !== 'estimated_price' || !ALLOWED_PRICE_OPERATORS.has(condition.operator)) return false;
  return condition.operator === 'between' ? priceRange(condition.value) !== null : isFiniteNumber(condition.value);
}

function priceRange(value: RuleCondition['value']): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [lower, upper] = value;
  if (!isFiniteNumber(lower) || !isFiniteNumber(upper)) return null;
  if (upper > 0 && upper <= lower) return null;
  return [lower, upper];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function intersectIntervals(a: PriceInterval, b: PriceInterval): PriceInterval {
  const lower = Math.max(a.lower, b.lower);
  const upper = Math.min(a.upper, b.upper);
  return {
    lower,
    lowerInclusive: a.lower === b.lower ? a.lowerInclusive && b.lowerInclusive :
      (lower === a.lower ? a.lowerInclusive : b.lowerInclusive),
    upper,
    upperInclusive: a.upper === b.upper ? a.upperInclusive && b.upperInclusive :
      (upper === a.upper ? a.upperInclusive : b.upperInclusive)
  };
}

function intervalIsNonEmpty(interval: PriceInterval): boolean {
  return interval.lower < interval.upper ||
    (interval.lower === interval.upper && interval.lowerInclusive && interval.upperInclusive);
}

function rangesOverlap(a: PriceInterval, b: PriceInterval): boolean {
  const overlap = intersectIntervals(a, b);
  return intervalIsNonEmpty(overlap);
}

function scopeKey(scope: RuleDefinition['scope']): string {
  return JSON.stringify(Object.entries(scope).sort(([a], [b]) => a.localeCompare(b)));
}
