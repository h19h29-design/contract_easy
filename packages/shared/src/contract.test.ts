import { describe, expect, it } from 'vitest';
import { validateContractFields, contractMissingFields } from './contract.js';

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
});
