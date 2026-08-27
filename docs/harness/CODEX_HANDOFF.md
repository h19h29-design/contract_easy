# CODEX_HANDOFF.md

## 즉시 재개 지점

다음 구현 작업은 **T-201 벡터 API 런타임 연결**이다.

현재 완료된 기반:
- `EmbeddingProvider`: OpenAI, OpenRouter, Ollama, hash-test
- `VectorStore`: Qdrant REST, local-json
- `pnpm embed:index`: 11,259개 청크를 hash+local로 적재 검증
- `HybridRetriever.search()`: async, 키워드+벡터 RRF 융합 주입점 제공

현재 미완료:
- `apps/api/src/server.ts`의 `loadRetriever()`는 아직 `new HybridRetriever({ chunks, versions: [] })`만 반환한다.
- API가 embedding provider와 vector store를 생성해 `vectorSearch`로 주입하지 않는다.
- `vectorSearch`가 `SearchFilters`를 받지 않아 하이브리드 검색 시 필터를 우회할 수 있다.

## 권장 구현 순서

1. `RetrievalDeps.vectorSearch` 시그니처에 선택적 `SearchFilters`를 전달한다.
2. API에서 설정에 따라 EmbeddingProvider와 VectorStore를 한 번 생성한다.
3. 벡터 결과의 `chunkId`를 `Chunk`로 복원하고 검색 필터를 적용한다.
4. provider/store 오류는 요청 실패로 전파하지 말고 키워드 결과로 폴백한다.
5. hash+local fixture로 API 검색 및 필터 보존 테스트를 추가한다.
6. health 응답은 설정값이 아니라 실제 vectorSearch 초기화 상태를 보고하게 한다.

## 완료 조건

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
$env:EMBEDDING_PROVIDER='hash'; $env:VECTOR_STORE='local'; pnpm embed:index
pnpm exec tsx scripts/verify-vector.mts
```

- 모든 명령 PASS
- provider 미설정 시 기존 키워드 검색 동작 유지
- 벡터 파일/Qdrant 장애 시 키워드 폴백
- `contractType`, `stage`, `faqCategory`, `docType` 필터가 벡터 결과에도 적용
- 법적 판단값은 여전히 active 규칙만 사용

## 사람 또는 외부 환경이 필요한 작업

- `/admin/rules`에서 구조화 밴드 3건 원문 대조 후 승인
- Docker 환경에서 `docker compose config/up`과 마이그레이션 최종 검증
- `wiki/reviewed` 문서 검토

## Git 상태 메모

- 브랜치: `master`
- 벡터 기반 커밋: `ab106e6`, `5a26669`
- 원격 저장소는 이 인수인계 작성 시점에 설정되어 있지 않았다. push 전 `git remote -v` 확인 필요.
