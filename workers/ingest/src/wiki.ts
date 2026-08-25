import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@sen/config';
import type { NormalizedDoc, SourceVersion } from '@sen/shared';
import { todayIso } from '@sen/shared';

const WIKI_DIR = path.join(REPO_ROOT, 'wiki', 'generated');

/**
 * 매핑 규칙: 구체적 seed 우선, 00(출처 현황)은 마지막 catch-all.
 * d.kind = seed 이름(menuPath[0]).
 */
const WIKI_FILES = [
  { file: '01-계약-전체흐름.md', title: '01. 계약 전체흐름', match: (d: DocInfo) => /흐름/.test(d.key) },
  { file: '02-공사유형-구분.md', title: '02. 공사유형 구분', match: (d: DocInfo) => /계약방법 메인|공사유형/.test(d.key) },
  { file: '03-추정가격별-계약방법.md', title: '03. 추정가격별 계약방법', match: (_d: DocInfo) => false }, // 원문 확보 후 작성
  { file: '04-발주-전-체크리스트.md', title: '04. 발주 전 체크리스트', match: (d: DocInfo) => /체크리스트/.test(d.key) },
  { file: '05-입찰과-수의계약.md', title: '05. 입찰과 수의계약', match: (_d: DocInfo) => false },
  { file: '06-계약체결-서류.md', title: '06. 계약체결 서류', match: (_d: DocInfo) => false },
  { file: '07-착공-감독-변경계약.md', title: '07. 착공·감독·변경계약', match: (_d: DocInfo) => false },
  { file: '08-준공-검사-대금지급.md', title: '08. 준공·검사·대금지급', match: (_d: DocInfo) => false },
  { file: '09-하자관리.md', title: '09. 하자관리', match: (_d: DocInfo) => false },
  { file: '10-부정당업자-제재.md', title: '10. 부정당업자 제재', match: (d: DocInfo) => /부정당업자/.test(d.key) },
  { file: '11-FAQ.md', title: '11. FAQ', match: (d: DocInfo) => d.key.startsWith('FAQ') },
  { file: '12-서식-목록과-사용법.md', title: '12. 서식 목록과 사용법', match: (d: DocInfo) => /서식/.test(d.key) },
  { file: '13-공지사항-모음.md', title: '13. 공지사항 모음(확장 파일)', match: (d: DocInfo) => /공지사항/.test(d.key) },
  { file: '99-폐지·구버전.md', title: '99. 폐지·구버전', match: (d: DocInfo) => d.status === 'inactive' },
  { file: '00-출처와-업데이트현황.md', title: '00. 출처와 업데이트 현황', match: () => true }
];

interface DocInfo {
  key: string; // seed 이름(menuPath[0])
  status: string;
}

/**
 * LLMWiki 생성(결정적 템플릿 + 원문 인용).
 * wiki/generated만 기록하며 wiki/reviewed는 절대 덮어쓰지 않는다.
 * 규칙/숫자 생성 없이 원문 문단을 그대로 인용하고 메타데이터를 붙인다.
 */
export function generateWiki(
  docs: Array<{ doc: NormalizedDoc; version: SourceVersion | null }>
): string[] {
  fs.mkdirSync(WIKI_DIR, { recursive: true });
  const written: string[] = [];
  const now = isoDate();

  const grouped = new Map<string, typeof docs>();
  for (const entry of docs) {
    const info: DocInfo = {
      key: `${entry.version?.menuPath.join('/') ?? ''} ${entry.doc.title}`,

      status: entry.version?.status ?? 'active'
    };
    for (const wf of WIKI_FILES) {
      if (!wf.match(info)) continue;
      if (!grouped.has(wf.file)) grouped.set(wf.file, []);
      grouped.get(wf.file)!.push(entry);
      break;
    }
  }

  for (const wf of WIKI_FILES) {
    const entries = grouped.get(wf.file);
    const lines: string[] = [
      `# ${wf.title}`,
      '',
      '> ⚠️ 이 문서는 자동 생성(LLMWiki generated)입니다. 사람 검토본은 `wiki/reviewed`를 사용하세요.',
      `> 생성시각: ${now} · 원문 외 내용 추가 금지 원칙에 따라 원문 인용만 포함합니다.`,
      ''
    ];
    if (!entries || entries.length === 0) {
      lines.push('_아직 대응하는 수집 자료가 없습니다. 원문이 확보되면 자동 채워집니다._');
    }
    for (const { doc, version } of entries ?? []) {
      const meta = sourceMetaBlock(doc, version);
      lines.push(`## ${doc.title}`);
      lines.push('');
      lines.push(meta);
      lines.push('');
      let lastSection = '';
      for (const block of doc.blocks.slice(0, 400)) {
        if (block.kind === 'heading') {
          if (block.text !== lastSection) {
            lines.push(`### ${block.text}`);
            lines.push('');
            lastSection = block.text;
          }
          continue;
        }
        lines.push(block.kind === 'table-row'
          ? renderTable(block.tableRows ?? block.text.split('\n').map((l) => l.split('|')))
          : `- ${block.text}`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
    const file = path.join(WIKI_DIR, wf.file);
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    written.push(wf.file);
  }
  return written;
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const header = rows[0]!;
  const pad = (r: string[]): string => '| ' + [...r, ...Array(width - r.length).fill('')].join(' | ') + ' |';
  return [pad(header), `|${Array(width).fill(' --- ').join('|')}|`, ...rows.slice(1).map(pad)].join('\n');
}

export function sourceMetaBlock(doc: NormalizedDoc, v: SourceVersion | null): string {
  return [
    '| 항목 | 값 |',
    '| --- | --- |',
    `| 원문 제목 | ${escapePipe(v?.title ?? doc.title)} |`,
    `| 원문 URL | ${v?.url ?? doc.url} |`,
    `| source version ID | ${v?.id ?? doc.sourceVersionId} |`,
    `| 게시일 | ${v?.publishedAt ?? '미확인'} |`,
    `| 시행일 | ${v?.effectiveAt ?? '미확인'} |`,
    `| 수집일 | ${doc.collectedAt.slice(0, 10)} |`,
    `| 마지막 확인일 | ${(v?.lastCheckedAt ?? doc.collectedAt).slice(0, 10)} |`,
    `| 적용 분야 | ${(doc.menuPath[0] ?? '일반')} |`,
    `| 현재 상태 | ${v?.status ?? 'active'} |`,
    `| 검토 상태 | 미검토(자동생성) |`
  ].join('\n');
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function isoDate(): string {
  return todayIso();
}
