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

## T-171 공지사항 pagination 완전 탐색 — DONE
- 페이지 번호 동적 큐 방식으로 개선(첫 화면 번호에 한정하지 않음)
- 실측: 8페이지 방문 후 9·10페이지 빈 셸 확인 → 상세 38건 전수 수집 확정
- 증거: workers/crawler/src/crawl.ts, docs/harness/UNCOLLECTED.md 4번 항목

## T-172 미수집 정보 목록 — DONE
- docs/harness/UNCOLLECTED.md 신설: 첨부 원문·FAQ 개별 글·셀렉터 표·외부 법령·OCR 등 사유/영향/해제조건 정리

## T-150~153 PostgreSQL 운영 경로 — DONE
- AppStore 계약 추출(FileStore/PgStore 동형), PgStore 전 메서드 구현,
  마이그레이션 러너(멱등, _migrations 관리), createStore 팩토리(DATABASE_URL 분기),
  API 완전 async 전환, embedded-postgres 기반 통합테스트 **13/13 PASS**
- 규칙 upsert 상태 에스컬레이션 가드 추가(D-011)
- 증거: `packages/db/src/pg-store.ts`, `packages/db/src/migrate.ts`,
  `tests/integration/*.pg.test.ts`, `docs/harness/TEST_RESULTS.md` 2026-08-26 절

## T-160~163 지식 품질 고도화 — DONE
- FAQ 청크 타입·카테고리(247개), 계약방법 표→구조화 규칙 초안(3건, draft 전용·경계 warning),
  `ingest:sync-db`(파일→PG 멱등 적재, pg테스트 16/16),
  리트리벌 평가셋 45+5문항(`pnpm eval:retrieval`) — hit@3 **84.4%**, 거부판정 5/5 실측
- 검색 스코어링 개선: 전체 단어 일치 가중 + 조사 제거 매칭 + 커버리지 보너스
- 증거: `docs/harness/EVAL_RETRIEVAL.md`, `tests/fixtures/retrieval-eval.json`,
  `workers/ingest/src/rule-tables.ts`, `sync-db.ts`, `packages/retrieval/src/keyword.ts`

## T-185~188 확장 마무리 — DONE
- ZIP 추출(adm-zip): 62개 스캔 → 멤버 52개 추출, 내부 PDF 자동 인제스트(PDF 문서 15→22)
- #3-나 종결: 빈 카테고리 gm(C00~05)×step(01~06) 전수 조회 무콘텐츠 실측
- FAQ 통합판 본문 기반 카테고리 추정 분류 적용(null 해소)
- 리트리벌 다양성 캡(소스당 3건) 추가, 최종 평가 hit@3 77.8% / 거부 5·5 실측
- 증거: workers/ingest/src/zip-extract.ts, docs/harness/EVAL_RETRIEVAL.md, UNCOLLECTED.md 최종표
## T-180 첨부 수집(D-014 승인) + PDF 인제스트 — DONE
- 운영자 승인(D-014) + robots 재해석(차단 패턴은 직접 확장자 URL 대상, .do 엔드포인트는 외부)에 따라 실행.
- pnpm crawl:attachments: 135/141 성공(zip65 hwp45 pdf19 xls5 png1), 매직바이트 검증·크기 상한·미실행.
- PDF 어댑터(pdf-parse v2): 15문서 → 256 청 추가, 스캔 1건 스킵. HWP 파서는 미구현(문서화).
- 증거: data/raw/attachments/, data/manifests/attachments.jsonl, TEST_RESULTS 5차 세션 표.

## T-181 셀렉터 UI-walk v3 — PARTIAL
- 캐스케이딩 드롭다운 구동 성공(gb→gy 동적 로딩: 공사2/용역10/물품8). 적용 클릭 20회.
- 결과 표 미렌더 → fncSubView 응답 캡처가 다음 착수점. XHR 로그 보존(selector-xhr.jsonl).
- 증거: workers/crawler/src/selector-walk.ts, UNCOLLECTED.md 3번(부분 진행).
## T-175 외부 FAQ BBS 수집(#2 해제) — DONE
- buseo.sen.go.kr robots 재확인 후 allowlist 추가(D-013, 운영자 지시)
- 신규 수집기 `pnpm crawl:faq-bbs`: 목록 pagination(전체 페이지 수 헤더 파싱) + 상세(BD_selectBbs.do)
  → **개별 Q&A 137건** 수집. 오판 형제 게시판 확장(103건)은 식별·삭제하고 기본 비활성화(env 게이트).
- 재인제스트: faq 청크 2,769개. 증거: UNCOLLECTED.md 2번, TEST_RESULTS 4차 세션 표

## T-176 미수집 현황 갱신(#3~#5 판정) — DONE
- #3 셀렉터: AJAX 확인됨 → UI-walk 다음 세션 착수(NEXT 1번)
- #4 law.go.kr: 코퍼스 내 링크 0건 스캔 확인 → 대상 부재로 종결(robots는 Allow)
- #5 OCR: #1 robots 차단에 종속됨을 명시
- 증거: docs/harness/UNCOLLECTED.md (2차 갱신)

## NEXT (다음 세션 권장)
1. 계약방법 셀렉터 UI-walk 개발(탭 클릭→XHR 관찰→엔드포인트 학습) — UNCOLLECTED 3번 해제
2. Docker 가용 환경에서 `docker compose up -d` + `pnpm db:migrate` 최종 확인
2. 법무 확인: (a) 첨부 수집 허용 여부(D-001), (b) 외부 BBS allowlist, (c) 규칙 초안 3건의 원문 대조·승인(/admin/rules)
3. 동적 셀렉터 페이지(계약방법 메인) 탭별 렌더 수집으로 표 데이터 확장
4. 상세 미수집 공지(컴퓨터교실·일부위탁급식 등) 대상 공지 전체 크롤 확대 → 평가 hit@3 추가 향상 여지
5. FAQ 질의응답 구조 파악 후 faq chunk Q/A 분할(현재는 원문 왜곡 방지 위해 분류만 적용)
