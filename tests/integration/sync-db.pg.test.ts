import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore, PgStore } from '@sen/db';
import type { Chunk } from '@sen/shared';
import { syncDatabase } from '../../workers/ingest/src/sync-db.js';

let pg: PgStore;
const url = process.env.PG_TEST_URL!;
let tmpDir = '';
let chunksFile = '';

beforeAll(async () => {
  pg = await PgStore.connect(url);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-sync-'));

  const fileStore = new FileStore(tmpDir);
  // 원문 2건(버전 1·2)
  await fileStore.upsertSourcePage({
    url: 'https://x/fus/s1', seedName: 'FAQ-공사', kind: 'paginated-board',
    title: 'S1 v1', contentSha256: 's1-old', collectedAt: '2026-01-01T00:00:00Z', menuPath: ['FAQ-공사']
  });
  await fileStore.upsertSourcePage({
    url: 'https://x/fus/s1', seedName: 'FAQ-공사', kind: 'paginated-board',
    title: 'S1 v2', contentSha256: 's1-new', collectedAt: '2026-02-01T00:00:00Z', menuPath: ['FAQ-공사']
  });
  await fileStore.upsertSourcePage({
    url: 'https://x/fus/s2', seedName: null, kind: 'guide',
    title: 'S2', contentSha256: 's2-a', collectedAt: '2026-03-01T00:00:00Z'
  });
  await fileStore.markSourceAttachments(
    (await fileStore.getSource('https://x/fus/s2'))!.id,
    [{ url: 'https://x/file.pdf', fileName: 'f.pdf', ext: 'pdf', robotsDisallowed: true }]
  );

  // 규칙: candidate draft / source-side active
  await fileStore.upsertRule(baseRule('candidate.amount.k1', 1, 'draft'));
  await fileStore.upsertRule(baseRule('manual.rule.r1', 1, 'draft'));
  await fileStore.reviewRule('manual.rule.r1', 1, 'reviewed');
  await fileStore.activateRule('manual.rule.r1', 1, '관리자');

  // 청크 파일
  const chunks: Chunk[] = [
    chunk('c1', 'faq', { faqCategory: 'construction' }),
    chunk('c2', 'paragraph', {}),
    chunk('c3', 'table-row', {})
  ];
  chunksFile = path.join(tmpDir, 'chunks.json');
  fs.writeFileSync(chunksFile, JSON.stringify(chunks));
});

afterAll(async () => {
  await pg.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function baseRule(id: string, version: number, status: RuleDefinition['status']) {
  return {
    id,
    version,
    status,
    scope: {},
    conditions: [],
    output: { reviewRequired: true },
    source: { title: 't', url: 'https://example.org', effectiveFrom: null, checkedAt: '2026-08-26' },
    reviewedBy: null,
    supersededBy: null,
    createdAt: '2026-08-26T00:00:00Z',
    updatedAt: '2026-08-26T00:00:00Z'
  } as import('@sen/shared').RuleDefinition;
}

function chunk(id: string, type: Chunk['type'], meta: Record<string, unknown>): Chunk {
  return {
    id, sourceVersionId: 'sv-sync', url: 'https://x/fus/s1',
    docTitle: '동기화 문서', sectionPath: [], order: 0, type,
    text: `청크 ${id} 본문`, meta
  };
}

describe('syncDatabase (파일 → PostgreSQL)', () => {
  it('원문·버전·청크·규칙을 PG에 적재한다', async () => {
    const { report } = await syncDatabase({
      databaseUrl: url, appStoreDir: tmpDir, chunksFile,
      migrationsDir: path.resolve('packages/db/drizzle')
    });
    expect(report.sources).toBe(2);
    expect(report.versions).toBe(3);
    expect(report.versionsChanged).toBe(3);
    expect(report.chunks).toBe(3);
    expect(report.rules).toBe(2);

    const s1 = await pg.getSource('https://x/fus/s1');
    expect(s1?.versions.map((v) => v.contentSha256)).toEqual(['s1-old', 's1-new']);
    const s2 = await pg.getSource('https://x/fus/s2');
    expect(s2?.attachments).toHaveLength(1);

    const rules = await pg.listRules();
    const active = rules.find((r) => r.id === 'manual.rule.r1');
    expect(active?.status).toBe('draft'); // 동기화는 승인 상태를 이식하지 않음
    expect(rules.find((r) => r.id === 'candidate.amount.k1')).toBeTruthy();

    const storedChunks = await pg.getChunks();
    expect(storedChunks.filter((c) => c.type === 'faq')).toHaveLength(1);
  });

  it('재동기화는 멱등(changed=0)', async () => {
    const { report } = await syncDatabase({
      databaseUrl: url, appStoreDir: tmpDir, chunksFile,
      migrationsDir: path.resolve('packages/db/drizzle')
    });
    expect(report.versionsChanged).toBe(0);
  });

  it('없는 candidate draft는 정리하지만 held draft는 보존', async () => {
    const reviewer = await pg.createUser({
      username: 'sync-reviewer', passwordHash: 's:h', displayName: '동기화 검토자', role: 'REVIEWER'
    });
    expect((await pg.holdRule('candidate.amount.k1', 1, reviewer.id, '추가 원문 확인')).ok).toBe(true);

    // 파일스토어에서 candidate 하나를 제거한 뒤 재동기화
    const fileStore = new FileStore(tmpDir);
    fileStore.purgeStaleCandidateDrafts([]);
    const before = (await pg.listRules()).map((r) => r.id);
    expect(before).toContain('candidate.amount.k1');

    const { report } = await syncDatabase({
      databaseUrl: url, appStoreDir: tmpDir, chunksFile,
      migrationsDir: path.resolve('packages/db/drizzle')
    });
    void report;
    const after = (await pg.listRules()).map((r) => r.id);
    expect(after).toContain('candidate.amount.k1');
    expect(after).toContain('manual.rule.r1');
  });
});
