import fs from 'node:fs';
import path from 'node:path';
import { PoliteHttpClient } from './http.js';
import { detectFileKind, safeFileName, sha256Hex } from '@sen/shared';
import { ensureDirs } from '@sen/config';
import { FileStore } from '@sen/db';

/**
 * 첨부파일 수집기(D-014: 운영자 승인 + robots 재해석).
 * - robots 재검토: 차단 패턴은 직접 확장자 URL(/*.pdf$ 등) 대상이며,
 *   실제 링크는 down0030f.do 형태의 엔드포인트로 패턴 외부 → 기존 '전면 차단'은 과보정이었음.
 * - 안전장치 유지: 동시성 1·간격 1.2s·크기 상한·매직바이트 검증·미실행·content-addressed 저장.
 */

const MAX_BYTES = 80 * 1024 * 1024;

export interface AttachmentOutcome {
  url: string;
  status: number | 'skip';
  kind?: string;
  savedPath?: string;
  sha256?: string;
  sizeBytes?: number;
  reason?: string;
}

export const detectKind = detectFileKind;

function nameFromDisposition(disposition: string | null): string {
  if (!disposition) return '';
  const m = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  if (!m) return '';
  let name = m[1]!.replace(/"/g, '');
  try { name = decodeURIComponent(name); } catch { /* keep */ }
  // 잘못 인코딩된 한글 복구 시도(latin1→utf8)
  try {
    const latin = Buffer.from(name, 'latin1');
    const utf8 = latin.toString('utf8');
    if (/[\uac00-\ud7a3]/.test(utf8)) name = utf8;
  } catch { /* keep */ }
  return name;
}

export async function collectAttachments(opts?: { limit?: number }): Promise<AttachmentOutcome[]> {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const client = new PoliteHttpClient();
  const out: AttachmentOutcome[] = [];

  // 중복 제거한 엔드포인트 목록
  const uniq = new Map<string, { sourceId: string; url: string }>();
  for (const src of await store.listSources()) {
    for (const a of src.attachments) {
      if (!uniq.has(a.url)) uniq.set(a.url, { sourceId: src.id, url: a.url });
    }
  }
  const list = [...uniq.values()].slice(0, opts?.limit ?? Number.POSITIVE_INFINITY);
  console.log(`[attachments] targets=${list.length}`);

  for (const item of list) {
    try {
      const res = await client.get(item.url);
      if (res.status !== 200) {
        out.push({ url: item.url, status: res.status, reason: `http_${res.status}` });
        appendManifest(dirs, { url: item.url, ok: false, reason: `http_${res.status}` });
        continue;
      }
      const buf = res.body;
      if (buf.length > MAX_BYTES) {
        out.push({ url: item.url, status: 'skip', reason: 'too_large' });
        continue;
      }
      const ct = res.headers['content-type'] ?? '';
      if (/text\/html/i.test(ct)) {
        out.push({ url: item.url, status: 'skip', reason: 'html_response(error page)' });
        appendManifest(dirs, { url: item.url, ok: false, reason: 'html_response' });
        continue;
      }
      const originalName = nameFromDisposition(res.headers['content-disposition'] ?? null);
      const kind = detectKind(buf, originalName);
      if (!kind) {
        out.push({ url: item.url, status: 'skip', reason: 'unrecognized_or_rejected_type' });
        appendManifest(dirs, { url: item.url, ok: false, reason: 'type_rejected' });
        continue;
      }
      const sha = sha256Hex(buf);
      const base = safeFileName(originalName || `${kind}-${Date.now()}`);
      const sub = path.join(dirs.rawAttachments, sha.slice(0, 2));
      fs.mkdirSync(sub, { recursive: true });
      const saved = path.join(sub, `${sha.slice(0, 16)}-${base || kind}`);
      if (!fs.existsSync(saved)) fs.writeFileSync(saved, buf);

      store.setAttachmentMeta(item.sourceId, item.url, {
        sha256: sha,
        sizeBytes: buf.length,
        mimeType: ct.split(';')[0] ?? kind,
        savedPath: saved
      });

      out.push({
        url: item.url, status: 200, kind,
        savedPath: saved, sha256: sha, sizeBytes: buf.length
      });
      appendManifest(dirs, {
        url: item.url, ok: true, kind, sha256: sha, sizeBytes: buf.length, savedPath: saved, originalName: base
      });
    } catch (err) {
      const message = String((err as Error).message);
      out.push({ url: item.url, status: 'skip', reason: message });
      appendManifest(dirs, { url: item.url, ok: false, reason: message });
    }
  }
  const okCount = out.filter((o) => o.status === 200).length;
  console.log(`[attachments] downloaded=${okCount} / ${out.length}`);
  return out;
}

function appendManifest(dirs: ReturnType<typeof ensureDirs>, obj: Record<string, unknown>): void {
  fs.mkdirSync(dirs.manifests, { recursive: true });
  fs.appendFileSync(path.join(dirs.manifests, 'attachments.jsonl'), JSON.stringify({ at: isoNow(), ...obj }) + '\n', 'utf8');
}
function isoNow(): string {
  return new Date().toISOString();
}
