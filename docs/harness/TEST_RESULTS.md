# TEST_RESULTS.md

형식: 날짜 / 명령 / 결과 / 핵심출력. 모든 수치는 실제 실행 산출물 기준.

## 2026-08-26 3차 세션 (FAQ 타입·구조화 규칙 초안·PG 동기화·평가셋)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| FAQ 청크 세분화 | PASS | `type=faq` **247개**(general 60/goods 63/service 62/construction 62), `faqCategory` 필터 메타 부여 |
| 구조화 규칙 초안(계약방법 표) | PASS | 실제 수집 표에서 밴드 초안 **3건 생성**(수의계약 2000만~1억, 입찰 <1억, 입찰 1억~2.3억) — 전부 draft, 경계(이하/초과) warning 포함. 단위테스트 포함 총 70 PASS |
| `ingest:sync-db`(파일→PG) | PASS | pg 통합테스트 신규 3건 포함 **16/16 PASS** — 버전 재생 멱등(재동기화 changed=0), 규칙 active 보존(D-011), 미존재 candidate 정리 |
| 리트리벌 평가셋(`pnpm eval:retrieval`) | 실측 기록 | 45문항: **hit@1 60.0%, hit@3 84.4%**, 비코퍼스 거부 판정 **5/5**. 스코어링 개선(전체단어 가중+조사 제거)으로 hit@3 66.7%→84.4% 향상. 잔여 미스는 상세 미수집 공지 제목 성분 → `EVAL_RETRIEVAL.md` 문서화 |

명령 게이트: lint PASS / typecheck PASS / test 70·70 / build PASS / test:pg 16·16

## 2026-08-25 추가 실행 (2차 세션)

| 명령 | 결과 | 핵심 출력 |
| --- | --- | --- |
| `pnpm crawl:incremental` 3회 | PASS | 1회 changedUrls=1(이전 Playwright/HTTP 엔진 전환분), **2·3회 changedUrls=0** — 증분 안정성 확인 |
| `pnpm crawl:diff` | PASS | 버전 쌍 나란히 출력(v2→v3 등, 엔진 전환 이력 반영) |
| `pnpm ingest:all` 2회 연속 | PASS | candidates=63 멱등(2회차 staleRemoved=0), active=0 유지. 오래된 candidate 초안 자동 정리(reviewed/active 보존) 확인 |
| 규칙 후보 문맥 저장 | PASS | 63건 전부 `candidate.quotedSentence/contextBefore/contextAfter` 보유 → `/admin/rules` 화면 표시(단위테스트 포함) |
| `pnpm compose:validate` | PASS | 7서비스·healthcheck·host/privileged 미사용·latest 없음·SESSION_SECRET 필수·NAS 경로 변수화 확인(Docker config 대체 아님) |

## 2026-08-25 최종

| 명령 | 결과 | 핵심 출력 |
| --- | --- | --- |
| `pnpm install` | PASS | lockfile 생성(pnpm-lock.yaml) |
| `pnpm lint` | PASS | eslint flat config, 0 error 0 warning |
| `pnpm typecheck` | PASS | 워크스페이스 10개 프로젝트 tsc --noEmit 전부 통과 |
| `pnpm test` | PASS | **Vitest 파일 7개 / 테스트 60개 전부 통과** (규칙 경계값, store 버전관리, retrieval 게이트, api 통합, crawler robots, ingest 정규화 포함) |
| `pnpm build` | PASS | web(next build, 전 라우트 생성) + api/crawler/ingest(tsc dist) |
| `pnpm crawl:preflight` | PASS | **12/12 seed HTTP 200**, verdict=PASS → `data/manifests/crawl-preflight.json`, `docs/harness/CRAWL_PREFLIGHT.md` |
| `pnpm crawl:sample` | PASS | 1페이지 수집, manifest 기록 |
| `pnpm crawl:full` + `pnpm crawl:board` (CRAWLER_ENGINE=playwright) | PASS | **source 50건 / version 160개 / 상세 게시물 38건(공지사항) / 첨부 메타 72건** → `data/manifests/pages.jsonl`, `files.jsonl`, `crawl-runs.jsonl` |
| 재수집 중복 검증 | PASS | 동일 콘텐츠 재수집 시 `changed=false`, 원본 중복 없음(content-addressed 저장). 단위테스트(store.test.ts)+pages.jsonl 실측 |
| 변경 감지 | PASS | playwright 렌더 HTML과 HTTP fetch HTML의 차이로 12개 seed가 신규 버전(v2)으로 기록됨을 실측 → diff 대상 존재(`pnpm crawl:diff`) |
| `pnpm ingest:all` | PASS | normalized **50건**, chunk **2,535개**, 위키 **15개 파일**(내용 있는 파일 7개: 체크리스트 35KB, FAQ 42KB, 공지사항 모음 86KB 등), 규칙후보 **60건(draft)** |
| 키워드 검색(API 키 없이) | PASS | `/api/search?q=계약보증금` → 20건, `/api/search?q=부정당업자` → 20건 |
| 출처 게이트 | PASS | 근거 있는 질문: keywordHits=5 + "AI 미설정" 공지 표시 / 근거 없는 질문(예: 하자보증기간 — 현재 corpus에 부재): 답변 거부(refusalReason 반환) |
| 마법사 REVIEW_REQUIRED | PASS | 활성 규칙 0개 → `decisionState=REVIEW_REQUIRED`, 숫자 추측 없음 |
| API 통합(인증·RBAC·CSRF) | PASS | server.test.ts: 로그인 → 프로젝트 생성(단계10+체크리스트30 자동) → 체크리스트 토글, CSRF 누락 403, 비로그인 401, 오답 비밀번호 401+감사로그 |
| 스크린샷·샘플 증거 | PASS | `artifacts/preflight/shot-*.png`(렌더 페이지 다수), `artifacts/preflight/sample-guide.html`, `sample-guide.body.txt` |

## 실행 불가 / 보류 항목
- `docker compose config|up`: **본 머신에 Docker 미설치** → 실행 불가(D-008). 설정·문서는 준비 완료.
- `pnpm test:e2e` | PASS | **5개 시나리오 전부 통과(6.1s)** — 홈 3선택지, 마법사 완료→REVIEW_REQUIRED, 검색 결과 표시, 근거 없는 질문 답변 거부(API), 로그인→프로젝트 생성→체크리스트 변경(실제 Chromium 브라우저)
- 첨부파일 샘플 다운로드: **BLOCKED_ROBOTS**(D-001). fixture로 MIME/확장자/SHA-256/격리 로직 검증 대체(crawler.test.ts PASS).
- FAQ 4개 게시판의 개별 글: 목록이 외부 도메인(buseo.sen.go.kr BBS) 링크 또는 단일 페이지 인라인 구성 → 외부 본문은 수집 금지 원칙 유지(D-001 계열), 인라인 본문은 정상 인덱스됨.

## API 스모크(실측)
- `GET /api/health` → `{"status":"ok","llmProvider":"none","embeddingProvider":"none","databaseMode":"file-store"}`
- `POST /api/wizard` → `REVIEW_REQUIRED`
- `GET /api/wiki` → 15파일, `GET /api/wiki/11-FAQ.md` → 44,779자
- `POST /api/ask`(근거 있음) → `{answered:false, providerNotice:"현재 AI 답변 기능이 설정되지 않았습니다...", keywordHits:5}`
- `POST /api/ask`(근거 없음) → `{answered:false, refusalReason:"근거가 되는 원문을 찾지 못했습니다..."}`

## 2026-08-26 PostgreSQL 운영 경로 검증

| 명령 | 결과 | 핵심 출력 |
| --- | --- | --- |
| `pnpm test:pg` (embedded-postgres, 실제 PG 바이너리) | PASS | **2파일 / 13테스트 전부 통과** |
| 마이그레이션 적용 | PASS | `drizzle/0001_init.sql` 커밋 트랜잭션 적용 + `_migrations` 이력 관리, 재적용 0건(멱등) 확인 |
| PgStore 원문 버전관리 | PASS | 동일 해시 재수집 중복 없음 + rawHtmlPath/menuPath 보완, 변경 시 신버전+구버전 보존 |
| PgStore 규칙 플로우 | PASS | draft→activate 차단, review 후 activate, 재upsert 시 active 유지(D-011 가드), 신규 active 시 구버전 superseded |
| PgStore RBAC/세션/프로젝트 | PASS | scrypt 검증, ADMIN 우회, 체크리스트 토글→단계 상태 done, 세션 만료/삭제 |
| API PostgreSQL 모드 | PASS | buildApp에 PG 스토어 주입 → 로그인·프로젝트 생성(10단계)·출처 목록 동작 |
| 팩토리 createStore | PASS | DATABASE_URL 있음→PgStore / 없음→FileStore 선택 확인 |
