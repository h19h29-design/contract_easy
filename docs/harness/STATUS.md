# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-08-26
- 현재 위치: **MVP + 운영경로(PG) + 지식품질 고도화 완료**. 미수집 항목은 `UNCOLLECTED.md` 참조.
- 다음 액션: `docs/harness/TASKS.md` NEXT(셀렉터 UI-walk, Docker 검증, 법무 확인)

## 스냅셧
| 영역 | 상태 |
| --- | --- |
| 하니스 문서 | DONE |
| 모노레포/빌드체인 | DONE (lint 0 / typecheck PASS / test 60개 PASS / build PASS) |
| 크롤러(HTTP+Playwright 하이브리드) | DONE — preflight 12/12 PASS, source 50·version 160·상세 38건 실측 |
| 정규화/chunk/키워드 인덱스/위키 | DONE — chunk 2,535개, 위키 15파일(내용 7파일) |
| 규칙엔진(REVIEW_REQUIRED 기본) | DONE — 후보 60건 draft, 활성 0 |
| API(공개/업무공간/관리자) | DONE — 스모크 통과(검색/마법사/위키/ask 게이트) |
| 웹 UI(한국어, 마법사/검색/워크스페이스/관리자) | DONE — next build 전 라우트 생성 + E2E 5/5 PASS(Chromium) |
| Docker/NAS | 설정·문서 준비 완료, 실행 검증은 Docker 환경 필요 |

## 실행 불가 항목과 이유
- `docker compose config/up`: Docker 미설치 머신.

- 첨부파일 샘플 다운로드: robots Disallow(D-001). fixture로 로직 검증 대체.
