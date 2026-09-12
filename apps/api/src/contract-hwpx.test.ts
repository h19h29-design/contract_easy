import { describe, it, expect } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { load } from 'cheerio';
import { CONTRACT_FIELD_DEFS, emptyContractFields } from '@sen/shared';
import { generateContractHwpx } from './contract-hwpx.js';

describe('editable HWPX output', () => {
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
    const zip = unzipSync(generateContractHwpx(fields));
    const $ = load(strFromU8(zip['Contents/section0.xml']), { xmlMode: true });
    const text = $('hp\\:t').map((_, el) => $(el).text()).get().join('\n');
    for (const value of Object.values(fields)) expect(text).toContain(value);
  });
});
