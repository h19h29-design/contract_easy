import { describe, it, expect } from 'vitest';
import { htmlToNormalized, docToChunks } from './normalize.js';
import { extractRuleCandidates, candidatesToDraftRules } from './rules-extract.js';
import type { SourceVersion } from '@sen/shared';

const HTML = `
<html><head><title>사전체크리스트</title></head><body>
<h2>발주 전 확인</h2>
<p>예산 확보 여부를 확인한다.</p>
<table><tr><th>항목</th><th>확인</th></tr><tr><td>설계용량</td><td>검토필요</td></tr></table>
<p>제출 서류는 사업계획서와 설계도서다.</p>
<script>hidden()</script>
</body></html>`;

const version: SourceVersion = {
  id: 'sv-test', sourceId: 's1', url: 'https://contract.sen.go.kr/fus/t',
  title: '사전체크리스트', menuPath: ['공지사항'],
  collectedAt: '2026-08-25T00:00:00Z', lastCheckedAt: '2026-08-25T00:00:00Z',
  contentSha256: 'x', status: 'active', versionIndex: 1
};

describe('HTML → normalized document (통합)', () => {
  const doc = htmlToNormalized(version.id, version.url, version.title, version.menuPath, version.collectedAt, HTML);

  it('제목·메뉴경로 보존', () => {
    expect(doc.title).toBe('사전체크리스트');
    expect(doc.menuPath).toContain('공지사항');
  });
  it('문단 순서 보존 + script 제거', () => {
    const texts = doc.blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text);
    expect(texts.some((t) => t.includes('예산 확보'))).toBe(true);
    expect(texts.join('\n')).not.toContain('hidden');
  });
  it('표 구조 보존(table-row 블록)', () => {
    const table = doc.blocks.find((b) => b.kind === 'table-row');
    expect(table?.tableRows?.[0]).toEqual(['항목', '확인']);
    expect(table?.tableRows?.[1]).toEqual(['설계용량', '검토필요']);
  });
  it('청크 변환: 타입·원문 추적 유지', () => {
    const chunks = docToChunks(doc);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.sourceVersionId).toBe('sv-test');
      expect(c.url).toBe(version.url);
    }
    expect(chunks.some((c) => c.type === 'table-row')).toBe(true);
    expect(chunks.every((c, _i, arr) => arr.find((x) => x.order === c.order))).toBe(true);
  });
});

describe('규칙 후보 추출(draft 전용)', () => {
  it('금액/기간/서류 문장을 후보로 추출하고 판단값은 비움', () => {
    const text = '추정가격이 5억 원 이하인 경우에는 제안서를 제출해야 하며, 견적 제출 기간은 15일 이상으로 한다. 낙찰자 결정방법은 예정가격 이하 자 중 최저가자로 한다.';
    const fakeChunk = {
      id: 'c1', sourceVersionId: 'sv1', url: 'https://x/fus/1',
      docTitle: '테스트', sectionPath: [], order: 0,
      type: 'paragraph' as const, text, meta: {}
    };
    const cands = extractRuleCandidates([fakeChunk]);
    expect(cands.length).toBeGreaterThan(0);
    const drafts = candidatesToDraftRules(cands);
    for (const d of drafts) {
      expect(d.status).toBe('draft'); // 절대 active 아님
      expect(d.output.method).toBeUndefined(); // 판단값 없음
      expect(d.source.url).toBeTruthy();
      expect(d.output.message).toContain('승인');
    }
  });

  it('일반 문장은 후보로 추출하지 않음', () => {
    const plain = { id: 'c9', sourceVersionId: 'sv', url: 'u', docTitle: 't', sectionPath: [], order: 0, type: 'paragraph' as const, text: '오늘 날씨가 좋습니다.', meta: {} };
    expect(extractRuleCandidates([plain])).toHaveLength(0);
  });
});
