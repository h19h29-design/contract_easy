import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:8787';

// Keep the production limiter intact; reserve enough requests for one complete flow.
test.beforeEach(async ({ request }, testInfo) => {
  const response = await request.get(`${API}/api/health`);
  expect([200, 429]).toContain(response.status());
  const headers = response.headers();
  const remaining = Number(headers['x-ratelimit-remaining']);
  const resetSeconds = Number(headers['x-ratelimit-reset']);
  expect(Number.isFinite(remaining)).toBe(true);
  expect(Number.isFinite(resetSeconds)).toBe(true);
  if (remaining < 60) {
    expect(resetSeconds).toBeGreaterThanOrEqual(0);
    expect(resetSeconds).toBeLessThanOrEqual(60);
    const delay = resetSeconds * 1000 + 100;
    testInfo.setTimeout(testInfo.timeout + delay);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
});

test('공사표준계약서 입력·저장·재조회·수정·HWPX 다운로드', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await loginExistingPage(page, 'admin', 'ChangeMe!2026');
  await createAndOpenProject(page, 'HWPX 합성 테스트 공사');
  await page.getByRole('link', { name: '공사표준계약서 작성' }).click();
  await expect(page.getByRole('heading', { name: '공사표준계약서 작성' })).toBeVisible();
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await expect(page.getByLabel('공사명', { exact: true })).toHaveValue('HWPX 합성 테스트 공사');
  await expect(page.getByLabel('계약금액(원)', { exact: true })).toHaveValue('');
  const data: Record<string, string> = {
    '공사명': '교실 & <보수> 공사', '현장': '합성 학교 교실', '계약금액(원)': '9007199254740993',
    '계약일': '2026-09-12', '착공일': '2026-09-13', '준공일': '2026-10-01',
    '발주기관명': '가상학교', '발주기관 주소': '합성 주소', '계약담당자 직위': '계약담당자', '계약담당자 성명': '가상담당',
    '업체명': '가상시공', '사업자등록번호': '000-00-00000', '업체 주소': '테스트 주소', '업체 대표자': '가상대표'
  };
  for (const [label, value] of Object.entries(data)) await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.getByRole('button', { name: 'HWPX 다운로드' })).toBeDisabled();
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 1');
  await page.reload();
  await expect(page.getByLabel('계약금액(원)', { exact: true })).toHaveValue('9007199254740993');
  await page.getByLabel('공사명', { exact: true }).fill('수정된 공사명');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 2');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.getByTestId('contract-preview')).toContainText('수정된 공사명');
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-e2e-'));
  await page.screenshot({ path: path.join(artifacts, 'desktop.png') });
  await page.getByLabel('검토 필요 항목을 확인했으며 이 문서는 초안임을 이해합니다.').check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HWPX 다운로드' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('공사표준계약서-초안-v2.hwpx');
  const output = path.join(artifacts, download.suggestedFilename());
  await download.saveAs(output);
  expect(fs.readFileSync(output).subarray(0, 4)).toEqual(Buffer.from([80, 75, 3, 4]));
  expect(fs.statSync(output).size).toBeGreaterThan(2000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: '공사표준계약서 작성' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  console.log(`Synthetic contract evidence: ${artifacts}`);
});

test('후속 서식 선택·공통정보 재사용·저장·HWPX 다운로드', async ({ page }) => {
  await loginExistingPage(page, 'admin', 'ChangeMe!2026');
  await createAndOpenProject(page, '후속 서식 합성 공사');
  await page.getByRole('link', { name: '공사표준계약서 작성' }).click();
  await page.getByLabel('작성할 서식').selectOption('commencement');
  await expect(page.getByRole('heading', { name: '착공계 작성' })).toBeVisible();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const common: Record<string, string> = { '계약금액(원)': '9007199254740993', '계약일': '2026-09-12', '실제 착공일': '2026-09-13', '준공일': '2026-09-30', '착공계 제출일': '2026-09-14', '발주기관명': '가상학교', '수신인 직위': '학교장', '업체명': '가상건설', '사업자등록번호': '000-00-00000', '업체 주소': '합성 주소', '업체 대표자': '가상대표' };
  await expect(page.getByLabel('실제 착공일', { exact: true })).toHaveValue('');
  for (const [label, value] of Object.entries(common)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 1');
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-followups-'));
  const downloadForm = async (name: string, revision: number) => {
    await page.getByLabel('검토 필요 항목을 확인했으며 이 문서는 초안임을 이해합니다.').check();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'HWPX 다운로드' }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`${name}-초안-v${revision}.hwpx`);
    await download.saveAs(path.join(artifacts, download.suggestedFilename()));
    await expect(page.getByLabel('작성할 서식')).toBeEnabled();
  };
  await downloadForm('착공계', 1);
  await page.getByLabel('작성할 서식').selectOption('completion');
  await expect(page.getByLabel('공사명', { exact: true })).toHaveValue('후속 서식 합성 공사');
  await expect(page.getByLabel('실제 착공일', { exact: true })).toHaveValue('2026-09-13');
  await expect(page.getByRole('button', { name: 'HWPX 다운로드' })).toBeDisabled();
  await page.getByLabel('실제 준공일', { exact: true }).fill('2026-10-01');
  await page.getByLabel('준공계 제출일', { exact: true }).fill('2026-10-02');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 2');
  await downloadForm('준공계', 2);
  await page.getByLabel('작성할 서식').selectOption('payment');
  await expect(page.getByLabel('청구금액(원)', { exact: true })).toHaveValue('');
  const payment = { '준공금액(원)': '9007199254740993', '기지급액(원)': '0', '청구금액(원)': '9007199254740881', '공제금액(원)': '112', '청구일': '2026-10-03', '은행명': '가상은행', '계좌번호': '000-SYNTHETIC-000', '예금주': '가상건설' };
  for (const [label, value] of Object.entries(payment)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 3');
  await page.reload();
  await expect(page.getByLabel('작성할 서식')).toHaveValue('payment');
  await expect(page.getByLabel('계좌번호', { exact: true })).toHaveValue('000-SYNTHETIC-000');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.getByTestId('contract-preview')).toContainText('9007199254740881');
  await page.getByRole('heading', { name: '대금청구서 작성' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'payment-desktop.png') });
  await downloadForm('대금청구서', 3);
  await page.getByLabel('작성할 서식').selectOption('contract');
  await expect(page.getByTestId('contract-preview')).not.toContainText('000-SYNTHETIC-000');
  await page.getByRole('button', { name: '입력', exact: true }).click();
  await page.getByLabel('계약번호', { exact: true }).fill('SYNTHETIC-CONTRACT-4');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 4');
  await page.reload();
  await expect(page.getByLabel('계약번호', { exact: true })).toHaveValue('SYNTHETIC-CONTRACT-4');
  await page.getByLabel('작성할 서식').selectOption('payment');
  await expect(page.getByLabel('계좌번호', { exact: true })).toHaveValue('000-SYNTHETIC-000');
  await expect(page.getByLabel('청구금액(원)', { exact: true })).toHaveValue('9007199254740881');
  await downloadForm('대금청구서', 4);
  await page.getByLabel('작성할 서식').selectOption('representative');
  await page.getByLabel('착공일', { exact: true }).fill('2026-09-13');
  await page.getByLabel('현장대리인 성명', { exact: true }).fill('합성현장대리인');
  await page.getByLabel('현장대리인 생년월일', { exact: true }).fill('1990-02-28');
  await page.getByLabel('현장대리인계 제출일', { exact: true }).fill('2026-09-14');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 5');
  await downloadForm('현장대리인계', 5);
  await page.getByLabel('작성할 서식').selectOption('schedule');
  await page.getByLabel('공정별 일정', { exact: true }).fill('철거 | 2026-09-13 | 2026-09-15\n마감 | 2026-09-16 | 2026-09-30');
  await page.getByLabel('예정공정표 제출일', { exact: true }).fill('2026-09-14');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByTestId('contract-save-status')).toContainText('저장된 버전: 6');
  await downloadForm('예정공정표', 6);
  const zipButton = page.getByRole('button', { name: '선택 서식 ZIP 다운로드', exact: true });
  await expect(zipButton).toBeDisabled();
  await expect(page.getByLabel('묶음: 대금청구서', { exact: true })).not.toBeChecked();
  await page.getByLabel('묶음: 착공계', { exact: true }).check();
  await page.getByLabel('묶음: 현장대리인계', { exact: true }).check();
  await page.getByLabel('묶음: 예정공정표', { exact: true }).check();
  await page.getByLabel('선택한 모든 서식의 검토 필요 항목과 개인정보 포함 여부를 확인했습니다.').check();
  await page.getByTestId('contract-bundle').screenshot({ path: path.join(artifacts, 'bundle-desktop.png') });
  const zipPending = page.waitForEvent('download');
  await zipButton.click();
  const zipDownload = await zipPending;
  expect(zipDownload.suggestedFilename()).toBe('공사서류-초안-v6.zip');
  await zipDownload.saveAs(path.join(artifacts, zipDownload.suggestedFilename()));
  await expect(page.getByLabel('작성할 서식')).toBeEnabled();
  await page.getByLabel('묶음: 준공계', { exact: true }).check();
  await expect(zipButton).toBeDisabled();
  await page.getByLabel('작성할 서식').selectOption('payment');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: '대금청구서 작성' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'payment-mobile.png') });
  await page.getByTestId('contract-bundle').screenshot({ path: path.join(artifacts, 'bundle-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(`Synthetic follow-up evidence: ${artifacts}`);
});

async function login(browser: Browser, username: string, password: string): Promise<Page> {
  const page = await browser.newPage();
  await loginExistingPage(page, username, password);
  return page;
}

async function loginExistingPage(page: Page, username: string, password: string) {
  await page.goto('/workspace');
  await page.fill('input[type="text"]', username);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByText('님의 프로젝트')).toBeVisible();
}

async function createAndOpenProject(page: Page, name: string) {
  await page.fill('input[placeholder*="리모델링"]', name);
  await page.getByRole('button', { name: '프로젝트 만들기' }).click();
  const link = page.getByRole('link', { name }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  await link.click();
  return { id: href?.split('/').pop() ?? '' };
}

test('공개 첫 화면 3개 선택지 노출', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /공사계약/ })).toBeVisible();
  await expect(page.getByText('새 공사계약 시작')).toBeVisible();
  await expect(page.getByText('계약업무 질문하기')).toBeVisible();
});

test('마법사 완료 → 활성 규칙 없으면 REVIEW_REQUIRED 안내', async ({ page }) => {
  await page.goto('/wizard');
  // 11개 질문 순차 응답
  for (let i = 0; i < 11; i++) {
    const next = page.getByRole('button', { name: '다음' });
    const submit = page.getByRole('button', { name: '결과 보기' });
    if (await next.isVisible().catch(() => false)) await next.click();
    else await submit.click();
  }
  await expect(page.getByText('담당자 검토 필요').first()).toBeVisible({ timeout: 10000 });
});

test('검색 → 결과 또는 근거없음 거부 표시', async ({ page }) => {
  await page.goto('/search');
  await page.fill('#search-q', '나라장터');
  await page.getByRole('button', { name: '검색' }).click();
  await expect(page.getByRole('heading', { name: /^검색 결과 \(\d+\)$/ })).toBeVisible({ timeout: 15000 });
});

test('근거 없는 질문은 AI 답변 거부', async ({ request }) => {
  const res = await request.post(`${API}/api/ask`, { data: { question: 'zzzqqq 무관한 질문 xxxyyy' } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.answered).toBeFalsy();
});

test('로그인 후 프로젝트 생성·체크리스트 변경', async ({ page }) => {
  await page.goto('/workspace');
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'ChangeMe!2026');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByText('님의 프로젝트')).toBeVisible({ timeout: 10000 });

  await page.fill('input[placeholder*="리모델링"]', 'E2E 테스트 공사');
  await page.getByRole('button', { name: '프로젝트 만들기' }).click();
  await expect(page.getByRole('link', { name: 'E2E 테스트 공사' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'E2E 테스트 공사' }).first().click();
  const firstCheckbox = page.locator('.check-item input[type="checkbox"]').first();
  await firstCheckbox.click(); // PATCH 저장이 비동기이므로 클릭 후 상태 반영을 기다린다
  await expect(firstCheckbox).toBeChecked({ timeout: 10000 });
  await expect(page.getByText(/진행중|1\/3/).first()).toBeVisible({ timeout: 10000 });
});

test('REVIEWER 원문 검토 후 다른 ADMIN 활성화', async ({ browser }) => {
  const reviewerPage = await login(browser, 'e2e-reviewer', 'Reviewer!2026');
  await reviewerPage.goto('/admin/rules');
  await reviewerPage.getByLabel('검토 의견').fill('원문 URL과 금액 경계를 확인함');
  await reviewerPage.getByLabel('원문 대조 확인').check();
  await reviewerPage.getByRole('button', { name: '검토 완료' }).click();
  await expect(reviewerPage.getByText('reviewed')).toBeVisible();

  const adminPage = await login(browser, 'e2e-admin2', 'Admin2!2026');
  await adminPage.goto('/admin/rules');
  await adminPage.getByRole('button', { name: '활성화' }).click();
  await expect(adminPage.getByText('active')).toBeVisible();
});

test('상태·변경·일정·증빙을 한 상세 화면에서 관리', async ({ page }) => {
  await loginExistingPage(page, 'admin', 'ChangeMe!2026');
  const project = await createAndOpenProject(page, '업무공간 E2E');
  await page.getByLabel('상태 변경 사유').fill('계약 절차 시작');
  await page.getByRole('button', { name: 'contracting으로 이동' }).click();
  await expect(page.getByTestId('current-status')).toHaveText('contracting');
  const transitionHistory = page.getByTestId('status-transition-history');
  await expect(transitionHistory).toHaveCount(1);
  await expect(transitionHistory.getByTestId('status-transition-reason')).toHaveText('계약 절차 시작');

  const firstBytes = Buffer.from('%PDF-1.4\nfirst');
  await page.getByLabel('증빙 파일').first().setInputFiles({
    name: '증빙-1.pdf', mimeType: 'application/pdf', buffer: firstBytes
  });
  const currentEvidence = page.getByTestId('evidence-current').first();
  await expect(currentEvidence).toContainText('증빙-1.pdf');
  await expect(currentEvidence).toContainText(/업로드:/);
  const firstDownload = await currentEvidence.getByRole('link', { name: '증빙-1.pdf' }).getAttribute('href');
  expect(firstDownload).toBeTruthy();
  const firstResponse = await page.request.get(firstDownload!);
  expect(firstResponse.ok()).toBeTruthy();
  expect(await firstResponse.body()).toEqual(firstBytes);

  const secondBytes = Buffer.from('%PDF-1.4\nsecond');
  await page.getByLabel('증빙 파일').first().setInputFiles({
    name: '증빙-2.pdf', mimeType: 'application/pdf', buffer: secondBytes
  });
  await expect(currentEvidence).toContainText('증빙-2.pdf');
  await expect(currentEvidence).not.toContainText('증빙-1.pdf');
  const secondDownload = await currentEvidence.getByRole('link', { name: '증빙-2.pdf' }).getAttribute('href');
  expect(secondDownload).toBeTruthy();
  expect(secondDownload).not.toBe(firstDownload);
  const secondResponse = await page.request.get(secondDownload!);
  expect(secondResponse.ok()).toBeTruthy();
  expect(await secondResponse.body()).toEqual(secondBytes);
  const originalResponse = await page.request.get(firstDownload!);
  expect(originalResponse.ok()).toBeTruthy();
  expect(await originalResponse.body()).toEqual(firstBytes);

  await page.getByLabel('변경 사유', { exact: true }).fill('사용자 입력 변경 기록');
  const changeResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/projects/${project.id}/changes`));
  const reloadResponse = page.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith(`/api/projects/${project.id}`));
  const authResponse = page.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/auth/me'));
  await page.getByRole('button', { name: '변경 기록 추가' }).click();
  expect((await changeResponse).status()).toBe(200);
  expect((await reloadResponse).status()).toBe(200);
  expect((await authResponse).status()).toBe(200);
  await expect(page.getByText('사용자 입력 변경 기록')).toBeVisible();

  await page.getByLabel('마일스톤 제목').fill('준공검사 예정');
  await page.getByLabel('마일스톤 날짜').fill('2099-12-31');
  await page.getByRole('button', { name: '일정 추가' }).click();
  await expect(page.getByTestId('event-state').filter({ hasText: '예정' })).toHaveText('예정');
  expect(project.id).toBeTruthy();
});
