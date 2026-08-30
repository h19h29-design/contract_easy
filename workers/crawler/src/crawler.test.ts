import { describe, it, expect } from 'vitest';
import { robotsAllows } from '@sen/shared';
import { collectTargets, isAttachmentDownloadAllowed, type CrawlContext } from './core.js';
import { parseRobots } from './robots.js';
import type { PageSnapshot } from '@sen/shared';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { detectKind } from './attachments.js';

const ctxBase = {
  client: {} as never,
  robots: { fetched: true, status: 200, rules: [], raw: '' },
  baseOrigin: 'https://contract.sen.go.kr',
  allowDomains: ['contract.sen.go.kr'],
  allowPathPrefixes: ['/fus/'],
  denyQueryKeys: ['session'],
  downloadExtensions: ['pdf', 'hwp', 'zip'],
  manifestsDir: '', rawHtmlDir: '', attachmentsDir: '',
  artifactsDir: null
} as unknown as CrawlContext;

function snapshot(over: Partial<PageSnapshot>): PageSnapshot {
  return {
    url: 'https://contract.sen.go.kr/fus/list',
    finalUrl: 'https://contract.sen.go.kr/fus/list',
    status: 200, title: '목록', htmlLength: 0, bodyTextLength: 0,
    links: [], attachments: [], fetchedAt: '', sha256: 'x',
    ...over
  };
}

describe('pagination 종료 조건 대비 링크 수집', () => {
  it('상세 링크와 다음페이지 분리, 외부링크는 메타만', () => {
    const snap = snapshot({
      links: [
        { url: 'https://contract.sen.go.kr/fus/b/view.do?seq=10&menu=1', text: '공지사항 제목 A', internal: true },
        { url: 'https://contract.sen.go.kr/fus/b/list0010v.do?pageIndex=2', text: '다음', internal: true },
        { url: 'https://law.go.kr/법령/1234', text: '관련법령', internal: false }
      ]
    });
    const t = collectTargets(ctxBase, snap);
    expect(t.detailUrls.has('https://contract.sen.go.kr/fus/b/view.do?seq=10&menu=1')).toBe(true);
    expect(t.nextPageUrl).toContain('pageIndex=2');
    expect(t.externalLinks).toHaveLength(1);
    expect(t.externalLinks[0]!.url).toContain('law.go.kr');
  });
});

describe('첨부 다운로드 정책(robots 준수)', () => {
  it('기본 설정(allowAttachments=false)은 전부 차단', () => {
    expect(isAttachmentDownloadAllowed(ctxBase, 'pdf', [], '/fus/a.pdf')).toBe(false);
  });

  it('robots Disallow 확장자는 설정이 true여도 차단(D-001)', () => {
    process.env.CRAWL_ALLOW_ATTACHMENTS = 'true';
    try {
      const rules = [{ type: 'disallow' as const, pattern: '/*.hwp$' }];
      expect(isAttachmentDownloadAllowed(ctxBase, 'hwp', rules, '/fus/file.hwp')).toBe(false);
      // robots에 없는 확장자(pdf)는 허용 로직 통과
      expect(isAttachmentDownloadAllowed(ctxBase, 'pdf', rules, '/fus/data.pdf')).toBe(true);
    } finally {
      delete process.env.CRAWL_ALLOW_ATTACHMENTS;
    }
  });
});

describe('robots.txt 파싱(fixture)', () => {
  it('실제 사이트 형태 파싱', () => {
    const parsed = parseRobots(`User-agent: *\nAllow: /\nDisallow: /*.pdf$\nDisallow: /*.hwp$`);
    expect(parsed).toEqual([
      { type: 'allow', pattern: '/' },
      { type: 'disallow', pattern: '/*.pdf$' },
      { type: 'disallow', pattern: '/*.hwp$' }
    ]);
    expect(robotsAllows('/fus/list0010v.do', parsed)).toBe(true);
    expect(robotsAllows('/file/download.pdf', parsed)).toBe(false);
  });
});

describe('fixture 파일 해시·MIME 기록 검증', () => {
  it('샘플 파일 생성→SHA-256→격리 이동 흐름', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-fix-'));
    const file = path.join(dir, 'sample.pdf');
    // 최소 PDF 헤더를 가진 더미(실행하지 않음, 검증 전용)
    fs.writeFileSync(file, Buffer.from('%PDF-1.4\n% fixture\n'));
    const buf = fs.readFileSync(file);
    const sha = createHash('sha256').update(buf).digest('hex');
    expect(sha).toHaveLength(64);

    const quarantine = path.join(dir, 'quarantine');
    fs.mkdirSync(quarantine, { recursive: true });
    fs.renameSync(file, path.join(quarantine, 'sample.pdf'));
    expect(fs.existsSync(path.join(quarantine, 'sample.pdf'))).toBe(true);
  });
});

describe('첨부 magic 형식 감지 호환성', () => {
  it('PDF·ZIP·OLE 매직을 기존 형식으로 유지한다', () => {
    expect(detectKind(Buffer.from('%PDF-1.4\n'), 'notice.pdf')).toBe('pdf');
    expect(detectKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'notice.docx')).toBe('docx');
    expect(detectKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), 'notice.hwp')).toBe('hwp');
  });
});
