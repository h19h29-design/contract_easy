# 공사계약 업무공간 최소 운영 설계

- 작성일: 2026-08-30
- 상태: 사용자 승인 완료
- 범위: 규칙 승인 안전성, 프로젝트 상태·변경·일정, 비공개 증빙, 최소 상세 화면
- 승인 결정: `REVIEWER`가 원문 검토를 기록하고, 서로 다른 `ADMIN`이 규칙을 활성화한다.

## 1. 목적

현재 시스템에는 규칙 평가기, 10개 고정 계약 단계, 프로젝트와 체크리스트, PostgreSQL 테이블, 관리자 규칙 화면이 있다. 그러나 규칙 승인 이력의 강제, 프로젝트 변경·일정 조회, 비공개 증빙 업로드와 프로젝트 상세 화면 연결은 완성되지 않았다.

이번 변경은 기존 구조를 실제 계약업무에 사용할 수 있는 최소 수준으로 연결한다. 법적 판단값은 사람이 원문을 검토하고 승인한 `active` 규칙에서만 나오며, 프로젝트 상태·날짜·증빙은 사용자가 명시적으로 입력한다. 별도 워크플로 엔진이나 신규 런타임 의존성은 도입하지 않는다.

## 2. 설계 원칙

1. 검토된 규칙은 불변이다. 재인제스트나 후보 재생성이 `reviewed`, `active`, `superseded` 정의를 수정할 수 없다.
2. 규칙 활성화는 엄격한 2인 승인이다. 정확히 `REVIEWER` 역할인 사용자가 원문 검토를 기록하고, 다른 사용자 ID의 `ADMIN`이 활성화한다.
3. 금액, 기간, 비율, 계약방법, 준공일, 하자기한은 자동 추정하지 않는다.
4. 프로젝트 상태는 사용자가 명시적으로 전이하고, 상태 변경과 계약 변경은 append-only 이력으로 남긴다.
5. 업로드 파일은 프로젝트 전용 비공개 저장소에 보관하고 공개 corpus, 검색, RAG 경로로 전달하지 않는다.
6. 삭제보다 보존을 우선한다. 규칙 보류와 증빙 교체는 기존 기록과 파일을 삭제하지 않는다.
7. FileStore는 개발용, PgStore는 운영용이지만 두 구현의 관찰 가능한 동작은 같아야 한다.

## 3. 범위

### 3.1 포함

- 규칙 정의 불변성, 검토 기록, 엄격한 2인 활성화, 활성화 전 서버 검증과 충돌 차단
- 고정 프로젝트 상태의 명시적 순방향 전이
- 프로젝트 변경 기록의 append-only 저장과 조회
- 사용자가 입력한 마일스톤 날짜의 저장과 화면 상태 표시
- 체크리스트 항목당 비공개 증빙 파일 1개 연결
- PDF, JPEG, PNG만 허용하는 10 MiB 업로드 검증
- SHA-256 기반 content-addressed 저장과 교체 시 기존 파일 보존
- owner/ADMIN 프로젝트 권한과 교차 프로젝트 IDOR 방지
- 프로젝트 상세 화면에 상태, 단계, 체크리스트, 변경, 일정, 증빙을 표시하고 조작하는 최소 UI
- FileStore/PgStore 동형 구현과 관련 단위·통합·E2E 테스트

### 3.2 명시적 비범위

- 공식 계약서, 법정 서식, DOCX/HWP/PDF 서식 생성
- RAG, LLM, 임베딩, AI 답변, agent 기능
- 이메일, SMS, 메신저, 푸시, 외부 알림과 백그라운드 알림 작업
- 법정 기간, 하자기간, 금액, 비율, 계약방법의 자동 계산
- `project_members`를 이용한 협업, 초대, 세부 프로젝트 역할
- 범용 상태 머신, 규칙 DSL, 템플릿 엔진, generic workflow engine
- 업로드 파일 삭제, 변경이력 삭제, 규칙 검토기록 삭제
- OCR, 파일 본문 추출, 악성코드 실행·분석

## 4. 현재 구조와 재사용 지점

| 영역 | 기존 구조 | 이번 설계에서의 사용 |
| --- | --- | --- |
| 규칙 | `RuleDefinition`, `evaluateWizard`, `rules`, `rule_versions`, `rule_reviews` | 기존 상태와 테이블을 유지하고 불변성·2인 승인·검증을 강화 |
| 프로젝트 | `contract_projects`, `project_steps`, `project_checklist_items` | 기존 10단계와 체크 토글을 유지하고 명시적 프로젝트 상태 전이 추가 |
| 변경 | `project_changes` | 변경과 상태 전이를 append-only로 저장·조회 |
| 일정 | `project_events` | 사용자 입력 마일스톤과 당일 기준 화면 상태 표시 |
| 증빙 | `project_documents`, `project_checklist_items.evidence_path` | 문서 메타데이터 저장과 체크항목 1개 연결에 사용 |
| 권한 | owner/ADMIN 기반 `canAccessProject` | 모든 하위 리소스 요청에서 프로젝트와 리소스 소속을 함께 검증 |
| 감사 | `audit_logs` | 규칙 검토·활성화, 상태 전이, 변경, 업로드·교체를 기록 |
| UI | 프로젝트 상세 페이지와 관리자 규칙 페이지 | 새 화면 체계 없이 기존 페이지에 최소 섹션 추가 |

## 5. 구성요소

### 5.1 규칙 안전 계층

`packages/rules`는 결정론적 평가와 활성화 전 검증을 담당한다.

- 허용된 scope 키와 조건 필드만 인정한다. 알 수 없는 scope 키는 제약 없음으로 처리하지 않고 검증 실패로 닫는다.
- 계약방법 규칙은 원문 제목, HTTPS 원문 URL, 확인일, 명시적 금액 조건, 출력 method가 있어야 검토 가능하다.
- `gt`, `gte`, `lt`, `lte`, `between` 조건을 동일한 구간 모델로 정규화해 경계 포함 여부와 겹침을 검사한다.
- 활성화하려는 규칙이 기존 active 규칙과 같은 scope에서 상충하면 활성화를 거부한다.
- 마법사는 계약 예정일이 있으면 그 날짜를, 없으면 요청 당일을 `asOfDate`로 사용한다. 미래 시행 규칙은 적용하지 않는다.
- method 없는 보조 규칙만 매칭되면 `DETERMINED`가 아니라 `PARTIAL`을 반환한다.

`packages/db`는 승인 상태와 이력을 강제한다.

- 기존 버전이 `reviewed`, `active`, `superseded`이면 `upsertRule`은 정의를 변경하지 않는다.
- 사람이 값을 수정하면 draft 상태의 다음 버전을 생성한다. 검토된 버전을 제자리 수정하지 않는다.
- 검토 요청에는 비어 있지 않은 검토 의견과 `sourceConfirmed: true`가 필요하다. 성공한 요청은 `rule_reviews.action='approve'`로 저장되므로 별도 DB 컬럼 없이 원문 대조 확인을 보존한다.
- review actor는 정확히 `REVIEWER`, activation actor는 `ADMIN`이어야 한다.
- activation actor의 사용자 ID가 해당 버전을 검토한 사용자 ID와 같으면 409로 거부한다.
- 보류는 `rule_reviews.action='hold'`로 기록하고 규칙 버전을 삭제하지 않는다. 후보 정리도 검토기록이 있는 draft는 삭제하지 않는다.
- 활성화 성공 시 이전 active 버전만 `superseded`로 전이하고 모든 행위는 감사로그에 actor 사용자 ID로 기록한다.

### 5.2 프로젝트 상태

기존 상태 집합을 그대로 사용한다.

```text
planning -> contracting -> working -> completed -> warranty
```

- 상태 변경 API는 현재 상태의 바로 다음 상태만 받는다.
- 같은 상태, 건너뛰기, 역방향 전이는 409로 거부한다.
- 상태는 체크리스트 완료나 날짜 도래로 자동 변경되지 않는다.
- 전이 요청에는 비어 있지 않은 사유가 필요하다.
- 성공 시 `contract_projects.status`를 갱신하고 같은 트랜잭션에서 `project_changes`에 `change_type='status'`, before/after, reason, actor를 추가한다.
- 상태 이름은 내부 진행 표시이며 법적 준공·검사·하자완료 판정이 아니라는 고지를 상세 화면에 표시한다.

잘못 전이한 상태를 되돌리는 별도 사용자 기능은 이번 범위에 포함하지 않는다. 데이터 보존이 필요한 운영 수정은 후속 설계로 다루며, 현재 단계에서는 전이 전 확인 UI와 append-only 감사기록으로 오입력을 예방한다.

### 5.3 계약 변경

- 변경은 `design`, `duration`, `amount`, `other` 중 하나다.
- before와 after는 JSON 객체이며 각각 직렬화 기준 32 KiB 이하로 제한한다.
- 사유는 필수이고 2,000자 이하로 제한한다.
- 변경 기록 생성은 프로젝트 기본 필드를 자동 수정하지 않는다. 현재 금액이나 기간을 갱신하는 법적 의미를 추론하지 않기 위해 기록과 원본 프로젝트 필드를 분리한다.
- 변경 목록은 시간 역순으로 반환하며 수정·삭제 API를 제공하지 않는다.
- FileStore도 전체 before/after/reason/actor/시각을 저장해 PgStore와 동일하게 조회한다.

### 5.4 마일스톤과 화면 상태

- 이벤트 종류는 기존 값인 `deadline`, `milestone`, `inspection`, `payment`, `other`만 허용한다.
- 제목은 1~200자, 날짜는 사용자가 입력한 서울 시간대의 `YYYY-MM-DD`만 받는다.
- 서버는 날짜를 저장하되 법정 기한을 생성하거나 보정하지 않는다.
- 응답의 표시 상태는 서울의 오늘 날짜와 단순 비교해 `upcoming`, `today`, `overdue` 중 하나를 계산한다. 임박 일수 같은 임의 기준은 두지 않는다.
- 이벤트 자동 생성, 외부 발송, `notified=true` 전환은 하지 않는다.

### 5.5 비공개 증빙

한 체크리스트 항목에는 현재 증빙 문서 1개만 연결한다.

업로드 요청은 인증된 binary body와 다음 서버 검증용 메타데이터를 포함한다.

- 원본 파일명
- 선언 MIME
- 대상 체크리스트 항목 ID

허용 조합은 다음 세 가지뿐이다.

| 확장자 | MIME | 필수 매직바이트 |
| --- | --- | --- |
| `.pdf` | `application/pdf` | `%PDF-` |
| `.jpg`, `.jpeg` | `image/jpeg` | `FF D8 FF` |
| `.png` | `image/png` | `89 50 4E 47 0D 0A 1A 0A` |

- 최대 크기는 정확히 `10 * 1024 * 1024` 바이트다. 빈 파일은 거부한다.
- 확장자, 선언 MIME, 매직바이트 중 하나라도 불일치하면 415를 반환하고 저장하지 않는다.
- 파일명은 경로 구분자와 제어문자를 제거한 표시용 값으로만 저장한다. 저장 경로에는 사용자가 보낸 파일명을 사용하지 않는다.
- 서버가 SHA-256을 계산하고 프로젝트별 경로 `SEN_CONTRACT_DATA_ROOT/private/<projectId>/<sha256>.<ext>`에 저장한다.
- 같은 프로젝트의 같은 hash 파일이 이미 있으면 다시 쓰지 않는다. 프로젝트 사이에는 물리 파일을 공유하지 않는다.
- `project_documents`에는 서버가 계산한 hash, 실제 크기, canonical MIME, 서버 경로, uploader, 업로드 시각, `is_private=true`를 저장한다.
- `project_checklist_items.evidence_path`는 호스트 파일경로 대신 현재 연결된 `project_documents.id`를 담는 논리 참조로 사용한다. 실제 경로는 `project_documents.stored_path`에만 존재한다.
- 업로드 전에 URL의 project, checklist item의 project, 인증 사용자의 접근권한을 모두 비교한다.
- 다운로드 전에 URL의 project, document의 project, 접근권한을 다시 검사한다. 현재 연결에서 교체된 이전 문서도 같은 프로젝트의 보존 이력으로 다운로드할 수 있다.
- 다운로드 응답은 `Content-Disposition: attachment`와 `X-Content-Type-Options: nosniff`를 사용한다.
- 교체 업로드는 새 document 행과 새 파일을 만든 뒤 체크항목의 논리 참조만 갱신한다. 이전 행과 파일은 보존한다.
- 공개 chunk, normalized 자료, vector store, 검색 API로 전달하는 호출 경로는 만들지 않는다.

파일 본문을 실행하거나 렌더링하지 않는다. 매직바이트 검증은 허용 형식 확인이지 악성 콘텐츠 무해성 보장이 아니므로, UI에는 신뢰하지 않는 파일을 다운로드한다는 안내를 표시한다.

### 5.6 최소 프로젝트 상세 UI

기존 `apps/web/app/workspace/projects/[id]/page.tsx`에 다음 섹션만 추가한다.

1. 현재 프로젝트 상태와 “다음 상태로 이동” 확인 폼
2. 기존 10단계와 체크리스트
3. 체크항목별 현재 증빙 파일명·크기·업로드일·다운로드·교체 입력
4. 변경 기록 입력과 시간 역순 목록
5. 사용자 입력 마일스톤 폼과 `예정/오늘/기한경과` 배지

현재 화면 구조와 순수 CSS를 유지한다. 새 UI 프레임워크, 별도 dashboard, 캘린더 위젯, drag-and-drop 업로더는 추가하지 않는다. 체크 완료와 프로젝트 상태는 독립적으로 표시하며, 증빙이 없는 완료 항목에는 경고만 표시하고 완료를 차단하지 않는다.

## 6. 데이터 흐름

### 6.1 규칙 검토와 활성화

1. draft 후보를 REVIEWER가 원문과 대조한다.
2. 값 수정이 필요하면 새 draft 버전을 저장한다.
3. REVIEWER가 검토 의견과 대조 확인을 제출한다.
4. 서버가 정의와 출처를 검증한 후 `rule_reviews`에 review 기록을 추가하고 상태를 reviewed로 바꾼다.
5. 다른 ADMIN이 활성화를 요청한다.
6. 서버가 역할, 사용자 ID 차이, 최신 review, 정의 유효성, 시행일, active 충돌을 다시 검사한다.
7. 하나의 트랜잭션에서 이전 active를 superseded로 만들고 대상 버전을 active로 전이한 뒤 감사로그를 남긴다.
8. 어느 검사든 실패하면 상태는 변하지 않는다.

### 6.2 증빙 업로드와 교체

1. owner 또는 ADMIN이 프로젝트 상세에서 파일을 선택한다.
2. API가 세션, CSRF, 프로젝트 권한, 체크항목 소속을 검증한다.
3. API가 크기, 파일명, 확장자, MIME, 매직바이트를 검증하고 SHA-256을 계산한다.
4. 서버가 프로젝트별 content-addressed 경로에 새 파일을 원자적으로 저장한다.
5. Store가 document 메타데이터를 만들고 체크항목의 현재 document ID를 갱신한다.
6. 감사로그에 업로드 또는 교체를 기록한다. 교체 기록에는 checklist item ID, 이전 document ID, 새 document ID, hash를 포함하지만 실제 저장 경로와 파일 본문은 넣지 않는다.
7. DB 단계가 실패하면 체크항목 연결은 바뀌지 않는다. 연결되지 않은 파일은 즉시 삭제하지 않고 운영 정리 대상으로 남긴다.

### 6.3 상태·변경·일정

1. 클라이언트는 현재 project ID와 사용자 입력값을 보낸다.
2. API는 인증, CSRF, 프로젝트 권한, payload 제한을 검사한다.
3. Store는 상태 전이는 프로젝트 갱신과 변경행 추가를 한 트랜잭션으로 처리하고, 일반 변경과 이벤트는 append-only로 추가한다.
4. 프로젝트 GET 응답은 steps, checklist, documents, changes, events와 계산된 날짜 표시 상태를 반환한다.
5. UI는 서버 응답만 렌더링하며 법적 상태나 기한을 추론하지 않는다.

## 7. API 경계

기존 `/api/projects/:id` 응답에 `documents`, `changes`, `events`를 추가한다. 신규 동작은 기존 프로젝트 하위 경로에 둔다.

| 메서드·경로 | 동작 |
| --- | --- |
| `POST /api/projects/:id/status` | 다음 프로젝트 상태로 명시적 전이 |
| `POST /api/projects/:id/changes` | append-only 변경 기록 추가; 기존 경로를 강화 |
| `POST /api/projects/:id/events` | 사용자 입력 마일스톤 추가 |
| `POST /api/projects/:id/checklist/:itemId/evidence` | binary 증빙 업로드 또는 교체 |
| `GET /api/projects/:id/documents/:documentId/download` | 권한 검증 후 비공개 다운로드 |

상태 변경, 변경, 이벤트, 업로드는 세션과 CSRF가 필요하다. 다운로드는 세션과 프로젝트 접근권한이 필요하다. 하위 리소스 ID만으로 Store를 변경하지 않고 항상 URL project ID와 소속을 함께 조건으로 사용한다.

관리자 규칙 API는 기존 경로를 유지하되 action별 역할과 payload를 명확히 나눈다.

- `review`: REVIEWER 전용, 검토 의견과 `sourceConfirmed: true` 필수
- `activate`: ADMIN 전용, reviewer와 다른 user ID 필수
- `hold`: REVIEWER 전용, 사유 필수, 삭제 없음
- draft 수정: 다음 버전 생성만 허용

## 8. 검증, 오류, 보안

### 8.1 공통 오류 규칙

- 인증 없음: 401
- 역할 또는 프로젝트 접근권한 없음: 외부 열거를 막기 위해 프로젝트 하위 리소스는 404
- CSRF 실패: 403
- 형식·길이·지원하지 않는 enum: 400
- 현재 상태와 맞지 않는 전이, 동일인 규칙 활성화, 규칙 충돌: 409
- 업로드 형식 또는 magic 불일치: 415
- 10 MiB 초과: 413
- 저장소 쓰기 실패: 500, 기존 상태와 연결은 유지

오류 응답은 사용자 입력 전체, 파일경로, stack, secret을 포함하지 않는다.

### 8.2 권한과 IDOR 방지

- 일반 사용자는 owner인 프로젝트만 접근한다. ADMIN은 모든 프로젝트에 접근할 수 있다.
- checklist item, document, change, event는 각각 자신의 `projectId`가 URL의 project ID와 같아야 한다.
- 체크 토글도 현재처럼 item ID만 갱신하지 않고 project ID를 함께 검증한다.
- Store 메서드는 가능한 경우 `(projectId, resourceId)`를 받아 API 실수만으로 교차 프로젝트 변경이 일어나지 않게 한다.
- `project_members`는 읽지도 쓰지도 않는다.

### 8.3 저장과 개인정보

- `data/private/`를 Git ignore에 명시한다.
- 비공개 파일의 host 경로는 API 응답과 감사로그에 노출하지 않는다.
- 공개 source attachment 수집 경로와 프로젝트 증빙 경로는 helper를 공유해도 저장 루트와 정책을 공유하지 않는다.
- 운영 CORS는 설정된 웹 origin 하나로 제한하고 credential wildcard/reflection을 사용하지 않는다.
- 운영 환경에서 초기 관리자 비밀번호가 없으면 기본 암호로 기동하지 않는다.

## 9. FileStore/PgStore 동형성

`AppStore`에 규칙 검토, 프로젝트 상태 전이, changes/events/documents 조회·생성, 증빙 연결 메서드를 추가한다. 모든 메서드는 두 Store에서 같은 입력 검증 결과와 레코드 형태를 반환한다.

FileStore 변경:

- `DbData`에 `ruleReviews`, `projectDocuments`, `projectEvents`, `projectChanges` 배열을 추가한다.
- 기존 JSON 파일을 읽을 때 `emptyDb()` 기본값과 병합해 새 배열이 없는 데이터도 안전하게 연다.
- 상태 전이와 이력 추가는 한 번의 `flush()`로 저장한다.
- 증빙 교체는 새 document를 추가하고 checklist 참조를 갱신한 뒤 한 번 flush한다.

PgStore 변경:

- 기존 `rule_reviews`, `project_documents`, `project_events`, `project_changes`, `evidence_path`를 사용한다.
- 상태 전이와 status change 기록, 증빙 document 생성과 checklist 연결은 각각 DB 트랜잭션으로 처리한다.
- actor는 `system` 문자열이 아니라 실제 사용자 ID를 저장한다.
- API와 Store 양쪽에 중복 감사로그를 만들지 않고, 성공한 상태 변경당 감사행 하나만 남긴다.

파일 저장은 DB 트랜잭션에 포함될 수 없으므로 파일을 먼저 원자적으로 생성하고 DB를 갱신한다. DB 실패로 생긴 미연결 파일은 데이터 손실을 피하기 위해 삭제하지 않는다.

## 10. 예상 변경 파일

### 규칙과 공통 검증

- `packages/shared/src/types.ts`
- `packages/shared/src/file.ts` 신규
- `packages/shared/src/index.ts`
- `packages/rules/src/engine.ts`
- `workers/crawler/src/attachments.ts` — 기존 magic 판별을 공통 helper로 이동해 중복 방지

### Store와 설정

- `packages/db/src/app-store.ts`
- `packages/db/src/store.ts`
- `packages/db/src/pg-store.ts`
- `packages/config/src/index.ts`
- `.env.example`
- `.gitignore`

### API와 웹

- `apps/api/src/server.ts`
- `apps/web/app/admin/rules/page.tsx`
- `apps/web/app/workspace/projects/[id]/page.tsx`
- `apps/web/app/globals.css`

### 테스트

- `packages/shared/src/shared.test.ts`
- `packages/rules/src/engine.test.ts`
- `packages/db/src/store.test.ts`
- `apps/api/src/server.test.ts`
- `tests/integration/pg-store.pg.test.ts`
- `tests/integration/api-pg.pg.test.ts`
- `tests/e2e/flows.spec.ts`

서버 파일이 지나치게 커질 경우에만 업로드 검증을 `apps/api/src/project-files.ts`로 분리한다. 사전 추상화나 인터페이스 추가는 하지 않는다.

## 11. 마이그레이션 영향

새 SQL 테이블이나 컬럼은 필요하지 않다. 최초 마이그레이션에 필요한 PG 구조가 이미 존재한다.

- `rule_reviews`는 검토·보류 이력에 사용한다.
- `project_documents`는 증빙 메타데이터에 사용한다.
- `project_events`는 사용자 입력 마일스톤에 사용한다.
- `project_changes`는 일반 변경과 상태 전이에 사용한다.
- `project_checklist_items.evidence_path`는 document ID 논리 참조로 사용한다.

따라서 새 Drizzle SQL migration을 만들지 않는다. FileStore JSON은 읽을 때 기본 배열을 병합하는 호환 로딩만 필요하다. 기존 `evidence_path`에 실제 파일경로 데이터가 있는 운영 DB는 현재 없다는 전제이며, 구현 전 배포 DB에서 non-null 건수를 읽기 전용으로 확인한다. non-null 데이터가 있으면 별도의 보존 마이그레이션을 먼저 설계하고 이번 구현에 임의 포함하지 않는다.

## 12. 테스트 전략

### 12.1 규칙 단위 테스트

- 재인제스트 draft가 reviewed/active/superseded 정의를 byte-equivalent하게 보존한다.
- REVIEWER review 없이 activate가 실패한다.
- review actor와 같은 사용자 ID의 ADMIN activate가 실패한다.
- 다른 ADMIN의 activate가 성공한다.
- unknown scope, 잘못된 조건, 누락 source, 미래 시행일, 겹치는 상충 규칙이 fail-closed 된다.
- 보류가 규칙과 검토기록을 삭제하지 않는다.
- method 없는 매칭은 `PARTIAL`이다.

### 12.2 Store 동형 테스트

같은 시나리오를 FileStore와 실제 PostgreSQL에 적용한다.

- 상태가 한 단계씩만 전이되고 status change가 append-only로 남는다.
- 일반 변경의 before/after/reason/actor가 보존된다.
- 이벤트가 저장되고 날짜 표시 상태가 동일하다.
- 문서 메타데이터와 checklist의 현재 document ID가 연결된다.
- 교체 후 이전 document가 남는다.
- 다른 프로젝트의 item/document ID 조합이 실패한다.
- 기존 FileStore JSON에 새 배열이 없어도 로딩된다.

### 12.3 API 보안 테스트

- 비로그인, CSRF 누락, 비소유자, 교차 프로젝트 checklist/document 접근을 거부한다.
- 빈 파일, 10 MiB 초과, 경로순회 파일명, 이중 확장자, MIME 불일치, magic 불일치를 거부한다.
- PDF/JPEG/PNG 정상 파일은 서버 계산 hash와 canonical MIME으로 저장된다.
- 다운로드는 저장 경로를 노출하지 않고 attachment/nosniff 헤더를 제공한다.
- 실패한 업로드나 상태 전이가 기존 연결과 프로젝트 상태를 바꾸지 않는다.

### 12.4 웹 E2E

- REVIEWER가 검토한 규칙을 같은 사용자가 활성화할 수 없고 다른 ADMIN은 활성화할 수 있다.
- owner가 체크 증빙을 업로드하고 교체하며 이전 기록이 유지된다.
- 프로젝트 상태가 순방향으로만 이동하고 사유가 화면 이력에 나타난다.
- 사용자 입력 이벤트가 예정/오늘/기한경과로 표시된다.
- 프로젝트 상세 화면 어디에도 공식 서식 생성이나 자동 법적 계산을 암시하는 문구가 없다.

### 12.5 완료 게이트

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pg
pnpm build
pnpm test:e2e
```

모든 명령이 통과하고 결과를 `docs/harness/TEST_RESULTS.md`에 기록하기 전에는 구현 작업을 DONE으로 표시하지 않는다.

## 13. 롤아웃

1. 운영 DB에서 `project_checklist_items.evidence_path IS NOT NULL` 건수를 읽기 전용으로 확인한다.
2. REVIEWER 계정과 별도 ADMIN 계정이 실제로 존재하는지 확인한다.
3. 규칙 안전성 변경을 먼저 배포하고 기존 1,366개 draft를 자동 검토·활성화하지 않는다.
4. FileStore/PgStore 동형 테스트와 API 보안 테스트를 통과시킨다.
5. 프로젝트 상태·변경·일정 기능을 배포한다.
6. 비공개 저장 루트 권한과 Git ignore를 확인한 뒤 PDF/JPEG/PNG 업로드를 활성화한다.
7. owner 계정으로 정상 업로드·다운로드, 다른 owner 계정으로 404, 증빙 교체 후 이전 문서 보존을 스모크 테스트한다.
8. 최소 상세 UI E2E와 전체 회귀 게이트를 통과시킨다.

문제가 생기면 신규 쓰기 경로만 비활성화한다. 기존 규칙, 변경행, 문서행, 실제 파일을 자동 삭제하거나 되돌리지 않는다.

## 14. 완료 기준

- reviewed/active 규칙은 재인제스트로 변경되지 않는다.
- REVIEWER와 서로 다른 ADMIN 없이는 규칙이 active가 되지 않는다.
- 상충하거나 불완전한 규칙은 서버에서 활성화되지 않는다.
- 프로젝트 상태는 사용자의 사유 있는 순방향 요청으로만 바뀌고 전 이력이 남는다.
- 변경과 사용자 입력 일정이 FileStore/PgStore에서 동일하게 저장·조회된다.
- 체크항목당 현재 증빙 1개가 연결되고 교체해도 이전 문서와 파일은 남는다.
- 업로드는 PDF/JPEG/PNG, 10 MiB, 확장자+MIME+magic 일치 조건을 모두 만족해야 한다.
- owner/ADMIN 외에는 프로젝트와 하위 리소스를 읽거나 바꿀 수 없고 교차 프로젝트 IDOR 테스트가 통과한다.
- 프로젝트 상세 화면이 상태·체크리스트·증빙·변경·일정을 제공하며 공식 서식이나 자동 법적 판단을 제공하지 않는다.
- 외부 알림, RAG/LLM/agent, 프로젝트 멤버 협업, 범용 워크플로 의존성이 추가되지 않는다.
