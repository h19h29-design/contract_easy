import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ensureDirs, getConfig, dataPaths, REPO_ROOT } from '@sen/config';
import {
  createStore, hashPassword, verifyPassword,
  STAGES, STAGE_LABELS
} from '@sen/db';
import type { AppStore, UserRecord } from '@sen/db';
import type { Chunk, SearchFilters, WizardInput } from '@sen/shared';
import { HybridRetriever } from '@sen/retrieval';
import { evaluateWizard, detectConflicts } from '@sen/rules';

const SESSION_COOKIE = 'scg_session';

export interface AppContext {
  store: AppStore;
  retriever: HybridRetriever | null;
  sessionSecret: string;
}

export async function buildApp(ctxIn?: Partial<AppContext>) {
  const dirs = ensureDirs();
  const cfg = getConfig();
  const store: AppStore =
    ctxIn?.store ?? (await createStore({ databaseUrl: cfg.databaseUrl, appStoreDir: dirs.appStore }));

  // 최초 관리자 시딩(사용자 0명일 때만). 비밀번호는 환경변수 또는 개발 기본값.
  if ((await store.listUsers()).length === 0) {
    const initial = process.env.ADMIN_INITIAL_PASSWORD ?? 'ChangeMe!2026';
    await store.ensureDefaultAdmin(hashPassword(initial));
    if (!process.env.ADMIN_INITIAL_PASSWORD) {
      console.warn('[api] 초기 관리자 생성: admin / ChangeMe!2026 — 즉시 변경 필요(개발 전용)');
    }
  }

  function loadRetriever(): HybridRetriever {
    const chunksFile = path.join(dataPaths().appStore, 'chunks.json');
    let chunks: Chunk[] = [];
    // chunks.json(파일 인덱스)을 우선 사용 — 파일스토어/PG 모두 동일하게 동작
    if (fs.existsSync(chunksFile)) {
      chunks = JSON.parse(fs.readFileSync(chunksFile, 'utf8')) as Chunk[];
    }
    return new HybridRetriever({ chunks, versions: [] });
  }
  let retriever = ctxIn?.retriever ?? loadRetriever();

  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute'
  });

  // 보안 헤더
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Robots-Tag', 'noai');
  });

  /* ---------- 세션 헬퍼 ---------- */

  async function currentUser(req: FastifyRequest): Promise<UserRecord | null> {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const session = await store.getSession(token);
    if (!session) return null;
    return await store.getUser(session.userId);
  }

  async function requireAuth(req: FastifyRequest, reply: FastifyReply, minRole: 'USER' | 'REVIEWER' | 'ADMIN'): Promise<UserRecord | null> {
    const user = await currentUser(req);
    if (!user) {
      reply.code(401).send({ error: '로그인이 필요합니다.' });
      return null;
    }
    const rank = { USER: 0, REVIEWER: 1, ADMIN: 2 } as const;
    if (rank[user.role] < rank[minRole]) {
      reply.code(403).send({ error: '권한이 없습니다.' });
      return null;
    }
    return user;
  }

  async function checkCsrf(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const token = req.cookies[SESSION_COOKIE];
    const headerToken = req.headers['x-csrf-token'];
    if (!token) return true; // 비로그인 요청은 CSRF 세션 검증 대상 아님
    const session = await store.getSession(token);
    if (!session) return true;
    if (!headerToken || headerToken !== session.csrfToken) {
      reply.code(403).send({ error: 'CSRF 토큰이 유효하지 않습니다.' });
      return false;
    }
    return true;
  }

  app.addHook('preHandler', async (req, reply) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      checkCsrf(req, reply);
    }
  });

  /* ---------- 공개 API ---------- */

  app.get('/api/health', async () => ({
    status: 'ok',
    llmProvider: cfg.llmProvider,
    embeddingProvider: cfg.embeddingProvider,
    databaseMode: cfg.databaseUrl ? 'postgres' : 'file-store',
    chunks: retriever.search('계약', 1).length >= 0 ? 'ready' : 'empty'
  }));

  app.get<{ Querystring: { q?: string; contractType?: string; stage?: string; faqCategory?: string; docType?: string } }>(
    '/api/search',
    async (req, reply) => {
      const q = (req.query.q ?? '').trim();
      if (!q) return reply.code(400).send({ error: '검색어를 입력하세요.' });
      const filters: SearchFilters = {};
      if (req.query.contractType) filters.contractType = req.query.contractType;
      if (req.query.stage) filters.stage = req.query.stage;
      if (req.query.faqCategory) filters.faqCategory = req.query.faqCategory;
      if (req.query.docType) {
        filters.docTypes = [req.query.docType] as NonNullable<SearchFilters['docTypes']>;
      }
      const hits = retriever.search(q, 20, filters).map((h) => ({
        chunkId: h.chunk.id,
        title: h.sourceTitle,
        url: h.sourceUrl,
        snippet: h.chunk.text.slice(0, 300),
        sectionPath: h.chunk.sectionPath,
        type: h.chunk.type,
        publishedAt: h.publishedAt,
        effectiveAt: h.effectiveAt,
        score: Math.round(h.score * 100) / 100
      }));
      return { query: q, count: hits.length, hits };
    }
  );

  app.post<{ Body: { question?: string } }>('/api/ask', async (req, reply) => {
    const question = (req.body?.question ?? '').trim();
    if (!question) return reply.code(400).send({ error: '질문을 입력하세요.' });
    const res = await retriever.ask(question);
    if (res.answered && res.answer) {
      return {
        answered: true,
        answer: res.answer,
        evidence: await Promise.all(res.hits.map(async (h) => ({
          title: h.sourceTitle, url: h.sourceUrl,
          publishedAt: h.publishedAt, effectiveAt: h.effectiveAt,
          lastCheckedAt: (await store.getSource(h.chunk.sourceVersionId))?.versions.at(-1)?.lastCheckedAt ?? null
        }))),
        disclaimer: '법률 자문이 아니며, 최종 판단은 현행 법령·예규·기관 지침과 계약담당자 검토를 따릅니다.'
      };
    }
    return {
      answered: false,
      refusalReason: res.refusalReason,
      providerNotice: res.providerNotice,
      keywordHits: res.hits.slice(0, 5).map((h) => ({ title: h.sourceTitle, url: h.sourceUrl }))
    };
  });

  app.post<{ Body: WizardInput }>('/api/wizard', async (req, reply) => {
    const input = req.body;
    if (!input || typeof input.estimatedPrice !== 'number' || !input.contractCategory) {
      return reply.code(400).send({ error: '입력값이 올바르지 않습니다.' });
    }
    const activeRules = await store.getActiveRules();
    const { result, conflicts } = evaluateWizard(input, activeRules);
    return { ...result, conflicts };
  });

  app.get('/api/wiki', async () => {
    const dir = path.join(REPO_ROOT, 'wiki', 'generated');
    if (!fs.existsSync(dir)) return { files: [] };
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => ({ name: f, sizeBytes: fs.statSync(path.join(dir, f)).size }));
    return { files };
  });

  app.get<{ Params: { name: string } }>('/api/wiki/:name', async (req, reply) => {
    const safe = path.basename(req.params.name);
    const file = path.join(REPO_ROOT, 'wiki', 'generated', safe);
    if (!fs.existsSync(file)) return reply.code(404).send({ error: '문서가 없습니다.' });
    return { name: safe, content: fs.readFileSync(file, 'utf8') };
  });

  app.get('/api/sources', async () => ({
    sources: (await store.listSources()).map((s) => {
      const last = s.versions[s.versions.length - 1];
      return {
        id: s.id, url: s.url, kind: s.kind, seedName: s.seedName,
        status: s.status, versionCount: s.versions.length,
        title: last?.title, collectedAt: last?.collectedAt,
        lastCheckedAt: last?.lastCheckedAt,
        attachments: s.attachments.map((a) => ({ fileName: a.fileName, ext: a.ext, robotsDisallowed: a.robotsDisallowed }))
      };
    })
  }));

  app.post<{ Body: { question?: string; answer?: string; note?: string } }>('/api/reports', async (req, reply) => {
    const q = (req.body?.question ?? '').trim();
    if (!q) return reply.code(400).send({ error: '신고할 질문이 필요합니다.' });
    const rec = await store.addAnswerReport(q, req.body.answer ?? null, req.body.note ?? '');
    await store.audit(null, 'report.create', 'answer_report', rec.id);
    return rec;
  });

  /* ---------- 인증 ---------- */

  app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
    const username = (req.body.username ?? '').trim();
    const password = req.body.password ?? '';
    const user = await store.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await store.audit(null, 'auth.login_failed', 'user', null, { username }, req.ip);
      return reply.code(401).send({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    const token = crypto.randomUUID() + crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    await store.createSession(token, user.id, csrfToken, 12 * 60 * 60 * 1000);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', path: '/',
      secure: process.env.NODE_ENV === 'production'
    });
    await store.audit(user.id, 'auth.login', 'user', user.id, null, req.ip);
    return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, csrfToken };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await store.deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const user = await currentUser(req);
    if (!user) return { loggedIn: false };
    const token = req.cookies[SESSION_COOKIE]!;
    const session = (await store.getSession(token))!;
    return { loggedIn: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, csrfToken: session.csrfToken };
  });

  /* ---------- 프로젝트(USER 이상) ---------- */

  app.get('/api/projects', async (req, reply) => {
    const user = await requireAuth(req, reply, 'USER');
    if (!user) return;
    const projects = user.role === 'ADMIN' ? await store.listProjects() : await store.listProjects(user.id);
    return {
      projects: await Promise.all(projects.map(async (p) => ({
        ...p,
        progress: await computeProgress(store, p.id)
      })))
    };
  });

  app.post<{ Body: { name?: string; contractCategory?: string; estimatedPrice?: number; organizationType?: string; wizardInput?: WizardInput } }>(
    '/api/projects',
    async (req, reply) => {
      const user = await requireAuth(req, reply, 'USER');
      if (!user) return;
      const b = req.body;
      if (!b.name || !b.contractCategory || !b.organizationType) {
        return reply.code(400).send({ error: '프로젝트명·공사구분·기관구분은 필수입니다.' });
      }
      const project = await store.createProject({
        ownerId: user.id,
        name: b.name.slice(0, 200),
        contractCategory: b.contractCategory,
        estimatedPrice: Number(b.estimatedPrice ?? 0),
        organizationType: b.organizationType,
        status: 'planning',
        wizardInput: b.wizardInput ?? null
      }, DEFAULT_CHECKLIST_TEMPLATES);
      await store.audit(user.id, 'project.create', 'project', project.id, { name: project.name }, req.ip);
      return project;
    }
  );

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const user = await requireAuth(req, reply, 'USER');
    if (!user) return;
    const p = await store.getProject(req.params.id);
    if (!p || !(await store.canAccessProject(p.id, user.id, user.role))) {
      return reply.code(404).send({ error: '프로젝트가 없거나 접근 권한이 없습니다.' });
    }
    return {
      project: p,
      steps: (await store.stepsOf(p.id)).map((s) => ({ ...s, label: STAGE_LABELS[s.stageKey] ?? s.stageKey })),
      checklist: await store.checklistOf(p.id),
      progress: await computeProgress(store, p.id)
    };
  });

  app.patch<{ Params: { id: string; itemId: string }, Body: { done?: boolean } }>(
    '/api/projects/:id/checklist/:itemId',
    async (req, reply) => {
      const user = await requireAuth(req, reply, 'USER');
      if (!user) return;
      const p = await store.getProject(req.params.id);
      if (!p || !(await store.canAccessProject(p.id, user.id, user.role))) {
        return reply.code(404).send({ error: '권한 없음' });
      }
      const item = await store.toggleChecklist(req.params.itemId, Boolean(req.body.done));
      if (!item) return reply.code(404).send({ error: '항목 없음' });
      await store.audit(user.id, 'project.checklist_toggle', 'checklist_item', item.id, { done: item.done }, req.ip);
      return item;
    }
  );

  app.post<{ Params: { id: string }, Body: { changeType?: string; before?: object; after?: object; reason?: string } }>(
    '/api/projects/:id/changes',
    async (req, reply) => {
      const user = await requireAuth(req, reply, 'USER');
      if (!user) return;
      const p = await store.getProject(req.params.id);
      if (!p || !(await store.canAccessProject(p.id, user.id, user.role))) {
        return reply.code(404).send({ error: '권한 없음' });
      }
      const id = await store.addProjectChange(
        p.id,
        req.body.changeType ?? 'other',
        (req.body.before as Record<string, unknown>) ?? null,
        (req.body.after as Record<string, unknown>) ?? null,
        req.body.reason ?? ''
      );
      await store.audit(user.id, 'project.change_record', 'project_change', id, { changeType: req.body.changeType }, req.ip);
      return { id };
    }
  );

  /* ---------- 관리자 ---------- */

  app.get('/api/admin/crawls', async (req, reply) => {
    const user = await requireAuth(req, reply, 'ADMIN');
    if (!user) return;
    const manifestDir = path.join(dataPaths().manifests, 'crawl-failures.jsonl');
    let failures: Array<Record<string, unknown>> = [];
    if (fs.existsSync(manifestDir)) {
      failures = fs.readFileSync(manifestDir, 'utf8').split('\n').filter(Boolean).slice(-100)
        .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return {}; } });
    }
    return {
      runs: await store.listCrawlRuns(),
      sourcesCount: (await store.listSources()).length,
      recentFailures: failures.reverse()
    };
  });

  app.get('/api/admin/rules', async (req, reply) => {
    const user = await requireAuth(req, reply, 'REVIEWER');
    if (!user) return;
    const allRules = await store.listRules();
    return { rules: allRules, conflicts: detectConflicts(allRules) };
  });

  app.post<{ Params: { id: string; version: string }, Body: { action?: 'review' | 'activate' | 'reject' } }>(
    '/api/admin/rules/:id/:version',
    async (req, reply) => {
      const user = await requireAuth(req, reply, 'ADMIN');
      if (!user) return;
      const version = Number(req.params.version);
      const action = req.body.action;
      let ok = false;
      if (action === 'review') { ok = Boolean(await store.reviewRule(req.params.id, version, 'reviewed')); }
      else if (action === 'activate') { ok = Boolean(await store.activateRule(req.params.id, version, user.displayName)); }
      else if (action === 'reject') { ok = await store.rejectRule(req.params.id, version); }
      if (!ok) return reply.code(400).send({ error: '상태 변경 불가(draft는 reviewed를 거쳐야 활성화됩니다).' });
      await store.audit(user.id, `rule.${action}`, 'rule', `${req.params.id}@${version}`, null, req.ip);
      return { ok: true };
    }
  );

  app.get('/api/admin/audit', async (req, reply) => {
    const user = await requireAuth(req, reply, 'ADMIN');
    if (!user) return;
    return { logs: await store.listAudit(300) };
  });

  app.get('/api/admin/reports', async (req, reply) => {
    const user = await requireAuth(req, reply, 'ADMIN');
    if (!user) return;
    return { reports: await store.listAnswerReports() };
  });

  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/resolve', async (req, reply) => {
    const user = await requireAuth(req, reply, 'ADMIN');
    if (!user) return;
    const ok = await store.resolveAnswerReport(req.params.id);
    if (!ok) return reply.code(404).send({ error: 'not found' });
    await store.audit(user.id, 'report.resolve', 'answer_report', req.params.id);
    return { ok: true };
  });

  return { app, store, reloadRetriever: () => { retriever = loadRetriever(); } };
}

async function computeProgress(store: AppStore, projectId: string): Promise<number> {
  const items = await store.checklistOf(projectId);
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export const DEFAULT_CHECKLIST_TEMPLATES: Record<string, string[]> = Object.fromEntries(
  STAGES.map((stage) => [stage, [
    '단계 목표 확인',
    '필요서류 준비 여부 확인',
    '담당자 검토 완료'
  ]])
);

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const port = Number(process.env.API_PORT ?? 8787);
  buildApp().then(({ app }) =>
    app.listen({ port, host: '127.0.0.1' }).then(() => {
      console.log(`API listening on http://localhost:${port}`);
    })
  );
}
