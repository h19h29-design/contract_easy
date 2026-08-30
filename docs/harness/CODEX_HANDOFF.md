# CODEX_HANDOFF.md

## 즉시 재개 지점

다음 작업은 **T-211 NAS 실환경 배포 검증**이다. T-201 RAG/vector API 런타임 연결은 사용자 결정으로 보류한다.

현재 완료된 기반:
- 공사계약 업무공간 핵심 기능과 운영 배포 정적 안전장치
- lint/typecheck 153 tests/PG 43 tests/build/standalone build/Compose 정적 검증
- GitHub와 공개 GitLab의 `main` 일치
- 현재 Mac의 `origin`은 GitHub/GitLab 다중 push 구성

현재 미완료:
- NAS Container Manager가 설치됐으나 중지 상태라 Compose 실행 검증을 하지 못했다.
- 운영 DB의 legacy `project_checklist_items.evidence_path` 0건 확인이 필요하다.
- HTTPS 역방향 프록시, 백업·복구 리허설, 파일럿 운영 검증이 남았다.
- GitLab 서버 pull mirror는 제공되지 않아 현재 Mac 이외 환경의 자동 동기화는 별도 구성이 필요하다.

## 권장 구현 순서

1. NAS Container Manager 기동 승인을 받은 뒤 Docker/Compose 가용성을 확인한다.
2. 운영 `.env`는 비밀값을 출력하지 않고 NAS 보안 경로에서 주입한다.
3. `docker compose config`, migration, `docker compose up` 순으로 실행한다.
4. health, loopback bind, 내부 서비스 무노출, HTTPS 프록시를 확인한다.
5. 백업 생성·격리 복구와 파일럿 운영 체크리스트를 실검증한다.

## 완료 조건

- NAS에서 Compose 구성과 서비스 기동 PASS
- 내부 PostgreSQL/Qdrant/Valkey가 host에 노출되지 않음
- 운영 health/API/web/HTTPS 동작 확인
- legacy `evidence_path` 0건 확인 또는 안전한 보존 migration 선행
- 백업 파일 검증과 격리 복구 성공

## 사람 또는 외부 환경이 필요한 작업

- `/admin/rules`에서 구조화 밴드 3건 원문 대조 후 승인
- NAS Container Manager 서비스 기동
- Docker 환경에서 `docker compose config/up`과 마이그레이션 최종 검증
- `wiki/reviewed` 문서 검토

## Git 상태 메모

- 브랜치: `main`
- 최근 배포 안전장치 커밋: `9fd88d9`
- GitHub: `https://github.com/h19h29-design/contract_easy.git`
- GitLab: `https://gitlab.aigov.go.kr/h19h19/contract_easy.git`
- 현재 Mac의 `origin` fetch는 GitHub, push는 GitHub와 GitLab 두 곳이다.
