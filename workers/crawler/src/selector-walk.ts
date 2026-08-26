import fs from 'node:fs';
import path from 'node:path';
import { ensureDirs } from '@sen/config';
import { FileStore, contentPath } from '@sen/db';
import { sha256Hex, isoNow } from '@sen/shared';

/**
 * 怨꾩빟諛⑸쾿 ??됲꽣 UI-walk v3(#3).
 * - ?꾩뿭 罹먯뒪耳?대뵫 ?쒕∼?ㅼ슫(#gb_cd_top ??#gy_cd_top)???ㅼ젣濡?議곗옉?섍퀬
 *   [?곸슜] ?대┃ 寃곌낵(??留???ν븳?? ?뚮씪誘명꽣 異붿륫 ?놁쓬.
 * - ?붿껌? selector-xhr.jsonl??湲곕줉(?붾뱶?ъ씤???숈뒿 ?먮즺).
 */

const SEED_URL = 'https://contract.sen.go.kr/fus/MI000000000000000097/contract/list0010v.do';

export async function walkSelector(opts?: { maxCombos?: number }): Promise<void> {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const maxCombos = opts?.maxCombos ?? Number(process.env.SELECTOR_MAX_COMBOS ?? 40);

  const pw = await import('@playwright/test');
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ko-KR' });
  const page = await context.newPage();

  const xhrLog: string[] = [];
  const subResponses: Array<{ key: string; url: string; data: string | null; body: string }> = [];
  page.on('request', (req) => {
    if (/Sub/i.test(req.url()) || (/\.do/.test(req.url()) && req.method() === 'POST')) {
      xhrLog.push(JSON.stringify({ at: new Date().toISOString(), url: req.url(), method: req.method(), data: req.postData() }));
    }
  });
  page.on('response', async (res) => {
    try {
      if (!/Sub/i.test(res.url())) return;
      const req = res.request();
      let body = '';
      try { body = await res.text(); } catch { return; }
      const key = sha256Hex(res.url() + '|' + (req.postData() ?? '')).slice(0, 16);
      subResponses.push({ key, url: res.url(), data: req.postData(), body });
    } catch { /* 무시 */ }
  });

  await page.goto(SEED_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const gbOptions = (await page.evaluate(
    `(() => {
      const s = document.querySelector('#gb_cd_top');
      return s ? Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() })) : [];
    })()`
  )) as Array<{ value: string; text: string }>;
  console.log(`[selector-walk] gb options=${gbOptions.length}`);

  let savedVariants = 0;
  let applied = 0;
  let lastSubCount = 0;

  for (const gb of gbOptions) {
    if (!gb.value) continue;

    // gb 선택 + change 이벤트
    await page.evaluate(
      `((v) => {
        const g = document.querySelector('#gb_cd_top');
        if (g) { g.value = v; g.dispatchEvent(new Event('change', { bubbles: true })); }
      })(${JSON.stringify(gb.value)})`
    );
    await page.waitForTimeout(2600);

    // ?섏쐞(gy) ?듭뀡 ?쎄린
    const gyOptions = (await page.evaluate(
      `(() => {
        const s = document.querySelector('#gy_cd_top');
        return s ? Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim })).filter(o => o.value) : [];
      })()`
    )) as Array<{ value: string; text: string }>;
    console.log(`  [gb=${gb.text || gb.value}] gy options=${gyOptions.length}`);

    for (const gy of gyOptions.slice(0, 12)) {
      if (applied >= maxCombos) break;
      try {
        await page.evaluate(
          `((gv, yv) => {
            const g = document.querySelector('#gb_cd_top');
            const y = document.querySelector('#gy_cd_top');
            if (g) g.value = gv;
            if (y && yv != null) y.value = yv;
          })(${JSON.stringify(gb.value)}, ${JSON.stringify(gy.value)})`
        );

        let clicked = false;
        for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
          await page.waitForTimeout(attempt === 0 ? 200 : 900);
          clicked = await page.evaluate(
            `(() => {
              const el =
                Array.from(document.querySelectorAll('#wrap a, #wrap button'))
                  .find(a => (a.textContent || '').trim() === '적용')
                || Array.from(document.querySelectorAll('a, button'))
                  .find(a => (a.textContent || '').trim() === '적용');
              if (el instanceof HTMLElement) { el.click(); return true; }
              return false;
            })()`
          );
        }
        if (!clicked) {
          console.log(`  ! [적용] 미발견(재시도 포함) — gb 순회 중단`);
          break;
        }
        applied++;
        const subBefore = subResponses.length;
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        await page.waitForTimeout(1500);

        // fncSubView AJAX 프래그먼트 저장(표 포함 여부 무관, 학습 자료)
        for (const r of subResponses.slice(lastSubCount)) {
          fs.mkdirSync(path.join(dirs.manifests, 'selector-fragments'), { recursive: true });
          const fragFile = path.join(dirs.manifests, 'selector-fragments', `${r.key}.html`);
          if (!fs.existsSync(fragFile)) {
            fs.writeFileSync(fragFile, `<!-- url: ${r.url}\n     data: ${r.data ?? ''} -->\n` + r.body, 'utf8');
          }
        }
        lastSubCount = subResponses.length;

        const html = await page.content();
        const tables = (html.match(/<table/g) ?? []).length;
        if (tables === 0) continue;

        const sha = sha256Hex(html);
        const label = `${gb.text || gb.value}/${gy.text || gy.value}`;
        const identity = `${SEED_URL}?scg_sel=${encodeURIComponent(label).slice(0, 90)}-${applied}`;

        const savedPath = contentPath(dirs.rawHtml, identity, sha);
        if (!fs.existsSync(savedPath)) {
          fs.mkdirSync(path.dirname(savedPath), { recursive: true });
          fs.writeFileSync(savedPath, html, 'utf8');
        }
        const upsert = store.upsertSourcePage({
          url: identity,
          seedName: '怨꾩빟諛⑸쾿 硫붿씤',
          kind: 'contract-category',
          title: `怨꾩빟諛⑸쾿 ??됲꽣 [${label}]`,
          contentSha256: sha,
          rawHtmlPath: savedPath,
          collectedAt: isoNow(),
          menuPath: ['怨꾩빟諛⑸쾿 硫붿씤', label]
        });
        void upsert;
        savedVariants++;
        console.log(`  + saved [${label}] tables=${tables}`);
      } catch (err) {
        console.log(`  - combo fail [${gb.text}/${gy.text}] ${String((err as Error).message).slice(0, 60)}`);
      }
    }
  }

  fs.writeFileSync(path.join(dirs.manifests, 'selector-xhr.jsonl'), xhrLog.join('\n') + '\n', 'utf8');
  console.log(`[selector-walk] done applied=${applied} savedVariants=${savedVariants} xhrLogged=${xhrLog.length} subResponses=${subResponses.length}`);
  // 프래그먼트 요약: 표 포함 프래그먼트 나열
  const withTables = subResponses.filter((r) => /<table/i.test(r.body));
  console.log(`[selector-walk] fragmentsWithTable=${withTables.length}`);
  for (const r of withTables.slice(0, 20)) {
    const data = (r.data ?? '').replace(/\s+/g, ' ').slice(0, 120);
    console.log(`  * ${r.key} body=${r.body.length}B data=${data}`);
  }
  await context.close();
  await browser.close();
}
