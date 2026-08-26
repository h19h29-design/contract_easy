import fs from 'node:fs';
import { createEmbeddingProvider, createVectorStore } from './index.js';

/**
 * 청크 → 임베딩 → 벡터 스토어 적재 CLI 로직.
 * 사용: pnpm embed:index
 * 필수 env: EMBEDDING_PROVIDER(hash|openai|openrouter|ollama), EMBEDDING_API_KEY(외부 시)
 * 선택: EMBEDDING_MODEL, EMBEDDING_DIM(hash 기본 256),
 *       VECTOR_STORE(local|qdrant), QDRANT_URL, QDRANT_COLLECTION
 */

export interface EmbedIndexOptions {
  chunksFile: string;
  provider: NonNullable<Parameters<typeof createEmbeddingProvider>[0]['provider']> extends infer P ? P : never;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dim?: number;
  store: 'local' | 'qdrant';
  qdrantUrl?: string;
  qdrantCollection?: string;
  localPath?: string;
  batchSize?: number;
}

export async function runEmbedIndex(o: EmbedIndexOptions): Promise<{ points: number; batches: number }> {
  if (!fs.existsSync(o.chunksFile)) throw new Error(`chunks.json 없음: ${o.chunksFile}`);
  const chunks: Array<{ id: string; text: string }> =
    JSON.parse(fs.readFileSync(o.chunksFile, 'utf8'));
  console.log(`[embed-index] chunks=${chunks.length} provider=${o.provider} store=${o.store}`);

  const provider = createEmbeddingProvider({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: o.provider as any,
    apiKey: o.apiKey,
    baseUrl: o.baseUrl,
    model: o.model,
    dim: o.dim
  });
  const store = createVectorStore({
    kind: o.store,
    qdrantUrl: o.qdrantUrl,
    qdrantCollection: o.qdrantCollection,
    localPath: o.localPath
  });

  const BATCH = o.batchSize ?? 64;
  let done = 0;
  let batches = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vectors = await provider.embed(batch.map((c) => c.text.slice(0, 4000)));
    if (batches === 0) await store.ensureCollection(vectors[0]!.length);
    const points = batch.map((c, j) => ({
      // 결정적 숫자 ID(40bit): 동일 청크 재적재 시 upsert(멱등)
      id: String(parseInt(c.id.slice(0, 10), 16)),
      vector: vectors[j]!,
      payload: { chunkId: c.id }
    }));
    await store.upsert(points);
    done += batch.length;
    batches++;
    if (batches % 10 === 0 || done >= chunks.length) {
      console.log(`[embed-index] ${done}/${chunks.length}`);
    }
  }
  await store.close?.();
  return { points: done, batches };
}
