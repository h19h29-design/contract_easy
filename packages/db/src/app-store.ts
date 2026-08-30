import type { AttachmentRef, Chunk, RuleDefinition, SourceVersion } from '@sen/shared';
import type {
  AnswerReportRecord, AuditLogRecord, ChecklistItemRecord, EvidenceLinkResult, ProjectDocumentRecord,
  CrawlRunRecord, ProjectChangeRecord, ProjectEventKind, ProjectEventRecord,
  ProjectRecord, ProjectStatus, ProjectTransitionResult, RuleActionResult, RuleReviewRecord,
  SessionRecord, StepRecord, UserRecord
} from './store.js';

/** 동기(FileStore) 또는 비동기(PgStore) 반환을 허용 */
export type MaybeP<T> = T | Promise<T>;

/** source + 버전들 + 첨부 묶음(FileStore SourceRecord와 동형) */
export interface SourceListItem {
  id: string; url: string; seedName: string | null; kind: string;
  firstSeenAt: string; lastCheckedAt: string; status: 'active' | 'inactive';
  versions: SourceVersion[]; attachments: AttachmentRef[];
}

/**
 * FileStore(개발/파일)와 PgStore(운영/PostgreSQL)가 함께 만족하는 저장소 계약.
 * 메서드는 FileStore와 1:1 대응한다.
 */
export interface AppStore {
  upsertSourcePage(input: {
    url: string; seedName: string | null; kind: string;
    title: string; contentSha256: string; rawHtmlPath?: string;
    collectedAt: string; menuPath?: string[];
  }): MaybeP<{ sourceId: string; versionId: string; changed: boolean; versionIndex: number }>;
  markSourceAttachments(sourceId: string, atts: AttachmentRef[]): MaybeP<void>;
  listSources(): MaybeP<SourceListItem[]>;
  getSource(idOrUrl: string): MaybeP<SourceListItem | null>;
  setSourceStatus(id: string, status: 'active' | 'inactive'): MaybeP<void>;
  currentVersions(): MaybeP<SourceVersion[]>;

  replaceChunks(chunks: Chunk[]): MaybeP<void>;
  getChunks(): MaybeP<Chunk[]>;

  upsertRule(def: RuleDefinition): MaybeP<void>;
  listRules(): MaybeP<RuleDefinition[]>;
  getActiveRules(asOfIsoDate?: string): MaybeP<RuleDefinition[]>;
  createRuleRevision(def: RuleDefinition, actorUserId: string): MaybeP<RuleActionResult>;
  approveRuleReview(ruleId: string, version: number, reviewerId: string, comment: string, sourceConfirmed: boolean): MaybeP<RuleActionResult>;
  holdRule(ruleId: string, version: number, reviewerId: string, comment: string): MaybeP<RuleActionResult>;
  activateReviewedRule(ruleId: string, version: number, adminId: string, asOfDate: string): MaybeP<RuleActionResult>;
  listRuleReviews(ruleId: string, version: number): MaybeP<RuleReviewRecord[]>;
  activateRule(ruleId: string, version: number, reviewer: string): MaybeP<RuleDefinition | null>;
  reviewRule(ruleId: string, version: number, next: 'reviewed'): MaybeP<RuleDefinition | null>;
  rejectRule(ruleId: string, version: number): MaybeP<boolean>;
  purgeStaleCandidateDrafts(currentIds: string[]): MaybeP<number>;
  findRulesByIdPrefix(prefix: string): MaybeP<RuleDefinition[]>;

  createUser(u: Omit<UserRecord, 'id' | 'createdAt' | 'disabled'>): MaybeP<UserRecord>;
  getUserByUsername(username: string): MaybeP<UserRecord | null>;
  getUser(id: string): MaybeP<UserRecord | null>;
  listUsers(): MaybeP<UserRecord[]>;
  ensureDefaultAdmin(passwordHash: string): MaybeP<void>;
  createSession(token: string, userId: string, csrfToken: string, ttlMs: number): MaybeP<SessionRecord>;
  getSession(token: string): MaybeP<SessionRecord | null>;
  deleteSession(token: string): MaybeP<void>;

  createProject(
    p: Omit<ProjectRecord, 'id' | 'createdAt' | 'updatedAt'>,
    checklistTemplates: Record<string, string[]>
  ): MaybeP<ProjectRecord>;
  listProjects(ownerId?: string): MaybeP<ProjectRecord[]>;
  getProject(id: string): MaybeP<ProjectRecord | null>;
  canAccessProject(projectId: string, userId: string, role: UserRecord['role']): MaybeP<boolean>;
  updateProject(id: string, patch: Partial<ProjectRecord>): MaybeP<ProjectRecord | null>;
  stepsOf(projectId: string): MaybeP<StepRecord[]>;
  checklistOf(projectId: string): MaybeP<ChecklistItemRecord[]>;
  toggleChecklist(itemId: string, done: boolean): MaybeP<ChecklistItemRecord | null>;
  saveChecklistEvidence(input: {
    projectId: string; checklistItemId: string; uploadedBy: string;
    originalName: string; storedPath: string; mimeType: string;
    sizeBytes: number; sha256: string;
  }): MaybeP<EvidenceLinkResult | null>;
  listProjectDocuments(projectId: string): MaybeP<ProjectDocumentRecord[]>;
  getProjectDocument(projectId: string, documentId: string): MaybeP<ProjectDocumentRecord | null>;
  setStepStatus(stepId: string, status: StepRecord['status']): MaybeP<StepRecord | null>;
  transitionProjectStatus(projectId: string, next: ProjectStatus, actorUserId: string, reason: string): MaybeP<ProjectTransitionResult>;
  addProjectChange(projectId: string, changeType: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string): MaybeP<string>;
  addProjectChange(projectId: string, changeType: Exclude<ProjectChangeRecord['changeType'], 'status'>, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string, actorUserId: string): MaybeP<ProjectChangeRecord | null>;
  listProjectChanges(projectId: string): MaybeP<ProjectChangeRecord[]>;
  addProjectEvent(projectId: string, kind: ProjectEventKind, title: string, dueDate: string, actorUserId: string): MaybeP<ProjectEventRecord | null>;
  listProjectEvents(projectId: string): MaybeP<ProjectEventRecord[]>;

  audit(actorUserId: string | null, action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown> | null, ip?: string | null): MaybeP<void>;
  listAudit(limit?: number): MaybeP<AuditLogRecord[]>;
  startCrawlRun(mode: string): MaybeP<CrawlRunRecord>;
  finishCrawlRun(id: string, patch: Partial<Omit<CrawlRunRecord, 'id' | 'startedAt'>>): MaybeP<void>;
  listCrawlRuns(): MaybeP<CrawlRunRecord[]>;
  addAnswerReport(question: string, answer: string | null, note: string): MaybeP<AnswerReportRecord>;
  listAnswerReports(): MaybeP<AnswerReportRecord[]>;
  resolveAnswerReport(id: string): MaybeP<boolean>;
}
