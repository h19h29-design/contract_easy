import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '@sen/db';
import { CONTRACT_FIELD_DEFS, emptyContractFields } from '@sen/shared';
import { buildApp } from './server.js';
import { strFromU8, unzipSync } from 'fflate';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-api-'));
const store = new FileStore(dir);
const owner = store.createUser({ username: 'contract-owner', passwordHash: 'synthetic', displayName: '소유자', role: 'USER' });
const other = store.createUser({ username: 'contract-other', passwordHash: 'synthetic', displayName: '다른 사용자', role: 'USER' });
const ownerSession = store.createSession('synthetic-owner-session', owner.id, 'synthetic-csrf', 600000);
store.createSession('synthetic-other-session', other.id, 'synthetic-other-csrf', 600000);
const headers = { cookie: `scg_session=${ownerSession.token}`, 'x-csrf-token': ownerSession.csrfToken };
const project = store.createProject({ ownerId: owner.id, name: '계약서 테스트', contractCategory: 'construction', estimatedPrice: 123, organizationType: 'school', status: 'planning', wizardInput: null }, {});
const route = `/api/projects/${project.id}/contract`;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
beforeAll(async () => { ({ app } = await buildApp({ store })); });
afterAll(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('private contract authoring API', () => {
  it('authenticates and authorizes reads/writes/exports without leaking existence', async () => {
    for (const url of [route, `${route}.hwpx?revision=1&reviewed=true`]) {
      expect((await app.inject({ url })).statusCode).toBe(401);
      expect((await app.inject({ url, headers: { cookie: 'scg_session=synthetic-other-session' } })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'PUT', url: route, headers: { cookie: headers.cookie }, payload: { fields: {}, expectedRevision: 0 } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: route, headers: { cookie: 'scg_session=synthetic-other-session', 'x-csrf-token': 'synthetic-other-csrf' }, payload: { fields: {}, expectedRevision: 0 } })).statusCode).toBe(404);
  });
  it('saves, reloads, conflicts and exports only an explicit saved revision with acknowledgement', async () => {
    const initial = await app.inject({ url: route, headers });
    expect(initial.statusCode).toBe(200); expect(initial.json().draft).toBeNull();
    expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.json().initialFields.contractAmount).toBe(''); // estimated price is not contract amount
    expect((await app.inject({ method: 'PUT', url: route, headers, payload: { fields: { contractAmount: '1e8' }, expectedRevision: 0 } })).statusCode).toBe(400);
    const saved = await app.inject({ method: 'PUT', url: route, headers, payload: { fields: { workName: '비공개 공사명' }, expectedRevision: 0 } });
    expect(saved.statusCode).toBe(200); expect(saved.json().draft.revision).toBe(1);
    expect((await app.inject({ method: 'PUT', url: route, headers, payload: { fields: {}, expectedRevision: 0 } })).statusCode).toBe(409);
    expect((await app.inject({ url: `${route}.hwpx?revision=1&reviewed=true`, headers })).statusCode).toBe(422);
    const fields = emptyContractFields();
    for (const [key, , , type, required] of CONTRACT_FIELD_DEFS) if (required) fields[key] = type === 'date' ? '2026-09-12' : type === 'amount' ? '9007199254740993' : '합성 입력';
    fields.workName = '다운로드 검증';
    expect((await app.inject({ method: 'PUT', url: route, headers, payload: { fields, expectedRevision: 1 } })).statusCode).toBe(200);
    expect((await app.inject({ url: `${route}.hwpx?revision=2`, headers })).statusCode).toBe(422);
    expect((await app.inject({ url: `${route}.hwpx?revision=999&reviewed=true`, headers })).statusCode).toBe(404);
    const download = await app.inject({ url: `${route}.hwpx?revision=2&reviewed=true`, headers });
    expect(download.statusCode).toBe(200); expect(download.headers['content-disposition']).toContain('.hwpx');
    expect(download.headers['cache-control']).toBe('no-store');
    expect(strFromU8(unzipSync(download.rawPayload)['Contents/section0.xml'])).toContain('다운로드 검증');
    expect((await app.inject({ url: `${route}?revision=1`, headers })).json().draft.fields.workName).toBe('비공개 공사명');
    expect(JSON.stringify(store.listAudit())).not.toContain('비공개 공사명');
    expect(JSON.stringify(store.getChunks())).not.toContain('다운로드 검증');
  });
  it('accepts maximum Korean field lengths but rejects oversized bodies', async () => {
    const fields = emptyContractFields();
    for (const [key, , , type] of CONTRACT_FIELD_DEFS) fields[key] = type === 'multiline' ? '가'.repeat(3000) : type === 'text' ? '가'.repeat(300) : '';
    fields.scheduleRows = '합성공정 | 2026-09-12 | 2026-09-12';
    expect(Buffer.byteLength(JSON.stringify({ fields, expectedRevision: 2 }))).toBeGreaterThan(32768);
    expect((await app.inject({ method: 'PUT', url: route, headers, payload: { fields, expectedRevision: 2 } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: route, headers, payload: { fields: { notes: '가'.repeat(40000) }, expectedRevision: 3 } })).statusCode).toBe(413);
  });
  it('selects follow-up forms and enforces their own required fields and privacy', async () => {
    const p = store.createProject({ ownerId: owner.id, name: '후속 서식', contractCategory: 'construction', estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null }, {});
    const url = `/api/projects/${p.id}/contract`;
    const fields = { ...emptyContractFields(), workName: '합성 후속 공사', contractAmount: '9007199254740993', contractDate: '2026-09-12', actualStartDate: '2026-09-13', endDate: '2026-09-30', startReportDate: '2026-09-14', agencyName: '가상기관', recipientTitle: '계약담당자', companyName: '가상업체', companyRegistration: '000-00-00000', companyAddress: '합성 주소', companyRepresentative: '가상대표' };
    expect((await app.inject({ method: 'PUT', url, headers, payload: { fields, expectedRevision: 0 } })).statusCode).toBe(200);
    const exportUrl = `${url}.hwpx?revision=1&reviewed=true`;
    expect((await app.inject({ url: `${exportUrl}&form=commencement`, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `${exportUrl}&form=completion`, headers })).statusCode).toBe(422);
    expect((await app.inject({ url: `${exportUrl}&form=payment`, headers })).json().missing).toContain('청구금액(원)');
    for (const form of ['unknown', 'constructor', 'payment&form=contract']) expect((await app.inject({ url: `${exportUrl}&form=${form}`, headers })).statusCode).toBe(400);
    for (const form of ['commencement', 'completion', 'payment']) {
      expect((await app.inject({ url: `${exportUrl}&form=${form}` })).statusCode).toBe(401);
      expect((await app.inject({ url: `${exportUrl}&form=${form}`, headers: { cookie: 'scg_session=synthetic-other-session' } })).statusCode).toBe(404);
    }
    const complete = { ...fields, actualEndDate: '2026-10-01', completionReportDate: '2026-10-02', completionAmount: '9007199254740993', paidAmount: '0', claimAmount: '9007199254740881', deductionAmount: '112', claimDate: '2026-10-03', bankName: '합성은행', bankAccount: '000-PRIVATE-000', bankHolder: '합성예금주' };
    expect((await app.inject({ method: 'PUT', url, headers, payload: { fields: complete, expectedRevision: 1 } })).statusCode).toBe(200);
    for (const form of ['commencement', 'completion', 'payment']) {
      const result = await app.inject({ url: `${url}.hwpx?revision=2&reviewed=true&form=${form}`, headers });
      expect(result.statusCode).toBe(200);
      const zip = unzipSync(result.rawPayload);
      expect(strFromU8(zip['Contents/section0.xml']).includes('000-PRIVATE-000')).toBe(form === 'payment');
      expect(strFromU8(zip['Preview/PrvText.txt']).includes('000-PRIVATE-000')).toBe(form === 'payment');
    }
    expect((await app.inject({ url: `${url}.hwpx?revision=1&reviewed=true&form=completion`, headers })).statusCode).toBe(422);
    const bundleUrl = `${url}.zip?revision=2&reviewed=true&forms=commencement,completion`;
    const bundle = await app.inject({ url: bundleUrl, headers });
    expect(bundle.statusCode).toBe(200);
    expect(bundle.headers['cache-control']).toBe('no-store');
    const entries = unzipSync(bundle.rawPayload);
    expect(Object.keys(entries)).toEqual(['착공계-초안-v2.hwpx', '준공계-초안-v2.hwpx']);
    for (const file of Object.values(entries)) {
      expect(Object.values(unzipSync(file)).map((part) => strFromU8(part)).join('').includes('000-PRIVATE-000')).toBe(false);
    }
    expect((await app.inject({ url: bundleUrl })).statusCode).toBe(401);
    expect((await app.inject({ url: bundleUrl, headers: { cookie: 'scg_session=synthetic-other-session' } })).statusCode).toBe(404);
    for (const forms of ['', 'constructor', 'payment,payment', 'payment,', 'payment&forms=contract']) {
      expect((await app.inject({ url: `${url}.zip?revision=2&reviewed=true&forms=${forms}`, headers })).statusCode).toBe(400);
    }
    expect((await app.inject({ url: `${url}.zip?revision=1&reviewed=true&forms=commencement,completion`, headers })).statusCode).toBe(422);
    expect((await app.inject({ url: `${url}.zip?revision=2&forms=commencement`, headers })).statusCode).toBe(422);
    expect(JSON.stringify(store.listAudit()).includes('000-PRIVATE-000')).toBe(false);
    expect(JSON.stringify(store.getChunks()).includes('000-PRIVATE-000')).toBe(false);
  });
  it('loads a legacy v1 draft without rewriting history and still exports its standard contract', async () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
    const draft = fixture.contractDrafts.find((d: { projectId: string; revision: number }) => d.projectId === project.id && d.revision === 2);
    draft.templateVersion = 'sen-construction-2026-04-v1';
    delete draft.fields.actualStartDate; delete draft.fields.bankAccount; delete draft.fields.claimAmount;
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-legacy-'));
    fs.writeFileSync(path.join(legacyDir, 'db.json'), JSON.stringify(fixture), { mode: 0o600 });
    const before = fs.readFileSync(path.join(legacyDir, 'db.json'), 'utf8');
    const legacy = await buildApp({ store: new FileStore(legacyDir) });
    try {
      const loaded = await legacy.app.inject({ url: `${route}?revision=2`, headers });
      expect(loaded.statusCode).toBe(200);
      expect(loaded.json().draft.fields.actualStartDate).toBe('');
      expect(loaded.json().draft.fields.bankAccount).toBe('');
      expect(loaded.json().draft.templateVersion).toBe('sen-construction-2026-04-v1');
      expect((await legacy.app.inject({ url: `${route}.hwpx?revision=2&reviewed=true`, headers })).statusCode).toBe(200);
      for (const form of ['commencement', 'completion', 'payment']) {
        expect((await legacy.app.inject({ url: `${route}.hwpx?revision=2&reviewed=true&form=${form}`, headers })).statusCode).toBe(422);
      }
      expect(fs.readFileSync(path.join(legacyDir, 'db.json'), 'utf8')).toBe(before);
    } finally { await legacy.app.close(); fs.rmSync(legacyDir, { recursive: true, force: true }); }
  });
});
