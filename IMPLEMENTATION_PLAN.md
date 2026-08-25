# IMPLEMENTATION_PLAN.md

## 목표
01_BLUEPRINT + 실행 프롬프트의 4대 기능(수집/변경감지, LLMWiki+근거RAG, 규칙엔진 안내, 계약업무공간)을
외부 서비스(Docker/Postgres/Qdrant/LLM 키) 없이도 개발·검증 가능한 형태로 구현하고,
운영 환경에서는 PostgreSQL+Qdrant+Valkey로 승격 가능한 구조로 만든다.

## 아키텍처 요약
```text
workers/crawler ──▶ data/raw (HTML 불변, manifest JSONL, versioning)
workers/ingest  ──▶ data/normalized (markdown/chunks/rules-candidates) + wiki/generated + keyword index
packages/db     ──▶ Drizzle PG schema/migrations (운영) | 파일스토어 리포지토리(개발 기본)
packages/rules  ──▶ 결정론적 규칙 평가(active 규칙만, 없으면 REVIEW_REQUIRED)
packages/retrieval ▶ 키워드+메타필터(+옵션 벡터) 검색 → 출처 게이트 답변
apps/api        ──▶ Fastify REST (공개검색, 마법사, 프로젝트, 관리자, 인증, 감사로그)
apps/web        ──▶ Next.js App Router (/, /wizard, /search, /guide, /sources,
                     /workspace/*, /admin/*) 한국어 모바일 우선 UI
```

## 단계 (TASKS.md의 T-xxx와 1:1)
- T-010 하니스 문서 · T-020 스켈레톤 · T-030 shared · T-040 db · T-050 rules
- T-060 crawler(+preflight 실측) · T-070 ingest(정규화/chunk/인덱스/wiki/규칙후보)
- T-080 retrieval · T-090 api · T-100 web · T-110 테스트 전면 통과
- T-120 compose/NAS 문서 · T-130 최종 보고

## 완료 정의(이 세션)
프롬프트 §8 완료기준 중 Docker 실행 항목을 제외한 전부.
Docker 관련: 설정·문서 제공, `docker compose config`는 Docker 설치 환경에서 실행할 것(RUNBOOK 참조).
