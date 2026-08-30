# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-08-30
- 현재 위치: **공사계약 업무공간 운영 범위 완료, T-211 배포 준비 진행 중**. 운영 API 필수 환경 전달, PostgreSQL 강제, 브라우저 API URL build-time 주입, 내부 서비스 포트 차단과 host loopback 기본 바인딩을 반영했다.
- 다음 액션: NAS Container Manager 기동 후 `docker compose config/up`, legacy `evidence_path` 0건, HTTPS 역방향 프록시와 복구 리허설을 실검증한다. T-201 RAG/vector API 런타임 연결은 사용자 방향에 따라 보류한다.
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
| Docker/NAS | IN_PROGRESS — 정적 배포 안전장치 완료, NAS Container Manager가 중지 상태라 실행 검증 대기 |

## 실행 불가 항목과 이유
- `docker compose config/up`: Mac에는 Docker가 없고 NAS Container Manager는 설치됐으나 중지 상태. 서비스 기동 승인 후 실행 예정.

- 규칙 활성화: 원문 대조와 사람 승인이 필요하므로 자동화하지 않음.
