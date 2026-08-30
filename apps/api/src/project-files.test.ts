import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('restrictive umask에서도 publish는 exact 0600이며 기존 target 변조를 거부한다', () => {
    const root = privateRoot();
    const bytes = Buffer.from('%PDF-1.4\n');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const prior = process.umask(0o777);
    try {
      const first = writeEvidenceFile({ privateRoot: root, projectId: 'p2', bytes, sha256, ext: 'pdf' });
      expect(fs.statSync(first.storedPath).mode & 0o777).toBe(0o600);
      expect(writeEvidenceFile({ privateRoot: root, projectId: 'p2', bytes, sha256, ext: 'pdf' }).created).toBe(false);
      fs.chmodSync(first.storedPath, 0o644);
      expect(() => writeEvidenceFile({ privateRoot: root, projectId: 'p2', bytes, sha256, ext: 'pdf' })).toThrow('PRIVATE_PATH_VIOLATION');
      expect(fs.readFileSync(first.storedPath)).toEqual(bytes);
    } finally {
      process.umask(prior);
    }
  });

  it('symlink, directory and partial existing target을 변경하지 않고 거부한다', () => {
    const root = privateRoot();
    const bytes = Buffer.from('%PDF-1.4\n');
    for (const [suffix, setup] of [
      ['d', (target: string) => fs.mkdirSync(target)],
      ['p', (target: string) => { fs.writeFileSync(target, 'partial'); fs.chmodSync(target, 0o600); }]
    ] as const) {
      const sha256 = suffix.repeat(64);
      const target = path.join(root, 'p3', `${sha256}.pdf`);
      fs.mkdirSync(path.dirname(target), { recursive: true }); setup(target);
      expect(() => writeEvidenceFile({ privateRoot: root, projectId: 'p3', bytes, sha256, ext: 'pdf' })).toThrow('PRIVATE_PATH_VIOLATION');
    }
  });

  it('unowned temp collision은 sentinel을 남기고 final symlink를 거부한다', () => {
    const root = privateRoot();
    const bytes = Buffer.from('%PDF-1.4\n');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const now = vi.spyOn(Date, 'now').mockReturnValue(1234);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const dir = path.join(root, 'p4'); fs.mkdirSync(dir);
      const temp = path.join(dir, `.${sha256}.${process.pid}.1234.8.tmp`);
      fs.writeFileSync(temp, 'sentinel');
      expect(() => writeEvidenceFile({ privateRoot: root, projectId: 'p4', bytes, sha256, ext: 'pdf' })).toThrow();
      expect(fs.readFileSync(temp, 'utf8')).toBe('sentinel');
      fs.unlinkSync(temp);
      const target = path.join(dir, `${sha256}.pdf`);
      fs.symlinkSync('/dev/null', target);
      expect(() => writeEvidenceFile({ privateRoot: root, projectId: 'p4', bytes, sha256, ext: 'pdf' })).toThrow('PRIVATE_PATH_VIOLATION');
      expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
    } finally { now.mockRestore(); random.mockRestore(); }
  });

  it('owned temp is cleaned after publish EEXIST while the published bytes remain immutable', () => {
    const root = privateRoot();
    const bytes = Buffer.from('%PDF-1.4\n');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const originalLink = fs.linkSync;
    const link = vi.spyOn(fs, 'linkSync').mockImplementation((temporary, target) => {
      originalLink(temporary, target);
      const error = new Error('exists') as NodeJS.ErrnoException; error.code = 'EEXIST'; throw error;
    });
    try {
      const result = writeEvidenceFile({ privateRoot: root, projectId: 'p5', bytes, sha256, ext: 'pdf' });
      expect(result.created).toBe(false);
      const dir = path.join(root, 'p5');
      expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
      expect(fs.readFileSync(path.join(dir, `${sha256}.pdf`))).toEqual(bytes);
    } finally { link.mockRestore(); }
  });
});
