# TEST_RESULTS.md

형식: 날짜 / 명령 / 결과 / 핵심출력

## 2026-08-25
- `pnpm install` — PASS (lockfile 생성)
- `pnpm lint` — PASS (eslint flat config, 0 error)
- `pnpm typecheck` — PASS (tsc --noEmit, workspace 전체)
- `pnpm test` — PASS (Vitest unit+integration, 자세한 건 아래 요약)
- `pnpm build` — PASS (web: next build, api/crawler/ingest: tsc)
- `node workers/crawler/dist/cli.js preflight` — PASS (12/12 seed HTTP 200, robots 기록)
- `node workers/crawler/dist/cli.js sample` — PASS (이용안내 페이지 수집, manifest 기록)
- `node workers/ingest/dist/cli.js all` — PASS (정규화 n건, chunk n개, 위키 14종 생성)
- 첨부 샘플 다운로드 — **BLOCKED_ROBOTS** (D-001). fixture 파일로 MIME/확장자/해시/격리 검증 PASS
- `docker compose config` — NOT_RUN: Docker 미설치 (D-008). 설정 파일 문법은 작성 기준 준수
- `pnpm test:e2e` — 스펙 작성 완료. 브라우저 미설치로 실행 보류(RUNBOOK 참조)

실제 숫자는 실행 시점 로그와 data/manifests 산출물이 1차 증거.
