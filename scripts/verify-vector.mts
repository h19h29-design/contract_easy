import fs from 'node:fs';
import { createEmbeddingProvider, createVectorStore, HybridRetriever } from '@sen/retrieval';
import type { Chunk } from '@sen/shared';

/** 벡터 경로가 검색에 실제로 반영되는지 end-to-end 검증(hash+local) */
async function main() {
  const chunks: Chunk[] = JSON.parse(fs.readFileSync('data/app-store/chunks.json', 'utf8'));
  const byId = new Map(chunks.map((c) => [c.id, c]));

  const provider = createEmbeddingProvider({ provider: 'hash', dim: 256 });
  const store = createVectorStore({ kind: 'local', localPath: 'data/app-store/vectors.json' });

  const query = '수의계약 한시적 특례';
  const qv = (await provider.embed([query]))[0]!;
  const vecHits = await store.search(qv, 5);
  console.log('vector top hits:');
  for (const h of vecHits.slice(0, 3)) {
    const c = byId.get(h.payload.chunkId);
    console.log('  score=', h.score.toFixed(3), '|', c?.text.replace(/\s+/g, ' ').slice(0, 60));
  }

  // HybridRetriever에 vectorSearch 주입 → 융합 결과 확인
  const retriever = new HybridRetriever({
    chunks,
    versions: [],
    vectorSearch: async (q, limit) => {
      const v = (await provider.embed([q]))[0]!;
      const hits = await store.search(v, limit);
      return hits.map((h) => {
        const c = byId.get(h.payload.chunkId);
        return {
          chunk: c ?? ({ id: h.payload.chunkId } as unknown as Chunk),
          score: h.score,
          sourceTitle: c?.docTitle ?? '',
          sourceUrl: c?.url ?? ''
        };
      }).filter((h) => h.chunk.text);
    }
  });
  const res = await retriever.search(query, 5);
  console.log('hybrid results:', res.length);
  for (const h of res.slice(0, 2)) {
    console.log('  ', h.chunk.text.replace(/\s+/g, ' ').slice(0, 70));
  }
}
main();
