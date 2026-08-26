/**
 * ?꾨쿋??怨듦툒??異붿긽??
 * - openai-compat: OpenAI/OpenRouter ??/v1/embeddings ?명솚 API
 * - ollama: 濡쒖뺄 Ollama (/api/embeddings)
 * - hash: 媛쒕컻쨌?뚯뒪?몄슜 寃곗젙???댁떆 ?꾨쿋???섎? ?놁쓬, ?뚯씠?꾨씪??寃利??꾩슜)
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingOptions {
  provider: 'none' | 'openai' | 'openrouter' | 'ollama' | 'hash';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dim?: number; // hash ?꾩슜
}

export function createEmbeddingProvider(opts: EmbeddingOptions): EmbeddingProvider {
  switch (opts.provider) {
    case 'openai':
    case 'openrouter':
      return new OpenAICompatibleEmbedding(opts);
    case 'ollama':
      return new OllamaEmbedding(opts);
    case 'hash':
      return new HashEmbedding(opts.dim ?? 256);
    case 'none':
    default:
      throw new Error('EMBEDDING_PROVIDER=none ??踰≫꽣 ?뚯씠?꾨씪?몄쓣 ?ъ슜?섎젮硫?怨듦툒?먮? 吏?뺥븯?몄슂.');
  }
}

export class OpenAICompatibleEmbedding implements EmbeddingProvider {
  readonly name: string;
  readonly dim = 1536; // text-embedding-3-small 기본
  private model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: EmbeddingOptions) {
    this.name = opts.provider;
    this.model = opts.model || 'text-embedding-3-small';
    this.baseUrl = (opts.baseUrl || (opts.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : 'https://api.openai.com/v1')).replace(/\/$/, '');
    this.apiKey = opts.apiKey ?? '';
    if (!this.apiKey) throw new Error('EMBEDDING_API_KEY ?꾨씫');
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts })
    });
    if (!res.ok) throw new Error(`embedding API ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
}

export class OllamaEmbedding implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly dim = 768; // nomic-embed-text 기본
  private model: string;
  private baseUrl: string;

  constructor(opts: EmbeddingOptions) {
    this.model = opts.model || 'nomic-embed-text';
    this.baseUrl = (opts.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: t })
      });
      if (!res.ok) throw new Error(`ollama ${res.status}`);
      const json = (await res.json()) as { embedding: number[] };
      out.push(json.embedding);
    }
    return out;
  }
}

/** 寃곗젙???댁떆 ?꾨쿋??媛쒕컻쨌?뚯뒪???꾩슜 ???섎? ?좎궗???놁쓬) */
export class HashEmbedding implements EmbeddingProvider {
  readonly name = 'hash';
  readonly dim: number;

  constructor(dim = 256) {
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0);
    const tokens = text.toLowerCase().split(/[\s.,;:!?()[\]{}"'`~@#$%^&*+=|\\/<>\u3000]+/).filter(Boolean);
    for (const w of tokens) {
      for (let i = 0; i < w.length - 1; i++) {
        const g = w.slice(i, i + 2);
        let h = 2166136261;
        for (let k = 0; k < g.length; k++) h = Math.imul(h ^ g.charCodeAt(k), 16777619);
        v[Math.abs(h) % this.dim] += 1;
      }
    }
    // L2 정규화
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
