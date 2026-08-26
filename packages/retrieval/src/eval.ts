import fs from 'node:fs';
import path from 'node:path';
import { HybridRetriever } from '@sen/retrieval';
import type { Chunk } from '@sen/shared';

/**
 * 리트리벌 평가 실행기(파일스토어 산출물 chunks.json 기준).
 * - corpus 질문: 상위 k개 청크에서 expectAnyOf 키워드 등장 시 정답(hit)
 * - outOfCorpus 질문: 강한 근거 없음 → 거부 경로가 맞으면 정답
 * 결과를 docs/harness/EVAL_RETRIEVAL.md 로 기록한다.
 */

interface EvalQuestion {
  q: string;
  expectAnyOf?: string[];
}
interface EvalSet {
  meta: { description: string; note: string };
  corpus: EvalQuestion[];
  outOfCorpus: EvalQuestion[];
}

export interface EvalSummary {
  totalCorpus: number;
  hitAt1: number;
  hitAt3: number;
  refusalTotal: number;
  refusalCorrect: number;
  misses: Array<{ q: string; expectAnyOf: string[] }>;
  refusalMisses: string[];
}

export function runEvaluation(chunks: Chunk[], evalSet: EvalSet): EvalSummary {
  const retriever = new HybridRetriever({ chunks, versions: [] });
  const summary: EvalSummary = {
    totalCorpus: evalSet.corpus.length,
    hitAt1: 0,
    hitAt3: 0,
    refusalTotal: evalSet.outOfCorpus.length,
    refusalCorrect: 0,
    misses: [],
    refusalMisses: []
  };

  const contains = (haystack: string, needles: string[]) =>
    needles.some((n) => haystack.includes(n));

  for (const item of evalSet.corpus) {
    const hits = retriever.search(item.q, 3);
    const texts = hits.map(
      (h) => `${h.chunk.docTitle} ${h.chunk.text} ${h.chunk.url}`
    );
    const hit3 = contains(texts.join('\n'), item.expectAnyOf ?? []);
    const hit1 = hits.length > 0 && contains(`${hits[0]!.chunk.docTitle} ${hits[0]!.chunk.text}`, item.expectAnyOf ?? []);
    if (hit3) summary.hitAt3++;
    if (hit1) summary.hitAt1++;
    if (!hit3) summary.misses.push({ q: item.q, expectAnyOf: item.expectAnyOf ?? [] });
  }

  for (const item of evalSet.outOfCorpus) {
    const hits = retriever.search(item.q, 5).filter((h) => h.score > 0);
    // 비코퍼스 질문은 상위 히트 자체가 없거나 매우 약해야 정상
    const topScore = hits[0]?.score ?? 0;
    const looksRelevant = hits.some((h) => {
      // 임의 기준: 스코어 상위 + 본문에 질문 핵심어(2gram 일부) 우연 일치 수준 이상
      return topScore > 6 && h.chunk.text.includes(item.q.slice(0, 4));
    });
    if (!looksRelevant) summary.refusalCorrect++;
    else summary.refusalMisses.push(item.q);
  }

  return summary;
}

export function formatReport(summary: EvalSummary): string {
  const lines: string[] = [];
  lines.push('# EVAL_RETRIEVAL.md — 리트리벌 평가 실측');
  lines.push('');
  lines.push(`- 생성시각: ${new Date().toISOString()}`);
  lines.push(`- 코퍼스 질문: ${summary.totalCorpus}건`);
  lines.push(`- hit@1: **${summary.hitAt1}/${summary.totalCorpus}** (${pct(summary.hitAt1, summary.totalCorpus)}%)`);
  lines.push(`- hit@3: **${summary.hitAt3}/${summary.totalCorpus}** (${pct(summary.hitAt3, summary.totalCorpus)}%)`);
  lines.push(`- 비코퍼스 거부 판정: **${summary.refusalCorrect}/${summary.refusalTotal}**`);
  if (summary.misses.length > 0) {
    lines.push('');
    lines.push('## 미적중 질문(hit@3 실패)');
    for (const m of summary.misses) {
      lines.push(`- ${m.q} (기대 키워드: ${m.expectAnyOf.join(', ')})`);
    }
  }
  if (summary.refusalMisses.length > 0) {
    lines.push('');
    lines.push('## 거부 판정 실패(코퍼스 밖인데 관련있다고 오판)');
    for (const q of summary.refusalMisses) lines.push(`- ${q}`);
  }
  return lines.join('\n') + '\n';
}

function pct(n: number, d: number): string {
  if (d === 0) return '0';
  return ((n / d) * 100).toFixed(1);
}

/* CLI */
async function main(): Promise<void> {
  const chunksFile = path.resolve('data/app-store/chunks.json');
  const evalFile = path.resolve('tests/fixtures/retrieval-eval.json');
  if (!fs.existsSync(chunksFile)) {
    console.error('chunks.json이 없습니다. 먼저 `pnpm ingest:all`을 실행하세요.');
    process.exit(1);
  }
  const chunks = JSON.parse(fs.readFileSync(chunksFile, 'utf8')) as Chunk[];
  const evalSet = JSON.parse(fs.readFileSync(evalFile, 'utf8')) as EvalSet;
  const summary = runEvaluation(chunks, evalSet);
  const report = formatReport(summary);
  const outDir = path.resolve('docs', 'harness');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'EVAL_RETRIEVAL.md'), report, 'utf8');
  console.log(report);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
