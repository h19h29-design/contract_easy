import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore } from '@sen/db';
import { PgStore } from '@sen/db';
import type { Chunk } from '@sen/shared';

/**
 * 파일 아티팩트(원문 버전·청크·규칙)를 PostgreSQL로 밀어 넣는 동기화(D-012 보완).
 * - 멱등: 동일 해시 재적재 시 changed=false
 * - 규칙: 상태 에스컬레이션 가드에 의해 reviewed/active 보존(D-011)
 */
export interface SyncReport {
  sources: number;
  versions: number;
  versionsChanged: number;
  attachments: number;
  chunks: number;
  rules: number;
  staleDraftsRemoved: number;
}

export async function syncDatabase(opts: {
  databaseUrl: string;
  appStoreDir: string;
  chunksFile?: string;
  migrationsDir?: string;
}): Promise<{ report: SyncReport; pg: PgStore }> {
  const fileStore = new FileStore(opts.appStoreDir);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir =
    opts.migrationsDir ?? path.resolve(here, '..', '..', '..', 'packages', 'db', 'drizzle');
  const pg = await PgStore.connectWithMigrations(opts.databaseUrl, migrationsDir);

  const report: SyncReport = {
    sources: 0, versions: 0, versionsChanged: 0,
    attachments: 0, chunks: 0, rules: 0, staleDraftsRemoved: 0
  };

  // 1) 원문 + 버전(순서대로 재생) + 첨부 메타
  for (const src of await fileStore.listSources()) {
    report.sources++;
    // 대상에 이미 존재하는 해시는 건너뛴다(멱등 재생 보장)
    const existing = await pg.getSource(src.url);
    const have = new Set((existing?.versions ?? []).map((v) => v.contentSha256));
    const ordered = [...src.versions].sort((a, b) => a.versionIndex - b.versionIndex);
    for (const v of ordered) {
      if (have.has(v.contentSha256)) { report.versions++; continue; }
      const res = await pg.upsertSourcePage({
        url: v.url,
        seedName: src.seedName,
        kind: src.kind,
        title: v.title,
        contentSha256: v.contentSha256,
        rawHtmlPath: v.rawHtmlPath,
        collectedAt: v.collectedAt,
        menuPath: v.menuPath ?? []
      });
      report.versions++;
      if (res.changed) report.versionsChanged++;
      have.add(v.contentSha256);
    }
    if (src.attachments.length > 0) {
      await pg.markSourceAttachments(src.id, src.attachments);
      report.attachments += src.attachments.length;
    }
  }

  // 2) 청크 인덱스
  const chunksFile = opts.chunksFile ?? path.join(opts.appStoreDir, 'chunks.json');
  if (fs.existsSync(chunksFile)) {
    const chunks = JSON.parse(fs.readFileSync(chunksFile, 'utf8')) as Chunk[];
    await pg.replaceChunks(chunks);
    report.chunks = chunks.length;
  }

  // 3) 규칙(동기화는 원문 후보만 옮기며 승인 상태는 이식하지 않음)
  const rules = await fileStore.listRules();
  const candidateIds = rules.filter((r) => r.id.startsWith('candidate.')).map((r) => `${r.id}@${r.version}`);
  report.staleDraftsRemoved = await pg.purgeStaleCandidateDrafts(candidateIds);
  for (const r of rules) {
    await pg.upsertRule({ ...r, status: 'draft' });
    report.rules++;
  }

  return { report, pg };
}
