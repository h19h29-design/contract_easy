import fs from 'node:fs';
import path from 'node:path';
import {
  type RuleDefinition, type Chunk, todayIso
} from '@sen/shared';

/**
 * 규칙 후보 추출(초안 draft 전용).
 * 금액·비율·기간·서류 문장을 후보로 기록할 뿐, 절대 active로 만들지 않는다.
 * 숫자 자체는 "원문 인용"으로만 저장하고 판단값은 output에 넣지 않는다.
 */

const AMOUNT_RE = /([0-9][0-9,]*)\s*(억\s*원|만\s*원|원)/;
const RATIO_RE = /([0-9.]+)\s*%/;
const DAYS_RE = /([0-9]+)\s*(일|일 이상|일 이내|일간)/;
const DOCS_RE = /(제출|필요|첨부).{0,20}(서류|증빙|확인서|계약서)/;

export interface RuleCandidateDraft {
  candidateId: string;
  kindOfValue: 'amount' | 'ratio' | 'duration' | 'document';
  quotedSentence: string;
  contextBefore: string;
  contextAfter: string;
  sourceChunkId: string;
  sourceUrl: string;
  sourceTitle: string;
}

export function extractRuleCandidates(chunks: Chunk[]): RuleCandidateDraft[] {
  const out: RuleCandidateDraft[] = [];
  for (const c of chunks) {
    if (c.text.length < 10) continue;
    const sentences = splitSentences(c.text);
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i]!;
      let kind: RuleCandidateDraft['kindOfValue'] | null = null;
      if (AMOUNT_RE.test(s)) kind = 'amount';
      else if (RATIO_RE.test(s)) kind = 'ratio';
      else if (DAYS_RE.test(s)) kind = 'duration';
      else if (DOCS_RE.test(s)) kind = 'document';
      if (!kind) continue;
      out.push({
        candidateId: `cand-${c.id}-${i}`,
        kindOfValue: kind,
        quotedSentence: s.slice(0, 300),
        contextBefore: (sentences[i - 1] ?? '').slice(-120),
        contextAfter: (sentences[i + 1] ?? '').slice(0, 120),
        sourceChunkId: c.id,
        sourceUrl: c.url,
        sourceTitle: c.docTitle
      });
    }
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((t) => t.split(/(?<=다)\.\s*/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 후보 → draft 규칙 정의(판단값 없음). 관리자 승인 화면에서 원문과 나란히 검토된다. */
export function candidatesToDraftRules(cands: RuleCandidateDraft[]): RuleDefinition[] {
  return cands.map((c) => ({
    id: `candidate.${c.kindOfValue}.${c.candidateId}`,
    version: 1,
    status: 'draft' as const,
    scope: {},
    conditions: [],
    output: {
      reviewRequired: true,
      message: `후보(${c.kindOfValue}): "${c.quotedSentence.slice(0, 80)}" — 원문 확인 후 승인 필요`
    },
    source: {
      title: c.sourceTitle,
      url: c.sourceUrl,
      publishedAt: null,
      effectiveFrom: null,
      checkedAt: todayIso()
    },
    reviewedBy: null,
    supersededBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

export function saveCandidates(dir: string, cands: RuleCandidateDraft[]): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${todayIso()}.json`);
  fs.writeFileSync(file, JSON.stringify(cands, null, 2), 'utf8');
  return file;
}
