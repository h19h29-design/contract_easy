import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, ensureDirs } from '@sen/config';
import { runPreflight } from './preflight.js';
import { runCrawl, runBoardCrawl, computeDiff, writeCoverageReport } from './crawl.js';
import { crawlExternalFaq } from './external-faq.js';
import { collectAttachments } from './attachments.js';
import { walkSelector } from './selector-walk.js';
import { FileStore } from '@sen/db';

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'preflight';
  ensureDirs();

  switch (cmd) {
    case 'preflight': {
      const report = await runPreflight();
      writePreflightDoc(report);
      console.log(`[preflight] verdict=${report.verdict} seeds=${report.seeds.length} ok=${report.seeds.filter((s) => s.ok).length}`);
      for (const s of report.seeds) {
        console.log(`  - ${s.ok ? 'OK ' : 'ERR'} ${s.name}: ${s.status ?? s.errorCategory} body=${s.bodyTextLength ?? 0}`);
      }
      console.log('robots:', report.robots.summary);
      break;
    }
    case 'sample': {
      const summary = await runCrawl('sample');
      console.log(`[sample] fetched=${summary.pagesFetched} changed=${summary.pagesChanged} failures=${summary.failures.length}`);
      break;
    }
    case 'board': {
      process.env.CRAWLER_ENGINE = 'playwright'; // 동적 게시판은 브라우저 엔진 필수
      const summary = await runBoardCrawl();
      writeCoverageReport({ ...summary });
      console.log(`[board] fetched=${summary.pagesFetched} changed=${summary.pagesChanged} failures=${summary.failures.length}`);
      for (const [k, v] of Object.entries(summary.stopReasons)) console.log(`  - ${k}: ${v}`);
      break;
    }
    case 'attachments': {
      const results = await collectAttachments();
      const ok = results.filter((r) => r.status === 200);
      const byKind: Record<string, number> = {};
      for (const r of ok) byKind[r.kind!] = (byKind[r.kind!] ?? 0) + 1;
      console.log(`[attachments] downloaded=${ok.length} kinds=${JSON.stringify(byKind)} skipped=${results.length - ok.length}`);
      for (const r of results.filter((x) => x.status !== 200).slice(0, 10)) {
        console.log(`  - skip [${r.reason}] ${r.url}`);
      }
      break;
    }
    case 'selector': {
      process.env.CRAWLER_ENGINE = 'playwright';
      await walkSelector();
      break;
    }
    case 'faq-bbs': {
      // 외부 FAQ BBS(buseo.sen.go.kr) 수집 — allowlist는 seeds yaml(D-013)
      const summary = await crawlExternalFaq();
      for (const b of summary.boards) {
        console.log(`  - ${b.seedName}: articles=${b.articles} pages=${b.pages} stop=${b.stopReason ?? '-'} list=${b.listUrl}`);
      }
      console.log(`[faq-bbs] fetched=${summary.fetched} failures=${summary.failures.length}`);
      break;
    }
    case 'full': {
      const pfPath = path.join(REPO_ROOT, 'data', 'manifests', 'crawl-preflight.json');
      if (!fs.existsSync(pfPath)) {
        console.error('[full] BLOCKED: preflight 결과가 없습니다. 먼저 `pnpm crawl:preflight`를 실행하세요.');
        process.exit(1);
      }
      const pf = JSON.parse(fs.readFileSync(pfPath, 'utf8'));
      if (pf.verdict !== 'PASS') {
        console.error(`[full] BLOCKED: preflight verdict=${pf.verdict}. 전체 수집 조건 미충족.`);
        process.exit(1);
      }
      const s1 = await runCrawl('full');
      const s2 = await runBoardCrawl();
      writeCoverageReport({ ...s1, failures: [...s1.failures, ...s2.failures], mode: 'full+board' });
      console.log(`[full] fetched=${s1.pagesFetched + s2.pagesFetched} changed=${s1.pagesChanged + s2.pagesChanged} failures=${s1.failures.length + s2.failures.length}`);
      break;
    }
    case 'incremental': {
      const before = snapshotHashes();
      const summary = await runCrawl('incremental');
      const after = snapshotHashes();
      let changedCount = 0;
      for (const [url, sha] of after) {
        if (before.get(url) !== sha) { changedCount++; console.log(`  - changed: ${url}`); }
      }
      console.log(`[incremental] fetched=${summary.pagesFetched} changedUrls=${changedCount}`);
      break;
    }
    case 'diff': {
      const dirs = ensureDirs();
      const store = new FileStore(dirs.appStore);
      const diffs = computeDiff(store);
      console.log(`[diff] multi-version sources with changes: ${diffs.length}`);
      for (const d of diffs.slice(0, 20)) {
        console.log(`  v${d.fromVersion}->v${d.toVersion} +${d.addedChars}/-${d.removedChars} ${d.url}`);
      }
      break;
    }
    case 'coverage': {
      const md = writeCoverageReport();
      console.log(md.split('\n').slice(0, 8).join('\n'));
      break;
    }
    default:
      console.error('unknown command. use: preflight|sample|full|incremental|diff|coverage');
      process.exit(2);
  }
}

function snapshotHashes(): Map<string, string> {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const m = new Map<string, string>();
  for (const s of store.listSources()) {
    const last = s.versions[s.versions.length - 1];
    if (last) m.set(s.url, last.contentSha256);
  }
  return m;
}

function writePreflightDoc(report: Awaited<ReturnType<typeof runPreflight>>): void {
  const lines = [
    '# CRAWL_PREFLIGHT.md — 사전검증 결과',
    '',
    `- 생성시각: ${report.generatedAt}`,
    `- verdict: **${report.verdict}**`,
    `- robots: ${report.robots.summary}`,
    `- User-Agent: ${report.userAgent}`,
    '',
    '| seed | 상태 | HTTP | 제목 | 본문길이 | 내부링크 | 첨부 | JS필요 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const s of report.seeds) {
    lines.push(
      `| ${s.name} | ${s.ok ? 'OK' : 'ERR'} | ${s.status ?? '-'} | ${(s.title ?? '').slice(0, 30)} | ${s.bodyTextLength ?? '-'} | ${s.internalLinkCount ?? '-'} | ${s.attachmentCount ?? '-'} | ${s.jsRenderingRequired ? 'Y' : 'N'} |`
    );
  }
  lines.push('');
  lines.push('## 참고');
  for (const n of report.notes) lines.push(`- ${n}`);
  fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'harness', 'CRAWL_PREFLIGHT.md'), lines.join('\n') + '\n', 'utf8');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
