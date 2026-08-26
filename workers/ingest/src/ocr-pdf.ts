import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { stableId } from '@sen/shared';
import type { NormalizedDoc } from '@sen/shared';

/**
 * 스캔 PDF OCR 어댑터(tesseract.js kor).
 * - pdf-parse getImage()로 페이지 내장 이미지 추출 → tesseract 인식
 * - 텍스트 PDF에는 사용하지 않음(getText 성공 시 불필요)
 */

export async function ocrPdfToNormalized(
  pdfPath: string,
  provenance: { title?: string }
): Promise<NormalizedDoc | null> {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const worker = await createWorker('kor');
  try {
    const imgRes = await parser.getImage();
    const pageTexts: Array<{ num: number; text: string }> = [];
    let pageNum = 0;
    for (const p of imgRes.pages) {
      pageNum++;
      const imgs = (p as unknown as { images?: Array<{ data: Uint8Array }> }).images ?? [];
      let pageOut = '';
      for (const emb of imgs) {
        const r = await worker.recognize(Buffer.from(emb.data));
        pageOut += (r.data.text ?? '').trim() + '\n';
      }
      const clean = pageOut.replace(/[ \t]+/g, ' ').trim();
      if (clean) pageTexts.push({ num: pageNum, text: clean });
    }

    if (pageTexts.length === 0) return null;
    const blocks: NormalizedDoc['blocks'] = pageTexts.map((p) => ({
      kind: 'paragraph' as const,
      text: `[p.${p.num}] ${p.text}`,
      path: ['첨부', 'OCR', `p.${p.num}`]
    }));

    return {
      sourceVersionId: stableId('ocrdoc', path.basename(pdfPath)),
      url: `file://ocr/${path.basename(pdfPath)}`,
      title: `${provenance.title ?? path.basename(pdfPath)} (OCR)`,
      menuPath: ['첨부', 'OCR'],
      collectedAt: new Date().toISOString(),
      publishedAt: null,
      blocks,
      warnings: ['OCR']
    };
  } finally {
    await worker.terminate().catch(() => undefined);
    await parser.destroy().catch(() => undefined);
  }
}
