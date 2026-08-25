# STATUS.md — 현재 진행상태

- 최종 갱신: 2026-08-25
- 현재 위치: T-130 최종 보고 직전 (전 단계 DONE, 아래 TASKS 참조)
- 다음 액션: `docs/harness/TASKS.md`의 NEXT 항목 확인

## 스냅샷
| 영역 | 상태 |
| --- | --- |
| 하니스 문서 | DONE |
| 모노레포/빌드체인 | DONE (lint/typecheck/test/build 통과) |
| 크롤러 + 실측 preflight/sample | DONE (페이지 수집 OK, 첨부는 robots로 차단=D-001) |
| 정규화/chunk/키워드 인덱스/위키 | DONE |
| 규칙엔진(REVIEW_REQUIRED 기본) | DONE |
| API(공개/업무공간/관리자) | DONE |
| 웹 UI(한국어, 마법사/검색/워크스페이스/관리자) | DONE |
| Docker/NAS | 문서·설정 준비 완료, 실행 검증은 Docker 환경 필요 |

## 실행 불가 항목과 이유
- `docker compose config/up`: 본 머신에 Docker 미설치.
- 첨부파일 샘플 다운로드: robots.txt Disallow (D-001). fixture로 로직 검증 대체.
