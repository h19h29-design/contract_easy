import fs from 'node:fs';
import path from 'node:path';
import { FileStore, hashPassword } from '@sen/db';
import type { RuleDefinition } from '@sen/shared';

const dataRoot = path.resolve(process.env.SEN_CONTRACT_DATA_ROOT ?? 'tests/e2e/.data');
// This is an exact, disposable E2E fixture directory; never broaden this target.
fs.rmSync(dataRoot, { recursive: true, force: true });

const store = new FileStore(path.join(dataRoot, 'app-store'));

function ensureUser(username: string, password: string, role: 'REVIEWER' | 'ADMIN') {
  if (store.listUsers().some((user) => user.username === username)) return;
  store.createUser({ username, passwordHash: hashPassword(password), displayName: username, role });
}

function methodBandRule(id: string, version: number, status: RuleDefinition['status']): RuleDefinition {
  const now = new Date().toISOString();
  return {
    id,
    version,
    status,
    scope: { contract_category: 'construction' },
    conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 0] }],
    output: { method: '원문 검토 후보', reviewRequired: true, message: 'E2E 검토용 초안' },
    source: { title: 'E2E 원문', url: 'https://example.test/rules/e2e', effectiveFrom: null, checkedAt: '2026-08-30' },
    reviewedBy: null,
    supersededBy: null,
    createdAt: now,
    updatedAt: now
  };
}

ensureUser('e2e-reviewer', 'Reviewer!2026', 'REVIEWER');
ensureUser('e2e-admin2', 'Admin2!2026', 'ADMIN');
ensureUser('admin', 'ChangeMe!2026', 'ADMIN');
store.upsertRule(methodBandRule('e2e.method.band', 1, 'draft'));
