import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

/**
 * 저장된 ZIP 첨부의 멤버 추출(허용 확장자 한정).
 * - 추출 위치: data/raw/attachments/extracted/<zipsha>/<member>
 * - PDF는 이후 pdf-attach 파이프라인이 자동 인제스트
 */

const ALLOWED = new Set(['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx']);
const MAX_MEMBERS = 300;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

export interface ZipExtractReport {
  zipsScanned: number;
  membersExtracted: number;
  skippedMembers: number;
  bytesWritten: number;
}

export function extractZipAttachments(rawAttachmentsDir: string): ZipExtractReport {
  const report: ZipExtractReport = { zipsScanned: 0, membersExtracted: 0, skippedMembers: 0, bytesWritten: 0 };
  const zipRoot = rawAttachmentsDir; // zip은 attachments 루프에 content-addressed로 저장됨

  for (const entry of fs.readdirSync(zipRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(zipRoot, entry.name);
    for (const f of fs.readdirSync(sub)) {
      if (!f.toLowerCase().endsWith('.zip')) continue;
      const zipPath = path.join(sub, f);
      const zipSha = path.basename(f).split('-')[0] ?? 'zip';
      const outDir = path.join(zipRoot, 'extracted', zipSha);
      try {
        const az = new AdmZip(zipPath);
        fs.mkdirSync(outDir, { recursive: true });
        report.zipsScanned++;
        let written = 0;
        for (const member of az.getEntries()) {
          if (member.isDirectory) continue;
          if (written >= MAX_MEMBERS || report.bytesWritten > MAX_TOTAL_BYTES) break;
          const ext = (member.entryName.split('.').pop() ?? '').toLowerCase();
          if (!ALLOWED.has(ext)) { report.skippedMembers++; continue; }
          const base = path.basename(member.entryName);
          const target = path.join(outDir, `${String(written).padStart(3, '0')}-${base}`);
          const data = member.getData();
          if (data.length > 60 * 1024 * 1024) { report.skippedMembers++; continue; }
          fs.writeFileSync(target, data);
          report.membersExtracted++;
          report.bytesWritten += data.length;
          written++;
        }
      } catch {
        // 손상 ZIP 등 → 스킵(격리 대신 로그만)
        report.skippedMembers++;
      }
    }
  }
  return report;
}
