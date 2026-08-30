import { expect, test, type Browser, type Page } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:8787';

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
  await expect(page.getByText('contracting')).toBeVisible();

  await page.getByLabel('증빙 파일').first().setInputFiles({
    name: '증빙.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n')
  });
  await expect(page.getByText('증빙.pdf')).toBeVisible();

  await page.getByLabel('변경 사유', { exact: true }).fill('사용자 입력 변경 기록');
  await page.getByRole('button', { name: '변경 기록 추가' }).click();
  await expect(page.getByText('사용자 입력 변경 기록')).toBeVisible();

  await page.getByLabel('마일스톤 제목').fill('준공검사 예정');
  await page.getByLabel('마일스톤 날짜').fill('2099-12-31');
  await page.getByRole('button', { name: '일정 추가' }).click();
  await expect(page.getByText('예정')).toBeVisible();
  expect(project.id).toBeTruthy();
});
