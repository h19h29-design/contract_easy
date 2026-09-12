// eslint-disable-next-line no-control-regex -- Reject XML-forbidden controls in supplied text.
const XML_INVALID_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

function assertValidText(text: string): void {
  if (text.includes('\t')) {
    throw new Error('탭 문자는 허용되지 않습니다.');
  }
  if (XML_INVALID_CONTROL.test(text)) {
    throw new Error('XML에서 허용되지 않는 제어 문자가 포함되어 있습니다.');
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error('잘못된 서로게이트 문자가 포함되어 있습니다.');
      }
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('잘못된 서로게이트 문자가 포함되어 있습니다.');
    }
  }
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function parseScheduleRows(text: string): string[][] {
  if (typeof text !== 'string') {
    throw new Error('입력은 문자열이어야 합니다.');
  }
  if (text.length > 3000) {
    throw new Error('입력이 너무 깁니다. 최대 3000 UTF-16 단위까지 허용됩니다.');
  }
  assertValidText(text);

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const rows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;

    const rowNumber = i + 1;
    if (rows.length >= 30) {
      throw new Error('일정은 최대 30행까지 허용됩니다.');
    }

    const cells = line.split('|');
    if (cells.length !== 3) {
      throw new Error(`${rowNumber}번째 행: 활동|시작일|종료일 형식의 3개 셀이어야 합니다.`);
    }

    const activity = cells[0].trim();
    const start = cells[1].trim();
    const end = cells[2].trim();

    if (activity.length === 0) {
      throw new Error(`${rowNumber}번째 행: 활동은 비어 있을 수 없습니다.`);
    }
    if (activity.length > 100) {
      throw new Error(`${rowNumber}번째 행: 활동은 100 UTF-16 단위 이하여야 합니다.`);
    }
    if (!isRealDate(start)) {
      throw new Error(`${rowNumber}번째 행: 시작일이 올바른 그레고리력 날짜가 아닙니다.`);
    }
    if (!isRealDate(end)) {
      throw new Error(`${rowNumber}번째 행: 종료일이 올바른 그레고리력 날짜가 아닙니다.`);
    }
    if (start > end) {
      throw new Error(`${rowNumber}번째 행: 시작일은 종료일보다 늦을 수 없습니다.`);
    }

    rows.push([activity, start, end]);
  }

  return rows;
}

export function parseFormSelection(value: unknown, allowed: readonly string[]): string[] | null {
  if (typeof value !== 'string' || value.length === 0) return null;

  const tokens = value.split(',');
  if (tokens.length > allowed.length) return null;

  const allowSet = new Set(allowed);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    if (token.length === 0) return null;
    if (seen.has(token)) return null;
    if (!allowSet.has(token)) return null;
    seen.add(token);
    result.push(token);
  }

  return result;
}
