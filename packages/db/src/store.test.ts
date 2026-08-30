import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore, type DbData } from './store.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-store-'));
}

describe('원문 버전 관리', () => {
  it('동일 콘텐츠 재수집 시 중복 버전 생성 없음(중복 0건)', () => {
    const store = new FileStore(tmp());
    const a = store.upsertSourcePage({ url: 'https://x/fus/a', seedName: null, kind: 'guide', title: 'A', contentSha256: 'sha-1', collectedAt: '2026-08-25T00:00:00Z' });
    const b = store.upsertSourcePage({ url: 'https://x/fus/a', seedName: null, kind: 'guide', title: 'A', contentSha256: 'sha-1', collectedAt: '2026-08-26T00:00:00Z' });
    expect(b.versionId).toBe(a.versionId);
    expect(b.changed).toBe(false);
    expect(store.getSource(a.sourceId)!.versions).toHaveLength(1);
  });

  it('콘텐츠 변경 시 새 버전 저장 + 이전 버전 보존(diff 가능)', () => {
    const store = new FileStore(tmp());
    store.upsertSourcePage({ url: 'https://x/fus/b', seedName: null, kind: 'guide', title: '구버전 제목', contentSha256: 'old-sha', collectedAt: '2026-01-01T00:00:00Z' });
    const up = store.upsertSourcePage({ url: 'https://x/fus/b', seedName: null, kind: 'guide', title: '신버전 제목', contentSha256: 'new-sha', collectedAt: '2026-02-01T00:00:00Z' });
    expect(up.changed).toBe(true);
    expect(up.versionIndex).toBe(2);
    const src = store.getSource(up.sourceId)!;
    expect(src.versions).toHaveLength(2);
    expect(src.versions[0]!.contentSha256).toBe('old-sha'); // 구버전 미삭제
  });
});

describe('규칙 승인 플로우(draft → reviewed → active → superseded)', () => {
  it('draft는 바로 activate 불가(자동활성 금지)', () => {
    const store = new FileStore(tmp());
    store.upsertRule(baseRule('r1', 1, 'draft'));
    expect(store.activateRule('r1', 1, 'admin')).toBeNull();
  });

  it('reviewed 거쳐 active 승인, 신규 버전 active 시 구버전 superseded', () => {
    const store = new FileStore(tmp());
    store.upsertRule(baseRule('r1', 1, 'draft'));
    store.reviewRule('r1', 1, 'reviewed');
    expect(store.activateRule('r1', 1, 'admin')?.status).toBe('active');

    store.upsertRule(baseRule('r1', 2, 'draft'));
    store.reviewRule('r1', 2, 'reviewed');
    store.activateRule('r1', 2, 'admin');
    const statuses = Object.fromEntries(store.listRules().map((r) => [`${r.id}@${r.version}`, r.status]));
    expect(statuses['r1@1']).toBe('superseded');
    expect(statuses['r1@2']).toBe('active');
  });
});

describe('엄격한 FileStore 규칙 검토 계약', () => {
  it('재인제스트가 reviewed 정의를 덮어쓰지 않음', () => {
    const { store, reviewer } = ruleStore();
    store.upsertRule(baseRule('safe', 1, 'draft', '입찰'));
    expect(store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true).ok).toBe(true);
    store.upsertRule(baseRule('safe', 1, 'draft', '수의계약'));
    expect(store.listRules().find((r) => r.id === 'safe')?.output.method).toBe('입찰');
  });

  it('reviewer와 같은 사용자 ID는 admin이 되어도 activate 불가', () => {
    const { store, dir, reviewer } = ruleStore();
    store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true);
    const file = path.join(dir, 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8')) as DbData;
    db.users.find((u) => u.id === reviewer.id)!.role = 'ADMIN';
    fs.writeFileSync(file, JSON.stringify(db), 'utf8');
    const reloaded = new FileStore(dir);
    expect(reloaded.activateReviewedRule('safe', 1, reviewer.id, '2026-08-30')).toEqual({ ok: false, code: 'SAME_ACTOR' });
  });

  it('별도 ADMIN이 reviewed 규칙을 activate', () => {
    const { store, reviewer, admin } = ruleStore();
    store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true);
    expect(store.activateReviewedRule('safe', 1, admin.id, '2026-08-30')).toMatchObject({ ok: true, rule: { status: 'active' } });
    expect(store.listRuleReviews('safe', 1).map((r) => r.action)).toEqual(['approve', 'activate']);
  });

  it('같은 규칙의 reviewed v2는 v1을 supersede하고 activate', () => {
    const { store, reviewer, admin } = ruleStore();
    expect(store.approveRuleReview('safe', 1, reviewer.id, 'v1 원문 대조 완료', true).ok).toBe(true);
    expect(store.activateReviewedRule('safe', 1, admin.id, '2026-08-30').ok).toBe(true);
    expect(store.createRuleRevision(baseRule('safe', 2, 'draft', '수의계약'), reviewer.id).ok).toBe(true);
    expect(store.approveRuleReview('safe', 2, reviewer.id, 'v2 원문 대조 완료', true).ok).toBe(true);

    expect(store.activateReviewedRule('safe', 2, admin.id, '2026-08-30')).toMatchObject({ ok: true, rule: { status: 'active' } });
    expect(Object.fromEntries(store.listRules().map((r) => [`${r.id}@${r.version}`, r.status]))).toMatchObject({
      'safe@1': 'superseded',
      'safe@2': 'active'
    });
  });

  it('다른 논리 규칙의 충돌은 activate를 거부', () => {
    const { store, reviewer, admin } = ruleStore();
    expect(store.approveRuleReview('safe', 1, reviewer.id, '원문 대조 완료', true).ok).toBe(true);
    expect(store.activateReviewedRule('safe', 1, admin.id, '2026-08-30').ok).toBe(true);
    expect(store.createRuleRevision(baseRule('conflict', 1, 'draft', '수의계약'), reviewer.id).ok).toBe(true);
    expect(store.approveRuleReview('conflict', 1, reviewer.id, '원문 대조 완료', true).ok).toBe(true);

    expect(store.activateReviewedRule('conflict', 1, admin.id, '2026-08-30')).toEqual({ ok: false, code: 'RULE_CONFLICT' });
  });

  it('hold는 draft와 검토기록을 보존', () => {
    const { store, reviewer } = ruleStore();
    store.upsertRule(baseRule('candidate.held', 1, 'draft', '입찰'));
    expect(store.holdRule('candidate.held', 1, reviewer.id, '경계 재확인').ok).toBe(true);
    expect(store.listRules()).toContainEqual(expect.objectContaining({ id: 'candidate.held', status: 'draft' }));
    expect(store.listRuleReviews('candidate.held', 1)[0]?.action).toBe('hold');
    expect(store.purgeStaleCandidateDrafts([])).toBe(0);
  });

  it('upsert 입력 상태로 승인을 우회하지 못함', () => {
    const { store } = ruleStore();
    store.upsertRule(baseRule('candidate.injected', 1, 'active', '입찰'));
    expect(store.listRules().find((r) => r.id === 'candidate.injected')?.status).toBe('draft');
  });
});

describe('프로젝트 접근제어(RBAC)', () => {
  it('소유자와 ADMIN만 접근 가능', () => {
    const store = new FileStore(tmp());
    const owner = store.createUser({ username: 'u1', passwordHash: 's:h', displayName: 'U1', role: 'USER' });
    const other = store.createUser({ username: 'u2', passwordHash: 's:h', displayName: 'U2', role: 'USER' });
    const admin = store.createUser({ username: 'a1', passwordHash: 's:h', displayName: 'A1', role: 'ADMIN' });
    const p = store.createProject({
      ownerId: owner.id, name: 'P', contractCategory: 'construction',
      estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});
    expect(store.canAccessProject(p.id, owner.id, owner.role)).toBe(true);
    expect(store.canAccessProject(p.id, other.id, other.role)).toBe(false);
    expect(store.canAccessProject(p.id, admin.id, admin.role)).toBe(true);
  });

  it('체크리스트 토글이 단계 상태를 갱신', () => {
    const store = new FileStore(tmp());
    const u = store.createUser({ username: 'u', passwordHash: 's:h', displayName: 'U', role: 'USER' });
    const p = store.createProject({
      ownerId: u.id, name: 'P2', contractCategory: 'construction',
      estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['문서준비'] });
    const item = store.checklistOf(p.id)[0]!;
    store.toggleChecklist(item.id, true);
    expect(store.stepsOf(p.id)[0]!.status).toBe('done');
  });
});

describe('비밀번호 해시', () => {
  it('scrypt 검증 성공/실패', async () => {
    const { hashPassword, verifyPassword } = await import('./password.js');
    const hash = hashPassword('secret!');
    expect(verifyPassword('secret!', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
});

import type { RuleDefinition } from '@sen/shared';

function ruleStore(): { store: FileStore; dir: string; reviewer: { id: string }; admin: { id: string } } {
  const dir = tmp();
  const store = new FileStore(dir);
  const reviewer = store.createUser({ username: 'reviewer', passwordHash: 's:h', displayName: 'Reviewer', role: 'REVIEWER' });
  const admin = store.createUser({ username: 'admin', passwordHash: 's:h', displayName: 'Admin', role: 'ADMIN' });
  store.upsertRule(baseRule('safe', 1, 'draft', '입찰'));
  return { store, dir, reviewer, admin };
}

function baseRule(id: string, version: number, status: RuleDefinition['status'], method = '입찰'): RuleDefinition {
  return {
    id,
    version,
    status,
    scope: { contract_category: 'construction' },
    conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 0] }],
    output: { method, reviewRequired: true },
    source: { title: 't', url: 'https://example.org', effectiveFrom: null, checkedAt: '2026-08-25' },
    reviewedBy: null,
    supersededBy: null,
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-08-25T00:00:00Z'
  };
}
