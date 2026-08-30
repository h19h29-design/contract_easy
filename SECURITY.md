# SECURITY.md

## 시크릿 관리
- 모든 비밀은 `.env`(커밋 금지)로 주입. 템플릿은 `.env.example`.
- `SESSION_SECRET` 미설정 시 개발용 임시 키 생성 + 콘솔 경고. 운영에서는 필수.
- API 키(LLM/임베딩)는 서버 프로세스에만 존재. 브라우저 응답·로그에 노출 금지.

## 인증·권한
- 역할: PUBLIC < USER < REVIEWER < ADMIN (RBAC, 서버 사이드 강제)
- 비밀번호: Node scrypt(N=16384) + 개별 salt. 평문 저장 없음.
- 세션: HttpOnly + SameSite=Lax 쿠키, 서버 저장소 토큰, 만료 12h.
- CSRF: 더블서밋 토큰(쿠키+헤더 일치 검사), 상태 변경 API 전체 적용.

## 업로드 보안
- 체크리스트 현재 증빙은 항목당 1개이며 정확히 `10 * 1024 * 1024` 바이트(10 MiB) 이하, 빈 파일은 거부한다.
- 허용 조합은 확장자·선언 MIME·매직바이트를 모두 만족하는 경우뿐이다.

| 확장자 | 선언 MIME | 필수 매직바이트 |
| --- | --- | --- |
| `.pdf` | `application/pdf` | `%PDF-` |
| `.jpg`, `.jpeg` | `image/jpeg` | `FF D8 FF` |
| `.png` | `image/png` | `89 50 4E 47 0D 0A 1A 0A` |

- 파일명은 표시용으로만 정규화하고, 저장 경로에는 사용하지 않는다. 서버 계산 SHA-256으로 프로젝트별 비공개 경로에 저장하며 private root와 project directory는 `0700`, 파일은 `0600`으로 제한한다.
- owner와 `ADMIN`만 프로젝트에 접근할 수 있다. URL project ID와 checklist item/document 등 하위 resource의 project ID를 모든 읽기·쓰기 경계에서 함께 검사해 교차 프로젝트 IDOR를 막는다.
- 증빙 교체는 새 문서·파일을 만들고 현재 논리 참조만 바꾼다. 이전 파일·행·변경 기록은 삭제하지 않는다.
- 게시 전 임시 `0600` 파일을 완전히 기록·fsync한 뒤 no-replace 원자 publish 한다. 기존 hash 경로는 canonical private root 안의 일반 파일·정확한 크기/SHA-256·`0600` 권한을 모두 확인할 때만 dedupe하며, 게시된 증빙은 덮어쓰거나 삭제하지 않는다.
- 다운로드는 `Content-Disposition: attachment` 및 `X-Content-Type-Options: nosniff`를 사용한다. host `storedPath`는 API 응답, 웹 렌더링, 감사로그에 노출하지 않는다.
- 비공개 파일은 격리 저장만 하며 corpus, normalized 자료, 검색, vector store 또는 RAG 경로로 전달하지 않는다.

## 웹 보안
- SQL Injection: Drizzle 파라미터 바인딩 / 파일스토어는 JSON 직렬화 경유.
- XSS: React 기본 이스케이프, 위키 Markdown 렌더 시 위험 태그 제거.
- 보안 헤더: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy.
- Rate limit: 공개 API IP 기반(@fastify/rate-limit).
- 감사로그: 인증·규칙 승인·프로젝트 변경 등 관리자/업무 변경 전부 `audit_logs` 기록.

## 데이터 분리
- 공개 corpus(`data/raw`, `data/normalized`, 벡터 컬렉션 public-*)와
  비공개 프로젝트 문서(`SEN_CONTRACT_DATA_ROOT/private`)를 경로·인덱스로 완전 분리.
- 사용자 문서는 명시적 동의 없이 RAG 편입 불가(코드상 업로더가 public 편입 경로 없음).

## 수집 안전
- 동시성 1, 간격 ≥1200ms, 백오프(403/429/5xx), 반복 실패 중단.
- robots.txt Disallow 확장자 다운로드 금지(D-001). User-Agent에 연락처 포함.

## 알려진 제한(MVP)
- 파일스토어 모드는 단일 프로세스 가정. 운영은 PostgreSQL 필수.
- 세션 저장소가 파일 기반 → 다중 인스턴스 수평확장 시 Redis 계열로 교체 필요.

## 배포 전 데이터 확인
- 운영 PostgreSQL 배포 전 `project_checklist_items.evidence_path`의 non-null 행 수를 조회한다. 0이 아니면 배포를 중단하고 기존 증빙을 보존하는 migration을 설계한다.
- 이 확인은 운영 `DATABASE_URL`이 구성되지 않아 이 작업공간에서 실행하지 않았다. 비밀값을 조회·출력하지 않는다.
