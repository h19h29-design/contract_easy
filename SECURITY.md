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
- 크기 제한(기본 10MB), 확장자+MIME 이중 검사, 실행파일 차단,
- 파일명 정규화(경로 분리 문자 제거), 저장은 격리 디렉터리, 원본 실행 없음.

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
