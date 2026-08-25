import { createHash } from 'node:crypto';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** 안전한 파일명(경로분리·위험문자 제거) */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^0-9A-Za-z가-힣._-]/g, '_').slice(0, 180) || 'file';
}

export function extOf(urlOrName: string): string {
  const clean = urlOrName.split('?')[0].split('#')[0];
  const idx = clean.lastIndexOf('.');
  if (idx < 0) return '';
  return clean.slice(idx + 1).toLowerCase();
}
