import fs from 'node:fs';
import path from 'node:path';
import { ensureDirs, dataPaths } from '@sen/config';
import { FileStore } from '@sen/db';
import { htmlToNormalized, docToChunks, saveNormalizedMarkdown } from './normalize.js';
import { generateWiki } from './wiki.js';
import { extractRuleCandidates, candidatesToDraftRules, saveCandidates } from './rules-extract.js';
import { extractContractMethodDrafts } from './rule-tables.js';
import { syncDatabase } from './sync-db.js';
import { pdfFileToNormalized, listPdfFiles } from './pdf-attach.js';
import { extractZipAttachments } from './zip-extract.js';
import { listHwpTextDocs } from './hwp-txt.js';
import type { NormalizedDoc } from '@sen/shared';

interface DocEntry {
  doc: NormalizedDoc;
  versionId: string;
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'all';
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);

  const needsDocs = ['normalize', 'chunk', 'wiki', 'rules', 'all'].includes(cmd);
  if (needsDocs) {
    const zipReport = extractZipAttachments(dirs.rawAttachments);
    console.log(`[zip-extract] scanned=${zipReport.zipsScanned} extracted=${zipReport.membersExtracted} skipped=${zipReport.skippedMembers} bytes=${zipReport.bytesWritten}`);
  }
  const docs: DocEntry[] = [];

  if (needsDocs) {
    // 1) HTML 원문
    for (const src of store.listSources()) {
      const latest = src.versions[src.versions.length - 1];
      if (!latest?.rawHtmlPath || !fs.existsSync(latest.rawHtmlPath)) continue;
      const raw = fs.readFileSync(latest.rawHtmlPath, 'utf8');
      docs.push({
        doc: htmlToNormalized(latest.id, src.url, latest.title, latest.menuPath ?? [], latest.collectedAt, raw),
        versionId: latest.id
      });
    }
    // 2) PDF 첨부(텍스트 계열만; 실패/스캔은 경고 후 건너뜀)
    let pdfOk = 0;
    let pdfSkip = 0;
    for (const pdfPath of listPdfFiles(dirs.rawAttachments)) {
      const attDoc = await pdfFileToNormalized(pdfPath, { title: path.basename(pdfPath) });
      if (!attDoc) { pdfSkip++; continue; }
      docs.push({ doc: attDoc, versionId: attDoc.sourceVersionId });
      pdfOk++;
    }
    // 3) HWP(hwp5txt 변환본)
    let hwpOk = 0;
    for (const doc of listHwpTextDocs(path.join(dirs.rawAttachments, 'hwp-txt'))) {
      docs.push({ doc, versionId: doc.sourceVersionId });
      hwpOk++;
    }
    console.log(`[docs] html=${docs.length - pdfOk - hwpOk} pdfAttached=${pdfOk} pdfSkipped=${pdfSkip} hwpTxt=${hwpOk}`);
  }

  if (cmd === 'normalize' || cmd === 'all') {
    for (const { doc } of docs) saveNormalizedMarkdown(dirs.normalizedMarkdown, doc);
    console.log(`[normalize] normalized=${docs.length}`);
  }

  if (cmd === 'chunk' || cmd === 'all') {
    const chunks = docs.flatMap(({ doc }) => docToChunks(doc));
    store.replaceChunks(chunks);
    fs.writeFileSync(
      path.join(dataPaths().appStore, 'chunks.json'),
      JSON.stringify(chunks)
    );
    console.log(`[chunk] chunks=${chunks.length}`);
  }

  if (cmd === 'wiki' || cmd === 'all') {
    const wikiEntries = docs
      .filter(({ versionId }) => !versionId.startsWith('attdoc'))
      .map(({ doc, versionId }) => ({
        doc,
        version: store.getSource(versionId)?.versions.find((v) => v.id === versionId) ?? null
      }));
    const files = generateWiki(wikiEntries);
    console.log(`[wiki] generated=${files.length} → wiki/generated/`);
  }

  if (cmd === 'rules' || cmd === 'all') {
    const allChunks = store.getChunks();
    const cands = extractRuleCandidates(allChunks);
    const candidateDrafts = candidatesToDraftRules(cands);

    // 계약방법 표 → 구조화 초안(HTML 문서 대상)
    const tableDraftResult = extractContractMethodDrafts(docs.map((d) => d.doc));
    const allDrafts = [...candidateDrafts, ...tableDraftResult.drafts];

    const removed = store.purgeStaleCandidateDrafts(candidateDrafts.map((d) => d.id));
    for (const d of allDrafts) store.upsertRule(d);
    const file = saveCandidates(dataPaths().rulesCandidates, cands);
    console.log(`[rules] candidates=${cands.length} tableBands=${tableDraftResult.drafts.length} total=${allDrafts.length} staleRemoved=${removed} → ${file}`);
  }

  if (cmd === 'sync-db') {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('[sync-db] DATABASE_URL 환경변수가 필요합니다.');
      process.exit(1);
    }
    const { report } = await syncDatabase({ databaseUrl, appStoreDir: dataPaths().appStore });
    console.log(`[sync-db] ${JSON.stringify(report)}`);
  }

  if (cmd === 'index') {
    const p = `${dataPaths().appStore}/chunks.json`;
    const ok = fs.existsSync(p);
    console.log(`[index] chunks.json ${ok ? 'ready' : 'MISSING'} (keyword index built on demand)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
