import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEvidenceDownload, writeEvidenceFile } from './project-files.js';

describe('private evidence files', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  function privateRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-private-evidence-'));
    roots.push(root);
    return root;
  }

  it('프로젝트별 hash 경로에 0600 파일을 한 번만 씀', () => {
    const root = privateRoot();
    const pdf = Buffer.from('%PDF-1.4\n');
    const sha256 = 'a'.repeat(64);

    const first = writeEvidenceFile({ privateRoot: root, projectId: 'p1', bytes: pdf, sha256, ext: 'pdf' });
    const second = writeEvidenceFile({ privateRoot: root, projectId: 'p1', bytes: pdf, sha256, ext: 'pdf' });

    expect(first.storedPath).toBe(path.join(root, 'p1', `${sha256}.pdf`));
    expect(second).toEqual({ storedPath: first.storedPath, created: false });
    expect(fs.statSync(first.storedPath).mode & 0o777).toBe(0o600);
  });

  it('privateRoot 밖의 DB 경로를 다운로드하지 않음', () => {
    expect(() => resolveEvidenceDownload(privateRoot(), '/etc/passwd')).toThrow('PRIVATE_PATH_VIOLATION');
  });
});
