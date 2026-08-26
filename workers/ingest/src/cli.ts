import fs from 'node:fs';
import path from 'node:path';
import { ensureDirs, dataPaths } from '@sen/config';
import { FileStore } from '@sen/db';
import { htmlToNormalized, docToChunks, saveNormalizedMarkdown } from './normalize.js';
import { generateWiki } from './wiki.js';
import { extractRuleCandidates, candidatesToDraftRules, saveCandidates } from './rules-extract.js';
import { extractContractMethodDrafts } from './rule-tables.js';

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'all';
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);

  if (cmd === 'normalize' || cmd === 'all') {
    let n = 0;
    const docs = [];
    for (const src of store.listSources()) {
      const latest = src.versions[src.versions.length - 1];
      if (!latest?.rawHtmlPath || !fs.existsSync(latest.rawHtmlPath)) continue;
      const raw = fs.readFileSync(latest.rawHtmlPath, 'utf8');
      const doc = htmlToNormalized(latest.id, src.url, latest.title, latest.menuPath ?? [], latest.collectedAt, raw);
      saveNormalizedMarkdown(dirs.normalizedMarkdown, doc);
      docs.push({ doc, version: latest });
      n++;
    }
    console.log(`[normalize] normalized=${n}`);
    (store as unknown as { __docs?: unknown }).__docs = docs;
  }

  if (cmd === 'chunk' || cmd === 'all') {
    const chunks = [];
    for (const src of store.listSources()) {
      const latest = src.versions[src.versions.length - 1];
      if (!latest?.rawHtmlPath || !fs.existsSync(latest.rawHtmlPath)) continue;
      const raw = fs.readFileSync(latest.rawHtmlPath, 'utf8');
      const doc = htmlToNormalized(latest.id, src.url, latest.title, latest.menuPath ?? [], latest.collectedAt, raw);
      chunks.push(...docToChunks(doc));
    }
    store.replaceChunks(chunks);
    fs.writeFileSync(
      path.join(dataPaths().appStore, 'chunks.json'),
      JSON.stringify(chunks)
    );
    console.log(`[chunk] chunks=${chunks.length}`);
  }

  if (cmd === 'wiki' || cmd === 'all') {
    const docs = [];
    for (const src of store.listSources()) {
      const latest = src.versions[src.versions.length - 1];
      if (!latest?.rawHtmlPath || !fs.existsSync(latest.rawHtmlPath)) continue;
      const raw = fs.readFileSync(latest.rawHtmlPath, 'utf8');
      docs.push({
        doc: htmlToNormalized(latest.id, src.url, latest.title, latest.menuPath ?? [], latest.collectedAt, raw),
        version: latest
      });
    }
    const files = generateWiki(docs);
    console.log(`[wiki] generated=${files.length} → wiki/generated/`);
  }

  if (cmd === 'rules' || cmd === 'all') {
    const allChunks = store.getChunks();
    const cands = extractRuleCandidates(allChunks);
    const candidateDrafts = candidatesToDraftRules(cands);

    // 계약방법 표 → 구조화 초안(원문 인용값, 항상 draft)
    const docs = [];
    for (const src of store.listSources()) {
      const latest = src.versions[src.versions.length - 1];
      if (!latest?.rawHtmlPath || !fs.existsSync(latest.rawHtmlPath)) continue;
      const raw = fs.readFileSync(latest.rawHtmlPath, 'utf8');
      docs.push(htmlToNormalized(latest.id, src.url, latest.title, latest.menuPath ?? [], latest.collectedAt, raw));
    }
    const { drafts: tableDrafts } = extractContractMethodDrafts(docs);
    const allDrafts = [...candidateDrafts, ...tableDrafts];

    // 이번 배치에 없는 오래된 candidate 초안만 정리(reviewed/active는 보존)
    const removed = store.purgeStaleCandidateDrafts(candidateDrafts.map((d) => d.id));
    for (const d of allDrafts) store.upsertRule(d);
    const file = saveCandidates(dataPaths().rulesCandidates, cands);
    console.log(`[rules] candidates=${cands.length} tableBands=${tableDrafts.length} total=${allDrafts.length} staleRemoved=${removed} → ${file}`);
  }

  if (cmd === 'index') {
    // 키워드 인덱스는 retrieval가 chunks.json에서 즉석 구성(외부 인프라 불필요).
    const p = `${dataPaths().appStore}/chunks.json`;
    const ok = fs.existsSync(p);
    console.log(`[index] chunks.json ${ok ? 'ready' : 'MISSING'} (keyword index built on demand)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
