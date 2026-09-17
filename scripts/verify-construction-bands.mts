import fs from 'node:fs';
import path from 'node:path';
import { evaluateWizard } from '../packages/rules/src/engine.js';
import type { RuleDefinition, WizardInput } from '@sen/shared';

/**
 * 공사 계약방법 밴드 초안 시뮬레이션 — 저장된 draft를 메모리에서 active로 간주하고
 * evaluateWizard를 돌려 기대 판정과 비교한다. 저장 데이터는 변경하지 않는다.
 *
 * 사용: pnpm exec tsx scripts/verify-construction-bands.mts [db.json 경로]
 */

const BAND_IDS = [
  'construction.method.band.142a484570f65', // * 수의 ≤2천만
  'construction.method.band.669e08c251fd',  // construction 수의 (2천만,2억]
  'construction.method.band.1f0be526d9b9b1',// electric 수의 (2천만,1.6억]
  'construction.method.band.1d37d4a6d538ac',// fire 수의
  'construction.method.band.17819c28e91193',// ict 수의
  'construction.method.band.1d9894bce8e0d3',// construction 입찰 >2억
  'construction.method.band.13f90b93943149',// electric 입찰 >1.6억
  'construction.method.band.d035709794efe', // fire 입찰
  'construction.method.band.11e09fc0a35b8b' // ict 입찰
];

const dbPath = process.argv[2] ?? path.resolve('data/app-store/db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const drafts: RuleDefinition[] = db.rules.filter((r: RuleDefinition) => BAND_IDS.includes(r.id));
if (drafts.length !== BAND_IDS.length) {
  console.error(`[verify] 밴드 초안 ${BAND_IDS.length}건 중 ${drafts.length}건만 발견 — create-construction-band-drafts.mts를 먼저 실행할 것`);
  process.exit(1);
}
const asActive = drafts.map((d) => ({ ...d, status: 'active' as const }));

const base = {
  workType: '검증용',
  governmentMaterials: false,
  constructionWaste: false,
  emergency: false,
  regionRestriction: false,
  performanceRestriction: false,
  contractPlannedDate: '2026-10-01',
  completionPlannedDate: '2026-12-01',
  organizationType: 'school'
};

const cases: Array<[WizardInput['contractCategory'], number, string]> = [
  ['construction', 15_000_000, '수의계약'],
  ['construction', 20_000_000, '수의계약'],   // 경계: 2천만 이하 → 1인 수의
  ['construction', 20_000_001, '수의계약'],   // 2인 수의 하한 직후
  ['construction', 200_000_000, '수의계약'],  // 경계: 2억 이하 → 2인 수의
  ['construction', 200_000_001, '입찰'],      // 전문 기준 초과 → 입찰
  ['electric', 20_000_000, '수의계약'],
  ['electric', 100_000_000, '수의계약'],
  ['electric', 160_000_000, '수의계약'],      // 경계: 1.6억 이하
  ['electric', 160_000_001, '입찰'],
  ['fire', 50_000_000, '수의계약'],
  ['ict', 200_000_000, '입찰'],
  ['other', 15_000_000, '수의계약'],          // 1인 수의는 전 구분 공통
  ['other', 50_000_000, 'REVIEW_REQUIRED']    // other 상위 밴드 없음 → 검토 필요
];

let fail = 0;
for (const [cat, price, expect] of cases) {
  const input = { ...base, contractCategory: cat, estimatedPrice: price } as WizardInput;
  const { result, conflicts } = evaluateWizard(input, asActive);
  const got = result.decisionState === 'DETERMINED' ? result.recommendedMethod!.method : result.decisionState;
  const ok = got === expect && conflicts.length === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${cat} ${price.toLocaleString()} → ${got} (expect ${expect})${conflicts.length ? ' CONFLICT' : ''}`);
}
console.log(fail === 0 ? '[verify] 전 케이스 통과' : `[verify] ${fail}건 실패`);
process.exitCode = fail ? 1 : 0;
