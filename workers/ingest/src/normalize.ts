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

/** 정규화 문서 → 타입별 청크 (표는 행 단위 분할, 긴 문단은 분할) */
export function docToChunks(doc: NormalizedDoc): Chunk[] {
  const chunks: Chunk[] = [];
  let order = 0;
  const seedName = doc.menuPath[0] ?? '';
  const isFaqSeed = /^FAQ/i.test(seedName);
  const faqCategory = mapFaqCategory(seedName);

  const push = (type: ChunkType, text: string, path: string[]) => {
    chunks.push({
      id: stableId('chunk', doc.sourceVersionId, order),
      sourceVersionId: doc.sourceVersionId,
      url: doc.url,
      docTitle: doc.title,
      sectionPath: path,
      order: order++,
      type,
      text,
      meta: {
        publishedAt: doc.publishedAt ?? null,
        collectedAt: doc.collectedAt,
        faqCategory
      }
    });
  };

  for (const block of doc.blocks) {
    // 표: 행 단위 청크(헤더 행은 각 행 앞에 맥락으로 부착하지 않고 별도 1행 유지)
    if (block.kind === ('table-row' as ChunkType) && block.tableRows && block.tableRows.length > 1) {
      const header = block.tableRows[0]!.filter(Boolean).join(' | ');
      push('table-row', header, block.path); // 헤더 자체도 검색 가능
      for (let i = 1; i < block.tableRows.length; i++) {
        const cells = block.tableRows[i]!.filter(Boolean);
        if (cells.length === 0) continue;
        const rowText = cells.join(' | ');
        const text = `${header}\n${rowText}`; // 열 의미 보존을 위해 헤더를 함께 저장
        push('table-row', text.length > 1200 ? rowText : text, block.path);
      }
      continue;
    }

    // 문단: 과대 청크 방지를 위한 길이 분할
    if (block.text.length > 1500) {
      for (const piece of splitLong(block.text)) {
        push(block.kind, piece, block.path);
      }
      continue;
    }

    const type: ChunkType = block.kind === 'heading'
      ? 'heading'
      : isFaqSeed ? 'faq' : block.kind;
    push(type, block.text, block.path);
  }
  return chunks;
}

/** 문장 경계 우선으로 ~900자 단위 분할 */
function splitLong(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const sent of text.split(/(?<=[.!?다])\s+/)) {
    if ((buf + ' ' + sent).length > 900 && buf) {
      out.push(buf.trim());
      buf = sent;
    } else {
      buf += (buf ? ' ' : '') + sent;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
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
