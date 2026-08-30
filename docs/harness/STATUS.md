# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-08-30
- 현재 위치: **MVP + PostgreSQL 운영경로 + 확장 코퍼스 + 벡터 인덱스 CLI 완료**. 규칙 관리자 API는 엄격한 2인 승인·통제된 method-band 개정·운영 bootstrap/CORS gate와 malformed 입력 fail-closed 보강까지 완료됨.
- 다음 액션: API 서버에 EmbeddingProvider/VectorStore를 주입해 실제 하이브리드 검색을 활성화한다. 상세는 `CODEX_HANDOFF.md` 참조.
- 재개 환경: Windows OpenCode의 clean commit `10027fa`를 macOS Codex 작업공간으로 이전하고 install/lint/typecheck/test/build/PG/vector 스모크를 통과했다.
- 최근 구현: FileStore에 프로젝트 상태 전이와 변경·이벤트 이력(JSON 호환 로드 포함)을 추가했다. 후속 검토에서 `updateProject` 상태 우회 차단, 이벤트 날짜 검증, 최신순 조회, 이력 객체 복사와 모든 ProjectRecord 반환 경계의 스냅샷 격리를 보완했다. AppStore/PgStore 계약 승격은 후속 Task 5에서 진행한다.

## 스냅셧
| 영역 | 상태 |
| --- | --- |
| 하니스 문서 | DONE |
| 모노레포/빌드체인 | DONE (최신 게이트는 `TEST_RESULTS.md` 참조) |
| 크롤러(HTTP+Playwright 하이브리드) | DONE — source 93·version 385·공지 상세 38건·첨부 135건 실측 |
| 정규화/chunk/키워드 인덱스/위키 | DONE — chunk 11,259개, 위키 generated 16파일 |
| 벡터 인덱스 | PARTIAL — hash+local 11,259점 적재 검증, API 런타임 주입은 미완료 |
| 규칙엔진(REVIEW_REQUIRED 기본) | DONE — 후보 1,366건 draft, active 0 |
| API(공개/업무공간/관리자) | DONE — 스모크 통과(검색/마법사/위키/ask 게이트) |
| 웹 UI(한국어, 마법사/검색/워크스페이스/관리자) | DONE — next build 전 라우트 생성 + E2E 5/5 PASS(Chromium) |
| Docker/NAS | 설정·문서 준비 완료, 실행 검증은 Docker 환경 필요 |

## 실행 불가 항목과 이유
- `docker compose config/up`: Docker 미설치 머신.

- 규칙 활성화: 원문 대조와 사람 승인이 필요하므로 자동화하지 않음.
