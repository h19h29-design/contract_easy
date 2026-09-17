import { FileStore } from '@sen/db';
import { ensureDirs } from '@sen/config';
import { stableId } from '@sen/shared';
import { validateActivatableRule } from '@sen/rules';
import type { RuleDefinition } from '@sen/shared';

/**
 * 공사 계약방법 밴드 규칙 '초안(draft)' 생성 — 수작업 구조화.
 *
 * 근거 원문: 사전체크리스트-공사 (MI000000000000000332/html/cont0010v.do, 수집 2026-08-26)
 *   구분                    | 종합공사    | 전문공사    | 전기 등 그 밖의 공사
 *   1인 견적 수의계약        | 2천만원 이하(전 구분 공통)
 *   2인 이상 견적 수의계약   | 4억원 이하  | 2억원 이하  | 1억 6천만원 이하
 *   입찰                    | 4억원 초과  | 2억원 초과  | 1억 6천만원 초과
 *
 * 절대 원칙 준수:
 * - 전부 status='draft'. 활성화는 /admin/rules에서 REVIEWER 검토 + ADMIN 승인(2인)만 가능.
 * - WizardInput에 종합/전문 구분이 없으므로 construction은 보수적으로 전문공사 기준(2억)을
 *   적용하고, 종합공사(4억)와의 차이는 warning으로 남긴다(RULE_REVIEW_PACKET §4 선택지 b).
 * - 원문 경계 그대로: "이하"는 lte, "초과"는 gt. between 근사치를 쓰지 않는다.
 * - 여성·장애인·사회적경제기업 5천만원 이하 1인수의 예외는 입력 플래그가 없어 미반영(warning).
 * - 'other' 카테고리는 2천만원 초과 구간 규칙을 만들지 않는다 → REVIEW_REQUIRED 유지가 안전.
 *
 * 사용: pnpm exec tsx scripts/create-construction-band-drafts.mts
 */

const SOURCE = {
  title: '서울특별시교육청 계약길잡이',
  url: 'https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do',
  publishedAt: null,
  effectiveFrom: null,
  checkedAt: '2026-09-17'
} as const;

const DRAFT_WARNING = '수작업 구조화 초안 — 승인 전 반드시 원문 표와 대조할 것';

interface BandSpec {
  category: string; // contract_category scope 값 ('*' = 전 구분)
  categoryLabel: string;
  method: string;
  bandText: string; // 원문 인용 밴드 (ID 생성에 사용)
  conditions: RuleDefinition['conditions'];
  quoted: string;
  extraWarnings: string[];
}

const SPECS: BandSpec[] = [
  {
    category: '*',
    categoryLabel: '전 구분 공통',
    method: '수의계약',
    bandText: '2천만원 이하',
    conditions: [{ field: 'estimated_price', operator: 'lte', value: 20_000_000 }],
    quoted: '1인 견적서 제출 가능 수의계약 | 2천만원 이하',
    extraWarnings: [
      '여성기업·장애인기업·사회적경제기업은 5천만원 이하까지 1인 수의 가능하나 입력 플래그가 없어 미반영 — 승인 시 참고'
    ]
  },
  {
    category: 'construction',
    categoryLabel: '건설공사(전문공사 기준)',
    method: '수의계약',
    bandText: '2천만원 초과 2억원 이하',
    conditions: [
      { field: 'estimated_price', operator: 'gt', value: 20_000_000 },
      { field: 'estimated_price', operator: 'lte', value: 200_000_000 }
    ],
    quoted: '2인 이상 견적서 제출 수의계약 | 전문공사 2억원 이하',
    extraWarnings: [
      '종합공사는 4억원 이하까지 2인 수의 가능 — 종합/전문 구분 입력이 없어 보수적(전문 2억) 적용'
    ]
  },
  {
    category: 'electric',
    categoryLabel: '전기공사(전기 등 그 밖의 공사)',
    method: '수의계약',
    bandText: '2천만원 초과 1억 6천만원 이하',
    conditions: [
      { field: 'estimated_price', operator: 'gt', value: 20_000_000 },
      { field: 'estimated_price', operator: 'lte', value: 160_000_000 }
    ],
    quoted: '2인 이상 견적서 제출 수의계약 | 전기 등 그 밖의 공사 1억 6천만원 이하',
    extraWarnings: []
  },
  {
    category: 'fire',
    categoryLabel: '소방공사(전기 등 그 밖의 공사)',
    method: '수의계약',
    bandText: '2천만원 초과 1억 6천만원 이하',
    conditions: [
      { field: 'estimated_price', operator: 'gt', value: 20_000_000 },
      { field: 'estimated_price', operator: 'lte', value: 160_000_000 }
    ],
    quoted: '2인 이상 견적서 제출 수의계약 | 전기 등 그 밖의 공사 1억 6천만원 이하',
    extraWarnings: []
  },
  {
    category: 'ict',
    categoryLabel: '정보통신공사(전기 등 그 밖의 공사)',
    method: '수의계약',
    bandText: '2천만원 초과 1억 6천만원 이하',
    conditions: [
      { field: 'estimated_price', operator: 'gt', value: 20_000_000 },
      { field: 'estimated_price', operator: 'lte', value: 160_000_000 }
    ],
    quoted: '2인 이상 견적서 제출 수의계약 | 전기 등 그 밖의 공사 1억 6천만원 이하',
    extraWarnings: []
  },
  {
    category: 'construction',
    categoryLabel: '건설공사(전문공사 기준)',
    method: '입찰',
    bandText: '2억원 초과',
    conditions: [{ field: 'estimated_price', operator: 'gt', value: 200_000_000 }],
    quoted: '입찰 | 전문공사 2억원 초과',
    extraWarnings: [
      '종합공사는 4억원 초과가 입찰 — 2억~4억 구간 종합공사는 수의 가능함에도 입찰로 안내됨(보수적·법적으로 안전한 방향). 승인 시 확인'
    ]
  },
  {
    category: 'electric',
    categoryLabel: '전기공사(전기 등 그 밖의 공사)',
    method: '입찰',
    bandText: '1억 6천만원 초과',
    conditions: [{ field: 'estimated_price', operator: 'gt', value: 160_000_000 }],
    quoted: '입찰 | 전기 등 그 밖의 공사 1억 6천만원 초과',
    extraWarnings: []
  },
  {
    category: 'fire',
    categoryLabel: '소방공사(전기 등 그 밖의 공사)',
    method: '입찰',
    bandText: '1억 6천만원 초과',
    conditions: [{ field: 'estimated_price', operator: 'gt', value: 160_000_000 }],
    quoted: '입찰 | 전기 등 그 밖의 공사 1억 6천만원 초과',
    extraWarnings: []
  },
  {
    category: 'ict',
    categoryLabel: '정보통신공사(전기 등 그 밖의 공사)',
    method: '입찰',
    bandText: '1억 6천만원 초과',
    conditions: [{ field: 'estimated_price', operator: 'gt', value: 160_000_000 }],
    quoted: '입찰 | 전기 등 그 밖의 공사 1억 6천만원 초과',
    extraWarnings: []
  }
];

function main(): void {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const now = new Date().toISOString();

  let created = 0;
  const problems: string[] = [];
  for (const spec of SPECS) {
    const id = `construction.method.band.${stableId(spec.method, spec.bandText, spec.category, SOURCE.url)}`;
    const draft: Omit<RuleDefinition, 'createdAt' | 'updatedAt'> & { createdAt?: string } = {
      id,
      version: 1,
      status: 'draft',
      scope: { contract_category: spec.category },
      conditions: spec.conditions,
      output: {
        method: spec.method,
        reviewRequired: true,
        warnings: [DRAFT_WARNING, ...spec.extraWarnings],
        message: `원문 인용: "${spec.quoted}" → ${spec.method} (${spec.categoryLabel}, 추정가격 ${spec.bandText})`
      },
      source: { ...SOURCE },
      candidate: {
        kindOfValue: 'amount',
        quotedSentence: spec.quoted,
        contextBefore: '구분 | 종합공사 | 전문공사 | 전기 등 그 밖의 공사',
        contextAfter: '현장설명: 300억원 이상 의무, 300억원 미만 선택'
      },
      reviewedBy: null,
      supersededBy: null,
      createdAt: now
    };

    // 활성화 가능 형태인지 사전 검증(승인 시 RULE_INVALID 방지)
    const issues = validateActivatableRule(draft as RuleDefinition);
    if (issues.length > 0) {
      problems.push(`${id}: ${issues.map((i) => i.code).join(',')}`);
    }

    store.upsertRule(draft);
    created++;
    console.log(`[draft] ${id}  scope=${spec.category}  ${spec.method}  ${spec.bandText}`);
  }

  console.log(`[done] ${created} drafts upserted (status=draft, 승인 전까지 마법사 미적용)`);
  if (problems.length > 0) {
    console.error('[validate] 활성화 가능 형태 위반:');
    for (const p of problems) console.error(' -', p);
    process.exitCode = 1;
  } else {
    console.log('[validate] 전 초안 validateActivatableRule 통과');
  }
}

main();
