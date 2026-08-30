import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';

let disposableRoot = '';

afterEach(() => {
  if (disposableRoot) fs.rmSync(disposableRoot, { recursive: true, force: true });
});

test('다른 데이터 경로를 거부하고 삭제하지 않는다', () => {
  disposableRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sen-e2e-seed-guard-'));
  const sentinel = path.join(disposableRoot, 'must-remain.txt');
  fs.writeFileSync(sentinel, 'disposable sentinel');

  const result = spawnSync('pnpm', ['exec', 'tsx', 'tests/e2e/seed.ts'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, SEN_CONTRACT_DATA_ROOT: disposableRoot }
  });

  expect(result.status).not.toBe(0);
  expect(`${result.stderr}${result.stdout}`).toContain('tests/e2e/.data');
  expect(fs.existsSync(sentinel)).toBe(true);
});
