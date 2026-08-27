# AGENTS.md — 에이전트 작업 규칙

서울시교육청 계약길잡이 공개 자료 기반 **공사계약 통합지원 시스템**.
새 세션의 에이전트는 이 문서부터 읽고 작업을 재개한다.

## 1. 먼저 읽을 파일 (순서)

1. `AGENTS.md` (이 파일)
2. `docs/harness/STATUS.md` — 현재 진행상태
3. `docs/harness/TASKS.md` — 작업 목록과 상태
4. `docs/harness/CODEX_HANDOFF.md` — 즉시 재개 지점과 검증 명령
5. `01_SYSTEM_BLUEPRINT.md`
6. `02_CRAWL_SEEDS.yaml`
7. `DECISIONS.md` — 지금까지의 결정과 근거
8. `docs/harness/RUNBOOK.md`, `docs/harness/COMMANDS.md`

충돌 시 우선순위: 실행 프롬프트 > 01_BLUEPRINT > 02_SEEDS > 03_MASTER_PROMPT > 기존 코드.

## 2. 절대 원칙

- 금액·기간·비율·계약방법 등 법적 판단값을 LLM 출력이나 하드코딩으로 만들지 않는다.
- 모든 판단값은 검토·승인된(active) 규칙으로만 제공한다. 규칙 상태: `draft → reviewed → active → superseded`.
- 활성 규칙이 없으면 숫자를 추측하지 말고 `REVIEW_REQUIRED`를 반환한다.
- AI 답변은 최소 1개 이상의 원문 근거(제목/URL/게시일·시행일/확인일) 없이 생성하지 않는다.
- 로그인·CAPTCHA·접근제한을 우회하지 않는다. robots.txt를 항상 준수한다.
  - 첨부 수집 기본값은 `CRAWL_ALLOW_ATTACHMENTS=false`. 2026-08-26 운영자 승인(D-014) 범위에서만 `.do` 다운로드 엔드포인트를 실행했으며 임의 확장은 금지한다.
- 수집 동시성 1, 요청 간격 ≥1200ms, 403/429/5xx 시 지수 백오프, 반복 오류 시 중단.
- 원본은 불변 저장(SHA-256), 변환본은 별도 경로, 덮어쓰기 금지.
- 개인정보가 포함된 프로젝트 문서는 공개 RAG corpus에 절대 편입하지 않는다.
- 시크릿은 코드/Git/로그에 남기지 않는다. `.env`는 커밋하지 않는다.

## 3. 테스트 없이 완료 처리 금지

- 기능 구현 후 반드시 해당 검증 명령(`pnpm test`, `pnpm typecheck` 등)을 실행한다.
- 실패 상태에서 DONE으로 표기하지 않는다. 결과를 `docs/harness/TEST_RESULTS.md`에 기록한다.
- 실행 불가한 명령(Docker 등)은 이유와 함께 기록하고 성공처럼 보고하지 않는다.

## 4. 크롤링 안전 규칙

- seed와 allowlist는 `02_CRAWL_SEEDS.yaml`만 사용. 기본 범위는 `contract.sen.go.kr/fus/`, 예외는 승인된 `buseo.sen.go.kr/buseo/bu20/user/bbs/` FAQ 경로뿐이다.
- 외부 링크는 URL·메타데이터만 저장, 본문 수집 금지(별도 allowlist 없이).
- pagination 종료 조건: 다음 페이지 없음 / URL·콘텐츠 반복 / 빈 목록 / 최대 페이지 도달.
- 예상 건수를 하드코딩하지 않는다. 실측값으로 `CRAWL_COVERAGE.md` 생성.

## 5. 새 세션 재개 절차

1. 위 "먼저 읽을 파일" 순서대로 읽는다.
2. `git log --oneline -15` 및 `git status`로 최근 변경 확인.
3. `docs/harness/TASKS.md`에서 IN_PROGRESS/BLOCKED 작업을 찾는다.
4. 선행조건·완료조건·검증 명령을 확인 후 작업을 계속한다.
5. 완료 시 증거 파일 경로를 TASKS.md에 남기고 커밋한다.

## 6. 주요 명령

| 명령 | 설명 |
| --- | --- |
| `pnpm install` | 의존성 설치 |
| `pnpm lint` / `pnpm typecheck` | 코드 검사 |
| `pnpm test` | 단위+통합 테스트 (Vitest) |
| `pnpm build` | 전체 빌드 |
| `pnpm crawl:preflight` | seed 사전검증 (robots/접근성) |
| `pnpm crawl:sample` | 샘플 페이지 1건 수집 |
| `pnpm crawl:full` | 전체 수집 (조건 충족 시에만) |
| `pnpm ingest:all` | 정규화 + chunk + 인덱스 + 위키 생성 |
| `pnpm embed:index` | 청크 임베딩을 local-json 또는 Qdrant에 적재 |
| `pnpm rules:queue` | 사람 검토용 규칙 승인 대기열 재생성 |
| `pnpm dev:api` / `pnpm dev:web` | 개발 서버 |

전체 목록: `docs/harness/COMMANDS.md`

## 7. 변경 후 갱신 문서

작업 단위 종료 시 반드시 갱신:
- `docs/harness/TASKS.md` (상태/증거)
- `docs/harness/STATUS.md` (현재 위치)
- `docs/harness/TEST_RESULTS.md` (실행한 검증과 결과)
- 필요시 `DECISIONS.md`, `RISKS.md`, `CRAWL_COVERAGE.md`

## 8. 금지 작업

`git reset --hard`, `git clean -fd`, 강제 푸시, 미확인 폴더 전체 삭제,
Docker 볼륨/DB 초기화, 자동 push, robots 우회 다운로드.
