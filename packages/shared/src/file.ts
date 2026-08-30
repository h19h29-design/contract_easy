import { extOf, safeFileName, sha256Hex } from './hash.js';

export type DetectedFileKind =
  | 'pdf' | 'hwpx' | 'docx' | 'xlsx' | 'zip'
  | 'doc' | 'xls' | 'hwp' | 'ole' | 'jpg' | 'png' | 'gif';

export type EvidenceMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export type EvidenceValidationResult =
  | { ok: true; ext: 'pdf' | 'jpg' | 'png'; mimeType: EvidenceMime; sha256: string; sizeBytes: number; originalName: string }
  | { ok: false; code: 'EMPTY_FILE' | 'TOO_LARGE' | 'UNSUPPORTED_EXTENSION' | 'MIME_MISMATCH' | 'MAGIC_MISMATCH' };

const EVIDENCE_TYPES = {
  pdf: { mimeType: 'application/pdf', kind: 'pdf' },
  jpg: { mimeType: 'image/jpeg', kind: 'jpg' },
  jpeg: { mimeType: 'image/jpeg', kind: 'jpg' },
  png: { mimeType: 'image/png', kind: 'png' }
} as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectFileKind(bytes: Buffer, hintName?: string): DetectedFileKind | null {
  const head = bytes.subarray(0, 8);
  const hex = head.toString('hex');
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (hex.startsWith('504b0304')) {
    const name = hintName?.toLowerCase() ?? '';
    if (name.endsWith('.hwpx')) return 'hwpx';
    if (name.endsWith('.docx')) return 'docx';
    if (name.endsWith('.xlsx')) return 'xlsx';
    return 'zip';
  }
  if (hex.startsWith('d0cf11e0')) {
    const name = hintName?.toLowerCase() ?? '';
    if (name.endsWith('.doc')) return 'doc';
    if (name.endsWith('.xls')) return 'xls';
    if (name.endsWith('.hwp')) return 'hwp';
    return 'ole';
  }
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e47')) return 'png';
  if (head.toString('latin1').startsWith('GIF8')) return 'gif';
  if (hex.startsWith('23215343')) return null;
  return null;
}

export function validateEvidenceFile(bytes: Buffer, originalName: string, declaredMime: string): EvidenceValidationResult {
  if (bytes.length === 0) return { ok: false, code: 'EMPTY_FILE' };
  if (bytes.length > EVIDENCE_MAX_BYTES) return { ok: false, code: 'TOO_LARGE' };

  const normalizedName = safeFileName(originalName);
  const extension = extOf(normalizedName);
  const evidenceType = EVIDENCE_TYPES[extension as keyof typeof EVIDENCE_TYPES];
  if (!evidenceType) return { ok: false, code: 'UNSUPPORTED_EXTENSION' };
  if (declaredMime !== evidenceType.mimeType) return { ok: false, code: 'MIME_MISMATCH' };
  if (
    detectFileKind(bytes, normalizedName) !== evidenceType.kind
    || (evidenceType.kind === 'png' && !hasPngSignature(bytes))
  ) return { ok: false, code: 'MAGIC_MISMATCH' };

  return {
    ok: true,
    ext: evidenceType.kind,
    mimeType: evidenceType.mimeType,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
    originalName: normalizedName
  };
}

function hasPngSignature(bytes: Buffer): boolean {
  return bytes.length >= PNG_SIGNATURE.length
    && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}
