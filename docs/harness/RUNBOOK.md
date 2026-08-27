# RUNBOOK.md - 실행·운영 절차

## 0. 요구사항
- Node 20+, pnpm 9+
- 선택: Docker 24+, Playwright Chromium, Ollama 또는 외부 임베딩 API

## 1. 로컬 개발
```bash
pnpm install
pnpm crawl:preflight
pnpm ingest:all
pnpm dev:api
pnpm dev:web
```

- LLM 키 없이도 키워드 검색, 위키, `REVIEW_REQUIRED` 마법사, 프로젝트 관리가 동작한다.
- 첨부 수집 기본값은 비활성이다. D-014 승인 범위를 임의로 확장하지 않는다.

## 2. 벡터 인덱스
외부 서비스 없이 파이프라인을 검증하려면:
```bash
EMBEDDING_PROVIDER=hash VECTOR_STORE=local pnpm embed:index
pnpm exec tsx scripts/verify-vector.mts
```

운영 Qdrant 예시:
```bash
EMBEDDING_PROVIDER=openai VECTOR_STORE=qdrant pnpm embed:index
```

- `hash`는 개발·테스트 전용이며 실제 의미 임베딩 모델이 아니다.
- 현재 인덱스 CLI와 retriever 주입점은 구현됐다.
- API 런타임 provider/store 연결은 T-201의 남은 작업이다.

## 3. 테스트
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:pg
pnpm test:e2e
```

## 4. 운영 배포
`DEPLOY_TO_NAS=true`를 확인한 뒤 실행한다.
```bash
cp .env.example .env
docker compose config
docker compose up -d
docker compose ps
pnpm db:migrate
```

- `SESSION_SECRET`은 32바이트 이상 무작위 값으로 설정한다.
- `SEN_CONTRACT_DATA_ROOT`는 NAS 공유 볼륨으로 지정한다.
- PostgreSQL, Qdrant, Valkey 포트는 외부에 노출하지 않는다.

## 5. 백업과 복구
```bash
scripts/backup-db.sh
scripts/restore-db.sh backups/xxxx.sql.gz
```

## 6. 장애 대응
- 크롤 실패: `data/manifests/crawl-failures.jsonl`과 `/admin/crawls`를 확인한다.
- AI 답변 신고: `/admin/reports`에서 처리한다.
- 규칙 승인: `/admin/rules`에서 원문을 대조한 뒤 reviewed, active 순서로 처리한다.
- 벡터 장애: 키워드 검색 폴백 여부를 확인하고 Qdrant collection 차원과 모델을 대조한다.

## 7. 배포 전 보안 점검
- [ ] `SESSION_SECRET` 32바이트 이상
- [ ] 기본 관리자 비밀번호 변경
- [ ] PostgreSQL/Qdrant/Valkey 외부 비노출
- [ ] `/admin` 추가 인증 또는 접근 제어
- [ ] NAS 볼륨과 백업 크론 확인
- [ ] 복구 리허설 1회
