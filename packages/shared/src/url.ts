export interface UrlPolicy {
  allowDomains: string[];
  allowPathPrefixes: string[];
  denyQueryKeys: string[];
  downloadExtensions: string[];
}

/** URL 정규화: fragment 제거, 트레일링 슬래시 통일, 세션성 쿼리 제거 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      const k = key.toLowerCase();
      if (k === 'session' || k === 'token' || k === 'sid' || k === 'jsessionid') {
        u.searchParams.delete(key);
      }
    }
    let s = u.toString();
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

export function isInternal(url: string, baseDomain: string): boolean {
  try {
    return new URL(url).hostname === baseDomain;
  } catch {
    return false;
  }
}

export function isAllowedByPolicy(url: string, policy: UrlPolicy): boolean {
  try {
    const u = new URL(url);
    if (!policy.allowDomains.includes(u.hostname)) return false;
    if (!policy.allowPathPrefixes.some((p) => u.pathname.startsWith(p))) return false;
    for (const denied of policy.denyQueryKeys) {
      if (u.searchParams.has(denied)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** robots.txt 규칙 평가 (우리가 파싱한 단순 규칙 목록 기반) */
export interface RobotsRule {
  type: 'allow' | 'disallow';
  pattern: string; // prefix or glob-ish (예: /*.pdf$)
}

export function robotsAllows(pathnameWithQuery: string, rules: RobotsRule[]): boolean {
  // 파일형 Disallow(`/*.pdf$`)가 쿼리 문자열 때문에 빗나가지 않도록
  // 쿼리를 제외한 경로 기준으로도 일치를 검사한다.
  const candidates = [pathnameWithQuery, pathnameWithQuery.split('?')[0]!];
  let best: RobotsRule | null = null;
  for (const r of rules) {
    for (const cand of candidates) {
      if (matchesRobotsPattern(r.pattern, cand)) {
        if (!best || r.pattern.length > best.pattern.length) best = r;
      }
    }
  }
  if (!best) return true;
  return best.type === 'allow';
}

function matchesRobotsPattern(pattern: string, path: string): boolean {
  // 지원: 일반 prefix, $ 끝표시, * 와일드카드
  if (!pattern.includes('*')) {
    if (pattern.endsWith('$')) {
      return path.endsWith(pattern.slice(0, -1));
    }
    return path.startsWith(pattern);
  }
  const anchoredEnd = pattern.endsWith('$');
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '') continue;
    const idx = path.indexOf(part, pos);
    if (i === 0 && !body.startsWith('*') && idx !== 0) return false;
    if (idx < 0) return false;
    pos = idx + part.length;
  }
  if (anchoredEnd) return pos === path.length;
  return true;
}

export const ATTACHMENT_ROBOTS_DISALLOWED_EXTS = [
  'gif', 'png', 'jpg', 'jpeg', 'bmp', 'log', 'xls', 'jsp',
  'hwp', 'pdf', 'ppt', 'doc', 'zip', 'js'
];
