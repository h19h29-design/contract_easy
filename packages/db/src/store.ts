import fs from 'node:fs';
import path from 'node:path';
import {
  stableId, isoNow,
  type Chunk, type RuleDefinition, type SourceVersion,
  type AttachmentRef, type WizardInput
} from '@sen/shared';
import { detectConflicts, validateActivatableRule } from '@sen/rules';
import type { AppStore } from './app-store.js';

/* 파일 기반 리포지토리(개발/MVP용). 운영은 PgStore(PostgreSQL) 사용(D-003). */

interface SourceRecord {
  id: string;
  url: string;
  seedName: string | null;
  kind: string;
  firstSeenAt: string;
  lastCheckedAt: string;
  status: 'active' | 'inactive';
  versions: SourceVersion[];
  attachments: AttachmentRef[];
}

export type StoredRule = RuleDefinition;

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: 'USER' | 'REVIEWER' | 'ADMIN';
  createdAt: string;
  disabled: boolean;
}

export interface SessionRecord {
  token: string;
  userId: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
}

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  contractCategory: string;
  estimatedPrice: number;
  organizationType: string;
  status: 'planning' | 'contracting' | 'working' | 'completed' | 'warranty';
  wizardInput: WizardInput | null;
  createdAt: string;
  updatedAt: string;
}

export interface StepRecord {
  id: string;
  projectId: string;
  stageKey: string;
  sortOrder: number;
  status: 'pending' | 'in_progress' | 'done';
}

export interface ChecklistItemRecord {
  id: string;
  stepId: string;
  projectId: string;
  label: string;
  done: boolean;
  required: boolean;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

export interface RuleReviewRecord {
  id: string;
  ruleVersionId: string;
  actorUserId: string;
  action: 'approve' | 'hold' | 'activate';
  comment: string | null;
  at: string;
}

export type RuleActionErrorCode =
  | 'NOT_FOUND' | 'INVALID_STATE' | 'ROLE_REQUIRED'
  | 'SOURCE_CONFIRMATION_REQUIRED' | 'MISSING_REVIEW'
  | 'SAME_ACTOR' | 'RULE_INVALID' | 'RULE_CONFLICT'
  | 'VERSION_CONFLICT';

export type RuleActionResult =
  | { ok: true; rule: RuleDefinition }
  | { ok: false; code: RuleActionErrorCode };

export interface CrawlRunRecord {
  id: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'done' | 'aborted';
  pagesFetched: number;
  pagesChanged: number;
  attachmentsFetched: number;
  failures: number;
}

export interface AnswerReportRecord {
  id: string;
  question: string;
  answer: string | null;
  reporterNote: string | null;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface DbData {
  sources: Record<string, SourceRecord>;
  chunks: Chunk[];
  rules: StoredRule[];
  users: UserRecord[];
  sessions: Record<string, SessionRecord>;
  projects: Record<string, ProjectRecord>;
  steps: StepRecord[];
  checklist: ChecklistItemRecord[];
  auditLogs: AuditLogRecord[];
  crawlRuns: CrawlRunRecord[];
  answerReports: AnswerReportRecord[];
  ruleReviews: RuleReviewRecord[];
}

export const STAGES = [
  'plan', 'design', 'method', 'notice', 'contract',
  'work', 'change', 'complete', 'payment', 'warranty'
] as const;

export const STAGE_LABELS: Record<string, string> = {
  plan: '계획', design: '설계/원가', method: '계약방법', notice: '공고/견적',
  contract: '계약', work: '착공/감독', change: '변경계약', complete: '준공/검사',
  payment: '대금지급', warranty: '하자관리'
};

export function emptyDb(): DbData {
  return {
    sources: {}, chunks: [], rules: [], users: [], sessions: {},
    projects: {}, steps: [], checklist: [], auditLogs: [], crawlRuns: [],
    answerReports: [], ruleReviews: []
  };
}

export class FileStore implements AppStore {
  private file: string;
  private data: DbData;

  constructor(appStoreDir: string) {
    fs.mkdirSync(appStoreDir, { recursive: true });
    this.file = path.join(appStoreDir, 'db.json');
    if (fs.existsSync(this.file)) {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<DbData>;
      this.data = {
        ...emptyDb(), ...parsed,
        sessions: parsed.sessions ?? {},
        projects: parsed.projects ?? {},
        sources: parsed.sources ?? {}
      };
    } else {
      this.data = emptyDb();
      this.flush();
    }
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  private findRule(ruleId: string, version: number): StoredRule | undefined {
    return this.data.rules.find((rule) => rule.id === ruleId && rule.version === version);
  }

  private appendRuleReview(
    rule: StoredRule,
    actorUserId: string,
    action: RuleReviewRecord['action'],
    comment: string | null,
    at: string
  ): void {
    this.data.ruleReviews.push({
      id: stableId('rrv', ruleVersionId(rule), action, actorUserId, at),
      ruleVersionId: ruleVersionId(rule),
      actorUserId,
      action,
      comment,
      at
    });
  }

  private appendAudit(
    actorUserId: string | null,
    action: string,
    targetType: string,
    targetId: string | null,
    detail?: Record<string, unknown> | null,
    ip?: string | null
  ): void {
    const at = isoNow();
    this.data.auditLogs.push({
      id: stableId('aud', action, targetType, targetId ?? '', at),
      actorUserId, action, targetType, targetId, detail: detail ?? null,
      ip: ip ?? null, at
    });
    if (this.data.auditLogs.length > 10000) this.data.auditLogs = this.data.auditLogs.slice(-10000);
  }

  /* ---------- sources & versions ---------- */

  upsertSourcePage(input: {
    url: string; seedName: string | null; kind: string;
    title: string; contentSha256: string; rawHtmlPath?: string;
    collectedAt: string; menuPath?: string[];
  }): { sourceId: string; versionId: string; changed: boolean; versionIndex: number } {
    const sourceId = stableId('src', input.url);
    let rec = this.data.sources[sourceId];
    const now = input.collectedAt;
    if (!rec) {
      rec = this.data.sources[sourceId] = {
        id: sourceId, url: input.url, seedName: input.seedName, kind: input.kind,
        firstSeenAt: now, lastCheckedAt: now, status: 'active', versions: [], attachments: []
      };
    }
    rec.lastCheckedAt = now;
    rec.status = 'active';
    const last = rec.versions[rec.versions.length - 1];
    if (last && last.contentSha256 === input.contentSha256) {
      last.lastCheckedAt = now;
      // 재수집으로 원본 파일/메뉴경로가 새로 확보된 경우 보완한다(해시 동일 → 중복 아님)
      let touched = false;
      if (!last.rawHtmlPath && input.rawHtmlPath) { last.rawHtmlPath = input.rawHtmlPath; touched = true; }
      if ((last.menuPath?.length ?? 0) === 0 && (input.menuPath?.length ?? 0) > 0) { last.menuPath = input.menuPath ?? []; touched = true; }
      if (touched) this.flush();
      return { sourceId, versionId: last.id, changed: false, versionIndex: last.versionIndex };
    }
    const versionIndex = (last?.versionIndex ?? 0) + 1;
    const versionId = stableId('sv', input.url, input.contentSha256);
    const version: SourceVersion = {
      id: versionId,
      sourceId,
      url: input.url,
      title: input.title,
      menuPath: input.menuPath ?? [],
      publishedAt: null,
      effectiveAt: null,
      collectedAt: now,
      lastCheckedAt: now,
      contentSha256: input.contentSha256,
      rawHtmlPath: input.rawHtmlPath,
      status: 'active',
      versionIndex
    };
    rec.versions.push(version);
    this.flush();
    return { sourceId, versionId, changed: true, versionIndex };
  }

  markSourceAttachments(sourceId: string, atts: AttachmentRef[]): void {
    const rec = this.data.sources[sourceId];
    if (!rec) return;
    for (const a of atts) {
      if (!rec.attachments.some((x) => x.url === a.url)) rec.attachments.push(a);
    }
    this.flush();
  }

  /** 다운로드 결과 메타 부착(sha·경로 등). 대상이 없으면 무시. */
  setAttachmentMeta(
    sourceId: string,
    url: string,
    patch: Partial<Pick<AttachmentRef, 'sha256' | 'sizeBytes' | 'mimeType' | 'savedPath'>>
  ): void {
    const rec = this.data.sources[sourceId];
    if (!rec) return;
    const att = rec.attachments.find((a) => a.url === url);
    if (!att) return;
    Object.assign(att, patch);
    this.flush();
  }

  listSources(): SourceRecord[] {
    return Object.values(this.data.sources);
  }

  getSource(idOrUrl: string): SourceRecord | null {
    return (
      this.data.sources[idOrUrl] ??
      Object.values(this.data.sources).find((s) => s.url === idOrUrl) ??
      null
    );
  }

  setSourceStatus(id: string, status: 'active' | 'inactive'): void {
    const rec = this.data.sources[id];
    if (rec) { rec.status = status; this.flush(); }
  }

  /** 소스와 하위 버전·첨부를 완전히 제거(정리 스크립트 전용) */
  removeSource(id: string): boolean {
    if (!this.data.sources[id]) return false;
    delete this.data.sources[id];
    this.flush();
    return true;
  }

  currentVersions(): SourceVersion[] {
    return Object.values(this.data.sources)
      .map((s) => s.versions[s.versions.length - 1])
      .filter((v): v is SourceVersion => Boolean(v));
  }

  /* ---------- chunks ---------- */

  replaceChunks(chunks: Chunk[]): void {
    this.data.chunks = chunks;
    this.flush();
  }

  getChunks(): Chunk[] {
    return this.data.chunks;
  }

  /* ---------- rules ---------- */

  upsertRule(def: Omit<StoredRule, 'createdAt' | 'updatedAt'> & Partial<Pick<StoredRule, 'createdAt' | 'updatedAt'>>): void {
    const idx = this.data.rules.findIndex((r) => r.id === def.id && r.version === def.version);
    const now = isoNow();
    if (idx >= 0) {
      const prev = this.data.rules[idx]!;
      if (prev.status !== 'draft') return;
      this.data.rules[idx] = {
        ...prev, ...def, status: 'draft',
        createdAt: prev.createdAt, updatedAt: now
      };
    } else {
      this.data.rules.push({ ...def, status: 'draft', createdAt: def.createdAt ?? now, updatedAt: now });
    }
    this.flush();
  }

  listRules(): StoredRule[] {
    return [...this.data.rules].sort((a, b) => a.id.localeCompare(b.id));
  }

  getActiveRules(asOfIsoDate?: string): StoredRule[] {
    return this.listRules().filter((r) => {
      if (r.status !== 'active') return false;
      const eff = r.source.effectiveFrom;
      if (eff && asOfIsoDate && eff > asOfIsoDate) return false;
      return true;
    });
  }

  createRuleRevision(def: RuleDefinition, actorUserId: string): RuleActionResult {
    const actor = this.getUser(actorUserId);
    if (actor?.role !== 'REVIEWER') return { ok: false, code: 'ROLE_REQUIRED' };
    if (def.status !== 'draft') return { ok: false, code: 'INVALID_STATE' };
    const versions = this.data.rules.filter((rule) => rule.id === def.id);
    const maxVersion = versions.reduce((max, rule) => Math.max(max, rule.version), 0);
    if (def.version !== maxVersion + 1 || versions.some((rule) => rule.version === def.version)) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const now = isoNow();
    const rule: StoredRule = { ...def, status: 'draft', createdAt: def.createdAt || now, updatedAt: now };
    this.data.rules.push(rule);
    this.appendAudit(actorUserId, 'rule.revision.create', 'rule', ruleVersionId(rule), { version: rule.version });
    this.flush();
    return { ok: true, rule };
  }

  approveRuleReview(ruleId: string, version: number, reviewerId: string, comment: string, sourceConfirmed: boolean): RuleActionResult {
    const reviewer = this.getUser(reviewerId);
    if (reviewer?.role !== 'REVIEWER') return { ok: false, code: 'ROLE_REQUIRED' };
    if (!sourceConfirmed || !comment.trim()) return { ok: false, code: 'SOURCE_CONFIRMATION_REQUIRED' };
    const rule = this.findRule(ruleId, version);
    if (!rule) return { ok: false, code: 'NOT_FOUND' };
    if (rule.status !== 'draft') return { ok: false, code: 'INVALID_STATE' };
    if (validateActivatableRule(rule).length > 0) return { ok: false, code: 'RULE_INVALID' };
    const at = isoNow();
    rule.status = 'reviewed';
    rule.reviewedBy = reviewerId;
    rule.updatedAt = at;
    this.appendRuleReview(rule, reviewerId, 'approve', comment.trim(), at);
    this.appendAudit(reviewerId, 'rule.review.approve', 'rule', ruleVersionId(rule), { version });
    this.flush();
    return { ok: true, rule };
  }

  holdRule(ruleId: string, version: number, reviewerId: string, comment: string): RuleActionResult {
    const reviewer = this.getUser(reviewerId);
    if (reviewer?.role !== 'REVIEWER') return { ok: false, code: 'ROLE_REQUIRED' };
    if (!comment.trim()) return { ok: false, code: 'SOURCE_CONFIRMATION_REQUIRED' };
    const rule = this.findRule(ruleId, version);
    if (!rule) return { ok: false, code: 'NOT_FOUND' };
    if (rule.status !== 'draft') return { ok: false, code: 'INVALID_STATE' };
    const at = isoNow();
    rule.updatedAt = at;
    this.appendRuleReview(rule, reviewerId, 'hold', comment.trim(), at);
    this.appendAudit(reviewerId, 'rule.review.hold', 'rule', ruleVersionId(rule), { version });
    this.flush();
    return { ok: true, rule };
  }

  activateReviewedRule(ruleId: string, version: number, adminId: string, asOfDate: string): RuleActionResult {
    const admin = this.getUser(adminId);
    if (admin?.role !== 'ADMIN') return { ok: false, code: 'ROLE_REQUIRED' };
    const rule = this.findRule(ruleId, version);
    if (!rule) return { ok: false, code: 'NOT_FOUND' };
    if (rule.status !== 'reviewed') return { ok: false, code: 'INVALID_STATE' };
    const reviews = this.listRuleReviews(ruleId, version);
    const approval = reviews.filter((review) => review.action === 'approve').at(-1);
    if (!approval) return { ok: false, code: 'MISSING_REVIEW' };
    if (approval.actorUserId === adminId) return { ok: false, code: 'SAME_ACTOR' };
    if (validateActivatableRule(rule, { asOfDate }).length > 0) return { ok: false, code: 'RULE_INVALID' };
    const proposed = this.data.rules.map((candidate) =>
      candidate === rule ? { ...candidate, status: 'active' as const } : candidate
    );
    if (detectConflicts(proposed).length > 0) return { ok: false, code: 'RULE_CONFLICT' };
    const at = isoNow();
    for (const candidate of this.data.rules) {
      if (candidate.id === ruleId && candidate.version !== version && candidate.status === 'active') {
        candidate.status = 'superseded';
        candidate.supersededBy = ruleVersionId(rule);
        candidate.updatedAt = at;
      }
    }
    rule.status = 'active';
    rule.updatedAt = at;
    this.appendRuleReview(rule, adminId, 'activate', null, at);
    this.appendAudit(adminId, 'rule.review.activate', 'rule', ruleVersionId(rule), { version, asOfDate });
    this.flush();
    return { ok: true, rule };
  }

  listRuleReviews(ruleId: string, version: number): RuleReviewRecord[] {
    const id = `${ruleId}@${version}`;
    return this.data.ruleReviews.filter((review) => review.ruleVersionId === id);
  }

  /** 규칙 승인: draft/reviewed → active (사람 검토 필수, 자동 활성화 없음) */
  activateRule(ruleId: string, version: number, reviewer: string): StoredRule | null {
    const rule = this.data.rules.find((r) => r.id === ruleId && r.version === version);
    if (!rule) return null;
    if (rule.status === 'draft') return null; // reviewed 상태를 거쳐야 함
    // 동일 논리ID의 기존 active는 superseded 처리
    for (const r of this.data.rules) {
      if (r.id === ruleId && r.version !== version && r.status === 'active') {
        r.status = 'superseded';
        r.supersededBy = `${ruleId}@${version}`;
        r.updatedAt = isoNow();
      }
    }
    rule.status = 'active';
    rule.reviewedBy = reviewer;
    rule.updatedAt = isoNow();
    this.flush();
    return rule;
  }

  reviewRule(ruleId: string, version: number, next: 'reviewed'): StoredRule | null {
    const rule = this.data.rules.find((r) => r.id === ruleId && r.version === version);
    if (!rule || rule.status !== 'draft') return null;
    rule.status = next;
    rule.updatedAt = isoNow();
    this.flush();
    return rule;
  }

  rejectRule(ruleId: string, version: number): boolean {
    const idx = this.data.rules.findIndex((r) => r.id === ruleId && r.version === version);
    if (idx < 0) return false;
    this.data.rules.splice(idx, 1);
    this.flush();
    return true;
  }

  /**
   * 자동 추출 후보 draft 정리: 최신 추출 배치에 없는 candidate.* 초안만 제거.
   * reviewed/active/superseded 상태와 사람이 만든 규칙은 절대 삭제하지 않는다.
   */
  purgeStaleCandidateDrafts(currentIds: string[]): number {
    const keep = new Set(currentIds);
    const before = this.data.rules.length;
    this.data.rules = this.data.rules.filter(
      (r) => !(
        r.id.startsWith('candidate.') &&
        r.status === 'draft' &&
        !keep.has(r.id) &&
        !this.data.ruleReviews.some((review) => review.ruleVersionId === ruleVersionId(r))
      )
    );
    const removed = before - this.data.rules.length;
    if (removed > 0) this.flush();
    return removed;
  }

  /* ---------- chunks 저장소에서 규칙 후보 로딩 보조 ---------- */
  findRulesByIdPrefix(prefix: string): StoredRule[] {
    return this.listRules().filter((r) => r.id.startsWith(prefix));
  }

  /* ---------- users & sessions ---------- */

  createUser(u: Omit<UserRecord, 'id' | 'createdAt' | 'disabled'>): UserRecord {
    const user: UserRecord = {
      id: stableId('usr', u.username),
      username: u.username,
      passwordHash: u.passwordHash,
      displayName: u.displayName,
      role: u.role,
      createdAt: isoNow(),
      disabled: false
    };
    this.data.users.push(user);
    this.flush();
    return user;
  }

  getUserByUsername(username: string): UserRecord | null {
    return this.data.users.find((u) => u.username === username && !u.disabled) ?? null;
  }

  getUser(id: string): UserRecord | null {
    return this.data.users.find((u) => u.id === id) ?? null;
  }

  listUsers(): UserRecord[] {
    return [...this.data.users];
  }

  ensureDefaultAdmin(passwordHash: string): void {
    if (this.data.users.length === 0) {
      this.createUser({
        username: 'admin',
        passwordHash,
        displayName: '시스템 관리자',
        role: 'ADMIN'
      });
    }
  }

  createSession(token: string, userId: string, csrfToken: string, ttlMs: number): SessionRecord {
    const rec: SessionRecord = {
      token, userId, csrfToken,
      createdAt: isoNow(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString()
    };
    this.data.sessions[token] = rec;
    this.flush();
    return rec;
  }

  getSession(token: string): SessionRecord | null {
    const s = this.data.sessions[token];
    if (!s) return null;
    if (new Date(s.expiresAt).getTime() < Date.now()) {
      delete this.data.sessions[token];
      this.flush();
      return null;
    }
    return s;
  }

  deleteSession(token: string): void {
    delete this.data.sessions[token];
    this.flush();
  }

  /* ---------- projects ---------- */

  createProject(p: Omit<ProjectRecord, 'id' | 'createdAt' | 'updatedAt'>, checklistTemplates: Record<string, string[]>): ProjectRecord {
    const id = stableId('prj', p.ownerId, p.name, isoNow());
    const rec: ProjectRecord = { ...p, id, createdAt: isoNow(), updatedAt: isoNow() };
    this.data.projects[id] = rec;
    STAGES.forEach((stage, i) => {
      const stepId = stableId('step', id, stage);
      this.data.steps.push({ id: stepId, projectId: id, stageKey: stage, sortOrder: i, status: 'pending' });
      for (const label of checklistTemplates[stage] ?? []) {
        this.data.checklist.push({
          id: stableId('chk', stepId, label),
          stepId, projectId: id, label, done: false, required: true, updatedAt: isoNow()
        });
      }
    });
    this.flush();
    return rec;
  }

  listProjects(ownerId?: string): ProjectRecord[] {
    const all = Object.values(this.data.projects);
    return ownerId ? all.filter((p) => p.ownerId === ownerId) : all;
  }

  getProject(id: string): ProjectRecord | null {
    return this.data.projects[id] ?? null;
  }

  canAccessProject(projectId: string, userId: string, role: UserRecord['role']): boolean {
    const p = this.getProject(projectId);
    if (!p) return false;
    if (role === 'ADMIN') return true;
    return p.ownerId === userId;
  }

  updateProject(id: string, patch: Partial<ProjectRecord>): ProjectRecord | null {
    const p = this.data.projects[id];
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: isoNow() });
    this.flush();
    return p;
  }

  stepsOf(projectId: string): StepRecord[] {
    return this.data.steps.filter((s) => s.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  checklistOf(projectId: string): ChecklistItemRecord[] {
    return this.data.checklist.filter((c) => c.projectId === projectId);
  }

  toggleChecklist(itemId: string, done: boolean): ChecklistItemRecord | null {
    const item = this.data.checklist.find((c) => c.id === itemId);
    if (!item) return null;
    item.done = done;
    item.updatedAt = isoNow();
    const siblings = this.data.checklist.filter((c) => c.stepId === item.stepId);
    const step = this.data.steps.find((s) => s.id === item.stepId)!;
    if (siblings.every((c) => c.done)) step.status = 'done';
    else if (siblings.some((c) => c.done)) step.status = 'in_progress';
    else step.status = 'pending';
    this.flush();
    return item;
  }

  setStepStatus(stepId: string, status: StepRecord['status']): StepRecord | null {
    const step = this.data.steps.find((s) => s.id === stepId);
    if (!step) return null;
    step.status = status;
    this.flush();
    return step;
  }

  addProjectChange(projectId: string, changeType: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string): string {
    const id = stableId('chg', projectId, changeType, isoNow());
    this.audit('system', 'project.change', 'project_change', id, { projectId, changeType, reason });
    // project_changes는 감사로그로 축약 저장(MVP)
    this.flush();
    return id;
  }

  /* ---------- audit ---------- */

  audit(actorUserId: string | null, action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown> | null, ip?: string | null): void {
    this.appendAudit(actorUserId, action, targetType, targetId, detail, ip);
    this.flush();
  }

  listAudit(limit = 200): AuditLogRecord[] {
    return this.data.auditLogs.slice(-limit).reverse();
  }

  /* ---------- crawl runs ---------- */

  startCrawlRun(mode: string): CrawlRunRecord {
    const rec: CrawlRunRecord = {
      id: stableId('run', mode, isoNow()), mode, startedAt: isoNow(),
      finishedAt: null, status: 'running',
      pagesFetched: 0, pagesChanged: 0, attachmentsFetched: 0, failures: 0
    };
    this.data.crawlRuns.push(rec);
    this.flush();
    return rec;
  }

  finishCrawlRun(id: string, patch: Partial<Omit<CrawlRunRecord, 'id' | 'startedAt'>>): void {
    const rec = this.data.crawlRuns.find((r) => r.id === id);
    if (!rec) return;
    Object.assign(rec, patch, { finishedAt: isoNow() });
    this.flush();
  }

  listCrawlRuns(): CrawlRunRecord[] {
    return [...this.data.crawlRuns].reverse();
  }

  /* ---------- answer reports ---------- */

  addAnswerReport(question: string, answer: string | null, note: string): AnswerReportRecord {
    const rec: AnswerReportRecord = {
      id: stableId('rep', question, isoNow()), question, answer,
      reporterNote: note, status: 'open', createdAt: isoNow()
    };
    this.data.answerReports.push(rec);
    this.flush();
    return rec;
  }

  listAnswerReports(): AnswerReportRecord[] {
    return [...this.data.answerReports].reverse();
  }

  resolveAnswerReport(id: string): boolean {
    const rec = this.data.answerReports.find((r) => r.id === id);
    if (!rec) return false;
    rec.status = 'resolved';
    this.flush();
    return true;
  }
}

/** 콘텐츠 해시로 원문 중복 저장 방지용 경로 */
export function contentPath(baseDir: string, url: string, sha: string): string {
  return path.join(baseDir, sha.slice(0, 2), `${stableId('page', url)}-${sha.slice(0, 12)}.html`);
}

function ruleVersionId(rule: Pick<RuleDefinition, 'id' | 'version'>): string {
  return `${rule.id}@${rule.version}`;
}
