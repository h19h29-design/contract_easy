import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
    const sha256 = createHash('sha256').update(pdf).digest('hex');

    const first = writeEvidenceFile({ privateRoot: root, projectId: 'p1', bytes: pdf, sha256, ext: 'pdf' });
    const second = writeEvidenceFile({ privateRoot: root, projectId: 'p1', bytes: pdf, sha256, ext: 'pdf' });

    expect(first.storedPath).toBe(path.join(root, 'p1', `${sha256}.pdf`));
    expect(second).toEqual({ storedPath: first.storedPath, created: false });
    expect(fs.statSync(first.storedPath).mode & 0o777).toBe(0o600);
  });

  it('privateRoot 밖의 DB 경로를 다운로드하지 않음', () => {
    expect(() => resolveEvidenceDownload(privateRoot(), '/etc/passwd')).toThrow('PRIVATE_PATH_VIOLATION');
  });

  it('프로젝트 디렉터리 symlink를 따라 privateRoot 밖에 쓰거나 chmod 하지 않음', () => {
    const root = privateRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-private-outside-'));
    roots.push(outside);
    fs.chmodSync(outside, 0o755);
    fs.symlinkSync(outside, path.join(root, 'p1'));

    expect(() => writeEvidenceFile({
      privateRoot: root, projectId: 'p1', bytes: Buffer.from('%PDF-1.4\n'), sha256: 'b'.repeat(64), ext: 'pdf'
    })).toThrow('PRIVATE_PATH_VIOLATION');
    expect(fs.existsSync(path.join(outside, `${'b'.repeat(64)}.pdf`))).toBe(false);
    expect(fs.statSync(outside).mode & 0o777).toBe(0o755);
  });

  it('기존 hash 파일은 exact bytes인 0600 regular file일 때만 dedupe한다', () => {
    const root = privateRoot();
    const sha256 = 'c'.repeat(64);
    const target = path.join(root, 'p1', `${sha256}.pdf`);
    fs.mkdirSync(path.dirname(target));
    fs.writeFileSync(target, 'wrong');
    fs.chmodSync(target, 0o600);
    expect(() => writeEvidenceFile({ privateRoot: root, projectId: 'p1', bytes: Buffer.from('%PDF-1.4\n'), sha256, ext: 'pdf' }))
      .toThrow('PRIVATE_PATH_VIOLATION');
    expect(fs.readFileSync(target, 'utf8')).toBe('wrong');
  });
});
