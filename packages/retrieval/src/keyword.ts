import type { Chunk, SearchFilters, SearchHit } from '@sen/shared';

/** 한국어 토크나이저: 공백·구두점 분리 + 2gram (파일 인덱스용, 외부 의존성 없음) */
export function tokenize(text: string): string[] {
  const norm = text.toLowerCase();
  const words = norm.split(/[\s.,;:!?()[\]{}"'`~@#$%^&*+=|\\/<>\u3000·…—–-]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const w of words) {
    if (/^[a-z0-9]+$/.test(w)) { tokens.push(w); continue; }
    // 한글/혼합어: 2그램 슬라이딩
    if (w.length <= 2) { tokens.push(w); continue; }
    for (let i = 0; i < w.length - 1; i++) tokens.push(w.slice(i, i + 2));
    tokens.push(w);
  }
  return tokens;
}

export class KeywordIndex {
  private postings = new Map<string, Set<string>>();
  private docs = new Map<string, Chunk>();

  constructor(chunks: Chunk[] = []) {
    this.addAll(chunks);
  }

  addAll(chunks: Chunk[]): void {
    for (const c of chunks) this.add(c);
  }

  add(chunk: Chunk): void {
    this.docs.set(chunk.id, chunk);
    for (const t of new Set(tokenize(chunk.text))) {
      let set = this.postings.get(t);
      if (!set) this.postings.set(t, (set = new Set()));
      set.add(chunk.id);
    }
  }

  size(): number {
    return this.docs.size;
  }

  /** BM25 유사 스코어(간이): TF * idf 합 + 제목 부스트 */
  search(query: string, limit = 20, filters?: SearchFilters): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    const scores = new Map<string, number>();
    const N = this.docs.size || 1;
    for (const term of terms) {
      const ids = this.postings.get(term);
      if (!ids) continue;
      const idf = Math.log(1 + N / ids.size);
      for (const id of ids) {
        const chunk = this.docs.get(id)!;
        const tf = countOccurrences(chunk.text.toLowerCase(), term);
        const titleBoost = chunk.docTitle.toLowerCase().includes(term) ? 1.5 : 0;
        scores.set(id, (scores.get(id) ?? 0) + tf * idf * (1 + titleBoost));
      }
    }
    const hits: SearchHit[] = [];
    for (const [id, score] of scores) {
      const chunk = this.docs.get(id)!;
      if (!passesFilters(chunk, filters)) continue;
      hits.push({ chunk, score, sourceTitle: chunk.docTitle, sourceUrl: chunk.url, publishedAt: chunk.meta.publishedAt ?? null, effectiveAt: chunk.meta.effectiveAt ?? null });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}

function passesFilters(c: Chunk, f?: SearchFilters): boolean {
  if (!f) return true;
  if (f.contractType && c.meta.contractType !== f.contractType) return false;
  if (f.docTypes && !f.docTypes.includes(c.type)) return false;
  if (f.faqCategory && c.meta.faqCategory !== f.faqCategory) return false;
  if (f.stage && c.meta.stage !== f.stage) return false;
  if (f.publishedAfter && (!c.meta.publishedAt || c.meta.publishedAt < f.publishedAfter)) return false;
  if (f.publishedBefore && (!c.meta.publishedAt || c.meta.publishedAt > f.publishedBefore)) return false;
  return true;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos >= 0) {
    count++;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}
