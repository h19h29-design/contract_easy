import fs from 'node:fs';
import path from 'node:path';

/**
 * 벡터 스토어 추상화.
 * - qdrant: REST API(공식 SDK 없이 fetch 기반)
 * - local: JSON 파일 저장(개발·소규모 배포용, 외부 서비스 불필요)
 */

export interface VectorPoint {
  id: string;           // 결정적 ID(chunk id 기반)
  vector: number[];
  payload: { chunkId: string };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: { chunkId: string };
}

export interface VectorStore {
  readonly name: string;
  ensureCollection(dim: number): Promise<void>;
  upsert(points: VectorPoint[]): Promise<void>;
  search(vector: number[], limit: number): Promise<VectorSearchResult[]>;
  close?(): Promise<void>;
}

export interface VectorStoreOptions {
  kind: 'qdrant' | 'local';
  qdrantUrl?: string;
  qdrantCollection?: string;
  localPath?: string;
}

export function createVectorStore(opts: VectorStoreOptions): VectorStore {
  return opts.kind === 'qdrant'
    ? new QdrantVectorStore(opts.qdrantUrl ?? 'http://localhost:16333', opts.qdrantCollection ?? 'sen_contract_chunks')
    : new LocalJsonVectorStore(opts.localPath ?? path.resolve('data/app-store/vectors.json'));
}

/* ---------------- Qdrant (REST) ---------------- */

class QdrantVectorStore implements VectorStore {
  readonly name = 'qdrant';
  private collectionCreated = false;

  constructor(private url: string, private collection: string) {}

  async ensureCollection(dim: number): Promise<void> {
    if (this.collectionCreated) return;
    const res = await fetch(`${this.url}/collections/${this.collection}`, { method: 'GET' });
    if (res.status === 404) {
      const put = await fetch(`${this.url}/collections/${this.collection}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vectors: { size: dim, distance: 'Cosine' } })
      });
      if (!put.ok) throw new Error(`qdrant create collection ${put.status}: ${(await put.text()).slice(0, 120)}`);
    } else if (!res.ok) {
      throw new Error(`qdrant get collection ${res.status}`);
    }
    this.collectionCreated = true;
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    const res = await fetch(`${this.url}/collections/${this.collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })) })
    });
    if (!res.ok) throw new Error(`qdrant upsert ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }

  async search(vector: number[], limit: number): Promise<VectorSearchResult[]> {
    const res = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vector, limit, with_payload: true })
    });
    if (!res.ok) throw new Error(`qdrant search ${res.status}`);
    const json = (await res.json()) as { result: Array<{ id: string | number; score: number; payload?: { chunkId?: string } }> };
    return json.result.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: { chunkId: r.payload?.chunkId ?? '' }
    }));
  }
}

/* ---------------- Local JSON ---------------- */

interface LocalFile {
  dim: number;
  points: Record<string, { vector: number[]; chunkId: string }>;
}

export class LocalJsonVectorStore implements VectorStore {
  readonly name = 'local';
  private file: string;
  private data: LocalFile = { dim: 0, points: {} };

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    if (fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')) as LocalFile; } catch { /* 재생성 */ }
    }
  }

  async ensureCollection(_dim: number): Promise<void> { /* 로컬은 dim 가변 */ }

  async upsert(points: VectorPoint[]): Promise<void> {
    for (const p of points) {
      this.data.dim = p.vector.length || this.data.dim;
      this.data.points[p.id] = { vector: p.vector, chunkId: p.payload.chunkId };
    }
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  async search(vector: number[], limit: number): Promise<VectorSearchResult[]> {
    const out: VectorSearchResult[] = [];
    for (const [id, p] of Object.entries(this.data.points)) {
      if (p.vector.length !== vector.length) continue;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < vector.length; i++) {
        dot += vector[i]! * p.vector[i]!;
        na += vector[i]! ** 2;
        nb += p.vector[i]! ** 2;
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      out.push({ id, score: denom ? dot / denom : 0, payload: { chunkId: p.chunkId } });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}
