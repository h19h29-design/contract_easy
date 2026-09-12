import { describe, it, expect } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { load } from 'cheerio';
import { CONTRACT_FIELD_DEFS, emptyContractFields } from '@sen/shared';
import { generateContractHwpx } from './contract-hwpx.js';

describe('editable HWPX output', () => {
  it('exports representative personal data only in its form and renders schedule rows as cells', () => {
    const fields = { ...emptyContractFields(), representativeName: '합성대리인ONLY', representativeBirthDate: '1990-02-28', representativeType: '합성면허종별', representativeGrade: '합성등급', representativeLicense: 'SYNTHETIC-LICENSE', representativeNotes: '현장 전용 비고', representativeReportDate: '2026-09-12', representativeAttachments: '합성 첨부목록', startDate: '2026-09-01', endDate: '2026-09-30', scheduleRows: '철거 & <공정> | 2028-02-29 | 2028-03-01\n마감 | 2028-03-02 | 2028-03-04', scheduleReportDate: '2026-09-13' };
    for (const form of ['contract', 'commencement', 'completion', 'payment', 'representative', 'schedule'] as const) {
      const zip = unzipSync(generateContractHwpx(fields, form));
      const xml = strFromU8(zip['Contents/section0.xml']);
      const $ = load(xml, { xmlMode: true });
      const body = $('hp\\:t').map((_, el) => $(el).text()).get().join('\n');
      const all = Object.values(zip).map((part) => strFromU8(part)).join('');
      expect(all.includes('합성대리인ONLY')).toBe(form === 'representative');
      expect(all.includes('1990-02-28')).toBe(form === 'representative');
      if (form === 'representative') for (const value of ['합성대리인ONLY', '합성면허종별', '합성등급', 'SYNTHETIC-LICENSE', '현장 전용 비고', '합성 첨부목록']) expect(body).toContain(value);
      if (form === 'schedule') {
        expect(body).toContain('철거 & <공정>');
        expect(body).toContain('2028-02-29');
        expect(body).toContain('2028-03-04');
        expect(body).not.toContain('철거 & <공정> |');
      }
    }
  });
  it('preserves entered values as text, keeps package references and excludes executable content', () => {
    const fields = { ...emptyContractFields(), workName: '학교 & <계약> 😀', contractAmount: '9007199254740993', notes: '첫 줄\n둘째 줄', agencyName: '발주학교', companyName: '테스트시공' };
    const bytes = generateContractHwpx(fields);
    const zip = unzipSync(bytes);
    expect(strFromU8(zip.mimetype)).toBe('application/hwp+zip');
    expect(Buffer.from(bytes).readUInt16LE(8)).toBe(0); // first entry (mimetype) must be stored
    expect(Buffer.from(bytes).subarray(30, 38).toString()).toBe('mimetype');
    const xml = strFromU8(zip['Contents/section0.xml']);
    const $ = load(xml, { xmlMode: true });
    const texts = $('hp\\:t').map((_, el) => $(el).text()).get();
    expect(texts).toContain('학교 & <계약> 😀');
    expect(texts.join('\n')).toContain('9007199254740993');
    expect(texts).toContain('첫 줄'); expect(texts).toContain('둘째 줄');
    expect($('hp\\:tbl').length).toBeGreaterThan(0);
    expect($('hp\\:secPr').length).toBe(1);
    expect(xml).not.toContain('<계약>');
    expect(Object.keys(zip).some((p) => /scripts|vbaproject|bindata/i.test(p))).toBe(false);
    expect(strFromU8(zip['Preview/PrvText.txt'])).toContain('학교 & <계약> 😀');
    const manifest = load(strFromU8(zip['Contents/content.hpf']), { xmlMode: true });
    manifest('opf\\:item').each((_, e) => { expect(zip[manifest(e).attr('href')!]).toBeDefined(); });
    const ids = $('hp\\:p').map((_, e) => $(e).attr('id')).get();
    expect(new Set(ids).size).toBe(ids.length);
    expect(texts.join('')).toContain('검토 필요');
    expect(texts.join('')).toContain('초안');
  });
  it('does not generate unsafe/invalid XML from direct callers', () => {
    expect(() => generateContractHwpx({ ...emptyContractFields(), notes: '\u0000' })).toThrow();
  });
  it('round-trips every field, long Korean text and line breaks without numeric coercion', () => {
    const fields = emptyContractFields();
    for (const [key, , , type] of CONTRACT_FIELD_DEFS) fields[key] = type === 'date' ? '2026-09-12' : type === 'amount' ? '9007199254740993' : type === 'multiline' ? `${key} 첫 줄\n${'가'.repeat(2900)}` : `${key} & <한글> "입력"`;
    fields.scheduleRows = '합성공정 | 2026-09-12 | 2026-09-12';
    const zip = unzipSync(generateContractHwpx(fields));
    const $ = load(strFromU8(zip['Contents/section0.xml']), { xmlMode: true });
    const text = $('hp\\:t').map((_, el) => $(el).text()).get().join('\n');
    const originalKeys = ['contractNumber', 'noticeNumber', 'workName', 'site', 'contractAmount', 'totalAmount', 'contractDate', 'startDate', 'endDate', 'agencyName', 'agencyAddress', 'agencyOfficerTitle', 'agencyOfficerName', 'companyName', 'companyRegistration', 'companyAddress', 'companyPhone', 'companyRepresentative', 'guarantorName', 'guarantorRegistration', 'guarantorAddress', 'guarantorPhone', 'guarantorRepresentative', 'contractBond', 'delayRate', 'priceAdjustment', 'warrantyWorkType', 'warrantyAmount', 'warrantyRate', 'warrantyBond', 'warrantyPeriod', 'notes', 'attachments'] as const;
    for (const key of originalKeys) expect(text).toContain(fields[key]);
  });
  it.each([
    ['commencement', '착공신고서', '2026-09-13', '2026-09-14'],
    ['completion', '준공계', '2026-10-02', '2026-10-03'],
    ['payment', '대금청구서', '9007199254740881', '2026-10-04']
  ] as const)('creates %s using its actual dates/amounts and no unrelated private fields', (form, title, value, reportDate) => {
    const fields = { ...emptyContractFields(), workName: '합성 & <공사>', startDate: '2026-09-01', actualStartDate: '2026-09-13', endDate: '2026-09-30', actualEndDate: '2026-10-02', startReportDate: '2026-09-14', completionReportDate: '2026-10-03', claimDate: '2026-10-04', claimAmount: '9007199254740881', paidAmount: '0', deductionAmount: '0', bankAccount: '000-SYNTHETIC-001', bankHolder: '합성예금주', bankName: '합성은행', notes: '계약서 전용 메모', startAttachments: '합성 붙임\n둘째 서류', recipientTitle: '학교장', agencyName: '가상학교' };
    const zip = unzipSync(generateContractHwpx(fields, form));
    const $ = load(strFromU8(zip['Contents/section0.xml']), { xmlMode: true });
    const text = $('hp\\:t').map((_, el) => $(el).text()).get().join('\n');
    expect(text).toContain(title); expect(text).toContain(value); expect(text).toContain(reportDate);
    expect(text).toContain('합성 & <공사>'); expect(text).toContain('가상학교 학교장 귀하');
    const packageText = Object.values(zip).map((bytes) => strFromU8(bytes)).join('\n');
    expect(packageText).not.toContain('계약서 전용 메모');
    expect(packageText).not.toContain('2026-09-01');
    if (form === 'payment') { expect(text).toContain('000-SYNTHETIC-001'); expect(text).toContain('합성예금주'); }
    else expect(packageText).not.toContain('000-SYNTHETIC-001');
    expect(strFromU8(zip['Contents/content.hpf'])).toContain(`${form === 'commencement' ? '착공계' : title} 초안`);
  });
  it('never includes payment bank details in the standard contract package', () => {
    const zip = unzipSync(generateContractHwpx({ ...emptyContractFields(), bankAccount: '000-BANK-PRIVATE', bankHolder: '합성 비공개 예금주' }));
    expect(Object.values(zip).map((bytes) => strFromU8(bytes)).join('\n')).not.toContain('000-BANK-PRIVATE');
    expect(Object.values(zip).map((bytes) => strFromU8(bytes)).join('\n')).not.toContain('합성 비공개 예금주');
  });
});
