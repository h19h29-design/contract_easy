# COMMANDS.md - 전체 명령

## 루트
```bash
pnpm install            # 의존성 설치
pnpm lint               # ESLint
pnpm typecheck          # tsc --noEmit
pnpm test               # Vitest 단위+통합 테스트
pnpm test:e2e           # Playwright E2E
pnpm test:pg            # embedded-postgres 실제 PG 통합 테스트
pnpm build              # 전체 빌드
pnpm compose:validate   # Docker 없이 Compose 구조 검증
```

## 크롤러
```bash
pnpm crawl:preflight        # seed robots/접근성 사전검증
pnpm crawl:sample           # 첫 seed 샘플 수집
pnpm crawl:full             # 전체 seed 수집
pnpm crawl:board            # 공지 게시판 상세 수집
pnpm crawl:incremental      # hash 비교 증분 수집
pnpm crawl:diff             # 버전 diff
pnpm crawl:coverage         # CRAWL_COVERAGE.md 재생성
pnpm crawl:faq-bbs          # 승인된 외부 FAQ BBS 수집
pnpm crawl:attachments      # D-014 승인 범위 첨부 수집
pnpm crawl:selector         # 계약방법 셀렉터 UI walk
pnpm crawl:selector-tables  # 발견된 단계 절차표 수집
```

## 인제스트와 검색
```bash
pnpm ingest:all         # 정규화+chunk+인덱스+위키+규칙후보
pnpm embed:index        # 청크 임베딩을 local-json 또는 Qdrant에 적재
pnpm eval:retrieval     # 리트리벌 평가셋 실행
pnpm rules:queue        # 사람 검토용 규칙 승인 대기열 재생성
```

`embed:index`의 주요 환경변수:
- `EMBEDDING_PROVIDER=hash|openai|openrouter|ollama`
- `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`
- `VECTOR_STORE=local|qdrant`, `QDRANT_URL`, `QDRANT_COLLECTION`

## 데이터베이스와 개발 서버
```bash
pnpm db:generate        # Drizzle SQL 생성
pnpm db:migrate         # DATABASE_URL 대상 마이그레이션
pnpm store:reset        # 개발 파일 스토어 초기화
pnpm dev:api            # Fastify :8787
pnpm dev:web            # Next.js :3000
```

## Docker/NAS
```bash
docker compose config
docker compose up -d
docker compose ps
scripts/backup-db.sh
scripts/restore-db.sh <file>
```
