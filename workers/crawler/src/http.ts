import { getConfig } from '@sen/config';

export interface FetchResult {
  status: number;
  url: string; // 최종 URL
  body: Buffer;
  headers: Record<string, string>;
}

const MAX_RETRY = 3;

/** 정중한 HTTP 클라이언트: 동시성 1, 간격 보장, 지수 백오프 */
export class PoliteHttpClient {
  private lastRequestAt = 0;
  private cfg = getConfig().crawler;

  async get(url: string): Promise<FetchResult> {
    await this.waitInterval();
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          headers: { 'user-agent': this.cfg.userAgent, 'accept-language': 'ko' },
          signal: AbortSignal.timeout(20000)
        });
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.status === 429 || res.status === 403 || res.status >= 500) {
          attempt++;
          if (attempt > MAX_RETRY) {
            throw Object.assign(new Error(`HTTP ${res.status} after ${MAX_RETRY} retries`), {
              category: `http_${res.status}`
            });
          }
          await sleep(this.backoffMs(attempt));
          continue;
        }
        return { status: res.status, url: res.url || url, body: buf, headers: Object.fromEntries(res.headers) };
      } catch (err) {
        const category = (err as { category?: string }).category ?? /certificate|tls/i.test(String(err)) ? classifyError(err) : classifyError(err);
        attempt++;
        if (attempt > MAX_RETRY) {
          const e = new Error(`${(err as Error).message} (${url})`);
          (e as { category?: string }).category = category;
          throw e;
        }
        await sleep(this.backoffMs(attempt));
      }
    }
  }

  private backoffMs(attempt: number): number {
    return this.cfg.delayMs * Math.pow(2, attempt - 1); // 1.2s → 2.4s → 4.8s
  }

  private async waitInterval(): Promise<void> {
    const now = Date.now();
    const wait = this.lastRequestAt + this.cfg.delayMs - now;
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }
}

export function classifyError(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/abort|timeout|ETIMEDOUT|ECONNRESET/i.test(msg)) return 'network';
  if (/certificate|TLS|SSL/i.test(msg)) return 'tls';
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'dns';
  if (/http_40[34]/.test(msg)) return 'http_4xx_blocked';
  if (/http_429/.test(msg)) return 'rate_limited';
  if (/http_5/.test(msg)) return 'http_5xx';
  return 'unknown';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
