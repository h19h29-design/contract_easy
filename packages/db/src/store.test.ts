import { describe, it, expect, vi } from 'vitest';
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
    const admin = store.createUser({ username: 'r1-admin', passwordHash: 's:h', displayName: 'Admin', role: 'ADMIN' });
    store.upsertRule(baseRule('r1', 1, 'draft'));
    expect(store.activateReviewedRule('r1', 1, admin.id, '2026-08-30')).toEqual({ ok: false, code: 'INVALID_STATE' });
  });

  it('reviewed 거쳐 active 승인, 신규 버전 active 시 구버전 superseded', () => {
    const store = new FileStore(tmp());
    const reviewer = store.createUser({ username: 'r1-reviewer', passwordHash: 's:h', displayName: 'Reviewer', role: 'REVIEWER' });
    const admin = store.createUser({ username: 'r1-admin-2', passwordHash: 's:h', displayName: 'Admin', role: 'ADMIN' });
    store.upsertRule(baseRule('r1', 1, 'draft'));
    expect(store.approveRuleReview('r1', 1, reviewer.id, '원문 확인', true).ok).toBe(true);
    expect(store.activateReviewedRule('r1', 1, admin.id, '2026-08-30')).toMatchObject({ ok: true, rule: { status: 'active' } });

    store.upsertRule(baseRule('r1', 2, 'draft'));
    expect(store.approveRuleReview('r1', 2, reviewer.id, '원문 확인', true).ok).toBe(true);
    expect(store.activateReviewedRule('r1', 2, admin.id, '2026-08-30').ok).toBe(true);
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

describe('체크리스트 증빙 메타데이터', () => {
  it('증빙 교체가 이전 document를 보존', () => {
    const store = new FileStore(tmp());
    const owner = store.createUser({ username: 'evidence-owner', passwordHash: 's:h', displayName: 'Owner', role: 'USER' });
    const project = store.createProject({
      ownerId: owner.id, name: '증빙 교체', contractCategory: 'construction',
      estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 제출'] });
    const item = store.checklistOf(project.id)[0]!;

    const first = store.saveChecklistEvidence(documentInput(project.id, item.id, 'a'.repeat(64)));
    const second = store.saveChecklistEvidence(documentInput(project.id, item.id, 'b'.repeat(64)));

    expect(second?.previousDocumentId).toBe(first?.document.id);
    expect(store.listProjectDocuments(project.id)).toHaveLength(2);
    expect(store.checklistOf(project.id)[0]?.evidencePath).toBe(second?.document.id);
    expect(store.listAudit().at(0)).toMatchObject({
      action: 'checklist.evidence.save',
      detail: {
        checklistItemId: item.id,
        previousDocumentId: first?.document.id,
        newDocumentId: second?.document.id,
        sha256: 'b'.repeat(64)
      }
    });
    expect(store.listAudit().at(0)?.detail).not.toHaveProperty('storedPath');
  });

  it('다른 프로젝트 item에 document를 연결하지 않음', () => {
    const store = new FileStore(tmp());
    const owner = store.createUser({ username: 'evidence-cross-owner', passwordHash: 's:h', displayName: 'Owner', role: 'USER' });
    const projectA = store.createProject({
      ownerId: owner.id, name: '프로젝트 A', contractCategory: 'construction',
      estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 A'] });
    const projectB = store.createProject({
      ownerId: owner.id, name: '프로젝트 B', contractCategory: 'construction',
      estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 B'] });
    const itemB = store.checklistOf(projectB.id)[0]!;

    expect(store.saveChecklistEvidence(documentInput(projectA.id, itemB.id, 'c'.repeat(64)))).toBeNull();
    expect(store.checklistOf(projectB.id)[0]?.evidencePath).toBeNull();
    expect(store.listProjectDocuments(projectA.id)).toEqual([]);
    expect(store.listAudit()).toEqual([]);
  });

  it('동일 시각에 같은 SHA 증빙을 교체해도 문서 ID를 중복하지 않음', () => {
    const store = new FileStore(tmp());
    const owner = store.createUser({ username: 'evidence-same-sha', passwordHash: 's:h', displayName: 'Owner', role: 'USER' });
    const project = store.createProject({
      ownerId: owner.id, name: '동일 SHA 증빙', contractCategory: 'construction',
      estimatedPrice: 0, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 제출'] });
    const item = store.checklistOf(project.id)[0]!;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-30T00:00:00.000Z'));
      const first = store.saveChecklistEvidence(documentInput(project.id, item.id, 'd'.repeat(64)))!;
      const second = store.saveChecklistEvidence(documentInput(project.id, item.id, 'd'.repeat(64)))!;

      expect(second.document.id).not.toBe(first.document.id);
      expect(second.previousDocumentId).toBe(first.document.id);
      expect(store.listProjectDocuments(project.id)).toHaveLength(2);
      expect(store.listProjectDocuments(project.id).map((document) => document.id)).toEqual(expect.arrayContaining([
        first.document.id, second.document.id
      ]));
      expect(store.checklistOf(project.id)[0]?.evidencePath).toBe(second.document.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('기존 문서의 누락되거나 false인 isPrivate은 true로 정규화한다', () => {
    const dir = tmp();
    new FileStore(dir);
    const file = path.join(dir, 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    db.projectDocuments = [
      {
        id: 'legacy-missing-private', projectId: 'legacy-project', uploadedBy: 'u1',
        originalName: '기존-누락.pdf', storedPath: '/legacy/missing.pdf', mimeType: 'application/pdf',
        sizeBytes: 12, sha256: 'e'.repeat(64), uploadedAt: '2026-08-30T00:00:00.000Z'
      },
      {
        id: 'legacy-false-private', projectId: 'legacy-project', uploadedBy: 'u2',
        originalName: '기존-false.pdf', storedPath: '/legacy/false.pdf', mimeType: 'application/pdf',
        sizeBytes: 34, sha256: 'f'.repeat(64), isPrivate: false, uploadedAt: '2026-08-30T00:00:01.000Z'
      }
    ];
    fs.writeFileSync(file, JSON.stringify(db), 'utf8');

    expect(new FileStore(dir).listProjectDocuments('legacy-project')).toEqual([
      expect.objectContaining({
        id: 'legacy-missing-private', uploadedBy: 'u1', originalName: '기존-누락.pdf',
        storedPath: '/legacy/missing.pdf', sizeBytes: 12, sha256: 'e'.repeat(64), isPrivate: true
      }),
      expect.objectContaining({
        id: 'legacy-false-private', uploadedBy: 'u2', originalName: '기존-false.pdf',
        storedPath: '/legacy/false.pdf', sizeBytes: 34, sha256: 'f'.repeat(64), isPrivate: true
      })
    ]);
  });
});

describe('프로젝트 상태·변경·일정 이력', () => {
  it('공개 프로젝트 반환값과 wizardInput 변경은 저장된 프로젝트를 바꾸지 않는다', () => {
    const store = new FileStore(tmp());
    const owner = store.createUser({ username: 'snapshot-owner', passwordHash: 's:h', displayName: 'Owner', role: 'USER' });
    const wizardInput: WizardInput = {
      projectName: '원본',
      workType: '건축',
      contractCategory: 'construction',
      estimatedPrice: 10,
      governmentMaterials: false,
      constructionWaste: false,
      emergency: false,
      regionRestriction: false,
      performanceRestriction: false,
      organizationType: 'school'
    };
    const created = store.createProject({
      ownerId: owner.id,
      name: '스냅샷 프로젝트',
      contractCategory: 'construction',
      estimatedPrice: 10,
      organizationType: 'school',
      status: 'planning',
      wizardInput
    }, {});

    wizardInput.workType = '입력 변조';
    created.status = 'working';
    created.wizardInput!.workType = 'create 변조';
    const fromGet = store.getProject(created.id)!;
    fromGet.status = 'working';
    fromGet.wizardInput!.workType = 'get 변조';
    const fromList = store.listProjects()[0]!;
    fromList.status = 'working';
    fromList.wizardInput!.workType = 'list 변조';
    const updated = store.updateProject(created.id, { name: '이름 갱신' })!;
    updated.status = 'working';
    updated.wizardInput!.workType = 'update 변조';
    const transition = store.transitionProjectStatus(created.id, 'contracting', owner.id, '계약 시작');
    expect(transition).toMatchObject({ ok: true, project: { status: 'contracting' } });
    if (!transition.ok) throw new Error('상태 전이에 실패했습니다');
    transition.project.status = 'warranty';
    transition.project.wizardInput!.workType = 'transition 변조';

    expect(store.getProject(created.id)).toMatchObject({
      name: '이름 갱신',
      status: 'contracting',
      wizardInput: { workType: '건축' }
    });
  });

  it('직접 프로젝트 수정은 상태를 바꾸지 않고 다른 필드는 갱신한다', () => {
    const { store, project } = projectStore();

    const updated = store.updateProject(project.id, { name: '이름만 변경', status: 'working' });

    expect(updated).toMatchObject({ name: '이름만 변경', status: 'planning' });
    expect(store.listProjectChanges(project.id)).toEqual([]);
    expect(store.listAudit().filter((audit) => audit.action === 'project.status.transition')).toEqual([]);
  });

  it('프로젝트 상태는 바로 다음 상태로만 전이', () => {
    const { store, project, owner } = projectStore();
    expect(store.transitionProjectStatus(project.id, 'working', owner.id, '착공')).toEqual({
      ok: false,
      code: 'INVALID_TRANSITION'
    });

    const result = store.transitionProjectStatus(project.id, 'contracting', owner.id, '계약 절차 시작');
    expect(result).toMatchObject({
      ok: true,
      project: { status: 'contracting' },
      change: {
        projectId: project.id,
        changeType: 'status',
        before: { status: 'planning' },
        after: { status: 'contracting' },
        approvedBy: owner.id,
        reason: '계약 절차 시작'
      }
    });
    expect(store.listProjectChanges(project.id)).toHaveLength(1);
  });

  it('변경과 이벤트를 append-only로 최신순 조회', () => {
    const { store, project, owner } = projectStore();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const first = store.addProjectChange(
        project.id,
        'amount',
        { amount: 10 },
        { amount: 11 },
        '사용자 입력 변경',
        owner.id
      );
      const firstEvent = store.addProjectEvent(project.id, 'inspection', '1차 검사', '2026-12-20', owner.id);
      vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
      const second = store.addProjectChange(
        project.id,
        'duration',
        { days: 10 },
        { days: 11 },
        '기간 변경',
        owner.id
      );
      const secondEvent = store.addProjectEvent(project.id, 'inspection', '2차 검사', '2026-12-21', owner.id);

      expect(first).toMatchObject({ approvedBy: owner.id, reason: '사용자 입력 변경' });
      expect(second).toMatchObject({ approvedBy: owner.id, reason: '기간 변경' });
      expect(store.listProjectChanges(project.id)).toMatchObject([
        { id: second?.id, changeType: 'duration' },
        { id: first?.id, changeType: 'amount' }
      ]);
      expect(store.listProjectEvents(project.id)).toMatchObject([
        { id: secondEvent?.id, dueDate: '2026-12-21' },
        { id: firstEvent?.id, dueDate: '2026-12-20' }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('유효하지 않은 이벤트 날짜는 저장하지 않는다', () => {
    const { store, project, owner } = projectStore();

    expect(store.addProjectEvent(project.id, 'inspection', '잘못된 날짜', '2026-02-30', owner.id)).toBeNull();
    expect(store.addProjectEvent(project.id, 'inspection', '접미사 날짜', '2026-02-28extra', owner.id)).toBeNull();
    expect(store.listProjectEvents(project.id)).toEqual([]);
    expect(store.listAudit().filter((audit) => audit.action === 'project.event.create')).toEqual([]);
  });

  it('변경과 이벤트 이력은 입력·반환·조회 객체 변경으로 오염되지 않는다', () => {
    const { store, project, owner } = projectStore();
    const before: Record<string, unknown> = { amount: { value: 10 } };
    const after: Record<string, unknown> = { amount: { value: 11 } };
    const change = store.addProjectChange(project.id, 'amount', before, after, '금액 변경', owner.id)!;
    const event = store.addProjectEvent(project.id, 'inspection', '준공검사 예정', '2026-12-20', owner.id)!;

    (before.amount as { value: number }).value = 999;
    (after.amount as { value: number }).value = 999;
    (change.before!.amount as { value: number }).value = 888;
    change.reason = '변조';
    event.title = '변조';
    const listedChange = store.listProjectChanges(project.id)[0]!;
    const listedEvent = store.listProjectEvents(project.id)[0]!;
    (listedChange.after!.amount as { value: number }).value = 777;
    listedChange.reason = '변조';
    listedEvent.title = '변조';

    expect(store.listProjectChanges(project.id)[0]).toMatchObject({
      before: { amount: { value: 10 } },
      after: { amount: { value: 11 } },
      reason: '금액 변경'
    });
    expect(store.listProjectEvents(project.id)[0]).toMatchObject({ title: '준공검사 예정' });
  });

  it('기존 JSON은 변경 및 이벤트 배열 없이도 로드한다', () => {
    const dir = tmp();
    new FileStore(dir);
    const file = path.join(dir, 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    delete db.projectChanges;
    delete db.projectEvents;
    fs.writeFileSync(file, JSON.stringify(db), 'utf8');

    const reloaded = new FileStore(dir);
    expect(reloaded.listProjectChanges('unknown')).toEqual([]);
    expect(reloaded.listProjectEvents('unknown')).toEqual([]);
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

import type { RuleDefinition, WizardInput } from '@sen/shared';

function ruleStore(): { store: FileStore; dir: string; reviewer: { id: string }; admin: { id: string } } {
  const dir = tmp();
  const store = new FileStore(dir);
  const reviewer = store.createUser({ username: 'reviewer', passwordHash: 's:h', displayName: 'Reviewer', role: 'REVIEWER' });
  const admin = store.createUser({ username: 'admin', passwordHash: 's:h', displayName: 'Admin', role: 'ADMIN' });
  store.upsertRule(baseRule('safe', 1, 'draft', '입찰'));
  return { store, dir, reviewer, admin };
}

function projectStore(): { store: FileStore; project: ReturnType<FileStore['createProject']>; owner: { id: string } } {
  const store = new FileStore(tmp());
  const owner = store.createUser({ username: 'project-owner', passwordHash: 's:h', displayName: 'Owner', role: 'USER' });
  const project = store.createProject({
    ownerId: owner.id,
    name: '프로젝트 상태 이력',
    contractCategory: 'construction',
    estimatedPrice: 0,
    organizationType: 'school',
    status: 'planning',
    wizardInput: null
  }, {});
  return { store, project, owner };
}

function documentInput(projectId: string, checklistItemId: string, sha256: string) {
  return {
    projectId,
    checklistItemId,
    uploadedBy: 'evidence-uploader',
    originalName: '검사조서.pdf',
    storedPath: '/private/evidence/검사조서.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    sha256
  };
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
