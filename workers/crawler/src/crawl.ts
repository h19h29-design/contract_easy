import fs from 'node:fs';
import path from 'node:path';
import { extractFromHtml, isoNow } from '@sen/shared';
import { ensureDirs, REPO_ROOT, getConfig } from '@sen/config';
import { FileStore } from '@sen/db';
import { BrowserRenderer } from './browser.js';
import {
  makeContext, ensureRobots, fetchAndStorePage, collectTargets, walkBoard,
  appendManifest, downloadAttachmentIfAllowed, seedList,
  DETAIL_HINTS
} from './core.js';
import type { PreflightReport } from './preflight.js';

export async function makeRendererIfConfigured(screenshotDir?: string): Promise<BrowserRenderer | null> {
  const cfg = getConfig();
  if (cfg.crawler.engine !== 'playwright') return null;
  return new BrowserRenderer({
    delayMs: cfg.crawler.delayMs,
    userAgent: cfg.crawler.userAgent,
    screenshotDir
  });
}

export interface CrawlSummary {
  mode: string;
  startedAt: string;
  finishedAt: string;
  pagesFetched: number;
  pagesChanged: number;
  attachmentsSeen: number;
  attachmentsDownloaded: number;
  failures: Array<{ url: string; category: string; message: string }>;
  stopReasons: Record<string, number>;
}

export async function runCrawl(mode: 'sample' | 'full' | 'incremental'): Promise<CrawlSummary> {
  const ctx = makeContext();
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  await ensureRobots(ctx);
  const renderer = await makeRendererIfConfigured(path.join(REPO_ROOT, 'artifacts', 'samples'));

  const summary: CrawlSummary = {
    mode, startedAt: isoNow(), finishedAt: '',
    pagesFetched: 0, pagesChanged: 0, attachmentsSeen: 0, attachmentsDownloaded: 0,
    failures: [], stopReasons: {}
  };
  const runRec = store.startCrawlRun(mode);
  appendManifest(dirs.manifests, 'crawl-runs.jsonl', { at: isoNow(), event: 'start', mode });

  const seeds = seedList();
  const queue: Array<{ url: string; seedName: string | null; depth: number }> = [];
  const visited = new Set<string>();
  const maxDepthFull = 3;
  const maxPagesTotal = mode === 'sample' ? 1 : 400;

  for (const s of seeds) queue.push({ url: normalize(s.url), seedName: s.name, depth: 0 });

  while (queue.length > 0 && summary.pagesFetched < maxPagesTotal) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    try {
      const page = await fetchAndStorePage(ctx, item.url, { renderer: renderer ?? undefined });
      summary.pagesFetched++;
      const upsert = store.upsertSourcePage({
        url: page.snapshot.finalUrl,
        seedName: item.seedName,
        kind: classifySeedKind(item.seedName),
        title: page.snapshot.title || '(제목없음)',
        contentSha256: page.snapshot.sha256,
        rawHtmlPath: page.savedPath ?? undefined,
        collectedAt: page.snapshot.fetchedAt
      });
      if (upsert.changed) summary.pagesChanged++;

      // 첨부 메타데이터 기록(다운로드는 robots 정책에 따름)
      summary.attachmentsSeen += page.snapshot.attachments.length;
      store.markSourceAttachments(upsert.sourceId, page.snapshot.attachments);
      for (const att of page.snapshot.attachments.slice(0, 3)) {
        const dl = await downloadAttachmentIfAllowed(ctx, att.url);
        if (dl.ok) {
          summary.attachmentsDownloaded++;
          att.sha256 = dl.sha256; att.sizeBytes = dl.sizeBytes;
          att.mimeType = dl.mimeType; att.savedPath = dl.savedPath;
        }
        appendManifest(dirs.manifests, 'files.jsonl', {
          at: isoNow(), url: att.url, ext: att.ext, robotsDisallowed: att.robotsDisallowed,
          downloaded: dl.ok, reason: dl.reason, sha256: dl.sha256
        });
      }

      appendManifest(dirs.manifests, 'pages.jsonl', {
        at: page.snapshot.fetchedAt,
        url: page.snapshot.finalUrl,
        status: page.snapshot.status,
        title: page.snapshot.title,
        sha256: page.snapshot.sha256,
        versionId: upsert.versionId,
        changed: upsert.changed,
        duplicateContent: page.duplicateContent,
        savedPath: page.savedPath,
        linkCount: page.snapshot.links.length,
        attachmentCount: page.snapshot.attachments.length
      });

      // 링크 확장(sample 모드는 확장 없음)
      if (mode !== 'sample') {
        const targets = collectTargets(ctx, page.snapshot);
        const nextDepth = item.depth + 1;
        const isBoardList = /list0010v\.do/.test(item.url);
        if (isBoardList && targets.nextPageUrl && mode === 'full') {
          // pagination은 walkBoard로 처리(아래), 여기서는 상세만 큐
        }
        for (const d of targets.detailUrls) {
          if (!visited.has(d) && (mode === 'full' ? nextDepth <= maxDepthFull : false)) {
            queue.push({ url: d, seedName: item.seedName, depth: nextDepth });
          }
        }
      }
    } catch (err) {
      const category = String((err as { category?: string }).category ?? 'unknown');
      summary.failures.push({ url: item.url, category, message: String((err as Error).message) });
      appendManifest(dirs.manifests, 'crawl-failures.jsonl', { at: isoNow(), url: item.url, category, message: String((err as Error).message) });
      if (summary.failures.filter((f) => f.category === category).length >= 5) break; // 반복 오류 중단
    }
  }

  await renderer?.close();
  summary.finishedAt = isoNow();
  store.finishCrawlRun(runRec.id, {
    status: 'done',
    pagesFetched: summary.pagesFetched,
    pagesChanged: summary.pagesChanged,
    attachmentsFetched: summary.attachmentsDownloaded,
    failures: summary.failures.length
  });
  appendManifest(dirs.manifests, 'crawl-runs.jsonl', { at: isoNow(), event: 'end', ...summary });
  return summary;
}

/** 게시판 전용 탐색: pagination 종료조건 검증 + 상세 수집 */
export async function runBoardCrawl(): Promise<CrawlSummary> {
  const ctx = makeContext();
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  await ensureRobots(ctx);
  const renderer = await makeRendererIfConfigured(path.join(REPO_ROOT, 'artifacts', 'preflight'));
  const summary: CrawlSummary = {
    mode: 'board', startedAt: isoNow(), finishedAt: '',
    pagesFetched: 0, pagesChanged: 0, attachmentsSeen: 0, attachmentsDownloaded: 0,
    failures: [], stopReasons: {}
  };
  const boardSeeds = seedList().filter((s) => s.kind === 'paginated-board');
  for (const seed of boardSeeds) {
    // 첫 페이지를 렌더링하여 동적 링크(fncDetailView/fncSearch) 해석
    const dynamicDetails = new Set<string>();
    const paginationUrls = new Set<string>();
    if (renderer) {
      try {
        const first = await fetchAndStorePage(ctx, seed.url, { renderer });
        summary.pagesFetched++;
        const upsertFirst = store.upsertSourcePage({
          url: first.snapshot.finalUrl, seedName: seed.name, kind: 'paginated-board',
          title: first.snapshot.title || seed.name, contentSha256: first.snapshot.sha256,
          collectedAt: first.snapshot.fetchedAt, menuPath: [seed.name]
        });
        if (upsertFirst.changed) summary.pagesChanged++;
        appendManifest(dirs.manifests, 'pages.jsonl', {
          at: first.snapshot.fetchedAt, url: first.snapshot.finalUrl, status: first.snapshot.status,
          title: first.snapshot.title, sha256: first.snapshot.sha256, versionId: upsertFirst.versionId,
          changed: upsertFirst.changed, page: 1
        });

        const detailCalls = [...first.html.matchAll(/fncDetailView\((\d+)|fncDetailView\('(\d+)'/g)]
          .map((m) => m[1] ?? m[2])
          .filter((v): v is string => Boolean(v));
        const pageIdxCalls = [...first.html.matchAll(/fncSearch\((\d+)/g)]
          .map((m) => m[1]!)
          .filter((n) => n !== '1');

        // 상세 URL 템플릿 해석: 첫 호출을 실제 클릭해 도착 URL 확인
        if (detailCalls.length > 0) {
          const sampleId = detailCalls[0]!;
          const clicked = await renderer.resolveClickUrl(seed.url, `fncDetailView(${sampleId}`);
          if (clicked && clicked.includes(sampleId)) {
            for (const id of detailCalls.slice(0, 49)) {
              dynamicDetails.add(clicked.split(sampleId).join(id));
            }
          }
        }
        // pagination URL 템플릿 해석
        if (pageIdxCalls.length > 0) {
          const pgId = pageIdxCalls[0]!;
          const clickedPg = await renderer.resolveClickUrl(seed.url, `fncSearch(${pgId}`);
          if (clickedPg && clickedPg.includes(pgId)) {
            for (const n of pageIdxCalls.slice(0, 9)) {
              paginationUrls.add(clickedPg.split(pgId).join(n));
            }
          }
        }
      } catch (err) {
        summary.failures.push({ url: seed.url, category: String((err as { category?: string }).category ?? 'unknown'), message: String((err as Error).message) });
      }
    }

    // 목록/pagination 페이지 수집
    const listPages = new Set<string>([seed.url, ...paginationUrls]);
    for (const listUrl of listPages) {
      const walk = await walkBoard(ctx, listUrl, renderer ? 10 : 30, renderer, async (snapshot, idx) => {
        summary.pagesFetched++;
        const upsert = store.upsertSourcePage({
          url: snapshot.finalUrl, seedName: seed.name, kind: 'paginated-board',
          title: `${snapshot.title || seed.name} (${idx + 1}p)`, contentSha256: snapshot.sha256,
          collectedAt: snapshot.fetchedAt, menuPath: [seed.name]
        });
        if (upsert.changed) summary.pagesChanged++;
        appendManifest(dirs.manifests, 'pages.jsonl', {
          at: snapshot.fetchedAt, url: snapshot.finalUrl, status: snapshot.status,
          title: snapshot.title, sha256: snapshot.sha256, versionId: upsert.versionId,
          changed: upsert.changed, page: idx + 1
        });
      });
      summary.stopReasons[`${seed.name}:${walk.stopReason}`] = walk.pagesVisited;
      for (const d of walk.detailUrls) dynamicDetails.add(d);
    }

    // 상세페이지 수집: 브라우저 엔진이면 더 많이(공지·FAQ 전문 확보), HTTP면 샘플만
    const detailLimit = renderer ? 50 : 5;
    let count = 0;
    for (const detailUrl of dynamicDetails) {
      if (count >= detailLimit) break;
      if (!DETAIL_HINTS.test(detailUrl) && !/\d{3,}/.test(detailUrl)) continue;
      try {
        const page = await fetchAndStorePage(ctx, detailUrl, { renderer: renderer ?? undefined });
        summary.pagesFetched++;
        const upsert = store.upsertSourcePage({
          url: page.snapshot.finalUrl, seedName: seed.name, kind: 'board-detail',
          title: page.snapshot.title || '(게시물)', contentSha256: page.snapshot.sha256,
          collectedAt: page.snapshot.fetchedAt, menuPath: [seed.name]
        });
        if (upsert.changed) summary.pagesChanged++;
        store.markSourceAttachments(upsert.sourceId, page.snapshot.attachments);
        appendManifest(dirs.manifests, 'pages.jsonl', {
          at: page.snapshot.fetchedAt, url: page.snapshot.finalUrl, status: page.snapshot.status,
          title: page.snapshot.title, sha256: page.snapshot.sha256, versionId: upsert.versionId,
          changed: upsert.changed, attachmentCount: page.snapshot.attachments.length
        });
        count++;
      } catch (err) {
        summary.failures.push({ url: detailUrl, category: String((err as { category?: string }).category ?? 'unknown'), message: String((err as Error).message) });
      }
    }
  }
  await renderer?.close();
  summary.finishedAt = isoNow();
  return summary;
}

export interface DiffEntry {
  url: string;
  fromVersion: number;
  toVersion: number;
  titleFrom: string;
  titleTo: string;
  addedChars: number;
  removedChars: number;
}

export function computeDiff(store: FileStore): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const src of store.listSources()) {
    if (src.versions.length < 2) continue;
    const sorted = [...src.versions].sort((a, b) => a.versionIndex - b.versionIndex);
    const prev = sorted[sorted.length - 2]!;
    const cur = sorted[sorted.length - 1]!;
    const readText = (p?: string): string => {
      if (!p || !fs.existsSync(p)) return '';
      return extractFromHtml(fs.readFileSync(p, 'utf8'), src.url).bodyText;
    };
    const a = readText(prev.rawHtmlPath);
    const b = readText(cur.rawHtmlPath);
    out.push({
      url: src.url,
      fromVersion: prev.versionIndex,
      toVersion: cur.versionIndex,
      titleFrom: prev.title,
      titleTo: cur.title,
      addedChars: lcsAdded(a, b),
      removedChars: Math.max(0, a.length - commonLength(a, b))
    });
  }
  return out;
}

function commonLength(a: string, b: string): number {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return i;
}
function lcsAdded(a: string, b: string): number {
  void a;
  return Math.max(0, b.length - commonLength(b, a));
}

export function writeCoverageReport(summary?: CrawlSummary): string {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const sources = store.listSources();
  const totalVersions = sources.reduce((n, s) => n + s.versions.length, 0);
  const attachments = sources.reduce((n, s) => n + s.attachments.length, 0);
  let preflight: PreflightReport | null = null;
  const pfPath = path.join(dirs.manifests, 'crawl-preflight.json');
  if (fs.existsSync(pfPath)) preflight = JSON.parse(fs.readFileSync(pfPath, 'utf8'));

  const lines: string[] = [];
  lines.push('# CRAWL_COVERAGE.md — 수집 범위 실측 보고');
  lines.push('');
  lines.push(`- 생성시각: ${isoNow()}`);
  lines.push(`- 발견 페이지(source) 수: **${sources.length}**`);
  lines.push(`- 총 버전 수: ${totalVersions}`);
  lines.push(`- 첨부파일(메타) 수: ${attachments}`);
  if (summary) {
    lines.push(`- 마지막 실행(${summary.mode}): fetched=${summary.pagesFetched}, changed=${summary.pagesChanged}, failures=${summary.failures.length}`);
    for (const f of summary.failures.slice(0, 10)) lines.push(`  - 실패 [${f.category}] ${f.url}: ${f.message}`);
  }
  lines.push('');
  lines.push('| seed/URL | 제목 | 버전 | 첨부 | 상태 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const s of sources.slice(0, 100)) {
    const last = s.versions[s.versions.length - 1];
    lines.push(`| ${s.url.slice(0, 80)} | ${(last?.title ?? '').slice(0, 40)} | ${s.versions.length} | ${s.attachments.length} | ${s.status} |`);
  }
  if (preflight) {
    lines.push('');
    lines.push('## Preflight 요약');
    lines.push(`- verdict: ${preflight.verdict}`);
    lines.push(`- robots: ${preflight.robots.summary}`);
  }
  const md = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'harness', 'CRAWL_COVERAGE.md'), md, 'utf8');
  const versionsDir = path.join(dirs.manifests, 'versions');
  fs.mkdirSync(versionsDir, { recursive: true });
  fs.writeFileSync(path.join(versionsDir, 'latest-sources.json'), JSON.stringify({
    generatedAt: isoNow(),
    sources: sources.map((s) => ({ id: s.id, url: s.url, versions: s.versions.length, latestSha: s.versions.at(-1)?.contentSha256 }))
  }, null, 2));
  return md;
}


function classifySeedKind(seedName: string | null): string {
  const seeds = seedList();
  const found = seeds.find((s) => s.name === seedName);
  return found?.kind ?? 'other';
}

function normalize(u: string): string {
  return u;
}

