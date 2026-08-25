/**
 * 선택적 Playwright 렌더 엔진(D-002).
 * CRAWLER_ENGINE=playwright일 때만 사용. JS로 목록/본문을 만드는 게시판 수집에 필요.
 * 요청 간격은 HTTP 엔진과 동일한 정책(≥1200ms)을 적용한다.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface RenderedPage {
  finalUrl: string;
  html: string;
  status: number | null;
  screenshotPath: string | null;
}

export class BrowserRenderer {
  private browser: unknown = null;
  private lastAt = 0;
  private delayMs = 1200;
  private screenshotDir: string | null = null;
  private shotCount = 0;

  constructor(opts: { delayMs?: number; userAgent?: string; screenshotDir?: string } = {}) {
    if (opts.delayMs) this.delayMs = Math.max(1200, opts.delayMs);
    this.userAgent = opts.userAgent;
    if (opts.screenshotDir) {
      this.screenshotDir = opts.screenshotDir;
      fs.mkdirSync(opts.screenshotDir, { recursive: true });
    }
  }

  private userAgent: string | undefined;

  private async sleep(): Promise<void> {
    const wait = this.lastAt + this.delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastAt = Date.now();
  }

  async render(url: string): Promise<RenderedPage> {
    await this.sleep();
    const pw = await import('@playwright/test');
    if (!this.browser) {
      this.browser = await pw.chromium.launch({ headless: true });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context = await (this.browser as any).newContext({
      userAgent: this.userAgent,
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 }
    });
    try {
      const page = await context.newPage();
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // 동적 콘텐츠 대기(네트워크 안정화)
      await page.waitForTimeout(1500);
      const html = await page.content();
      const finalUrl = page.url();
      let screenshotPath: string | null = null;
      if (this.screenshotDir && this.shotCount < 20) {
        screenshotPath = path.join(this.screenshotDir, `shot-${++this.shotCount}-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
      return { finalUrl, html, status: resp?.status() ?? null, screenshotPath };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.browser as any).close();
      this.browser = null;
    }
  }

  /**
   * javascript:fncXxx(...) 형태의 링크를 실제 클릭하여 도착 URL을 해석한다.
   * - selector: onclick 속성에 onclickPattern을 포함하는 첫 번째 요소
   * - 실패 시 null 반환(추론 금지 원칙)
   */
  async resolveClickUrl(url: string, onclickPattern: string): Promise<string | null> {
    const pw = await import('@playwright/test');
    if (!this.browser) {
      this.browser = await pw.chromium.launch({ headless: true });
    }
    try {
      await this.sleep();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const context = await (this.browser as any).newContext({
        userAgent: this.userAgent,
        locale: 'ko-KR',
        viewport: { width: 1280, height: 900 }
      });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1200);
        const el = page.locator(`[onclick*="${onclickPattern.replace(/'/g, "\\'")}"]`).first();
        if ((await el.count()) === 0) return null;
        await Promise.all([
          page.waitForLoadState('domcontentloaded').catch(() => undefined),
          el.click()
        ]);
        await page.waitForTimeout(1500);
        const finalUrl = page.url();
        if (/^(javascript:|#|$)/.test(finalUrl)) return null;
        return finalUrl;
      } finally {
        await context.close();
      }
    } catch {
      return null;
    }
  }
}
