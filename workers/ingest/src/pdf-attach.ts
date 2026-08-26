import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import {
  stableId, isoNow,
  type NormalizedDoc
} from '@sen/shared';

/**
 * PDF 첨부 → NormalizedDoc 어댑터(pdf-parse v2).
 * - 페이지 번호 보존([p.N] 접두 블록)
 * - 텍스트가 거의 없는 스캔 PDF는 null 반환(내용 생성 금지)
 */

export async function pdfFileToNormalized(
  filePath: string,
  provenance: { url?: string; title?: string; collectedAt?: string }
): Promise<NormalizedDoc | null> {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const raw = result.text ?? '';

    // 페이지 구분: v2는 pages 배열 제공(각 page.text), 없으면 \f 폴백
    type P = { text?: string; num?: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pagesAny: P[] = (result as any).pages ?? [];
    let pageTexts: Array<{ num: number; text: string }> = [];
    if (Array.isArray(pagesAny) && pagesAny.length > 0) {
      pageTexts = pagesAny.map((p, i) => ({ num: p.num ?? i + 1, text: p.text ?? '' }));
    } else {
      const parts = raw.split('\f');
      pageTexts = parts.map((t, i) => ({ num: i + 1, text: t }));
    }

    const blocks: NormalizedDoc['blocks'] = [];
    for (const p of pageTexts) {
      const clean = (p.text ?? '').replace(/[ \t\u00a0]+/g, ' ').trim();
      if (!clean) continue;
      blocks.push({ kind: 'paragraph', text: `[p.${p.num}] ${clean}`, path: ['첨부', `p.${p.num}`] });
    }
    if (blocks.length === 0) return null;

    const base = path.basename(filePath);
    const title = provenance.title?.trim()
      ? `${provenance.title} (PDF 첨부)`
      : `${base} (PDF 첨부)`;

    return {
      sourceVersionId: stableId('attdoc', filePath),
      url: provenance.url ?? `file://${filePath}`,
      title,
      menuPath: ['첨부', 'PDF'],
      collectedAt: provenance.collectedAt ?? isoNow(),
      publishedAt: null,
      blocks,
      warnings: []
    };
  } catch {
    return null; // 파서 실패 → 상위에서 스킵(로그)
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** 디렉터리의 PDF 파일 나열 */
export function listPdfFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (f.toLowerCase().endsWith('.pdf')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}
