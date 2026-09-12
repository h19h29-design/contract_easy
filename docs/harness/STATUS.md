# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-09-12
- 이번 배포: OCR·답변 에이전트·의미 검색은 제외하고 현재 업무 기능을 Mac에서 시험 사용한다. NAS에 누락됐던 공개 검색 청크 11,259개와 출처 93건을 적재하고 안내 문서를 API 이미지에 포함했다. Mac 접속은 SSH PermitOpen 3300/8787 허용 대기.
- 현재 위치: **T-211 NAS 내부 배포·파일럿·백업/격리 복구 검증 완료, GitHub/GitLab 원격 동기화 완료**. 운영 API 필수 환경 전달, PostgreSQL 강제, 브라우저 API URL build-time 주입, 내부 서비스 포트 차단과 host loopback 기본 바인딩을 반영했다.
- 다음 액션: 공개 HTTPS는 확정 hostname/DNS와 인증서가 제공되면 Synology 역방향 프록시를 구성한다. T-201 RAG/vector API 런타임 연결은 사용자 결정으로 보류한다.
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
| Git 원격 | DONE — GitHub `main`과 공개 GitLab `main` 동일 커밋, 현재 Mac `origin`은 양쪽 다중 push 구성 |
| Docker/NAS | DONE(내부 파일럿) — 5서비스 healthy/restart0, API/web·migration·legacy evidence_path 0건·백업/격리복구 PASS; 공개 HTTPS는 hostname/DNS/cert 외부 입력 대기 |

## 외부 입력 대기
- 공개 HTTPS: NAS에 확정 hostname/DNS와 사용할 인증서가 없어 reverse proxy를 임의 설정하지 않았다.

- 규칙 활성화: 원문 대조와 사람 승인이 필요하므로 자동화하지 않음.
