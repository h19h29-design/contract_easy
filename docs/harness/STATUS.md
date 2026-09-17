# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-09-17
- 최우선: **계약 문서 작성 기능(T-214~T-216)**. 공사표준계약서·착공계·준공계·대금청구서·현장대리인계·예정공정표 6종의 선택·공통정보 재사용·비공개 버전 저장/수정·미리보기·HWPX 및 선택 ZIP 다운로드를 `codex/contract-hwpx`에서 구현해 main에 병합하고 NAS에 배포했다. 57항목/v3 저장, v1/v2 읽기 호환. 실제 한글 열기/편집/인쇄 배치는 사용자 지시로 미검증 유지. 근거: `CONTRACT_FORMS_AUDIT.md`, `TEST_RESULTS.md`.
- 2026-09-17 공사 밴드 초안: 사전체크리스트-공사 표를 수작업 구조화해 계약방법 밴드 초안 9건 생성(전부 draft, `construction.method.band.*`). construction은 종합/전문 구분 부재로 전문 2억 기준 보수 적용. NAS PG rules 1,378 draft 동기화. 승인은 `/admin/rules` 사람 작업 — 기존 용역 표 초안 3건은 활성화 금지 권고(`RULE_REVIEW_PACKET.md` §7).
- 2026-09-17 증분 수집·규칙 검토 자료: 계약길잡이 12 seed 재수집(신규 고유 콘텐츠는 공지사항 목록 1건), 병합 인제스트로 검색 인덱스 11,275청크로 갱신하고 NAS 파일·PG(rules 1,369 draft) 동기화. `RULE_REVIEW_PACKET.md`에 밴드 초안 원문 대조 정리 — 승인은 `/admin/rules` 사람 작업.
- 원격 최신 정정: 2026-09-15 GitHub·GitLab `main` 모두 `87f026d`로 동기화 완료. GitLab 보안 게이트(Gitleaks/OSV/Trivy/Syft/Semgrep) 통과를 위해 의존성 메이저 업그레이드(fastify5·next15.5·drizzle0.45·vitest4)·dev db.json 추적 해제·컨테이너 비루트 사용자를 적용했다.
- 이번 배포: OCR·답변 에이전트·의미 검색은 제외하고 현재 업무 기능을 Mac에서 시험 사용한다. NAS에 누락됐던 공개 검색 청크 11,259개와 출처 93건을 적재하고 안내 문서를 API 이미지에 포함했다. Mac 접속은 SSH PermitOpen 3300/8787 허용 대기.
- 기존 배포 기반: **T-211 NAS 내부 배포·파일럿·백업/격리 복구 검증 완료**. 운영 API 필수 환경 전달, PostgreSQL 강제, 브라우저 API URL build-time 주입, 내부 서비스 포트 차단과 host loopback 기본 바인딩을 반영했다. 원격 동기화는 현재 GitLab 검사 거부로 불일치다.
- 다음 액션: 도급내역서 작성(T-217)은 실제 사용하는 원본 양식/위치 확인 대기. 선택 ZIP과 추가 붙임 2종은 T-216에서 구현했다. 예정공정표는 직접 입력한 기간 표이며 원본 막대형 인쇄 배치 복제가 아니다. 실제 한글 검증은 사용자 보류, 운영 반영·SSH 변경은 별도 승인 후 진행한다. T-201 RAG/vector API 런타임 연결은 사용자 결정으로 보류한다.
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
| 웹 UI(한국어, 마법사/검색/워크스페이스/관리자) | 기존 기능 + 6종 선택/공통정보 재사용/선택 ZIP 시험 작성 화면 구현; 최신 검증은 TEST_RESULTS 참조 |
| HWPX 문서 작성 | PARTIAL — 6종 입력/저장/다운로드 구현·NAS 배포 완료, 도급내역서 원본 확인 대기·실제 한글 검증 사용자 보류 |
| Git 원격 | DONE — GitHub·GitLab `main` 모두 `87f026d`. 보안 게이트 통과 후 동기화 |
| Docker/NAS | DONE(내부 파일럿) — 5서비스 healthy/restart0, API/web·migration·legacy evidence_path 0건·백업/격리복구 PASS; 공개 HTTPS는 hostname/DNS/cert 외부 입력 대기 |

## 외부 입력 대기
- 공개 HTTPS: NAS에 확정 hostname/DNS와 사용할 인증서가 없어 reverse proxy를 임의 설정하지 않았다.

- 규칙 활성화: 원문 대조와 사람 승인이 필요하므로 자동화하지 않음.
