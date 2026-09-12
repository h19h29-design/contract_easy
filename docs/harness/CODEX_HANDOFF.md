# CODEX_HANDOFF.md

## 즉시 재개 지점

**최신 T-216:** 6종(기존 4종 + 현장대리인계·예정공정표), 57항목/v3 저장 및 v1/v2 읽기, 동일 revision의 명시 선택 ZIP을 구현했다. 은행정보는 대금청구서, 현장대리인 개인정보는 현장대리인계에만 출력한다. 예정공정은 최대 30행 `공정 | 시작일 | 종료일` 기간 표이며 원본 일별 막대 배치가 아니다. DeepSeek `opencode-go/deepseek-v4.1-flash`의 실제 합성 파서/테스트 구현 및 설계 검토를 Codex가 대조·통합했다. 프로젝트 코드/원본/개인정보는 외부 모델에 전달하지 않았다. 최신 검증은 TEST_RESULTS의 T-216 참조.
다음은 T-217 도급내역서 원본 양식/위치 확인이다. 62개 보존 ZIP 구성원명을 조사했으나 도급내역서를 식별하지 못했고 중첩 ZIP/모든 워크북까지 조사한 것은 아니다. 실제 한글 검증은 사용자 보류 유지. NAS·운영 DB·SSH·main 병합·push는 미실행. 아래 4종/47항목 설명은 T-215 당시 이력이며 현재 상태는 이 문단을 우선한다.

**2026-09-12 사용자 우선순위 변경:** 실제 계약 문서 작성 T-214부터 진행한다.
`CONTRACT_FORMS_AUDIT.md`에 Windows 원클릭 XLSM 원본의 위치·해시·시트 구조를 기록했다.
Mac 원본 첨부 폴더는 비어 있고 서식 검색 청크도 0개다. 원본을 읽기 전용으로 대조한 뒤 공사표준계약서와 후속 착공계·준공계·대금청구서 4종 작성 흐름을 구현했다.
사용자가 **HWPX 필수**를 확정하고 입력→비공개 저장/수정→미리보기→다운로드를 승인했다. 현재 `codex/contract-hwpx` 브랜치. 실제 한글의 열기·편집·재저장·인쇄 검증 환경은 아직 확인하지 못했으며 정식 사용 가능 완료로 표시하지 않는다.
2026-09-12 후속 지시: 현재 Mac에서 한글 확인 불가하므로 native 검증을 건너뛰고 T-215(착공계·준공계·대금청구서)를 구현했다. native 결과는 미검증 유지, 사용자에게 한글 설치 정보를 반복 요청하지 않는다. 브라우저 미리보기는 실제 인쇄 레이아웃이 아니다. 47항목 공통 번들을 저장하며 v1 읽기 시 빈 신규 항목을 응답에만 추가한다. 계좌정보는 대금청구서 본문/내부 미리보기에만 출력한다. 일괄 생성·현장대리인계·예정공정표·도급내역서 자동 작성은 미구현이다.
신규 migration은 `packages/db/drizzle/0002_contract_drafts.sql`이며 격리 테스트에서만 실행했다. NAS 배포/운영 DB/SSH 변경/자동 push는 이번 범위 밖이다.
T-213 SSH 변경 승인은 여전히 받지 않았다. GitHub는 `1f51fc4`, GitLab은 보안검사 거부로 `320cc45`다.
아래 배포 중심 재개 안내 및 원격 일치 설명은 이전 상태다.

다음 작업은 **현재 기능으로 Mac 시험 사용 완료(T-213)**이다. OCR과 답변 에이전트는 사용자 결정으로 제외한다. NAS 검색 자료·출처·안내문서 배포를 보완했으며, SSH PermitOpen에 3300/8787 추가 승인 후 Mac 브라우저 검증을 진행한다. T-201 의미 검색 연결과 공개 HTTPS는 후속이다.

현재 완료된 기반:
- 공사계약 업무공간 핵심 기능과 운영 배포 정적 안전장치
- lint/typecheck 153 tests/PG 43 tests/build/standalone build/Compose 정적 검증
- GitHub와 공개 GitLab의 `main` 일치
- 현재 Mac의 `origin`은 GitHub/GitLab 다중 push 구성

현재 배포 및 미완료:
- NAS 내부 Compose 기동·migration·health·파일럿·legacy `evidence_path` 0건·백업/격리 복구 검증이 완료됐다.
- 공개 HTTPS는 확정 hostname/DNS와 인증서가 없어 구성하지 않았다.
- GitLab 서버 pull mirror는 제공되지 않아 현재 Mac 이외 환경의 자동 동기화는 별도 구성이 필요하다.

## 권장 구현 순서

1. 확정 hostname/DNS와 인증서를 확인한 뒤에만 Synology HTTPS reverse proxy를 구성한다.
2. 운영 `.env`는 비밀값을 출력하지 않고 NAS 보안 경로에서 주입한다.
3. `docker compose config`, migration, `docker compose up` 순으로 실행한다.
4. 배포 변경 시 health, loopback bind, 내부 서비스 무노출을 재확인한다.

## 완료 조건

- NAS에서 Compose 구성과 서비스 기동 PASS
- 내부 PostgreSQL/Qdrant/Valkey가 host에 노출되지 않음
- 운영 health/API/web 동작 확인; HTTPS는 외부 입력 대기
- legacy `evidence_path` 0건 확인 또는 안전한 보존 migration 선행
- 백업 파일 검증과 격리 복구 성공

## 사람 또는 외부 환경이 필요한 작업

- `/admin/rules`에서 구조화 밴드 3건 원문 대조 후 승인
- 공개 HTTPS용 확정 hostname/DNS/인증서 제공
- `wiki/reviewed` 문서 검토

## Git 상태 메모

- 브랜치: `codex/contract-hwpx` (분기 기준 로컬 main `eced3f1`)
- 최근 배포 안전장치 커밋: (이번 최종 감사 커밋으로 갱신)
- GitHub: `https://github.com/h19h29-design/contract_easy.git`
- GitLab: `https://gitlab.aigov.go.kr/h19h19/contract_easy.git`
- 현재 Mac의 `origin` fetch는 GitHub, push는 GitHub와 GitLab 두 곳이다.
