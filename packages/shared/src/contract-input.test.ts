import { describe, expect, it } from 'vitest';
import { parseFormSelection, parseScheduleRows } from './contract-input.js';

const span = (start: string, end: string) => `행사 | ${start} | ${end}`;

function scheduleOfExactLength(total: number): string {
  const activities = Array.from({ length: 30 }, () => 'a');
  let remaining = total - (30 * 27 + 29);
  for (let i = 0; i < 30 && remaining > 0; i++) {
    const add = Math.min(99, remaining);
    activities[i] = 'a' + 'x'.repeat(add);
    remaining -= add;
  }
  return activities.map((activity) => `${activity} | 2024-01-01 | 2024-01-02`).join('\n');
}

describe('parseScheduleRows', () => {
  it('returns [] for blank and whitespace-only input', () => {
    expect(parseScheduleRows('')).toEqual([]);
    expect(parseScheduleRows('   ')).toEqual([]);
    expect(parseScheduleRows('\n\n')).toEqual([]);
    expect(parseScheduleRows('\r\n \r\n')).toEqual([]);
  });

  it('parses a valid single row and trims cells', () => {
    expect(parseScheduleRows('  회의  |  2024-02-29  |  2024-03-01 ')).toEqual([
      ['회의', '2024-02-29', '2024-03-01'],
    ]);
  });

  it('normalizes CRLF and CR line endings', () => {
    const crlf = 'A | 2024-01-01 | 2024-01-02\r\nB | 2024-01-03 | 2024-01-04';
    const cr = 'A | 2024-01-01 | 2024-01-02\rB | 2024-01-03 | 2024-01-04';
    expect(parseScheduleRows(crlf)).toHaveLength(2);
    expect(parseScheduleRows(cr)).toHaveLength(2);
  });

  it('skips blank lines between rows', () => {
    const text = 'A | 2024-01-01 | 2024-01-02\n\n   \nB | 2024-01-03 | 2024-01-04';
    expect(parseScheduleRows(text)).toEqual([
      ['A', '2024-01-01', '2024-01-02'],
      ['B', '2024-01-03', '2024-01-04'],
    ]);
  });

  it('accepts valid leap days', () => {
    expect(parseScheduleRows(span('2024-02-29', '2024-03-01'))).toEqual([
      ['행사', '2024-02-29', '2024-03-01'],
    ]);
    expect(parseScheduleRows(span('2000-02-29', '2000-02-29'))).toEqual([
      ['행사', '2000-02-29', '2000-02-29'],
    ]);
  });

  it('rejects invalid leap days', () => {
    expect(() => parseScheduleRows(span('2023-02-29', '2023-03-01'))).toThrow();
    expect(() => parseScheduleRows(span('1900-02-29', '1900-03-01'))).toThrow();
  });

  it('rejects impossible days, months, years and malformed dates', () => {
    expect(() => parseScheduleRows(span('2024-04-31', '2024-05-01'))).toThrow();
    expect(() => parseScheduleRows(span('2024-13-01', '2024-13-02'))).toThrow();
    expect(() => parseScheduleRows(span('2024-00-10', '2024-01-10'))).toThrow();
    expect(() => parseScheduleRows(span('2024-01-00', '2024-01-01'))).toThrow();
    expect(() => parseScheduleRows(span('2024-1-01', '2024-01-02'))).toThrow();
    expect(() => parseScheduleRows(span('24-01-01', '2024-01-02'))).toThrow();
    expect(() => parseScheduleRows(span('0000-01-01', '0001-01-01'))).toThrow();
  });

  it('accepts extreme but real dates', () => {
    expect(parseScheduleRows(span('0001-01-01', '0001-01-01'))).toEqual([
      ['행사', '0001-01-01', '0001-01-01'],
    ]);
    expect(parseScheduleRows(span('9999-12-31', '9999-12-31'))).toEqual([
      ['행사', '9999-12-31', '9999-12-31'],
    ]);
  });

  it('rejects reversed spans and accepts equal spans', () => {
    expect(() => parseScheduleRows(span('2024-03-02', '2024-03-01'))).toThrow();
    expect(() => parseScheduleRows(span('2024-12-31', '2023-01-01'))).toThrow();
    expect(parseScheduleRows(span('2024-03-01', '2024-03-01'))).toHaveLength(1);
  });

  it('allows exactly 30 rows and rejects 31', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `r${i} | 2024-01-01 | 2024-01-02`).join('\n');
    const thirtyOne = Array.from({ length: 31 }, (_, i) => `r${i} | 2024-01-01 | 2024-01-02`).join('\n');
    expect(parseScheduleRows(thirty)).toHaveLength(30);
    expect(() => parseScheduleRows(thirtyOne)).toThrow();
  });

  it('allows exactly 3000 UTF-16 units and rejects 3001', () => {
    const exact = scheduleOfExactLength(3000);
    expect(exact.length).toBe(3000);
    expect(parseScheduleRows(exact)).toHaveLength(30);
    expect(() => parseScheduleRows(scheduleOfExactLength(3001))).toThrow();
  });

  it('rejects tabs and XML-invalid control characters anywhere', () => {
    expect(() => parseScheduleRows('a\tb | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows('a\u0000 | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows('a\u0008 | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows('a\u000B | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows('a\u001F | 2024-01-01 | 2024-01-02')).toThrow();
  });

  it('rejects lone surrogates but allows valid surrogate pairs', () => {
    expect(() => parseScheduleRows('a\uD800 | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows('a\uDC00 | 2024-01-01 | 2024-01-02')).toThrow();
    expect(parseScheduleRows('📅 | 2024-01-01 | 2024-01-02')).toEqual([
      ['📅', '2024-01-01', '2024-01-02'],
    ]);
  });

  it('permits Unicode and XML metacharacters as plain text', () => {
    const activity = '회의 & <검토> "초안" \'최종\' 🚀';
    expect(parseScheduleRows(`${activity} | 2024-01-01 | 2024-01-02`)).toEqual([
      [activity, '2024-01-01', '2024-01-02'],
    ]);
  });

  it('rejects wrong cell counts and pipes inside activity', () => {
    expect(() => parseScheduleRows('a | 2024-01-01')).toThrow();
    expect(() => parseScheduleRows('a | 2024-01-01 | 2024-01-02 | x')).toThrow();
    expect(() => parseScheduleRows('a|b | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows('a | 2024-01-01 | 2024-01-02 |')).toThrow();
  });

  it('rejects empty and oversized activities', () => {
    expect(() => parseScheduleRows('   | 2024-01-01 | 2024-01-02')).toThrow();
    expect(() => parseScheduleRows(`${'x'.repeat(101)} | 2024-01-01 | 2024-01-02`)).toThrow();
    expect(parseScheduleRows(`${'x'.repeat(100)} | 2024-01-01 | 2024-01-02`)).toHaveLength(1);
  });

  it('allows duplicate activities', () => {
    const text = '같음 | 2024-01-01 | 2024-01-02\n같음 | 2024-01-03 | 2024-01-04';
    expect(parseScheduleRows(text)).toEqual([
      ['같음', '2024-01-01', '2024-01-02'],
      ['같음', '2024-01-03', '2024-01-04'],
    ]);
  });
});

describe('parseFormSelection', () => {
  const allowed = ['a', 'b', 'payment'] as const;

  it('accepts single and multiple allowlisted IDs in requested order', () => {
    expect(parseFormSelection('a', allowed)).toEqual(['a']);
    expect(parseFormSelection('a,b,payment', allowed)).toEqual(['a', 'b', 'payment']);
    expect(parseFormSelection('payment,a', allowed)).toEqual(['payment', 'a']);
    expect(parseFormSelection('b,payment', allowed)).toEqual(['b', 'payment']);
  });

  it('rejects missing and empty tokens', () => {
    expect(parseFormSelection('', allowed)).toBeNull();
    expect(parseFormSelection(',', allowed)).toBeNull();
    expect(parseFormSelection('a,', allowed)).toBeNull();
    expect(parseFormSelection(',a', allowed)).toBeNull();
    expect(parseFormSelection('a,,b', allowed)).toBeNull();
    expect(parseFormSelection(',,', allowed)).toBeNull();
  });

  it('rejects whitespace without normalization', () => {
    expect(parseFormSelection(' a', allowed)).toBeNull();
    expect(parseFormSelection('a ', allowed)).toBeNull();
    expect(parseFormSelection('a, b', allowed)).toBeNull();
    expect(parseFormSelection('payment ,a', allowed)).toBeNull();
  });

  it('rejects duplicate and unknown IDs and case mismatches', () => {
    expect(parseFormSelection('a,a', allowed)).toBeNull();
    expect(parseFormSelection('a,b,b', allowed)).toBeNull();
    expect(parseFormSelection('c', allowed)).toBeNull();
    expect(parseFormSelection('A', allowed)).toBeNull();
  });

  it('rejects selections longer than the allowed list', () => {
    expect(parseFormSelection('a,b,payment,a', allowed)).toBeNull();
    expect(parseFormSelection('a,b,payment,payment', allowed)).toBeNull();
  });

  it('does not use object prototype membership', () => {
    expect(parseFormSelection('toString', allowed)).toBeNull();
    expect(parseFormSelection('constructor', allowed)).toBeNull();
    expect(parseFormSelection('hasOwnProperty', allowed)).toBeNull();
    expect(parseFormSelection('__proto__', allowed)).toBeNull();
  });

  it('rejects non-string and non-primitive values', () => {
    expect(parseFormSelection(null, allowed)).toBeNull();
    expect(parseFormSelection(undefined, allowed)).toBeNull();
    expect(parseFormSelection(['a'], allowed)).toBeNull();
    expect(parseFormSelection(['a', 'b'], allowed)).toBeNull();
    expect(parseFormSelection({ a: 'a' }, allowed)).toBeNull();
    expect(parseFormSelection(JSON.parse('{"__proto__":"a"}'), allowed)).toBeNull();
    expect(parseFormSelection(123, allowed)).toBeNull();
    expect(parseFormSelection(0, allowed)).toBeNull();
    expect(parseFormSelection(true, allowed)).toBeNull();
    expect(parseFormSelection(new String('a'), allowed)).toBeNull();
  });

  it('does not mutate the allowed list', () => {
    const list = ['a', 'b', 'payment'];
    expect(parseFormSelection('a,payment', list)).toEqual(['a', 'payment']);
    expect(list).toEqual(['a', 'b', 'payment']);
  });
});
