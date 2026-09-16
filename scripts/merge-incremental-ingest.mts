import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '@sen/db';
import { ensureDirs, dataPaths } from '@sen/config';
import { htmlToNormalized, docToChunks, saveNormalizedMarkdown } from '../workers/ingest/src/normalize.js';
import { extractRuleCandidates, candidatesToDraftRules, saveCandidates } from '../workers/ingest/src/rules-extract.js';
import { extractContractMethodDrafts } from '../workers/ingest/src/rule-tables.js';
import type { Chunk, NormalizedDoc } from '@sen/shared';

/**
 * 증분 병합 인제스트 — ingest:all은 raw 파일이 없는 source의 청크를 통째로 버린다.
 * 이 스크립트는 (1) 로컬에 최신 raw가 있는 source만 재청크하고
 * (2) 기준 청크 파일(기본: NAS에서 내려받은 전체 인덱스)에서 해당 source의 구 청크를
 *     URL 기준으로 교체해 전체 인덱스를 보존한다.
 * 사용: pnpm exec tsx scripts/merge-incremental-ingest.mts [기준 chunks.json 경로]
 */
function main(): void {
  const baseFile = process.argv[2] ?? path.resolve('data/app-store/chunks.json');
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);

  // 1) 최신 버전의 rawHtmlPath가 실제 존재하는 source만 재처리 대상
  const updated = store.listSources().filter((s) => {
    const latest = s.versions[s.versions.length - 1];
    return Boolean(latest?.rawHtmlPath && fs.existsSync(latest.rawHtmlPath));
  });
  const updatedUrls = new Set(updated.map((s) => s.url));
  console.log(`[merge] re-chunk sources=${updated.length}`);

  const docs: NormalizedDoc[] = [];
  const newChunks: Chunk[] = [];
  for (const src of updated) {
    const latest = src.versions[src.versions.length - 1]!;
    const raw = fs.readFileSync(latest.rawHtmlPath!, 'utf8');
    const doc = htmlToNormalized(latest.id, src.url, latest.title, latest.menuPath ?? [], latest.collectedAt, raw);
    docs.push(doc);
    saveNormalizedMarkdown(dirs.normalizedMarkdown, doc);
    newChunks.push(...docToChunks(doc));
  }

  // 2) 기준 인덱스에서 갱신 source의 구 청크를 제거하고 새 청크를 붙임
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8')) as Chunk[];
  const kept = base.filter((c) => !updatedUrls.has(c.url));
  const merged = [...kept, ...newChunks];
  console.log(`[merge] base=${base.length} removed=${base.length - kept.length} added=${newChunks.length} merged=${merged.length}`);

  store.replaceChunks(merged);
  fs.writeFileSync(path.join(dataPaths().appStore, 'chunks.json'), JSON.stringify(merged));

  // 3) 규칙 후보 재생성(결정적 ID) — 병합된 전체 청크 기준
  const cands = extractRuleCandidates(merged);
  const candidateDrafts = candidatesToDraftRules(cands);
  const tableDraftResult = extractContractMethodDrafts(docs);
  const removed = store.purgeStaleCandidateDrafts(candidateDrafts.map((d) => d.id));
  for (const d of [...candidateDrafts, ...tableDraftResult.drafts]) store.upsertRule(d);
  const candFile = saveCandidates(dataPaths().rulesCandidates, cands);
  console.log(`[rules] candidates=${cands.length} tableBands=${tableDraftResult.drafts.length} staleRemoved=${removed} → ${candFile}`);

  // 4) 공개 sources 목록 재생성(rawHtmlPath 제거)
  const pub = store.listSources().map((s) => ({
    id: s.id, url: s.url, seedName: s.seedName, kind: s.kind,
    firstSeenAt: s.firstSeenAt, lastCheckedAt: s.lastCheckedAt, status: s.status,
    versions: s.versions.map(({ rawHtmlPath: _omit, ...v }) => v)
  }));
  fs.writeFileSync(path.join(dataPaths().appStore, 'sources-public.json'), JSON.stringify(pub, null, 1));
  console.log(`[sources-public] ${pub.length} sources`);
}

main();
