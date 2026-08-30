import { describe, it, expect } from 'vitest';
import { normalizeUrl, isAllowedByPolicy, robotsAllows, ATTACHMENT_ROBOTS_DISALLOWED_EXTS } from './url.js';
import { sha256Hex, safeFileName, extOf } from './hash.js';
import { isIsoDate, parseKoreanDate, seoulDate } from './date.js';

const policy = {
  allowDomains: ['contract.sen.go.kr'],
  allowPathPrefixes: ['/fus/'],
  denyQueryKeys: ['session', 'token'],
  downloadExtensions: ['pdf', 'hwp']
};

describe('URL 정규화', () => {
  it('fragment 제거·세션 쿼리 제거·트레일링 슬래시 정리', () => {
    expect(normalizeUrl('https://x.org/fus/a.do#top')).toBe('https://x.org/fus/a.do');
    expect(normalizeUrl('https://x.org/fus/a.do?session=abc&q=1')).toBe('https://x.org/fus/a.do?q=1');
    expect(normalizeUrl('https://x.org/fus/')).toBe('https://x.org/fus');
  });
  it('같은 리소스는 항상 같은 결과(재수집 중복 방지의 전제)', () => {
    expect(normalizeUrl('https://X.org/fus/a.do')).toBe(normalizeUrl('https://x.org/fus/a.do'));
  });
});

describe('허용 범위 판정', () => {
  it('도메인+prefix 허용', () => {
    expect(isAllowedByPolicy('https://contract.sen.go.kr/fus/x/list0010v.do', policy)).toBe(true);
  });
  it('외부 도메인 거부', () => {
    expect(isAllowedByPolicy('https://law.go.kr/law/1234', policy)).toBe(false);
  });
  it('prefix 밖 거부 / 세션쿼리 포함 거부', () => {
    expect(isAllowedByPolicy('https://contract.sen.go.kr/other/x', policy)).toBe(false);
    expect(isAllowedByPolicy('https://contract.sen.go.kr/fus/x?a=1&token=t', policy)).toBe(false);
  });
});

describe('robots 패턴 매칭', () => {
  const rules = [
    { type: 'allow' as const, pattern: '/' },
    ...ATTACHMENT_ROBOTS_DISALLOWED_EXTS.map((e) => ({ type: 'disallow' as const, pattern: `/*.${e}$` }))
  ];
  it('페이지는 허용', () => {
    expect(robotsAllows('/fus/x/list0010v.do?q=1', rules)).toBe(true);
  });
  it('첨부 확장자는 Disallow', () => {
    expect(robotsAllows('/fus/download.pdf', rules)).toBe(false);
    expect(robotsAllows('/fus/file.hwp?seq=1', rules)).toBe(false);
    expect(robotsAllows('/img/logo.png', rules)).toBe(false);
  });
});

describe('해시/파일명', () => {
  it('SHA-256 결정적', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toHaveLength(64);
  });
  it('경로 분리 문자 제거', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('계약서 초안.hwp')).toBe('계약서_초안.hwp');
  });
  it('확장자 추출', () => {
    expect(extOf('https://x.org/f/a.PDF?dl=1')).toBe('pdf');
    expect(extOf('noext')).toBe('');
  });
});

describe('한국어 날짜 파싱', () => {
  it('다양한 형식 → ISO', () => {
    expect(parseKoreanDate('2024.01.15')).toBe('2024-01-15');
    expect(parseKoreanDate('2024년 1월 5일')).toBe('2024-01-05');
    expect(parseKoreanDate('2024-12-31')).toBe('2024-12-31');
    expect(parseKoreanDate('게시일 없음')).toBeNull();
  });
  it('불가능한 날짜는 null', () => {
    expect(parseKoreanDate('2024.02.30')).toBeNull();
  });
});

describe('엄격한 ISO 날짜와 서울 기준일', () => {
  it('실재하는 YYYY-MM-DD 날짜만 허용', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-28')).toBe(false);
  });

  it('UTC 경계를 서울 날짜로 변환', () => {
    expect(seoulDate(new Date('2026-08-30T15:30:00.000Z'))).toBe('2026-08-31');
  });
});
