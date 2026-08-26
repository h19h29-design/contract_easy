import fs from 'node:fs';
import path from 'node:path';
import { PoliteHttpClient } from './http.js';
import { ensureDirs } from '@sen/config';
import { FileStore, contentPath } from '@sen/db';
import { extractFromHtml, normalizeUrl, sha256Hex, isoNow } from '@sen/shared';

/**
 * 계약방법 카테고리 표 수집기(#3 완전 해제).
 * - 관측된 사실 기반: 내비게이션의 업종별 list0010v.do 링크(gb/gy 파라미터+라벨)를
 *   그대로 사용하며, 콘텐츠는 관측된 로딩 규칙(fncSubView_pre: gm_cd=C00, step=N)으로 조회.
 * - 라벨은 내비게이션 앵커 텍스트(원문 인용).
 */

interface CategoryTask {
  miPath: string;      // /fus/MI000000000000000485
  gb: string;          // A3
  gy: string;          // B15
  label: string;       // 건설공사
  listUrl: string;
}

export interface SelectorTablesSummary {
  categories: Array<{ label: string; steps: number; tables: number }>;
  fetched: number;
  savedVariants: number;
  failures: Array<{ url: string; message: string }>;
}

const MAX_STEP = Number(process.env.SELECTOR_MAX_STEP ?? 14);

export function discoverCategories(store: FileStore): CategoryTask[] {
  const out: CategoryTask[] = [];
  const seenGy = new Set<string>();
  for (const src of store.listSources()) {
    if (src.seedName !== '계약방법 메인') continue;
    const latest = src.versions[src.versions.length - 1];
    if (!latest?.rawHtmlPath || !fs.existsSync(latest.rawHtmlPath)) continue;
    const html = fs.readFileSync(latest.rawHtmlPath, 'utf8');
    const { links } = extractFromHtml(html, src.url);
    for (const l of links) {
      const m = l.url.match(/^(https:\/\/contract\.sen\.go\.kr\/fus\/(MI\d+)\/contract\/list0010v\.do)\?(.*)$/);
      if (!m || !l.text) continue;
      const q = new URLSearchParams(m[3]);
      const gb = q.get('gb') ?? '';
      const gy = q.get('gy') ?? '';
      if (!gb || !gy) continue;
      const key = `${gb}/${gy}`;
      if (seenGy.has(key)) continue;
      seenGy.add(key);
      out.push({
        miPath: new URL(m[1]).pathname,
        gb, gy,
        label: l.text.replace(/\s+/g, ' ').trim(),
        listUrl: normalizeUrl(l.url)
      });
    }
  }
  return out;
}

export async function crawlSelectorTables(): Promise<SelectorTablesSummary> {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const client = new PoliteHttpClient();

  // 대상은 '계약방법 메인'의 저장본에서 발견한 것만(정책·범위 명시)
  const tasks = discoverCategories(store);
  console.log(`[selector-tables] categories=${tasks.length}`);

  const summary: SelectorTablesSummary = {
    categories: [], fetched: 0, savedVariants: 0, failures: []
  };

  for (const task of tasks) {
    let stepsWithTables = 0;
    let emptyStreak = 0;

    for (let stepNum = 1; stepNum <= MAX_STEP; stepNum++) {
      const step = String(stepNum).padStart(2, '0');
      const url = `${task.listUrl.replace('list0010v.do', 'list0030v.do')}`
        .replace(/gb=[^&]+/, `gb_cd=${task.gb}`)
        .replace(/gy=[^&]+/, `gy_cd=${task.gy}`)
        .replace(/^([^?]*)\?(.*)$/, '$1?$2&gm_cd=C00&step=' + step)
        .replace('??', '?');

      try {
        const res = await client.get(url);
        summary.fetched++;
        if (res.status !== 200) break;
        const html = res.body.toString('utf8');
        const tables = (html.match(/<table/g) ?? []).length;
        const bodyLen = html.length;
        if (tables === 0 || bodyLen < 900) {
          emptyStreak++;
          if (emptyStreak >= 2) break;
          continue;
        }
        emptyStreak = 0;
        stepsWithTables++;

        const identity = normalizeUrl(
          `${task.miPath}/contract/list0030v.do?scg_step=${step}&gb_cd=${task.gb}&gy_cd=${task.gy}`
        );
        const sha = sha256Hex(html);
        const savedPath = contentPath(dirs.rawHtml, identity, sha);
        if (!fs.existsSync(savedPath)) {
          fs.mkdirSync(path.dirname(savedPath), { recursive: true });
          fs.writeFileSync(savedPath, html, 'utf8');
        }
        store.upsertSourcePage({
          url: identity,
          seedName: '계약방법 메인',
          kind: 'contract-category',
          title: `계약방법 [${task.label}] ${step}단계`,
          contentSha256: sha,
          rawHtmlPath: savedPath,
          collectedAt: isoNow(),
          menuPath: ['계약방법 메인', task.label, `${step}단계`]
        });
        summary.savedVariants++;
      } catch (err) {
        summary.failures.push({ url, message: String((err as Error).message).slice(0, 100) });
        break;
      }
    }
    summary.categories.push({ label: task.label, steps: stepsWithTables, tables: stepsWithTables * 2 });
    console.log(`  - ${task.label}: stepsWithTables=${stepsWithTables}`);
  }
  return summary;
}
