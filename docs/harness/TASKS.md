# TASKS.md

상태: NOT_STARTED | IN_PROGRESS | BLOCKED | DONE

## T-216 묶음 출력·붙임서식 — DONE(코드·자동 검증 범위)
- 사용자 요청: 남은 문서 작성 단계를 DeepSeek로 진행. 모델 `opencode-go/deepseek-v4.1-flash` 격리 smoke/합성 구현 응답 확인. 모델은 원본/코드/개인정보를 받지 않았으며 순수 일정/선택 파서와 테스트를 작성했다. Codex가 검토·통합한다.
- 범위: 명시 선택한 서식만 동일 revision의 ZIP으로 일괄 출력, 원본 확인된 현장대리인계·예정공정표 추가. v1/v2 읽기 호환, 새 저장 v3. DB migration·운영 변경·배포·push 없음.
- 원본 미확인: 도급내역서는 선택 XLSM 시트 목록과 외부 ZIP 구성원에서 찾지 못했다. Windows 보존 ZIP 62개 구성원명 검색은 읽기 실패 0개, 내역/산출/원가 명칭 41개 일치(설계비 등), 도급내역서 명칭은 없음. 중첩 ZIP 내부/모든 XLSM 시트까지 부재를 입증한 것은 아니다. T-217에서 실제 사용하는 양식 확인 전 임의 공식서식/산식 생성 금지.
- 검증: 신규 파서/필드/출력/묶음 API RED→GREEN, 기존 데이터 보존/개인정보 분리, 브라우저 6종·묶음 선택, 전체 lint/typecheck/test/PG/build/E2E, ZIP/XML 독립 확인.
- 결과: 단위/통합214·PG44·E2E9 PASS, lint/typecheck·일반/standalone build·Compose 정적 검증 PASS. 다운로드6개와 묶음 내부3개 CRC/strict XML·개인정보 분리 PASS. 브라우저 연속 실행 429는 응답으로 확정 후 테스트만 서버 reset 헤더에 맞춰 대기하도록 수정; 운영 120회/분 제한 유지. 증거: `TEST_RESULTS.md` T-216, `CONTRACT_FORMS_AUDIT.md`, contract 코드/테스트. 실제 한글 검증 보류, 도급내역서는 T-217, 배포·병합·push 없음.

## T-217 도급내역서 작성 — BLOCKED(원본 양식 확인)
- 실제 사용하는 도급내역서 파일 또는 자료 위치가 필요하다. 현재 확인한 원본에서 해당 양식을 식별하지 못했다.
- 단가·수량·산식·세금·공사원가 항목을 추측해서 공식서식으로 만들지 않는다. 원본 확인 후 입력/출력 범위와 승인된 계산 근거를 결정한다.
- 2026-09-14 Windows 브리지로 attachments 전수 검색을 시도했으나 브리지 전달이 AMBIGUOUS(Windows 측 websocket 426)로 미완료. Mac에는 원본이 없어 추가 조사 불가.

## T-215 후속 서식 작성 — DONE(코드·자동 검증 범위, 한글 직접 검증은 사용자 보류)
- 2026-09-12 사용자: 현재 Mac에서 한글 검증 불가하므로 건너뛰고 다음 단계 진행. 검증 통과로 바꾸지 않으며 설치 경로를 다시 요청하지 않는다.
- 기존 공사표준계약서 작성 흐름에 착공계·준공계·대금청구서 선택, 공통 입력 재사용, 서식별 필수입력/미리보기/HWPX 출력을 추가한다.
- 원본 14.착공계(sheet18), 24.준공계(sheet28), 30.대금청구서(sheet35)를 매크로 실행 없이 대조했다. 예정/실제 날짜, 계약/준공/기지급/청구/공제금액을 구분한다. 원본 수식/법적 판단값 자동 채움과 실제 지급·업무 상태 전이는 하지 않는다.
- 계좌정보는 대금청구서에만 출력하며 모든 작성 내용은 비공개 저장/동일 권한 경계에 둔다. 옛 33항목 저장본은 읽기 호환, 이전 revision 불변, 추가 DB migration 없이 입력 JSON을 확장한다.
- 검증: 입력·레거시·서식 선택·출력 정보 최소화 단위/API 테스트, FileStore/PG 저장 회귀, 브라우저 선택/저장/재조회/다운로드, lint/typecheck/test/PG/build/E2E/Compose. native 한글은 사용자 보류로 미실행.
- 결과: 단위/통합187·PG44·E2E9 통과, 일반/standalone 빌드 통과, 후속 다운로드4개 ZIP CRC/XML strict parse 통과. 증거: `TEST_RESULTS.md`, `CONTRACT_FORMS_AUDIT.md`, 변경한 contract 코드 및 테스트. DeepSeek 합성 설계 검토를 대조해 v1 필수값/숨은 입력 보존 검증을 보완했다. 배포·main 병합·push 없음.

## T-214 계약 문서 작성 — IN_PROGRESS(첫 서식 구현, 실제 한글 검증은 사용자 보류)
- 사용자 우선순위: 검색/배포보다 실제 계약 문서 작성부터. OCR·AI 답변·SSH 설정 변경 제외.
- Mac에 원본 첨부가 이전되지 않았음을 확인하고 Windows 원본 보존 및 manifest 해시 일치를 확인했다.
- 2026.5 수정 배포 ZIP 내부 공사서류 XLSM의 데이터입력/공사표준계약서 구조를 매크로 실행 없이 확인했다.
- 사용자 승인 흐름대로 공사표준계약서 33항목 입력, FileStore/PgStore append-only 초안, 충돌 방지, 항목 미리보기, HWPX 생성/다운로드를 구현했다. 원본 XLSM 수식과 판단값은 자동 채우지 않는다.
- 저장/다운로드 USER 이상 및 owner/ADMIN, CSRF, 입력 길이/날짜/금액/XML 문자 검증, private no-store와 감사 입력값 제외를 적용했다.
- 남은 완료조건: 실제 한글에서 표/문구/긴 입력/페이지 나눔을 확인하고 수정·재저장·재열기(사용자 보류). 착공/준공/대금청구 서식은 T-215에서 구현했다. 추가 계약서·붙임서식 및 일괄 생성은 후속이다. NAS 배포는 별도 승인 전 미실행.
- 증거: `docs/harness/CONTRACT_FORMS_AUDIT.md`, `TEST_RESULTS.md`, `docs/superpowers/plans/2026-09-12-contract-hwpx.md`, 새 contract 관련 코드/테스트.

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

## T-195 평가셋 v2 + OCR 검증 + 잔여 정리 — DONE
- 평가셋 v2: 확장 코퍼스 반영 60문항(신규 주제: 한시특례/노임단가/매뉴얼/합의약정서/단계표 등).
  실측 hit@1 69.5% / hit@3 78.0% / 거부 5·5. 잔여 미스는 미제공 업종 항목과 일치.
- OCR 파이프라인 구현·검증(pdf-parse getImage→tesseract.js kor): 스캔 PDF 1건 저품질로 수동검토 격리, 모듈 유지(env INGEST_OCR).
- 첨부 재시도: buseo ND_fileDownload 5건은 서버 미제공으로 영구 불수집 확정.
- 증거: tests/fixtures/retrieval-eval.json(v2), docs/harness/EVAL_RETRIEVAL.md, workers/ingest/src/ocr-pdf.ts
## T-190 HWP 본문 인제스트(#1 완전 해제) — DONE
- pyhwp hwp5txt.exe 일괄 변환 70/72 성공(실패 2건 빈 문서), HWP-TXT 문서 인제스트 통합.
- 청크 5,689→11,259. 평가: 코퍼스 확장에 따른 경합으로 hit@3 68.9% 실측 기록(평가셋 재조정은 후속).
- 증거: scripts/hwp-batch.py, workers/ingest/src/hwp-txt.ts, data/raw/attachments/hwp-txt/
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
1. **현재 기능 시험 사용**: Mac 접속 후 검색·안내·업무공간을 사용하고 필요한 기능을 정리한다. OCR과 답변 에이전트는 이번 범위에서 제외한다.
2. **공개 HTTPS**: 외부 공개가 필요할 때 도메인/DNS/인증서를 구성한다. NAS 내부 배포·복구 리허설은 완료했다.
3. 규칙 승인 실운용(`/admin/rules`에서 밴드 초안 3건을 원문 대조 후 사람이 승인 - 자동화 금지).
4. **보류 — T-201 벡터 API 런타임 연결**: RAG/에이전트 도입 여부 결정 후 재개.
5. HWP 표/서식과 첨부 원문 링크 품질 개선. OCR은 사용자 결정으로 제외.

## T-213 현재 기능 Mac 시험 사용 배포 — IN_PROGRESS
- 2026-09-18 규칙 검토 UI 보강: `/admin/rules`에 scope·가격 조건·검토 경고 표시 추가(공사 밴드 초안의 검토 포인트가 화면에 보이도록). NAS web 재빌드·healthy. 이제 승인 절차는 사람이 `/admin/rules`에서 원문 대조 후 수행한다.
- 2026-09-17 공사 계약방법 밴드 초안 9건 생성: `scripts/create-construction-band-drafts.mts`(수작업 구조화·멱등)로 공사 표 기준 draft 작성, `scripts/verify-construction-bands.mts` 시뮬레이션 13/13 통과. NAS PG rules 1,378 draft. construction은 전문 2억 보수 적용(종합/전문 구분 입력 없음), other는 2천만 초과 시 REVIEW_REQUIRED. 기존 용역 표 초안 3건은 활성화 금지 권고 — `RULE_REVIEW_PACKET.md` §7.
- 2026-09-17 규칙 검토 자료 + 증분 수집 반영: `RULE_REVIEW_PACKET.md`에 밴드 초안 3건의 원문 대조(전부 용역 표 출처·1건 오인용 모순·공사 표 미반영)와 스키마 검토 필요사항을 정리. `crawl:incremental` 12/12 changed 수집 후 `merge-incremental-ingest.mts`로 전체 인덱스 보존 병합(11,275청크)하고 NAS 파일·PG를 sync-db로 동기화(rules 1,369 draft). jobs 이미지의 rules/retrieval 빌드 누락과 compose job 명령 경로를 수정해 crawler 이미지 재빌드.
- 2026-09-15 NAS 재배포 완료: `git archive`로 `87f026d`(HWPX 6종 포함)를 `/volume2/contract_easy/app`에 배포, 5서비스 healthy·loopback 바인딩·`_migrations` 0001/0002 확인. 이전 tar의 AppleDouble(`._*.sql`) 마이그레이션 크래시는 pg-store 파일명 필터로 재발 방지. 증거: `TEST_RESULTS.md` 2026-09-15 NAS 재배포.
- 검색 청크 11,259개(OCR 0개), 공개 출처 93건·고유 버전 307건(원본 기록 385건의 ID 중복 제거)을 NAS에 추가 적재했다. 기존 운영 프로젝트·사용자·규칙은 변경하지 않았다.
- API 이미지에 `wiki/generated`를 포함하고, 로그인 후 검색 POST/로그아웃의 CSRF 누락을 웹 공통 요청 함수에서 수정했다.
- `scripts/connect-nas.sh`, `공사계약-접속.command`로 Mac에서 SSH 연결을 재개할 수 있다. SSH의 기존 PermitOpen에 두 서비스 포트 추가 승인이 필요하다.
- 비밀번호는 Mac `~/agent-hub/secrets/contract_easy-admin-password`(600)에 보관한다.
- 증거: `docs/harness/TEST_RESULTS.md`; OCR·LLM·유료 임베딩 실행 없음.

## T-199 macOS Codex 재개 환경 — DONE
- Windows OpenCode 세션의 clean commit `10027fa`와 전체 Git 이력을 현재 작업공간으로 이전.
- Mac용 embedded-postgres 빌드를 패키지 단위로 허용하고 install/lint/typecheck/test/build/PG/vector 스모크 통과.
- 원격 저장소는 미설정 상태로 유지. 비밀값과 `.env`는 전송하지 않음.

## T-200 벡터 인덱스 기반 — DONE
- EmbeddingProvider: OpenAI/OpenRouter/Ollama/hash.
- VectorStore: Qdrant REST/local-json.
- `pnpm embed:index`로 hash+local 11,259점 적재 및 검색 검증.
- HybridRetriever async 검색과 RRF 융합 주입점 구현.
- 증거: `packages/retrieval/src/{embeddings,vector-store,embed-index,retriever}.ts`, `scripts/verify-vector.mts`, D-015.

## T-201 벡터 API 런타임 연결 — DEFERRED(사용자 결정)
- 현재 API의 `loadRetriever()`는 키워드 인덱스만 생성하며 vectorSearch를 주입하지 않는다.
- 완료조건: 설정된 provider/store를 API에서 생성, 벡터 실패 시 키워드 폴백, 검색 필터 유지, 단위/API 테스트 추가.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, hash+local API 검색 스모크.
- RAG/에이전트 도입 여부 결정 전까지 구현·검증을 보류한다. 완료로 간주하지 않는다.

## T-202 FileStore 프로젝트 생명주기 기록 — DONE
- 상태 전이(planning→contracting→working→completed→warranty), 변경·이벤트 append-only JSON 기록, 이전 JSON 로드 호환과 AppStore/PgStore 동형 계약을 완료했다.
- 검토 보완: 직접 `updateProject` 상태 변경 차단, 이벤트 엄격 ISO 날짜 검증, 변경·이벤트 최신순 조회, JSON 이력의 입력/반환/조회 객체 복사, ProjectRecord 반환값(create/get/list/update/transition)과 wizardInput의 스냅샷 격리.
- 검증: `pnpm exec vitest run packages/shared/src/shared.test.ts packages/db/src/store.test.ts` (36/36), `pnpm --filter @sen/db typecheck`.
- 증거: `packages/db/src/store.ts`, commits `ba454a8..baebe0c`, `docs/harness/TEST_RESULTS.md`. 현재 상태·증빙 참조는 통제된 작업으로만 변경되며 전이/교체 이력은 append-only.

## T-203 규칙 관리자 API·운영 기동 안전장치 — DONE
- REVIEWER review/hold와 ADMIN activate를 정확히 분리하고, Store의 오류 코드를 HTTP 상태로 보존한다. activation 기준일은 서버의 서울 날짜만 사용한다.
- 임의 condition JSON 없이 method-band 입력만으로 다음 draft revision을 생성한다. legacy rule action API는 제거했다.
- production에서 WEB_ORIGIN과 빈 사용자 테이블의 ADMIN_INITIAL_PASSWORD를 강제하고, credential CORS를 단일 origin으로 잠근다.
- 검증: API+FileStore 44/44, PG 통합 40/40, api/web/db typecheck PASS. malformed 직접 호출 fail-closed, source-side active→target draft sync proof, 단일 HTTP(S) CORS origin 검증 포함.
- 증거: commits `921b5c6..e1831a5`, `apps/api/src/server.test.ts`, `tests/integration/api-pg.pg.test.ts`, `docs/harness/TEST_RESULTS.md`

## T-210 공사계약 업무공간 운영 완성 — DONE
- 규칙 안전성·2인 승인: `packages/shared/src/{date,file,types}.ts`, `packages/rules/src/engine.ts`, `packages/db/src/{app-store,store,pg-store}.ts`.
- 프로젝트·비공개 증빙·API: `apps/api/src/{server,project-files}.ts`; 상태 전이·변경·일정·증빙 교체 이력은 append-only이며 현재 상태/증빙 참조는 통제된 작업으로만 변경, owner/ADMIN 및 project/resource 소속 검증 적용.
- 최소 UI와 회귀: `apps/web/app/admin/rules/page.tsx`, `apps/web/app/workspace/projects/[id]/page.tsx`, `apps/web/app/globals.css`, `tests/e2e/flows.spec.ts`.
- 전체 게이트 증거는 `docs/harness/TEST_RESULTS.md`와 scoped commits에 기록한다.

## T-211 운영 배포 안전장치·NAS 실검증 — DONE(내부 파일럿; 공개 HTTPS 대기)
- 완료: 운영 API의 PostgreSQL/WEB_ORIGIN 필수 주입, 최초 관리자 비밀번호 전달, 컨테이너 외부 API 수신,
  웹 build-time 공개 API URL, NAS 데이터 절대경로 강제, 내부 PostgreSQL/Qdrant/Valkey host publish 제거,
  웹/API 기본 loopback bind, `db:migrate` 명령과 정적 Compose 회귀 검증을 추가했다.
- NAS 실증: `/volume2/contract_easy/app` 격리 배포, 5서비스 healthy/restart0, API 8787·web 3300 loopback, 내부 DB/vector/cache host port 미노출, migration 및 legacy `project_checklist_items.evidence_path` non-null 0건 확인.
- 파일럿: admin 로그인/비밀번호 보존 및 env 제거, 프로젝트 생성·상세·상태 전이·체크리스트·synthetic PDF 증빙 hash 왕복·변경/마일스톤, 401/CSRF/잘못된 입력/fail-closed PASS.
- 백업: gzip 무결성 및 운영 DB를 덮어쓰지 않는 임시 DB 복구·sanity query·정확한 임시 DB 삭제 PASS.
- 남음: 확정 hostname/DNS/인증서가 없어 공개 HTTPS reverse proxy는 외부 입력 대기. AnchorMind 기존 컨테이너/볼륨은 미수정.
- 증거: `docker-compose.yml`, `.env.example`, `infra/docker/web.Dockerfile`,
  `apps/api/src/server.ts`, `scripts/validate-compose.mjs`, `docs/harness/RUNBOOK.md`.

## T-212 GitHub/GitLab 원격 동기화 — DONE(2026-09-15)
- GitLab pre-receive 보안 검사 통과 조치: `data/app-store/db.json` 추적 해제(Gitleaks), fastify5/next15.5/drizzle0.45/vitest4/tsx/adm-zip0.6.1 업그레이드 + js-yaml·postcss override(OSV 42→0, Trivy 의존성 0), Dockerfile 3종 비루트 `node` 사용자(Trivy DS-0002).
- 업그레이드 회귀 수정: @fastify/cors v11 기본 allow-methods 축소 → PATCH/PUT/DELETE 명시, Fastify5 error unknown 좁히기, vitest4 poolOptions 제거 → fileParallelism:false.
- 검증: lint/typecheck/test 214/PG 44/E2E 9/9/build/standalone/compose:validate 전부 PASS. 양쪽 `main` = `2546114`. NAS bind mount는 `chown -R 1000:1000` 필요(RUNBOOK 기록).
- GitHub `h19h29-design/contract_easy`와 공개 GitLab `h19h19/contract_easy`의 `main`을 동일 커밋으로 맞췄다.
- GitLab 서버의 pull mirror 방향은 현재 계정에서 제공되지 않아, 현재 Mac의 `origin` push URL을 GitHub와 GitLab 두 곳으로 구성했다.
- `git push origin`은 두 원격에 순차 push한다. GitHub 웹이나 다른 checkout에서 GitHub만 갱신한 변경은 자동 추종하지 않으므로, 해당 환경에도 다중 push 설정 또는 별도 최소권한 자동화가 필요하다.
- 증거: `git ls-remote --heads` 양쪽 동일 SHA, `git push --dry-run origin main` 양쪽 `Everything up-to-date`, `docs/harness/TEST_RESULTS.md`.
