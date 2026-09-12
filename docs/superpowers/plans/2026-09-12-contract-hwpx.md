# 공사표준계약서 HWPX Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user approved the input-editing/HWPX workflow; no additional feature expansion, deployment or automatic push.

**Goal:** 로그인한 프로젝트 사용자가 공사표준계약서 초안을 저장·수정하고 편집 가능한 HWPX를 내려받는다.

**Architecture:** 공유 입력 정의와 검증을 웹/API에서 재사용한다. FileStore/PgStore에 append-only 초안 버전을 저장하고 expectedRevision으로 덮어쓰기를 막는다. 별도 API 모듈과 HWPX 생성기가 기존 인증·CSRF·프로젝트 권한을 재사용한다.

**Tech Stack:** TypeScript, Next.js, Fastify, PostgreSQL, XML/ZIP HWPX, Vitest, Playwright.

**Spec:** `docs/harness/CONTRACT_FORMS_AUDIT.md`의 사용자 승인 HWPX 작성 흐름.

## Global Constraints

- OCR·AI 답변·NAS 설정/운영 DB 변경·외부 모델 전송 제외.
- 원본은 읽기 전용, 매크로 실행 금지. 원본 법적 판단값을 자동 승인/계산하지 않음.
- 금액은 10진 문자열로 보존. 빈 초안 저장 가능, 필수 미입력은 다운로드 전 차단.
- 저장/다운로드는 USER 이상 및 owner/ADMIN만 허용. 개인정보를 로그/공개 corpus에 복사하지 않음.
- 실제 한글 검증 전 호환성 완료를 주장하지 않음.

## Task 1: 입력 계약과 비공개 초안 저장

Files: `packages/shared/src/contract.ts`, `packages/shared/src/contract.test.ts`, `packages/db/src/{app-store,store,pg-store,schema}.ts`, `packages/db/drizzle/0002_contract_drafts.sql`, `tests/unit/contract-store.test.ts`, `tests/integration/contract-drafts.pg.test.ts`.

Interfaces: `ContractFields`, `validateContractFields(unknown)`, `contractMissingFields(fields)`, `getContractDraft(projectId, revision?)`, `saveContractDraft(projectId, fields, expectedRevision, actorUserId)`.

- [x] Red: invalid amount/date/XML control chars reject, empty drafts allowed; persistence and same-revision conflicts tested on both stores.
  ```ts
  expect(validateContractFields({ contractAmount: '1e8' }).ok).toBe(false);
  expect((await store.saveContractDraft(id, fields, 0, owner.id)).ok).toBe(true);
  expect((await store.saveContractDraft(id, fields, 0, owner.id)).ok).toBe(false);
  ```
- [x] Run failing tests, then add explicit field whitelist, exact date validation, revision records and additive migration.
- [x] Test old JSON compatibility, detached snapshots, historical revision reads, concurrent PG writes, no update/delete of existing records.

## Task 2: 元 서식 대조 및 HWPX/API

Files: `apps/api/src/{contract-routes,contract-hwpx,contract-hwpx.test,contract-routes.test}.ts`, `apps/api/assets/hwpx/`, `apps/api/src/server.ts`.

- [x] Inspect original contract cell labels/formulas and document source mapping. Inspect a licensed blank HWPX baseline; retain license and pin source SHA.
- [x] Red: unauthenticated 401, other project 404, CSRF 403, invalid fields 400, conflict 409, incomplete/unconfirmed export 422, valid export ZIP with exact input values.
  ```ts
  expect((await app.inject({ method: 'GET', url: `/api/projects/${id}/contract` })).statusCode).toBe(401);
  ```
- [x] Add GET/PUT `/api/projects/:id/contract`; GET `.hwpx` export requires explicit saved revision and review acknowledgement. Cache-Control no-store; generic errors; no input values in audit.
- [x] Generate text/table HWPX, escape XML, omit scripts/external relationships, test package references and input round-trip. Use actual field data for preview and export, never silently replace with cached placeholders.

## Task 3: 웹 작성 흐름과 최종 검증

Files: `apps/web/app/workspace/projects/[id]/contract/page.tsx`, existing project detail link, `tests/e2e/flows.spec.ts`, harness status/tasks/results/handoff.

- [x] Red E2E: open project→contract→input→save→reload→edit→save→acknowledge→download HWPX.
- [x] Implement input groups, saved version/unsaved state, conflict errors, preview of current inputs, download only persisted unchanged version. No browser localStorage for private fields.
- [x] Run targeted tests then required `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pg`, `pnpm build`, `pnpm test:e2e`, `pnpm compose:validate`, `git diff --check`.
- [x] Inspect synthetic download and browser screenshot. Report actual Hancom round-trip as unverified if unavailable; do not deploy or claim production ready.
- Scoped changes are retained on `codex/contract-hwpx` with evidence; no automatic push or merge. Actual Hancom acceptance remains open in T-214.
