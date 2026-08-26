import pg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  stableId, isoNow,
  type AttachmentRef, type Chunk, type RuleDefinition, type SourceVersion
} from '@sen/shared';
import { STAGES } from './store.js';
import type {
  AnswerReportRecord, AuditLogRecord, ChecklistItemRecord,
  CrawlRunRecord, ProjectRecord, SessionRecord,
  StepRecord, UserRecord
} from './store.js';
import type { SourceListItem } from './app-store.js';

/**
 * PostgreSQL 리포지토리(D-003 운영 모드).
 * FileStore와 동일한 메서드 계약(AppStore)을 테이블 기반으로 구현한다.
 * connect()에서 drizzle/*.sql 마이그레이션을 멱등 적용한다.
 */

type Row = Record<string, unknown>;

export class PgStore {
  private pool: pg.Pool;

  private constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static async connect(databaseUrl: string): Promise<PgStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    await pool.query('SELECT 1');
    const store = new PgStore(pool);
    const applied = await store.applyMigrations();
    if (applied > 0) console.log(`[pg-store] migrations applied: ${applied}`);
    return store;
  }

  /** 마이그레이션 디렉터리를 명시해 연결(팩토리용) */
  static async connectWithMigrations(databaseUrl: string, migrationsDir: string): Promise<PgStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    await pool.query('SELECT 1');
    const store = new PgStore(pool);
    const applied = await store.applyMigrations(migrationsDir);
    if (applied > 0) console.log(`[pg-store] migrations applied: ${applied}`);
    return store;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /** drizzle/*.sql 을 파일명 순으로 멱등 적용 */
  async applyMigrations(migrationsDir?: string): Promise<number> {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dir = migrationsDir ?? path.resolve(here, '..', 'drizzle');
    let applied = 0;
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    const { rows } = await this.pool.query('SELECT name FROM _migrations');
    const done = new Set((rows as Array<{ name: string }>).map((r) => r.name));
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      const sqlText = fs.readFileSync(path.join(dir, file), 'utf8');
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sqlText); // 파라미터 없는 단순 질의로 다중 문장 실행
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }
    return applied;
  }

  /* ---------- sources & versions ---------- */

  async upsertSourcePage(input: {
    url: string; seedName: string | null; kind: string;
    title: string; contentSha256: string; rawHtmlPath?: string;
    collectedAt: string; menuPath?: string[];
  }): Promise<{ sourceId: string; versionId: string; changed: boolean; versionIndex: number }> {
    const sourceId = stableId('src', input.url);
    const now = input.collectedAt;
    await this.pool.query(
      `INSERT INTO sources (id, url, seed_name, kind, first_seen_at, last_checked_at, status)
       VALUES ($1,$2,$3,$4,$5,$5,'active')
       ON CONFLICT (id) DO UPDATE SET last_checked_at = EXCLUDED.last_checked_at, status = 'active'`,
      [sourceId, input.url, input.seedName, input.kind, now]
    );

    const latest = await this.pool.query<{
      id: string; version_index: number; content_sha256: string;
      raw_html_path: string | null; menu_path: string[] | null;
    }>(
      `SELECT id, version_index, content_sha256, raw_html_path, menu_path
       FROM source_versions WHERE source_id=$1 ORDER BY version_index DESC LIMIT 1`,
      [sourceId]
    );
    const last = latest.rows[0];

    if (last && last.content_sha256 === input.contentSha256) {
      await this.pool.query('UPDATE source_versions SET last_checked_at=$2 WHERE id=$1', [last.id, now]);
      const needPath = !last.raw_html_path && !!input.rawHtmlPath;
      const needMenu =
        (!Array.isArray(last.menu_path) || last.menu_path.length === 0) &&
        (input.menuPath?.length ?? 0) > 0;
      if (needPath || needMenu) {
        await this.pool.query(
          `UPDATE source_versions SET
             raw_html_path = COALESCE(raw_html_path, $2),
             menu_path = CASE WHEN jsonb_array_length(menu_path)=0 THEN $3::jsonb ELSE menu_path END
           WHERE id=$1`,
          [last.id, input.rawHtmlPath ?? null, JSON.stringify(input.menuPath ?? [])]
        );
      }
      return { sourceId, versionId: last.id, changed: false, versionIndex: last.version_index };
    }

    const versionIndex = (last?.version_index ?? 0) + 1;
    const versionId = stableId('sv', input.url, input.contentSha256);
    await this.pool.query(
      `INSERT INTO source_versions
         (id, source_id, url, title, menu_path, published_at, effective_at,
          collected_at, last_checked_at, content_sha256, raw_html_path, version_index, status)
       VALUES ($1,$2,$3,$4,$5::jsonb,NULL,NULL,$6,$6,$7,$8,$9,'active')
       ON CONFLICT (id) DO NOTHING`,
      [versionId, sourceId, input.url, input.title, JSON.stringify(input.menuPath ?? []),
        now, input.contentSha256, input.rawHtmlPath ?? null, versionIndex]
    );
    return { sourceId, versionId, changed: true, versionIndex };
  }

  async markSourceAttachments(sourceId: string, atts: AttachmentRef[]): Promise<void> {
    for (const a of atts) {
      // 파일스토어와 동일하게 source 귀속으로 저장(버전 무관 메타)
      await this.pool.query(
        `INSERT INTO attachments
           (id, source_version_id, url, file_name, ext, mime_type, size_bytes, sha256, saved_path, robots_disallowed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          stableId('att', sourceId, a.url), sourceId,
          a.url, a.fileName, a.ext, a.mimeType ?? null,
          a.sizeBytes ?? null, a.sha256 ?? null, a.savedPath ?? null, a.robotsDisallowed
        ]
      );
    }
  }

  async listSources(): Promise<SourceListItem[]> {
    const srcs = await this.pool.query<Row>('SELECT * FROM sources ORDER BY first_seen_at ASC');
    const vers = await this.pool.query<Row>('SELECT * FROM source_versions ORDER BY version_index ASC');
    const atts = await this.pool.query<Row>('SELECT * FROM attachments');

    const byV = new Map<string, SourceVersion[]>();
    for (const r of vers.rows) {
      const sv = mapVersionRow(r);
      const list = byV.get(sv.sourceId) ?? [];
      list.push(sv);
      byV.set(sv.sourceId, list);
    }
    const byA = new Map<string, AttachmentRef[]>();
    for (const r of atts.rows) {
      const sid = String(r.source_version_id);
      const list = byA.get(sid) ?? [];
      list.push(mapAttachmentRow(r));
      byA.set(sid, list);
    }
    return srcs.rows.map((r) => ({
      id: String(r.id), url: String(r.url),
      seedName: (r.seed_name as string | null) ?? null,
      kind: String(r.kind),
      firstSeenAt: iso(r.first_seen_at),
      lastCheckedAt: iso(r.last_checked_at),
      status: (r.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
      versions: byV.get(String(r.id)) ?? [],
      attachments: byA.get(String(r.id)) ?? []
    }));
  }

  async getSource(idOrUrl: string): Promise<SourceListItem | null> {
    const all = await this.listSources();
    return all.find((s) => s.id === idOrUrl || s.url === idOrUrl) ?? null;
  }

  async setSourceStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
    await this.pool.query('UPDATE sources SET status=$2 WHERE id=$1', [id, status]);
  }

  async currentVersions(): Promise<SourceVersion[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT DISTINCT ON (source_id) * FROM source_versions ORDER BY source_id, version_index DESC'
    );
    return rows.map(mapVersionRow);
  }

  /* ---------- chunks ---------- */

  async replaceChunks(chunks: Chunk[]): Promise<void> {
    const client = await this.beginTx();
    try {
      await client.query('DELETE FROM document_chunks');
      const BATCH = 200;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const values: unknown[] = [];
        const tuples = batch.map((c, j) => {
          const b = j * 7;
          values.push(c.id, c.sourceVersionId, c.type,
            JSON.stringify(c.sectionPath ?? []), c.order, c.text, JSON.stringify(c.meta ?? {}));
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4}::jsonb,$${b + 5},$${b + 6},$${b + 7}::jsonb)`;
        });
        await client.query(
          `INSERT INTO document_chunks (id, source_version_id, type, section_path, order_idx, text, meta)
           VALUES ${tuples.join(',')} ON CONFLICT (id) DO NOTHING`,
          values
        );
      }
      await commit(client);
    } catch (err) {
      await rollback(client);
      throw err;
    }
  }

  async getChunks(): Promise<Chunk[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM document_chunks ORDER BY source_version_id, order_idx ASC'
    );
    return rows.map((r) => ({
      id: String(r.id),
      sourceVersionId: String(r.source_version_id),
      url: '',
      docTitle: '',
      sectionPath: (r.section_path as string[] | null) ?? [],
      order: Number(r.order_idx),
      type: String(r.type) as Chunk['type'],
      text: String(r.text),
      meta: (r.meta as Chunk['meta'] | null) ?? {}
    }));
  }

  /* ---------- rules ---------- */

  async upsertRule(def: RuleDefinition): Promise<void> {
    const now = isoNow();
    await this.pool.query(
      `INSERT INTO rules (id, scope, current_status, created_at, updated_at)
       VALUES ($1,$2::jsonb,$3,$4,$4)
       ON CONFLICT (id) DO UPDATE SET scope=EXCLUDED.scope, updated_at=EXCLUDED.updated_at`,
      [def.id, JSON.stringify(def.scope ?? {}), def.status, now]
    );
    // 상태 에스컬레이션 가드(D-011): 기존 reviewed/active를 draft로 되돌리지 않음
    const existing = await this.pool.query<{ status: string }>(
      'SELECT status FROM rule_versions WHERE rule_id=$1 AND version=$2',
      [def.id, def.version]
    );
    let effectiveStatus: RuleDefinition['status'] = def.status;
    const prevStatus = existing.rows[0]?.status;
    if (prevStatus && prevStatus !== 'superseded') {
      const rank: Record<string, number> = { draft: 0, reviewed: 1, active: 2 };
      if ((rank[prevStatus] ?? 0) > (rank[def.status] ?? 0)) {
        effectiveStatus = asRuleStatus(prevStatus);
      }
    }
    await this.pool.query(
      `INSERT INTO rule_versions (id, rule_id, version, definition, status, created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)
       ON CONFLICT (rule_id, version) DO UPDATE SET definition=EXCLUDED.definition, status=EXCLUDED.status`,
      [`${def.id}@${def.version}`, def.id, def.version, JSON.stringify(def), effectiveStatus, now]
    );
    await this.pool.query("UPDATE rules SET current_status=$2, updated_at=$3 WHERE id=$1",
      [def.id, effectiveStatus, now]);
  }

  async listRules(): Promise<RuleDefinition[]> {
    const { rows } = await this.pool.query<{ definition: RuleDefinition; status: string }>(
      'SELECT definition, status FROM rule_versions ORDER BY rule_id ASC, version ASC'
    );
    return rows.map((r) => ({ ...r.definition, status: asRuleStatus(r.status) }));
  }

  async getActiveRules(asOfIsoDate?: string): Promise<RuleDefinition[]> {
    const all = await this.listRules();
    return all.filter((r) => {
      if (r.status !== 'active') return false;
      const eff = r.source.effectiveFrom;
      if (eff && asOfIsoDate && eff > asOfIsoDate) return false;
      return true;
    });
  }

  async activateRule(ruleId: string, version: number, reviewer: string): Promise<RuleDefinition | null> {
    const target = await this.pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM rule_versions WHERE rule_id=$1 AND version=$2',
      [ruleId, version]
    );
    const row = target.rows[0];
    if (!row || row.status === 'draft') return null;

    // 같은 논리 ID의 기존 active → superseded 처리
    await this.pool.query(
      `UPDATE rule_versions
       SET status='superseded',
           definition = jsonb_set(jsonb_set(definition, '{status}','"superseded"'::jsonb),
                                  '{supersededBy}', to_jsonb($3::text))
       WHERE rule_id=$1 AND version<>$2 AND status='active'`,
      [ruleId, version, `${ruleId}@${version}`]
    );
    // 대상 버전 active + reviewedBy 기록
    await this.pool.query(
      `UPDATE rule_versions
       SET status='active',
           definition = jsonb_set(jsonb_set(definition, '{status}','"active"'::jsonb),
                                  '{reviewedBy}', to_jsonb($2::text))
       WHERE id=$1`,
      [row.id, reviewer]
    );
    await this.pool.query("UPDATE rules SET current_status='active', updated_at=$2 WHERE id=$1",
      [ruleId, isoNow()]);
    return (await this.listRules()).find((r) => r.id === ruleId && r.version === version) ?? null;
  }

  async reviewRule(ruleId: string, version: number, _next: 'reviewed'): Promise<RuleDefinition | null> {
    const res = await this.pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM rule_versions WHERE rule_id=$1 AND version=$2',
      [ruleId, version]
    );
    const row = res.rows[0];
    if (!row || row.status !== 'draft') return null;
    await this.pool.query(
      `UPDATE rule_versions SET status='reviewed',
         definition = jsonb_set(definition, '{status}', '"reviewed"'::jsonb)
       WHERE id=$1`,
      [row.id]
    );
    await this.pool.query("UPDATE rules SET current_status='reviewed', updated_at=$2 WHERE id=$1",
      [ruleId, isoNow()]);
    return (await this.listRules()).find((r) => r.id === ruleId && r.version === version) ?? null;
  }

  async rejectRule(ruleId: string, version: number): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM rule_versions WHERE rule_id=$1 AND version=$2', [ruleId, version]);
    if ((res.rowCount ?? 0) === 0) return false;
    const left = await this.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM rule_versions WHERE rule_id=$1', [ruleId]
    );
    if ((left.rows[0]?.n ?? 0) === 0) {
      await this.pool.query("DELETE FROM rules WHERE id=$1 AND current_status='draft'", [ruleId]);
    }
    return true;
  }

  async purgeStaleCandidateDrafts(currentIds: string[]): Promise<number> {
    const keep = currentIds.length > 0 ? currentIds : ['__none__'];
    const del = await this.pool.query(
      `DELETE FROM rule_versions
       WHERE status='draft' AND id LIKE 'candidate.%'
         AND NOT (id = ANY($1::text[]))`,
      [keep]
    );
    await this.pool.query(
      `DELETE FROM rules r
       WHERE r.id LIKE 'candidate.%'
         AND NOT EXISTS (SELECT 1 FROM rule_versions v WHERE v.rule_id=r.id)`
    );
    return del.rowCount ?? 0;
  }

  async findRulesByIdPrefix(prefix: string): Promise<RuleDefinition[]> {
    const { rows } = await this.pool.query<{ definition: RuleDefinition }>(
      'SELECT definition FROM rule_versions WHERE rule_id LIKE $1 ORDER BY version ASC',
      [prefix + '%']
    );
    return rows.map((r) => r.definition);
  }

  /* ---------- users & sessions ---------- */

  async createUser(u: Omit<UserRecord, 'id' | 'createdAt' | 'disabled'>): Promise<UserRecord> {
    const id = stableId('usr', u.username);
    await this.pool.query(
      `INSERT INTO users (id, username, password_hash, display_name, role, created_at, disabled)
       VALUES ($1,$2,$3,$4,$5,$6,false)
       ON CONFLICT (username) DO NOTHING`,
      [id, u.username, u.passwordHash, u.displayName, u.role, isoNow()]
    );
    return (await this.getUserByUsername(u.username))!;
  }

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM users WHERE username=$1 AND disabled=false LIMIT 1', [username]
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM users WHERE id=$1 AND disabled=false LIMIT 1', [id]
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async listUsers(): Promise<UserRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users ORDER BY created_at ASC');
    return rows.map(mapUserRow);
  }

  async ensureDefaultAdmin(passwordHash: string): Promise<void> {
    const { rows } = await this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
    if ((rows[0]?.n ?? 0) === 0) {
      await this.createUser({
        username: 'admin', passwordHash, displayName: '시스템 관리자', role: 'ADMIN'
      });
    }
  }

  async createSession(token: string, userId: string, csrfToken: string, ttlMs: number): Promise<SessionRecord> {
    const rec: SessionRecord = {
      token, userId, csrfToken, createdAt: isoNow(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString()
    };
    await this.pool.query(
      `INSERT INTO sessions (token, user_id, csrf_token, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (token) DO UPDATE SET csrf_token=EXCLUDED.csrf_token, expires_at=EXCLUDED.expires_at`,
      [rec.token, rec.userId, rec.csrfToken, rec.createdAt, rec.expiresAt]
    );
    return rec;
  }

  async getSession(token: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM sessions WHERE token=$1', [token]);
    const r = rows[0];
    if (!r) return null;
    const rec: SessionRecord = {
      token: String(r.token), userId: String(r.user_id), csrfToken: String(r.csrf_token),
      createdAt: iso(r.created_at), expiresAt: iso(r.expires_at)
    };
    if (new Date(rec.expiresAt).getTime() < Date.now()) {
      await this.deleteSession(token);
      return null;
    }
    return rec;
  }

  async deleteSession(token: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token=$1', [token]);
  }

  /* ---------- projects ---------- */

  async createProject(
    p: Omit<ProjectRecord, 'id' | 'createdAt' | 'updatedAt'>,
    checklistTemplates: Record<string, string[]>
  ): Promise<ProjectRecord> {
    const id = stableId('prj', p.ownerId, p.name, isoNow());
    const now = isoNow();
    const client = await this.beginTx();
    try {
      await client.query(
        `INSERT INTO contract_projects
           (id, owner_id, name, contract_category, estimated_price, organization_type, status, wizard_input, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)`,
        [id, p.ownerId, p.name, p.contractCategory, p.estimatedPrice, p.organizationType,
          p.status, p.wizardInput ? JSON.stringify(p.wizardInput) : null, now]
      );
      for (let i = 0; i < STAGES.length; i++) {
        const stage = STAGES[i]!;
        const stepId = stableId('step', id, stage);
        await client.query(
          `INSERT INTO project_steps (id, project_id, stage_key, sort_order, status)
           VALUES ($1,$2,$3,$4,'pending')`,
          [stepId, id, stage, i]
        );
        for (const label of checklistTemplates[stage] ?? []) {
          await client.query(
            `INSERT INTO project_checklist_items (id, step_id, project_id, label, done, required, updated_at)
             VALUES ($1,$2,$3,$4,false,true,$5)`,
            [stableId('chk', stepId, label), stepId, id, label, now]
          );
        }
      }
      await commit(client);
    } catch (err) {
      await rollback(client);
      throw err;
    }
    return (await this.getProject(id))!;
  }

  async listProjects(ownerId?: string): Promise<ProjectRecord[]> {
    const { rows } = ownerId
      ? await this.pool.query<Row>('SELECT * FROM contract_projects WHERE owner_id=$1 ORDER BY created_at DESC', [ownerId])
      : await this.pool.query<Row>('SELECT * FROM contract_projects ORDER BY created_at DESC');
    return rows.map(mapProjectRow);
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM contract_projects WHERE id=$1', [id]);
    return rows[0] ? mapProjectRow(rows[0]) : null;
  }

  async canAccessProject(projectId: string, userId: string, role: UserRecord['role']): Promise<boolean> {
    const p = await this.getProject(projectId);
    if (!p) return false;
    if (role === 'ADMIN') return true;
    return p.ownerId === userId;
  }

  async updateProject(id: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
    const cur = await this.getProject(id);
    if (!cur) return null;
    const next: ProjectRecord = { ...cur, ...patch, updatedAt: isoNow() };
    await this.pool.query(
      `UPDATE contract_projects SET name=$2, contract_category=$3, estimated_price=$4,
         organization_type=$5, status=$6, wizard_input=$7::jsonb, updated_at=$8
       WHERE id=$1`,
      [id, next.name, next.contractCategory, next.estimatedPrice, next.organizationType,
        next.status, next.wizardInput ? JSON.stringify(next.wizardInput) : null, next.updatedAt]
    );
    return next;
  }

  async stepsOf(projectId: string): Promise<StepRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM project_steps WHERE project_id=$1 ORDER BY sort_order ASC', [projectId]
    );
    return rows.map((r) => ({
      id: String(r.id), projectId: String(r.project_id), stageKey: String(r.stage_key),
      sortOrder: Number(r.sort_order), status: asStepStatus(r.status)
    }));
  }

  async checklistOf(projectId: string): Promise<ChecklistItemRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM project_checklist_items WHERE project_id=$1 ORDER BY id ASC', [projectId]
    );
    return rows.map((r) => ({
      id: String(r.id), stepId: String(r.step_id), projectId: String(r.project_id),
      label: String(r.label), done: Boolean(r.done), required: Boolean(r.required),
      updatedAt: iso(r.updated_at)
    }));
  }

  async toggleChecklist(itemId: string, done: boolean): Promise<ChecklistItemRecord | null> {
    const upd = await this.pool.query<Row>(
      'UPDATE project_checklist_items SET done=$2, updated_at=$3 WHERE id=$1 RETURNING *',
      [itemId, done, isoNow()]
    );
    const item = upd.rows[0];
    if (!item) return null;
    const agg = await this.pool.query<{ total: number; donecnt: number }>(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE done)::int AS donecnt FROM project_checklist_items WHERE step_id=$1",
      [String(item.step_id)]
    );
    const total = agg.rows[0]?.total ?? 0;
    const donecnt = agg.rows[0]?.donecnt ?? 0;
    const status = total > 0 && donecnt === total ? 'done' : donecnt > 0 ? 'in_progress' : 'pending';
    await this.pool.query('UPDATE project_steps SET status=$2 WHERE id=$1', [String(item.step_id), status]);
    return {
      id: String(item.id), stepId: String(item.step_id), projectId: String(item.project_id),
      label: String(item.label), done: Boolean(item.done), required: Boolean(item.required),
      updatedAt: iso(item.updated_at)
    };
  }

  async setStepStatus(stepId: string, status: StepRecord['status']): Promise<StepRecord | null> {
    const res = await this.pool.query<Row>(
      'UPDATE project_steps SET status=$2 WHERE id=$1 RETURNING *', [stepId, status]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: String(r.id), projectId: String(r.project_id), stageKey: String(r.stage_key),
      sortOrder: Number(r.sort_order), status: asStepStatus(r.status)
    };
  }

  async addProjectChange(projectId: string, changeType: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string): Promise<string> {
    const id = stableId('chg', projectId, changeType, isoNow());
    await this.pool.query(
      `INSERT INTO project_changes (id, project_id, change_type, "before", "after", reason, at)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
      [id, projectId, changeType, before, after, reason, isoNow()]
    );
    await this.audit('system', 'project.change', 'project_change', id, { projectId, changeType, reason });
    return id;
  }

  /* ---------- audit ---------- */

  async audit(actorUserId: string | null, action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown> | null, ip?: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, detail, ip, at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [stableId('aud', action, targetType, targetId ?? '', isoNow()),
        actorUserId, action, targetType, targetId, detail ?? null, ip ?? null, isoNow()]
    );
  }

  async listAudit(limit = 200): Promise<AuditLogRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM audit_logs ORDER BY at DESC LIMIT $1', [limit]
    );
    return rows.map((r) => ({
      id: String(r.id), actorUserId: (r.actor_user_id as string | null) ?? null,
      action: String(r.action), targetType: String(r.target_type),
      targetId: (r.target_id as string | null) ?? null,
      detail: (r.detail as Record<string, unknown> | null) ?? null,
      ip: (r.ip as string | null) ?? null, at: iso(r.at)
    }));
  }

  /* ---------- crawl runs ---------- */

  async startCrawlRun(mode: string): Promise<CrawlRunRecord> {
    const id = stableId('run', mode, isoNow());
    const startedAt = isoNow();
    await this.pool.query(
      "INSERT INTO crawl_runs (id, mode, started_at, status) VALUES ($1,$2,$3,'running')",
      [id, mode, startedAt]
    );
    return {
      id, mode, startedAt, finishedAt: null, status: 'running',
      pagesFetched: 0, pagesChanged: 0, attachmentsFetched: 0, failures: 0
    };
  }

  async finishCrawlRun(id: string, patch: Partial<Omit<CrawlRunRecord, 'id' | 'startedAt'>>): Promise<void> {
    await this.pool.query(
      `UPDATE crawl_runs SET
         status=COALESCE($2,status), pages_fetched=COALESCE($3,pages_fetched),
         pages_changed=COALESCE($4,pages_changed), attachments_fetched=COALESCE($5,attachments_fetched),
         failures=COALESCE($6,failures), finished_at=now()
       WHERE id=$1`,
      [id, patch.status ?? null, patch.pagesFetched ?? null, patch.pagesChanged ?? null,
        patch.attachmentsFetched ?? null, patch.failures ?? null]
    );
  }

  async listCrawlRuns(): Promise<CrawlRunRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM crawl_runs ORDER BY started_at DESC');
    return rows.map((r) => ({
      id: String(r.id), mode: String(r.mode),
      startedAt: iso(r.started_at),
      finishedAt: r.finished_at ? iso(r.finished_at) : null,
      status: asRunStatus(r.status),
      pagesFetched: Number(r.pages_fetched ?? 0), pagesChanged: Number(r.pages_changed ?? 0),
      attachmentsFetched: Number(r.attachments_fetched ?? 0), failures: Number(r.failures ?? 0)
    }));
  }

  /* ---------- answer reports ---------- */

  async addAnswerReport(question: string, answer: string | null, note: string): Promise<AnswerReportRecord> {
    const rec: AnswerReportRecord = {
      id: stableId('rep', question, isoNow()), question, answer,
      reporterNote: note, status: 'open', createdAt: isoNow()
    };
    await this.pool.query(
      `INSERT INTO answer_reports (id, question, answer, reporter_note, status, created_at)
       VALUES ($1,$2,$3,$4,'open',$5)`,
      [rec.id, rec.question, rec.answer, rec.reporterNote, rec.createdAt]
    );
    return rec;
  }

  async listAnswerReports(): Promise<AnswerReportRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM answer_reports ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: String(r.id), question: String(r.question),
      answer: (r.answer as string | null) ?? null,
      reporterNote: (r.reporter_note as string | null) ?? null,
      status: r.status === 'resolved' ? ('resolved' as const) : ('open' as const),
      createdAt: iso(r.created_at)
    }));
  }

  async resolveAnswerReport(id: string): Promise<boolean> {
    const res = await this.pool.query("UPDATE answer_reports SET status='resolved' WHERE id=$1", [id]);
    return (res.rowCount ?? 0) > 0;
  }

  private async beginTx(): Promise<pg.PoolClient> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return client;
  }
}

/* helpers */

function iso(v: unknown): string {
  if (v == null) return isoNow();
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function mapVersionRow(r: Row): SourceVersion {
  return {
    id: String(r.id),
    sourceId: String(r.source_id),
    url: String(r.url),
    title: String(r.title),
    menuPath: (r.menu_path as string[] | null) ?? [],
    publishedAt: (r.published_at as string | null) ?? null,
    effectiveAt: (r.effective_at as string | null) ?? null,
    collectedAt: iso(r.collected_at),
    lastCheckedAt: iso(r.last_checked_at),
    contentSha256: String(r.content_sha256),
    rawHtmlPath: (r.raw_html_path as string | null) ?? undefined,
    status: r.status === 'inactive' ? 'inactive' : 'active',
    versionIndex: Number(r.version_index)
  };
}

function mapAttachmentRow(r: Row): AttachmentRef {
  return {
    url: String(r.url),
    fileName: String(r.file_name),
    ext: String(r.ext),
    robotsDisallowed: Boolean(r.robots_disallowed),
    sha256: (r.sha256 as string | null) ?? undefined,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : undefined,
    mimeType: (r.mime_type as string | null) ?? undefined,
    savedPath: (r.saved_path as string | null) ?? undefined
  };
}

function mapUserRow(r: Row): UserRecord {
  return {
    id: String(r.id), username: String(r.username), passwordHash: String(r.password_hash),
    displayName: String(r.display_name),
    role: (['USER', 'REVIEWER', 'ADMIN'].includes(String(r.role))
      ? String(r.role) : 'USER') as UserRecord['role'],
    createdAt: iso(r.created_at), disabled: Boolean(r.disabled)
  };
}

function mapProjectRow(r: Row): ProjectRecord {
  return {
    id: String(r.id), ownerId: String(r.owner_id), name: String(r.name),
    contractCategory: String(r.contract_category), estimatedPrice: Number(r.estimated_price ?? 0),
    organizationType: String(r.organization_type),
    status: (['planning', 'contracting', 'working', 'completed', 'warranty'].includes(String(r.status))
      ? String(r.status) : 'planning') as ProjectRecord['status'],
    wizardInput: (r.wizard_input as ProjectRecord['wizardInput'] | null) ?? null,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  };
}

function asRuleStatus(v: unknown): RuleDefinition['status'] {
  return v === 'reviewed' || v === 'active' || v === 'superseded' ? v : 'draft';
}

function asStepStatus(v: unknown): StepRecord['status'] {
  return v === 'in_progress' ? 'in_progress' : v === 'done' ? 'done' : 'pending';
}

function asRunStatus(v: unknown): CrawlRunRecord['status'] {
  return v === 'aborted' ? 'aborted' : v === 'done' ? 'done' : 'running';
}

async function commit(client: pg.PoolClient): Promise<void> {
  await client.query('COMMIT');
  client.release();
}

async function rollback(client: pg.PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  client.release();
}
