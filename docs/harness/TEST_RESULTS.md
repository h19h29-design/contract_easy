# TEST_RESULTS.md

형식: 날짜 / 명령 / 결과 / 핵심출력. 모든 수치는 실제 실행 산출물 기준.

## 2026-09-17 공사 계약방법 밴드 초안 9건 생성·PG 동기화

범위: 사전체크리스트-공사 표(MI…332)를 수작업 구조화해 마법사용 밴드 초안 생성. 승인(reviewed/active)은 수행하지 않음 — 사람 작업.

| 검증 | 결과 | 핵심 |
| --- | --- | --- |
| `tsx scripts/create-construction-band-drafts.mts` | PASS | 9건 upsert(전부 draft), `validateActivatableRule` 전원 통과 |
| `tsx scripts/verify-construction-bands.mts` | PASS | 메모리 active 간주 시뮬레이션 13/13 — 경계값(2천만/2억/1.6억)·other→REVIEW_REQUIRED·충돌 0 확인 |
| `vitest run engine.test.ts store.test.ts` | PASS | 60/60 |
| NAS PG `sync-db` | PASS | rules 1,369→**1,378** draft, versionsChanged=0(멱등), chunks 미전송(기존 11,275 유지) |
| PG 확인 쿼리 | PASS | 신규 9건 scope·조건·method 일치, 전체 status=draft |

비고: 기존 용역 표 초안 3건은 scope `{}`라 공사 밴드와 공존 시 충돌 위험 — 활성화 금지 권고를 `RULE_REVIEW_PACKET.md` §7에 기록.

## 2026-09-17 규칙 검토 자료 + 증분 수집·병합 인제스트·PG 동기화(T-213 후속)

범위: 규칙 승인 지원 자료 작성, 계약길잡이 증분 수집, 변경분의 인덱스·PG 반영. 규칙 승인 자체는 사람 작업으로 수행하지 않음.

| 검증 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm rules:queue` 재생성 | PASS | bands=3 candidates=1,363 → `RULE_REVIEW_QUEUE.md` |
| 밴드 초안 원문 대조 자료 | PASS | `RULE_REVIEW_PACKET.md` — 3건 모두 용역 표 출처, 1건은 우선구매 표 오인용·모순, 공사 표(종합4억/전문2억/전기 등1.6억+1인수의2천만) 미반영·스코프 공백 확인 |
| `pnpm crawl:incremental` | PASS | fetched=12 changed=12 failures=0, robots·간격 준수 |
| 증분 병합 인제스트 | PASS | `scripts/merge-incremental-ingest.mts`: 기준 11,259 - 구 청크 869 + 신규 885 = **11,275**; candidates 1,366·bands 3·staleRemoved=0 재생성 |
| `ingest:all` 부분 raw 주의 | 문서화 | raw 없는 source의 청크·후보를 통째로 버림(885/66으로 축소) → NAS 전체 인덱스로 복원+병합 방식으로 해소, wiki/generated는 git 복원 |
| NAS PG `ingest:sync-db` | PASS | sources 93·versions 397(신규 고유 버전 +1: 공지사항 목록 v67)·attachments 161·chunks 11,275·rules 1,369·staleDraftsRemoved=0 |
| PG 상태 확인 | PASS | source_versions 308·rules 1,369·rule_versions 1,369·document_chunks 11,275 |
| NAS 파일 반영 | PASS | `chunks.json`(11,275)·`sources-public.json`(93) 업로드·md5 일치·bak 보존, api 재시작 후 `/api/search?q=수의계약` 20건 히트 |
| jobs 이미지 결함 수정 | PASS | crawler.Dockerfile에 `@sen/rules`·`@sen/retrieval` 빌드 누락 추가, compose jobs 명령 경로 `dist/cli.js`/`../ingest` → `workers/*/dist/cli.js` 정정, `pnpm compose:validate` PASS, NAS `sen-contract-guide-crawler` 재빌드·dist 존재 확인 |

비고: 12개 "changed" 중 실제 신규 콘텐츠는 공지사항 목록 1건(나머지는 과거 변형 재수집으로 sha 중복). 규칙 후보는 FileStore·PG 모두 1,369건 draft, active 0 유지 — 승인은 `/admin/rules`에서 사람이 수행.

## 2026-09-15 NAS 재배포 — HWPX 계약서식 포함 신규 코드 반영(T-213 후속)

원인: 이전 동기화가 `COPYFILE_DISABLE` 없는 macOS tar로 만들어져 `._*.sql`(AppleDouble)이 이미지 안 drizzle 디렉터리에 섞였고, 마이그레이션 러너가 `.sql` 필터에 걸려 바이너리 쓰레기를 PostgreSQL로 보내 `invalid message format`으로 api가 재시작 루프.

조치: `packages/db/src/pg-store.ts`의 마이그레이션 파일 필터를 `/^\\d+.*\\.sql$/`로 제한(commit `87f026d`). 배포물은 `git archive HEAD`로 생성해 추적 파일만 포함 — AppleDouble·node_modules·로컬 data 없음.

| 검증 | 결과 | 핵심 |
| --- | --- | --- |
| `git archive` tar.gz | PASS | `._*` 0건, drizzle 2개 실제 SQL만, md5 일치(`2d2316fa…`) |
| NAS 스테이징 해제 | PASS | `._*` 0건, node_modules 0건 |
| `docker compose up -d --build` | PASS | api/web 재빌드·재생성, api Healthy 후 web Started |
| 컨테이너 상태 | PASS | web·api·postgres·qdrant·valkey 5개 전부 healthy |
| `_migrations` 조회 | PASS | 0001(08-30)·0002(09-15 02:53 UTC) 적용, 추가 적용 없이 기동 |
| `curl 127.0.0.1:8787/api/health` | PASS | 200 |
| `curl 127.0.0.1:3300/` | PASS | 200, `<title>서울시교육청 공사계약 통합지원</title>` |
| `/api/projects` 무인증 | PASS | 401 `로그인이 필요합니다.`(인증 강제 정상) |
| `/api/sources` | PASS | 200 |
| 포트 바인딩 | PASS | web `127.0.0.1:3300`, api `127.0.0.1:8787`; postgres·qdrant·valkey host publish 없음 |
| 잔여물 정리 | PASS | 오염 app 디렉터리·stray `api-run` 컨테이너·홈 tar 파일 삭제, `app.bak-20260915` 롤백 보존 |
| `git push origin main` | PASS | GitHub·GitLab 모두 `dfd0b3d..87f026d`, GitLab 보안 스캔(Gitleaks/Semgrep/OSV/Trivy/Syft) PASS |

잔여: 실제 한글 열기/편집 검증은 사용자 보류, 도급내역서(T-217) 원본 확인 대기, 공개 HTTPS는 hostname/DNS/인증서 외부 입력 대기, Mac 접속용 SSH PermitOpen 3300/8787 승인 대기.

## 2026-09-15 GitLab 보안 게이트 통과용 의존성 업그레이드(T-212 후속)

배경: GitLab pre-receive 보안 검사가 main 푸시를 거부. Gitleaks(`data/app-store/db.json`의 개발 세션 토큰), OSV 42건, Trivy HIGH/CRITICAL 16건.

조치: `data/app-store/db.json` 추적 해제(gitignore 추가, 작업 DB는 런타임 생성물), fastify 4→5.12.4 + @fastify/* v11, next 14→15.5.25, drizzle-orm 0.34→0.45.2, vitest 2→4.1.11, tsx 4.23.13, adm-zip 0.6.1(zip-slip 수정판), pnpm overrides로 js-yaml 4.3.2·postcss 8.5.28.

업그레이드로 드러난 실제 변경:
- @fastify/cors v11은 기본 allow-methods가 GET,HEAD,POST만 → PATCH/PUT/DELETE 명시 추가(없으면 브라우저 프리플라이트가 mutation을 전부 차단).
- Fastify 5 setErrorHandler의 error 타입이 unknown → 좁혀서 사용.
- vitest 4는 poolOptions 제거 → PG 테스트에 fileParallelism:false+maxWorkers:1(없으면 동일 embedded PG에 동시 migration으로 실패).
- next-env.d.ts는 Next 15 자동 생성 triple-slash reference 포함 → eslint ignore에 추가, CRLF→LF.

| 검증 | 결과 |
| --- | --- |
| `osv-scanner scan --lockfile` | PASS — 42건 → 0건 |
| `trivy fs --scanners vuln --severity HIGH,CRITICAL pnpm-lock.yaml` | PASS — 0건 |
| `gitleaks git --log-opts=320cc45..HEAD` | PASS — 신규 커밋 범위 0건 |
| `pnpm lint` / `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 16 files, 214 tests |
| `pnpm test:pg` | PASS — 4 files, 44 tests |
| `pnpm build` / `NEXT_STANDALONE=1` web build | PASS |
| `pnpm test:e2e` | PASS — Chromium 9/9 |
| `pnpm compose:validate`, `git diff --check` | PASS |

## 2026-09-12 선택 ZIP·현장대리인계·예정공정표(T-216)

범위: 6종/57항목/v3, v1/v2 읽기 보존, 명시 선택한 동일 revision의 HWPX ZIP. 개인 입력값의 공개 검색/감사 로그 편입 없음. OCR/AI/RAG·운영 DB·배포·main 병합·push 제외.

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| 신규 파서/필드/출력/묶음 API TDD | PASS | 모듈 없음/필드 거부/ZIP 404/대표자 출력 없음 RED 확인 후 GREEN; 파서25, 관련4파일57 tests |
| `pnpm lint`, `pnpm typecheck` | PASS | 전체 workspace, E2E 요청 대기 보완 후 재통과 |
| `pnpm test` | PASS | 16 files, 214 tests |
| `pnpm test:pg` | PASS | 4 files, 44 tests; 격리 PostgreSQL |
| `pnpm build` | PASS | 전체 workspace |
| `NEXT_STANDALONE=1 pnpm --filter web build` | PASS | standalone; 실제 배포 아님 |
| `pnpm test:e2e` | PASS | 최종 Chromium 9/9, 1.1분; 6종 입력/저장/다운로드, ZIP 선택/검토 재확인/빈 선택 방지, 기존 업무 회귀 |
| `pnpm compose:validate`, `git diff --check` | PASS | 정적 검증; 운영 Compose 실행 아님 |
| 다운로드 ZIP/XML 독립 검사 | PASS | 개별 HWPX6개(대금 v3/v4 포함) + ZIP 내부3개, 각각 CRC/12 parts/8 XML·HPF·RDF strict parse; 선택한 3종만 포함, 계좌/현장대리인 정보 분리 |
| 데스크톱/390px 모바일 | PASS | 묶음 화면 스크린샷 직접 확인, 가로 넘침 없음, 새 흐름 page/console error 없음 |
| 실제 한글 열기/편집/인쇄 | DEFERRED | 사용자 지시로 건너뜀; ZIP/XML 통과는 한글 호환성 검증을 대신하지 않음 |

전체 E2E 초기 8/9 실패: 기존 변경 기록 POST와 상세 GET은200이나 이후 `/api/auth/me` GET429로 화면 갱신 실패. 응답 상태로 원인을 확인했다. 테스트 beforeEach가 health의 `x-ratelimit-remaining/reset`으로 한 흐름의 요청 여유를 확보하도록 대기하며, 운영 120회/분 제한과 인증 코드는 변경하지 않았다. 최종 9/9 통과. Browser plugin not available: 기존 Playwright Chromium으로 검증했다.

DeepSeek 실행: 현재 CLI 목록의 정확한 `opencode-go/deepseek-v4.1-flash`를 고정하고 격리 smoke 실제 marker/exit0 확인. 합성 명세로 순수 일정/선택 파서 및25테스트를 생성했고 Codex가 검토·통합·실행했다. 별도 합성 설계 검토도 exit0; 프로젝트 소스를 읽은 독립 코드 리뷰는 아니다. 검토 의견은 (1) 확인 체크의 영구 승인화: 법적 승인 기능이 아니므로 범위 밖, (2) 빈 선택 허용 주장: 실제 파서/API 거부 테스트와 불일치, (3) 구버전 신규서식 필수값: 원래 4종 호환 유지 및 신규서식 입력 필요가 의도된 동작, (4) 일정 셀 이동/저장 누락/XML 검증 누락: 정확한3열·revision 저장·공통 XML 검증으로 대조하여 미채택. 원본·프로젝트 코드·개인정보·운영 데이터·시크릿은 외부 모델에 보내지 않았다.

합성 실행 증거(임시 경로, 영구 보관 아님):
- DeepSeek 구현/설계 검토: `/tmp/contract-deepseek.m1bFG6/implementation.json`, `/tmp/contract-deepseek.m1bFG6/final-review.json`
- 브라우저 다운로드/스크린샷: `/var/folders/j3/pvwfggzs74qfc1bkh1vyscqr0000gn/T/contract-followups-Npy7oC` (`bundle-desktop.png`, `bundle-mobile.png`, 6 HWPX, 3종 ZIP)
- 원본 조사: 읽기 전용 Windows ZIP62개 구성원명 확인, 실패0; 도급내역서 식별 불가. T-217 원본 양식 확인 대기. 상세는 `CONTRACT_FORMS_AUDIT.md`.

한계: 예정공정표는 기간 표이며 원본 일별 막대 배치가 아니다. 도급내역서·자동 원가/청구 산식은 미구현. NAS에서 이번 변경을 사용할 수 있는 상태로 배포한 것은 아니다.

## 2026-09-12 후속 서식 3종 작성(T-215)

범위: 기존 공사표준계약서 + 착공계·준공계·대금청구서 선택, 47항목 공통 번들, 서식별 필수입력/미리보기/HWPX. 원본 XLSM은 읽기 전용 대조만 수행했다. OCR/AI/RAG·운영 DB·배포·push 제외.

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck` | PASS | 전체 workspace, exit 0; 검토 후 테스트 보완 뒤에도 재통과 |
| `pnpm test` | PASS | 15 files, 187 tests |
| `pnpm test:pg` | PASS | 4 files, 44 tests; 격리 embedded PostgreSQL |
| `pnpm build` | PASS | 전체 workspace, 후속 서식 선택 동적 경로 포함 |
| `NEXT_STANDALONE=1 pnpm --filter web build` | PASS | standalone 빌드, 실제 배포 아님 |
| `pnpm compose:validate`, `git diff --check` | PASS | 정적 구조/공백 검증 |
| `pnpm exec vitest run apps/api/src/contract-routes.test.ts` | PASS | 5/5, DeepSeek 제안 대조 후 v1 후속 서식 필수값 거부 보완 |
| `pnpm test:e2e` | PASS | 최종 Chromium 9/9, 23.5초; 숨은 계좌 필드 저장/재조회/재출력 포함 |
| 후속 HWPX ZIP/XML | PASS | 착공계14,457B·준공계14,389B·대금청구서v3/v4 각14,617B, 각12 ZIP entries/8 XML·HPF·RDF strict parse 및 CRC |
| 실제 한컴 한글 열기/편집/인쇄 | DEFERRED | 사용자가 Mac에서 확인 불가하므로 건너뛰도록 지시; 미검증 유지 |

- TDD: 신규 필드/서식별 필수값/출력 선택/브라우저 서식 선택 부재의 RED 확인 후 구현. 신규 생성기 테스트는 계좌정보의 내부 미리보기 누출을 검출했고 선택 필드만 출력하도록 수정했다. 초기 lint의 부정 숫자 입력 테스트에서 정밀도 손실 리터럴 경고를 발견해 명시적 문자열→Number 변환으로 의도를 드러냈다.
- FileStore/PG: 대형 금액 문자열과 계좌 필드 왕복/이전 revision 보존. API: owner/ADMIN, 익명401·타사용자404, 서식/버전 검증, 기존 v1 응답 정규화 후 저장 파일 byte 불변, 후속 필수값 없는 v1 출력422.
- HWPX 생성기: 예정/실제 날짜 분리, 수동 금액 유지, 계좌정보는 대금청구서 본문과 내부 preview에만 포함. 다른 서식의 모든 압축 해제 ZIP part에 계좌정보가 없는지 검사한다.
- 환경 이슈: 최초 E2E 준비 시 disk I/O/ENOSPC(여유 약111MB)로 막혔다. 이 작업에서 원본·DB·캐시를 삭제하지 않았다. 이후 외부 환경의 공간이 회복됐다. 이어서 기존 브라우저 실행 파일 부재로 재검증 실패(8개 시작 불가, 비브라우저1개 통과); `pnpm exec playwright install chromium`으로 해당 테스트 의존성을 설치했다.
- DeepSeek: 사용자 요청으로 `opencode-go/deepseek-v4.1-flash`의 새 모델 목록·격리 smoke `DEEPSEEK_SMOKE_OK`·독립 설계 검토 응답을 확인했다(exit0). 합성 설계 설명만 전송했으며 프로젝트 코드/원본/개인정보/secret은 전송하지 않았다. 제공자의 내부 모델 신원은 별도 입증하지 않는다. 원본 코드 검토를 수행했다고 주장하지 않는다.
- DeepSeek 지적 대조: required는 trim 후 빈 문자열 검사, planned 날짜 순서 검증, projectId+revision 조회, 고정 키 allowlist, 금액 정규식, actor/action/project/time을 갖춘 감사 구조가 이미 존재한다. 불필요한 날짜 교차 제한이나 export POST 전환은 적용하지 않았다. 제안 중 v1의 후속 필수값 거부 및 서식 전환 후 숨은 필드 저장/재조회/출력 회귀만 보완했다. 최종 코드 판단은 Codex가 수행했다.
- UI QA: 기존 Playwright 사용(전용 Browser 스킬 부재). 후속 작성 경로/제목·서식 선택·버전 표시 확인, 작성 화면 console/pageerror 0, 데스크톱1280×720 및 모바일390×844 스크린샷 직접 확인, 모바일 가로 넘침 없음. 이는 한글 출력 배치 검증이 아니다.
- 최신 합성 산출물: `/var/folders/j3/pvwfggzs74qfc1bkh1vyscqr0000gn/T/contract-followups-7sOdXH` (`payment-desktop.png`, `payment-mobile.png`, 3종 HWPX/대금청구서 두 버전). 임시 경로로 OS 정리 가능. 원본/운영정보 없음. DeepSeek 실행 증거 `/tmp/contract-deepseek.m1bFG6/smoke.json`, `review.json`은 합성 설명에 대한 응답이며 비밀값 제외.

남음: 실제 한글 렌더링/편집·인쇄, 외부 공개 시 원본 재사용 조건 확인, 일괄 생성·현장대리인계/공정표/도급내역서 자동 작성. 새 기능은 아직 NAS에 배포하지 않았다.

## 2026-09-12 공사표준계약서 HWPX 시험 작성 구현(T-214)

범위: 공사표준계약서 1종, 33항목 입력/비공개 저장/수정/항목 미리보기/텍스트·표 HWPX 다운로드. 원본 XLSM은 읽기 전용 대조만 했으며 매크로 실행·운영 DB 변경·NAS 배포·외부 모델 전송·자동 push 없음.

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck` | PASS | 전체 workspace, exit 0 |
| `pnpm test` | PASS | 15 files, 178 tests |
| `pnpm test:pg` | PASS | 4 files, 44 tests; 격리 embedded PostgreSQL |
| `pnpm build` | PASS | 전체 workspace, 계약서 동적 경로 포함 |
| `NEXT_STANDALONE=1 pnpm --filter web build` | PASS | 배포용 standalone 빌드 성공; 실제 Docker/NAS 배포 아님 |
| `pnpm test:e2e` | PASS | Chromium 8/8; 기존 7흐름 + 계약서 저장/재조회/수정/다운로드 |
| `pnpm compose:validate`, `git diff --check` | PASS | 정적 구조/공백 확인; 운영 Compose 실행 아님 |
| HWPX ZIP/XML 독립 확인 | PASS | 최종 E2E 다운로드 15,613 bytes, 12 ZIP entries, CRC 정상, Python ElementTree로 XML/HPF/RDF 8개 strict parse |
| 실제 한컴 한글 열기/편집/인쇄 | NOT RUN | Mac/Windows 표준 설치 경로와 Windows 제거 프로그램 등록정보에서 한글 미발견; 다른 경로 설치 여부는 불명 |

검증 내용:
- 빈 초안 허용, 필수 미입력 다운로드 422, 날짜/음수/지수/쉼표/NULL/XML 금지 문자 거부. 33개 전체 입력값·긴 한글·줄바꿈 왕복, `9007199254740993` 문자열 정확도 보존.
- 로그인 401, 타 사용자 404, CSRF 403, 동시/오래된 revision 저장 409, 명시한 저장 버전 다운로드, `Cache-Control: no-store`, 감사와 공개 청크에 개인 입력값 제외.
- JSON 과거 버전 보존/재로딩/복사본 격리/600 파일 권한, PG 동시 최초 저장 중 1개만 성공, additive migration 재실행 멱등성.
- 초기 RED: 신규 모듈/라우트/작성 링크 없음으로 테스트 실패 확인 후 구현. PG 첫 실행은 잘못된 `projects` 참조 때문에 실패해 실제 `contract_projects`로 수정하고 전체 44개 통과. `null`·revision 상한·파일 644 권한의 실패 테스트를 확인한 뒤 수정. 초기 lint는 의도한 XML 제어문자 검사 정규식의 경고였으며 해당 줄에 이유를 명시해 해결.
- UI: Chromium 데스크톱 1280×720와 모바일 390×844. 제목/경로와 저장 버전 표시 확인, pageerror 0, 모바일 가로 넘침 없음. 화면은 항목 확인용이지 한글 인쇄 배치가 아니다. 기존 Playwright 사용(전용 Browser 스킬 부재).
- 합성 증거 디렉터리: `/var/folders/j3/pvwfggzs74qfc1bkh1vyscqr0000gn/T/contract-e2e-yrnozU` (`desktop.png`, `mobile.png`, `공사표준계약서-초안-v2.hwpx`). 임시 파일이므로 OS 정리 대상이며 개인정보/운영 데이터는 없음.
- 콘솔/모바일 증거 보완 후 작성 E2E 재실행 PASS(1/1): 작성 화면 진입 후 console error 0, 전체 pageerror 0, 모바일 상단 화면/가로 넘침 확인. 최신 합성 파일·스크린샷: `/var/folders/j3/pvwfggzs74qfc1bkh1vyscqr0000gn/T/contract-e2e-lkHIXN`.

남음: 실제 한글 호환성/출력 배치 검증, 원본 재사용 조건의 외부 공개 범위 확인. 첫 버전은 공종 1행·계약서 1종으로 제한하며 붙임 목록만 출력한다. DOCX/PDF/다른 서식/일괄 생성/AI 답변/OCR은 이번 완료 항목이 아니다. GitLab 보안검사 거부 및 NAS 접속 승인 대기는 해결하지 않았다.

독립 읽기 전용 검토: 네이티브 `gpt-daybreak-blue-latest`가 인증/저장/생성기 및 관련 테스트를 검토해 Critical/Important 신규 결함 없음으로 보고했다. 생성 표의 `editable="0"`/`protect="0"` 속성의 실제 한글 동작은 자동 XML 검사로 증명되지 않으므로 기존 native acceptance 미완료를 유지한다. 이 평가는 시험 프로토타입 커밋에 한정하며 배포/정식 사용 승인 증거가 아니다.

## 2026-09-12 계약서 작성 원본 조사(T-214)

- Mac 원본/정규화 디렉터리 확인: 비어 있음. 검색 청크 11,259개, form 유형 0개.
- Windows SSH 읽기 전용 파일/ZIP 목록 확인: 원클릭 XLSM 발견. 상세 집계는 `CONTRACT_FORMS_AUDIT.md`.
- 선택 ZIP SHA-256: 기존 다운로드 manifest와 Windows 원본 일치.
- 내부 XLSM XML 확인: 데이터입력 및 공사표준계약서 시트 존재. 계약서 수식 29개/병합 60개.
- 매크로 실행, 원본 변경, 운영 변경, 외부 모델 전송 없음. 서비스 코드 변경이 없어 코드 테스트는 반복 실행하지 않았다.
- 작성 기능·다운로드·실제 Excel 재계산·시각 검증은 미실행. 사용자가 HWPX 필수를 확정했으며 작성 설계 확인 후 구현할 대상이다.
- HWPX 후속 환경 조사: Mac 표준 앱 폴더 2곳, Windows 표준 Hnc 폴더 2곳에서 한글 실행 파일 미발견. 실제 한글 열기/편집 검증은 미실행. 공식 한컴 포맷 설명의 ZIP/XML 구조를 확인했으나 생성 파일의 검증 증거는 아니다.
- Git 최신 상태: 앞선 `git push origin main`에서 GitHub 성공, GitLab 보안검사 거부. 서버가 비밀정보 의심 및 취약 의존성을 보고했으며 해결/우회하지 않았다.

## 2026-09-12 현재 기능 시험 사용 배포(T-213)

- 범위: OCR·답변 에이전트·유료 임베딩 제외. 기존 키워드 검색·마법사·문서·업무공간의 사용 가능 상태 확보.
- NAS 진단: 서비스는 healthy였으나 `/data/app-store/chunks.json`, 공개 출처, API 이미지의 `wiki/generated`가 없어 검색/안내가 비어 있었다.
- 수정: 청크 11,259개(OCR 0개), 출처 93건·고유 버전 307건을 배포했다. 원본 버전 레코드 385건 중 중복 ID는 추가하지 않았다. 공개 출처만 명시적으로 추출해 `ON CONFLICT DO NOTHING` 트랜잭션으로 추가했고 기존 운영 사용자/프로젝트/규칙은 수정하지 않았다.
- 백업: `/volume2/contract_easy/data/backups/pre-preview-20260912.sql` 생성·non-empty 확인·600 권한. 운영 DB 복원/삭제는 실행하지 않았다.
- API Dockerfile에 안내 문서 COPY 추가. Mac 아카이브가 생성한 AppleDouble 메타 파일은 별도 임시 폴더로 이동해 문서 16개만 포함했다.
- 웹 공통 API 함수에서 로그인 세션의 CSRF 토큰을 미지정 POST 등에 전달하도록 수정(로그인 후 검색/로그아웃 경로). 세션 토큰·비밀번호는 출력하지 않았다.

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck` | PASS | exit 0 |
| `pnpm test` | PASS | 11 files, 156 tests; CSRF 회귀 3건 포함 |
| `pnpm test:pg` | PASS | 3 files, 43 tests |
| `pnpm test:e2e` | PASS | Chromium 7/7, 격리 개발 데이터 사용 |
| `pnpm build` | PASS | 전체 workspace, 웹 14/14 페이지 |
| `pnpm compose:validate`, shell syntax, `git diff --check` | PASS | 설정/문법/공백 확인 |
| NAS api/web build 및 up | PASS | 실제 Compose 재빌드·재기동 |
| NAS 공개 API | PASS | 계약 검색 20건, 안내 16개, 출처 93개, 무근거 답변 거부 |
| Mac→NAS 브라우저 접속 | BLOCKED | SSH h19h19 PermitOpen에 3300/8787 미포함. 두 포트 허용 승인 요청 |

- 초기 lint는 병렬 E2E가 `test-results`를 재생성하는 동안 ENOENT로 실패했다. E2E 종료 후 순차 재실행 PASS.
- 기존 날짜 표시 테스트가 동일 밀리초 생성 일정의 배열 순서에 의존해 1건 실패했다. 날짜→표시 상태 매핑 전체 일치를 검사하도록 고쳐 모든 상태를 검증하며 전체 테스트 PASS.

## 2026-08-30 최종 감사·검증

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm compose:validate` | PASS | 7서비스·healthcheck·필수 환경·loopback·내부 포트 미노출 |
| `pnpm test:backup` | PASS | docker compose 우선 및 docker-compose fallback 백업/복구 경로 |
| `bash -n scripts/*.sh` | PASS | 운영 shell 스크립트 문법 |
| `pnpm lint` | PASS | ESLint exit 0 |
| `pnpm typecheck` | PASS | 9/10 workspace projects |
| `pnpm test` | PASS | 10 files, 153 tests |
| `pnpm test:pg` | PASS | 3 files, 43 tests; forced rollback 로그는 예상됨 |
| `pnpm build` | PASS | 전체 workspace build, Next.js 정적 페이지 14/14 |
| `git diff --check` | PASS | whitespace 오류 없음 |

- NAS 실환경은 API/web loopback, 내부 DB/vector/cache 무노출, 5서비스 healthy/restart0, migration 및 legacy `evidence_path` 0건, 파일럿 CRUD/권한/증빙 hash 왕복, gzip 백업·임시 DB 복구/삭제까지 PASS했다.
- 공개 HTTPS는 확정 hostname/DNS/cert가 없어 임의 구성하지 않았고 외부 입력 대기로 분리했다. AnchorMind 기존 컨테이너/볼륨은 미수정이다.
- T-201 RAG/vector API 런타임 연결은 사용자 결정으로 DEFERRED이며 완료로 표시하지 않는다.

## 2026-08-30 T-212 GitHub/GitLab 원격 동기화

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `git push https://gitlab.aigov.go.kr/h19h19/contract_easy.git main` | PASS | GitLab 빈 저장소에 `main` 신규 push |
| 양쪽 `git ls-remote --heads` | PASS | GitHub/GitLab `main`이 `9fd88d9bb65b656a55a134216dbdb44d7687fa1a`로 일치 |
| `git push --dry-run origin main` | PASS | 다중 push 대상 GitHub/GitLab 모두 `Everything up-to-date` |

- GitLab UI에서 리포지토리 미러링 기능은 확인했으나 현재 계정에 제공된 방향은 Push뿐이었다. GitLab이 GitHub를 당기는 서버 pull mirror 대신 현재 Mac checkout의 다중 push로 구성했다.
- 이 구성을 저장소 파일에 포함된 서버 자동 미러로 과장하지 않는다. 다른 checkout 또는 GitHub 웹 직접 변경에는 별도 동기화 구성이 필요하다.

## 2026-08-30 T-211 운영 배포 안전장치

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm compose:validate` | PASS | 운영 필수 환경, NAS 절대경로, build-time API URL, 내부 서비스 무노출, 웹/API loopback bind, db:migrate 명령 검증 |
| `pnpm exec vitest run apps/api/src/server.test.ts -t "production API는" --reporter=verbose` | PASS | 1 passed — production 기본 `0.0.0.0`, 개발 기본 loopback, 명시 override 보존 |
| `pnpm lint` | PASS | ESLint exit 0 |
| `pnpm typecheck` | PASS | 9/10 workspace projects `tsc --noEmit` 성공 |
| `pnpm test -- --reporter=dot` | PASS | 10 files, 153 tests |
| `pnpm test:pg` | PASS | embedded PostgreSQL, 3 files, 43 tests; forced rollback 로그는 예상됨 |
| `pnpm build` | PASS | 전체 workspace build, Next.js 정적 페이지 14/14 |
| `NEXT_STANDALONE=1 NEXT_PUBLIC_API_URL=https://api.example.test pnpm --filter web build` | PASS | Docker용 standalone build, 정적 페이지 14/14 및 `apps/web/.next/standalone/apps/web/server.js` 확인 |

- TDD RED: API 리스너 테스트는 구현 전 `resolveApiListenHost` 부재로 1건 실패했다. 강화한 Compose 검증은 필수 환경·build arg·NAS 경로·내부 포트·db:migrate 누락 10건, 후속 loopback bind 누락 2건을 각각 재현한 뒤 GREEN으로 전환했다.
- `docker compose config/up`은 Mac에 Docker가 없고 NAS Container Manager가 중지 상태여서 실행하지 않았다. 운영 `DATABASE_URL`도 아직 구성하지 않아 legacy `evidence_path` 건수는 확인하지 않았다. 두 항목을 PASS로 간주하지 않는다.

## 2026-08-30 Final review fix wave

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm lint` | PASS | ESLint exit 0 |
| `pnpm typecheck` | PASS | 9/10 workspace projects `tsc --noEmit` 성공 |
| `pnpm test` | PASS | 10 files, 137 tests |
| `pnpm test:pg` | PASS | 3 files, 42 tests; forced rollback 로그는 예상됨 |
| `pnpm build` | PASS | workspace build exit 0 |
| `pnpm test:e2e` | PASS | Playwright exit 0; `NO_COLOR`/`FORCE_COLOR` 경고만 발생 |

- 집중 RED→GREEN 증거와 최종 root-cause 요약은 이 문서와 scoped test commits에 기록한다.
- 운영 `DATABASE_URL`은 구성되지 않아 legacy `project_checklist_items.evidence_path` non-null 조회를 실행하지 않았다. 배포 전 0건을 확인하고, 0건이 아니면 보존 migration을 설계할 때까지 중단한다.

## 2026-08-30 Residual corrective round

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm lint` | PASS | ESLint exit 0 |
| `pnpm typecheck` | PASS | 9/10 workspace projects |
| `pnpm test` | PASS | 10 files, 152 tests |
| `pnpm test:pg` | PASS | 3 files, 43 tests |
| `pnpm build` | PASS | workspace build process exited 0 after Next.js compilation/type validation; terminal summary clipped |
| `pnpm test:e2e` | PASS | Playwright Chromium, 7 tests (direct run completed) |

- Windows에서는 POSIX mode와 hard-link semantics를 이 환경에서 검증하지 않았다. 배포 전 NTFS ACL과 no-replace publication 동작을 확인한다. 운영 PostgreSQL legacy evidence-path 점검은 operational `DATABASE_URL` 부재로 실행하지 않았다.

## 2026-08-30 공사계약 업무공간 최종 회귀

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm lint` | PASS | ESLint exit 0, 오류·경고 출력 없음 |
| `pnpm typecheck` | PASS | 9/10 workspace projects의 `tsc --noEmit` 성공 |
| `pnpm test` | PASS | 10 files, 133 tests |
| `pnpm test:pg` | PASS | embedded PostgreSQL 18.4, 3 files, 42 tests |
| `pnpm build` | PASS | Next.js 14.2.35 optimized build 및 정적 페이지 14/14 생성 |
| `pnpm test:e2e` | PASS | Playwright Chromium, 7 tests passed (39.6s) |

- Task 12 첫 lint 시도는 `project-files.ts`의 caught-error cause 2건과 `server.ts`/FileStore/PgStore의 unused binding 3건으로 **5 errors, 0 warnings** 실패했다. 보안 동작을 바꾸지 않는 최소 수정(`8df99fc`) 후 focused Vitest 3 files·57 tests, API/DB typecheck, lint를 통과하고 위 전체 게이트를 처음부터 serial 재실행했다.
- 예상 경고/제한: Vitest는 Vite CJS Node API deprecation 경고를, E2E web server는 `NO_COLOR`/`FORCE_COLOR` 경고를 출력했다. PG 테스트의 forced rollback ERROR 로그는 rollback 시나리오의 예상 산출물이다. Docker가 설치되지 않아 `docker compose config|up`은 이번 환경에서도 실행하지 않았으며, 위 여섯 게이트의 PASS 주장에는 포함하지 않는다.

## 2026-08-30 규칙 관리자 API·운영 기동 안전장치

| 명령 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm exec vitest run apps/api/src/server.test.ts packages/db/src/store.test.ts` | PASS | 2 files, 44 tests — malformed review/hold 입력을 API·FileStore에서 fail-closed 처리 |
| `pnpm exec vitest run -c vitest.pg.config.ts tests/integration/api-pg.pg.test.ts tests/integration/pg-store.pg.test.ts tests/integration/sync-db.pg.test.ts` | PASS | 3 files, 40 tests — PgStore direct validation, source-side active→target draft sync proof 포함 |
| `pnpm --filter @sen/api typecheck && pnpm --filter web typecheck && pnpm --filter @sen/db typecheck` | PASS | 모든 `tsc --noEmit` 성공 |

- TDD RED: API 권한/개정/운영 bootstrap 테스트는 구현 전 4/15 실패(403·404·개발 fallback)했고, malformed action body 회귀는 500을 재현한 뒤 400으로 보완했다. 후속 hardening은 truthy confirmation 수용과 invalid origin 미차단을 재현한 뒤 정확한 boolean/string 및 단일 HTTP(S) origin 검증을 추가했다.
- CORS wildcard host hardening: literal·percent-encoded wildcard hostname이 URL parser를 통과하는 회귀를 RED로 재현한 뒤 parsed/decoded hostname·origin 모두에서 거부했다. API 18/18, api/config typecheck PASS.

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
