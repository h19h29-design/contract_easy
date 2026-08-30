# TEST_RESULTS.md

형식: 날짜 / 명령 / 결과 / 핵심출력. 모든 수치는 실제 실행 산출물 기준.

## 2026-08-30 규칙 관리자 API·운영 기동 안전장치

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm exec vitest run apps/api/src/server.test.ts packages/db/src/store.test.ts` | PASS | 2 files, 44 tests — malformed review/hold 입력을 API·FileStore에서 fail-closed 처리 |
| `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/api-pg.pg.test.ts tests/integration/pg-store.pg.test.ts tests/integration/sync-db.pg.test.ts` | PASS | 3 files, 40 tests — PgStore direct validation, source-side active→target draft sync proof 포함 |
| `pnpm --filter @sen/api typecheck && pnpm --filter web typecheck && pnpm --filter @sen/db typecheck` | PASS | 모든 `tsc --noEmit` 성공 |

- TDD RED: API 권한/개정/운영 bootstrap 테스트는 구현 전 4/15 실패(403·404·개발 fallback)했고, malformed action body 회귀는 500을 재현한 뒤 400으로 보완했다. 후속 hardening은 truthy confirmation 수용과 invalid origin 미차단을 재현한 뒤 정확한 boolean/string 및 단일 HTTP(S) origin 검증을 추가했다.

## 2026-08-30 FileStore 프로젝트 생명주기

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts` | PASS | 2 files, 32 tests — 엄격 ISO 날짜, 서울 기준 마일스톤, 순방향 상태 전이, append-only 변경·이벤트 이력 |
| `pnpm --filter @sen/db typecheck` | PASS | `tsc --noEmit` 성공; AppStore 계약은 변경하지 않고 FileStore 메서드만 추가 |

- TDD RED 확인: 같은 focused Vitest 명령은 구현 전 4개 실패(`milestoneState`, 상태 전이·이벤트·변경 목록 메서드 부재)였다.

## 2026-08-30 FileStore 프로젝트 생명주기 검토 보완

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts` | PASS | 2 files, 35 tests — status 우회 차단, 잘못된 이벤트 날짜 거부, 최신순 이력, JSON 복사 격리 회귀 포함 |
| `pnpm --filter @sen/db typecheck` | PASS | `tsc --noEmit` 성공 |

- TDD RED 확인: 구현 전 신규 회귀 4건은 각각 직접 status 변경, oldest-first 목록, 잘못된 날짜 이벤트 저장, 반환/조회 이력 객체 변조로 실패했다.

## 2026-08-30 FileStore ProjectRecord 스냅샷 검토 보완

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts` | PASS | 2 files, 36 tests — create/get/list/update/transition 반환값과 중첩 wizardInput 변조가 저장 상태를 바꾸지 않음 |
| `pnpm --filter @sen/db typecheck` | PASS | `tsc --noEmit` 성공 |

- TDD RED 확인: 구현 전 create/get/list/update 반환값을 변조하면 내부 프로젝트가 `working`이 되어 `planning→contracting` 전이가 `INVALID_TRANSITION`으로 실패했다.

## 2026-08-27 macOS Codex 재개 환경

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | pnpm 11.23.0, Mac용 embedded-postgres 빌드만 명시 허용 |
| `pnpm lint` | PASS | ESLint 오류 0 |
| `pnpm typecheck` | PASS | 9개 워크스페이스 통과 |
| `pnpm test` | PASS | 8 files, 70 tests |
| `pnpm build` | PASS | Next.js 14 routes 및 전체 TypeScript 패키지 빌드 |
| `pnpm test:pg` | PASS | 3 files, 16 tests, embedded PostgreSQL 18.4 |
| hash+local 벡터 적재·검색 | PASS | 11,259 points 적재, vector/hybrid 검색 스모크 |

- Windows OpenCode 세션 `ses_fc7061eaaffeSd6USmFA2Pu30j`의 clean Git commit `10027fa`를 완전 이력 bundle로 가져와 재개했다.
- 비밀값과 `.env`는 전송하지 않았다. 원격 저장소는 아직 설정되어 있지 않다.

## 2026-08-27 Codex 인수인계 정리

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm lint` | PASS | ESLint 오류 0 |
| `pnpm typecheck` | PASS | 9개 워크스페이스 통과 |
| `pnpm test` | PASS | 8 files, 70 tests |
| `pnpm build` | PASS | Next.js 14 routes 및 전체 TypeScript 패키지 빌드 |
| `pnpm test:pg` | PASS | 3 files, 16 tests, embedded PostgreSQL 18.4 |
| `pnpm test:e2e` | PASS | Playwright Chromium 5/5. 서버 자동 기동 설정 추가 후 재실행 |
| hash+local 벡터 적재 | PASS | 11,259 points, 256 dimensions, 176 batches |

- 최초 E2E 시도는 API/웹 미기동으로 5건 연결 거부됐다. `playwright.config.ts`에 `webServer`를 추가한 뒤 동일 명령으로 5/5 통과했다.
- Docker Compose 실제 기동은 여전히 Docker 미설치로 실행하지 못했다.

## 2026-08-26 7차 세션 (평가셋 v2 + OCR 검증 + 잔여 정리)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| 평가셋 v2 재작성(60문항) | 실측 기록 | hit@1 **69.5%** / hit@3 **78.0%** / 거부 5·5 — 잔여 미스 13건은 미제공 업종 항목(UNCOLLECTED #3 실측과 일치) |
| OCR 파이프라인(pdf-parse getImage → tesseract.js kor) | PASS(기술 검증) | 스캔 PDF 3페이지에서 텍스트 추출 성공. 다만 인식률 저조로 자동 편입 대신 MANUAL_REVIEW_REQUIRED 격리 원칙 적용, 모듈 유지(env 게이트) |
| 첨부 재시도 | 확인 | 135/141 유지 — buseo ND_fileDownload 5건은 서버가 공개 엔드포인트에서 제공하지 않음(영구 불수집 확정) |

명령 게이트: lint PASS / typecheck PASS / test 70·70 / build PASS

## 2026-08-26 6차 세션 (HWP 본문 인제스트 완료)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| hwp5txt(pyhwp) 일괄 변환 | PASS | **70/72 성공**(실패 2건은 빈 문서), UTF-8 저장 → `data/raw/attachments/hwp-txt/` |
| HWP-TXT 인제스트 통합 | PASS | HWP 문서 70건 추가 → 청크 5,689→**11,259** |
| 평가 재실행(확장 코퍼스) | 실측 기록 | hit@1 55.6% / hit@3 68.9% — 코퍼스 2배 확장에 따른 경합 변화, 이후 v2 평가셋으로 재측정 |

## 2026-08-26 5차 세션 (#1 첨부 수집 승인 실행)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm crawl:attachments` 신규 | PASS | **135/141 다운로드**(zip 65 · hwp 45 · pdf 19 · xls 5 · png 1), 매직바이트 검증, content-addressed 저장 |
| PDF 텍스트 추출(pdf-parse v2 어댑터) | PASS | **15/16 문서화 → 256 청크 추가**(행안부 한시적 특례 등) |
| `pnpm crawl:selector` UI-walk v3 | PARTIAL→이후 종결 | 캐스케이딩 구동 성공 → 이후 list0030v.do 발견으로 완전 해제(4차) |

## 2026-08-26 4차 세션 (외부 FAQ BBS 수집 #2 해제)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| buseo.sen.go.kr robots 재확인 | PASS | 대상 경로 Allow, 첨부 확장자만 Disallow → 메타만 |
| `pnpm crawl:faq-bbs` | PASS | **개별 Q&A 137건 수집**(원클릭 sn=1412 32건 전체 소진), 오판 확장분 103건 삭제 정리 |
| 재인제스트 | PASS | faq 청크 2,769개 |

## 2026-08-26 3차 세션 (구조화 규칙 초안·PG 동기화·평가셋 도입)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| FAQ 청크 세분화 | PASS | faq 247개 초기 → 이후 확장 |
| 구조화 규칙 초안 | PASS | 계약방법 표 밴드 초안 3건(draft, 경계 warning 포함), 단위테스트 포함 |
| `ingest:sync-db`(파일→PG) | PASS | pg 테스트 16/16 — 멱등 재생, active 보존(D-011) |
| 리트리벌 평가셋 v1 | 실측 | hit@3 84.4%(구 코퍼스 기준) → 이후 v2로 재측정 |

## 2026-08-25 ~ 26 (2차 세션: PG 운영 경로·확장)

| 명령 | 결과 |
| --- | --- |
| `pnpm install/lint/typecheck/test/build` | 전부 PASS (test 60→70 증분 포함) |
| `pnpm test:pg`(embedded-postgres) | PASS 16/16 — 마이그레이션 멱등, PgStore 전 메서드, API PG 모드 |
| `pnpm crawl:incremental` ×3 | PASS — 1회 changed=1 후 2·3회 0(안정) |
| `pnpm crawl:board`(playwright) | PASS — 공지 상세 38건 전수, pagination 동적 큐 방식 |
| 규칙 upsert 에스컬레이션 가드 | PASS — draft 재upsert 시 reviewed/active 보존(D-011) |
| compose 오프라인 검증(`compose:validate`) | PASS — 7서비스·healthcheck·보안 설정 점검 |

## 2026-08-25 최초 구축 (1차 세션)

- `pnpm crawl:preflight`: 12/12 seed HTTP 200, verdict PASS
- `pnpm crawl:sample/full`: 수집 기반 구축
- 단위+통합 60테스트, e2e 5시나리오(Chromium) PASS
- API 스모크: 검색/마법사(REVIEW_REQUIRED)/위키/ask 게이트 동작

## 실행 불가 / 보류 항목

- `docker compose config|up`: Docker 미설치 머신 → 실행 불가(설정·문서 완비)
- 첨부 5건(buseo ND_fileDownload): 서버가 공개 엔드포인트에서 미제공(영구)
- 스캔 PDF 1건 OCR 자동편입: 인식률 저조 → MANUAL_REVIEW_REQUIRED 격리(모듈 검증 완료)
