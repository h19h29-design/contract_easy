# COMMANDS.md — 전체 명령

## 루트
```bash
pnpm install            # 의존성 설치
pnpm lint               # ESLint (전 워크스페이스)
pnpm typecheck          # tsc --noEmit
pnpm test               # Vitest unit+integration
pnpm test:e2e           # Playwright E2E (브라우저 필요)
pnpm test:pg            # PostgreSQL 통합테스트(embedded-postgres, 실제 PG 바이너리)
pnpm db:migrate         # DATABASE_URL 대상 drizzle/*.sql 적용(멱등)
pnpm build              # 전체 빌드
```

## 크롤러 (workers/crawler)
```bash
pnpm crawl:preflight    # seed 사전검증(robots/상태/본문길이/링크수)
pnpm crawl:sample       # 첫 seed 1페이지 수집 + manifest
pnpm crawl:full         # 전체 수집(안전조건 충족 시)
pnpm crawl:board        # 동적 게시판 수집(Playwright 강제)
pnpm compose:validate   # docker-compose.yml 구조 검증(Docker 없이)`npnpm rules:queue        # 규칙 승인 대기열 문서 재생성
pnpm crawl:incremental  # 변경분만 재수집(hash 비교)
pnpm crawl:diff         # 버전 diff 리포트
pnpm crawl:coverage     # CRAWL_COVERAGE.md 재생성
```

## 인제스트 (workers/ingest)
```bash
pnpm ingest:all         # 정규화+chunk+인덱스+위키+규칙후보 일괄
node dist/cli.js normalize|chunk|index|wiki|rules
```

## 개발 서버
```bash
pnpm dev:api            # Fastify :8787
pnpm dev:web            # Next.js :3000
```

## 데이터 관리
```bash
pnpm db:generate        # drizzle-kit generate (PG 스키마→SQL)
pnpm store:reset        # 파일스토어 초기화(개발 전용, 확인 프롬프트)
```

## Docker/NAS (DEPLOY_TO_NAS=true 이후)
```bash
docker compose config && docker compose up -d && docker compose ps
scripts/backup-db.sh / scripts/restore-db.sh <file>
```
