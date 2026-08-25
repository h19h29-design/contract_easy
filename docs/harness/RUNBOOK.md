# RUNBOOK.md — 실행·운영 절차

## 0. 요구사항
- Node 20+, pnpm 9+ (`npm i -g pnpm`), 선택: Docker 24+, Playwright 브라우저

## 1. 개발 (외부 서비스 불필요)
```bash
pnpm install
pnpm crawl:preflight     # robots/접근성 실측 → data/manifests/crawl-preflight.json
pnpm crawl:sample        # 샘플 페이지 수집
pnpm crawl:full          # 전체 수집(안전조건 충족 시)
pnpm ingest:all          # 정규화 + chunk + 인덱스 + 위키 생성
pnpm dev:api             # http://localhost:8787
pnpm dev:web             # http://localhost:3000
```
- LLM 키 없이도 검색/위키/마법사(REVIEW_REQUIRED)/프로젝트 관리 동작.
- 첨부 수집은 기본 비활성(D-001). 해제는 `CRAWL_ALLOW_ATTACHMENTS=true` + 법무 승인 후.

## 2. 테스트
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e            # npx playwright install 후
```

## 3. 운영(NAS/Docker) 배포 — DEPLOY_TO_NAS=true 확인 후
```bash
cp .env.example .env    # SESSION_SECRET, 포트, SEN_CONTRACT_DATA_ROOT 설정
docker compose config   # 문법 확인
docker compose up -d
docker compose ps       # healthcheck healthy 확인
```
- 마이그레이션: api 컨테이너가 기동 시 `packages/db/drizzle/*.sql` 적용(postgres 모드).
- 데이터 루트는 반드시 NAS 볼륨(`SEN_CONTRACT_DATA_ROOT`)로 지정. 시스템 볼륨 임의 사용 금지.

## 4. 백업/복구
```bash
scripts/backup-db.sh    # pg_dump → $SEN_CONTRACT_DATA_ROOT/backups
scripts/restore-db.sh backups/xxxx.sql.gz
```

## 5. 장애 대응
- 크롤 실패 급증: `data/manifests/crawl-failures.jsonl` 유형 확인 → 관리자 화면 `/admin/crawls`.
- AI 답변 신고: `/admin/reports`에서 처리.
- 규칙 승인: `/admin/rules`에서 원문 문맥 확인 후 approve(active) 또는 reject.

## 6. 보안 점검(배포 전 체크리스트)
- [ ] SESSION_SECRET 32바이트 이상 랜덤
- [ ] postgres/qdrant/valkey 포트 외부 비노출(localhost 바인딩)
- [ ] reverse proxy에서 /admin 추가 인증(Cloudflare Access 등)
- [ ] `SEN_CONTRACT_DATA_ROOT`가 NAS 공유볼륨인지 확인
- [ ] 백업 크론 등록 및 복구 리허설 1회
