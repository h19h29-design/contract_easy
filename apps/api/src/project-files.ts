import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface StoredEvidenceFile {
  storedPath: string;
  created: boolean;
}

export function writeEvidenceFile(input: {
  privateRoot: string;
  projectId: string;
  bytes: Buffer;
  sha256: string;
  ext: 'pdf' | 'jpg' | 'png';
}): StoredEvidenceFile {
  if (
    !/^[A-Za-z0-9_-]+$/.test(input.projectId) || !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !(['pdf', 'jpg', 'png'] as const).includes(input.ext)
  ) {
    throw new Error('PRIVATE_PATH_VIOLATION');
  }

  const root = ensurePrivateRoot(input.privateRoot);
  const projectDir = path.join(root, input.projectId);
  ensureProjectDirectory(projectDir);
  const canonicalProjectDir = fs.realpathSync(projectDir);
  if (!isStrictlyWithin(root, canonicalProjectDir)) throw new Error('PRIVATE_PATH_VIOLATION');
  fs.chmodSync(canonicalProjectDir, 0o700);
  const canonicalStoredPath = path.join(canonicalProjectDir, `${input.sha256}.${input.ext}`);
  const storedPath = path.join(input.privateRoot, input.projectId, `${input.sha256}.${input.ext}`);

  if (fs.existsSync(canonicalStoredPath)) {
    verifyExistingEvidence(canonicalStoredPath, input);
    return { storedPath, created: false };
  }
  const temporaryPath = path.join(canonicalProjectDir, `.${input.sha256}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let ownsTemporaryPath = false;
  try {
    const fd = fs.openSync(temporaryPath, 'wx', 0o600);
    ownsTemporaryPath = true;
    try {
      fs.chmodSync(temporaryPath, 0o600);
      fs.writeFileSync(fd, input.bytes);
      if ((fs.fstatSync(fd).mode & 0o777) !== 0o600) throw new Error('PRIVATE_PATH_VIOLATION');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(temporaryPath, canonicalStoredPath);
      return { storedPath, created: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      verifyExistingEvidence(canonicalStoredPath, input);
      return { storedPath, created: false };
    }
  } finally {
    if (ownsTemporaryPath && fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function verifyExistingEvidence(target: string, input: { bytes: Buffer; sha256: string }): void {
  const info = fs.lstatSync(target);
  const actualHash = createHash('sha256').update(input.bytes).digest('hex');
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600 ||
    info.size !== input.bytes.length || actualHash !== input.sha256 ||
    createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== input.sha256) {
    throw new Error('PRIVATE_PATH_VIOLATION');
  }
}

export function resolveEvidenceDownload(privateRoot: string, storedPath: string): string {
  const root = fs.realpathSync(privateRoot);
  const target = fs.realpathSync(storedPath);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error('PRIVATE_PATH_VIOLATION');
  }
  return target;
}

function ensurePrivateRoot(privateRoot: string): string {
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const info = fs.lstatSync(privateRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PRIVATE_PATH_VIOLATION');
  fs.chmodSync(privateRoot, 0o700);
  return fs.realpathSync(privateRoot);
}

function ensureProjectDirectory(projectDir: string): void {
  try {
    const info = fs.lstatSync(projectDir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PRIVATE_PATH_VIOLATION');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    fs.mkdirSync(projectDir, { mode: 0o700 });
    const created = fs.lstatSync(projectDir);
    if (!created.isDirectory() || created.isSymbolicLink()) {
      throw new Error('PRIVATE_PATH_VIOLATION', { cause: error });
    }
  }
}

function isStrictlyWithin(root: string, target: string): boolean {
  return target.startsWith(`${root}${path.sep}`);
}

export function attachmentDisposition(originalName: string): string {
  const fallback = originalName.replace(/[^A-Za-z0-9._-]/g, '_') || 'evidence';
  const encoded = encodeURIComponent(originalName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
