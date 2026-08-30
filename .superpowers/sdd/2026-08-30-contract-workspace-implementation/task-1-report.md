# Task 1 Report — Rule Evaluation Safety and Activation Validation

## Implementation

- Added the shared `RuleValidationIssue` interface plus strict `isIsoDate` and
  Asia/Seoul `seoulDate` helpers.
- Added `validateActivatableRule`, which rejects unknown scopes, invalid source
  metadata, missing methods, unsupported price conditions, and rules effective
  after a supplied reference date.
- Made rule evaluation fail closed for unknown scope keys and invalid effective
  dates; matching auxiliary rules without a contract method now return `PARTIAL`.
- Generalized administrator conflict detection to normalized open/closed price
  intervals and key-sorted scope equality.
- Updated `/api/wizard` to choose the contract-planned date or the current
  Seoul date and provide it to both store filtering and rule evaluation.

## TDD evidence

### RED

Command:

```bash
pnpm exec vitest run packages/shared/src/shared.test.ts packages/rules/src/engine.test.ts
```

Relevant output: 7 failures and 27 passes. The failures were the expected
missing `isIsoDate`, `seoulDate`, and `validateActivatableRule` exports, missing
`gt`/`gte`/`lt`/`lte` conflict overlap, and the unsafe method-less `primary`
dereference.

Command:

```bash
pnpm exec vitest run apps/api/src/server.test.ts
```

Relevant output: 1 failure and 10 passes. The future-effective active rule was
incorrectly returned as `DETERMINED` instead of `REVIEW_REQUIRED` before the
route passed its date boundary.

### GREEN

Command:

```bash
pnpm exec vitest run packages/shared/src/shared.test.ts packages/rules/src/engine.test.ts
```

Relevant output: 2 test files passed; 34 tests passed.

Command:

```bash
pnpm exec vitest run apps/api/src/server.test.ts
```

Relevant output: 1 test file passed; 11 tests passed.

Command:

```bash
pnpm --filter @sen/rules typecheck
```

Relevant output: `tsc --noEmit` exited 0.

## Files changed

- `packages/shared/src/types.ts`
- `packages/shared/src/date.ts`
- `packages/shared/src/shared.test.ts`
- `packages/rules/src/engine.ts`
- `packages/rules/src/engine.test.ts`
- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`

## Self-review

- Checked strict date handling: invalid source effective dates and invalid
  supplied evaluation dates cannot produce a determination.
- Checked endpoint math: touching ranges overlap only when both include the
  shared endpoint; the required `lte`/`gt` interval case is covered.
- Checked scope comparison: key order no longer affects conflict detection,
  while an unknown runtime scope key cannot match a wizard input.
- Checked method-less active auxiliary rules: documents and evidence remain in
  the response, while `recommendedMethod` is omitted and the state is
  `PARTIAL`.
- Ran `git diff --check`; no whitespace errors were found.

## Concerns

- Focused Vitest commands retain the repository's pre-existing Vite CJS
  deprecation warning and development-admin stderr. Neither originates from
  this change.
- This task intentionally provides validation for the upcoming FileStore/PgStore
  approval paths; it does not alter those store activation methods yet.
