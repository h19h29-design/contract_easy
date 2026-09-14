# RUNBOOK.md - 실행·운영 절차

## 0. 요구사항
- Node 22.13+, pnpm 11.23.0
- 선택: Docker 24+, Playwright Chromium, Ollama 또는 외부 임베딩 API

## 1. 로컬 개발
### NAS 시험 사용(Mac)
- 저장소의 `공사계약-접속.command`를 실행하거나 `bash scripts/connect-nas.sh`를 실행한다. 터미널이 열려 있는 동안 `http://127.0.0.1:3300`에서 사용한다.
- SSH 계정의 PermitOpen에 `127.0.0.1:3300`, `127.0.0.1:8787`이 필요하다. 이미 포트가 사용 중이면 기존 연결을 확인하고 다른 프로세스를 임의 종료하지 않는다.
- 업무공간 로그인 ID는 `admin`, 비밀번호는 `~/agent-hub/secrets/contract_easy-admin-password`(600)에서 확인한다.
- 현재 범위는 키워드 검색·안내 문서·마법사·업무공간이다. OCR·AI 답변·의미 검색은 사용하지 않는다. 활성 규칙이 없어 판단값은 검토 필요로 표시한다.
- 일부 첨부 청크의 원문 URL이 `file://`인 기존 한계는 남아 있다. 자료의 마지막 확인일은 수집 당시이며 최신 법적 기준을 자동 보증하지 않는다.

### 개발 서버
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
pnpm compose:validate
docker compose config
docker compose up -d --build
docker compose ps
docker compose run --rm api node packages/db/dist/migrate.js
```

- `.env`의 빈 필수값(`SESSION_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `WEB_ORIGIN`,
  `NEXT_PUBLIC_API_URL`, `SEN_CONTRACT_DATA_ROOT`)을 먼저 채운다. 비밀값은 Git·로그·명령 인자에 넣지 않는다.
- `NEXT_PUBLIC_API_URL`은 웹 이미지 빌드 때 고정되므로 URL 변경 후에는 `web` 이미지를 다시 빌드한다.
- `SEN_CONTRACT_DATA_ROOT`는 NAS 공유 볼륨의 절대 경로로 지정한다.
- 컨테이너는 root가 아닌 `node`(uid 1000)로 실행된다. bind mount한 NAS 데이터 디렉터리는 배포 전에
  `chown -R 1000:1000 "$SEN_CONTRACT_DATA_ROOT"`(또는 동등한 쓰기 권한 부여)가 필요하다. 기존 루트 소유 파일이 있으면 재배포 전에 일괄 변경한다.
- API는 PostgreSQL 모드를 필수로 사용하며 기동 시 마이그레이션을 자동 적용한다. 위 명시적 명령은 사전 확인·재실행용이다.
- 최초 기동에만 `ADMIN_INITIAL_PASSWORD`를 비밀 관리 경로에서 주입한다. 관리자 생성 후 값을 비우고 컨테이너를 재생성한다.
- 웹/API 호스트 포트는 기본 `127.0.0.1` 바인딩이다. Synology 역방향 프록시에서 두 포트를 HTTPS 호스트명으로 연결한다.
- PostgreSQL, Qdrant, Valkey는 Compose 내부 네트워크에서만 접근하며 호스트 포트를 노출하지 않는다.
- 기존 운영 DB가 있다면 배포 전에 아래 결과가 `0`인지 확인한다. 0이 아니면 배포를 중단하고 보존 migration을 먼저 설계한다.

```bash
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM project_checklist_items WHERE evidence_path IS NOT NULL;"'
```

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
- [ ] 최초 관리자 생성 후 `ADMIN_INITIAL_PASSWORD` 제거 및 컨테이너 재생성
- [ ] `WEB_ORIGIN`/`NEXT_PUBLIC_API_URL` 공개 HTTPS 주소 일치
- [ ] 웹/API loopback 바인딩 + Synology HTTPS 역방향 프록시
- [ ] PostgreSQL/Qdrant/Valkey 외부 비노출
- [ ] `/admin` 추가 인증 또는 접근 제어
- [ ] NAS 볼륨과 백업 크론 확인
- [ ] 기존 DB `evidence_path IS NOT NULL` 결과 0
- [ ] 복구 리허설 1회
