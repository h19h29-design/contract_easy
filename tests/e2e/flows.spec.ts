import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:8787';

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
