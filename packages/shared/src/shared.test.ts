import { describe, it, expect } from 'vitest';
import { normalizeUrl, isAllowedByPolicy, robotsAllows, ATTACHMENT_ROBOTS_DISALLOWED_EXTS } from './url.js';
import { sha256Hex, safeFileName, extOf } from './hash.js';
import { isIsoDate, milestoneState, parseKoreanDate, seoulDate } from './date.js';
import { EVIDENCE_MAX_BYTES, validateEvidenceFile } from './file.js';

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

describe('비공개 증빙 파일 형식 검증', () => {
  it('PDF 확장자+MIME+magic가 모두 일치해야 승인', () => {
    expect(validateEvidenceFile(Buffer.from('%PDF-1.4\n'), 'proof.pdf', 'application/pdf')).toMatchObject({ ok: true, ext: 'pdf' });
    expect(validateEvidenceFile(Buffer.from('%PDF-1.4\n'), 'proof.png', 'image/png')).toEqual({ ok: false, code: 'MAGIC_MISMATCH' });
  });

  it('빈 파일과 10 MiB 초과를 거부', () => {
    expect(validateEvidenceFile(Buffer.alloc(0), 'x.pdf', 'application/pdf')).toEqual({ ok: false, code: 'EMPTY_FILE' });
    expect(validateEvidenceFile(Buffer.alloc(EVIDENCE_MAX_BYTES + 1), 'x.pdf', 'application/pdf')).toEqual({ ok: false, code: 'TOO_LARGE' });
  });

  it('경로 입력은 표시용 basename으로 정규화', () => {
    const result = validateEvidenceFile(Buffer.from('%PDF-1.4\n'), '../../계약서.pdf', 'application/pdf');
    expect(result).toMatchObject({ ok: true, originalName: '계약서.pdf' });
  });

  it.each([
    ['photo.jpeg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'jpg'],
    ['scan.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png']
  ])('%s의 확장자·MIME·magic을 함께 승인', (name, mime, bytes, ext) => {
    expect(validateEvidenceFile(bytes, name, mime)).toMatchObject({ ok: true, ext });
  });

  it('PNG는 전체 8바이트 signature가 일치해야 승인', () => {
    expect(validateEvidenceFile(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'scan.png', 'image/png'))
      .toEqual({ ok: false, code: 'MAGIC_MISMATCH' });
    expect(validateEvidenceFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00]), 'scan.png', 'image/png'))
      .toEqual({ ok: false, code: 'MAGIC_MISMATCH' });
    expect(validateEvidenceFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'scan.png', 'image/png'))
      .toMatchObject({ ok: true, ext: 'png' });
  });

  it('이중 확장자 실행파일은 거부', () => {
    expect(validateEvidenceFile(Buffer.from('%PDF-1.4\n'), 'proof.pdf.exe', 'application/pdf'))
      .toEqual({ ok: false, code: 'UNSUPPORTED_EXTENSION' });
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
    expect(isIsoDate('2026-02-28extra')).toBe(false);
  });

  it('UTC 경계를 서울 날짜로 변환', () => {
    expect(seoulDate(new Date('2026-08-30T15:30:00.000Z'))).toBe('2026-08-31');
  });

  it('마일스톤을 서울 기준일과 비교한다', () => {
    expect(milestoneState('2026-08-29', '2026-08-30')).toBe('overdue');
    expect(milestoneState('2026-08-30', '2026-08-30')).toBe('today');
    expect(milestoneState('2026-08-31', '2026-08-30')).toBe('upcoming');
  });
});
