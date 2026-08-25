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
- CLI: crawl:preflight / crawl:sample / crawl:full / crawl:incremental / crawl:diff / crawl:coverage
- 실측: 12 seed 전부 HTTP 200. pagination·상세 수집 OK. 첨부 다운로드는 robots 차단(D-001)
- 증거: `data/manifests/crawl-preflight.json`, `docs/harness/CRAWL_PREFLIGHT.md`,
  `data/manifests/pages.jsonl`, `artifacts/preflight/`

## T-070 workers/ingest — DONE
- HTML→normalized markdown+표 보존, chunk(typed), 키워드 인덱스, wiki/generated 생성,
  규칙후보 추출(draft만). PDF/HWP 등은 형식감지 후 MANUAL_REVIEW_REQUIRED 격리.
- 증거: `data/normalized/`, `wiki/generated/`, `data/app-store/chunks.json`

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

## NEXT (다음 세션 권장)
1. PostgreSQL/Qdrant/Valkey 기동 후 `docker compose up -d` + 마이그레이션 적용 검증
2. 법무 확인 후 첨부 수집 허용 여부 결정(D-001 해제 절차)
3. 원문 기반 규칙 초안 작성 → REVIEWER 검토 → active 승인 플로우 실데이터 운용
4. Playwright 브라우저 설치 후 `pnpm test:e2e` 실행 및 JS렌더 필요 페이지 재분류
