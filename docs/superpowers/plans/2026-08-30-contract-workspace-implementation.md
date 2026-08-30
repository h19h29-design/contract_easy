# Contract Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 규칙만 안전하게 활성화하고, 계약 프로젝트의 상태·변경·일정·비공개 증빙을 owner/ADMIN 권한 아래 관리하는 최소 업무공간을 완성한다.

**Architecture:** 기존 `RuleDefinition`, 고정 5개 프로젝트 상태, 10개 단계, `AppStore` 동형 계약과 기존 PostgreSQL 테이블을 확장한다. 법적 값은 엄격한 REVIEWER→다른 ADMIN 승인으로만 활성화하고, 프로젝트 데이터는 명시적 사용자 입력과 append-only 이력으로 보존하며, 비공개 파일은 API 파일 경계와 Store 메타데이터 경계를 분리한다.

**Tech Stack:** Node.js 20+, TypeScript 5.6, Fastify 4, Next.js 14 App Router, React 18, Vitest 2, Playwright, Drizzle schema + `pg`, FileStore JSON, Node 표준 `fs/path/crypto`; 신규 외부 의존성 없음.

**Spec:** [`docs/superpowers/specs/2026-08-30-contract-workspace-design.md`](../specs/2026-08-30-contract-workspace-design.md)

## Global Constraints

- 금액·기간·비율·계약방법은 사람이 원문을 확인한 `active` 규칙 외에는 생성하거나 추정하지 않는다.
- `REVIEWER`가 source review를 기록하고, 다른 사용자 ID의 `ADMIN`만 그 버전을 활성화한다.
- `reviewed`, `active`, `superseded` 규칙 정의는 재인제스트로 변경되지 않는다.
- 프로젝트 상태는 `planning -> contracting -> working -> completed -> warranty`의 바로 다음 상태로만 전이한다.
- 변경·검토·상태·증빙 교체 이력은 append-only이며 삭제 API를 만들지 않는다.
- 마일스톤 날짜는 사용자가 `YYYY-MM-DD`로 입력하며 법정 기한을 계산하지 않는다.
- 체크리스트 항목당 현재 증빙 1개, PDF/JPEG/PNG, 최대 `10 * 1024 * 1024` 바이트만 허용한다.
- 증빙은 확장자+선언 MIME+매직바이트를 모두 검증하고 서버 계산 SHA-256으로 프로젝트별 content-addressed 경로에 저장한다.
- owner와 ADMIN만 프로젝트를 접근하며 URL project ID와 모든 하위 resource의 project ID를 함께 검증한다.
- 교체된 규칙·증빙·변경 데이터는 보존하고 자동 삭제하지 않는다.
- FileStore와 PgStore는 같은 입력에 같은 결과 코드와 레코드 형태를 반환한다.
- 비공개 문서는 공개 corpus, normalized 자료, 검색, vector store에 전달하지 않는다.
- 공식 서식 생성, RAG/LLM/agent, 외부 알림, 법적 자동 계산, 프로젝트 멤버 협업, 범용 workflow engine은 구현하지 않는다.
- `.env`, secret, 비공개 파일의 저장 경로와 본문을 Git·API 응답·감사로그에 남기지 않는다.
- 코드 변경 완료 후 관련 좁은 테스트와 전체 `lint/typecheck/test/test:pg/build/test:e2e` 게이트를 통과하고 하니스 문서를 갱신한다.

---

## File Map

### Create

- `packages/shared/src/file.ts` — 파일 매직바이트 판별과 프로젝트 증빙 정책 검증.
- `apps/api/src/project-files.ts` — 비공개 content-addressed 파일 쓰기·경로 검증·다운로드 헤더 생성.
- `apps/api/src/project-files.test.ts` — 파일 권한·중복쓰기·privateRoot 경계 단위 테스트.
- `tests/e2e/seed.ts` — E2E 전용 FileStore에 REVIEWER, 별도 ADMIN, draft 규칙을 서버 기동 전에 시딩.

### Modify

- `packages/shared/src/types.ts` — 규칙 validation issue 타입.
- `packages/shared/src/date.ts` — 엄격한 ISO 날짜와 서울 날짜 비교 helper.
- `packages/shared/src/index.ts` — 새 공통 helper export.
- `packages/rules/src/engine.ts` — fail-closed scope, 활성화 validation, 구간 충돌, `PARTIAL`, as-of 평가.
- `packages/rules/src/index.ts` — validation API export.
- `packages/db/package.json` — 기존 workspace 패키지 `@sen/rules` 의존성 추가.
- `pnpm-lock.yaml` — `@sen/db` importer의 workspace 의존성만 동기화.
- `packages/db/src/app-store.ts` — 규칙 검토·프로젝트 변경·일정·증빙 동형 인터페이스.
- `packages/db/src/store.ts` — 새 레코드 타입, 하위 resource 소속 검증, FileStore 구현과 구 JSON 호환 로딩.
- `packages/db/src/pg-store.ts` — 기존 테이블을 이용한 트랜잭션 구현.
- `workers/ingest/src/sync-db.ts` — 파일→PG 동기화가 승인 상태를 승격하지 않도록 draft-only 규칙 전송.
- `packages/config/src/index.ts` — `webOrigin`, `privateProjects` 경로.
- `workers/crawler/src/attachments.ts` — 공통 매직바이트 helper 재사용.
- `apps/api/src/server.ts` — action별 규칙 API, 상태·변경·일정·증빙 API, IDOR 방지, CORS·초기 암호 안전성.
- `apps/web/app/admin/rules/page.tsx` — source review, hold, 다른 ADMIN activation UI.
- `apps/web/app/workspace/page.tsx` — 개발 기본 암호 노출 제거.
- `apps/web/app/workspace/projects/[id]/page.tsx` — 최소 상태·변경·일정·증빙 UI.
- `apps/web/app/globals.css` — 새 폼과 상태 배지의 기존 디자인 확장.
- `playwright.config.ts` — E2E seed를 API 기동 전에 실행.
- `.env.example` — `WEB_ORIGIN`, `ADMIN_INITIAL_PASSWORD` 운영 요구사항.
- `.gitignore` — `data/private/` 차단.
- `DECISIONS.md`, `SECURITY.md` — 승인 통제와 비공개 증빙 운영 결정.
- `docs/harness/TASKS.md`, `docs/harness/STATUS.md`, `docs/harness/TEST_RESULTS.md` — 완료 증거와 실제 검증 결과.

### Tests

- `packages/rules/src/engine.test.ts`
- `packages/shared/src/shared.test.ts`
- `packages/db/src/store.test.ts`
- `tests/integration/pg-store.pg.test.ts`
- `apps/api/src/server.test.ts`
- `tests/integration/api-pg.pg.test.ts`
- `tests/integration/sync-db.pg.test.ts`
- `tests/e2e/flows.spec.ts`

No SQL migration file is planned. Task 7 first proves that deployed `evidence_path` values are absent before treating that column as a document ID reference.

---

### Task 1: Rule Evaluation Safety and Activation Validation

**Files:**
- Modify: `packages/shared/src/types.ts:92-149`
- Modify: `packages/shared/src/date.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/rules/src/engine.ts:12-195`
- Modify: `packages/rules/src/index.ts`
- Modify: `apps/api/src/server.ts:169-180`
- Test: `packages/shared/src/shared.test.ts`
- Test: `packages/rules/src/engine.test.ts`
- Test: `apps/api/src/server.test.ts`

**Interfaces:**
- Consumes: existing `RuleDefinition`, `RuleCondition`, `WizardInput`, `WizardResult` from `@sen/shared`.
- Produces:

```ts
export interface RuleValidationIssue {
  code: 'UNKNOWN_SCOPE' | 'INVALID_SOURCE' | 'INVALID_CONDITION' | 'MISSING_METHOD' | 'FUTURE_EFFECTIVE_DATE';
  message: string;
}

export function validateActivatableRule(rule: RuleDefinition, options?: { asOfDate?: string }): RuleValidationIssue[];
export function detectConflicts(rules: RuleDefinition[]): RuleConflict[];
export function isIsoDate(value: string): boolean;
export function seoulDate(value: Date): string;
export function evaluateWizard(
  input: WizardInput,
  rules: RuleDefinition[],
  options?: { asOfDate?: string }
): { result: WizardResult; conflicts: RuleConflict[] };
```

- [ ] **Step 1: Add failing fail-closed and boundary tests**

```ts
it('알 수 없는 scope 키는 활성화 검증에서 거부', () => {
  const issues = validateActivatableRule(rule({ scope: { contract_catgory: 'construction' } }));
  expect(issues.map((x) => x.code)).toContain('UNKNOWN_SCOPE');
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

it('method 없는 active 보조 규칙만 매칭되면 PARTIAL', () => {
  const { result } = evaluateWizard(input(), [rule({ status: 'active', output: { documents: ['plan|검토서'] } })]);
  expect(result.decisionState).toBe('PARTIAL');
  expect(result.recommendedMethod).toBeUndefined();
});

it('계약예정일보다 미래 시행 규칙은 적용하지 않음', () => {
  const { result } = evaluateWizard(input(), [rule({
    status: 'active',
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

it('실재하지 않는 원문 확인일은 활성화 검증에서 거부', () => {
  const invalidDate = rule({ source: {
    title: '테스트 원문', url: 'https://example.org/rule',
    effectiveFrom: '2026-01-01', checkedAt: '2026-02-30'
  } });
  expect(validateActivatableRule(invalidDate).map((x) => x.code)).toContain('INVALID_SOURCE');
});
```

- [ ] **Step 2: Run the rule test and confirm the red state**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts packages/rules/src/engine.test.ts`

Expected: FAIL because `validateActivatableRule` is not exported, generalized `gt/gte/lt/lte` conflict detection is absent, and a method-less match currently dereferences an undefined primary rule.

Run: `pnpm exec vitest run apps/api/src/server.test.ts`

Expected: FAIL because the wizard route does not pass the contract-planned/server Seoul date into Store filtering and evaluation.

- [ ] **Step 3: Implement the smallest closed validation surface**

```ts
const ALLOWED_SCOPE_KEYS = new Set([
  'contract_category', 'organization_type', 'emergency',
  'government_materials', 'construction_waste'
]);

export function validateActivatableRule(rule: RuleDefinition, options: { asOfDate?: string } = {}): RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];
  for (const key of Object.keys(rule.scope)) {
    if (!ALLOWED_SCOPE_KEYS.has(key)) issues.push({ code: 'UNKNOWN_SCOPE', message: `지원하지 않는 scope: ${key}` });
  }
  if (!rule.source.title.trim() || !rule.source.url.startsWith('https://') || !isIsoDate(rule.source.checkedAt)) {
    issues.push({ code: 'INVALID_SOURCE', message: 'HTTPS 원문 URL, 제목, 확인일이 필요합니다.' });
  }
  if (!rule.output.method?.trim()) issues.push({ code: 'MISSING_METHOD', message: '계약방법 출력이 필요합니다.' });
  if (options.asOfDate && rule.source.effectiveFrom && rule.source.effectiveFrom > options.asOfDate) {
    issues.push({ code: 'FUTURE_EFFECTIVE_DATE', message: '기준일 이후 시행 규칙입니다.' });
  }
  if (rule.conditions.length === 0 || rule.conditions.some((c) => c.field !== 'estimated_price' || !['gt', 'gte', 'lt', 'lte', 'between'].includes(c.operator))) {
    issues.push({ code: 'INVALID_CONDITION', message: '지원되는 추정가격 조건이 필요합니다.' });
  }
  return issues;
}
```

Implement `isIsoDate` with an anchored regex and UTC calendar round-trip and `seoulDate` with `Intl.DateTimeFormat(..., { timeZone: 'Asia/Seoul' })`; export both from `@sen/shared`. Use strict dates for `checkedAt`, `effectiveFrom`, and `asOfDate`. Update `matchesScope` so the default branch returns `false`. Normalize each price condition to lower/upper bounds with inclusive flags, and have `detectConflicts` compare normalized intervals only when scopes are key-sorted equal. In `evaluateWizard`, return `PARTIAL` when matches exist but none has `output.method`.

In `/api/wizard`, derive `const asOfDate = input.contractPlannedDate ?? seoulDate(new Date())`, pass it to both `getActiveRules(asOfDate)` and `evaluateWizard(input, activeRules, { asOfDate })`, and add an API test showing that a future-effective active rule returns `REVIEW_REQUIRED`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts packages/rules/src/engine.test.ts`

Expected: PASS, including existing ±1원 and active-only tests.

Run: `pnpm exec vitest run apps/api/src/server.test.ts`

Expected: PASS for future-effective wizard refusal.

Run: `pnpm --filter @sen/rules typecheck`

Expected: PASS with no unsafe `undefined` primary rule access.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/shared/src/types.ts packages/shared/src/date.ts packages/shared/src/index.ts packages/shared/src/shared.test.ts packages/rules/src/engine.ts packages/rules/src/index.ts packages/rules/src/engine.test.ts apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "fix: make rule evaluation fail closed"
```

---

### Task 2: FileStore Rule Immutability and Strict Review Contract

**Files:**
- Modify: `packages/db/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/db/src/store.ts:30-372`
- Test: `packages/db/src/store.test.ts`

**Interfaces:**
- Consumes: `validateActivatableRule` and `detectConflicts` from Task 1.
- Produces:

```ts
export interface RuleReviewRecord {
  id: string;
  ruleVersionId: string;
  actorUserId: string;
  action: 'approve' | 'hold' | 'activate';
  comment: string | null;
  at: string;
}

export type RuleActionErrorCode =
  | 'NOT_FOUND' | 'INVALID_STATE' | 'ROLE_REQUIRED'
  | 'SOURCE_CONFIRMATION_REQUIRED' | 'MISSING_REVIEW'
  | 'SAME_ACTOR' | 'RULE_INVALID' | 'RULE_CONFLICT'
  | 'VERSION_CONFLICT';

export type RuleActionResult =
  | { ok: true; rule: RuleDefinition }
  | { ok: false; code: RuleActionErrorCode };

createRuleRevision(def: RuleDefinition, actorUserId: string): RuleActionResult;
approveRuleReview(ruleId: string, version: number, reviewerId: string, comment: string, sourceConfirmed: boolean): RuleActionResult;
holdRule(ruleId: string, version: number, reviewerId: string, comment: string): RuleActionResult;
activateReviewedRule(ruleId: string, version: number, adminId: string, asOfDate: string): RuleActionResult;
listRuleReviews(ruleId: string, version: number): RuleReviewRecord[];
```

Task 2 adds these final-named methods directly to `FileStore` while retaining the old `AppStore.reviewRule/activateRule` methods for API compile compatibility. Task 3 adds the new methods to `AppStore` and PgStore. Task 8 switches the API and removes the old methods from both Store implementations and the interface.

- [ ] **Step 1: Add failing FileStore approval tests**

```ts
it('재인제스트가 reviewed 정의를 덮어쓰지 않음', () => {
  const { store, reviewer } = ruleStore();
  store.upsertRule(baseRule('safe', 1, 'draft', '입찰'));
  expect(store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true).ok).toBe(true);
  store.upsertRule(baseRule('safe', 1, 'draft', '수의계약'));
  expect(store.listRules().find((r) => r.id === 'safe')?.output.method).toBe('입찰');
});

it('reviewer와 같은 사용자 ID는 admin이 되어도 activate 불가', () => {
  const { store, dir, reviewer } = ruleStore();
  store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true);
  const file = path.join(dir, 'db.json');
  const db = JSON.parse(fs.readFileSync(file, 'utf8')) as DbData;
  db.users.find((u) => u.id === reviewer.id)!.role = 'ADMIN';
  fs.writeFileSync(file, JSON.stringify(db), 'utf8');
  const reloaded = new FileStore(dir);
  expect(reloaded.activateReviewedRule('safe', 1, reviewer.id, '2026-08-30')).toEqual({ ok: false, code: 'SAME_ACTOR' });
});

it('별도 ADMIN이 reviewed 규칙을 activate', () => {
  const { store, reviewer, admin } = ruleStore();
  store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true);
  expect(store.activateReviewedRule('safe', 1, admin.id, '2026-08-30')).toMatchObject({ ok: true, rule: { status: 'active' } });
  expect(store.listRuleReviews('safe', 1).map((r) => r.action)).toEqual(['approve', 'activate']);
});

it('hold는 draft와 검토기록을 보존', () => {
  const { store, reviewer } = ruleStore();
  store.upsertRule(baseRule('candidate.held', 1, 'draft', '입찰'));
  expect(store.holdRule('candidate.held', 1, reviewer.id, '경계 재확인').ok).toBe(true);
  expect(store.listRules()).toContainEqual(expect.objectContaining({ id: 'candidate.held', status: 'draft' }));
  expect(store.listRuleReviews('candidate.held', 1)[0]?.action).toBe('hold');
  expect(store.purgeStaleCandidateDrafts([])).toBe(0);
});

it('upsert 입력 상태로 승인을 우회하지 못함', () => {
  const { store } = ruleStore();
  store.upsertRule(baseRule('candidate.injected', 1, 'active', '입찰'));
  expect(store.listRules().find((r) => r.id === 'candidate.injected')?.status).toBe('draft');
});
```

- [ ] **Step 2: Run FileStore tests and confirm the red state**

Run: `pnpm exec vitest run packages/db/src/store.test.ts`

Expected: FAIL because rule review records, discriminated results, `holdRule`, revision creation, role checks, and immutable reviewed definitions do not exist.

- [ ] **Step 3: Add records and backward-compatible JSON loading**

Add the exact field `ruleReviews: RuleReviewRecord[]` to the existing `DbData` interface without changing its other fields:

```ts
ruleReviews: RuleReviewRecord[];

const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<DbData>;
this.data = { ...emptyDb(), ...parsed, sessions: parsed.sessions ?? {}, projects: parsed.projects ?? {}, sources: parsed.sources ?? {} };
```

Add `ruleReviews: []` to `emptyDb()`. Add `@sen/rules: "workspace:*"` to `packages/db/package.json`, run `pnpm install --lockfile-only`, verify that only the `@sen/db` workspace importer changes in `pnpm-lock.yaml`, and import Task 1 validators.

- [ ] **Step 4: Implement immutable revisions and strict actors**

For `upsertRule`, force all new/imported definitions to `draft` and return without changing the stored definition when the existing status is not `draft`; callers cannot insert `reviewed` or `active` directly. `createRuleRevision` requires an exact `REVIEWER`, `status='draft'`, and `version === maxVersion + 1`. `approveRuleReview` requires exact role `REVIEWER`, `sourceConfirmed === true`, a non-empty comment, draft status, and zero validation issues. `activateReviewedRule` requires exact role `ADMIN`, reviewed status, the latest approve record, a different actor ID, zero validation issues for the required server-supplied Seoul `asOfDate`, and zero conflicts after temporarily treating the target as active. `purgeStaleCandidateDrafts` may remove only candidate drafts with no review records; a hold record protects the candidate.

```ts
if (user?.role !== 'REVIEWER') return { ok: false, code: 'ROLE_REQUIRED' };
if (!sourceConfirmed || !comment.trim()) return { ok: false, code: 'SOURCE_CONFIRMATION_REQUIRED' };

const approval = reviews.filter((r) => r.action === 'approve').at(-1);
if (!approval) return { ok: false, code: 'MISSING_REVIEW' };
if (approval.actorUserId === adminId) return { ok: false, code: 'SAME_ACTOR' };
```

Each successful review/hold/activate adds one `RuleReviewRecord` and one audit record before a single `flush()`.

- [ ] **Step 5: Run FileStore tests and typecheck**

Run: `pnpm exec vitest run packages/db/src/store.test.ts`

Expected: PASS with immutable definition, two-person activation, preserved hold, and existing source/project tests.

Run: `pnpm --filter @sen/db typecheck`

Expected: PASS because Task 2 adds FileStore methods without changing the shared `AppStore` contract yet.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/db/package.json pnpm-lock.yaml packages/db/src/store.ts packages/db/src/store.test.ts
git commit -m "feat: protect FileStore rule approvals"
```

---

### Task 3: PgStore Rule Review Parity and Atomic Activation

**Files:**
- Modify: `packages/db/src/app-store.ts:1-76`
- Modify: `packages/db/src/pg-store.ts:250-380`
- Modify: `workers/ingest/src/sync-db.ts:73-88`
- Test: `tests/integration/pg-store.pg.test.ts:75-105`
- Test: `tests/integration/sync-db.pg.test.ts`

**Interfaces:**
- Consumes: all Task 2 `AppStore` signatures and Task 1 rule validators.
- Produces: PgStore behavior identical to FileStore for revision, approve, hold, activate, review listing, error codes, and audit actor.

- [ ] **Step 1: Add failing PostgreSQL approval tests**

```ts
it('PG에서 REVIEWER와 다른 ADMIN만 activate', async () => {
  const reviewer = await store.createUser(user('reviewer-rule', 'REVIEWER'));
  const admin = await store.createUser(user('admin-rule', 'ADMIN'));
  await store.upsertRule(baseRule('pg.strict', 1, 'draft'));
  expect((await store.approveRuleReview('pg.strict', 1, reviewer.id, '원문 확인', true)).ok).toBe(true);
  expect(await store.activateReviewedRule('pg.strict', 1, reviewer.id, '2026-08-30')).toEqual({ ok: false, code: 'ROLE_REQUIRED' });
  expect((await store.activateReviewedRule('pg.strict', 1, admin.id, '2026-08-30')).ok).toBe(true);
});

it('PG hold는 rule_version을 삭제하지 않음', async () => {
  const reviewer = await store.createUser(user('reviewer-hold', 'REVIEWER'));
  await store.upsertRule(baseRule('pg.hold', 1, 'draft'));
  await store.holdRule('pg.hold', 1, reviewer.id, '추가 확인');
  expect((await store.listRules()).some((r) => r.id === 'pg.hold')).toBe(true);
  expect((await store.listRuleReviews('pg.hold', 1))[0]?.action).toBe('hold');
});

it('PG upsert와 sync가 active 상태를 직접 주입하지 않음', async () => {
  await store.upsertRule(baseRule('pg.injected', 1, 'active'));
  expect((await store.listRules()).find((r) => r.id === 'pg.injected')?.status).toBe('draft');
});
```

- [ ] **Step 2: Run the PG test and confirm the red state**

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/pg-store.pg.test.ts`

Expected: FAIL because PgStore and `AppStore` do not yet expose `approveRuleReview`, `activateReviewedRule`, `holdRule`, revision creation, or review listing.

- [ ] **Step 3: Implement transaction-scoped review and activation**

Add the Task 2 final-named methods to `AppStore` while retaining the old methods until Task 8 switches the API. Use the existing `rule_reviews` table. `approveRuleReview` and `holdRule` lock the target version and validate the actor role. `activateReviewedRule` starts a transaction, locks `rule_versions` and `rule_reviews`, reads the target, actor and latest approve record, runs Task 1 validation/conflict detection, supersedes the prior active version, activates the target, inserts `rule_reviews.action='activate'`, inserts one audit row, and commits.

```sql
LOCK TABLE rule_versions, rule_reviews IN SHARE ROW EXCLUSIVE MODE;
SELECT id, status, definition FROM rule_versions WHERE rule_id=$1 AND version=$2 FOR UPDATE;
SELECT reviewer, action FROM rule_reviews
 WHERE rule_version_id=$1 AND action='approve' ORDER BY at DESC LIMIT 1;
```

Map `RuleReviewRecord.actorUserId` to the existing `rule_reviews.reviewer` column for review, hold, and activation. `createRuleRevision` inserts the exact next version or returns `VERSION_CONFLICT` on concurrent creation. Make `upsertRule` mirror FileStore: new/imported versions are draft-only and non-draft existing definitions are immutable. Protect held candidate drafts in `purgeStaleCandidateDrafts` with `NOT EXISTS (SELECT 1 FROM rule_reviews ...)`.

Change `syncDatabase` to send `{ ...rule, status: 'draft' }` to PgStore and update `sync-db.pg.test.ts` to expect a source-side active rule to arrive as draft on an empty target. Replace fixture cleanup through legacy rejection with `purgeStaleCandidateDrafts([])`. Existing non-draft target versions remain immutable, but synchronization never establishes approval state.

- [ ] **Step 4: Run rule Store parity tests**

Run: `pnpm exec vitest run packages/db/src/store.test.ts`

Expected: PASS.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/pg-store.pg.test.ts`

Expected: PASS with PostgreSQL review rows and atomic activation.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/sync-db.pg.test.ts`

Expected: PASS with draft-only import and held-draft preservation.

Run: `pnpm --filter @sen/db typecheck`

Expected: PASS; FileStore and PgStore both satisfy `AppStore`.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/db/src/app-store.ts packages/db/src/pg-store.ts workers/ingest/src/sync-db.ts tests/integration/pg-store.pg.test.ts tests/integration/sync-db.pg.test.ts
git commit -m "feat: enforce PgStore two-person approval"
```

---

### Task 4: Project State, Change, and Event FileStore Model

**Files:**
- Modify: `packages/shared/src/date.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/db/src/store.ts:44-83,92-118,430-520`
- Test: `packages/shared/src/shared.test.ts`
- Test: `packages/db/src/store.test.ts`

**Interfaces:**
- Consumes: existing `ProjectRecord` and `audit()`.
- Produces:

```ts
export type ProjectStatus = 'planning' | 'contracting' | 'working' | 'completed' | 'warranty';
export type ProjectChangeType = 'design' | 'duration' | 'amount' | 'other' | 'status';
export type ProjectEventKind = 'deadline' | 'milestone' | 'inspection' | 'payment' | 'other';

export interface ProjectChangeRecord {
  id: string; projectId: string; changeType: ProjectChangeType;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  reason: string; approvedBy: string; at: string;
}

export interface ProjectEventRecord {
  id: string; projectId: string; kind: ProjectEventKind;
  title: string; dueDate: string; createdAt: string;
}

export type ProjectTransitionResult =
  | { ok: true; project: ProjectRecord; change: ProjectChangeRecord }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_TRANSITION' };

transitionProjectStatus(projectId: string, next: ProjectStatus, actorUserId: string, reason: string): MaybeP<ProjectTransitionResult>;
addProjectChange(projectId: string, changeType: Exclude<ProjectChangeType, 'status'>, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string, actorUserId: string): MaybeP<ProjectChangeRecord | null>;
listProjectChanges(projectId: string): MaybeP<ProjectChangeRecord[]>;
addProjectEvent(projectId: string, kind: ProjectEventKind, title: string, dueDate: string, actorUserId: string): MaybeP<ProjectEventRecord | null>;
listProjectEvents(projectId: string): MaybeP<ProjectEventRecord[]>;

export function milestoneState(dueDate: string, today: string): 'upcoming' | 'today' | 'overdue';
```

Task 4 adds these methods directly to `FileStore`. Task 5 promotes the exact signatures into `AppStore` when PgStore is ready, so each commit remains type-correct.

- [ ] **Step 1: Add failing date and FileStore lifecycle tests**

```ts
it('실재하는 YYYY-MM-DD만 허용', () => {
  expect(isIsoDate('2026-02-28')).toBe(true);
  expect(isIsoDate('2026-02-30')).toBe(false);
  expect(isIsoDate('2026-02-28extra')).toBe(false);
});

it('프로젝트 상태는 바로 다음 상태로만 전이', () => {
  const { store, project, owner } = projectStore();
  expect(store.transitionProjectStatus(project.id, 'working', owner.id, '착공')).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
  const result = store.transitionProjectStatus(project.id, 'contracting', owner.id, '계약 절차 시작');
  expect(result).toMatchObject({ ok: true, project: { status: 'contracting' }, change: { changeType: 'status' } });
});

it('변경과 이벤트를 append-only로 조회', () => {
  const { store, project, owner } = projectStore();
  store.addProjectChange(project.id, 'amount', { amount: 10 }, { amount: 11 }, '사용자 입력 변경', owner.id);
  store.addProjectEvent(project.id, 'inspection', '준공검사 예정', '2026-12-20', owner.id);
  expect(store.listProjectChanges(project.id)[0]).toMatchObject({ approvedBy: owner.id, reason: '사용자 입력 변경' });
  expect(store.listProjectEvents(project.id)[0]).toMatchObject({ dueDate: '2026-12-20' });
});
```

- [ ] **Step 2: Run tests and confirm the red state**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts`

Expected: FAIL because ISO/서울 날짜 helpers and project transition/change/event records do not exist.

- [ ] **Step 3: Implement date helpers and fixed transitions**

```ts
export const NEXT_PROJECT_STATUS: Record<ProjectStatus, ProjectStatus | null> = {
  planning: 'contracting', contracting: 'working', working: 'completed',
  completed: 'warranty', warranty: null
};

export function milestoneState(dueDate: string, today: string) {
  return dueDate < today ? 'overdue' : dueDate === today ? 'today' : 'upcoming';
}
```

Reuse Task 1 `isIsoDate` and `seoulDate`.

- [ ] **Step 4: Implement FileStore append-only records**

Add `projectChanges` and `projectEvents` arrays to `DbData`, `emptyDb()`, and backward-compatible loading. `transitionProjectStatus` checks `NEXT_PROJECT_STATUS[current] === next`, updates the project, appends one status change and one audit record, then flushes once. General changes and events append records, audit once, and never mutate prior records.

- [ ] **Step 5: Run focused tests**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts`

Expected: PASS for strict date parsing, three milestone states, forward-only transitions, and append-only lists.

- [ ] **Step 6: Run FileStore typecheck and commit Task 4**

Run: `pnpm --filter @sen/db typecheck`

Expected: PASS because the new methods are additional FileStore methods and do not alter `AppStore` yet.

```bash
git add packages/shared/src/date.ts packages/shared/src/index.ts packages/shared/src/shared.test.ts packages/db/src/store.ts packages/db/src/store.test.ts
git commit -m "feat: add FileStore project lifecycle records"
```

---

### Task 5: PostgreSQL Project Lifecycle Parity

**Files:**
- Modify: `packages/db/src/app-store.ts:55-76`
- Modify: `packages/db/src/pg-store.ts:462-602,700-785`
- Test: `tests/integration/pg-store.pg.test.ts:107-134`

**Interfaces:**
- Consumes: Task 4 project records, result types, date helpers and `AppStore` methods.
- Produces: atomic PgStore status transitions and append-only changes/events with the same serialized records as FileStore.

- [ ] **Step 1: Add failing PgStore lifecycle test**

```ts
it('PG 상태 전이와 변경행이 한 트랜잭션으로 저장', async () => {
  const result = await store.transitionProjectStatus(project.id, 'contracting', owner.id, '계약 시작');
  expect(result).toMatchObject({ ok: true, project: { status: 'contracting' } });
  expect((await store.listProjectChanges(project.id))[0]).toMatchObject({
    changeType: 'status', before: { status: 'planning' }, after: { status: 'contracting' }, approvedBy: owner.id
  });
});

it('PG event due_at을 서울 날짜로 왕복', async () => {
  await store.addProjectEvent(project.id, 'inspection', '검사', '2026-12-20', owner.id);
  expect((await store.listProjectEvents(project.id))[0]?.dueDate).toBe('2026-12-20');
});
```

- [ ] **Step 2: Run the PG test and confirm the red state**

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/pg-store.pg.test.ts`

Expected: FAIL because PgStore lacks transition/event/list methods and the old `addProjectChange` returns only an ID.

- [ ] **Step 3: Implement SQL mappings and transaction**

Add the Task 4 lifecycle signatures to `AppStore`. `transitionProjectStatus` uses `SELECT ... FOR UPDATE`, validates the exact next state, updates `contract_projects`, inserts the `project_changes` status row with `approved_by=actorUserId`, inserts one audit row, and commits. Save event dates as `${dueDate}T00:00:00+09:00`; map them back through `seoulDate`.

```sql
SELECT status FROM contract_projects WHERE id=$1 FOR UPDATE;
UPDATE contract_projects SET status=$2, updated_at=$3 WHERE id=$1;
INSERT INTO project_changes
  (id, project_id, change_type, "before", "after", reason, approved_by, at)
VALUES ($1,$2,'status',$3::jsonb,$4::jsonb,$5,$6,$7);
```

General `addProjectChange` does not update project amount/duration fields. Event and change lists order by `at DESC` and `created_at DESC`.

- [ ] **Step 4: Run FileStore/PgStore parity checks**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts`

Expected: PASS.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/pg-store.pg.test.ts`

Expected: PASS.

Run: `pnpm --filter @sen/db typecheck`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add packages/db/src/app-store.ts packages/db/src/pg-store.ts tests/integration/pg-store.pg.test.ts
git commit -m "feat: add PgStore project lifecycle parity"
```

---

### Task 6: Evidence File Validation Helpers

**Files:**
- Create: `packages/shared/src/file.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `workers/crawler/src/attachments.ts:27-50,103-105`
- Test: `packages/shared/src/shared.test.ts`
- Test: `workers/crawler/src/crawler.test.ts`

**Interfaces:**
- Consumes: `safeFileName`, `extOf`, `sha256Hex` from `@sen/shared`.
- Produces:

```ts
export type DetectedFileKind =
  | 'pdf' | 'hwpx' | 'docx' | 'xlsx' | 'zip'
  | 'doc' | 'xls' | 'hwp' | 'ole' | 'jpg' | 'png' | 'gif';

export type EvidenceMime = 'application/pdf' | 'image/jpeg' | 'image/png';
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export type EvidenceValidationResult =
  | { ok: true; ext: 'pdf' | 'jpg' | 'png'; mimeType: EvidenceMime; sha256: string; sizeBytes: number; originalName: string }
  | { ok: false; code: 'EMPTY_FILE' | 'TOO_LARGE' | 'UNSUPPORTED_EXTENSION' | 'MIME_MISMATCH' | 'MAGIC_MISMATCH' };

export function detectFileKind(bytes: Buffer, hintName?: string): DetectedFileKind | null;
export function validateEvidenceFile(bytes: Buffer, originalName: string, declaredMime: string): EvidenceValidationResult;
```

- [ ] **Step 1: Add failing exact-format tests**

```ts
it('PDF 확장자+MIME+magic가 모두 일치해야 승인', () => {
  expect(validateEvidenceFile(Buffer.from('%PDF-1.4\n'), 'proof.pdf', 'application/pdf')).toMatchObject({ ok: true, ext: 'pdf' });
  expect(validateEvidenceFile(Buffer.from('%PDF-1.4\n'), 'proof.png', 'image/png')).toEqual({ ok: false, code: 'MAGIC_MISMATCH' });
});

it('빈 파일과 10 MiB 초과를 거부', () => {
  expect(validateEvidenceFile(Buffer.alloc(0), 'x.pdf', 'application/pdf')).toEqual({ ok: false, code: 'EMPTY_FILE' });
  expect(validateEvidenceFile(Buffer.alloc(EVIDENCE_MAX_BYTES + 1), 'x.pdf', 'application/pdf')).toEqual({ ok: false, code: 'TOO_LARGE' });
});

it('경로 입력은 표시용 basename으로 정규화', () => {
  const result = validateEvidenceFile(Buffer.from('%PDF-1.4\n'), '../../계약서.pdf', 'application/pdf');
  expect(result).toMatchObject({ ok: true, originalName: '계약서.pdf' });
});

it.each([
  ['photo.jpeg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'jpg'],
  ['scan.png', 'image/png', Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'png']
])('%s의 확장자·MIME·magic을 함께 승인', (name, mime, bytes, ext) => {
  expect(validateEvidenceFile(bytes, name, mime)).toMatchObject({ ok: true, ext });
});

it('이중 확장자 실행파일은 거부', () => {
  expect(validateEvidenceFile(Buffer.from('%PDF-1.4\n'), 'proof.pdf.exe', 'application/pdf'))
    .toEqual({ ok: false, code: 'UNSUPPORTED_EXTENSION' });
});
```

- [ ] **Step 2: Run shared tests and confirm the red state**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts workers/crawler/src/crawler.test.ts`

Expected: FAIL because `validateEvidenceFile` and the shared `detectFileKind` do not exist.

- [ ] **Step 3: Move magic detection to shared and enforce the evidence matrix**

Keep all existing crawler kinds in `detectFileKind`. Reuse the existing Buffer-compatible `sha256Hex` unchanged. `validateEvidenceFile` accepts only the following exact map:

```ts
const EVIDENCE_TYPES = {
  pdf: { mimeType: 'application/pdf', kind: 'pdf' },
  jpg: { mimeType: 'image/jpeg', kind: 'jpg' },
  jpeg: { mimeType: 'image/jpeg', kind: 'jpg' },
  png: { mimeType: 'image/png', kind: 'png' }
} as const;
```

Replace the crawler-local `detectKind` implementation with an import and a compatibility export:

```ts
export const detectKind = detectFileKind;
```

- [ ] **Step 4: Run tests and package typechecks**

Run: `pnpm exec vitest run packages/shared/src/shared.test.ts workers/crawler/src/crawler.test.ts`

Expected: PASS, including crawler PDF/ZIP/OLE behavior and project evidence rejections.

Run: `pnpm --filter @sen/shared typecheck`

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add packages/shared/src/file.ts packages/shared/src/index.ts packages/shared/src/shared.test.ts workers/crawler/src/attachments.ts workers/crawler/src/crawler.test.ts
git commit -m "feat: validate private evidence file types"
```

---

### Task 7: Evidence Metadata and Store Parity

**Files:**
- Modify: `packages/db/src/app-store.ts`
- Modify: `packages/db/src/store.ts:65-83,98-118,430-520`
- Modify: `packages/db/src/pg-store.ts:536-602,700-785`
- Test: `packages/db/src/store.test.ts`
- Test: `tests/integration/pg-store.pg.test.ts`

**Interfaces:**
- Consumes: project/checklist records and actual file metadata produced by Task 6/API file service.
- Produces:

```ts
export interface ProjectDocumentRecord {
  id: string; projectId: string; uploadedBy: string;
  originalName: string; storedPath: string; mimeType: string;
  sizeBytes: number; sha256: string; isPrivate: true; uploadedAt: string;
}

export interface ChecklistItemRecord {
  id: string;
  stepId: string;
  projectId: string;
  label: string;
  done: boolean;
  required: boolean;
  evidencePath: string | null; // current project_documents.id
  updatedAt: string;
}

export interface EvidenceLinkResult {
  document: ProjectDocumentRecord;
  previousDocumentId: string | null;
}

saveChecklistEvidence(input: {
  projectId: string; checklistItemId: string; uploadedBy: string;
  originalName: string; storedPath: string; mimeType: string;
  sizeBytes: number; sha256: string;
}): MaybeP<EvidenceLinkResult | null>;
listProjectDocuments(projectId: string): MaybeP<ProjectDocumentRecord[]>;
getProjectDocument(projectId: string, documentId: string): MaybeP<ProjectDocumentRecord | null>;
```

- [ ] **Step 1: Verify the no-migration premise before coding**

Run for FileStore: `jq '[.checklist[] | select(.evidencePath != null)] | length' data/app-store/db.json`

Expected: `0`.

Run when `DATABASE_URL` is available: `pnpm exec tsx -e 'import pg from "pg"; const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}); const {rows}=await pool.query("select count(*)::int as count from project_checklist_items where evidence_path is not null"); console.log(rows[0].count); await pool.end();'`

Expected: `0`. If the command cannot run because no operational DB is configured, record “운영 DB 미연결로 구현 전 배포 시 재확인” in the task evidence; do not claim a pass and do not create a speculative migration.

- [ ] **Step 2: Add failing FileStore and PgStore evidence tests**

```ts
it('증빙 교체가 이전 document를 보존', async () => {
  const first = await store.saveChecklistEvidence(docInput(project.id, item.id, 'a'.repeat(64)));
  const second = await store.saveChecklistEvidence(docInput(project.id, item.id, 'b'.repeat(64)));
  expect(second?.previousDocumentId).toBe(first?.document.id);
  expect(await store.listProjectDocuments(project.id)).toHaveLength(2);
  expect((await store.checklistOf(project.id))[0]?.evidencePath).toBe(second?.document.id);
});

it('다른 프로젝트 item에 document를 연결하지 않음', async () => {
  expect(await store.saveChecklistEvidence(docInput(projectA.id, itemB.id, 'c'.repeat(64)))).toBeNull();
  expect((await store.checklistOf(projectB.id))[0]?.evidencePath).toBeNull();
});
```

- [ ] **Step 3: Run Store tests and confirm the red state**

Run: `pnpm exec vitest run packages/db/src/store.test.ts`

Expected: FAIL because document arrays and evidence methods are absent.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/pg-store.pg.test.ts`

Expected: FAIL because PgStore does not expose existing `project_documents`/`evidence_path` through `AppStore`.

- [ ] **Step 4: Implement FileStore evidence linking**

Add `projectDocuments: ProjectDocumentRecord[]` to backward-compatible `DbData`. `saveChecklistEvidence` first finds the item with both `id === checklistItemId` and `projectId === projectId`; on mismatch return null without mutation. Append the new document, set `evidencePath=document.id`, append one audit detail containing `checklistItemId`, `previousDocumentId`, `newDocumentId`, `sha256`, then flush once.

- [ ] **Step 5: Implement PgStore evidence transaction**

Use one transaction and lock the checklist item by both IDs:

```sql
SELECT evidence_path FROM project_checklist_items
 WHERE id=$1 AND project_id=$2 FOR UPDATE;
INSERT INTO project_documents
 (id, project_id, uploaded_by, original_name, stored_path, mime_type, size_bytes, sha256, is_private, uploaded_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9);
UPDATE project_checklist_items SET evidence_path=$3, updated_at=$4
 WHERE id=$1 AND project_id=$2;
```

Insert the same safe audit detail as FileStore. Never include `storedPath` in audit detail.

- [ ] **Step 6: Run Store parity tests**

Run: `pnpm exec vitest run packages/db/src/store.test.ts`

Expected: PASS.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/pg-store.pg.test.ts`

Expected: PASS.

Run: `pnpm --filter @sen/db typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add packages/db/src/app-store.ts packages/db/src/store.ts packages/db/src/pg-store.ts packages/db/src/store.test.ts tests/integration/pg-store.pg.test.ts
git commit -m "feat: persist checklist evidence metadata"
```

---

### Task 8: Rule Admin API, CORS, and Production Bootstrap Safety

**Files:**
- Modify: `packages/db/src/app-store.ts`
- Modify: `packages/db/src/store.ts`
- Modify: `packages/db/src/pg-store.ts`
- Modify: `packages/config/src/index.ts:12-57,79-100`
- Modify: `apps/api/src/server.ts:25-109,363-385`
- Modify: `apps/api/src/server.test.ts`
- Modify: `tests/integration/api-pg.pg.test.ts`
- Modify: `apps/web/app/workspace/page.tsx:94-97`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Task 2-3 `RuleActionResult`, Task 1 validation, existing session/CSRF helpers.
- Produces:

```ts
type RuleAdminBody =
  | { action: 'review'; comment: string; sourceConfirmed: true }
  | { action: 'hold'; comment: string }
  | { action: 'activate' };

interface MethodBandRevisionBody {
  method: string;
  lower: number | null;
  lowerInclusive: boolean;
  upper: number | null;
  upperInclusive: boolean;
  message: string;
  source: { title: string; url: string; effectiveFrom: string | null; checkedAt: string };
}
```

`POST /api/admin/rules/:id/:version` handles review/hold/activate. `POST /api/admin/rules/:id/:version/revisions` converts the controlled method-band payload into the next draft version; it does not accept arbitrary conditions JSON.

- [ ] **Step 1: Add failing API authorization tests**

```ts
it('REVIEWER review 후 같은 ID activation을 거부하고 다른 ADMIN은 성공', async () => {
  const reviewed = await injectAs(reviewer, 'POST', '/api/admin/rules/strict/1', {
    action: 'review', comment: '원문과 경계 확인', sourceConfirmed: true
  });
  expect(reviewed.statusCode).toBe(200);
  expect((await injectAs(reviewerPromotedToAdmin, 'POST', '/api/admin/rules/strict/1', { action: 'activate' })).statusCode).toBe(409);
  expect((await injectAs(admin2, 'POST', '/api/admin/rules/strict/1', { action: 'activate' })).statusCode).toBe(200);
});

it('sourceConfirmed 없는 review를 400으로 거부', async () => {
  const res = await injectAs(reviewer, 'POST', '/api/admin/rules/strict/1', { action: 'review', comment: '확인' });
  expect(res.statusCode).toBe(400);
});
```

Add a production bootstrap test that sets `NODE_ENV=production`, removes `ADMIN_INITIAL_PASSWORD`, builds against an empty temp Store, and expects rejection with `ADMIN_INITIAL_PASSWORD 환경변수가 필요합니다.`. Restore environment values in `finally`.

- [ ] **Step 2: Run API tests and confirm the red state**

Run: `pnpm exec vitest run apps/api/src/server.test.ts`

Expected: FAIL because the route currently requires ADMIN for every action, accepts no review evidence, and production still falls back to a known password.

- [ ] **Step 3: Implement action-specific routes and status mapping**

Resolve the session user before action dispatch. Require exact `REVIEWER` for review/hold and exact `ADMIN` for activate. Map Store codes exactly:

```ts
const RULE_STATUS: Record<RuleActionErrorCode, number> = {
  NOT_FOUND: 404, ROLE_REQUIRED: 403,
  SOURCE_CONFIRMATION_REQUIRED: 400, RULE_INVALID: 400,
  INVALID_STATE: 409, MISSING_REVIEW: 409, SAME_ACTOR: 409,
  RULE_CONFLICT: 409, VERSION_CONFLICT: 409
};
```

Call activation with `seoulDate(new Date())`; the client cannot supply or backdate the activation validation date. Return rule reviews from `GET /api/admin/rules`. Remove the API-level duplicate audit call because Store success already writes one audit row.
After all API callers use the final-named methods, remove legacy `reviewRule`, `activateRule`, and `rejectRule` from `AppStore`, `FileStore`, and `PgStore`; `holdRule` replaces destructive rejection while preserving the draft and review record.

- [ ] **Step 4: Implement controlled method-band revisions**

Reject non-finite or negative bounds, absent method/source, and lower > upper. Build conditions without ±1원 correction:

```ts
const conditions: RuleCondition[] = [];
if (body.lower !== null) conditions.push({ field: 'estimated_price', operator: body.lowerInclusive ? 'gte' : 'gt', value: body.lower });
if (body.upper !== null) conditions.push({ field: 'estimated_price', operator: body.upperInclusive ? 'lte' : 'lt', value: body.upper });
```

Preserve the prior scope and candidate context, set status draft, increment version exactly once, and call `createRuleRevision`.

- [ ] **Step 5: Lock CORS and initial credentials**

Add `webOrigin` to config from `WEB_ORIGIN`, defaulting to `http://localhost:3000` outside production. `buildApp` rejects production startup without explicit `WEB_ORIGIN` or, when the user table is empty, explicit `ADMIN_INITIAL_PASSWORD`. Register CORS with `{ origin: cfg.webOrigin, credentials: true }`. Remove the default credential paragraph from the workspace page and add both variables with secure comments to `.env.example`.

- [ ] **Step 6: Run API and PG API tests**

Run: `pnpm exec vitest run apps/api/src/server.test.ts`

Expected: PASS.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/api-pg.pg.test.ts`

Expected: PASS with the same strict approval behavior on PgStore.

Run: `pnpm --filter @sen/api typecheck && pnpm --filter web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 8**

```bash
git add packages/db/src/app-store.ts packages/db/src/store.ts packages/db/src/pg-store.ts packages/config/src/index.ts apps/api/src/server.ts apps/api/src/server.test.ts tests/integration/api-pg.pg.test.ts apps/web/app/workspace/page.tsx .env.example
git commit -m "feat: secure rule approval API"
```

---

### Task 9: Project Lifecycle API and Cross-Project Guards

**Files:**
- Modify: `apps/api/src/server.ts:256-343,411-423`
- Modify: `apps/api/src/server.test.ts:69-138`
- Modify: `tests/integration/api-pg.pg.test.ts`

**Interfaces:**
- Consumes: Task 4-5 project Store interfaces, `isIsoDate`, `seoulDate`, `milestoneState`.
- Produces:

```ts
POST /api/projects/:id/status
Body: { status: ProjectStatus; reason: string }

POST /api/projects/:id/changes
Body: { changeType: 'design' | 'duration' | 'amount' | 'other'; before: object | null; after: object | null; reason: string }

POST /api/projects/:id/events
Body: { kind: ProjectEventKind; title: string; dueDate: string }

GET /api/projects/:id
Response additions: {
  changes: ProjectChangeRecord[];
  events: Array<ProjectEventRecord & { displayState: 'upcoming' | 'today' | 'overdue' }>;
  documents: Array<Omit<ProjectDocumentRecord, 'storedPath'>>;
}
```

- [ ] **Step 1: Add failing lifecycle and IDOR API tests**

```ts
it('건너뛴 상태 전이는 409, 다음 상태는 200', async () => {
  expect((await ownerRequest('POST', `/api/projects/${id}/status`, { status: 'working', reason: '건너뜀' })).statusCode).toBe(409);
  expect((await ownerRequest('POST', `/api/projects/${id}/status`, { status: 'contracting', reason: '계약 시작' })).statusCode).toBe(200);
});

it('다른 프로젝트 itemId 체크 토글은 404', async () => {
  const res = await ownerARequest('PATCH', `/api/projects/${projectA.id}/checklist/${itemB.id}`, { done: true });
  expect(res.statusCode).toBe(404);
  expect((await store.checklistOf(projectB.id)).find((x) => x.id === itemB.id)?.done).toBe(false);
});

it('변경 payload와 이벤트 날짜를 제한', async () => {
  expect((await ownerRequest('POST', `/api/projects/${id}/changes`, { changeType: 'amount', before: {}, after: {}, reason: '' })).statusCode).toBe(400);
  expect((await ownerRequest('POST', `/api/projects/${id}/events`, { kind: 'inspection', title: '검사', dueDate: '2026-02-30' })).statusCode).toBe(400);
});
```

- [ ] **Step 2: Run API tests and confirm the red state**

Run: `pnpm exec vitest run apps/api/src/server.test.ts`

Expected: FAIL because status/events routes are absent and checklist mutation only checks access to the URL project, not item ownership.

- [ ] **Step 3: Add exact request validation**

- Project status must be one of five values; reason after trim must be 1-2,000 chars.
- Change type must be one of four non-status values; reason 1-2,000 chars; `JSON.stringify(before).length` and `JSON.stringify(after).length` each at most 32 KiB.
- Event kind must be one of five values; title 1-200 chars; dueDate must pass `isIsoDate`.
- `estimatedPrice` on project creation must be finite and non-negative; category and organization type must match existing enums.

Return 400 before Store mutation for any violation.

- [ ] **Step 4: Add project-scoped mutation guards and responses**

For checklist toggle, load the item from `checklistOf(projectId)` and find the requested ID before `toggleChecklist`. For every route, call `canAccessProject` first and return 404 for missing/forbidden projects. Map `INVALID_TRANSITION` to 409. Remove the second API audit for Store operations that already audit.

Compute event display state only in the GET response:

```ts
const today = seoulDate(new Date());
const events = (await store.listProjectEvents(p.id)).map((event) => ({
  ...event,
  displayState: milestoneState(event.dueDate, today)
}));
```

- [ ] **Step 5: Run FileStore and PG API tests**

Run: `pnpm exec vitest run apps/api/src/server.test.ts`

Expected: PASS.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/api-pg.pg.test.ts`

Expected: PASS, including project-scoped checklist rejection.

- [ ] **Step 6: Commit Task 9**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts tests/integration/api-pg.pg.test.ts
git commit -m "feat: expose project lifecycle operations"
```

---

### Task 10: Private Evidence File Service and API

**Files:**
- Create: `apps/api/src/project-files.ts`
- Create: `apps/api/src/project-files.test.ts`
- Modify: `packages/config/src/index.ts:79-100`
- Modify: `apps/api/src/server.ts:19-23,25-60,293-343`
- Modify: `apps/api/src/server.test.ts`
- Modify: `tests/integration/api-pg.pg.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 6 `validateEvidenceFile`, Task 7 document Store methods, project access helper.
- Produces:

```ts
export interface StoredEvidenceFile {
  storedPath: string;
  created: boolean;
}

export function writeEvidenceFile(input: {
  privateRoot: string; projectId: string; bytes: Buffer;
  sha256: string; ext: 'pdf' | 'jpg' | 'png';
}): StoredEvidenceFile;

export function resolveEvidenceDownload(privateRoot: string, storedPath: string): string;
export function attachmentDisposition(originalName: string): string;

export interface AppContext {
  store: AppStore;
  retriever: HybridRetriever | null;
  sessionSecret: string;
  privateRoot: string;
}
```

- [ ] **Step 1: Add failing file service tests**

```ts
it('프로젝트별 hash 경로에 0600 파일을 한 번만 씀', () => {
  const first = writeEvidenceFile({ privateRoot, projectId: 'p1', bytes: pdf, sha256, ext: 'pdf' });
  const second = writeEvidenceFile({ privateRoot, projectId: 'p1', bytes: pdf, sha256, ext: 'pdf' });
  expect(first.storedPath).toBe(path.join(privateRoot, 'p1', `${sha256}.pdf`));
  expect(second).toEqual({ storedPath: first.storedPath, created: false });
  expect(fs.statSync(first.storedPath).mode & 0o777).toBe(0o600);
});

it('privateRoot 밖의 DB 경로를 다운로드하지 않음', () => {
  expect(() => resolveEvidenceDownload(privateRoot, '/etc/passwd')).toThrow('PRIVATE_PATH_VIOLATION');
});
```

Place these filesystem-boundary tests in `apps/api/src/project-files.test.ts`; keep HTTP authorization and serialization assertions in `apps/api/src/server.test.ts`.

- [ ] **Step 2: Add failing upload/download API tests**

```ts
it('정상 PDF를 업로드하고 storedPath 없이 다운로드', async () => {
  const upload = await ownerRequest('POST', `/api/projects/${id}/checklist/${item.id}/evidence`, Buffer.from('%PDF-1.4\n'), {
    'content-type': 'application/octet-stream',
    'x-file-name': encodeURIComponent('증빙.pdf'),
    'x-file-mime': 'application/pdf'
  });
  expect(upload.statusCode).toBe(200);
  expect(upload.json().document.storedPath).toBeUndefined();
  const download = await ownerGet(`/api/projects/${id}/documents/${upload.json().document.id}/download`);
  expect(download.headers['content-disposition']).toContain("filename*=UTF-8''");
  expect(download.headers['x-content-type-options']).toBe('nosniff');
});

it('교차 프로젝트 document 다운로드와 item 업로드를 404', async () => {
  expect((await ownerAGet(`/api/projects/${projectA.id}/documents/${documentB.id}/download`)).statusCode).toBe(404);
  expect((await ownerAUpload(projectA.id, itemB.id, pdf)).statusCode).toBe(404);
});
```

Also assert 413 for `EVIDENCE_MAX_BYTES + 1`, 415 for MIME/magic mismatch, and 400 for missing/invalid filename headers.

- [ ] **Step 3: Run tests and confirm the red state**

Run: `pnpm exec vitest run apps/api/src/server.test.ts apps/api/src/project-files.test.ts`

Expected: FAIL because the file service, octet-stream parser, evidence routes and private path config are absent.

- [ ] **Step 4: Implement private filesystem boundary**

Add `privateProjects: path.join(dataRoot, 'private')` to `dataPaths`. `writeEvidenceFile` permits project IDs matching `/^[A-Za-z0-9_-]+$/`, creates directories with mode `0700`, and writes with `fs.openSync(target, 'wx', 0o600)`. Treat `EEXIST` as `{ created: false }`; propagate other errors. `resolveEvidenceDownload` uses `fs.realpathSync` for root and target and requires the target prefix to equal `root + path.sep`.

Add `/data/private/` to `.gitignore` as `data/private/`.

- [ ] **Step 5: Register binary parser and upload route**

```ts
app.addContentTypeParser(
  'application/octet-stream',
  { parseAs: 'buffer', bodyLimit: EVIDENCE_MAX_BYTES },
  (_req, body, done) => done(null, body)
);
```

Decode `x-file-name` with `decodeURIComponent` inside a try/catch, require one string header and max 500 encoded chars, validate the buffer, write the file, then call `saveChecklistEvidence`. If Store linking fails, keep the unlinked file and return 404. Map Fastify body limit to 413 and validation result codes to 400/413/415 exactly.

- [ ] **Step 6: Implement protected download**

Look up document with `(projectId, documentId)`, resolve path under `privateRoot`, set canonical MIME, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and stream with `fs.createReadStream`. Never return `storedPath` from JSON serialization.

- [ ] **Step 7: Run unit and PG API evidence tests**

Run: `pnpm exec vitest run apps/api/src/server.test.ts apps/api/src/project-files.test.ts`

Expected: PASS for filesystem boundaries and HTTP evidence behavior.

Run: `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/api-pg.pg.test.ts`

Expected: PASS for upload metadata and protected download with PgStore.

Run: `pnpm --filter @sen/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit Task 10**

```bash
git add apps/api/src/project-files.ts apps/api/src/project-files.test.ts apps/api/src/server.ts apps/api/src/server.test.ts tests/integration/api-pg.pg.test.ts packages/config/src/index.ts .gitignore
git commit -m "feat: add private checklist evidence API"
```

---

### Task 11: Rule and Project Detail UI

**Files:**
- Create: `tests/e2e/seed.ts`
- Modify: `playwright.config.ts`
- Modify: `apps/web/app/admin/rules/page.tsx:6-118`
- Modify: `apps/web/app/workspace/projects/[id]/page.tsx:7-100`
- Modify: `apps/web/app/globals.css:99-236`
- Test: `tests/e2e/flows.spec.ts`

**Interfaces:**
- Consumes: Tasks 8-10 API request/response shapes and existing `api()` CSRF calls.
- Produces: one-page rule review controls and one-page project state/checklist/evidence/change/event controls; no new frontend dependency.

- [ ] **Step 1: Seed exact E2E actors before API startup**

Create `tests/e2e/seed.ts` using `FileStore`, `hashPassword`, and `upsertRule` to ensure these deterministic test fixtures in `tests/e2e/.data/app-store`:

```ts
await ensureUser('e2e-reviewer', 'Reviewer!2026', 'REVIEWER');
await ensureUser('e2e-admin2', 'Admin2!2026', 'ADMIN');
await ensureUser('admin', 'ChangeMe!2026', 'ADMIN');
store.upsertRule(methodBandRule('e2e.method.band', 1, 'draft'));
```

Delete only the exact disposable `tests/e2e/.data` directory at the start of the seed, then recreate fixtures. Change the API `webServer.command` to `pnpm exec tsx tests/e2e/seed.ts && pnpm dev:api`, pass the same absolute `SEN_CONTRACT_DATA_ROOT` to both processes, and set `reuseExistingServer: false` so stale data cannot bypass seeding. Keep credentials confined to tests.

- [ ] **Step 2: Add failing admin review E2E**

```ts
test('REVIEWER 원문 검토 후 다른 ADMIN 활성화', async ({ browser }) => {
  const reviewerPage = await login(browser, 'e2e-reviewer', 'Reviewer!2026');
  await reviewerPage.goto('/admin/rules');
  await reviewerPage.getByLabel('검토 의견').fill('원문 URL과 금액 경계를 확인함');
  await reviewerPage.getByLabel('원문 대조 확인').check();
  await reviewerPage.getByRole('button', { name: '검토 완료' }).click();
  await expect(reviewerPage.getByText('reviewed')).toBeVisible();

  const adminPage = await login(browser, 'e2e-admin2', 'Admin2!2026');
  await adminPage.goto('/admin/rules');
  await adminPage.getByRole('button', { name: '활성화' }).click();
  await expect(adminPage.getByText('active')).toBeVisible();
});
```

- [ ] **Step 3: Add failing project operations E2E**

```ts
test('상태·변경·일정·증빙을 한 상세 화면에서 관리', async ({ page }) => {
  await loginExistingPage(page, 'admin', 'ChangeMe!2026');
  const project = await createAndOpenProject(page, '업무공간 E2E');
  await page.getByLabel('상태 변경 사유').fill('계약 절차 시작');
  await page.getByRole('button', { name: 'contracting으로 이동' }).click();
  await expect(page.getByText('contracting')).toBeVisible();

  await page.getByLabel('증빙 파일').first().setInputFiles({
    name: '증빙.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n')
  });
  await expect(page.getByText('증빙.pdf')).toBeVisible();

  await page.getByLabel('변경 사유').fill('사용자 입력 변경 기록');
  await page.getByRole('button', { name: '변경 기록 추가' }).click();
  await expect(page.getByText('사용자 입력 변경 기록')).toBeVisible();

  await page.getByLabel('마일스톤 제목').fill('준공검사 예정');
  await page.getByLabel('마일스톤 날짜').fill('2099-12-31');
  await page.getByRole('button', { name: '일정 추가' }).click();
  await expect(page.getByText('예정')).toBeVisible();
  expect(project.id).toBeTruthy();
});
```

- [ ] **Step 4: Run E2E and confirm the red state**

Run: `pnpm exec playwright test tests/e2e/flows.spec.ts --project=chromium`

Expected: FAIL because review inputs, lifecycle forms, evidence upload, changes and milestone UI are absent.

- [ ] **Step 5: Implement the admin rule controls**

Show source title/URL/effective/checked dates and candidate context before controls. Draft rows expose comment, source confirmation and hold. Reviewed rows expose activation only to ADMIN. A controlled “새 버전 만들기” section has method, nullable lower/upper, inclusivity checkboxes, message and source fields; it posts only the `MethodBandRevisionBody` from Task 8.

Keep API errors visible in an `aria-live="polite"` notice and disable the submitting row button until the request completes.

- [ ] **Step 6: Implement minimal project detail controls**

- Status section: current status, next status label, required reason, confirmation button, legal-status disclaimer.
- Checklist section: existing checkbox, current evidence metadata, download link, native file input accepting `.pdf,.jpg,.jpeg,.png`, replace wording when linked, missing-evidence warning without completion blocking.
- Change section: type select, before/after JSON textareas initialized to `{}`, reason, append button, reverse chronological records.
- Event section: kind, title, native date input, add button, server-provided display state badges.
- Do not render `storedPath`, automatic deadlines, official form actions, notification toggles or member controls.
- Show that format validation is not a malware guarantee and users should download only trusted evidence.

Use `encodeURIComponent(file.name)`, `file.type`, raw File body and `application/octet-stream` for upload. Include CSRF header on every mutation.

- [ ] **Step 7: Run UI verification**

Run: `pnpm --filter web typecheck`

Expected: PASS.

Run: `pnpm --filter web build`

Expected: PASS with `/admin/rules` and `/workspace/projects/[id]` generated.

Run: `pnpm exec playwright test tests/e2e/flows.spec.ts --project=chromium`

Expected: PASS for existing five flows plus strict review and project operations.

- [ ] **Step 8: Commit Task 11**

```bash
git add tests/e2e/seed.ts playwright.config.ts apps/web/app/admin/rules/page.tsx 'apps/web/app/workspace/projects/[id]/page.tsx' apps/web/app/globals.css tests/e2e/flows.spec.ts
git commit -m "feat: complete contract workspace UI"
```

---

### Task 12: Final Regression, Security Documentation, and Harness Evidence

**Files:**
- Modify: `DECISIONS.md`
- Modify: `SECURITY.md`
- Modify: `docs/harness/TASKS.md`
- Modify: `docs/harness/STATUS.md`
- Modify: `docs/harness/TEST_RESULTS.md`
- Verify only: every code/test file named in Tasks 1-11.

**Interfaces:**
- Consumes: all completed tasks and their commit hashes.
- Produces: T-210 completion evidence, durable decisions, security policy alignment, and a clean full-gate result.

- [ ] **Step 1: Confirm documentation starts red**

Run: `rg -n "^## D-016|^## D-017" DECISIONS.md`

Expected: no matches and non-zero exit because the approved decisions are not documented yet.

Run: `rg -n "T-210 공사계약 업무공간 운영 완성" docs/harness/TASKS.md`

Expected: no matches and non-zero exit because completion evidence has not been recorded.

- [ ] **Step 2: Run source-level scope guards**

Run: `git diff -U0 e2dd158..HEAD -- packages/rules packages/db apps/api apps/web | rg '^\+[^+].*(openai|openrouter|ollama|embedding|vectorSearch|official form|공식 서식|sendEmail|sms|projectMembers|workflow engine)'`

Expected: no output and non-zero `rg` exit, meaning changed code adds no RAG/LLM/agent, official-form generation, external notification, project-member collaboration or workflow-engine implementation.

Run: `git diff e2dd158..HEAD -- package.json pnpm-lock.yaml`

Expected: no new external package. The only permitted package manifest change is `packages/db/package.json` adding existing workspace dependency `@sen/rules`; lockfile should not gain registry packages.

- [ ] **Step 3: Run the full completion gates**

Run: `pnpm lint`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm test`

Expected: PASS with rule, FileStore, API, shared and crawler tests.

Run: `pnpm test:pg`

Expected: PASS with PgStore and PG API parity tests.

Run: `pnpm build`

Expected: PASS for every workspace package and Next.js.

Run: `pnpm test:e2e`

Expected: PASS for existing public flows, two-person approval, and project state/change/event/evidence flows.

- [ ] **Step 4: Run explicit security assertions after the full suite**

Run: `git check-ignore -v data/private/example.pdf`

Expected: output points to the `data/private/` rule in `.gitignore`.

Run: `rg -n "storedPath" apps/web apps/api/src/server.ts`

Expected: no API response serializer or web rendering exposes `storedPath`; internal removal/destructuring code may reference the field only to omit it.

Run: `rg -n "rmSync|unlinkSync|unlink\(" apps/api/src/project-files.ts packages/db/src/store.ts packages/db/src/pg-store.ts`

Expected: no evidence replacement or project operation deletes prior files/records.

- [ ] **Step 5: Record durable decisions and security behavior**

Append `D-016` to `DECISIONS.md` with these exact decisions: strict REVIEWER→different ADMIN activation, immutable reviewed definitions, no automatic approval. Append `D-017` with: one current private PDF/JPEG/PNG evidence per checklist, 10 MiB, triple validation, project-local hash path, replacement without deletion, no corpus linkage.

Update `SECURITY.md` upload section with the exact MIME/magic matrix, owner/ADMIN checks, project/resource ID matching, 0600/0700 permissions, attachment/nosniff download, and no stored path exposure.

- [ ] **Step 6: Record task and test evidence**

Add `T-210 공사계약 업무공간 운영 완성 — DONE` to `docs/harness/TASKS.md` only after all gates pass. List the rule, project, evidence, API and UI files plus the six full commands as evidence. Update `STATUS.md` to state the workspace operational scope is complete and that T-201 RAG/vector runtime work remains deferred by user direction. Append a dated table to `TEST_RESULTS.md` with each exact command, PASS/FAIL, test counts, and any environment-specific limitation; never report an unrun command as PASS.

- [ ] **Step 7: Verify documentation and review the final diff**

Run: `rg -n "^## D-016|^## D-017" DECISIONS.md && rg -n "T-210 공사계약 업무공간 운영 완성 — DONE" docs/harness/TASKS.md`

Expected: both decisions and the completed task evidence match; this is the green counterpart to Step 1.

Run: `git status --short`

Expected: only files from Tasks 1-12 are modified; no `data/private`, `.env`, generated corpus, raw attachment, or unrelated file appears.

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git diff --name-only e2dd158..HEAD`

Expected: every path is listed in the File Map or is an explicitly created focused test from Task 10.

- [ ] **Step 8: Commit final documentation**

```bash
git add DECISIONS.md SECURITY.md docs/harness/TASKS.md docs/harness/STATUS.md docs/harness/TEST_RESULTS.md
git commit -m "docs: record contract workspace verification"
```

- [ ] **Step 9: Confirm completion without pushing**

Run: `git status --short`

Expected: no output.

Run: `git log --oneline -12`

Expected: scoped commits for rule safety, two-person approval, lifecycle parity, file validation, evidence persistence, API security, project APIs, evidence API, UI, and verification documentation. Do not push.

---

## Spec Coverage Check

| Approved requirement | Implemented and verified by |
| --- | --- |
| Rule immutability and fail-closed evaluation | Tasks 1-3 |
| REVIEWER source review then different ADMIN activation | Tasks 2, 3, 8, 11 |
| Activation-time validation and conflict rejection | Tasks 1-3, 8 |
| Explicit project status transitions | Tasks 4, 5, 9, 11 |
| Append-only changes and actual actor | Tasks 4, 5, 9 |
| User-entered milestone dates and simple display state | Tasks 4, 5, 9, 11 |
| One current evidence per checklist item | Tasks 7, 10, 11 |
| PDF/JPEG/PNG, 10 MiB, ext+MIME+magic | Tasks 6, 10 |
| SHA-256 project-local content-addressed storage | Tasks 6, 10 |
| owner/ADMIN and cross-project IDOR prevention | Tasks 7, 9, 10 |
| Replacement without deletion and old download access | Tasks 7, 10, 12 |
| Minimal project-detail UI | Task 11 |
| FileStore/PgStore parity | Tasks 2-5, 7 |
| No SQL migration unless deployed evidence data disproves premise | Task 7 |
| Production CORS and initial credential safety | Task 8 |
| No official forms, RAG/LLM/agent, external notification, auto legal calculation, members, generic engine | Global Constraints, Tasks 11-12 |
| Full gates and harness evidence | Task 12 |

## Execution Boundary

Execute tasks in order. Stop at the first red test that does not match the expected failure, at any unexpected migration need, or if an unrelated dirty file overlaps a planned path. Do not reset or discard user changes. This plan authorizes implementation only after the user chooses an execution mode; it does not authorize push, production deployment, rule activation, operational file deletion, or external messaging.
