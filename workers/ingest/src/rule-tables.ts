import { stableId, type ChunkType, type NormalizedDoc, type RuleDefinition } from '@sen/shared';

/**
 * 계약방법 안내 "표"에서 구조화 규칙 '초안(draft)'을 생성한다.
 *
 * 절대 원칙 준수:
 * - 금액·방법은 원문 인용값이며 상태는 항상 draft → 사람 검토 후 active 승인 필요
 * - 엔진의 between은 [lo, hi) (상한 미포함). 원문의 '이하(포함)'와 경계가 어긋나므로
 *   해당 초안에는 반드시 경계 검토 warning을 붙인다(D-013).
 */

export interface TableDraftResult {
  drafts: RuleDefinition[];
  skippedTables: number;
}

interface ParsedBand {
  lo: number;
  hi: number;
}

export function extractContractMethodDrafts(docs: NormalizedDoc[]): TableDraftResult {
  const drafts: RuleDefinition[] = [];
  let skippedTables = 0;

  for (const doc of docs) {
    for (const block of doc.blocks) {
      if (block.kind !== ('table-row' as ChunkType)) continue;
      const rows = block.tableRows;
      if (!rows || rows.length < 2) continue;

      // 1) 헤더 행에서 계약방법 라벨 찾기(0번 열은 보통 '구분')
      const header = rows[0]!;
      const methodByCol = new Map<number, string>();
      for (let i = 1; i < header.length; i++) {
        const m = classifyMethod(header[i] ?? '');
        if (m) methodByCol.set(i, m);
      }
      if (methodByCol.size === 0) continue;

      // 2) 추정가격 행
      const priceRowIdx = rows.findIndex((r) => (r[0] ?? '').includes('추정가격'));
      if (priceRowIdx < 0) { skippedTables++; continue; }
      const priceRow = rows[priceRowIdx]!;

      // 3) 열별 밴드 파싱 → 초안
      for (const [col, method] of methodByCol) {
        const bandText = (priceRow[col] ?? '').trim();
        if (!bandText) continue;
        const band = parseBand(bandText);
        if (!band) { skippedTables++; continue; }

        const id = `construction.method.band.${stableId(method, bandText, doc.url)}`;
        drafts.push({
          id,
          version: 1,
          status: 'draft',
          scope: {},
          conditions: [
            { field: 'estimated_price', operator: 'between', value: [band.lo, band.hi] }
          ],
          output: {
            method,
            reviewRequired: true,
            warnings: [
              '초안 자동 생성 — 승인 전 반드시 원문과 대조할 것',
              ...boundaryWarnings(bandText)
            ],
            message: `원문 인용: "${bandText}" → ${method} (추정가격 구간)`
          },
          source: {
            title: doc.title,
            url: doc.url,
            publishedAt: doc.publishedAt ?? null,
            effectiveFrom: null,
            checkedAt: new Date().toISOString().slice(0, 10)
          },
          candidate: {
            kindOfValue: 'amount',
            quotedSentence: `${header[col] ?? method} / ${bandText}`,
            contextBefore: '',
            contextAfter: '',
            sourceChunkId: undefined
          },
          reviewedBy: null,
          supersededBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }
  return { drafts, skippedTables };
}

function classifyMethod(text: string): string | null {
  const t = text.replace(/\s+/g, '');
  if (!t) return null;
  if (t.includes('수의계약')) return '수의계약';
  if (t.includes('입찰')) return '입찰';
  return null;
}

/** 금액 문자열 파싱: 2천만원→20_000_000, 1억→100_000_000, 2.3억→230_000_000 */
export function parseAmountKrw(raw: string): number | null {
  const s = raw.replace(/\s+/g, '').replace(/,/g, '');
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)(억|만)?(?:원)?$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = m[2];
  if (unit === '억') return Math.round(num * 100_000_000);
  if (unit === '만') return Math.round(num * 10_000);
  return Math.round(num);
}

/** 밴드 텍스트 → [lo, hi) (hi<=0 이면 상한 없음) */
export function parseBand(text: string): ParsedBand | null {
  const t = text.replace(/\s+/g, '');

  // "A 초과 ~ B 이하/미만"
  const rangeM = t.match(/(.+?)(?:초과|이상)~(.+?)(?:이하|미만)/);
  if (rangeM) {
    const loRaw = t.match(/(.+?)(초과|이상)/);
    const hiRaw = t.match(/~(.+?)(이하|미만)/);
    const lo = loRaw ? parseAmountKrw(loRaw[1]!) : null;
    const hi = hiRaw ? parseAmountKrw(hiRaw[1]!) : null;
    if (lo == null || hi == null) return null;
    return { lo, hi };
  }

  // "A ~ B 이하/미만" (원문이 하한 키워드를 생략한 형태: 예. "1억~2.3억 미만")
  const tildeM = t.match(/(.+?)~(.+?)(?:이하|미만)/);
  if (tildeM) {
    const lo = parseAmountKrw(tildeM[1]!);
    const hi = parseAmountKrw(tildeM[2]!);
    if (lo != null && hi != null) return { lo, hi };
  }

  // "A 미만" → [0, A)
  const underM = t.match(/([0-9][0-9.]*(?:억|만)?원?)미만/);
  if (underM && !t.includes('초과')) {
    const v = parseAmountKrw(underM[1]!);
    if (v != null) return { lo: 0, hi: v };
  }

  // "A 이하" → [0, A] (엔진 상한 미포함 → 경계 warning 대상)
  const leM = t.match(/([0-9][0-9.]*(?:억|만)?원?)이하/);
  if (leM && !t.includes('초과')) {
    const v = parseAmountKrw(leM[1]!);
    if (v != null) return { lo: 0, hi: v };
  }

  // "A 초과" → (A, ∞)
  const overM = t.match(/([0-9][0-9.]*(?:억|만)?원?)초과/);
  if (overM && !t.includes('~')) {
    const v = parseAmountKrw(overM[1]!);
    if (v != null) return { lo: v, hi: 0 };
  }

  // "A 이상" → [A, ∞)
  const geM = t.match(/([0-9][0-9.]*(?:억|만)?원?)이상/);
  if (geM) {
    const v = parseAmountKrw(geM[1]!);
    if (v != null) return { lo: v, hi: 0 };
  }

  return null;
}

/** 엔진 [lo,hi) 의미와 원문 경계 용어의 불일치 가능성 표시 */
function boundaryWarnings(bandText: string): string[] {
  const t = bandText.replace(/\s+/g, '');
  const w: string[] = [];
  if (t.includes('이하')) {
    w.push('원문 경계가 "이하"(포함)임 — 엔진 between은 상한 미포함(<)이므로 상한값을 1원 보정할지 승인 시 결정 필요');
  }
  if (t.includes('초과')) {
    w.push('원문 경계가 "초과"(미포함)임 — 엔진 하한은 포함(>=)이므로 하한값 처리 방식 승인 시 확인 필요');
  }
  return w;
}
