import {
  pgTable, text, integer, bigint, boolean, timestamp, jsonb, serial,
  uniqueIndex, index, primaryKey
} from 'drizzle-orm/pg-core';

/* ============ 자료 수집 ============ */

export const projectContractDrafts = pgTable('project_contract_drafts', {
  projectId: text('project_id').notNull(),
  revision: integer('revision').notNull(),
  templateVersion: text('template_version').notNull(),
  fields: jsonb('fields').notNull(),
  savedBy: text('saved_by').notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull()
}, (t) => ({ pk: primaryKey({ columns: [t.projectId, t.revision] }) }));

export const crawlRuns = pgTable('crawl_runs', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(), // preflight|sample|full|incremental
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(), // running|done|aborted
  pagesFetched: integer('pages_fetched').notNull().default(0),
  pagesChanged: integer('pages_changed').notNull().default(0),
  attachmentsFetched: integer('attachments_fetched').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  notes: jsonb('notes')
});

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  seedName: text('seed_name'),
  kind: text('kind').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull(),
  currentVersionId: text('current_version_id'),
  status: text('status').notNull().default('active') // active|inactive
});

export const sourceVersions = pgTable('source_versions', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  menuPath: jsonb('menu_path').$type<string[]>().notNull().default([]),
  publishedAt: text('published_at'),
  effectiveAt: text('effective_at'),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull(),
  contentSha256: text('content_sha256').notNull(),
  rawHtmlPath: text('raw_html_path'),
  versionIndex: integer('version_index').notNull().default(1),
  status: text('status').notNull().default('active')
}, (t) => ({
  bySource: index('sv_by_source_idx').on(t.sourceId)
}));

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  sourceVersionId: text('source_version_id').notNull(),
  url: text('url').notNull(),
  fileName: text('file_name').notNull(),
  ext: text('ext').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  sha256: text('sha256'),
  savedPath: text('saved_path'),
  robotsDisallowed: boolean('robots_disallowed').notNull().default(false)
});

export const normalizedDocuments = pgTable('normalized_documents', {
  id: text('id').primaryKey(),
  sourceVersionId: text('source_version_id').notNull(),
  format: text('format').notNull(), // html|pdf|hwp|...
  markdownPath: text('markdown_path').notNull(),
  warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const documentChunks = pgTable('document_chunks', {
  id: text('id').primaryKey(),
  sourceVersionId: text('source_version_id').notNull(),
  type: text('type').notNull(),
  sectionPath: jsonb('section_path').$type<string[]>().notNull().default([]),
  orderIdx: integer('order_idx').notNull(),
  text: text('text').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  tsv: text('tsv') // PostgreSQL FTS용 generated 대체 저장 컬럼(운영에서는 to_tsvector 인덱스 권장)
}, (t) => ({
  bySv: index('chunk_by_sv_idx').on(t.sourceVersionId)
}));

export const sourceLinks = pgTable('source_links', {
  id: text('id').primaryKey(),
  fromSourceVersionId: text('from_source_version_id').notNull(),
  toUrl: text('to_url').notNull(),
  linkText: text('link_text'),
  internal: boolean('internal').notNull(),
  externalMetaOnly: boolean('external_meta_only').notNull().default(true)
});

export const crawlFailures = pgTable('crawl_failures', {
  id: serial('id').primaryKey(),
  runId: text('run_id'),
  url: text('url').notNull(),
  category: text('category').notNull(), // network|tls|http_4xx|http_5xx|robots_blocked|selector_change|js_render_required|parse_failed
  message: text('message'),
  at: timestamp('at', { withTimezone: true }).notNull()
});

/* ============ 규칙 ============ */

export const rules = pgTable('rules', {
  id: text('id').primaryKey(), // 규칙 논리 ID
  scope: jsonb('scope').$type<Record<string, string>>().notNull().default({}),
  currentStatus: text('current_status').notNull().default('draft'), // draft|reviewed|active|superseded
  supersededBy: text('superseded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

export const ruleVersions = pgTable('rule_versions', {
  id: text('id').primaryKey(), // ruleId@version
  ruleId: text('rule_id').notNull(),
  version: integer('version').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
}, (t) => ({
  uniq: uniqueIndex('rule_versions_uniq').on(t.ruleId, t.version)
}));

export const ruleSources = pgTable('rule_sources', {
  id: text('id').primaryKey(),
  ruleVersionId: text('rule_version_id').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  publishedAt: text('published_at'),
  effectiveFrom: text('effective_from'),
  checkedAt: text('checked_at').notNull()
});

export const ruleReviews = pgTable('rule_reviews', {
  id: text('id').primaryKey(),
  ruleVersionId: text('rule_version_id').notNull(),
  reviewer: text('reviewer').notNull(),
  action: text('action').notNull(), // approve|reject|hold|activate|supersede
  comment: text('comment'),
  at: timestamp('at', { withTimezone: true }).notNull()
});

export const ruleConflicts = pgTable('rule_conflicts', {
  id: text('id').primaryKey(),
  ruleVersionIdA: text('rule_version_id_a').notNull(),
  ruleVersionIdB: text('rule_version_id_b').notNull(),
  reason: text('reason').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull()
});

/* ============ 사용자 및 계약업무 ============ */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // scrypt: salt:hash
  displayName: text('display_name').notNull(),
  role: text('role').notNull(), // USER|REVIEWER|ADMIN
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  disabled: boolean('disabled').notNull().default(false)
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  csrfToken: text('csrf_token').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const roles = pgTable('roles', {
  name: text('name').primaryKey(), // PUBLIC|USER|REVIEWER|ADMIN
  description: text('description').notNull()
});

export const userRoles = pgTable('user_roles', {
  userId: text('user_id').notNull(),
  roleName: text('role_name').notNull()
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.roleName] }) }));

export const contractProjects = pgTable('contract_projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  contractCategory: text('contract_category').notNull(),
  estimatedPrice: bigint('estimated_price', { mode: 'number' }).notNull().default(0),
  organizationType: text('organization_type').notNull(),
  status: text('status').notNull().default('planning'), // planning|contracting|working|completed|warranty
  wizardInput: jsonb('wizard_input').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

export const projectMembers = pgTable('project_members', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull() // owner|manager|supervisor|inspector|viewer
}, (t) => ({
  uniq: uniqueIndex('project_members_uniq').on(t.projectId, t.userId)
}));

export const projectSteps = pgTable('project_steps', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  stageKey: text('stage_key').notNull(), // plan|design|method|notice|contract|work|change|complete|payment|warranty
  sortOrder: integer('sort_order').notNull(),
  status: text('status').notNull().default('pending'), // pending|in_progress|done
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true })
});

export const projectChecklistItems = pgTable('project_checklist_items', {
  id: text('id').primaryKey(),
  stepId: text('step_id').notNull(),
  projectId: text('project_id').notNull(),
  label: text('label').notNull(),
  done: boolean('done').notNull().default(false),
  required: boolean('required').notNull().default(true),
  evidencePath: text('evidence_path'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

export const projectDocuments = pgTable('project_documents', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  originalName: text('original_name').notNull(),
  storedPath: text('stored_path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  isPrivate: boolean('is_private').notNull().default(true), // 항상 비공개 corpus
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull()
});

export const projectEvents = pgTable('project_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  kind: text('kind').notNull(), // deadline|milestone|inspection|payment|other
  title: text('title').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  notified: boolean('notified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const projectChanges = pgTable('project_changes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  changeType: text('change_type').notNull(), // design|duration|amount|other
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>(),
  reason: text('reason'),
  approvedBy: text('approved_by'),
  at: timestamp('at', { withTimezone: true }).notNull()
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  ip: text('ip'),
  at: timestamp('at', { withTimezone: true }).notNull()
});

/* 답변 신고 */
export const answerReports = pgTable('answer_reports', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  answer: text('answer'),
  reporterNote: text('reporter_note'),
  status: text('status').notNull().default('open'), // open|resolved
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});
