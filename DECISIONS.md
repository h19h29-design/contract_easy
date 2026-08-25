# DECISIONS.md — 결정 기록

형식: 날짜 / 결정 / 근거 / 대안

## D-001 (2026-08-25) 첨부파일 수집 기본 비활성
- **결정**: 크롤러의 첨부파일(pdf/hwp/xls/zip/png 등) 직접 다운로드를 `CRAWL_ALLOW_ATTACHMENTS=false` 기본값으로 비활성화. 첨부는 URL·메타데이터만 manifest에 기록.
- **근거**: contract.sen.go.kr robots.txt(2026-08-25 확인)가 `*.pdf`, `*.hwp`, `*.xls`, `*.zip` 등 모든 첨부 확장자에 대해 Disallow. `02_CRAWL_SEEDS.yaml`의 `obey_robots: true`와 절대 원칙(robots 우회 금지)에 따름.
- **대안(기각)**: robots 무시하고 1건만 샘플 다운로드 → 원칙 위반. 법무 확인 후 명시적 승인으로만 해제.
- **영향**: "샘플 첨부파일 검증"은 자체 생성 fixture 파일로 MIME/확장자/SHA-256/격리 로직을 검증함.

## D-002 (2026-08-25) Playwright 의존성을 필수에서 선택으로 변경
- **결정**: 크롤러 기본 엔진은 Node 내장 fetch 기반 HTTP 수집. Playwright는 옵션(`CRAWLER_ENGINE=playwright`)로 통합 지점만 제공.
- **근거**: (1) 본 환경 Docker 부재 + 브라우저 바이너리 다운로드 부담, (2) preflight 실측 결과 주요 페이지가 plain HTTP 200 + 서버사이드 렌더 HTML(26KB)로 응답하여 JS 렌더링 불필요, (3) blueprint는 Playwright "권장"이나 안전·재현성 요구는 HTTP로 충족.
- **대안(유지)**: Playwright가 필요한 동적 페이지 발견 시 preflight가 `JS_RENDERING_REQUIRED`로 분류하고 해당 경로는 BLOCKED 처리.

## D-003 (2026-08-25) 개발 런타임 저장소: JSON 파일 스토어 + PostgreSQL(Drizzle) 이중 구조
- **결정**: `packages/db`에 Drizzle PostgreSQL 스키마+마이그레이션(운영용)과, `DATABASE_URL` 미설정 시 사용하는 파일 기반 리포지토리(`packages/db/src/store`, `data/app-store/*.json`)를 함께 제공.
- **근거**: 본 실행 환경에 Docker/PostgreSQL 없음. 완료 기준의 "마이그레이션 존재"와 "키워드 검색·프로젝트 관리가 외부 서비스 없이 동작"을 동시 충족하기 위한 어댑터 패턴.
- **주의**: 파일 스토어는 단일 프로세스 MVP용. 운영(NAS) 배포 시 반드시 PostgreSQL 모드 사용.

## D-004 (2026-08-25) 규칙 초기 데이터: 숫자 없는 스켈레톤 규칙
- **결정**: 계약방법 등 판단 규칙은 원문 확인 전까지 `output.method=REVIEW_REQUIRED`인 draft 스켈레톤만 제공. 어떠한 금액/비율도 하드코딩하지 않음.
- **근거**: 프롬프트 §2 절대 원칙. 활성 규칙 부재 시 마법사는 REVIEW_REQUIRED 반환.

## D-005 (2026-08-25) API 프레임워크 Fastify, 인증은 scrypt 세션
- **결정**: Fastify + @fastify/cookie + 자체 scrypt 비밀번호 해시 + HttpOnly 세션 쿠키 + CSRF 더블서밋 토큰.
- **근거**: 네이티브 의존성(bcrypt/argon2) 컴파일 회피(Windows 환경), 경량성. 보안 요구(해시, 세션쿠키, CSRF) 모두 충족.

## D-006 (2026-08-25) 벡터 검색 기본 none
- **결정**: `EMBEDDING_PROVIDER=none` 기본. Qdrant 클라이언트 연동 지점과 docker-compose 정의는 제공하되, 키가 없으면 키워드(PostgreSQL FTS 또는 파일 인덱스)+메타데이터 필터만으로 검색 제공.
- **근거**: 프롬프트 §6 "API 키가 없어도 키워드 검색은 작동해야 한다".

## D-007 (2026-08-25) UI 프레임워크 Next.js App Router, CSS는 순수 CSS
- **결정**: Next.js 14 App Router + CSS Modules 수준의 의존성 최소 스타일링. 컴포넌트 라이브러리 도입 보류.
- **근거**: 모바일 반응형·접근성 중심의 차분한 공공 UI 요구에 불필요한 의존성 회피.

## D-008 (2026-08-25) Docker Compose 검증 불가 기록
- **결정**: `docker-compose.yml`/Dockerfile/healthcheck를 작성하되, 본 환경 Docker 부재로 `docker compose config` 실행 불가 → TEST_RESULTS.md에 실행 불가 사유 기록. NAS 배포는 `DEPLOY_TO_NAS=true` 확인 전까지만 문서 준비.

## D-009 (2026-08-25) 동적 게시판 수집: Playwright in-page JS 실행 방식
- **결정**: 공지사항 상세(POST 폼 + `fncDetailView('822')` 호출형)는 브라우저로 목록을 연 뒤 사이트 자체 JS 함수를 `page.evaluate`로 실행하여 도착 페이지의 렌더 HTML을 수집한다(`renderViaCall`). 저장 식별자는 관측된 프레임워크 규칙에 따른 결정적 URL(view0010v.do?board_seq=N)을 사용한다.
- **근거**: GET 쿼리만으로는 빈 셸만 반환하는 것을 실측. URL 템플릿 추측 금지 원칙에 따라 실제 함수 실행 결과만 사용.
- **한계/주의**: 증분 재수집 시에도 동일 방식 필요. HTTP 엔진으로 view0010v.do를 직접 GET하면 빈 셸이 수집될 수 있으므로 runCrawl 링크 확장은 이를 seed 큐에서 제외해야 함(후속 개선).

## D-010 (2026-08-25) 위키 파일 하나 추가: 13-공지사항-모음.md
- **결정**: 프롬프트 지정 14개 위키 파일 외에 `13-공지사항-모음.md`를 추가 생성한다.
- **근거**: 공지사항 상세 38건은 어느 지정 파일과도 주제가 맞지 않음. 원문 인용+출처 메타 유지 원칙은 동일.
