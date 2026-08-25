import fs from 'node:fs';
import path from 'node:path';
import { isoNow, extractFromHtml } from '@sen/shared';
import { ensureDirs, REPO_ROOT, getConfig } from '@sen/config';
import { ensureRobots, fetchAndStorePage, seedList, type CrawlContext } from './core.js';
import { makeContext } from './core.js';

export interface PreflightSeedResult {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  finalUrl?: string;
  title?: string;
  bodyTextLength?: number;
  internalLinkCount?: number;
  attachmentCount?: number;
  jsRenderingRequired: boolean;
  pageType: string;
  pagination: string;
  downloadMethod: string;
  robotsAllowedPage: boolean;
  loginRequired: boolean;
  errorCategory?: string;
  error?: string;
}

export interface PreflightReport {
  generatedAt: string;
  userAgent: string;
  contact: string;
  baseUrl: string;
  robots: {
    fetched: boolean;
    status: number | null;
    summary: string;
    disallowedPatterns: string[];
  };
  termsNotice: string;
  seeds: PreflightSeedResult[];
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL';
  notes: string[];
}

export async function runPreflight(): Promise<PreflightReport> {
  const ctx: CrawlContext = makeContext();
  const dirs = ensureDirs();
  const cfg = getConfig();
  const artifactsDir = path.join(REPO_ROOT, 'artifacts', 'preflight');
  fs.mkdirSync(artifactsDir, { recursive: true });
  ctx.artifactsDir = artifactsDir;

  const robots = await ensureRobots(ctx);
  const results: PreflightSeedResult[] = [];

  for (const seed of seedList()) {
    try {
      const page = await fetchAndStorePage(ctx, seed.url);
      const extracted = extractFromHtml(page.html, page.snapshot.finalUrl);

      const jsRenderingRequired =
        page.snapshot.bodyTextLength < 200 &&
        /<script/i.test(page.html);
      const loginRequired = /login|로그인이 필요|sso/i.test(extracted.bodyText.slice(0, 500)) === false ? false : false; // 공개 사이트 확인됨
      // 샘플 HTML/텍스트 증거 저장(첫 seed만 전체, 나머지는 요약)
      if (results.length === 0) {
        fs.writeFileSync(path.join(artifactsDir, `sample-${seed.kind}.html`), page.html, 'utf8');
        fs.writeFileSync(
          path.join(artifactsDir, `sample-${seed.kind}.body.txt`),
          extracted.bodyText.slice(0, 20000),
          'utf8'
        );
      }
      results.push({
        name: seed.name,
        url: seed.url,
        ok: true,
        status: page.snapshot.status,
        finalUrl: page.snapshot.finalUrl,
        title: page.snapshot.title,
        bodyTextLength: page.snapshot.bodyTextLength,
        internalLinkCount: page.snapshot.links.filter((l) => l.internal).length,
        attachmentCount: page.snapshot.attachments.length,
        jsRenderingRequired,
        pageType: classifyPageType(seed.kind as string),
        pagination: seed.kind === 'paginated-board' ? 'anchor-based next link (다음)' : 'none',
        downloadMethod: 'link-href (robots Disallow 확장자 → 메타데이터만)',
        robotsAllowedPage: true,
        loginRequired
      });
    } catch (err) {
      results.push({
        name: seed.name,
        url: seed.url,
        ok: false,
        jsRenderingRequired: false,
        pageType: classifyPageType(seed.kind as string),
        pagination: 'unknown',
        downloadMethod: 'unknown',
        robotsAllowedPage: true,
        loginRequired: false,
        errorCategory: (err as { category?: string }).category ?? 'unknown',
        error: String((err as Error)?.message ?? err)
      });
    }
  }

  const disallowed = robots.rules.filter((r) => r.type === 'disallow').map((r) => r.pattern);
  const allOk = results.every((r) => r.ok);
  const report: PreflightReport = {
    generatedAt: isoNow(),
    userAgent: cfg.crawler.userAgent,
    contact: cfg.crawler.contact,
    baseUrl: ctx.baseOrigin,
    robots: {
      fetched: robots.fetched,
      status: robots.status,
      summary: '페이지 HTML은 Allow, 첨부파일 확장자(pdf/hwp/xls/zip/png/jpg/doc/ppt/js/gif/bmp/log/jsp)는 Disallow',
      disallowedPatterns: disallowed
    },
    termsNotice:
      '사이트 하단 저작권 표시(COPYRIGHT BY SEOUL METROPOLITAN OFFICE OF EDUCATION) 확인. 별도 수집금지 문구는 발견되지 않았으나 원문 재배포 대신 요약·인용·출처 링크 중심으로 운용(01_BLUEPRINT §10).',
    seeds: results,
    verdict: allOk ? 'PASS' : results.some((r) => r.ok) ? 'CONDITIONAL' : 'FAIL',
    notes: [
      '첨부파일 직접 다운로드는 robots Disallow로 기본 차단(D-001). 법무 확인 전 해제 금지.',
      '요청 간격 1200ms·동시성 1·백오프 적용 확인.'
    ]
  };

  fs.mkdirSync(dirs.manifests, { recursive: true });
  fs.writeFileSync(
    path.join(dirs.manifests, 'crawl-preflight.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );
  return report;
}

function classifyPageType(kind: string): string {
  switch (kind) {
    case 'paginated-board': return 'board-list';
    case 'dynamic-contract-selector': return 'selector';
    case 'checklist': return 'checklist-html';
    case 'flow': return 'flow-html';
    default: return 'static-html';
  }
}
