import type { Chunk, SearchFilters, SearchHit } from '@sen/shared';

/** 질문형 문장에서 정보량 없는 토큰 제외용 최소 불용어 */
const STOPWORDS = new Set([
  '알려', '주세요', '찾아', '보여', '궁금', '어떻게', '무엇', '어디서', '어느',
  '하게', '하기', '했나', '인가요', '나요', '가요', '인지'
]);

/** 한국어 토크나이저: 공백·구두점 분리 + 2gram (파일 인덱스용, 외부 의존성 없음) */
export function tokenize(text: string): string[] {
  const norm = text.toLowerCase();
  const words = norm.split(/[\s.,;:!?()[\]{}"'`~@#$%^&*+=|\\/<>\u3000·…—–-]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const w of words) {
    if (/^[a-z0-9]+$/.test(w)) { tokens.push(w); continue; }
    if (STOPWORDS.has(w)) continue;
    // 한글/혼합어: 2그램 슬라이딩
    if (w.length <= 2) { tokens.push(w); continue; }
    for (let i = 0; i < w.length - 1; i++) {
      const g = w.slice(i, i + 2);
      if (STOPWORDS.has(g)) continue;
      tokens.push(g);
    }
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

  /** BM25 유사 스코어(간이): TF·idf + 전체 단어 일치 강보너스 + 단어 커버리지 가산 */
  search(query: string, limit = 20, filters?: SearchFilters): SearchHit[] {
    const N = this.docs.size || 1;
    // 1) 전체 단어(완전 일치) 우선 채점
    const rawWords = query
      .toLowerCase()
      .split(/[\s.,;:!?()[\]{}"'`~@#$%^&*+=|\\/<>\u3000·…—–-]+/)
      .filter((w) => w && !STOPWORDS.has(w));
    const words = [...new Set(rawWords)];
    const scores = new Map<string, number>();
    const matchedWords = new Map<string, Set<string>>();

    for (const rawW of words) {
      // 조사 제거 변형 중 인덱스에 존재하는 형태를 찾아 매칭 (예: 계약흐름도를→계약흐름도)
      let key = rawW;
      if (!this.postings.has(key)) key = stripJosa(rawW);
      if (!this.postings.has(key)) continue;
      const ids = this.postings.get(key)!;
      const idf = Math.log(1 + N / ids.size);
      for (const id of ids) {
        const chunk = this.docs.get(id)!;
        const contains = chunk.text.toLowerCase().includes(key);
        const titleHit = chunk.docTitle.toLowerCase().includes(key);
        const boost = contains ? (key.length >= 3 ? 6 : 3) : 1;
        scores.set(id, (scores.get(id) ?? 0) + boost * idf * (titleHit ? 1.5 : 1));
        const set = matchedWords.get(id) ?? new Set<string>();
        set.add(key);
        matchedWords.set(id, set);
      }
    }

    // 2) 2그램 보조 채점(부분 일치 완화용, 낮은 가중)
    const terms = [...new Set(tokenize(query))];
    for (const term of terms) {
      const ids = this.postings.get(term);
      if (!ids) continue;
      const idf = Math.log(1 + N / ids.size);
      for (const id of ids) {
        const chunk = this.docs.get(id)!;
        const tf = countOccurrences(chunk.text.toLowerCase(), term);
        scores.set(id, (scores.get(id) ?? 0) + 0.3 * tf * idf);
      }
    }

    const hits: SearchHit[] = [];
    for (const [id, score] of scores) {
      const chunk = this.docs.get(id)!;
      if (!passesFilters(chunk, filters)) continue;
      const coverage = words.length > 0
        ? (matchedWords.get(id)?.size ?? 0) / words.length
        : 0;
      hits.push({
        chunk,
        score: score * (1 + coverage),
        sourceTitle: chunk.docTitle,
        sourceUrl: chunk.url,
        publishedAt: chunk.meta.publishedAt ?? null,
        effectiveAt: chunk.meta.effectiveAt ?? null
      });
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

/** 조사 제거(2회까지 반복): 계약흐름도를→계약흐름도, 예산으로→예산 */
const JOSA = [
  '에서는', '으로는', '이는', '가는', '을', '를', '이', '가', '은', '는',
  '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '부터', '까지',
  '보다', '처럼', '만큼', '이라', '라는', '이다', '이다'
];

export function stripJosa(word: string): string {
  let w = word;
  for (let round = 0; round < 2; round++) {
    for (const j of JOSA) {
      if (w.length > j.length + 1 && w.endsWith(j)) {
        w = w.slice(0, -j.length);
        break;
      }
    }
  }
  return w;
}
