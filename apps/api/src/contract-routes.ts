import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppStore, UserRecord } from '@sen/db';
import { CONTRACT_TEMPLATE_VERSION, contractMissingFields, emptyContractFields, validateContractFields } from '@sen/shared';
import { generateContractHwpx } from './contract-hwpx.js';
import { attachmentDisposition } from './project-files.js';

type Params = { id: string };
type Query = { revision?: string; reviewed?: string };
const validRevision = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;

export function registerContractRoutes(app: FastifyInstance, store: AppStore, requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<UserRecord | null>) {
  async function authorized(req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    const user = await requireUser(req, reply);
    if (!user) return null;
    if (!(await store.canAccessProject(req.params.id, user.id, user.role))) {
      reply.code(404).send({ error: '프로젝트가 없거나 접근 권한이 없습니다.' }); return null;
    }
    return user;
  }
  app.get<{ Params: Params; Querystring: Query }>('/api/projects/:id/contract', async (req, reply) => {
    if (!(await authorized(req, reply))) return;
    if (req.query.revision !== undefined && !validRevision(req.query.revision)) return reply.code(400).send({ error: '버전이 올바르지 않습니다.' });
    const draft = await store.getContractDraft(req.params.id, req.query.revision ? Number(req.query.revision) : undefined);
    if (req.query.revision && !draft) return reply.code(404).send({ error: '초안 버전이 없습니다.' });
    const project = await store.getProject(req.params.id);
    const initialFields = { ...emptyContractFields(), workName: project?.name ?? '' };
    return { draft, initialFields, templateVersion: CONTRACT_TEMPLATE_VERSION };
  });
  app.put<{ Params: Params; Body: { fields?: unknown; expectedRevision?: unknown } }>('/api/projects/:id/contract', { bodyLimit: 65536 }, async (req, reply) => {
    const user = await authorized(req, reply);
    if (!user) return;
    const parsed = validateContractFields(req.body?.fields);
    const expected = req.body?.expectedRevision;
    if (!parsed.ok || typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0 || expected >= 2147483647) return reply.code(400).send({ error: parsed.ok ? '버전이 올바르지 않습니다.' : parsed.error });
    const saved = await store.saveContractDraft(req.params.id, parsed.fields, expected, user.id);
    if (!saved.ok) return reply.code(saved.code === 'CONFLICT' ? 409 : saved.code === 'NOT_FOUND' ? 404 : 400).send({ error: saved.code === 'CONFLICT' ? '다른 창에서 저장된 버전이 있습니다. 입력 내용을 별도로 보관한 뒤 최신 버전을 다시 열어 주세요.' : '초안을 저장할 수 없습니다.' });
    await store.audit(user.id, 'contract.save', 'project', req.params.id, { revision: saved.draft.revision }, req.ip);
    return { draft: saved.draft };
  });
  app.get<{ Params: Params; Querystring: Query }>('/api/projects/:id/contract.hwpx', async (req, reply) => {
    if (!(await authorized(req, reply))) return;
    if (!validRevision(req.query.revision)) return reply.code(400).send({ error: '저장된 버전을 지정하세요.' });
    const draft = await store.getContractDraft(req.params.id, Number(req.query.revision));
    if (!draft) return reply.code(404).send({ error: '초안 버전이 없습니다.' });
    if (draft.templateVersion !== CONTRACT_TEMPLATE_VERSION) return reply.code(409).send({ error: '이 초안의 서식 버전을 지원하지 않습니다.' });
    const missing = contractMissingFields(draft.fields);
    if (missing.length || req.query.reviewed !== 'true') return reply.code(422).send({ error: missing.length ? '필수 항목을 입력하고 저장하세요.' : '검토 필요 항목과 초안임을 확인하세요.', missing });
    return reply.type('application/hwp+zip').header('Content-Disposition', attachmentDisposition(`공사표준계약서-초안-v${draft.revision}.hwpx`)).send(generateContractHwpx(draft.fields));
  });
}
