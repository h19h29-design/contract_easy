import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgStore } from '@sen/db';
import { emptyContractFields } from '@sen/shared';

let store: PgStore;
beforeAll(async () => { store = await PgStore.connect(process.env.PG_TEST_URL!); });
afterAll(async () => { await store.close(); });
describe('PG private contract revisions', () => {
  it('serializes concurrent first saves and retains historical contents', async () => {
    const owner = await store.createUser({ username: `contract-${Date.now()}`, passwordHash: 'synthetic', displayName: '테스트', role: 'USER' });
    const p = await store.createProject({ ownerId: owner.id, name: '계약서', contractCategory: 'construction', estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null }, {});
    const fields = { ...emptyContractFields(), workName: '원본 초안', contractAmount: '9007199254740993' };
    const results = await Promise.all([store.saveContractDraft(p.id, fields, 0, owner.id), store.saveContractDraft(p.id, fields, 0, owner.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'CONFLICT' }]);
    expect((await store.saveContractDraft(p.id, { ...fields, workName: '수정' }, 1, owner.id)).ok).toBe(true);
    expect((await store.getContractDraft(p.id, 1))?.fields.workName).toBe('원본 초안');
    expect((await store.getContractDraft(p.id))?.revision).toBe(2);
    expect((await store.getContractDraft(p.id))?.fields.contractAmount).toBe('9007199254740993');
    expect(await store.getContractDraft('not-project', 1)).toBeNull();
    expect(await store.saveContractDraft(p.id, fields, 2, 'missing')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await store.applyMigrations()).toBe(0);
  });
});
