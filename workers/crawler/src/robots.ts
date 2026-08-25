import type { RobotsRule } from '@sen/shared';
import { PoliteHttpClient } from './http.js';

export interface RobotsInfo {
  fetched: boolean;
  status: number | null;
  rules: RobotsRule[];
  raw: string | null;
}

export async function fetchRobots(origin: string, client: PoliteHttpClient): Promise<RobotsInfo> {
  try {
    const res = await client.get(`${origin}/robots.txt`);
    const text = res.body.toString('utf8');
    return { fetched: true, status: res.status, rules: parseRobots(text), raw: text };
  } catch {
    return { fetched: false, status: null, rules: [], raw: null };
  }
}

/** User-agent: * 블록의 Allow/Disallow 규칙만 추출 */
export function parseRobots(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let inStar = false;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.split('#')[0]!.trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      inStar = value === '*';
      continue;
    }
    if (!inStar || !value) continue;
    rules.push({ type: key as 'allow' | 'disallow', pattern: value });
  }
  return rules;
}
