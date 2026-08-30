import fs from 'node:fs';
import path from 'node:path';

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
  if (!/^[A-Za-z0-9_-]+$/.test(input.projectId)) {
    throw new Error('PRIVATE_PATH_VIOLATION');
  }

  const projectDir = path.join(input.privateRoot, input.projectId);
  fs.mkdirSync(projectDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(projectDir, 0o700);
  const storedPath = path.join(projectDir, `${input.sha256}.${input.ext}`);

  try {
    const fd = fs.openSync(storedPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, input.bytes);
    } finally {
      fs.closeSync(fd);
    }
    return { storedPath, created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { storedPath, created: false };
    throw error;
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

export function attachmentDisposition(originalName: string): string {
  const fallback = originalName.replace(/[^A-Za-z0-9._-]/g, '_') || 'evidence';
  const encoded = encodeURIComponent(originalName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
