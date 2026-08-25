# CRAWL_PREFLIGHT.md — 사전검증 결과

- 최초 생성: 2026-08-25 (HTTP 엔진) · 갱신: 2026-08-25 (Playwright 엔진 병행 확인)
- verdict: **PASS** (12/12 seed)
- robots: 페이지 HTML은 Allow, 첨부파일 확장자(pdf/hwp/xls/zip/png/jpg/doc/ppt/js/gif/bmp/log/jsp)는 Disallow → 첨부 다운로드 기본 차단(D-001)
- User-Agent: sen-contract-guide-crawler/0.1 (+contact)

| seed | 상태 | HTTP | 비고 |
| --- | --- | --- | --- |
| 이용안내 | OK | 200 | 정적 HTML |
| 계약방법 메인 | OK | 200 | 셀렉터형(동적) — Playwright로 렌더 수집 |
| 계약흐름도 | OK | 200 | 정적 HTML |
| 사전체크리스트-용역 | OK | 200 | 본문+표 풍부(4.5KB+) |
| 사전체크리스트-공사 | OK | 200 | 본문+표 풍부 |
| FAQ-계약일반/물품/용역/공사 | OK | 200 | 목록은 외부 BBS(buseo.sen.go.kr) 링크 또는 인라인 본문 → 개별 글 수집은 보류(외부 도메인 allowlist 없음) |
| 공지사항 | OK | 200 | `fncDetailView('822')` POST 폼형 → **Playwright in-page JS 실행 방식으로 상세 38건 수집 성공** |
| 부정당업자 제재 방법 | OK | 200 | 정적 HTML |
| 계약길잡이 소개 | OK | 200 | 정적 HTML |

## 발견된 구조적 사실
1. 게시판 목록·상세가 JS 함수(`fncDetailView`, `fncSearch`) + POST 폼으로 동작 → 순수 HTTP로는 상세 진입 불가.
   - 해결: `CRAWLER_ENGINE=playwright` + `renderViaCall`(페이지 자체 함수 실행 후 렌더 HTML 수집, D-002).
2. pagination도 동일 방식으로 해석하며 종료조건(빈 목록/콘텐츠 반복/URL 반복/최대 페이지)을 적용함.
3. 첨부파일 링크(`/bms/file/down0030f.do?seq=...`)는 robots Disallow 확장자에 해당하여 메타데이터만 저장.

## 증거
- `data/manifests/crawl-preflight.json` (기계판 결과)
- `artifacts/preflight/sample-guide.html`, `sample-guide.body.txt`
- `artifacts/preflight/shot-*.png` (렌더링 스크린샷 다수)
