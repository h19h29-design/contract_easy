import fs from 'node:fs';
import path from 'node:path';
import { stableId } from '@sen/shared';
import type { NormalizedDoc } from '@sen/shared';

/**
 * hwp5txt로 변환된 HWP 텍스트 파일들 → NormalizedDoc
 * (원문: data/raw/attachments/hwp-txt/*.txt)
 */

export function listHwpTextDocs(hwpTxtDir: string): NormalizedDoc[] {
  if (!fs.existsSync(hwpTxtDir)) return [];
  const out: NormalizedDoc[] = [];
  for (const f of fs.readdirSync(hwpTxtDir)) {
    if (!f.toLowerCase().endsWith('.txt')) continue;
    const p = path.join(hwpTxtDir, f);
    const text = fs.readFileSync(p, 'utf8')
      // CRLF/CR 통일
      .replace(/\r\n?/g, '\n')
      // 개행 외 제어문자 제거
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
      .trim();
    if (text.replace(/\s/g, '').length < 30) continue; // 실타과다

    const blocks: NormalizedDoc['blocks'] = [];
    // 빈 줄 단위 문단 분리 + 과대 방지 분할
    for (const paraRaw of text.split(/\n{2,}/)) {
      const para = paraRaw.trim();
      if (!para) continue;
      if (para.length > 1500) {
        let buf = '';
        for (const line of para.split('\n')) {
          if ((buf + '\n' + line).length > 900 && buf) {
            blocks.push({ kind: 'paragraph', text: buf.trim(), path: ['첨부', 'HWP'] });
            buf = line;
          } else buf += (buf ? '\n' : '') + line;
        }
        if (buf.trim()) blocks.push({ kind: 'paragraph', text: buf.trim(), path: ['첨부', 'HWP'] });
      } else {
        blocks.push({ kind: 'paragraph', text: para, path: ['첨부', 'HWP'] });
      }
    }
    if (blocks.length === 0) continue;

    const shaLike = path.basename(f, '.txt');
    // 첫 줄을 제목 후보로 사용(있으면)
    const firstLine = (text.split('\n')[0] ?? '').trim().slice(0, 60);

    out.push({
      sourceVersionId: stableId('hwpdoc', p),
      url: `file://hwp-txt/${shaLike}.txt`,
      title: firstLine ? `HWP: ${firstLine}` : `HWP: ${shaLike}`,
      menuPath: ['첨부', 'HWP'],
      collectedAt: new Date().toISOString(),
      publishedAt: null,
      blocks,
      warnings: []
    });
  }
  return out;
}
