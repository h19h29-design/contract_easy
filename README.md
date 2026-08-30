# 서울시교육청 공사계약 통합지원 시스템

계약길잡이(contract.sen.go.kr) 공개 자료 기반 **공사계약 통합지원 서비스**:
1) 공개 자료 수집·변경감지 2) LLMWiki + 출처 기반 RAG 3) 검토·승인 규칙만 사용하는 계약 안내 엔진 4) 계획~하자관리 업무공간.

## 빠른 시작(외부 서비스 불필요)

```bash
pnpm install
pnpm crawl:preflight   # robots/접근성 실측
pnpm crawl:sample      # 샘플 수집
pnpm crawl:full        # 전체 수집(preflight PASS 시)
pnpm crawl:board       # 동적 게시판 수집(Playwright, 공지사항 상세 등)
pnpm ingest:all        # 정규화+청크+인덱스+위키+규칙후보

pnpm dev:api           # http://localhost:8787
pnpm dev:web           # http://localhost:3000
```

- LLM/임베딩 키 없이도 **검색·위키·마법사(REVIEW_REQUIRED)·프로젝트 관리**가 동작합니다.
- 첨부파일 다운로드는 robots.txt Disallow로 기본 차단(`DECISIONS.md` D-001).

## 초기 관리자

개발 모드에서만 `admin / ChangeMe!2026` 기본값을 사용합니다. 운영은 빈 사용자 DB의 최초 기동 전에
`ADMIN_INITIAL_PASSWORD`를 비밀 관리 경로로 주입해야 하며, 관리자 생성 후 해당 값을 제거합니다.

## 테스트

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e          # npx playwright install chromium 선행
```

## 운영 배포(NAS/Docker)

`DEPLOY_TO_NAS=true` 확인 후:

```bash
cp .env.example .env   # 빈 필수값을 비밀 관리 경로에서 설정
pnpm compose:validate
docker compose config && docker compose up -d --build && docker compose ps
scripts/backup-db.sh
```

웹/API는 기본적으로 NAS의 loopback에만 게시됩니다. Synology HTTPS 역방향 프록시와 공개
`WEB_ORIGIN`/`NEXT_PUBLIC_API_URL`을 먼저 구성해야 합니다. PostgreSQL/Qdrant/Valkey는 호스트에 게시하지 않습니다.

자세한 절차: `docs/harness/RUNBOOK.md`
설계 문서: `01_SYSTEM_BLUEPRINT.md`, `02_CRAWL_SEEDS.yaml`, `DECISIONS.md`, `SECURITY.md`
