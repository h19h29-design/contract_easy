export type CrawlKind =
  | 'guide'
  | 'dynamic-contract-selector'
  | 'flow'
  | 'checklist'
  | 'paginated-board'
  | 'board-detail'
  | 'procedure'
  | 'other';

export interface AttachmentRef {
  url: string;
  fileName: string;
  ext: string;
  /** robots.txt Disallow 확장자면 true → 다운로드 금지(D-001) */
  robotsDisallowed: boolean;
  /** 실제 다운로드된 경우에만 존재 */
  sha256?: string;
  sizeBytes?: number;
  mimeType?: string;
  savedPath?: string;
}

export interface LinkRef {
  url: string;
  text: string;
  internal: boolean;
}

export interface PageSnapshot {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  htmlLength: number;
  bodyTextLength: number;
  links: LinkRef[];
  attachments: AttachmentRef[];
  fetchedAt: string; // ISO
  sha256: string;
  headers?: Record<string, string>;
}

export interface SourceVersion {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  menuPath: string[];
  publishedAt?: string | null;
  effectiveAt?: string | null;
  collectedAt: string;
  lastCheckedAt: string;
  contentSha256: string;
  rawHtmlPath?: string;
  status: 'active' | 'inactive';
  versionIndex: number;
}

export type ChunkType =
  | 'heading'
  | 'paragraph'
  | 'table-row'
  | 'faq'
  | 'form'
  | 'rule-source'
  | 'legal-reference';

export interface Chunk {
  id: string;
  sourceVersionId: string;
  url: string;
  docTitle: string;
  sectionPath: string[];
  order: number;
  type: ChunkType;
  text: string;
  meta: {
    contractType?: string | null; // construction|electric|fire|ict|goods|service|general
    stage?: string | null;        // plan|design|method|notice|contract|work|change|complete|payment|warranty
    publishedAt?: string | null;
    effectiveAt?: string | null;
    collectedAt?: string | null;
    faqCategory?: string | null;
    formName?: string | null;
    lawName?: string | null;
  };
}

export interface NormalizedDoc {
  sourceVersionId: string;
  url: string;
  title: string;
  menuPath: string[];
  collectedAt: string;
  publishedAt?: string | null;
  blocks: Array<{
    kind: ChunkType;
    text: string;
    path: string[];
    tableRows?: string[][];
  }>;
  warnings: string[]; // OCR_REQUIRED, MANUAL_REVIEW_REQUIRED 등
}

export type RuleStatus = 'draft' | 'reviewed' | 'active' | 'superseded';

export interface RuleCondition {
  field: string; // estimated_price 등
  operator:
    | 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between' | 'in' | 'equals_bool';
  value: number | [number, number] | string[] | boolean | string;
}

export interface RuleSourceMeta {
  title: string;
  url: string;
  publishedAt?: string | null;
  effectiveFrom?: string | null;
  checkedAt: string;
}

export interface RuleDefinition {
  id: string;
  version: number;
  status: RuleStatus;
  scope: Record<string, string>; // contract_type 등 매칭 키
  conditions: RuleCondition[];
  output: {
    method?: string;
    message?: string;
    reviewRequired?: boolean;
    documents?: string[];
    warnings?: string[];
    nextSteps?: string[];
  };
  source: RuleSourceMeta;
  /** 자동 추출 후보인 경우 원문 문맥(관리자 검토 화면용) */
  candidate?: {
    kindOfValue: 'amount' | 'ratio' | 'duration' | 'document';
    quotedSentence: string;
    contextBefore: string;
    contextAfter: string;
    sourceChunkId?: string;
  };
  reviewedBy?: string | null;
  supersededBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WizardInput {
  projectName?: string;
  workType: string;        // 건축/토목/전기/소방/정보통신/기타 (자유문자)
  contractCategory: 'construction' | 'electric' | 'fire' | 'ict' | 'other';
  estimatedPrice: number;  // 부가세 제외 원
  governmentMaterials: boolean; // 관급자재
  constructionWaste: boolean;   // 건설폐기물
  emergency: boolean;           // 긴급/재난
  regionRestriction: boolean;
  performanceRestriction: boolean;
  contractPlannedDate?: string | null;
  completionPlannedDate?: string | null;
  organizationType: 'school' | 'office-of-education' | 'direct-affiliate';
}

export interface WizardResult {
  decisionState: 'DETERMINED' | 'REVIEW_REQUIRED' | 'PARTIAL';
  recommendedMethod?: { method: string; ruleId: string; message?: string };
  appliedRules: Array<{ id: string; status: RuleStatus; summary: string }>;
  nextSteps: string[];
  documentsByStage: Array<{ stage: string; documents: string[]; sourceRuleId?: string }>;
  cautions: string[];
  evidence: Array<RuleSourceMeta>;
  lastCheckedAt: string;
}

// ---- 검색 ----
export interface SearchFilters {
  contractType?: string;
  docTypes?: ChunkType[];
  publishedAfter?: string;
  publishedBefore?: string;
  onlyCurrentlyValid?: boolean;
  faqCategory?: string;
  minSourcePriority?: number;
  stage?: string;
}

export interface SearchHit {
  chunk: Chunk;
  score: number;
  sourceTitle: string;
  sourceUrl: string;
  publishedAt?: string | null;
  effectiveAt?: string | null;
  lastCheckedAt?: string | null;
}

export interface AskResult {
  answered: boolean;
  answer?: string;
  refusalReason?: string;
  hits: SearchHit[];
  providerNotice?: string;
}
