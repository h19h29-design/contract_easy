import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '@sen/db';
import { validateContractFields } from '@sen/shared';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-store-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
describe('contract draft persistence', () => {
  it('preserves old revisions, rejects stale saves and detaches input/output', async () => {
    const store = new FileStore(dir);
    const owner = store.createUser({ username: 'contract-owner', passwordHash: 'synthetic', displayName: '테스트', role: 'USER' });
    const project = store.createProject({ ownerId: owner.id, name: '테스트', contractCategory: 'construction', estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null }, {});
    const parsed = validateContractFields({ workName: '초안 1', contractAmount: '9007199254740993', claimAmount: '9007199254740881', bankAccount: '000-FILE-SYNTHETIC' });
    if (!parsed.ok) throw new Error('invalid fixture');
    const saved = await store.saveContractDraft(project.id, parsed.fields, 0, owner.id);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error('save failed');
    parsed.fields.workName = '외부 수정'; saved.draft.fields.workName = '반환값 수정';
    expect((await store.getContractDraft(project.id))?.fields.workName).toBe('초안 1');
    expect(await store.saveContractDraft(project.id, parsed.fields, 0, owner.id)).toEqual({ ok: false, code: 'CONFLICT' });
    expect((await store.saveContractDraft(project.id, parsed.fields, 1, owner.id)).ok).toBe(true);
    const reopened = new FileStore(dir);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'db.json')).mode & 0o777).toBe(0o600);
    expect((await reopened.getContractDraft(project.id, 1))?.fields.workName).toBe('초안 1');
    expect((await reopened.getContractDraft(project.id))?.revision).toBe(2);
    expect((await reopened.getContractDraft(project.id))?.fields.contractAmount).toBe('9007199254740993');
    expect((await reopened.getContractDraft(project.id))?.fields.claimAmount).toBe('9007199254740881');
    expect((await reopened.getContractDraft(project.id, 1))?.fields.bankAccount).toBe('000-FILE-SYNTHETIC');
    expect(await reopened.getContractDraft('other-project', 1)).toBeNull();
    expect(await reopened.saveContractDraft('missing', parsed.fields, 0, owner.id)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await reopened.saveContractDraft(project.id, parsed.fields, 2, 'missing-user')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await reopened.saveContractDraft(project.id, parsed.fields, 2147483647, owner.id)).toEqual({ ok: false, code: 'INVALID' });
  });
});
