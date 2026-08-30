# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-08-30
- 현재 위치: **공사계약 업무공간 운영 범위 완료**. 엄격한 2인 규칙 승인, 프로젝트 상태·변경·일정, 비공개 증빙 저장/교체/다운로드, 최소 상세 UI와 전체 회귀 게이트를 완료했다.
- 다음 액션: T-201 RAG/vector API 런타임 연결은 사용자 방향에 따라 보류한다. 상세는 `CODEX_HANDOFF.md` 참조.
- 재개 환경: Windows OpenCode의 clean commit `10027fa`를 macOS Codex 작업공간으로 이전하고 install/lint/typecheck/test/build/PG/vector 스모크를 통과했다.
- 최근 구현: FileStore/PgStore 프로젝트 상태 전이와 변경·이벤트 이력(JSON 호환 로드 포함)을 추가했다. 현재 상태·증빙 참조는 통제된 작업으로만 변경되며, 상태 전이/증빙 교체 이력은 append-only다.

## 스냅셧
| 영역 | 상태 |
| --- | --- |
| 하니스 문서 | DONE |
| 모노레포/빌드체인 | DONE (최신 게이트는 `TEST_RESULTS.md` 참조) |
| 크롤러(HTTP+Playwright 하이브리드) | DONE — source 93·version 385·공지 상세 38건·첨부 135건 실측 |
| 정규화/chunk/키워드 인덱스/위키 | DONE — chunk 11,259개, 위키 generated 16파일 |
| 벡터 인덱스 | PARTIAL — hash+local 11,259점 적재 검증, API 런타임 주입은 미완료 |
| 규칙엔진(REVIEW_REQUIRED 기본) | DONE — 후보 1,366건 draft, active 0 |
| API(공개/업무공간/관리자) | DONE — 엄격한 2인 승인, 프로젝트 상태·변경·일정·비공개 증빙 API 및 IDOR 방어 포함 |
| 웹 UI(한국어, 마법사/검색/워크스페이스/관리자) | DONE — 프로젝트 상세 운영 UI 포함, E2E 7/7 PASS(Chromium) |
| Docker/NAS | 설정·문서 준비 완료, 실행 검증은 Docker 환경 필요 |

## 실행 불가 항목과 이유
- `docker compose config/up`: Docker 미설치 머신.

- 규칙 활성화: 원문 대조와 사람 승인이 필요하므로 자동화하지 않음.
