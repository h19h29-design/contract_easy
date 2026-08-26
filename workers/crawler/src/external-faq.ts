import fs from 'node:fs';
import {
  extractFromHtml, isoNow, normalizeUrl,
  type PageSnapshot
} from '@sen/shared';
import { ensureDirs, loadSeeds } from '@sen/config';
import { FileStore } from '@sen/db';
import { PoliteHttpClient } from './http.js';
import { saveContentAddressed } from './crawl.js';

/**
 * 외부 FAQ BBS(buseo.sen.go.kr) 수집기.
 * - robots.txt 2026-08-26 재확인: 대상 경로 허용(첨부 확장자는 동일하게 Disallow → 메타만)
 * - allowlist는 02_CRAWL_SEEDS.yaml follow_rules에 명시(D-013, 운영자 지시)
 * - 목록: BD_selectBbsList.do (GET, q_currPage pagination)
 * - 상세: BD_selectBbs.do?q_bbsSn=&q_bbsDocNo=
 */

const LIST_HREF_RE = /href="((?:https?:\/\/buseo\.sen\.go\.kr)?\/?buseo\/bu20\/user\/bbs\/BD_selectBbsList\.do[^"]*)"/g;
const DETAIL_HREF_RE = /href="((?:https?:\/\/buseo\.sen\.go\.kr)?\/?(?:buseo\/bu20\/user\/bbs\/)?BD_selectBbs\.do[^"]*)"/g;

export interface ExternalFaqSummary {
  boards: Array<{ seedName: string; listUrl: string | null; articles: number; pages: number; stopReason?: string }>;
  fetched: number;
  failures: Array<{ url: string; message: string }>;
}

function decodeAmp(u: string): string {
  return u.replace(/&amp;/g, '&');
}

/** FAQ 시드 저장본에서 buseo 목록 URL 추출 */
export function discoverBoardUrls(store: FileStore): Map<string, string> {
  const out = new Map<string, string>();
  for (const src of store.listSources()) {
    const seed = src.seedName ?? '';
    if (!/^FAQ/i.test(seed)) continue;
    const latest = src.versions[src.versions.length - 1];
    if (!latest?.rawHtmlPath || !fsExists(latest.rawHtmlPath)) continue;
    const html = fsRead(latest.rawHtmlPath);
    const m = [...html.matchAll(LIST_HREF_RE)][0];
    if (m) {
      const raw = decodeAmp(m[1]!);
      const abs = normalizeUrl(
        raw.startsWith('http') ? raw : new URL(raw, 'https://buseo.sen.go.kr').toString()
      );
      if (!out.has(seed)) out.set(seed, abs);
    }
  }
  return out;
}

export async function crawlExternalFaq(): Promise<ExternalFaqSummary> {
  const dirs = ensureDirs();
  const store = new FileStore(dirs.appStore);
  const client = new PoliteHttpClient();
  const summary: ExternalFaqSummary = { boards: [], fetched: 0, failures: [] };

  // 정책 확인: allowlist에 buseo가 있어야 실행(명시적 승인 장치)
  const seeds = loadSeeds();
  const domains = seeds.follow_rules.allow_domains;
  const prefixes = seeds.follow_rules.allow_path_prefixes;
  const allowed =
    domains.includes('buseo.sen.go.kr') && prefixes.some((p) => p.startsWith('/buseo'));
  if (!allowed) {
    console.error('[faq-bbs] BLOCKED: 02_CRAWL_SEEDS.yaml에 buseo.sen.go.kr allowlist가 없습니다(D-013 참조).');
    return summary;
  }

  const seedBoards = discoverBoardUrls(store);

  // 게시판 큐: {sn, label, url}. 같은 sn 중복 제목(시드 4개가 동일 게시판을 가리킴) 방지.
  interface BoardTask { sn: string; label: string; url: string; listUrl: string; discovered: boolean }
  const processedSn = new Set<string>();
  const boardQueue: BoardTask[] = [];
  for (const [seedName, listUrl] of seedBoards) {
    const sn = listUrl.match(/q_bbsSn=(\d+)/)?.[1] ?? 'unknown';
    if (processedSn.has(sn)) continue;
    processedSn.add(sn);
    boardQueue.push({ sn, label: seedName, url: listUrl, listUrl, discovered: false });
  }

  for (let bi = 0; bi < boardQueue.length; bi++) {
    const task = boardQueue[bi]!;
    const { sn, label, listUrl } = task;
    try {
      const seenDocNos = new Set<string>();
      const fetchedPages = new Set<string>();
      const seenSigs = new Set<string>();
      const pageQueue: string[] = ['1'];
      let articles = 0;
      let stopReason = 'no_next_page';
      let effectiveLabel = label;
      let lastKnownPage = 1;

      while (pageQueue.length > 0) {
        const pageNum = pageQueue.shift()!;
        if (fetchedPages.has(pageNum)) continue;
        const pageUrl = setPage(listUrl, pageNum);
        const res = await client.get(pageUrl);
        fetchedPages.add(pageNum);
        if (res.status !== 200) { stopReason = `http_${res.status}`; break; }
        summary.fetched++;
        const html = res.body.toString('utf8');

        // 게시판 실명으로 카테고리 라벨 보정(최초 1회)
        if (!task.discovered) {
          task.discovered = true;
          effectiveLabel = guessBoardLabel(html, sn, label);
        }

        const bodyText = extractFromHtml(html, pageUrl).bodyText;
        const sigKey = shaLike(bodyText.slice(0, 800));
        if (seenSigs.has(sigKey)) { stopReason = 'content_repeat'; break; }
        seenSigs.add(sigKey);

        // 상세 링크 수집
        const detailHrefs = [...html.matchAll(DETAIL_HREF_RE)].map((m) => {
          const raw = decodeAmp(m[1]!);
          return raw.startsWith('http') ? raw : new URL(raw, pageUrl).toString();
        });
        for (const abs of detailHrefs) {
          const docNo = abs.match(/q_bbsDocNo=(\d+)/)?.[1];
          if (!docNo || seenDocNos.has(docNo)) continue;
          seenDocNos.add(docNo);
          articles++;
          await fetchDetailAndStore(client, store, dirs, effectiveLabel, abs, docNo);
        }

        // 형제 게시판 확장은 기본 비활성(무관 게시판 오판 방지).
        // 필요 시 CRAWL_EXPAND_SIBLING_BOARDS=true 로 명시 활성화.
        if (process.env.CRAWL_EXPAND_SIBLING_BOARDS === 'true') {
          for (const m of html.matchAll(/BD_selectBbsList\.do\?[^"']*?q_bbsSn=(\d+)/g)) {
            const sibling = m[1]!;
            if (!processedSn.has(sibling)) {
              processedSn.add(sibling);
              const sibUrl = `https://buseo.sen.go.kr/buseo/bu20/user/bbs/BD_selectBbsList.do?q_rowPerPage=10&q_currPage=1&q_sortName=&q_sortOrder=&q_searchKeyTy2=&q_searchStartDt=&q_searchEndDt=&q_bbsSn=${sibling}&q_bbsDocNo=&q_searchKeyTy=&q_searchVal=`;
              boardQueue.push({ sn: sibling, label: `FAQ-auto-${sibling}`, url: sibUrl, listUrl: sibUrl, discovered: false });
            }
          }
        }

        // 총 페이지 수 산정(헤더의 "페이지 (n/총)" 또는 "전체 N") → 이후 페이지 직접 순회
        const fracM = bodyText.match(/\(\s*\d+\s*\/\s*(\d+)\s*\)/);
        if (fracM) lastKnownPage = Math.max(lastKnownPage, Number(fracM[1]));
        const totalM = bodyText.match(/전체\s*([\d,]+)/);
        if (totalM) {
          const totalArticles = Number(totalM[1]!.replace(/,/g, ''));
          lastKnownPage = Math.max(lastKnownPage, Math.ceil(totalArticles / 10));
        }
        for (let p = 2; p <= Math.min(lastKnownPage, 50); p++) {
          if (!fetchedPages.has(String(p)) && !pageQueue.includes(String(p))) pageQueue.push(String(p));
        }
        if (detailHrefs.length === 0 && pageQueue.length === 0) { stopReason = 'empty_list'; break; }
      }

      summary.boards.push({ seedName: effectiveLabel, listUrl, articles, pages: fetchedPages.size, stopReason });
    } catch (err) {
      summary.failures.push({ url: listUrl, message: String((err as Error).message) });
    }
  }
  return summary;
}

/** 게시판 페이지에서 실제 게시판명을 찾아 FAQ 라벨 보정(공사/용역/물품/기타→계약일반) */
function guessBoardLabel(html: string, sn: string, fallback: string): string {
  const titleM = html.match(/<title>([^<]*)<\/title>/i);
  const crumbM = html.match(/부서업무방\s*>\s*([^<]+?)\s*>\s*([^<]{2,30})</);
  const hay = `${titleM?.[1] ?? ''} ${crumbM?.[1] ?? ''} ${crumbM?.[2] ?? ''}`;
  if (/공사/.test(hay)) return 'FAQ-공사';
  if (/용역/.test(hay)) return 'FAQ-용역';
  if (/물품/.test(hay)) return 'FAQ-물품';
  if (/계약일반|일반/.test(hay)) return 'FAQ-계약일반';
  void sn;
  return fallback;
}

async function fetchDetailAndStore(
  client: PoliteHttpClient,
  store: FileStore,
  dirs: ReturnType<typeof ensureDirs>,
  seedName: string,
  absUrl: string,
  docNo: string
): Promise<void> {
  const res = await client.get(absUrl);
  if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status}`), { category: `http_${res.status}` });
  const html = res.body.toString('utf8');
  const sha = shaLike(html);
  const extracted = extractFromHtml(html, absUrl);

  const snapshot: PageSnapshot = {
    url: normalizeUrl(absUrl),
    finalUrl: normalizeUrl(absUrl),
    status: res.status,
    title: firstNonEmpty(extracted.title, `FAQ 문서 ${docNo}`),
    htmlLength: html.length,
    bodyTextLength: extracted.bodyText.length,
    links: extracted.links,
    attachments: extracted.attachments,
    fetchedAt: isoNow(),
    sha256: sha,
    headers: {}
  };
  const raw = saveContentAddressed(dirs.rawHtml, snapshot.finalUrl, html);
  const upsert = store.upsertSourcePage({
    url: snapshot.finalUrl,
    seedName,
    kind: 'external-faq-detail',
    title: snapshot.title,
    contentSha256: sha,
    rawHtmlPath: raw,
    collectedAt: snapshot.fetchedAt,
    menuPath: [seedName]
  });
  void upsert;
  store.markSourceAttachments(upsert.sourceId, snapshot.attachments);
}

function setPage(listUrl: string, n: string): string {
  if (/q_currPage=\d+/.test(listUrl)) return listUrl.replace(/q_currPage=\d+/, `q_currPage=${n}`);
  return listUrl + (listUrl.includes('?') ? '&' : '?') + `q_currPage=${n}`;
}

function firstNonEmpty(...vals: string[]): string {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return '';
}

function fsExists(p: string): boolean {
  return fs.existsSync(p);
}
function fsRead(p: string): string {
  return fs.readFileSync(p, 'utf8');
}
function shaLike(s: string): string {
  // 빠른 중복 비교용 해시(FNV-1a 변형) — SHA-256은 store에서 별도 계산
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0') +
         (h2 >>> 0).toString(16).padStart(8, '0');
}
