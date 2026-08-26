import { describe, it, expect } from 'vitest';
import { KeywordIndex, tokenize } from './keyword.js';
import { HybridRetriever } from './retriever.js';
import type { Chunk, SourceVersion } from '@sen/shared';

function chunk(over: Partial<Chunk>): Chunk {
  return {
    id: 'c1',
    sourceVersionId: 'sv1',
    url: 'https://contract.sen.go.kr/fus/x',
    docTitle: '계약방법 안내',
    sectionPath: [],
    order: 0,
    type: 'paragraph',
    text: '',
    meta: {},
    ...over
  };
}

describe('tokenize', () => {
  it('한글 2gram + 영단어', () => {
    const t = tokenize('낙찰자 결정방법 notice');
    expect(t).toContain('낙찰');
    expect(t).toContain('notice');
  });
});

describe('KeywordIndex', () => {
  const chunks = [
    chunk({ id: 'a', text: '추정가격에 따른 계약방법을 정한다.' }),
    chunk({ id: 'b', text: '낙찰하한율은 별도 기준에 따른다.', docTitle: 'FAQ' }),
    chunk({ id: 'c', text: '계약보증금 면제 조건' })
  ];
  it('관련 문서 상위 검색 + 무관 문서 제외', () => {
    const idx = new KeywordIndex(chunks);
    const hits = idx.search('계약방법 추정가격');
    expect(hits[0]?.chunk.id).toBe('a');
    expect(hits.find((h) => h.chunk.id === 'b')).toBeUndefined();
  });
  it('필터: faqCategory', () => {
    const idx = new KeywordIndex([chunk({ id: 'f', type: 'faq', text: '공사 계약 FAQ 답변', meta: { faqCategory: 'construction' } })]);
    expect(idx.search('공사', 10, { faqCategory: 'construction' })).toHaveLength(1);
    expect(idx.search('공사', 10, { faqCategory: 'goods' })).toHaveLength(0);
  });
});

describe('HybridRetriever 출처 게이트', () => {
  const versions: SourceVersion[] = [
    {
      id: 'sv1', sourceId: 's1', url: 'https://contract.sen.go.kr/fus/x',
      title: '계약방법 안내', menuPath: [], publishedAt: '2025-03-01', effectiveAt: null,
      collectedAt: '2026-08-25T00:00:00Z', lastCheckedAt: '2026-08-25T00:00:00Z',
      contentSha256: 'x', status: 'active', versionIndex: 1
    }
  ];
  const retriever = new HybridRetriever({
    chunks: [chunk({ text: '전자입찰은 나라장터를 통해 실시한다.' })],
    versions,
    llm: undefined
  });

  it('근거 없는 질문 → 답변 거부', async () => {
    const res = await retriever.ask('완전히 무관한 질문 우주선 부품 가격은?');
    expect(res.answered).toBe(false);
    expect(res.refusalReason).toBeTruthy();
    expect(res.hits).toHaveLength(0);
  });

  it('LLM 미설정 시 키워드 결과만 반환 + 공지 표시', async () => {
    const res = await retriever.ask('나라장터 전자입찰');
    expect(res.answered).toBe(false);
    expect(res.providerNotice).toContain('AI 답변 기능이 설정되지 않았습니다');
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]!.sourceUrl).toContain('contract.sen.go.kr');
  });

  it('구버전(inactive) 청크는 강등', async () => {
    const oldVersions = versions.map((v) => ({ ...v, id: 'sv-old', status: 'inactive' as const }));
    const r2 = new HybridRetriever({
      chunks: [
        chunk({ id: 'new', sourceVersionId: 'sv1', text: '계약금액 확인 방법' }),
        chunk({ id: 'old', sourceVersionId: 'sv-old', text: '계약금액 확인 방법 구버전 서술' })
      ],
      versions: [...versions, ...oldVersions]
    });
    const hits = await r2.search('계약금액 확인');
    const newHit = hits.find((h) => h.chunk.id === 'new')!;
    const oldHit = hits.find((h) => h.chunk.id === 'old')!;
    expect(newHit.score).toBeGreaterThan(oldHit.score);
  });
});
