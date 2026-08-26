import type {
  AskResult, Chunk, SearchFilters, SearchHit, SourceVersion
} from '@sen/shared';
import { KeywordIndex } from './keyword.js';

export interface LlmProvider {
  name: string;
  available(): boolean;
  /** 근거 청크들로부터 답변 생성. 근거가 없으면 호출되지 않는다(게이트에서 차단). */
  answer(question: string, evidence: SearchHit[]): Promise<string | null>;
}

export class NoneLlmProvider implements LlmProvider {
  name = 'none';
  available() { return false; }
  async answer(): Promise<string | null> { return null; }
}

export interface RetrievalDeps {
  chunks: Chunk[];
  versions: SourceVersion[]; // 최신 버전 목록(유효성/최신성 판단)
  llm?: LlmProvider;
  vectorSearch?: (query: string, limit: number) => Promise<SearchHit[]>;
}

const NO_EVIDENCE_REFUSAL =
  '근거가 되는 원문을 찾지 못했습니다. 원문 근거 없이는 답변을 생성하지 않습니다.\n키워드 검색으로 관련 문서를 찾아보시거나 질문을 바꾸어 시도해 주세요.';
const PROVIDER_UNSET_NOTICE =
  '현재 AI 답변 기능이 설정되지 않았습니다.\n키워드 검색 결과를 표시합니다.';

/** 출처 우선순위(01_BLUEPRINT §4) — 높을수록 신뢰 */
function sourcePriority(url: string): number {
  if (/law\.go\.kr|moleg/.test(url)) return 6;
  if (/mois\.go\.kr/.test(url)) return 5;
  if (/sen\.go\.kr/.test(url)) return 4;
  return 1;
}

/**
 * 하이브리드 검색: 키워드 + (옵션)벡터 + 메타필터 → 병합 → 중복제거 → rerank
 * → 최신 시행일 우선 + 유효 문서 우선
 */
export class HybridRetriever {
  private index: KeywordIndex;
  private versionById: Map<string, SourceVersion>;

  constructor(private deps: RetrievalDeps) {
    this.index = new KeywordIndex(deps.chunks);
    this.versionById = new Map(deps.versions.map((v) => [v.id, v]));
  }

  search(query: string, limit = 10, filters?: SearchFilters): SearchHit[] {
    const kwHits = this.index.search(query, limit * 4, filters);
    const byId = new Map<string, SearchHit>();
    for (const h of kwHits) byId.set(h.chunk.id, h);
    // 벡터 경로는 옵션(EMBEDDING_PROVIDER=none이면 생략)
    const merged = [...byId.values()];
    for (const h of merged) {
      h.score += sourcePriority(h.sourceUrl) * 0.3;
      const v = this.versionById.get(h.chunk.sourceVersionId);
      if (v?.status === 'inactive') h.score -= 2; // 구버전 강등(삭제는 안 함)
      if (h.effectiveAt) h.score += 0.5; // 시행일 명시 문서 가산
    }
    merged.sort((a, b) => b.score - a.score);

    // 소스 다양성 캡: 동일 문서가 상위를 독점하지 않도록 최대 3건
    const perSource = new Map<string, number>();
    const diverse: SearchHit[] = [];
    for (const h of merged) {
      const n = perSource.get(h.chunk.sourceVersionId) ?? 0;
      if (n >= 3) continue;
      perSource.set(h.chunk.sourceVersionId, n + 1);
      diverse.push(h);
    }
    return diverse.slice(0, limit);
  }

  async ask(question: string, filters?: SearchFilters): Promise<AskResult> {
    const hits = this.search(question, 8, filters);
    const strongEvidence = hits.filter((h) => h.score > 0);
    if (strongEvidence.length === 0) {
      return { answered: false, refusalReason: NO_EVIDENCE_REFUSAL, hits: [] };
    }
    const llm = this.deps.llm;
    if (!llm || !llm.available()) {
      return { answered: false, refusalReason: undefined, hits: strongEvidence, providerNotice: PROVIDER_UNSET_NOTICE };
    }
    const answer = await llm.answer(question, strongEvidence);
    if (!answer) {
      return { answered: false, refusalReason: '답변 생성에 실패했습니다. 근거를 직접 확인해 주세요.', hits: strongEvidence };
    }
    return { answered: true, answer, hits: strongEvidence };
  }
}
