import { describe, expect, it } from 'vitest';
import { validateContractFields, contractMissingFields, emptyContractFields } from './contract.js';

describe('contract input boundary', () => {
  it('allows incomplete drafts without inventing numeric/legal defaults', () => {
    const result = validateContractFields({ workName: '교실 공사' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected valid draft');
    expect(result.fields.contractAmount).toBe('');
    expect(result.fields.delayRate).toBe('');
    expect(contractMissingFields(result.fields)).toContain('계약금액(원)');
  });
  it.each([null, [], { extra: 'value' }, { workName: null }, { contractAmount: 100 }, { contractAmount: '1e8' },
    { contractAmount: '-1' }, { contractAmount: '1,000' }, { contractDate: '2026-02-30' },
    { workName: '\u0000' }, { workName: '\ud800' }, { workName: 'a'.repeat(301) },
    { startDate: '2026-09-13', endDate: '2026-09-12' }])('rejects unsafe or ambiguous input %j', (value) => {
    expect(validateContractFields(value).ok).toBe(false);
  });
  it('preserves exact decimal strings, Unicode and XML metacharacters', () => {
    const result = validateContractFields({ contractAmount: '9007199254740993', workName: '학교 & <공사> 😀', notes: '첫 줄\n둘째 줄' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected valid draft');
    expect(result.fields.contractAmount).toBe('9007199254740993');
    expect(result.fields.notes).toBe('첫 줄\n둘째 줄');
  });
  it('adds empty follow-up fields to old drafts without guessing actual dates or payment details', () => {
    const result = validateContractFields({ workName: '기존 초안', startDate: '2026-09-12', companyName: '가상 업체', contractAmount: '9007199254740993' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('invalid legacy draft');
    expect(result.fields.actualStartDate).toBe('');
    expect(result.fields.claimAmount).toBe('');
    expect(result.fields.bankHolder).toBe('');
  });
  it('checks required fields for the selected document, not unrelated contract fields', () => {
    const fields = { ...emptyContractFields(), workName: '공사', contractAmount: '0', contractDate: '2026-09-12', actualStartDate: '2026-09-13', endDate: '2026-10-01', startReportDate: '2026-09-13', agencyName: '가상학교', recipientTitle: '계약담당자', companyName: '가상시공', companyAddress: '합성 주소', companyRegistration: '000-00-00000', companyRepresentative: '가상대표' };
    expect(contractMissingFields(fields, 'commencement')).toEqual([]);
    expect(contractMissingFields(fields, 'completion')).toEqual(['실제 준공일', '준공계 제출일']);
    expect(contractMissingFields(fields, 'payment')).toContain('청구금액(원)');
    expect(contractMissingFields(fields)).toContain('현장');
  });
  it('rejects impossible actual dates but allows completion after the contractual deadline', () => {
    expect(validateContractFields({ actualStartDate: '2026-09-14', actualEndDate: '2026-09-13' }).ok).toBe(false);
    expect(validateContractFields({ endDate: '2026-09-12', actualStartDate: '2026-09-10', actualEndDate: '2026-09-15' }).ok).toBe(true);
    expect(validateContractFields({ claimAmount: Number('9007199254740993') }).ok).toBe(false);
  });
});
