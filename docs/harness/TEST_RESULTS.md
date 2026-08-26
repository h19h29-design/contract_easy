# TEST_RESULTS.md

?뺤떇: ?좎쭨 / 紐낅졊 / 寃곌낵 / ?듭떖異쒕젰. 紐⑤뱺 ?섏튂???ㅼ젣 ?ㅽ뻾 ?곗텧臾?湲곗?.

## 2026-08-26 4李??몄뀡 (?몃? FAQ BBS ?섏쭛)

| ??ぉ | 寃곌낵 | ?듭떖 |
| --- | --- | --- |
| buseo.sen.go.kr robots ?ы솗??| PASS | ???寃쎈줈 Allow(Disallow q_bbsSn 1079~1091 ?몃?), 泥⑤? ?뺤옣?먮뒗 ?숈씪 Disallow ??硫뷀?留?|
| `pnpm crawl:faq-bbs` ?좉퇋 ?섏쭛湲?| PASS | **媛쒕퀎 Q&A 137嫄??섏쭛**(?먰겢由?寃뚯떆??sn=1412 32嫄??꾩껜 4?섏씠吏 ?뚯쭊 + 湲고? ?곕룞 寃뚯떆??, ?ㅽ뙋 ?뺤옣遺?103嫄??앸퀎쨌??젣 ?뺣━ |
| ?ъ씤?쒖뒪??| PASS | 珥?泥?겕 5,388 / faq 2,769 (general 59 쨌 goods 63 쨌 service 58 쨌 construction 62 쨌 ?먰겢由??듯빀 2,527) |
| ?됯? ?ъ떎??| ?숆껐 | hit@3 84.4% ?좎? |
| law.go.kr 留곹겕 ?ㅼ틪 | ?대떦 ?놁쓬 | 肄뷀띁????踰뺣졊 ?몃? 留곹겕 0嫄??뺤씤 ??蹂몃Ц ?섏쭛 ???遺??|

紐낅졊 寃뚯씠?? lint PASS / typecheck PASS / test 70쨌70 / build PASS

## 2026-08-26 3李??몄뀡 (FAQ ??끒룰뎄議고솕 洹쒖튃 珥덉븞쨌PG ?숆린?붋룻룊媛??

| ??ぉ | 寃곌낵 | ?듭떖 |
| --- | --- | --- |
| FAQ 泥?겕 ?몃텇??| PASS | `type=faq` **247媛?*(general 60/goods 63/service 62/construction 62), `faqCategory` ?꾪꽣 硫뷀? 遺??|
| 援ъ“??洹쒖튃 珥덉븞(怨꾩빟諛⑸쾿 ?? | PASS | ?ㅼ젣 ?섏쭛 ?쒖뿉??諛대뱶 珥덉븞 **3嫄??앹꽦**(?섏쓽怨꾩빟 2000留?1?? ?낆같 <1?? ?낆같 1??2.3?? ???꾨? draft, 寃쎄퀎(?댄븯/珥덇낵) warning ?ы븿. ?⑥쐞?뚯뒪???ы븿 珥?70 PASS |
| `ingest:sync-db`(?뚯씪?뭁G) | PASS | pg ?듯빀?뚯뒪???좉퇋 3嫄??ы븿 **16/16 PASS** ??踰꾩쟾 ?ъ깮 硫깅벑(?щ룞湲고솕 changed=0), 洹쒖튃 active 蹂댁〈(D-011), 誘몄〈??candidate ?뺣━ |
| 由ы듃由щ쾶 ?됯???`pnpm eval:retrieval`) | ?ㅼ륫 湲곕줉 | 45臾명빆: **hit@1 60.0%, hit@3 84.4%**, 鍮꾩퐫?쇱뒪 嫄곕? ?먯젙 **5/5**. ?ㅼ퐫?대쭅 媛쒖꽑(?꾩껜?⑥뼱 媛以?議곗궗 ?쒓굅)?쇰줈 hit@3 66.7%??4.4% ?μ긽. ?붿뿬 誘몄뒪???곸꽭 誘몄닔吏?怨듭? ?쒕ぉ ?깅텇 ??`EVAL_RETRIEVAL.md` 臾몄꽌??|

紐낅졊 寃뚯씠?? lint PASS / typecheck PASS / test 70쨌70 / build PASS / test:pg 16쨌16

## 2026-08-25 異붽? ?ㅽ뻾 (2李??몄뀡)

| 紐낅졊 | 寃곌낵 | ?듭떖 異쒕젰 |
| --- | --- | --- |
| `pnpm crawl:incremental` 3??| PASS | 1??changedUrls=1(?댁쟾 Playwright/HTTP ?붿쭊 ?꾪솚遺?, **2쨌3??changedUrls=0** ??利앸텇 ?덉젙???뺤씤 |
| `pnpm crawl:diff` | PASS | 踰꾩쟾 ???섎???異쒕젰(v2?뭭3 ?? ?붿쭊 ?꾪솚 ?대젰 諛섏쁺) |
| `pnpm ingest:all` 2???곗냽 | PASS | candidates=63 硫깅벑(2?뚯감 staleRemoved=0), active=0 ?좎?. ?ㅻ옒??candidate 珥덉븞 ?먮룞 ?뺣━(reviewed/active 蹂댁〈) ?뺤씤 |
| 洹쒖튃 ?꾨낫 臾몃㎘ ???| PASS | 63嫄??꾨? `candidate.quotedSentence/contextBefore/contextAfter` 蹂댁쑀 ??`/admin/rules` ?붾㈃ ?쒖떆(?⑥쐞?뚯뒪???ы븿) |
| `pnpm compose:validate` | PASS | 7?쒕퉬?ㅒ톒ealthcheck쨌host/privileged 誘몄궗?㈑톖atest ?놁쓬쨌SESSION_SECRET ?꾩닔쨌NAS 寃쎈줈 蹂?섑솕 ?뺤씤(Docker config ?泥??꾨떂) |

## 2026-08-25 理쒖쥌

| 紐낅졊 | 寃곌낵 | ?듭떖 異쒕젰 |
| --- | --- | --- |
| `pnpm install` | PASS | lockfile ?앹꽦(pnpm-lock.yaml) |
| `pnpm lint` | PASS | eslint flat config, 0 error 0 warning |
| `pnpm typecheck` | PASS | ?뚰겕?ㅽ럹?댁뒪 10媛??꾨줈?앺듃 tsc --noEmit ?꾨? ?듦낵 |
| `pnpm test` | PASS | **Vitest ?뚯씪 7媛?/ ?뚯뒪??60媛??꾨? ?듦낵** (洹쒖튃 寃쎄퀎媛? store 踰꾩쟾愿由? retrieval 寃뚯씠?? api ?듯빀, crawler robots, ingest ?뺢퇋???ы븿) |
| `pnpm build` | PASS | web(next build, ???쇱슦???앹꽦) + api/crawler/ingest(tsc dist) |
| `pnpm crawl:preflight` | PASS | **12/12 seed HTTP 200**, verdict=PASS ??`data/manifests/crawl-preflight.json`, `docs/harness/CRAWL_PREFLIGHT.md` |
| `pnpm crawl:sample` | PASS | 1?섏씠吏 ?섏쭛, manifest 湲곕줉 |
| `pnpm crawl:full` + `pnpm crawl:board` (CRAWLER_ENGINE=playwright) | PASS | **source 50嫄?/ version 160媛?/ ?곸꽭 寃뚯떆臾?38嫄?怨듭??ы빆) / 泥⑤? 硫뷀? 72嫄?* ??`data/manifests/pages.jsonl`, `files.jsonl`, `crawl-runs.jsonl` |
| ?ъ닔吏?以묐났 寃利?| PASS | ?숈씪 肄섑뀗痢??ъ닔吏???`changed=false`, ?먮낯 以묐났 ?놁쓬(content-addressed ???. ?⑥쐞?뚯뒪??store.test.ts)+pages.jsonl ?ㅼ륫 |
| 蹂寃?媛먯? | PASS | playwright ?뚮뜑 HTML怨?HTTP fetch HTML??李⑥씠濡?12媛?seed媛 ?좉퇋 踰꾩쟾(v2)?쇰줈 湲곕줉?⑥쓣 ?ㅼ륫 ??diff ???議댁옱(`pnpm crawl:diff`) |
| `pnpm ingest:all` | PASS | normalized **50嫄?*, chunk **2,535媛?*, ?꾪궎 **15媛??뚯씪**(?댁슜 ?덈뒗 ?뚯씪 7媛? 泥댄겕由ъ뒪??35KB, FAQ 42KB, 怨듭??ы빆 紐⑥쓬 86KB ??, 洹쒖튃?꾨낫 **60嫄?draft)** |
| ?ㅼ썙??寃??API ???놁씠) | PASS | `/api/search?q=怨꾩빟蹂댁쬆湲? ??20嫄? `/api/search?q=遺?뺣떦?낆옄` ??20嫄?|
| 異쒖쿂 寃뚯씠??| PASS | 洹쇨굅 ?덈뒗 吏덈Ц: keywordHits=5 + "AI 誘몄꽕?? 怨듭? ?쒖떆 / 洹쇨굅 ?녿뒗 吏덈Ц(?? ?섏옄蹂댁쬆湲곌컙 ???꾩옱 corpus??遺??: ?듬? 嫄곕?(refusalReason 諛섑솚) |
| 留덈쾿??REVIEW_REQUIRED | PASS | ?쒖꽦 洹쒖튃 0媛???`decisionState=REVIEW_REQUIRED`, ?レ옄 異붿륫 ?놁쓬 |
| API ?듯빀(?몄쬆쨌RBAC쨌CSRF) | PASS | server.test.ts: 濡쒓렇?????꾨줈?앺듃 ?앹꽦(?④퀎10+泥댄겕由ъ뒪??0 ?먮룞) ??泥댄겕由ъ뒪???좉?, CSRF ?꾨씫 403, 鍮꾨줈洹몄씤 401, ?ㅻ떟 鍮꾨?踰덊샇 401+媛먯궗濡쒓렇 |
| ?ㅽ겕由곗꺑쨌?섑뵆 利앷굅 | PASS | `artifacts/preflight/shot-*.png`(?뚮뜑 ?섏씠吏 ?ㅼ닔), `artifacts/preflight/sample-guide.html`, `sample-guide.body.txt` |

## ?ㅽ뻾 遺덇? / 蹂대쪟 ??ぉ
- `docker compose config|up`: **蹂?癒몄떊??Docker 誘몄꽕移?* ???ㅽ뻾 遺덇?(D-008). ?ㅼ젙쨌臾몄꽌??以鍮??꾨즺.
- `pnpm test:e2e` | PASS | **5媛??쒕굹由ъ삤 ?꾨? ?듦낵(6.1s)** ????3?좏깮吏, 留덈쾿???꾨즺?뭃EVIEW_REQUIRED, 寃??寃곌낵 ?쒖떆, 洹쇨굅 ?녿뒗 吏덈Ц ?듬? 嫄곕?(API), 濡쒓렇?멤넂?꾨줈?앺듃 ?앹꽦?믪껜?щ━?ㅽ듃 蹂寃??ㅼ젣 Chromium 釉뚮씪?곗?)
- 泥⑤??뚯씪 ?섑뵆 ?ㅼ슫濡쒕뱶: **BLOCKED_ROBOTS**(D-001). fixture濡?MIME/?뺤옣??SHA-256/寃⑸━ 濡쒖쭅 寃利??泥?crawler.test.ts PASS).
- FAQ 4媛?寃뚯떆?먯쓽 媛쒕퀎 湲: 紐⑸줉???몃? ?꾨찓??buseo.sen.go.kr BBS) 留곹겕 ?먮뒗 ?⑥씪 ?섏씠吏 ?몃씪??援ъ꽦 ???몃? 蹂몃Ц? ?섏쭛 湲덉? ?먯튃 ?좎?(D-001 怨꾩뿴), ?몃씪??蹂몃Ц? ?뺤긽 ?몃뜳?ㅻ맖.

## API ?ㅻえ???ㅼ륫)
- `GET /api/health` ??`{"status":"ok","llmProvider":"none","embeddingProvider":"none","databaseMode":"file-store"}`
- `POST /api/wizard` ??`REVIEW_REQUIRED`
- `GET /api/wiki` ??15?뚯씪, `GET /api/wiki/11-FAQ.md` ??44,779??- `POST /api/ask`(洹쇨굅 ?덉쓬) ??`{answered:false, providerNotice:"?꾩옱 AI ?듬? 湲곕뒫???ㅼ젙?섏? ?딆븯?듬땲??..", keywordHits:5}`
- `POST /api/ask`(洹쇨굅 ?놁쓬) ??`{answered:false, refusalReason:"洹쇨굅媛 ?섎뒗 ?먮Ц??李얠? 紐삵뻽?듬땲??.."}`

## 2026-08-26 PostgreSQL ?댁쁺 寃쎈줈 寃利?
| 紐낅졊 | 寃곌낵 | ?듭떖 異쒕젰 |
| --- | --- | --- |
| `pnpm test:pg` (embedded-postgres, ?ㅼ젣 PG 諛붿씠?덈━) | PASS | **2?뚯씪 / 13?뚯뒪???꾨? ?듦낵** |
| 留덉씠洹몃젅?댁뀡 ?곸슜 | PASS | `drizzle/0001_init.sql` 而ㅻ컠 ?몃옖??뀡 ?곸슜 + `_migrations` ?대젰 愿由? ?ъ쟻??0嫄?硫깅벑) ?뺤씤 |
| PgStore ?먮Ц 踰꾩쟾愿由?| PASS | ?숈씪 ?댁떆 ?ъ닔吏?以묐났 ?놁쓬 + rawHtmlPath/menuPath 蹂댁셿, 蹂寃????좊쾭??援щ쾭??蹂댁〈 |
| PgStore 洹쒖튃 ?뚮줈??| PASS | draft?뭓ctivate 李⑤떒, review ??activate, ?촸psert ??active ?좎?(D-011 媛??, ?좉퇋 active ??援щ쾭??superseded |
| PgStore RBAC/?몄뀡/?꾨줈?앺듃 | PASS | scrypt 寃利? ADMIN ?고쉶, 泥댄겕由ъ뒪???좉??믩떒怨??곹깭 done, ?몄뀡 留뚮즺/??젣 |
| API PostgreSQL 紐⑤뱶 | PASS | buildApp??PG ?ㅽ넗??二쇱엯 ??濡쒓렇?맞룻봽濡쒖젥???앹꽦(10?④퀎)쨌異쒖쿂 紐⑸줉 ?숈옉 |
| ?⑺넗由?createStore | PASS | DATABASE_URL ?덉쓬?뭁gStore / ?놁쓬?묯ileStore ?좏깮 ?뺤씤 |

## 2026-08-26 6차 세션 (HWP 본문 인제스트 완료)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| hwp5txt(pyhwp) 일괄 변환 | PASS | **70/72 성공**(실패 2건은 빈 문서), UTF-8 저장 → `data/raw/attachments/hwp-txt/` |
| HWP-TXT 인제스트 통합 | PASS | HWP 문서 70건 추가 → 청크 5,689→**11,259** |
| 평가 재실행(확장 코퍼스) | 실측 기록 | hit@1 55.6% / hit@3 68.9% / 거부 5·5 — 코퍼스 2배 확장에 따른 경합 변화. 평가셋 재조정은 후속 과제로 명시 |

명령 게이트: lint PASS / typecheck PASS / test 70·70 / build PASS

## 2026-08-26 5차 세션 (#1 첨부 수집 승인 실행 + #3 UI-walk 부분 완료)

| 항목 | 결과 | 핵심 |
| --- | --- | --- |
| `pnpm crawl:attachments` 신규 | PASS | **135/141 다운로드**(zip 65 · hwp 45 · pdf 19 · xls 5 · png 1), 매직바이트 검증, content-addressed 저장, 6건 skip(buseo fetch 오류 5 + 미지정 타입 1) |
| PDF 텍스트 추출(pdf-parse v2 어댑터) | PASS | **15/16 문서화 → 256 청크 추가**(행안부 한시적 특례 등 법령 인용 포함), 스캔 1건 스킵 |
| `pnpm crawl:selector` UI-walk v3 | PARTIAL | 캐스케이딩 드롭다운 구동 성공(공사2/용역10/물품8), 적용 클릭 20회 — 결과 표 렌더 조건 미규명 → XHR 로그 보존(`selector-xhr.jsonl`), UNCOLLECTED #3에 다음 착수점 기록 |

명령 게이트: lint PASS / typecheck PASS / test 70·70 / build PASS
