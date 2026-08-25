import fs from 'node:fs';
import path from 'node:path';
import {
  extractFromHtml, sha256Hex, normalizeUrl, isAllowedByPolicy, robotsAllows,
  isoNow, stableId, safeFileName,
  type RobotsRule, type PageSnapshot
} from '@sen/shared';
import { ensureDirs, loadSeeds, getConfig } from '@sen/config';
import { PoliteHttpClient, classifyError } from './http.js';
import { fetchRobots, type RobotsInfo } from './robots.js';

export interface SeedDef { name: string; url: string; kind: string }

export interface CrawlContext {
  client: PoliteHttpClient;
  robots: RobotsInfo;
  baseOrigin: string;
  allowDomains: string[];
  allowPathPrefixes: string[];
  denyQueryKeys: string[];
  downloadExtensions: string[];
  manifestsDir: string;
  rawHtmlDir: string;
  attachmentsDir: string;
  artifactsDir: string | null;
}

export function makeContext(): CrawlContext {
  const seeds = loadSeeds();
  const dirs = ensureDirs();
  return {
    client: new PoliteHttpClient(),
    robots: { fetched: false, status: null, rules: [], raw: null },
    baseOrigin: seeds.base_url,
    allowDomains: seeds.follow_rules.allow_domains,
    allowPathPrefixes: seeds.follow_rules.allow_path_prefixes,
    denyQueryKeys: seeds.follow_rules.deny_query_keys,
    downloadExtensions: seeds.follow_rules.download_extensions,
    manifestsDir: dirs.manifests,
    rawHtmlDir: dirs.rawHtml,
    attachmentsDir: dirs.rawAttachments,
    artifactsDir: null
  };
}

export async function ensureRobots(ctx: CrawlContext): Promise<RobotsInfo> {
  if (!ctx.robots.fetched) ctx.robots = await fetchRobots(ctx.baseOrigin, ctx.client);
  return ctx.robots;
}

export interface FetchedPage {
  snapshot: PageSnapshot;
  html: string;
  savedPath: string | null;
  duplicateContent: boolean; // 동일 해시가 이미 저장된 경우(재수집 중복 방지)
}

export const DETAIL_HINTS = /(seq|no|id|articleNo|boardSeq|scrtSeq|nttNo)=/i;
export const NEXT_PAGE_TEXT = /다음|next|>|»/i;

/** 단일 페이지 수집: 저장(content-addressed), 스냅샷 생성 */
export async function fetchAndStorePage(
  ctx: CrawlContext,
  url: string,
  opts: { saveRaw?: boolean; menuPath?: string[] } = {}
): Promise<FetchedPage> {
  const res = await ctx.client.get(url);
  if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status}`), { category: `http_${res.status}` });
  const html = res.body.toString('utf8');
  const sha = sha256Hex(html);
  const extracted = extractFromHtml(html, res.url);

  let savedPath: string | null = null;
  let duplicateContent = false;
  if (opts.saveRaw !== false) {
    const sub = path.join(ctx.rawHtmlDir, sha.slice(0, 2));
    fs.mkdirSync(sub, { recursive: true });
    const fname = `${stableId('page', res.url)}-${sha.slice(0, 12)}.html`;
    savedPath = path.join(sub, fname);
    if (fs.existsSync(savedPath)) duplicateContent = true; // 불변 원본 재기록 금지
    else fs.writeFileSync(savedPath, html, 'utf8');
  }

  const snapshot: PageSnapshot = {
    url: normalizeUrl(url),
    finalUrl: normalizeUrl(res.url),
    status: res.status,
    title: extracted.title,
    htmlLength: html.length,
    bodyTextLength: extracted.bodyText.length,
    links: extracted.links,
    attachments: extracted.attachments,
    fetchedAt: isoNow(),
    sha256: sha,
    headers: { 'content-type': res.headers['content-type'] ?? '' }
  };
  return { snapshot, html, savedPath, duplicateContent };
}

/** 페이지에서 수집 대상 내부 링크 추출 */
export function collectTargets(
  ctx: CrawlContext,
  snapshot: PageSnapshot
): { detailUrls: Set<string>; nextPageUrl: string | null; externalLinks: Array<{ url: string; text: string }> } {
  const detailUrls = new Set<string>();
  let nextPageUrl: string | null = null;
  const externalLinks: Array<{ url: string; text: string }> = [];

  for (const link of snapshot.links) {
    if (!isAllowedByPolicy(link.url, ctx)) {
      if (!link.internal) externalLinks.push({ url: link.url, text: link.text });
      continue;
    }
    if (DETAIL_HINTS.test(link.url) && link.text && !/^목록$/.test(link.text)) {
      detailUrls.add(link.url);
    }
    if (!nextPageUrl && NEXT_PAGE_TEXT.test(link.text)) {
      nextPageUrl = link.url;
    }
  }
  return { detailUrls, nextPageUrl, externalLinks };
}

/** 게시판 pagination 탐색(종료조건 4종 포함) */
export async function walkBoard(
  ctx: CrawlContext,
  listUrl: string,
  maxPages = 30,
  onPage?: (snapshot: PageSnapshot, pageIdx: number) => Promise<void> | void
): Promise<{ pagesVisited: number; detailUrls: Set<string>; stopReason: string }> {
  const visited = new Set<string>();
  const allDetails = new Set<string>();
  let current: string | null = normalizeUrl(listUrl);
  let idx = 0;
  let lastBodySig: string | null = null;

  while (current && idx < maxPages) {
    if (visited.has(current)) return { pagesVisited: idx, detailUrls: allDetails, stopReason: 'url_repeat' };
    visited.add(current);

    let page: FetchedPage;
    try {
      page = await fetchAndStorePage(ctx, current);
    } catch (err) {
      return { pagesVisited: idx, detailUrls: allDetails, stopReason: `fetch_error:${classifyError(err)}` };
    }
    const bodyText = extractFromHtml(page.html, page.snapshot.finalUrl).bodyText.slice(0, 2000);
    if (lastBodySig === sha256Hex(bodyText)) {
      return { pagesVisited: idx + 1, detailUrls: allDetails, stopReason: 'content_repeat' };
    }
    lastBodySig = sha256Hex(bodyText);

    await onPage?.(page.snapshot, idx);
    const targets = collectTargets(ctx, page.snapshot);
    for (const d of targets.detailUrls) allDetails.add(d);

    current = targets.nextPageUrl ? normalizeUrl(targets.nextPageUrl) : null;
    idx++;
  }
  if (idx >= maxPages) return { pagesVisited: idx, detailUrls: allDetails, stopReason: 'max_pages' };
  return { pagesVisited: idx, detailUrls: allDetails, stopReason: 'no_next_page' };
}

export function isAttachmentDownloadAllowed(ctx: CrawlContext, ext: string, rules: RobotsRule[], pathnameWithQuery: string): boolean {
  const cfg = getConfig().crawler;
  if (!cfg.allowAttachments) return false;
  if (!ctx.downloadExtensions.includes(ext)) return false;
  return robotsAllows(pathnameWithQuery, rules);
}

export async function downloadAttachmentIfAllowed(
  ctx: CrawlContext,
  attUrl: string
): Promise<{ ok: boolean; reason?: string; sha256?: string; sizeBytes?: number; mimeType?: string; savedPath?: string }> {
  const u = new URL(attUrl);
  const ext = (u.pathname.split('.').pop() ?? '').toLowerCase();
  if (!isAttachmentDownloadAllowed(ctx, ext, ctx.robots.rules, u.pathname + u.search)) {
    return { ok: false, reason: 'robots_disallowed_or_disabled' };
  }
  try {
    const res = await ctx.client.get(attUrl);
    if (res.status !== 200) return { ok: false, reason: `http_${res.status}` };
    const mime = res.headers['content-type'] ?? '';
    // 확장자+MIME 이중 검증
    const mimeOk =
      mime.startsWith('application/pdf') || mime.includes('officedocument') ||
      mime.includes('msword') || mime.includes('excel') || mime.includes('hwp') ||
      mime.startsWith('application/zip') || mime.startsWith('image/') ||
      mime.includes('octet-stream');
    if (!mimeOk) return { ok: false, reason: `mime_rejected:${mime}` };
    const buf = res.body;
    const sha = sha256Hex(buf);
    const sub = path.join(ctx.attachmentsDir, sha.slice(0, 2));
    fs.mkdirSync(sub, { recursive: true });
    const saved = path.join(sub, `${sha.slice(0, 16)}-${safeFileName(decodeURIComponent(u.pathname.split('/').pop() ?? 'file'))}`);
    if (!fs.existsSync(saved)) fs.writeFileSync(saved, buf); // 불변 보관, 덮어쓰기 없음
    return { ok: true, sha256: sha, sizeBytes: buf.length, mimeType: mime, savedPath: saved };
  } catch (err) {
    return { ok: false, reason: classifyError(err) };
  }
}

export function appendManifest(manifestsDir: string, name: string, obj: unknown): void {
  fs.mkdirSync(manifestsDir, { recursive: true });
  fs.appendFileSync(path.join(manifestsDir, name), JSON.stringify(obj) + '\n', 'utf8');
}

export function seedList(): SeedDef[] {
  return loadSeeds().seeds as SeedDef[];
}
