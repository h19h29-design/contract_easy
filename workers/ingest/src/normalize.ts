import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import {
  type NormalizedDoc, type Chunk, type ChunkType, stableId
} from '@sen/shared';

export function htmlToNormalized(
  sourceVersionId: string,
  url: string,
  title: string,
  menuPath: string[],
  collectedAt: string,
  rawHtml: string
): NormalizedDoc {
  const $ = cheerio.load(rawHtml);
  $('script, style, noscript, iframe').remove();
  const blocks: NormalizedDoc['blocks'] = [];

  // 표 보존: 각 table → 행 배열 → table-row 블록
  $('table').each((_i, table) => {
    const rows: string[][] = [];
    $(table).find('tr').each((_r, tr) => {
      const cells: string[] = [];
      $(tr).find('th, td').each((_c, cell) => {
        cells.push(($(cell).text() || '').replace(/\s+/g, ' ').trim());
      });
      if (cells.some(Boolean)) rows.push(cells);
    });
    if (rows.length) {
      blocks.push({
        kind: 'table-row',
        text: rows.map((r) => r.join(' | ')).join('\n'),
        path: [...menuPath, '표'],
        tableRows: rows
      });
    }
    $(table).remove(); // 본문 중복 방지
  });

  // 제목/문단/목록 순서 보존
  let currentSection = '';
  $('body').find('h1, h2, h3, h4, p, li').each((_i, el) => {
    const tag = (el as unknown as { tagName?: string }).tagName?.toLowerCase() ?? '';
    const text = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;
    if (/^h[1-4]$/.test(tag)) {
      currentSection = text;
      blocks.push({ kind: 'heading', text, path: [...menuPath, text] });
      return;
    }
    const kind: ChunkType = tag === 'li' ? 'paragraph' : 'paragraph';
    blocks.push({
      kind,
      text,
      path: currentSection ? [...menuPath, currentSection] : [...menuPath]
    });
  });

  return {
    sourceVersionId, url,
    title,
    menuPath,
    collectedAt,
    publishedAt: null,
    blocks,
    warnings: blocks.length === 0 ? ['MANUAL_REVIEW_REQUIRED'] : []
  };
}

/** 정규화 문서 → 타입별 청크 */
export function docToChunks(doc: NormalizedDoc): Chunk[] {
  const chunks: Chunk[] = [];
  let order = 0;
  const seedName = doc.menuPath[0] ?? '';
  const isFaqSeed = /^FAQ/i.test(seedName);
  const faqCategory = mapFaqCategory(seedName);

  for (const block of doc.blocks) {
    const type: ChunkType = block.kind === 'heading'
      ? 'heading'
      : isFaqSeed ? 'faq' : block.kind;
    chunks.push({
      id: stableId('chunk', doc.sourceVersionId, order),
      sourceVersionId: doc.sourceVersionId,
      url: doc.url,
      docTitle: doc.title,
      sectionPath: block.path,
      order: order++,
      type,
      text: block.text,
      meta: {
        publishedAt: doc.publishedAt ?? null,
        collectedAt: doc.collectedAt,
        faqCategory
      }
    });
  }
  return chunks;
}

/** FAQ 시드명 → 검색 필터용 카테고리 */
function mapFaqCategory(seedName: string): string | null {
  if (seedName.includes('계약일반')) return 'general';
  if (seedName.includes('물품')) return 'goods';
  if (seedName.includes('용역')) return 'service';
  if (seedName.includes('공사')) return 'construction';
  return null;
}

export function saveNormalizedMarkdown(normalizedMarkdownDir: string, doc: NormalizedDoc): string {
  fs.mkdirSync(normalizedMarkdownDir, { recursive: true });
  const file = path.join(normalizedMarkdownDir, `${doc.sourceVersionId}.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8');
  return file;
}
