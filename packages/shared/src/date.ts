/** 한국어/행정 날짜 문자열 파싱 → ISO yyyy-mm-dd (실패 시 null) */
export function parseKoreanDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  // 2024.01.15 / 2024-01-15 / 2024/01/15
  let m = s.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  // 2024년 1월 15일
  m = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  // 20240115
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  return null;
}

function toIso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 엄격한 ISO yyyy-mm-dd 날짜인지 확인한다. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

/** 주어진 시각의 한국 표준시 날짜를 yyyy-mm-dd 형식으로 반환한다. */
export function seoulDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** ISO 날짜 문자열을 기준일과 비교한 마일스톤 표시 상태. */
export function milestoneState(dueDate: string, today: string): 'upcoming' | 'today' | 'overdue' {
  return dueDate < today ? 'overdue' : dueDate === today ? 'today' : 'upcoming';
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
