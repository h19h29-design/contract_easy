# OpenCode / Codex 실행 프롬프트

아래 작업을 새 저장소에서 수행하라. 기존 NAS 서비스, 컨테이너, 공유폴더, 데이터베이스는 절대 수정하지 말고 이 프로젝트 전용 디렉터리와 Docker Compose만 사용한다. 모든 위험 작업은 dry-run과 명시적 승인 단계를 둔다.

## 프로젝트 목표
서울특별시교육청 계약길잡이 공개 자료를 수집·버전관리·정규화하여, 공사계약을 처음 하는 사람도 사용할 수 있는 웹서비스를 만든다. 서비스는 규칙 엔진, 근거형 RAG, 공사계약 프로젝트 관리 기능을 포함한다.

## 먼저 읽을 파일
1. `01_SYSTEM_BLUEPRINT.md`
2. `02_CRAWL_SEEDS.yaml`

두 파일을 요구사항의 단일 기준으로 삼아라. 모호한 부분은 안전하고 보수적으로 결정하고 `DECISIONS.md`에 이유를 기록하라.

## 절대 원칙
1. 금액 기준·공고기간·낙찰하한율·보증률·계약방법 등 법적 판단을 LLM 하드코딩으로 만들지 않는다.
2. 모든 규칙은 근거 URL, 원문 제목, 시행일, 확인일, 버전, 검토 상태를 가져야 한다.
3. 브라우저 수집 전 `robots.txt`, 이용조건, 저작권 표시를 확인하고 `crawl-preflight.json`에 저장한다.
4. 로그인, CAPTCHA, 접근제한을 우회하지 않는다.
5. 기본 수집 동시성 1, 요청 간격 1.2초 이상, 오류 발생 시 지수 백오프를 적용한다.
6. 원본은 불변 저장하고 변환본과 분리한다.
7. 공개 Q&A에는 원문 출처가 없는 답변을 허용하지 않는다.
8. 개인정보가 포함된 프로젝트 데이터는 공개 RAG corpus에 절대 편입하지 않는다.
9. 시크릿을 코드·로그·Git에 남기지 않는다.
10. 구현 완료를 주장하기 전에 테스트와 실제 브라우저 검증 결과를 제시한다.

## 기술 방향
- TypeScript 중심 monorepo
- 웹: Next.js
- API: Node.js/TypeScript
- DB: PostgreSQL
- 벡터: Qdrant
- 캐시/큐: Valkey
- 브라우저 수집: Playwright
- 파일 저장: NAS 바인드 마운트 또는 S3 호환 저장소 추상화
- 문서 변환 worker는 Python을 보조적으로 허용
- Docker Compose 기반

## 작업 순서

### 1. 저장소 초기화
다음 구조를 생성한다.
```text
apps/web
apps/api
workers/crawler
workers/ingest
packages/db
packages/rules
packages/retrieval
packages/shared
packages/ui
data/.gitkeep
docs
infra
```
`AGENTS.md`, `README.md`, `DECISIONS.md`, `SECURITY.md`, `.env.example`, `docker-compose.yml`을 작성한다.

### 2. 수집 preflight
- 각 seed URL을 Playwright로 열 수 있는지 검사한다.
- 페이지 제목, 최종 URL, 상태, 렌더링 본문 길이, 링크 수를 기록한다.
- robots/저작권/이용조건을 확인한다.
- 한 페이지와 첨부파일 하나로 샘플 수집을 수행한다.
- 실패 시 원인을 네트워크, TLS, 서버 차단, JS 렌더링, selector 변경으로 분류한다.
- preflight 결과를 검토하기 전 전체 crawl을 시작하지 않는다.

### 3. crawler 구현
- seed 탐색
- pagination 탐색
- 상세페이지 수집
- 첨부파일 다운로드
- SHA-256 중복 제거
- 재시도/감속/중단
- JSONL manifest
- 변경 diff
- raw HTML과 screenshot 선택 저장
- CLI: `crawl:preflight`, `crawl:full`, `crawl:incremental`, `crawl:diff`

### 4. 문서 정규화
- HTML, PDF, HWP, HWPX, DOCX, XLSX 어댑터
- 제목/목차/문단/표/페이지/링크 보존
- 실패 파일은 quarantine으로 이동
- 원문과 normalized 문서의 추적 ID 유지
- Markdown LLMWiki 자동생성

### 5. 규칙 후보 추출
- 문서에서 금액·기간·비율·필수서류·예외 문장을 후보로만 추출한다.
- 자동 활성화하지 않는다.
- 관리자 검토 UI에서 원문 문맥과 함께 승인하도록 한다.
- 버전 및 시행기간을 저장한다.

### 6. RAG
- keyword + vector + metadata filter 하이브리드 검색
- chunk type: heading, paragraph, table-row, faq, form, rule-source
- reranking
- 답변 출처·게시일/시행일·확인일 표시
- 근거 부족/상충/구버전 감지
- 평가 질문 50개와 expected source를 작성한다.

### 7. 공사계약 MVP
- 공개: 새 계약 안내 마법사, 결과, 근거, FAQ, AI 질문
- 비공개: 프로젝트 목록, 단계별 체크리스트, 일정, 증빙, 메모
- 관리자: 수집 상태, diff, 규칙 승인, 출처 관리, 답변 신고
- 공사 단계: 계획 → 설계/원가 → 계약방법 → 공고/견적 → 계약 → 착공 → 감독/변경 → 준공/검사 → 대금 → 하자

### 8. 보안·운영
- RBAC
- 감사로그
- 업로드 확장자/MIME/크기 검사
- 공개 API rate limit
- 백업·복구 스크립트
- healthcheck
- reverse proxy 예시
- 관리자 영역 추가 인증

### 9. 검증
- unit/integration/e2e 테스트
- crawler fixture 테스트
- 동일 문서 재수집 시 중복 0건
- 수정 문서 diff 검출
- 구버전 규칙 비활성화
- 출처 없는 AI 답변 차단
- 실제 브라우저로 핵심 사용자 흐름 검증
- NAS 배포 전 dry-run 체크리스트 출력

## 각 단계의 보고 형식
1. 완료한 작업
2. 생성·수정 파일
3. 실행한 명령과 결과
4. 발견한 위험 또는 불확실성
5. 다음 단계
6. 사용자 승인이 필요한 항목

첫 응답에서는 코드를 수정하지 말고, 저장소 상태를 확인한 뒤 구현 계획, 예상 파일 구조, preflight 방법, 승인 지점을 제시하라.
