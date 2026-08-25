# TASKS.md

상태: NOT_STARTED | IN_PROGRESS | BLOCKED | DONE

## T-010 하니스 문서 — DONE
- 완료조건: AGENTS/DECISIONS/SECURITY/IMPLEMENTATION_PLAN/docs/harness/* 존재
- 증거: 본 폴더 전체, `DECISIONS.md`

## T-020 모노레포 스켈레톤 — DONE
- 수정대상: package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore
- 검증: `pnpm install` 성공, lockfile 생성
- 증거: `pnpm-lock.yaml`

## T-030 packages/shared — DONE
- 내용: 타입(CrawlDoc, Chunk, Rule 등), URL 정규화/허용판정, SHA-256, 날짜 파싱
- 검증: `pnpm test --filter shared`

## T-040 packages/db — DONE
- 내용: Drizzle PG 스키마(전 엔터티) + SQL 마이그레이션 + 파일스토어 리포지토리 + 감사로그
- 검증: `pnpm test --filter db`, 마이그레이션 SQL 존재
- 증거: `packages/db/drizzle/0001_init.sql`

## T-050 packages/rules — DONE
- 내용: 결정론적 평가기(active만), 경계값 테스트(±1원), 시행일 버전선택, 충돌감지
- 검증: `pnpm test --filter rules`

## T-060 workers/crawler — DONE
- CLI: crawl:preflight / crawl:sample / crawl:full / crawl:board / crawl:incremental / crawl:diff / crawl:coverage
- 실측: 12 seed 전부 HTTP 200. 공지사항 상세 38건은 Playwright in-page JS 실행 방식으로 수집(D-009).
  FAQ 게시판은 외부 BBS 링크/인라인 구성 → 개별 글 수집 보류.
- 증거: `data/manifests/crawl-preflight.json`, `docs/harness/CRAWL_PREFLIGHT.md`,
  `data/manifests/pages.jsonl`(160+ 레코드), `artifacts/preflight/shot-*.png`

## T-070 workers/ingest — DONE
- HTML→normalized markdown+표 보존, chunk(typed) 2,535개, 위키 generated 15파일 생성,
  규칙후보 60건 추출(draft만). PDF/HWP 등은 형식감지 후 MANUAL_REVIEW_REQUIRED 격리 설계.
- 증거: `data/normalized/rules-candidates/`, `wiki/generated/`(내용 있는 파일 7개),
  `data/app-store/chunks.json`

## T-080 packages/retrieval — DONE
- 키워드+메타필터(+옵션벡터 자리), rerank 스코어, 출처 없으면 답변 거부
- 검증: `pnpm test --filter retrieval`

## T-090 apps/api — DONE
- Fastify: /api/search, /api/ask, /api/wizard, /api/wiki, /api/sources,
  /api/auth/*, /api/projects/*(RBAC), /api/admin/*(rules approve 등), rate-limit, CSRF, 감사로그
- 검증: `pnpm test`(통합) + 기동 확인

## T-100 apps/web — DONE
- Next.js: 공개(홈3버튼/마법사/검색/가이드/출처), 업무공간(프로젝트/단계/체크리스트),
  관리자(수집/출처/규칙승인/리포트). 한국어·모바일 우선.
- 검증: `pnpm build` 성공

## T-110 테스트 전면 통과 — DONE
- lint/typecheck/unit/integration 통과. e2e 스펙 작성(브라우저 설치 환경에서 실행).
- 증거: `docs/harness/TEST_RESULTS.md`

## T-120 Docker Compose + NAS 문서 — DONE(문서 한정)
- docker-compose.yml(7서비스 healthcheck), Dockerfile*, .env.example,
  scripts/backup-db.*, scripts/restore-db.*, RUNBOOK에 NAS 절차
- BLOCKED(실행): Docker 미설치 환경 → config 검증은 사용자 환경에서.

## T-130 최종 보고 — DONE
- 증거: `docs/harness/TEST_RESULTS.md`, `CRAWL_COVERAGE.md`, 세션 최종 메시지

## T-140 증분 수집 오염 방지 — DONE
- view0010v.do(POST 폼형 상세)를 HTTP 링크 확장에서 제외 → 빈 셸 페이지 오염 방지(D-009 후속)
- 실측: `crawl:incremental` 3회 — 첫 회 changedUrls=1(엔진 전환분 반영), 2·3회 **changedUrls=0(안정)**
- `crawl:diff`로 버전 쌍 확인. 증거: `data/manifests/crawl-runs.jsonl`

## T-141 규칙 후보 원문 문맥 표시 — DONE
- RuleDefinition에 `candidate`(원문 문장/앞뒤 문맥/chunk ID) 추가, 추출 시 보존,
  관리자 `/admin/rules` 화면에 나란히 표시, 오래된 candidate 초안 자동 정리(reviewed/active는 보존)
- 재생성 멱등 확인: 2회 연속 실행 시 candidates=63, staleRemoved=0, active=0 유지

## T-142 compose 오프라인 검증 — DONE(문서 한정)
- `pnpm compose:validate` PASS: 7서비스, healthcheck, host/privileged 미사용,
  latest 태그 없음, SESSION_SECRET 필수, NAS 경로 변수화, 비표준 포트 확인
- 한계: `docker compose config`의 대체 아님(Docker 환경에서 최종 확인 필요)

## NEXT (다음 세션 권장)
1. PostgreSQL/Qdrant/Valkey 기동 환경에서 `docker compose up -d` + 마이그레이션 적용 검증
   (DATABASE_URL 지정 시 PG 리포지토리 경로 활성화 구현이 선행되면 좋음)
2. 법무 확인: (a) 첨부 수집 허용 여부(D-001), (b) 외부 BBS(buseo.sen.go.kr) allowlist
3. 원문 기반 규칙 초안 작성(후보 63건 중 계약방법 표 데이터 활용) → REVIEWER 검토 → ADMIN active 승인
4. FAQ 게시판 인라인 본문의 FAQ 전용 chunk(faq type) 세분화
