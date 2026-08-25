import * as cheerio from 'cheerio';
import { normalizeUrl } from './url.js';
import type { LinkRef, AttachmentRef } from './types.js';

export interface ExtractedHtml {
  title: string;
  bodyText: string;
  links: LinkRef[];
  attachments: AttachmentRef[];
  headings: Array<{ level: number; text: string; id: string | null }>;
}

const DOWNLOAD_EXT = new Set([
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'png', 'jpg', 'jpeg'
]);
const ROBOTS_DISALLOWED = new Set([
  'gif', 'png', 'jpg', 'jpeg', 'bmp', 'log', 'xls', 'jsp', 'hwp', 'pdf', 'ppt', 'doc', 'zip', 'js'
]);

export function extractFromHtml(html: string, baseUrl: string): ExtractedHtml {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim();
  $('script, style, noscript').remove();

  const baseDomain = new URL(baseUrl).hostname;

  const links: LinkRef[] = [];
  const attachments: AttachmentRef[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    const text = ($(el).text() || '').trim().replace(/\s+/g, ' ');
    if (!href) return;
    let abs: string;
    try {
      abs = normalizeUrl(new URL(href, baseUrl).toString());
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    let internal = false;
    try {
      internal = new URL(abs).hostname === baseDomain;
    } catch { /* noop */ }
    links.push({ url: abs, text, internal });

    const ext = extOfUrl(abs);
    const isDownload =
      abs.includes('download') ||
      abs.includes('atch') ||
      abs.includes('file') ||
      DOWNLOAD_EXT.has(ext);
    if (isDownload) {
      attachments.push({
        url: abs,
        fileName: decodeURIComponent(abs.split('/').pop() ?? 'attachment'),
        ext,
        robotsDisallowed: ROBOTS_DISALLOWED.has(ext)
      });
    }
  });

  const bodyText = ($('body').text() || '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  const headings: ExtractedHtml['headings'] = [];
  $('h1, h2, h3, h4').each((_i, el) => {
    const t = ($(el).text() || '').trim();
    if (t) headings.push({ level: Number(el.tagName.slice(1)), text: t, id: $(el).attr('id') ?? null });
  });

  return { title, bodyText, links, attachments, headings };
}

function extOfUrl(u: string): string {
  const clean = u.split('?')[0]!.split('#')[0]!;
  const i = clean.lastIndexOf('.');
  return i < 0 ? '' : clean.slice(i + 1).toLowerCase();
}
